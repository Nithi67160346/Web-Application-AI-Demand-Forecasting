import type { MLArtifact } from "./workspace-types";

export const MIN_ML_HISTORY = 140;
export const ML_ALPHAS = [0.1, 1, 10];
const MAX_SAMPLES = 730;
const FEATURES = ["lag_1", "lag_7", "lag_14", "lag_28", "mean_7", "mean_28", ...Array.from({ length: 6 }, (_, day) => `weekday_${day}`), "time_index"];
const average = (v: number[]) => v.reduce((sum, x) => sum + x, 0) / v.length;

function features(values: number[], index: number, day: string, timeIndex = index): number[] {
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Python weekday: Monday = 0.
  return [1, 7, 14, 28].map(lag => values[index - lag]).concat([
    average(values.slice(index - 7, index)), average(values.slice(index - 28, index)),
    ...Array.from({ length: 6 }, (_, d) => Number(d === weekday)), timeIndex / 365,
  ]);
}

function solve(matrix: number[][], target: number[]): number[] {
  const n = target.length, rows = matrix.map((row, i) => [...row, target[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(rows[i][col]) > Math.abs(rows[pivot][col])) pivot = i;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    if (Math.abs(rows[col][col]) < 1e-12) throw new Error("ฝึก ML ไม่สำเร็จ กรุณาตรวจข้อมูลหรือเลือกโมเดลเดิม");
    const scale = rows[col][col];
    for (let j = col; j <= n; j++) rows[col][j] /= scale;
    for (let i = 0; i < n; i++) if (i !== col) {
      const factor = rows[i][col];
      for (let j = col; j <= n; j++) rows[i][j] -= factor * rows[col][j];
    }
  }
  return rows.map(row => row[n]);
}

/** Same standardized Ridge objective as the server; learned from each origin's history. */
export function fitRidge(values: number[], days: string[], alpha: number): MLArtifact {
  const first = Math.max(28, values.length - MAX_SAMPLES);
  if (values.length - first < 28) throw new Error("ML ต้องมีเป้าหมายฝึกอย่างน้อย 28 วันหลังประวัติ lag 28 วัน");
  const x = values.slice(first).map((_, i) => features(values, first + i, days[first + i]));
  const y = values.slice(first), n = x.length, dimension = FEATURES.length;
  const means = FEATURES.map((_, j) => average(x.map(row => row[j])));
  const scales = FEATURES.map((_, j) => {
    const variance = average(x.map(row => (row[j] - means[j]) ** 2));
    const bound = n * Number.EPSILON * variance + (n * means[j] * Number.EPSILON) ** 2;
    return variance <= bound ? 1 : Math.sqrt(variance);
  });
  const targetMean = average(y), targetScale = Math.sqrt(average(y.map(v => (v - targetMean) ** 2))) || 1;
  const matrix = Array.from({ length: dimension }, (_, i) => Array.from({ length: dimension }, (_, j) => i === j ? alpha : 0));
  const target = Array(dimension).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    const scaled = x[i].map((v, j) => (v - means[j]) / scales[j]);
    for (let j = 0; j < dimension; j++) {
      target[j] += scaled[j] * ((y[i] - targetMean) / targetScale);
      for (let k = 0; k < dimension; k++) matrix[j][k] += scaled[j] * scaled[k];
    }
  }
  return { version: "ridge-lag-v1", algorithm: "Ridge Regression", alpha, features: FEATURES,
    coefficients: solve(matrix, target), feature_means: means, feature_scales: scales, target_mean: targetMean, target_scale: targetScale,
    training_samples: y.length, training_start: days[first], training_end: days.at(-1)!, history_start: days[0],
    max_training_samples: MAX_SAMPLES, history_length: values.length, last_values: values.slice(-28), forecast_strategy: "recursive; future lags use predictions, never held-out actuals" };
}

export function predictArtifact(artifact: MLArtifact, values: number[], days: string[], horizon: number): number[] {
  const history = [...values], estimates: number[] = [];
  for (let step = 0; step < horizon; step++) {
    const day = new Date(Date.parse(days.at(-1)!) + (step + 1) * 86400000).toISOString().slice(0, 10);
    const row = features(history, history.length, day);
    const scaled = row.reduce((sum, v, j) => sum + (v - artifact.feature_means[j]) / artifact.feature_scales[j] * artifact.coefficients[j], 0);
    const value = Math.max(0, artifact.target_mean + artifact.target_scale * scaled);
    if (!Number.isFinite(value)) throw new Error("ML ให้ค่าพยากรณ์ไม่เสถียร กรุณาตรวจข้อมูลหรือเลือกโมเดลเดิม");
    estimates.push(value); history.push(value);
  }
  return estimates;
}

export function predictRidge(values: number[], days: string[], horizon: number, alpha: number): number[] {
  return predictArtifact(fitRidge(values, days, alpha), values, days, horizon);
}

export function predictSavedArtifact(artifact: MLArtifact, horizon: number): number[] {
  if (artifact.version !== "ridge-lag-v1") throw new Error("รุ่นโมเดล ML ไม่รองรับ");
  const history = [...artifact.last_values], estimates: number[] = [];
  for (let step = 0; step < horizon; step++) {
    const day = new Date(Date.parse(artifact.training_end) + (step + 1) * 86400000).toISOString().slice(0, 10);
    const row = features(history, history.length, day, artifact.history_length + step);
    const scaled = row.reduce((sum, v, j) => sum + (v - artifact.feature_means[j]) / artifact.feature_scales[j] * artifact.coefficients[j], 0);
    const value = Math.max(0, artifact.target_mean + artifact.target_scale * scaled);
    if (!Number.isFinite(value)) throw new Error("ML ให้ค่าพยากรณ์ไม่เสถียร");
    estimates.push(value); history.push(value);
  }
  return estimates;
}
