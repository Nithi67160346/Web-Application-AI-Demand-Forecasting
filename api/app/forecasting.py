"""Statistical and supervised ML forecasting with time-separated evaluation.

No external network feeds: disease/policy/population are explicit mock scenarios.
"""
import math
from datetime import date, timedelta
from statistics import mean
from .ml_forecasting import ALPHAS, MIN_HISTORY, fit_ridge, predict_artifact, predict_ridge


MODELS = ('last_value', 'weekday_mean', 'linear_trend', 'annual_seasonal')


def predict(values, days, horizon, model, alpha=1.0):
    if model == 'ridge_lagged':
        return predict_ridge(values, days, horizon, alpha)
    if model == 'last_value':
        return [float(values[-1])] * horizon
    if model == 'annual_seasonal' and len(values) >= 365:
        scale = sum(values[-28:]) / max(1, sum(values[-393:-365])) if len(values) >= 393 else 1
        scale = min(2, max(.5, scale))
        return [max(0, values[(len(values) + step - 365) % len(values)] * scale) for step in range(horizon)]
    window = values[-56:]
    if model == 'linear_trend':
        n = len(window)
        mid = (n - 1) / 2
        avg = mean(window)
        slope = sum((i - mid) * (v - avg) for i, v in enumerate(window)) / max(1, sum((i - mid) ** 2 for i in range(n)))
        return [max(0, avg + slope * (n + i - mid)) for i in range(horizon)]
    recent = list(zip(days[-56:], window))
    return [mean([v for d, v in recent if d.weekday() == (days[-1] + timedelta(days=i+1)).weekday()]) for i in range(horizon)]


def metrics(actual, forecast):
    errors = [abs(a - f) for a, f in zip(actual, forecast)]
    total = sum(actual)
    wape = sum(errors) / total * 100 if total else None
    return {'mae': round(mean(errors), 3), 'wape_percent': round(wape, 3) if wape is not None else None,
            'bias': round(mean([f-a for a, f in zip(actual, forecast)]), 3)}


