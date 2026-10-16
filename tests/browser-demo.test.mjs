import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import "fake-indexeddb/auto";
import { DOMParser } from "@xmldom/xmldom";
import { zipSync, strToU8 } from "fflate";

globalThis.DOMParser = DOMParser;
await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
const modulePath = new URL("../.cache/browser-demo-test.mjs", import.meta.url);
const compile = (source) => transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
await writeFile(new URL("../.cache/planning-test.mjs", import.meta.url), compile(await readFile(new URL("../app/lib/planning.ts", import.meta.url), "utf8")));
await writeFile(new URL("../.cache/ml-forecasting-test.mjs", import.meta.url), compile(await readFile(new URL("../app/lib/ml-forecasting.ts", import.meta.url), "utf8")));
await writeFile(modulePath, compile(await readFile(new URL("../app/lib/browser-demo.ts", import.meta.url), "utf8")).replace('"./planning"', '"./planning-test.mjs"').replace('"./ml-forecasting"', '"./ml-forecasting-test.mjs"'));
const { BrowserDemo, parseCsv, exampleCsv } = await import(modulePath.href);
const engine = () => new BrowserDemo(`test-${crypto.randomUUID()}`);
const file = (text = exampleCsv(), filename = "sales.csv") => ({ filename, content_base64: Buffer.from(text).toString("base64") });
const imported = async (demo, payload = file(), mode = "append", acknowledge_duplicates = false) => {
  const job = await demo.request("/imports/validate", payload);
  return demo.request(`/imports/${job.id}/commit`, { mode, acknowledge_duplicates });
};
const run = (demo, extra = {}) => demo.request("/forecasts", { product_code: "SKU-001", region: "กรุงเทพฯ", horizon: 30, ...extra });

const cycleFile = (count = 280, corruptHoldout = false) => file("sale_date,product_code,region,sales_quantity,inventory\r\n" + Array.from({ length: count }, (_, i) => {
  const day = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const quantity = [50, 150, 110, 90][i % 4] * (corruptHoldout && i >= count - 28 ? 20 : 1);
  return `${day},SKU-001,กรุงเทพฯ,${quantity},1000`;
}).join("\r\n"));

