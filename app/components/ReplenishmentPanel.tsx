"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Context } from "./LiveWorkspace";
import type { Product, Run, PlanningCalculation, Replenishment } from "../lib/workspace-types";
import { calculatePlanning } from "../lib/planning";
import { Button, EmptyState } from "./workspace-ui";

const number = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const statuses = { pending: "รอทบทวน", approved: "อนุมัติแผนแล้ว", dismissed: "ไม่ดำเนินการ" };

export function ReplenishmentPanel({ ctx, product, region, run, latestDate }: { ctx: Context; product: Product; region: string; run?: Run; latestDate?: string | null }) {
  const [incoming, setIncoming] = useState("0");
  const [note, setNote] = useState("");
  let calculation: PlanningCalculation | undefined;
  let problem = "สร้าง Forecast ปัจจุบันของสินค้าและพื้นที่นี้ก่อนวางแผน";
  if (run) {
    try { calculation = calculatePlanning(run, product, ctx.state.inventory.find(s => s.product_code === product.code && s.region === region), Number(incoming), ctx.state.info.data_version, latestDate); }
    catch (error) { problem = error instanceof Error ? error.message : "ข้อมูลวางแผนไม่ครบ"; }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!calculation || !run) return;
    await ctx.action(async () => {
      await ctx.rpc("/replenishments", { forecast_id: run.id, incoming_units: Number(incoming), note });
      setNote(""); ctx.notify("บันทึกแผนเติมสินค้าแล้ว กรุณาทบทวนก่อนนำไปจัดซื้อหรือผลิต"); ctx.refresh();
    });
  }
  const plans = ctx.state.plans.filter(p => p.calculation.product_code === product.code && p.calculation.region === region);
  return <section className="panel live-panel replenishment-panel">
    <div className="panel-heading"><div><span className="panel-kicker">Replenishment planning · {region}</span><h3>ควรเติมสินค้าเท่าไร?</h3></div></div>
    <p>สั่งเติมแบบรอบทบทวน: ต้องมีสินค้าพอขายระหว่างรอของ (Lead time) และจนถึงรอบสั่งครั้งถัดไป (รอบการสั่งซื้อ) บวก Safety stock แล้วหักสต็อกและสินค้าที่รอรับ</p>
    <form onSubmit={save} className="live-spacing">
      <label className="form-field"><span>สินค้าที่สั่งไว้แล้วและยืนยันว่าจะได้รับภายใน Lead time + รอบการสั่งซื้อ (ชิ้น)</span><input type="number" min="0" max="2147483647" step="1" required value={incoming} onChange={e => setIncoming(e.target.value)} disabled={!ctx.writer || ctx.busy}/></label>
      {calculation ? <>
        <div className="planning-result"><strong>{number(calculation.recommended_units)} <small>ชิ้นที่แนะนำให้เติม</small></strong><p>สูงสุดระหว่าง 0 กับ ⌈{number(calculation.protection_demand!)} + {number(calculation.safety_stock)} − {number(calculation.on_hand)} − {number(calculation.incoming_units)}⌉</p><p>ยอดขายคาดการณ์ {calculation.protection_days} วัน (Lead time {calculation.lead_time_days} + รอบสั่งซื้อ {calculation.review_period_days}) + Safety stock − สต็อก − สินค้ารอรับ</p></div>
        <p>Safety stock {number(calculation.safety_stock)} ชิ้น = ค่าที่มากกว่าระหว่างขั้นต่ำที่ตั้งไว้ ({number(calculation.safety_stock_minimum!)}) กับค่าจาก Forecast ({number(calculation.safety_stock_statistical!)} = z {calculation.z_score} × RMSE ย้อนหลัง {number(calculation.forecast_error_rmse!)} × √{calculation.protection_days} วัน) ที่ระดับการบริการ {calculation.service_level_percent}%</p>
        <p className="live-muted">ค่าจาก Forecast สมมติว่าความคลาดเคลื่อนแต่ละวันเป็นอิสระต่อกัน หากยอดขายมีช่วงพุ่งต่อเนื่องหลายวัน ควรตั้ง Safety stock ขั้นต่ำเพิ่ม</p>
        <p>สต็อก ณ {calculation.snapshot_date} · Forecast #{run!.id} จากข้อมูลถึง {calculation.origin} · ข้อมูลรุ่น {calculation.data_version}</p>
        <p>จุดสั่งเติม: {number(calculation.reorder_point)} ชิ้น = ยอดขายคาดการณ์ใน Lead time {calculation.lead_time_days} วัน ({number(calculation.lead_time_demand)}) + Safety stock ({number(calculation.safety_stock)})</p>
        {calculation.urgent ? <p className="live-error">สต็อกอาจไม่พอระหว่างรอสินค้า {calculation.lead_time_days} วัน ตรวจวันรับจริงและพิจารณาเร่งรับหรือโอนสินค้าก่อน ระบบยังไม่หักสินค้ารอรับในช่วง Lead time เพราะไม่มีวันรับที่ยืนยัน</p> : <p className="live-notice">สต็อกครอบคลุมยอดขายระหว่าง Lead time และ Safety stock ตาม Forecast รอบนี้</p>}
        <label className="form-field live-spacing"><span>เหตุผลและข้อกำหนดการรับสินค้า</span><textarea required maxLength={2000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น รอรับ 500 ชิ้นวันที่ ... และเติมส่วนที่เหลือให้พอถึงรอบสั่งครั้งถัดไป" disabled={!ctx.writer || ctx.busy}/></label>
        <Button type="submit" disabled={ctx.busy || !ctx.writer || !note.trim()}>บันทึกแผนเพื่อทบทวน</Button>
      </> : <EmptyState title="ยังคำนวณจำนวนเติมไม่ได้" detail={problem} action="สร้าง Forecast" onClick={() => ctx.navigate(`/forecast/new?product=${encodeURIComponent(product.code)}&region=${encodeURIComponent(region)}`)}/>}
    </form>
    <p className="live-muted">การอนุมัติบันทึกแผนและผู้ทบทวน สต็อกจะอัปเดตจากข้อมูลที่นำเข้าเมื่อรับสินค้าจริง กรุณาดำเนินการจัดซื้อหรือผลิตผ่านกระบวนการขององค์กร</p>
    <h3 className="live-spacing">ประวัติแผน · {region}</h3>
    {!plans.length && <p className="live-muted">ยังไม่มีแผนในพื้นที่นี้</p>}
    {plans.map(plan => <PlanReview key={plan.id} plan={plan} ctx={ctx}/>)}
  </section>;
}

