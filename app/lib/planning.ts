import type { Inventory, PlanningCalculation, Product, Run } from "./workspace-types";

/** One-sided normal quantiles for the allowed cycle service levels. */
export const SERVICE_LEVEL_Z: Record<number, number> = { 90: 1.2816, 95: 1.6449, 98: 2.0537, 99: 2.3263 };
export const SERVICE_LEVELS = [90, 95, 98, 99];

/** Safety stock from holdout forecast error over lead time + review period, never below the manual minimum. */
export function safetyStockPolicy(run: Run, product: Product) {
  const protection_days = product.lead_time_days + product.review_period_days;
  const errors = run.backtest.map(p => ((p.actual ?? 0) - p.forecast) ** 2);
  const rmse = errors.length ? Math.sqrt(errors.reduce((a, b) => a + b, 0) / errors.length) : 0;
  const z_score = SERVICE_LEVEL_Z[product.service_level_percent];
  // Assumes independent daily errors; RMSE already includes holdout bias.
  const statistical = Math.ceil(z_score * rmse * Math.sqrt(protection_days));
  return { protection_days, forecast_error_rmse: Math.round(rmse * 1000) / 1000, z_score,
    safety_stock_minimum: product.safety_stock, safety_stock_statistical: statistical, safety_stock: Math.max(product.safety_stock, statistical) };
}

/** A planning proposal; approval never changes imported inventory. */
export function calculatePlanning(run: Run, product: Product, stock: Inventory | undefined, incoming: number, dataVersion: number, latestDate?: string | null): PlanningCalculation {
  if (run.data_version !== dataVersion) throw new Error("ยอดขายเปลี่ยนแล้ว กรุณาสร้าง Forecast ใหม่ก่อนวางแผน");
  if (latestDate && run.origin !== latestDate) throw new Error("เลือก Forecast ที่เริ่มจากวันยอดขายล่าสุดของพื้นที่นี้");
  if (!stock || stock.sale_date !== run.origin) throw new Error("นำเข้า Inventory ของพื้นที่นี้ให้ตรงกับวันยอดขายล่าสุดก่อนวางแผน");
  const policy = safetyStockPolicy(run, product);
  if (run.horizon < policy.protection_days) throw new Error(`ระยะ Forecast ต้องครอบคลุม Lead time + รอบการสั่งซื้อ (${policy.protection_days} วัน) กรุณาสร้าง Forecast ระยะยาวขึ้น`);
  if (!Number.isInteger(incoming) || incoming < 0 || incoming > 2147483647) throw new Error("สินค้าที่รอรับต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647");
  // Periodic review: order up to demand over lead time + review period plus safety stock.
  const sum = (days: number) => run.points.slice(0, days).reduce((total, p) => total + p.forecast, 0);
  const leadDemand = sum(product.lead_time_days), protectionDemand = sum(policy.protection_days), safety = policy.safety_stock;
  return { product_code: product.code, region: run.region, origin: run.origin, horizon: run.horizon, forecast_total: run.total,
    on_hand: stock.inventory, snapshot_date: stock.sale_date, incoming_units: incoming, ...policy,
    lead_time_days: product.lead_time_days, review_period_days: product.review_period_days, service_level_percent: product.service_level_percent,
    lead_time_demand: Math.round(leadDemand * 100) / 100, protection_demand: Math.round(protectionDemand * 100) / 100,
    reorder_point: Math.ceil(leadDemand + safety), order_up_to_level: Math.ceil(protectionDemand + safety),
    recommended_units: Math.max(0, Math.ceil(protectionDemand + safety - stock.inventory - incoming)),
    urgent: stock.inventory < leadDemand + safety, data_version: dataVersion };
}
