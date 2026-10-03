import { unzipSync, strFromU8 } from "fflate";
import type { Alert, Inventory, Job, Product, Run, Workspace } from "./workspace-types";

type Sale = { sale_date: string; product_code: string; region: string; sales_quantity: number; inventory: number | null };
type Staged = Job & { rows: Sale[]; source_version: number; generation: number; fingerprint: string };
type SavedRun = Run & { data_generation: number };
type DemoState = { workspace: Workspace; generation: number; sales: Sale[]; products: Product[]; jobs: Staged[]; runs: SavedRun[]; alerts: Alert[]; events: { action: string; detail: string; created_at: string }[]; nextId: number };
type Parsed = { headers: string[]; rows: Record<string, string>[] };
type FilePayload = { filename: string; content_base64: string; mapping?: Record<string, string> };
type ForecastPayload = { product_code: string; region: string; horizon: number; as_of?: string | null; acknowledge_missing_days?: boolean; signals?: string[] };
const fields = ["sale_date", "product_code", "region", "sales_quantity", "inventory"];
const DAY = 86400000;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const round = (v: number, digits = 2) => Number(v.toFixed(digits));
const plusDay = (day: string, amount: number) => new Date(Date.parse(day) + amount * DAY).toISOString().slice(0, 10);
const now = () => new Date().toISOString();
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function emptyState(): DemoState {
  return { workspace: { id: 1, name: "Demandly Workspace", role: "owner", data_version: 0, settings: {}, workspaces: [] }, generation: 0, sales: [], products: [], jobs: [], runs: [], alerts: [], events: [], nextId: 1 };
}

/** A single transaction holds each read/change/write, including across browser tabs. */
export class BrowserDemo {
  private database: Promise<IDBDatabase> | null = null;
  constructor(private databaseName = "demandly-pages-workspace-v1") {}
  private open() {
    if (!this.database) this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.database = null; reject(new Error("เปิดพื้นที่เก็บข้อมูลไม่ได้ กรุณาอนุญาต IndexedDB ในเบราว์เซอร์")); };
      request.onblocked = () => reject(new Error("กรุณาปิดแท็บ Demandly อื่นแล้วลองใหม่"));
    });
    return this.database;
  }
  private async transaction<T>(write: boolean, work: (state: DemoState) => T): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("workspace", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("workspace");
      const read = store.get("current"); let result: T; let failure: unknown;
      read.onsuccess = () => {
        try { const state: DemoState = read.result ?? emptyState(); result = work(state); if (write) store.put(state, "current"); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? new Error("บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลของเบราว์เซอร์อาจเต็ม"));
      transaction.onerror = () => { failure ??= new Error("อ่านหรือบันทึกข้อมูลในเบราว์เซอร์ไม่สำเร็จ"); };
    });
  }
  async request<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let parsed: Parsed | undefined; let fingerprint = "";
    if (path === "/imports/preview" || path === "/imports/validate") {
      const payload = body as FilePayload; parsed = readFile(payload);
      if (path.endsWith("validate")) {
        const bytes = new TextEncoder().encode(JSON.stringify([payload.filename, payload.content_base64, payload.mapping]));
        fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("");
      }
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return this.transaction(method !== "GET", state => dispatch(state, path, body, method, parsed, fingerprint)) as Promise<T>;
  }
}