function PlanReview({ plan, ctx }: { plan: Replenishment; ctx: Context }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("approved");
  async function review(event: FormEvent) {
    event.preventDefault();
    await ctx.action(async () => { await ctx.rpc(`/replenishments/${plan.id}/review`, { status, note }, "PUT"); ctx.notify("บันทึกผลทบทวนแผนเรียบร้อย"); ctx.refresh(); });
  }
  const member = (id: number | null) => ctx.state.members.find(m => m.id === id)?.username || `User #${id}`;
  return <details className="planning-history"><summary>แผน #{plan.id} · {number(plan.calculation.recommended_units)} ชิ้น · {statuses[plan.status]}{plan.stale && " · ข้อมูลเปลี่ยนแล้ว"}</summary>
    <p>{plan.note}</p><p>สร้างโดย {member(plan.created_by)} · {new Date(plan.created_at).toLocaleString("th-TH")} · Forecast #{plan.forecast_id}</p>
    <p>{plan.calculation.protection_demand!=null?`ยอดขาย ${plan.calculation.protection_days} วัน ${number(plan.calculation.protection_demand)}`:`Forecast ${number(plan.calculation.forecast_total)} (สูตรเดิม)`} + Safety {number(plan.calculation.safety_stock)} − สต็อก {number(plan.calculation.on_hand)} − รอรับ {number(plan.calculation.incoming_units)} · สต็อก ณ {plan.calculation.snapshot_date}</p>
    {plan.reviewed_at && <p>ทบทวนโดย {member(plan.reviewed_by)} · {new Date(plan.reviewed_at).toLocaleString("th-TH")}<br/>{plan.review_note}</p>}
    {plan.status === "pending" && ctx.writer && <form onSubmit={review} className="live-spacing"><label className="form-field"><span>ผลทบทวน</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="approved" disabled={plan.stale}>อนุมัติแผน</option><option value="dismissed">ไม่ดำเนินการ</option></select></label><label className="form-field live-spacing"><span>เหตุผลการทบทวน</span><textarea rows={2} maxLength={2000} required value={note} onChange={e => setNote(e.target.value)}/></label><Button type="submit" disabled={ctx.busy || !note.trim() || (plan.stale && status === "approved")}>บันทึกผลทบทวน</Button>{plan.stale && <p>ข้อมูลหรือนโยบายสินค้าเปลี่ยนแล้ว บันทึกแผนใหม่เพื่ออนุมัติ</p>}</form>}
  </details>;
}
