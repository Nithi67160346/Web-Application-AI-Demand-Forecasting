"use client";

import { useEffect, useState } from "react";
import type { Context } from "./LiveWorkspace";
import type { ProductSummary } from "../lib/workspace-types";
import type { TrendPoint } from "../lib/demo-data";
import { ForecastChart } from "./ForecastChart";
import { Button, DetailStat, EmptyState } from "./workspace-ui";
import { ReplenishmentPanel } from "./ReplenishmentPanel";
import "./storytelling.css";

const format = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const models: Record<string, string> = { last_value: "ยอดขายล่าสุด", weekday_mean: "รูปแบบยอดขายรายสัปดาห์", linear_trend: "แนวโน้มยอดขาย", annual_seasonal: "ฤดูกาลรายปี", ridge_lagged: "Ridge Regression · ML" };
const tabs = [{ id: "summary", title: "สรุปและตัดสินใจ" }, { id: "evidence", title: "ข้อมูลที่ใช้" }, { id: "metrics", title: "อ่านตัวเลขอย่างไร" }, { id: "team", title: "พื้นที่ทำงานและทีม" }];

export function StorytellingDashboard({ ctx }: { ctx: Context }) {
  const [tab, setTab] = useState("summary");
  const [code, setCode] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [loaded, setLoaded] = useState<{ version: number; summary: ProductSummary } | null>(null);
  const [error, setError] = useState("");
  const { state, rpc } = ctx;
  const product = state.products.find(p => p.code === code) || state.products[0];
  const latestRun = state.runs.find(r => r.product_code === product?.code && r.data_version === state.info.data_version);
  const region = selectedRegion || latestRun?.region || state.inventory.find(s => s.product_code === product?.code)?.region || state.dashboard.regions[0]?.region || "";
  const run = state.runs.find(r => r.product_code === product?.code && r.region === region && r.data_version === state.info.data_version);
  const summary = loaded?.version === state.info.data_version && loaded.summary.code === product?.code && loaded.summary.region === region ? loaded.summary : null;
  const productId = product?.id;
  const version = state.info.data_version;
  useEffect(() => {
    if (!productId || !region) return;
    let alive = true;
    async function load() {
      try { const summary = await rpc<ProductSummary>(`/products/${productId}/summary?region=${encodeURIComponent(region)}`); if (alive) { setLoaded({ version, summary }); setError(""); } }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้"); }
    }
    void load(); return () => { alive = false; };
  }, [productId, region, version, rpc]);
  const stock = summary?.inventory[0];
  const cover = stock && summary && summary.daily_average > 0 ? stock.inventory / summary.daily_average : null;
  const chart: TrendPoint[] = [];
  for (const rows of [summary?.trend || [], run?.points || []]) {
    for (let i = 0; i < rows.length; i += 7) {
      const slice = rows.slice(i, i + 7);
      const actual = "actual" in slice[0];
      const value = slice.reduce((sum, p) => sum + ("actual" in p ? p.actual ?? 0 : p.forecast), 0) / slice.length;
      chart.push({ label: slice[0].date.slice(5), [actual ? "actual" : "forecast"]: Math.round(value) });
    }
  }
  const newForecast = `/forecast/new?product=${encodeURIComponent(product?.code || "")}&region=${encodeURIComponent(region)}`;
  return <div className="page-content story-container">
    <header className="story-header-panel"><div className="story-header-content"><span className="story-badge">Story Dashboard · ข้อมูลรุ่น {version}</span><h2 className="story-header-title">จากยอดขาย สู่แผนเติมสินค้า</h2><p className="story-header-desc">เลือกสินค้าและพื้นที่เดียวกันเพื่ออ่านสต็อก ยอดขายคาดการณ์ และแผนเติม พร้อมหลักฐานที่ตรวจสอบได้</p><nav className="story-nav-tabs" aria-label="ส่วนของ Story Dashboard">{tabs.map(t => <button type="button" key={t.id} className={`story-tab-btn ${tab === t.id ? "is-active" : ""}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.title}</button>)}</nav></div></header>
    {!product ? <EmptyState title="เริ่มต้นจากข้อมูลของคุณ" detail="นำเข้ายอดขายและ Inventory แล้วสร้าง Forecast เพื่อแสดงเรื่องราวและแผนสินค้า" action="นำเข้าข้อมูล" onClick={() => ctx.navigate("/data/upload")}/> : <>
      <section className="panel live-panel story-selectors"><label className="form-field"><span>สินค้า</span><select aria-label="สินค้าในหน้าสรุป" value={product.code} onChange={e => { setCode(e.target.value); setSelectedRegion(""); }}>{state.products.map(p => <option key={p.id} value={p.code}>{p.name} · {p.code}</option>)}</select></label><label className="form-field"><span>พื้นที่ของตัวเลขทั้งหมด</span><select aria-label="พื้นที่ในหน้าสรุป" value={region} onChange={e => setSelectedRegion(e.target.value)}>{state.dashboard.regions.map(r => <option key={r.region}>{r.region}</option>)}</select></label><Button variant="secondary" onClick={() => ctx.navigate(`/products/${product.id}?region=${encodeURIComponent(region)}`)}>ดูรายละเอียดสินค้า</Button><Button onClick={() => ctx.navigate(newForecast)}>สร้าง Forecast</Button></section>
      {error && <p className="live-error" role="alert">{error}</p>}
      {!summary && !error && <p role="status">กำลังอ่านข้อมูลของ {product.code} · {region}...</p>}
      {tab === "summary" && <>
        <section className="detail-stat-grid"><DetailStat label="Current inventory" value={format(stock?.inventory)} suffix="ชิ้น" note={`${region} · Snapshot ${stock?.sale_date || "ยังไม่มี"}`} tone="blue"/><DetailStat label="Latest forecast" value={format(run?.total)} suffix="ชิ้น" note={run ? `${region} · ${run.horizon} วัน · ยอดขายคาดการณ์` : "ยังไม่มี Forecast ของข้อมูลปัจจุบัน"} tone="teal"/><DetailStat label="Holdout WAPE" value={run?.metrics.wape_percent == null ? "—" : `${format(run.metrics.wape_percent)}%`} suffix="" note="ความคลาดเคลื่อนทดสอบย้อนหลัง 28 วัน" tone="purple"/><DetailStat label="Inventory cover" value={format(cover)} suffix="วัน" note="สต็อก ÷ ยอดขายเฉลี่ย 30 วันล่าสุด" tone="orange"/></section>
        <article className="panel live-panel"><span className="panel-kicker">What the data says · {region}</span><h3>{product.name} มีสต็อกและแนวโน้มอย่างไร?</h3><p>ยอดขาย 30 วันล่าสุด {format(summary?.recent_sales)} ชิ้น ÷ 30 = {format(summary?.daily_average)} ชิ้น/วัน{stock && summary?.daily_average ? ` · สต็อก ${format(stock.inventory)} ÷ ${format(summary.daily_average)} = ${format(cover)} วัน` : " · ยังประเมินวันคงเหลือไม่ได้"}</p>{run ? <p>แบบจำลอง {models[run.model] || run.model} คาดยอดขาย {format(run.total)} ชิ้นใน {run.horizon} วัน จากข้อมูลถึง {run.origin}{run.change_percent != null && ` · เปลี่ยน ${format(run.change_percent)}% เทียบยอดขายเฉลี่ย 28 วันก่อนหน้า`} จำนวนนี้ใช้คำนวณความต้องการ และยังต้องหักสต็อกก่อนกำหนดจำนวนเติม</p> : <p>สร้าง Forecast ใหม่ของพื้นที่นี้ก่อนประเมินยอดขายข้างหน้า</p>}<p className="live-muted">ข้อมูลยอดขายบอกแนวโน้ม แต่ยังระบุสาเหตุ เช่น โรคระบาดหรือเหตุการณ์ภายนอกไม่ได้</p><ForecastChart units="units" unitsLabel="เฉลี่ยชิ้น/วัน (ช่วงละ 7 วัน)" markerLabel="Forecast" data={chart}/></article>
        <ReplenishmentPanel key={`${product.id}-${region}-${run?.id || 0}`} ctx={ctx} product={product} region={region} run={run} latestDate={summary?.last_date}/>
      </>}
      {tab === "evidence" && <section className="panel live-panel"><span className="panel-kicker">Traceable evidence</span><h3>ที่มาของตัวเลข · {product.code} / {region}</h3><dl className="story-evidence"><dt>ยอดขายล่าสุด</dt><dd>{summary?.last_date || "ยังไม่มี"}</dd><dt>Inventory snapshot</dt><dd>{stock ? `${format(stock.inventory)} ชิ้น ณ ${stock.sale_date}` : "ยังไม่มีข้อมูลสต็อก"}</dd><dt>Forecast ที่ใช้</dt><dd>{run ? `#${run.id} · ${run.origin} · ${run.horizon} วัน · ${models[run.model] || run.model}` : "ยังไม่มี"}</dd><dt>ข้อมูลรุ่นปัจจุบัน</dt><dd>{version}</dd><dt>ความคลาดเคลื่อน</dt><dd>{run ? `WAPE ${format(run.metrics.wape_percent)}% · MAE ${format(run.metrics.mae)} ชิ้น/วัน` : "ยังไม่ได้ทดสอบ"}</dd></dl><p>Inventory ใช้ snapshot ล่าสุดของสินค้านี้ในพื้นที่นี้ การวางแผนต้องมีสต็อกตรงกับวันที่ต้นกำเนิด Forecast และ Forecast ครอบคลุม Lead time</p><Button variant="secondary" onClick={() => ctx.navigate("/data/upload")}>ดูประวัติและนำเข้าข้อมูล</Button>{run && <Button variant="secondary" onClick={() => ctx.navigate(`/forecast/${run.id}`)}>ดู Forecast และผลทดสอบ</Button>}</section>}
      {tab === "metrics" && <section className="panel live-panel"><h3>อ่านตัวเลขและสูตรคำนวณ</h3><div className="data-table-wrap"><table className="data-table"><thead><tr><th>ตัวเลข</th><th>ความหมายและสูตร</th></tr></thead><tbody><tr><td>Current inventory</td><td>จำนวนคงคลังจาก snapshot ล่าสุดของสินค้าและพื้นที่ที่เลือก พร้อมวันที่</td></tr><tr><td>Latest forecast</td><td>ผลรวมยอดขายที่คาดการณ์ในวันที่พยากรณ์ทั้งหมด เป็นยอดขายในอนาคต</td></tr><tr><td>Holdout WAPE</td><td>Σ |ยอดจริง − ยอดคาดการณ์| ÷ Σ ยอดจริง × 100 · ทดสอบ 28 วันซึ่งไม่ได้ใช้เลือกโมเดล · ยิ่งต่ำยิ่งดี; ไม่ใช่เปอร์เซ็นต์ความแม่นยำ</td></tr><tr><td>Inventory cover</td><td>สต็อก ÷ (ยอดขาย 30 วันล่าสุด ÷ 30) · ถ้าไม่มีสต็อกหรือยอดเฉลี่ยเป็นศูนย์จะแสดง —</td></tr><tr><td>จำนวนควรเติม</td><td>max(0, ปัดขึ้น(Forecast + Safety stock − สต็อก − สินค้าที่รอรับภายในช่วง Forecast))</td></tr><tr><td>จุดสั่งเติม</td><td>ปัดขึ้น(ยอดขายคาดการณ์ระหว่าง Lead time + Safety stock) · ถ้าสต็อกต่ำกว่านี้ต้องตรวจความเสี่ยงระหว่างรอรับ</td></tr></tbody></table></div><p>Lead time และ Safety stock ตั้งค่าได้ในรายละเอียดสินค้า ปรับสินค้ารอรับและบันทึกเหตุผลในแผนก่อนอนุมัติ</p></section>}
      {tab === "team" && <section className="panel live-panel"><h3>{state.info.name}</h3><p>สิทธิ์ปัจจุบัน: {state.info.role} · {state.members.length} สมาชิก</p><div className="data-table-wrap"><table className="data-table"><thead><tr><th>ผู้ใช้</th><th>สิทธิ์</th></tr></thead><tbody>{state.members.map(m => <tr key={m.id}><td>{m.username}</td><td>{m.role}</td></tr>)}</tbody></table></div><p>แผนบันทึกผู้สร้าง ผู้ทบทวน และเวลาที่ดำเนินการ ดูประวัติได้ในส่วนแผนเติมสินค้าและ Monitoring</p><Button variant="secondary" onClick={() => ctx.navigate("/settings")}>ตั้งค่าพื้นที่ทำงาน</Button></section>}
    </>}
  </div>;
}
