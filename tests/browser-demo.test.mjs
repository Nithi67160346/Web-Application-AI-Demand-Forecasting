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
await writeFile(modulePath, transpileModule(await readFile(new URL("../app/lib/browser-demo.ts", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText);
const { BrowserDemo, parseCsv, exampleCsv } = await import(modulePath.href);
const engine = () => new BrowserDemo(`test-${crypto.randomUUID()}`);
const file = (text = exampleCsv(), filename = "sales.csv") => ({ filename, content_base64: Buffer.from(text).toString("base64") });
const imported = async (demo, payload = file(), mode = "append", acknowledge_duplicates = false) => {
  const job = await demo.request("/imports/validate", payload);
  return demo.request(`/imports/${job.id}/commit`, { mode, acknowledge_duplicates });
};
const run = (demo, extra = {}) => demo.request("/forecasts", { product_code: "SKU-001", region: "กรุงเทพฯ", horizon: 30, ...extra });

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