def forecast_series(rows, horizon, signals, model_mode='auto'):
    if model_mode not in ('auto', 'ml', 'statistical'):
        raise ValueError('Choose auto, ml or statistical model mode.')
    start, end = rows[0][0], rows[-1][0]
    if (end - start).days > 3650:
        raise ValueError('History must span at most ten years.')
    observed = dict(rows)
    days = [start + timedelta(days=i) for i in range((end-start).days + 1)]
    values = [float(observed.get(day, 0)) for day in days]
    if len(days) < 112 or len(rows) < 56:
        raise ValueError('At least 112 calendar days and 56 observed dates are required for temporal validation.')
    if model_mode == 'ml' and len(days) < MIN_HISTORY:
        raise ValueError('ML requires at least 140 calendar days and 56 observed dates; import more history or use auto/statistical mode.')
    candidates = [model for model in MODELS if model != 'annual_seasonal' or len(values) >= 449]
    scores = {}
    raw_scores = {}
    validation_windows = []
    for offset in (84, 56):
        cutoff = len(values)-offset
        validation_windows.append({'train_end': days[cutoff-1].isoformat(), 'validation_start': days[cutoff].isoformat(),
                                   'validation_end': days[cutoff+27].isoformat()})
    # Two validation windows select the model. Final 28 days remain untouched.
    for model in candidates:
        fold_scores = []
        for offset in (84, 56):
            cutoff = len(values) - offset
            estimates = predict(values[:cutoff], days[:cutoff], 28, model)
            fold_scores.append(mean(abs(a-f) for a, f in zip(values[cutoff:cutoff+28], estimates)))
        raw_scores[model] = mean(fold_scores)
        scores[model] = round(raw_scores[model], 3)
    alpha_scores = {}
    selected_alpha = None
    if model_mode != 'statistical' and len(days) >= MIN_HISTORY:
        for alpha in ALPHAS:
            fold_scores = []
            for offset in (84, 56):
                cutoff = len(values)-offset
                estimates = predict(values[:cutoff], days[:cutoff], 28, 'ridge_lagged', alpha)
                fold_scores.append(mean(abs(a-f) for a, f in zip(values[cutoff:cutoff+28], estimates)))
            alpha_scores[alpha] = mean(fold_scores)
        selected_alpha = min(alpha_scores, key=alpha_scores.get)
        raw_scores['ridge_lagged'] = alpha_scores[selected_alpha]
        scores['ridge_lagged'] = round(raw_scores['ridge_lagged'], 3)
    chosen = 'ridge_lagged' if model_mode == 'ml' else min(raw_scores, key=raw_scores.get)
    heldout = predict(values[:-28], days[:-28], 28, chosen, selected_alpha or 1.0)
    evaluation = metrics(values[-28:], heldout)
    residuals = sorted(abs(a-f) for a, f in zip(values[-28:], heldout))
    width = residuals[min(len(residuals)-1, math.ceil(.95 * len(residuals))-1)]
    ml_artifact = fit_ridge(values, days, selected_alpha) if selected_alpha is not None else None
    baseline = predict_artifact(ml_artifact, values, days, horizon) if chosen == 'ridge_lagged' else predict(values, days, horizon, chosen)
    points = []
    for i, value in enumerate(baseline):
        day = end + timedelta(days=i+1)
        factors = {'disease': .15 if day.month in (7, 8) else 0,
                   'policy': .05, 'population': .02}
        multiplier = 1 + sum(factors.get(signal, 0) for signal in signals)
        scenario = value * multiplier
        uncertainty = width * math.sqrt(1 + i / 28) * multiplier
        points.append({'date': day.isoformat(), 'forecast': round(scenario, 2), 'baseline': round(value, 2),
                       'lower': round(max(0, scenario-uncertainty), 2), 'upper': round(scenario+uncertainty, 2)})
    recent = mean(values[-28:])
    future = mean([point['forecast'] for point in points])
    return {'model': chosen, 'model_type': 'machine_learning' if chosen == 'ridge_lagged' else 'statistical',
            'model_mode': model_mode, 'model_version': 'ridge-lag-v1' if chosen == 'ridge_lagged' else 'statistical-v1',
            'ml_artifact': ml_artifact, 'ml_alpha_scores': {str(a): round(score, 3) for a, score in alpha_scores.items()},
            'validation_windows': validation_windows, 'holdout_start': days[-28].isoformat(),
            'ml_unavailable_reason': f'ML requires {MIN_HISTORY} calendar days.' if len(days) < MIN_HISTORY else None,
            'selection_mae': scores, 'metrics': evaluation,
            'metric_scope': 'Final 28-day holdout excluded from model and hyperparameter selection; recursive forecasts use no future actuals.',
            'interval_method': 'Empirical 95th percentile holdout absolute residual, widened with horizon; coverage is not guaranteed.',
            'missing_days_filled_zero': len(days)-len(observed), 'observed_days': len(rows),
            'history': [{'date': d.isoformat(), 'actual': v} for d, v in zip(days[-90:], values[-90:])],
            'backtest': [{'date': d.isoformat(), 'actual': a, 'forecast': round(f, 2)} for d, a, f in zip(days[-28:], values[-28:], heldout)],
            'points': points, 'horizon': horizon, 'origin': end.isoformat(), 'total': round(sum(p['forecast'] for p in points), 2),
            'change_percent': round((future/recent-1)*100, 2) if recent else None,
            'signals': signals, 'signal_source': 'Explicit synthetic scenario modifiers, no external feed' if signals else 'Imported sales only; no external signals.',
            'note': 'Forecast trained per product/region at its origin; auto selects lowest validation MAE. ML-only mode is explicit. Refit on all available history after holdout evaluation; synthetic data does not establish real-world accuracy.'}