export function parseCsv(text: string): Parsed {
  const table: string[][] = []; let row: string[] = []; let value = ""; let quoted = false; let afterQuote = false;
  const cell = () => { row.push(value); value = ""; afterQuote = false; };
  const line = () => { cell(); if (row.some(v => v.trim())) table.push(row); row = []; requireValue(table.length <= 250001, "สูงสุด 250,000 แถวต่อไฟล์"); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; afterQuote = true; } } else value += c; }
    else if (c === '"') { requireValue(!value && !afterQuote, "CSV มีเครื่องหมายคำพูดผิดตำแหน่ง"); quoted = true; }
    else if (c === ",") cell();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; line(); }
    else { requireValue(!afterQuote || /\s/.test(c), "CSV มีข้อความหลังปิดเครื่องหมายคำพูด"); if (!afterQuote) value += c; }
  }
  requireValue(!quoted, "CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด"); if (row.length || value || afterQuote) line();
  return fromTable(table);
}
function fromTable(table: string[][]): Parsed {
  const headers = (table.shift() ?? []).map(v => v.replace(/^\uFEFF/, "").trim());
  requireValue(headers.length && headers.length <= 100 && headers.every(Boolean) && new Set(headers).size === headers.length, "หัวคอลัมน์ต้องไม่ว่าง ไม่ซ้ำ และไม่เกิน 100 คอลัมน์");
  requireValue(table.length > 0 && table.length <= 250000, "ไฟล์ต้องมีข้อมูล 1–250,000 แถว");
  return { headers, rows: table.map(row => {
    requireValue(!row.slice(headers.length).some(v => v.trim()), "มีข้อมูลเกินจำนวนหัวคอลัมน์");
    return Object.fromEntries(headers.map((key, i) => [key, row[i] ?? ""]));
  }) };
}
function readFile(payload: FilePayload): Parsed {
  requireValue(payload && typeof payload.content_base64 === "string" && typeof payload.filename === "string", "กรุณาเลือกไฟล์");
  requireValue(payload.content_base64.length <= 28 * 1024 * 1024, "ไฟล์ต้องไม่เกิน 20 MB");
  const bytes = Uint8Array.from(atob(payload.content_base64), c => c.charCodeAt(0));
  requireValue(bytes.length <= 20 * 1024 * 1024, "ไฟล์ต้องไม่เกิน 20 MB");
  if (/\.csv$/i.test(payload.filename)) return parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  requireValue(/\.xlsx$/i.test(payload.filename), "รองรับ CSV UTF-8 และ Excel .xlsx");
  let size = 0;
  const files = unzipSync(bytes, { filter: entry => { size += entry.originalSize; requireValue(size <= 64 * 1024 * 1024, "Excel เมื่อคลายไฟล์ต้องไม่เกิน 64 MB"); return /^(xl\/.*\.xml|xl\/_rels\/workbook\.xml\.rels)$/.test(entry.name); } });
  const xml = (path: string) => {
    requireValue(files[path], "Excel ไม่มี worksheet หรือไฟล์ประกอบที่ต้องการ");
    const document = new DOMParser().parseFromString(strFromU8(files[path]), "application/xml");
    requireValue(!document.getElementsByTagName("parsererror").length, "โครงสร้าง XML ใน Excel ไม่ถูกต้อง"); return document;
  };
  const workbook = xml("xl/workbook.xml"); const first = workbook.getElementsByTagName("sheet")[0]; requireValue(first, "Excel ไม่มีแผ่นข้อมูล");
  const relation = Array.from(xml("xl/_rels/workbook.xml.rels").getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === first.getAttribute("r:id"));
  const target = relation?.getAttribute("Target") ?? "";
  requireValue(target && !target.includes("..") && relation?.getAttribute("TargetMode") !== "External", "Worksheet reference ไม่ถูกต้อง");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const strings = files["xl/sharedStrings.xml"] ? Array.from(xml("xl/sharedStrings.xml").getElementsByTagName("si")).map(s => s.textContent ?? "") : [];
  const dateStyles = new Set<number>();
  if (files["xl/styles.xml"]) {
    const styles = xml("xl/styles.xml");
    const customDates = new Set(Array.from(styles.getElementsByTagName("numFmt")).filter(s => /[yd]/i.test((s.getAttribute("formatCode") ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, ""))).map(s => Number(s.getAttribute("numFmtId"))));
    const formats = styles.getElementsByTagName("cellXfs")[0];
    Array.from(formats?.childNodes ?? []).filter(f => f.nodeType === 1).forEach((f, i) => { const id = Number((f as Element).getAttribute("numFmtId")); if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || customDates.has(id)) dateStyles.add(i); });
  }
  const is1904 = workbook.getElementsByTagName("workbookPr")[0]?.getAttribute("date1904");
  const table: string[][] = [];
  for (const source of Array.from(xml(sheetPath).getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(source.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") ?? ""; const letters = ref.match(/^[A-Z]+/)?.[0]; requireValue(letters, "Excel cell reference ไม่ถูกต้อง");
      const index = Array.from(letters).reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      requireValue(index < 100, "สูงสุด 100 คอลัมน์");
      const type = c.getAttribute("t"); let value = c.getElementsByTagName("v")[0]?.textContent ?? "";
      if (type === "s") value = strings[Number(value)] ?? "";
      else if (type === "inlineStr") value = c.getElementsByTagName("is")[0]?.textContent ?? "";
      else if (type === "e") throw new Error(`Excel มีค่าผิดพลาดใน ${ref}`);
      else if (value && dateStyles.has(Number(c.getAttribute("s")))) value = new Date((is1904 === "1" || is1904 === "true" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Number(value) * DAY).toISOString().slice(0, 10);
      else if (c.getElementsByTagName("f").length && !value) throw new Error(`กรุณาคำนวณสูตร Excel ก่อนบันทึกไฟล์ (${ref})`);
      row[index] = value;
    }
    if (row.some(v => v?.trim())) { table.push(Array.from({ length: row.length }, (_, i) => row[i] ?? "")); requireValue(table.length <= 250001, "สูงสุด 250,000 แถว"); }
  }
  return fromTable(table);
}

function validate(parsed: Parsed, mapping: Record<string, string>) {
  fields.slice(0, 4).forEach(f => requireValue(parsed.headers.includes(mapping[f]), `กรุณาจับคู่ ${f}`));
  const mapped = Object.values(mapping).filter(Boolean); requireValue(new Set(mapped).size === mapped.length && mapped.every(f => parsed.headers.includes(f)), "คอลัมน์ที่จับคู่ต้องมีอยู่จริงและใช้ได้ครั้งเดียว");
  const rows: Sale[] = []; const errors: { row: number; error: string }[] = []; const seen = new Set<string>(); let invalid = 0, duplicates = 0, missing = 0;
  parsed.rows.forEach((raw, i) => { try {
    const day = (raw[mapping.sale_date] ?? "").trim().split("T")[0];
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day, "วันที่ต้องเป็น YYYY-MM-DD ที่ถูกต้อง");
    const code = (raw[mapping.product_code] ?? "").trim(), region = (raw[mapping.region] ?? "").trim();
    requireValue(code.length > 0 && code.length <= 64 && region.length > 0 && region.length <= 64, "Product และ Region ต้องมี 1–64 ตัวอักษร");
    const integer = (text: string) => { requireValue(text.trim(), "Sales quantity ต้องไม่ว่าง"); const value = Number(text); requireValue(Number.isInteger(value) && value >= 0 && value <= 2147483647, "ปริมาณต้องเป็นจำนวนเต็ม 0–2147483647"); return value; };
    const stockText = raw[mapping.inventory] ?? ""; const stock = stockText.trim() ? integer(stockText) : null; if (stock === null) missing++;
    const row = { sale_date: day, product_code: code, region, sales_quantity: integer(raw[mapping.sales_quantity] ?? ""), inventory: stock };
    const key = JSON.stringify(row); if (seen.has(key)) duplicates++; seen.add(key); rows.push(row);
  } catch (error) { invalid++; if (errors.length < 100) errors.push({ row: i + 2, error: (error as Error).message }); } });
  const dates = rows.map(r => r.sale_date).sort();
  return { rows, report: { total_rows: parsed.rows.length, valid_rows: rows.length, invalid_rows: invalid, exact_duplicate_rows: duplicates, missing_inventory: missing, quality_percent: round(rows.length / parsed.rows.length * 100), start_date: dates[0] ?? "", end_date: dates.at(-1) ?? "", errors, preview: rows.slice(0, 20), headers: parsed.headers, mapping } };
}
function daily(state: DemoState, product?: string, region?: string, cutoff?: string | null) {
  const values = new Map<string, number>(); for (const r of state.sales) if ((!product || product === r.product_code) && (!region || region === r.region) && (!cutoff || r.sale_date <= cutoff)) values.set(r.sale_date, (values.get(r.sale_date) ?? 0) + r.sales_quantity);
  return Array.from(values, ([date, actual]) => ({ date, actual })).sort((a, b) => a.date.localeCompare(b.date));
}
function inventory(state: DemoState, code?: string, cutoff?: string) {
  const snapshots = new Map<string, Inventory>();
  for (const row of state.sales) { if (row.inventory === null || code && row.product_code !== code || cutoff && row.sale_date > cutoff) continue;
    const key = JSON.stringify([row.product_code, row.region]); if (!snapshots.has(key) || snapshots.get(key)!.sale_date <= row.sale_date) snapshots.set(key, { product_code: row.product_code, region: row.region, sale_date: row.sale_date, inventory: row.inventory }); }
  return Array.from(snapshots.values());
}
function totals(state: DemoState, field: "product_code" | "region") {
  const totals = new Map<string, number>(); for (const row of state.sales) totals.set(row[field], (totals.get(row[field]) ?? 0) + row.sales_quantity);
  return Array.from(totals, ([name, quantity]) => ({ [field === "product_code" ? "code" : "region"]: name, quantity })).sort((a, b) => b.quantity - a.quantity);
}
function audit(state: DemoState, action: string, detail: string) { state.events.unshift({ action, detail, created_at: now() }); state.events = state.events.slice(0, 100); }
const metrics = (actual: number[], forecast: number[]) => ({ mae: round(mean(actual.map((v, i) => Math.abs(v - forecast[i]))), 3), wape_percent: actual.some(Boolean) ? round(actual.reduce((sum, v, i) => sum + Math.abs(v - forecast[i]), 0) / actual.reduce((a, b) => a + b, 0) * 100, 3) : null, bias: round(mean(actual.map((v, i) => forecast[i] - v)), 3) });
function predict(values: number[], days: string[], horizon: number, model: string) {
  if (model === "last_value") return Array(horizon).fill(values.at(-1)) as number[];
  if (model === "annual_seasonal") { const scale = Math.min(2, Math.max(.5, values.slice(-28).reduce((a, b) => a + b, 0) / Math.max(1, values.slice(-393, -365).reduce((a, b) => a + b, 0)))); return Array.from({ length: horizon }, (_, i) => Math.max(0, values[(values.length + i - 365) % values.length] * scale)); }
  const window = values.slice(-56); const n = window.length, mid = (n - 1) / 2, avg = mean(window);
  if (model === "linear_trend") { const slope = window.reduce((s, v, i) => s + (i - mid) * (v - avg), 0) / Math.max(1, window.reduce((s, _, i) => s + (i - mid) ** 2, 0)); return Array.from({ length: horizon }, (_, i) => Math.max(0, avg + slope * (n + i - mid))); }
  return Array.from({ length: horizon }, (_, i) => { const weekday = new Date(plusDay(days.at(-1)!, i + 1)).getUTCDay(); return mean(window.filter((_, j) => new Date(days.slice(-56)[j]).getUTCDay() === weekday)); });
}
function forecast(state: DemoState, payload: ForecastPayload): SavedRun {
  const { product_code: code, region, horizon, as_of: cutoff } = payload;
  requireValue(Number.isInteger(horizon) && horizon >= 7 && horizon <= 180, "เลือก Forecast 7–180 วัน");
  requireValue(!payload.signals?.length, "Demo ใช้ยอดขายที่นำเข้าเป็นแหล่งข้อมูล");
  const rows = daily(state, code, region, cutoff); requireValue(rows.length >= 56, "ต้องมีอย่างน้อย 56 วันที่มีรายการ และ 112 วันปฏิทิน");
  const span = Math.round((Date.parse(rows.at(-1)!.date) - Date.parse(rows[0].date)) / DAY) + 1; requireValue(span >= 112 && span <= 3651, "ประวัติต้องมี 112 วันปฏิทินถึง 10 ปี");
  requireValue(span === rows.length || payload.acknowledge_missing_days, `ขาดข้อมูล ${span - rows.length} วัน กรุณายืนยันการเติมศูนย์`);
  const observed = new Map(rows.map(r => [r.date, r.actual])); const days = Array.from({ length: span }, (_, i) => plusDay(rows[0].date, i)); const values = days.map(d => observed.get(d) ?? 0);
  const models = ["last_value", "weekday_mean", "linear_trend", ...(span >= 449 ? ["annual_seasonal"] : [])];
  const scores = Object.fromEntries(models.map(model => [model, round(mean([84, 56].map(offset => { const split = span - offset; return metrics(values.slice(split, split + 28), predict(values.slice(0, split), days.slice(0, split), 28, model)).mae; })), 3)]));
  const chosen = models.reduce((best, model) => scores[model] < scores[best] ? model : best);
  const heldout = predict(values.slice(0, -28), days.slice(0, -28), 28, chosen); const evaluation = metrics(values.slice(-28), heldout);
  const residuals = values.slice(-28).map((v, i) => Math.abs(v - heldout[i])).sort((a, b) => a - b); const width = residuals[Math.ceil(.95 * residuals.length) - 1];
  const origin = days.at(-1)!; const estimates = predict(values, days, horizon, chosen); const points = estimates.map((value, i) => { const uncertainty = width * Math.sqrt(1 + i / 28); return { date: plusDay(origin, i + 1), forecast: round(value), baseline: round(value), lower: round(Math.max(0, value - uncertainty)), upper: round(value + uncertainty) }; });
  const recent = mean(values.slice(-28)); const run: SavedRun = { id: state.nextId++, product_code: code, region, data_version: state.workspace.data_version, data_generation: state.generation, created_at: now(), model: chosen, total: round(points.reduce((s, p) => s + p.forecast, 0)), origin, horizon, points, history: days.slice(-90).map((date, i) => ({ date, actual: values.slice(-90)[i] })), backtest: days.slice(-28).map((date, i) => ({ date, actual: values.slice(-28)[i], forecast: round(heldout[i]) })), metrics: evaluation, change_percent: recent ? round((mean(points.map(p => p.forecast)) / recent - 1) * 100) : null, signals: [], selection_mae: scores, missing_days_filled_zero: span - rows.length, interval_method: "Empirical 95th percentile holdout residual; coverage is not guaranteed.", metric_scope: "Final 28-day holdout, separate from model selection.", signal_source: "Imported sales", inventory_snapshot: inventory(state, code, origin).find(s => s.region === region) ?? null };
  state.runs.unshift(run); const threshold = state.workspace.settings.alert_threshold_percent ?? 15;
  const add = (level: string, message: string) => state.alerts.unshift({ id: state.nextId++, forecast_id: run.id, level, message, review_status: "pending", review_note: null, reviewed_by: null, reviewed_at: null, stale: false });
  if (run.change_percent !== null && Math.abs(run.change_percent) >= threshold) add(Math.abs(run.change_percent) >= 30 ? "HIGH" : "MEDIUM", `${code} / ${region}: demand change ${run.change_percent}%.`);
  const previous = mean(values.slice(-35, -7)); const observedChange = previous ? (mean(values.slice(-7)) / previous - 1) * 100 : 0;
  if (Math.abs(observedChange) >= threshold) add(Math.abs(observedChange) >= 30 ? "HIGH" : "MEDIUM", `Observed recent 7-day demand changed ${round(observedChange)}% versus prior 28 days at ${origin}.`);
  const product = state.products.find(p => p.code === code); const stock = run.inventory_snapshot;
  if (product && stock && stock.inventory < run.total / horizon * product.lead_time_days + product.safety_stock) add("HIGH", `${code} / ${region}: inventory ${stock.inventory} is below lead-time demand plus safety stock. Snapshot ${stock.sale_date}.`);
  audit(state, "forecast.created", `${code} / ${region}: ${horizon} days (${chosen})`); return run;
}

