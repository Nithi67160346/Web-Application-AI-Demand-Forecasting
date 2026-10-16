"""Behavioral guarantees for learned features, temporal separation and model artifacts."""
import json
import math
import unittest
from pathlib import Path
from datetime import date, timedelta
import random
from app.forecasting import croston_sba, forecast_series
from app.ml_forecasting import fit_ridge, predict_artifact, predict_saved_artifact


def cycle_rows(count=280):
    pattern = (50, 150, 110, 90)
    return [(date(2026, 1, 1)+timedelta(days=i), float(pattern[i % 4])) for i in range(count)]


class MLForecastingTests(unittest.TestCase):
    def test_server_training_matches_the_shared_scikit_learn_reference(self):
        reference = json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/ml-ridge-reference.json').read_text())
        for example in reference['cases']:
            days = [date.fromisoformat(d) for d in example['days']]
            artifact = fit_ridge(example['values'], days, example['alpha'])
            estimates = predict_artifact(artifact, example['values'], days, example['horizon'])
            for actual, expected in zip(estimates, example['predictions']):
                self.assertAlmostEqual(actual, expected, places=6)

    def test_ml_learns_nonweekly_pattern_and_auto_compares_baselines(self):
        rows = cycle_rows()
        result = forecast_series(rows, 30, [])
        statistical = forecast_series(rows, 30, [], 'statistical')
        self.assertEqual(result['model'], 'ridge_lagged')
        self.assertEqual(result['model_type'], 'machine_learning')
        self.assertLess(result['metrics']['mae'], statistical['metrics']['mae']/5)
        self.assertGreater(len(result['selection_mae']), len(statistical['selection_mae']))
        self.assertEqual(result['ml_artifact']['training_samples'], 252)
        self.assertEqual(result['ml_artifact']['training_end'], rows[-1][0].isoformat())
        self.assertTrue(any(abs(w) > .01 for w in result['ml_artifact']['coefficients']))
        # JSON artifacts reproduce the saved predictions without any refitting.
        artifact = json.loads(json.dumps(result['ml_artifact']))
        estimates = predict_artifact(artifact, [v for _, v in rows], [d for d, _ in rows], 30)
        self.assertEqual([round(v, 2) for v in estimates], [p['forecast'] for p in result['points']])
        self.assertEqual(predict_saved_artifact(artifact, 30), estimates)

    def test_holdout_is_never_used_to_select_alpha_or_build_recursive_lags(self):
        rows = cycle_rows()
        original = forecast_series(rows, 30, [], 'ml')
        shifted = forecast_series(rows[:-28]+[(d, v*20) for d, v in rows[-28:]], 30, [], 'ml')
        self.assertEqual(original['selection_mae'], shifted['selection_mae'])
        self.assertEqual(original['ml_alpha_scores'], shifted['ml_alpha_scores'])
        self.assertEqual(original['ml_artifact']['alpha'], shifted['ml_artifact']['alpha'])
        self.assertEqual([p['forecast'] for p in original['backtest']], [p['forecast'] for p in shifted['backtest']])
        self.assertGreater(shifted['metrics']['mae'], original['metrics']['mae'])
        for window in original['validation_windows']:
            self.assertLess(window['train_end'], window['validation_start'])
            self.assertLess(window['validation_end'], original['holdout_start'])
        # Final deployment weights intentionally refit after evaluation, using all as-of history.
        self.assertNotEqual(original['ml_artifact']['target_mean'], shifted['ml_artifact']['target_mean'])

    def test_ml_handles_zero_constant_large_and_long_histories(self):
        for value in (0, 100, 2147483647):
            rows = [(d, float(value)) for d, _ in cycle_rows(140)]
            result = forecast_series(rows, 180, [], 'ml')
            self.assertEqual(result['model'], 'ridge_lagged')
            self.assertTrue(all(math.isfinite(p['forecast']) and p['forecast'] >= 0 for p in result['points']))
            self.assertEqual(result['total'], value*180)
            if value == 0:
                self.assertIsNone(result['metrics']['wape_percent'])
        rows = cycle_rows(1000)
        artifact = fit_ridge([v for _, v in rows], [d for d, _ in rows], 1)
        self.assertEqual(artifact['training_samples'], 730)

    def test_short_history_falls_back_only_when_requested_and_modes_are_explicit(self):
        short = cycle_rows(112)
        auto = forecast_series(short, 30, [])
        self.assertNotIn('ridge_lagged', auto['selection_mae'])
        self.assertIsNone(auto['ml_artifact'])
        self.assertIsNotNone(auto['ml_unavailable_reason'])
        with self.assertRaisesRegex(ValueError, '140'):
            forecast_series(short, 30, [], 'ml')
        with self.assertRaises(ValueError):
            forecast_series(cycle_rows(), 30, [], 'unknown')
        # Explicit ML can be used even when a simple baseline fits perfectly.
        constant = [(d, 100.0) for d, _ in cycle_rows(140)]
        self.assertEqual(forecast_series(constant, 30, [])['model'], 'last_value')
        self.assertEqual(forecast_series(constant, 30, [], 'ml')['model'], 'ridge_lagged')


class IntermittentDemandTests(unittest.TestCase):
    def rows(self):
        rng = random.Random(7)
        values = [rng.randint(10, 50) if rng.random() < .2 else 0 for _ in range(300)]
        return [(date(2025, 1, 1)+timedelta(days=i), float(v)) for i, v in enumerate(values)]

    def test_croston_sba_smooths_size_and_interval(self):
        self.assertEqual(croston_sba([0, 0, 0], 2), [0.0, 0.0])
        # size 10, interval 3 -> 2.9 after the second demand; SBA factor 0.95.
        self.assertAlmostEqual(croston_sba([0, 0, 10, 0, 10], 1)[0], .95*10/2.9)

    def test_intermittent_demand_adds_croston_and_never_selects_a_zero_forecast(self):
        result = forecast_series(self.rows(), 30, [], 'statistical')
        self.assertEqual(result['demand_pattern'], 'intermittent')
        self.assertIn('croston_sba', result['selection_score'])
        # MAE alone prefers the all-zero last value; the bias-aware score does not.
        self.assertEqual(min(result['selection_mae'], key=result['selection_mae'].get), 'last_value')
        self.assertNotEqual(result['model'], 'last_value')
        self.assertGreater(result['total'], 0)
        for model, score in result['selection_score'].items():
            self.assertGreaterEqual(score, result['selection_mae'][model])

    def test_smooth_demand_keeps_the_original_candidates(self):
        result = forecast_series(cycle_rows(), 30, [], 'statistical')
        self.assertEqual(result['demand_pattern'], 'smooth')
        self.assertNotIn('croston_sba', result['selection_score'])

    def test_demand_pattern_ignores_the_final_holdout(self):
        rows = self.rows()
        changed = rows[:-28] + [(d, 500.0) for d, _ in rows[-28:]]
        original, shifted = forecast_series(rows, 30, [], 'statistical'), forecast_series(changed, 30, [], 'statistical')
        self.assertEqual(original['demand_pattern'], shifted['demand_pattern'])
        self.assertEqual(original['selection_score'], shifted['selection_score'])
