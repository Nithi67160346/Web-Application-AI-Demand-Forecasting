import type { Inventory, PlanningCalculation, Product, Run } from "./workspace-types";

/** A planning proposal; approval never changes imported inventory. */
export function calculatePlanning(run: Run, product: Product, stock: Inventory | undefined, incoming: number, dataVersion: number, latestDate?: string | null): PlanningCalculation {
  if (run.data_version !== dataVersion) throw new Error("ยอดขายเปลี่ยนแล้ว กรุณาสร้าง Forecast ใหม่ก่อนวางแผน");
  if (latestDate && run.origin !== latestDate) throw new Error("เลือก Forecast ที่เริ่มจากวันยอดขายล่าสุดของพื้นที่นี้");
  if (!stock || stock.sale_date !== run.origin) throw new Error("นำเข้า Inventory ของพื้นที่นี้ให้ตรงกับวันยอดขายล่าสุดก่อนวางแผน");
  if (run.horizon < product.lead_time_days) throw new Error("ระยะ Forecast ต้องครอบคลุม Lead time กรุณาสร้าง Forecast ระยะยาวขึ้น");
  if (!Number.isInteger(incoming) || incoming < 0 || incoming > 2147483647) throw new Error("สินค้าที่รอรับต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647");
  const leadDemand = run.points.slice(0, product.lead_time_days).reduce((sum, p) => sum + p.forecast, 0);
  return { product_code: product.code, region: run.region, origin: run.origin, horizon: run.horizon, forecast_total: run.total,
    on_hand: stock.inventory, snapshot_date: stock.sale_date, incoming_units: incoming, safety_stock: product.safety_stock,
    lead_time_days: product.lead_time_days, lead_time_demand: leadDemand, reorder_point: Math.ceil(leadDemand + product.safety_stock),
    recommended_units: Math.max(0, Math.ceil(run.total + product.safety_stock - stock.inventory - incoming)),
    urgent: stock.inventory < leadDemand + product.safety_stock, data_version: dataVersion };
}