test("ML learns nonweekly demand, compares baselines and persists its learned artifact", async () => {
  const name = `ml-${crypto.randomUUID()}`, demo = new BrowserDemo(name); await imported(demo, cycleFile());
  const auto = await run(demo), baseline = await run(demo, { model_mode: "statistical" });
  assert.equal(auto.model, "ridge_lagged"); assert.equal(auto.model_type, "machine_learning");
  assert.ok(auto.metrics.mae < baseline.metrics.mae / 5);
  assert.equal(auto.ml_artifact.training_samples, 252);
  assert.ok(auto.ml_artifact.coefficients.some(v => Math.abs(v) > .01));
  const saved = await new BrowserDemo(name).request(`/forecasts/${auto.id}`);
  assert.deepEqual(saved.ml_artifact, auto.ml_artifact);
  const { predictArtifact, predictSavedArtifact } = await import(new URL("../.cache/ml-forecasting-test.mjs", import.meta.url).href);
  const dates = Array.from({ length: 280 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const predictions = predictArtifact(saved.ml_artifact, dates.map((_, i) => [50, 150, 110, 90][i % 4]), dates, 30);
  assert.deepEqual(predictions.map(v => Number(v.toFixed(2))), auto.points.map(p => p.forecast));
  assert.deepEqual(predictSavedArtifact(JSON.parse(JSON.stringify(saved.ml_artifact)),30),predictions);
  assert.equal(auto.ml_artifact.training_end, auto.origin);
});

test("ML validation and recursive holdout predictions never read held-out actuals", async () => {
  const original = engine(), changed = engine(); await imported(original, cycleFile()); await imported(changed, cycleFile(280, true));
  const first = await run(original, { model_mode: "ml" }), shifted = await run(changed, { model_mode: "ml" });
  assert.deepEqual(first.selection_mae, shifted.selection_mae); assert.deepEqual(first.ml_alpha_scores, shifted.ml_alpha_scores);
  assert.deepEqual(first.backtest.map(p => p.forecast), shifted.backtest.map(p => p.forecast));
  assert.ok(shifted.metrics.mae > first.metrics.mae);
  assert.notEqual(first.ml_artifact.target_mean, shifted.ml_artifact.target_mean);
  first.validation_windows.forEach(window => { assert.ok(window.train_end < window.validation_start); assert.ok(window.validation_end < first.holdout_start); });
});

test("ML modes handle short, zero and constant history explicitly", async () => {
  const short = engine(); await imported(short, cycleFile(112));
  const auto = await run(short); assert.equal(auto.ml_artifact, null); assert.ok(auto.ml_unavailable_reason);
  await assert.rejects(run(short, { model_mode: "ml" }), /140/);
  await assert.rejects(run(short, { model_mode: "unknown" }), /โหมด/);
  for (const quantity of [0, 100, 2147483647]) {
    const demo = engine();
    await imported(demo, file(exampleCsv().replace(/,\d+,500/g, `,${quantity},500`)));
    const ml = await run(demo, { model_mode: "ml", horizon: 180 });
    assert.equal(ml.model_type, "machine_learning"); assert.equal(ml.total, quantity * 180);
    assert.ok(ml.points.every(p => Number.isFinite(p.forecast) && p.forecast >= 0));
    if (!quantity) assert.equal(ml.metrics.wape_percent, null);
  }
});

test("browser training and 180-day recursive predictions match the scikit-learn reference", async () => {
  const reference = JSON.parse(await readFile(new URL("./fixtures/ml-ridge-reference.json", import.meta.url), "utf8"));
  const { fitRidge, predictArtifact } = await import(new URL("../.cache/ml-forecasting-test.mjs", import.meta.url).href);
  for (const example of reference.cases) {
    const artifact = fitRidge(example.values, example.days, example.alpha);
    assert.equal(artifact.training_samples, example.artifact.training_samples);
    assert.deepEqual(artifact.features, example.artifact.features);
    const forecasts = predictArtifact(artifact, example.values, example.days, example.horizon);
    forecasts.forEach((value, i) => assert.ok(Math.abs(value - example.predictions[i]) < 1e-6, `${example.name} day ${i}: ${value} != ${example.predictions[i]}`));
  }
});

test("regional metrics and reviewed replenishment plans persist without changing inventory", async () => {
  const name = `planning-${crypto.randomUUID()}`, demo = new BrowserDemo(name);
  const lines = exampleCsv().trim().split("\r\n");
  const sales = lines.join("\r\n").replaceAll(",500", ",1000");
  const south = lines.slice(1).map(line => line.replace("กรุงเทพฯ", "South").replace(/,\d+,500$/, ",200,5000")).join("\r\n");
  await imported(demo, file(sales + "\r\n" + south));
  const product = (await demo.request("/products"))[0];
  assert.equal(product.review_period_days, 7); assert.equal(product.service_level_percent, 95);
  await demo.request(`/products/${product.id}`, { ...product, safety_stock: 100, review_period_days: 14 }, "PUT");
  const summary = await demo.request(`/products/${product.id}/summary?region=South`);
  assert.equal(summary.recent_sales, 6000); assert.equal(summary.daily_average, 200);
  assert.equal(summary.inventory.length, 1); assert.equal(summary.inventory[0].inventory, 5000);
  const forecast = await run(demo, { region: "South" });
  const plan = await demo.request("/replenishments", { forecast_id: forecast.id, incoming_units: 300, note: "Confirmed deliveries within horizon" });
  // 28 days (lead time 14 + review 14) x 200 + safety 100 - stock 5000 - incoming 300.
  assert.equal(plan.calculation.protection_days, 28); assert.equal(plan.calculation.safety_stock_statistical, 0);
  assert.equal(plan.calculation.recommended_units, 400); assert.equal(plan.calculation.order_up_to_level, 5700);
  assert.equal(plan.calculation.reorder_point, 2900);
  assert.equal(plan.calculation.urgent, false);
  const review = await demo.request(`/replenishments/${plan.id}/review`, { status: "approved", note: "Checked supply dates" }, "PUT");
  assert.ok(review.reviewed_at); assert.equal(review.reviewed_by, 1);
  assert.equal((await new BrowserDemo(name).request("/replenishments"))[0].status, "approved");
  assert.equal((await demo.request(`/products/${product.id}/summary?region=South`)).inventory[0].inventory, 5000);
  await assert.rejects(demo.request(`/replenishments/${plan.id}/review`, { status: "approved", note: "Again" }, "PUT"), /ทบทวนแล้ว/);
  const zero = await demo.request("/replenishments", { forecast_id: forecast.id, incoming_units: 10000, note: "Enough supply" });
  assert.equal(zero.calculation.recommended_units, 0);
});

test("plans reject changed sales, changed policy, backdated forecasts and missing stock", async () => {
  const demo = engine(); await imported(demo);
  const forecast = await run(demo);
  const request = { forecast_id: forecast.id, incoming_units: 0, note: "Review supply" };
  for (const incoming_units of [-1, 1.5, "10", true]) await assert.rejects(demo.request("/replenishments", { ...request, incoming_units }), /จำนวนเต็ม/);
  const plan = await demo.request("/replenishments", request);
  const product = (await demo.request("/products"))[0];
  await demo.request(`/products/${product.id}`, { ...product, safety_stock: 100 }, "PUT");
  assert.equal((await demo.request("/replenishments"))[0].stale, true);
  await assert.rejects(demo.request(`/replenishments/${plan.id}/review`, { status: "approved", note: "Approve" }, "PUT"), /ข้อมูลวางแผนเปลี่ยน/);
  const short = await run(demo, { horizon: 7 });
  await assert.rejects(demo.request("/replenishments", { ...request, forecast_id: short.id }), /Lead time/);
  const backdated = await run(demo, { as_of: "2026-09-20" });
  await assert.rejects(demo.request("/replenishments", { ...request, forecast_id: backdated.id }), /วันยอดขายล่าสุด/);
  await imported(demo, file(exampleCsv(true), "actuals.csv"));
  await assert.rejects(demo.request("/replenishments", request), /ยอดขายเปลี่ยน/);
  await imported(demo, file(exampleCsv().replaceAll(",500", ","), "no-stock.csv"), "replace");
  const fresh = await run(demo);
  await assert.rejects(demo.request("/replenishments", { ...request, forecast_id: fresh.id }), /Inventory/);
});

test("CSV preserves quoted multiline text, escaped quotes and zero values", () => {
  const result = parseCsv('\ufeffDate,Product,Region,Quantity\r\n2026-01-01,"Item, A","North\nArea",0\r\n2026-01-02,"Item ""B""",South,1');
  assert.deepEqual(result.headers, ["Date", "Product", "Region", "Quantity"]);
  assert.equal(result.rows[0].Region, "North\nArea");
  assert.equal(result.rows[0].Quantity, "0");
  assert.equal(result.rows[1].Product, 'Item "B"');
  assert.throws(() => parseCsv('a,b\n"unclosed,b'), /คำพูด/);
  assert.throws(() => parseCsv("a,a\n1,2"), /หัวคอลัมน์/);
});

test("invalid imports are atomic; duplicates require acknowledgement and commit is idempotent", async () => {
  const demo = engine();
  const invalid = await demo.request("/imports/validate", file(exampleCsv().replace(",100,500", ",-1,500")));
  assert.equal(invalid.report.invalid_rows, 1);
  await assert.rejects(demo.request(`/imports/${invalid.id}/commit`, { mode: "append" }), /แก้แถว/);
  assert.equal((await demo.request("/dashboard")).records, 0);
  const lines = exampleCsv().trim().split("\r\n"); lines.push(lines[1]);
  const duplicate = await demo.request("/imports/validate", file(lines.join("\r\n")));
  assert.equal(duplicate.report.exact_duplicate_rows, 1);
  await assert.rejects(demo.request(`/imports/${duplicate.id}/commit`, { mode: "append" }), /ยืนยัน/);
  await demo.request(`/imports/${duplicate.id}/commit`, { mode: "append", acknowledge_duplicates: true });
  await imported(demo, file(exampleCsv(true), "actuals.csv"));
  await demo.request(`/imports/${duplicate.id}/commit`, { mode: "append", acknowledge_duplicates: true });
  assert.equal((await demo.request("/dashboard")).records, 148);
});

test("forecast uses temporal cutoff and historical inventory; actuals create live monitoring", async () => {
  const demo = engine(); await imported(demo);
  const forecast = await run(demo, { horizon: 180 });
  assert.equal(forecast.points.length, 180);
  assert.equal(forecast.origin, "2026-09-30");
  assert.ok(forecast.metrics.mae < .01);
  assert.equal(forecast.inventory_snapshot.inventory, 500);
  assert.equal((await demo.request("/monitoring")).runs[0].matched_days, 0);
  await imported(demo, file(exampleCsv(true).replaceAll(",500", ",20"), "actuals.csv"));
  const monitoring = await demo.request("/monitoring");
  assert.equal(monitoring.runs[0].matched_days, 7);
  assert.equal(monitoring.runs[0].actual_vs_forecast[0].actual, 108);
  assert.ok(Number.isFinite(monitoring.runs[0].live_metrics.wape_percent));
  const historical = await run(demo, { as_of: "2026-09-30", horizon: 180 });
  assert.deepEqual(historical.points, forecast.points);
  assert.equal(historical.inventory_snapshot.sale_date, "2026-09-30");
  assert.equal(historical.inventory_snapshot.inventory, 500);
  const csv = await demo.request(`/forecasts/${forecast.id}/export`);
  assert.equal(csv.split("\r\n").length, 181);
  await assert.rejects(run(demo, { horizon: 181 }), /7–180/);
  await imported(demo, file(), "replace");
  assert.ok((await demo.request("/monitoring")).runs.every(r => r.lineage_changed && r.matched_days === 0));
});

test("settings, product changes and review persist across fresh connections", async () => {
  const name = `test-${crypto.randomUUID()}`; const demo = new BrowserDemo(name);
  await imported(demo); const product = (await demo.request("/products"))[0];
  await demo.request(`/products/${product.id}`, { name: "Planning Item", lead_time_days: 14, safety_stock: 1000 }, "PUT");
  const forecast = await run(demo); const alert = (await demo.request("/alerts"))[0];
  assert.equal(alert.forecast_id, forecast.id);
  await demo.request(`/alerts/${alert.id}/review`, { status: "approved", note: "ตรวจยอดขายแล้ว" }, "PUT");
  await demo.request("/settings", { name: "My Plan", auto_refresh: false, compact_table: true, alert_threshold_percent: 20 }, "PUT");
  const reopened = new BrowserDemo(name);
  assert.equal((await reopened.request("/dashboard")).records, 140);
  assert.equal((await reopened.request("/products"))[0].safety_stock, 1000);
  const info = await reopened.request(""); assert.equal(info.name, "My Plan"); assert.equal(info.settings.compact_table, true);
  const saved = (await reopened.request("/alerts"))[0]; assert.equal(saved.review_note, "ตรวจยอดขายแล้ว"); assert.ok(saved.reviewed_at);
  const summary = await reopened.request(`/products/${product.id}/summary`);
  assert.equal(summary.inventory[0].inventory, 500);
  assert.equal(summary.trend.length, 90);
  assert.ok(summary.daily_average > 100);
});

test("simultaneous tabs do not overwrite imports or commit stale validation", async () => {
  const name = `test-${crypto.randomUUID()}`; const a = new BrowserDemo(name), b = new BrowserDemo(name);
  const jobs = await Promise.all([a.request("/imports/validate", file()), b.request("/imports/validate", file(exampleCsv(), "other.csv"))]);
  const outcomes = await Promise.allSettled([a.request(`/imports/${jobs[0].id}/commit`, { mode: "append" }), b.request(`/imports/${jobs[1].id}/commit`, { mode: "append" })]);
  assert.equal(outcomes.filter(v => v.status === "fulfilled").length, 1);
  assert.equal((await a.request("/dashboard")).records, 140);
  assert.equal((await b.request("/dashboard")).data_version, 1);
});

test("Excel uses first worksheet, real date cells, mapping and numeric zero", async () => {
  const shared = ["Date", "Code", "Area", "Qty", "Stock", "EXCEL-1", "กรุงเทพฯ"];
  const archive = zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
    "xl/sharedStrings.xml": strToU8('<sst>' + shared.map(s => `<si><t>${s}</t></si>`).join("") + '</sst>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1">' + ["A", "B", "C", "D", "E"].map((c, i) => `<c r="${c}1" t="s"><v>${i}</v></c>`).join("") + '</row><row r="2"><c r="A2" s="1"><v>46023</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2"><v>0</v></c><c r="E2"><v>0</v></c></row></sheetData></worksheet>'),
  });
  const demo = engine(); const payload = { filename: "sales.xlsx", content_base64: Buffer.from(archive).toString("base64"), mapping: { sale_date: "Date", product_code: "Code", region: "Area", sales_quantity: "Qty", inventory: "Stock" } };
  const preview = await demo.request("/imports/preview", payload); assert.equal(preview.preview[0].Qty, "0"); assert.equal(preview.preview[0].Date, "2026-01-01");
  const job = await imported(demo, payload); assert.equal(job.report.valid_rows, 1);
  const records = (await demo.request("/sales/query")).items;
  assert.equal(records[0].sales_quantity, 0); assert.equal(records[0].inventory, 0);
});

