"""Lagged supervised Ridge regression, fitted separately at each temporal origin.

The JSON artifact contains scalers and coefficients; no pickle or shared tenant model.
The browser implementation uses the same features, scaling and ridge objective.
"""
import math
from datetime import timedelta
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

MODEL_VERSION = 'ridge-lag-v1'
MIN_HISTORY = 140
MAX_TRAINING_SAMPLES = 730
ALPHAS = (0.1, 1.0, 10.0)
FEATURES = ['lag_1', 'lag_7', 'lag_14', 'lag_28', 'mean_7', 'mean_28',
            *[f'weekday_{day}' for day in range(6)], 'time_index']


def features(values, index, day, time_index=None):
    # All demand inputs strictly precede the target day.
    return [values[index-lag] for lag in (1, 7, 14, 28)] + [
        sum(values[index-7:index])/7, sum(values[index-28:index])/28,
        *[float(day.weekday() == weekday) for weekday in range(6)], (index if time_index is None else time_index)/365]


def fit_ridge(values, days, alpha):
    first = max(28, len(values)-MAX_TRAINING_SAMPLES)
    if len(values)-first < 28:
        raise ValueError('ML training requires at least 28 targets after the initial 28-day lag history.')
    x = np.asarray([features(values, i, days[i]) for i in range(first, len(values))], dtype=float)
    y = np.asarray(values[first:], dtype=float)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(x)
    target_mean = float(y.mean())
    target_scale = float(y.std()) or 1.0
    # Positive alpha keeps correlated lags solvable, including constant/zero demand.
    model = Ridge(alpha=alpha, fit_intercept=False, solver='cholesky')
    model.fit(scaled, (y-target_mean)/target_scale)
    return {'version': MODEL_VERSION, 'algorithm': 'Ridge Regression', 'alpha': alpha,
            'features': FEATURES, 'coefficients': model.coef_.tolist(), 'feature_means': scaler.mean_.tolist(),
            'feature_scales': scaler.scale_.tolist(), 'target_mean': target_mean, 'target_scale': target_scale,
            'training_samples': len(y), 'training_start': days[first].isoformat(), 'training_end': days[-1].isoformat(),
            'history_start': days[0].isoformat(), 'max_training_samples': MAX_TRAINING_SAMPLES,
            'history_length': len(values), 'last_values': list(values[-28:]),
            'forecast_strategy': 'recursive; future lags use predictions, never held-out actuals'}


def predict_artifact(artifact, values, days, horizon):
    history = list(values)
    estimates = []
    for step in range(horizon):
        day = days[-1] + timedelta(days=step+1)
        row = features(history, len(history), day)
        scaled_prediction = sum((value-center)/scale * weight for value, center, scale, weight in zip(
            row, artifact['feature_means'], artifact['feature_scales'], artifact['coefficients']))
        value = max(0.0, artifact['target_mean'] + artifact['target_scale'] * scaled_prediction)
        if not math.isfinite(value):
            raise ValueError('ML produced an unstable forecast. Review the history or use a statistical model.')
        estimates.append(value)
        history.append(value)
    return estimates


def predict_ridge(values, days, horizon, alpha):
    artifact = fit_ridge(values, days, alpha)
    return predict_artifact(artifact, values, days, horizon)


def predict_saved_artifact(artifact, horizon):
    """Run an exported JSON model using its saved lag state; no refitting required."""
    from datetime import date
    if artifact['version'] != MODEL_VERSION:
        raise ValueError('Unsupported ML artifact version.')
    history = list(artifact['last_values'])
    origin = date.fromisoformat(artifact['training_end'])
    forecasts = []
    for step in range(horizon):
        row = features(history, len(history), origin+timedelta(days=step+1), artifact['history_length']+step)
        scaled = sum((v-center)/scale*weight for v, center, scale, weight in zip(
            row, artifact['feature_means'], artifact['feature_scales'], artifact['coefficients']))
        value = max(0.0, artifact['target_mean']+artifact['target_scale']*scaled)
        if not math.isfinite(value):
            raise ValueError('ML produced an unstable forecast.')
        forecasts.append(value)
        history.append(value)
    return forecasts