function dispatch(state: DemoState, rawPath: string, body: unknown, method: string, parsed?: Parsed, fingerprint = ""): unknown {
  const url = new URL(rawPath || "/", "https://demo.local"); const path = url.pathname; const payload = (body ?? {}) as Record<string, unknown>;
  const publicJob = (job: Staged) => ({ id: job.id, filename: job.filename, status: job.status, report: job.report, created_at: job.created_at });
  const productById = (id: number) => { const p = state.products.find(p => p.id === id); requireValue(p, "ไม่พบสินค้า"); return p; };
  const runById = (id: number) => { const run = state.runs.find(r => r.id === id); requireValue(run, "ไม่พบ Forecast"); return run; };
  if (path === "/" && method === "GET") return { ...state.workspace, workspaces: [{ id: 1, name: state.workspace.name, role: "owner" }] };
  if (path === "/imports/preview") return { headers: parsed!.headers, total_rows: parsed!.rows.length, preview: parsed!.rows.slice(0, 20), suggested_mapping: Object.fromEntries(fields.map(f => [f, parsed!.headers.includes(f) ? f : ""])) };
  if (path === "/imports/validate") {
    const existing = state.jobs.find(j => j.fingerprint === fingerprint && j.source_version === state.workspace.data_version); if (existing) return publicJob(existing);
    const mapping = (body as FilePayload).mapping ?? Object.fromEntries(fields.map(f => [f, parsed!.headers.includes(f) ? f : ""]));
    const { rows, report } = validate(parsed!, mapping); const job: Staged = { id: state.nextId++, filename: (body as FilePayload).filename, status: "validated", rows, report, source_version: state.workspace.data_version, generation: state.generation, fingerprint, created_at: now() }; state.jobs.unshift(job); audit(state, "import.validated", `${job.filename}: ${rows.length} valid rows`); return publicJob(job);
  }
  const commit = path.match(/^\/imports\/(\d+)\/commit$/);
  if (commit) {
    const job = state.jobs.find(j => j.id === Number(commit[1])); requireValue(job, "ไม่พบรายการนำเข้า");
    if (job.status === "committed") { requireValue(job.generation === state.generation, "ชุดข้อมูลถูกแทนที่แล้ว กรุณาตรวจไฟล์ใหม่"); return publicJob(job); }
    requireValue(job.source_version === state.workspace.data_version, "ข้อมูลเปลี่ยนหลังตรวจไฟล์ กรุณาตรวจใหม่");
    requireValue(!job.report.invalid_rows, "แก้แถวที่ผิดทั้งหมดก่อนบันทึก"); requireValue(!job.report.exact_duplicate_rows || payload.acknowledge_duplicates, "กรุณายืนยันรายการที่เหมือนกันก่อนบันทึก");
    requireValue(payload.mode === "append" || payload.mode === "replace", "เลือกรูปแบบเพิ่มข้อมูลหรือแทนที่ข้อมูล");
    if (payload.mode === "replace") { state.sales = []; state.generation++; }
    state.sales = state.sales.concat(job.rows);
    for (const code of new Set(job.rows.map(r => r.product_code))) if (!state.products.some(p => p.code === code)) state.products.push({ id: state.nextId++, code, name: code, lead_time_days: 14, safety_stock: 0 });
    state.workspace.data_version++; job.status = "committed"; job.rows = []; job.generation = state.generation; audit(state, "import.committed", `${job.filename}: ${job.report.valid_rows} rows (${payload.mode})`); return publicJob(job);
  }
  if (path === "/imports") return state.jobs.slice(0, 50).map(publicJob);
  if (path === "/products") return state.products.slice().sort((a, b) => a.code.localeCompare(b.code));
  const productPath = path.match(/^\/products\/(\d+)(\/summary)?$/);
  if (productPath) {
    const product = productById(Number(productPath[1]));
    if (method === "PUT") { requireValue(typeof payload.name === "string" && payload.name.trim().length > 0 && payload.name.length <= 120, "ชื่อสินค้าต้องมี 1–120 ตัวอักษร"); requireValue(Number.isInteger(payload.lead_time_days) && Number(payload.lead_time_days) >= 1 && Number(payload.lead_time_days) <= 365 && Number.isInteger(payload.safety_stock) && Number(payload.safety_stock) >= 0 && Number(payload.safety_stock) <= 2147483647, "Lead time หรือ Safety stock ไม่ถูกต้อง"); Object.assign(product, payload); audit(state, "product.updated", product.code); return { message: "Product saved." }; }
    const rows = daily(state, product.code), end = rows.at(-1)?.date; const recent = end ? rows.filter(r => r.date > plusDay(end, -30)).reduce((s, r) => s + r.actual, 0) : 0;
    const subset = { ...state, sales: state.sales.filter(r => r.product_code === product.code) }; return { code: product.code, last_date: end ?? null, recent_sales: recent, daily_average: recent / 30, trend: rows.slice(-90), regions: totals(subset, "region"), inventory: inventory(state, product.code) };
  }
  if (path === "/inventory") return inventory(state);
  if (path === "/forecasts") return method === "GET" ? state.runs.slice(0, 50) : forecast(state, body as ForecastPayload);
  const runPath = path.match(/^\/forecasts\/(\d+)(\/export)?$/);
  if (runPath) { const run = runById(Number(runPath[1])); if (runPath[2]) return "date,forecast,lower,upper\r\n" + run.points.map(p => [p.date, p.forecast, p.lower, p.upper].join(",")).join("\r\n"); return run; }
  const alerts = state.alerts.map(a => ({ ...a, stale: runById(a.forecast_id).data_version !== state.workspace.data_version }));
  if (path === "/alerts") return alerts.slice(0, 100);
  const reviewPath = path.match(/^\/alerts\/(\d+)\/review$/);
  if (reviewPath) { const alert = state.alerts.find(a => a.id === Number(reviewPath[1])); requireValue(alert, "ไม่พบ Alert"); requireValue(["pending", "approved", "dismissed"].includes(String(payload.status)) && typeof payload.note === "string" && payload.note.trim().length > 0 && payload.note.length <= 2000, "กรุณาเลือกสถานะและใส่เหตุผล 1–2000 ตัวอักษร"); Object.assign(alert, { review_status: payload.status, review_note: payload.note, reviewed_by: 1, reviewed_at: now() }); audit(state, "alert.reviewed", `${alert.id}: ${payload.status}`); return { message: "Review saved." }; }
  if (path === "/dashboard") { const rows = daily(state); const end = rows.at(-1)?.date; return { records: state.sales.length, last_date: end ?? null, recent_sales: end ? rows.filter(r => r.date > plusDay(end, -30)).reduce((s, r) => s + r.actual, 0) : 0, trend: rows.slice(-60), products: totals(state, "product_code"), regions: totals(state, "region"), latest_forecast: state.runs.find(r => r.data_version === state.workspace.data_version) ?? null, pending_alerts: alerts.filter(a => !a.stale && a.review_status === "pending").length, data_version: state.workspace.data_version }; }
  if (path === "/monitoring") return { runs: state.runs.slice(0, 20).map(run => { const lineage = run.data_generation !== state.generation; const actual = new Map(lineage ? [] : daily(state, run.product_code, run.region).map(r => [r.date, r.actual])); const matched = run.points.filter(p => actual.has(p.date)).map(p => ({ date: p.date, forecast: p.forecast, actual: actual.get(p.date)! })); return { id: run.id, product_code: run.product_code, region: run.region, stale: run.data_version !== state.workspace.data_version, lineage_changed: lineage, holdout: run.metrics, matched_days: matched.length, live_metrics: matched.length ? metrics(matched.map(p => p.actual), matched.map(p => p.forecast)) : null, actual_vs_forecast: matched, backtest: run.backtest }; }), events: state.events.slice(0, 50) };
  if (path === "/sales/query") { const start = performance.now(); const items = state.sales.filter(r => (!url.searchParams.get("product_code") || url.searchParams.get("product_code") === r.product_code) && (!url.searchParams.get("region") || url.searchParams.get("region") === r.region)).slice(-50).reverse(); return { items, query_ms: round(performance.now() - start, 3), plan: { storage: "IndexedDB / browser", operation: "Filter imported rows", note: "GitHub Pages demo does not execute PostgreSQL EXPLAIN. Use the full application for the database indexing lab." }, note: "Browser demo" }; }
  if (path === "/members" && method === "GET") return [{ id: 1, username: "Demo visitor", role: "owner" }];
  if (path === "/settings" && method === "PUT") { requireValue(typeof payload.name === "string" && payload.name.trim().length > 0 && payload.name.length <= 120, "ชื่อพื้นที่ทำงานต้องมี 1–120 ตัวอักษร"); requireValue(Number.isInteger(payload.alert_threshold_percent) && Number(payload.alert_threshold_percent) >= 5 && Number(payload.alert_threshold_percent) <= 100, "Alert threshold ต้องเป็น 5–100%"); state.workspace.name = payload.name; state.workspace.settings = { auto_refresh: Boolean(payload.auto_refresh), compact_table: Boolean(payload.compact_table), alert_threshold_percent: Number(payload.alert_threshold_percent) }; audit(state, "settings.updated", payload.name); return { message: "Settings saved." }; }
  throw new Error("ฟังก์ชันนี้ต้องใช้ระบบเต็มที่เชื่อม API และ PostgreSQL");
}
export const browserDemo = new BrowserDemo();

/** Download only: visitors explicitly upload these files through the normal flow. */
export function exampleCsv(actuals = false) {
  const headers = fields.join(","); const start = actuals ? "2026-10-01" : "2026-05-14"; const days = actuals ? 7 : 140;
  return headers + "\r\n" + Array.from({ length: days }, (_, i) => `${plusDay(start, i)},SKU-001,กรุงเทพฯ,${actuals ? 108 + i % 3 : 100 + i % 7 * 3},500`).join("\r\n") + "\r\n";
}