const dailyCsv = (count, start, quantity) => file("sale_date,product_code,region,sales_quantity,inventory\r\n" + Array.from({ length: count }, (_, i) => `${new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10)},SKU-001,กรุงเทพฯ,${quantity(i)},500`).join("\r\n"));

test("safety stock follows forecast error and service level; intermittent demand is not forecast as zero", async () => {
  const demo = engine(); await imported(demo, dailyCsv(140, "2026-01-01", i => 80 + (i * 37) % 41));
  const product = (await demo.request("/products"))[0], forecast = await run(demo);
  const request = { forecast_id: forecast.id, incoming_units: 0, note: "Weekly review" };
  const first = (await demo.request("/replenishments", request)).calculation;
  const rmse = Math.sqrt(forecast.backtest.reduce((s, p) => s + (p.actual - p.forecast) ** 2, 0) / forecast.backtest.length);
  assert.ok(first.safety_stock_statistical > 0); assert.equal(first.safety_stock_statistical, Math.ceil(1.6449 * rmse * Math.sqrt(21)));
  await demo.request(`/products/${product.id}`, { ...product, service_level_percent: 99 }, "PUT");
  assert.equal((await demo.request("/replenishments"))[0].stale, true);
  assert.ok((await demo.request("/replenishments", request)).calculation.safety_stock > first.safety_stock);
  await assert.rejects(demo.request(`/products/${product.id}`, { ...product, service_level_percent: 97 }, "PUT"), /ระดับการบริการ/);
  await demo.request(`/products/${product.id}`, { name: product.name, lead_time_days: 14, safety_stock: 0 }, "PUT");
  assert.equal((await demo.request("/products"))[0].service_level_percent, 99);
  assert.equal((await run(demo, { model_mode: "statistical" })).demand_pattern, "smooth");

  let seed = 7; const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const sparse = engine(); await imported(sparse, dailyCsv(300, "2025-01-01", () => random() < .2 ? 10 + Math.floor(random() * 41) : 0));
  const intermittent = await run(sparse, { model_mode: "statistical" });
  assert.equal(intermittent.demand_pattern, "intermittent"); assert.ok("croston_sba" in intermittent.selection_score);
  assert.ok(intermittent.total > 0);
  Object.entries(intermittent.selection_score).forEach(([model, score]) => assert.ok(score >= intermittent.selection_mae[model]));
});
