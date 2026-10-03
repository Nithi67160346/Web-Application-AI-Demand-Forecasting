"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { workspaceRequest, downloadForecast } from "../lib/api";
import type { AuthUser } from "../lib/api";
import type { AppView } from "../forecast-app";
import "./operational.css";

type Workspace = { id: number; name: string; role: string; data_version: number; settings: { auto_refresh?: boolean; compact_table?: boolean; alert_threshold_percent?: number }; workspaces: {id: number; name: string; role: string}[] };
type Product = { id: number; code: string; name: string; lead_time_days: number; safety_stock: number };
type Point = { date: string; forecast: number; baseline?: number; lower?: number; upper?: number; actual?: number };
type Metrics = { mae: number; wape_percent: number | null; bias: number };
type Run = { id: number; product_code: string; region: string; model: string; total: number; origin: string; horizon: number; data_version: number; created_at: string; points: Point[]; history: {date: string; actual: number}[]; backtest: Point[]; metrics: Metrics; change_percent: number | null; signals: string[]; selection_mae: Record<string, number>; missing_days_filled_zero: number; interval_method: string; metric_scope: string; signal_source: string };
type Alert = { id: number; forecast_id: number; level: string; message: string; review_status: string; review_note: string | null; reviewed_by: number | null; reviewed_at: string | null; stale: boolean };
type Report = { total_rows: number; valid_rows: number; invalid_rows: number; exact_duplicate_rows: number; missing_inventory: number; quality_percent: number; start_date: string; end_date: string; errors: {row: number; error: string}[]; preview: Record<string, string | number | null>[] };
type Job = { id: number; filename: string; status: string; report: Report; created_at: string };
type Dataset = { id: string; filename: string; rows: number };
type Dashboard = { records: number; last_date: string | null; recent_sales: number; pending_alerts: number; data_version: number; products: {code: string; quantity: number}[]; regions: {region: string; quantity: number}[]; trend: {date: string; actual: number}[]; latest_forecast: Run | null };
type Inventory = { product_code: string; region: string; sale_date: string; inventory: number };
type Monitor = { runs: {id: number; product_code: string; region: string; stale: boolean; lineage_changed: boolean; holdout: Metrics; live_metrics: Metrics | null; matched_days: number; actual_vs_forecast: Point[]; backtest: Point[]}[]; events: {action: string; detail: string; created_at: string}[] };
type Member = { id: number; username: string; role: string };
type Preview = { headers: string[]; total_rows: number; preview: Record<string, string>[]; suggested_mapping: Record<string, string> };
type QueryResult = {items: Record<string, string | number | null>[]; query_ms: number; plan: unknown; note: string};
const fields = ["sale_date", "product_code", "region", "sales_quantity", "inventory"];
const menu: {view: AppView; name: string; path: string}[] = [
  {view:"dashboard", name:"Dashboard",path:"/dashboard"}, {view:"data", name:"นำเข้าข้อมูล",path:"/data/upload"},
  {view:"forecast", name:"Forecast",path:"/forecast/new"}, {view:"products", name:"สินค้า / สต็อก",path:"/products"},
  {view:"alerts", name:"Alerts / Review",path:"/alerts"}, {view:"monitoring", name:"Monitoring",path:"/monitoring"},
  {view:"settings", name:"Workspace / ทีม",path:"/settings"},
];
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("th-TH", {maximumFractionDigits: 2});

function Table({rows}: {rows: Record<string, string | number | null>[]}) {
  if (!rows.length) return <p className="op-empty">ยังไม่มีข้อมูล</p>;
  const keys = Object.keys(rows[0]);
  return <div className="op-table-wrap"><table><thead><tr>{keys.map(key=><th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{keys.map(key=><td key={key}>{row[key] == null ? "—" : String(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

function Chart({actual, forecast}: {actual: {date:string; actual:number}[]; forecast: Point[]}) {
  const historical = actual.slice(-30);
  const points = [...historical.map(p=>({date:p.date, value:p.actual, predicted:false, lower:undefined as number | undefined, upper:undefined as number | undefined})),
    ...forecast.map(p=>({date:p.date, value:p.forecast, predicted:true, lower:p.lower, upper:p.upper}))];
  if (!points.length) return <p className="op-empty">นำเข้าข้อมูลเพื่อแสดงกราฟ</p>;
  const max = Math.max(1,...points.map(p=>p.upper ?? p.value));
  const x = (i:number) => 40 + i * 840 / Math.max(1,points.length-1);
  const y = (v:number) => 230-v/max*200;
  const line = (predicted:boolean) => points.map((p,i)=>p.predicted===predicted ? `${x(i)},${y(p.value)}` : "").filter(Boolean).join(" ");
  const future = points.map((p,i)=>({...p,i})).filter(p=>p.predicted);
  const band = [...future.map(p=>`${x(p.i)},${y(p.upper??p.value)}`),...future.slice().reverse().map(p=>`${x(p.i)},${y(p.lower??p.value)}`)].join(" ");
  return <div className="op-chart"><svg viewBox="0 0 920 280" role="img" aria-label="Actual and forecast in units with empirical uncertainty interval">
    {[0,.5,1].map(v=><g key={v}><line x1="40" x2="880" y1={y(v*max)} y2={y(v*max)} stroke="#e2e8f0"/><text x="0" y={y(v*max)+4} fontSize="11">{number(v*max)}</text></g>)}
    {future.length>0 && <><polygon points={band} fill="#14b8a6" opacity=".15"/><line x1={x(historical.length-1)} x2={x(historical.length-1)} y1="20" y2="240" stroke="#94a3b8" strokeDasharray="4"/></>}
    <polyline points={line(false)} fill="none" stroke="#2563eb" strokeWidth="3"/><polyline points={line(true)} fill="none" stroke="#0d9488" strokeWidth="3"/>
    <text x="40" y="266" fontSize="12">{points[0].date}</text><text x="720" y="266" fontSize="12">{points[points.length-1].date}</text>
    {points.map((p,i)=><circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill={p.predicted?"#0d9488":"#2563eb"}><title>{p.date}: {number(p.value)} units</title></circle>)}
  </svg><p>สีน้ำเงิน: Actual · สีเขียว: Forecast · พื้นที่สีจาง: ช่วงความไม่แน่นอนจาก holdout · หน่วย: ชิ้น</p></div>;
}

function Result({run, exportRun}: {run: Run; exportRun: () => void}) {
  return <section className="op-card"><div className="op-row"><h2>Forecast #{run.id} · {run.product_code} / {run.region}</h2><button onClick={exportRun}>ดาวน์โหลด CSV</button></div>
    <div className="op-kpis"><div><small>Forecast {run.horizon} วัน</small><strong>{number(run.total)}</strong></div><div><small>เปลี่ยนจากค่าเฉลี่ย 28 วัน</small><strong>{number(run.change_percent)}%</strong></div><div><small>Holdout WAPE</small><strong>{number(run.metrics.wape_percent)}%</strong></div><div><small>Holdout MAE / วัน</small><strong>{number(run.metrics.mae)}</strong></div></div>
    <p>Model: <b>{run.model}</b> · พยากรณ์จากวันสุดท้ายของข้อมูล {run.origin} · Data version {run.data_version}</p>
    <Chart actual={run.history} forecast={run.points}/>
    <details><summary>วิธีประเมินและสัญญาณจำลอง</summary><p>เลือกโมเดลด้วย validation ย้อนหลัง 2 ช่วง ช่วงละ 28 วัน; ประเมินอีก 28 วันท้ายที่ไม่ใช้เลือกโมเดล ค่า WAPE ต่ำแปลว่าคลาดเคลื่อนน้อย ไม่ใช่เปอร์เซ็นต์ความมั่นใจ</p><p>{run.metric_scope}</p><p>{run.interval_method}</p><p>สัญญาณ: {run.signals.join(", ") || "ไม่มี"} · {run.signal_source}</p><p>วันขาดหายเติมศูนย์: {run.missing_days_filled_zero}</p><pre>{JSON.stringify(run.selection_mae,null,2)}</pre></details>
  </section>;
}

export function OperationalWorkspace({token,user,view,onNavigate,onLogout,onChangePassword}: {
  token:string; user:AuthUser; view:AppView; onNavigate:(path:string)=>void; onLogout:()=>void; onChangePassword:(values:{current_password:string;new_password:string})=>Promise<void>;
}) {
  const [workspaceId,setWorkspaceId]=useState<number|null>(null);
  const [info,setInfo]=useState<Workspace|null>(null);
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [products,setProducts]=useState<Product[]>([]);
  const [inventory,setInventory]=useState<Inventory[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [datasets,setDatasets]=useState<Dataset[]>([]);
  const [monitor,setMonitor]=useState<Monitor>({runs:[],events:[]});
  const [members,setMembers]=useState<Member[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [reload,setReload]=useState(0);
  const [file,setFile]=useState<{filename:string;content_base64:string}|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [mapping,setMapping]=useState<Record<string,string>>({});
  const [job,setJob]=useState<Job|null>(null);
  const [replace,setReplace]=useState(false);
  const [duplicates,setDuplicates]=useState(false);
  const [code,setCode]=useState("");
  const [region,setRegion]=useState("");
  const [horizon,setHorizon]=useState(30);
  const [asOf,setAsOf]=useState("");
  const [signals,setSignals]=useState<string[]>([]);
  const [missing,setMissing]=useState(false);
  const [selectedRun,setSelectedRun]=useState<Run|null>(null);
  const [query,setQuery]=useState<QueryResult|null>(null);
  const [filter,setFilter]=useState("");
  const [workspaceName,setWorkspaceName]=useState("");
  const [refreshEnabled,setRefreshEnabled]=useState(true);
  const [compact,setCompact]=useState(false);
  const [threshold,setThreshold]=useState(15);
  const [memberName,setMemberName]=useState("");
  const [memberRole,setMemberRole]=useState("planner");
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const writer = !!info && info.role!=="viewer";
  const manager = info?.role==="owner" || info?.role==="admin";
  const rpc=<T,>(path:string,body?:unknown,method?:string)=>workspaceRequest<T>(token,workspaceId,path,body,method);

  useEffect(()=>{
    let alive=true; const controller=new AbortController();
    async function load() {
      try {
        const w=await workspaceRequest<Workspace>(token,workspaceId,"",undefined,undefined,controller.signal);
        if(alive)setLoading(true);
        const call=<T,>(path:string)=>workspaceRequest<T>(token,w.id,path,undefined,undefined,controller.signal);
        const [d,p,i,f,a,j,s,m,t]=await Promise.all([call<Dashboard>("/dashboard"),call<Product[]>("/products"),call<Inventory[]>("/inventory"),call<Run[]>("/forecasts"),call<Alert[]>("/alerts"),call<Job[]>("/imports"),call<Dataset[]>("/datasets"),call<Monitor>("/monitoring"),call<Member[]>("/members")]);
        if(!alive)return;
        setInfo(w);setDashboard(d);setProducts(p);setInventory(i);setRuns(f);setAlerts(a);setJobs(j);setDatasets(s);setMonitor(m);setMembers(t);
        setWorkspaceName(w.name);setRefreshEnabled(w.settings.auto_refresh??true);setCompact(w.settings.compact_table??false);setThreshold(w.settings.alert_threshold_percent??15);
        setCode(current=>p.some(item=>item.code===current)?current:p[0]?.code??"");setRegion(current=>d.regions.some(item=>item.region===current)?current:d.regions[0]?.region??"");setError("");
      } catch(e) {if(alive)setError(e instanceof Error?e.message:"โหลดข้อมูลไม่ได้");} finally {if(alive)setLoading(false);}
    }
    void load(); return ()=>{alive=false;controller.abort();};
  },[token,workspaceId,reload]);

  useEffect(()=>{
    if(!info?.settings.auto_refresh)return;
    const timer=setInterval(()=>setReload(v=>v+1),15*60*1000);return()=>clearInterval(timer);
  },[info?.settings.auto_refresh]);

  async function action(work:()=>Promise<void>) {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {await work();} catch(e) {setError(e instanceof Error?e.message:"เกิดข้อผิดพลาด");} finally {setBusy(false);}
  }
  function switchWorkspace(value:string) {
    setLoading(true);
    setWorkspaceId(Number(value));setJob(null);setFile(null);setPreview(null);setSelectedRun(null);setQuery(null);setNotice("");
  }
  async function pickFile(selected:File|undefined) {
    if(!selected)return;
    await action(async()=>{
      if(selected.size>20*1024*1024)throw new Error("ไฟล์ต้องไม่เกิน 20 MB");
      const content=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("อ่านไฟล์ไม่ได้"));reader.readAsDataURL(selected);});
      const payload={filename:selected.name,content_base64:content};setFile(payload);setJob(null);
      const p=await rpc<Preview>("/imports/preview",payload);setPreview(p);setMapping(p.suggested_mapping);setDuplicates(false);
    });
  }
  async function validate() {if(file)await action(async()=>{setJob(await rpc<Job>("/imports/validate",{...file,mapping}));setNotice("ตรวจทุกแถวแล้ว กรุณาตรวจรายงานก่อนบันทึก");});}
  async function loadDataset(id:string) {await action(async()=>{setFile(null);setPreview(null);setJob(await rpc<Job>(`/datasets/${id}/validate`,{}));setDuplicates(false);setNotice("Dataset จำลองผ่านการตรวจแล้ว เลือกเพิ่มข้อมูลหรือแทนที่ชุดเดิมก่อนบันทึก");});}
  async function commit() {if(job)await action(async()=>{const result=await rpc<Job>(`/imports/${job.id}/commit`,{mode:replace?"replace":"append",acknowledge_duplicates:duplicates});setJob(result);setNotice(`บันทึก ${number(result.report.valid_rows)} แถวแล้ว`);setReload(v=>v+1);});}
  async function runForecast(event:FormEvent) {event.preventDefault();await action(async()=>{const result=await rpc<Run>("/forecasts",{product_code:code,region,horizon,signals,acknowledge_missing_days:missing,as_of:asOf||null});setSelectedRun(result);setNotice(`Forecast #${result.id} คำนวณและบันทึกแล้ว`);setReload(v=>v+1);});}
  async function saveProduct(event:FormEvent<HTMLFormElement>,product:Product) {
    event.preventDefault();const form=new FormData(event.currentTarget);await action(async()=>{await rpc(`/products/${product.id}`,{name:form.get("name"),lead_time_days:Number(form.get("lead")),safety_stock:Number(form.get("stock"))},"PUT");setNotice("บันทึกสินค้าแล้ว");setReload(v=>v+1);});
  }
  async function review(event:FormEvent<HTMLFormElement>,alert:Alert) {
    event.preventDefault();const form=new FormData(event.currentTarget);await action(async()=>{await rpc(`/alerts/${alert.id}/review`,{status:form.get("status"),note:form.get("note")},"PUT");setNotice("บันทึกผู้ทบทวนและเหตุผลแล้ว");setReload(v=>v+1);});
  }
  async function exportRun(run:Run) {await action(async()=>{await downloadForecast(token,info!.id,run.id);});}
  async function saveSettings(event:FormEvent) {event.preventDefault();await action(async()=>{await rpc("/settings",{name:workspaceName,auto_refresh:refreshEnabled,compact_table:compact,alert_threshold_percent:threshold},"PUT");setNotice("บันทึกการตั้งค่าลงฐานข้อมูลแล้ว");setReload(v=>v+1);});}
  async function saveMember(event:FormEvent) {event.preventDefault();await action(async()=>{await rpc("/members",{username:memberName,role:memberRole},"PUT");setMemberName("");setNotice("บันทึกสมาชิกแล้ว");setReload(v=>v+1);});}

  return <div className={`op-app ${compact?"op-compact":""}`}>
    <aside className="op-sidebar"><a className="op-brand" href="/dashboard" onClick={e=>{e.preventDefault();onNavigate("/dashboard");}}>Demandly<span>Mock Data Workspace</span></a><nav>{menu.map(item=><button key={item.view} className={view===item.view?"active":""} onClick={()=>onNavigate(item.path)}>{item.name}</button>)}</nav><div className="op-user"><strong>{user.full_name||user.username}</strong><small>{info?.role||"กำลังโหลดสิทธิ์"}</small><button onClick={onLogout} disabled={busy}>ออกจากระบบ</button></div></aside>
    <main className="op-main"><header className="op-header"><div><small>ข้อมูลจำลอง · ประมวลผลและบันทึกจริง</small><h1>{menu.find(item=>item.view===view)?.name||"Workspace"}</h1></div><div className="op-row"><select aria-label="เลือก workspace" value={info?.id??""} onChange={e=>switchWorkspace(e.target.value)} disabled={busy||loading}>{info?.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button onClick={()=>setReload(v=>v+1)} disabled={busy||loading}>รีเฟรช</button></div></header>
      <p className="op-source">ชุดข้อมูลและ disease/policy/population เป็น mock · Forecast เป็นโมเดลสถิติที่คำนวณจากข้อมูลที่นำเข้า · ยังไม่ใช่การพิสูจน์ความแม่นยำกับธุรกิจจริง</p>
      {error&&<div className="op-error" role="alert">{error}<button onClick={()=>setReload(v=>v+1)}>ลองใหม่</button></div>}{notice&&<div className="op-notice" role="status">{notice}</div>}{busy&&<div className="op-notice" role="status">กำลังประมวลผล กรุณารอจนเสร็จ ไม่ต้องกดซ้ำ</div>}
      {loading?<section className="op-card" role="status">กำลังโหลดข้อมูลจากฐานข้อมูล...</section>:<>
      {view==="dashboard"&&dashboard&&<>
        <div className="op-kpis"><div><small>ข้อมูลยอดขายใน DB</small><strong>{number(dashboard.records)}</strong><span>แถว</span></div><div><small>ยอดขาย 30 วันล่าสุดของข้อมูล</small><strong>{number(dashboard.recent_sales)}</strong><span>ถึง {dashboard.last_date||"ยังไม่มีข้อมูล"}</span></div><div><small>Alerts ที่ยังไม่ทบทวน</small><strong>{dashboard.pending_alerts}</strong></div><div><small>Data version</small><strong>{dashboard.data_version}</strong></div></div>
        {!dashboard.records?<section className="op-card"><h2>เริ่มต้นด้วย dataset จำลอง</h2><p>เลือก 1 ใน 5 สถานการณ์ หรืออัปโหลดไฟล์เอง ข้อมูลจะแยกตาม Workspace</p><button onClick={()=>onNavigate("/data/upload")}>นำเข้าข้อมูล</button></section>:<section className="op-card"><h2>ยอดขายรายวันจริงใน DB</h2><Chart actual={dashboard.trend} forecast={[]}/></section>}
        <div className="op-grid"><section className="op-card"><h2>ยอดขายตามสินค้า</h2><Table rows={dashboard.products}/></section><section className="op-card"><h2>ยอดขายตามภูมิภาค</h2><Table rows={dashboard.regions}/></section></div>
        {dashboard.latest_forecast&&<Result run={dashboard.latest_forecast} exportRun={()=>void exportRun(dashboard.latest_forecast!)}/>}
      </>}
      {view==="data"&&<>
        <section className="op-card"><h2>1. เลือกข้อมูลจำลอง</h2><p>ชุด 01–04 เป็นยอดขายรายวัน ชุด 05 เป็นรายการธุรกรรม 200,000 แถว ไม่รวม inventory ซ้ำเป็นยอดสต็อก</p><div className="op-datasets">{datasets.map(d=><button key={d.id} disabled={!writer||busy} onClick={()=>void loadDataset(d.id)}><b>{d.filename}</b><span>{number(d.rows)} แถว · {d.id}</span></button>)}</div></section>
        <section className="op-card"><h2>หรืออัปโหลด CSV / Excel</h2><p>UTF-8 CSV หรือ .xlsx แผ่นงานแรก · สูงสุด 20 MB / 250,000 แถว · ไม่รองรับ .xls</p><input type="file" accept=".csv,.xlsx" disabled={!writer||busy} onChange={e=>void pickFile(e.target.files?.[0])}/>
          {preview&&<><h3>2. Preview · {number(preview.total_rows)} แถว</h3><Table rows={preview.preview}/><h3>3. Column mapping</h3><div className="op-form-grid">{fields.map(field=><label key={field}>{field}{field!=="inventory"&&" *"}<select value={mapping[field]||""} onChange={e=>{setMapping({...mapping,[field]:e.target.value});setJob(null);}}><option value="">{field==="inventory"?"ไม่มี inventory":"เลือกคอลัมน์"}</option>{preview.headers.map(h=><option key={h}>{h}</option>)}</select></label>)}</div><button disabled={busy||!writer} onClick={()=>void validate()}>ตรวจคุณภาพทุกแถว</button></>}
        </section>
        {job&&<section className="op-card"><h2>4. Data quality · {job.filename}</h2><div className="op-kpis"><div><small>แถวทั้งหมด</small><strong>{number(job.report.total_rows)}</strong></div><div><small>แถวไม่ถูกต้อง</small><strong>{number(job.report.invalid_rows)}</strong></div><div><small>แถวเหมือนกันทุกค่า</small><strong>{number(job.report.exact_duplicate_rows)}</strong></div><div><small>ผ่าน validation</small><strong>{number(job.report.quality_percent)}%</strong></div></div><p>{job.report.start_date} ถึง {job.report.end_date} · Inventory ว่าง {number(job.report.missing_inventory)} แถว</p><Table rows={job.report.preview}/>{job.report.errors.length>0&&<><h3>ข้อผิดพลาด (แสดงสูงสุด 100)</h3><Table rows={job.report.errors}/></>}
          <p>ไม่ลบรายการซ้ำอัตโนมัติ เพราะอาจเป็นธุรกรรมคนละรายการ กรณีต้องการลบซ้ำให้แก้ไฟล์ต้นทางแล้วตรวจใหม่</p>
          <label className="op-check"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)} disabled={busy||job.status==="committed"}/> แทนที่ยอดขายเดิมทั้งหมดของ Workspace ด้วยชุดนี้ (Forecast เดิมจะเก็บไว้และแสดงว่าใช้ข้อมูลรุ่นเก่า)</label>
          {!!job.report.exact_duplicate_rows&&<label className="op-check"><input type="checkbox" checked={duplicates} onChange={e=>setDuplicates(e.target.checked)}/> ยืนยันว่าแถวซ้ำเป็นรายการที่ต้องการเก็บ</label>}
          <button disabled={busy||!writer||!!job.report.invalid_rows||job.status==="committed"||!!job.report.exact_duplicate_rows&&!duplicates} onClick={()=>void commit()}>{job.status==="committed"?"บันทึกแล้ว":replace?"บันทึกและแทนที่ชุดเดิม":"บันทึกเพิ่มในฐานข้อมูล"}</button>
        </section>}
        <section className="op-card"><h2>ประวัติการนำเข้า</h2><Table rows={jobs.map(j=>({id:j.id,file:j.filename,status:j.status,rows:j.report.valid_rows,created_at:j.created_at}))}/></section>
        <section className="op-card"><h2>ทดลอง Query / Index</h2><p>เลือกสินค้าและภูมิภาคเพื่อดู query plan จริงของ PostgreSQL; เปรียบเทียบก่อน/หลัง index ใน indexing-lab</p><div className="op-row"><select value={code} onChange={e=>setCode(e.target.value)}><option value="">ทุกสินค้า</option>{products.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select><select value={region} onChange={e=>setRegion(e.target.value)}><option value="">ทุกภูมิภาค</option>{dashboard?.regions.map(r=><option key={r.region}>{r.region}</option>)}</select><button disabled={busy} onClick={()=>void action(async()=>{const params=new URLSearchParams();if(code)params.set("product_code",code);if(region)params.set("region",region);setQuery(await rpc<QueryResult>(`/sales/query?${params}`));})}>Query</button></div>{query&&<><p>Database query: {number(query.query_ms)} ms · {query.note}</p><Table rows={query.items}/><details><summary>EXPLAIN ANALYZE / BUFFERS</summary><pre>{JSON.stringify(query.plan,null,2)}</pre></details></>}</section>
      </>}
      {view==="forecast"&&<>
        <form className="op-card" onSubmit={runForecast}><h2>สร้าง Forecast จากยอดขายใน DB</h2><div className="op-form-grid"><label>สินค้า<select required value={code} onChange={e=>setCode(e.target.value)}><option value="">เลือกสินค้า</option>{products.map(p=><option key={p.code} value={p.code}>{p.name} · {p.code}</option>)}</select></label><label>ภูมิภาค<select required value={region} onChange={e=>setRegion(e.target.value)}><option value="">เลือกภูมิภาค</option>{dashboard?.regions.map(r=><option key={r.region}>{r.region}</option>)}</select></label><label>ระยะพยากรณ์ (7–90 วัน)<input type="number" min="7" max="90" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} required/></label></div>
          <label>พยากรณ์ ณ วันที่ (เว้นว่างใช้วันล่าสุดของข้อมูล)<input type="date" value={asOf} max={dashboard?.last_date||undefined} onChange={e=>setAsOf(e.target.value)}/></label><p>ใช้วันที่ 2026-07-12 กับชุด demand_spike เพื่อทดลองเตือนช่วงความต้องการเพิ่ม ระบบจะไม่ใช้ยอดขายหลังวันที่เลือกในการฝึก</p><p>โมเดลจะเลือก last value, weekday mean, linear trend หรือ annual seasonal เมื่อมีประวัติเพียงพอ ต้องมีข้อมูลอย่างน้อย 112 วันปฏิทินและ 56 วันที่มียอดขาย</p>
          <div className="op-row">{["disease","policy","population"].map(s=><label className="op-check" key={s}><input type="checkbox" checked={signals.includes(s)} onChange={()=>setSignals(current=>current.includes(s)?current.filter(v=>v!==s):[...current,s])}/>{s} (mock)</label>)}</div><p>Mock disease: +15% ใน ก.ค.–ส.ค.; policy: +5%; population: +2% เป็นสมมติฐานที่ปรับผล baseline ไม่ใช่ข้อมูลภายนอกจริง</p>
          <label className="op-check"><input type="checkbox" checked={missing} onChange={e=>setMissing(e.target.checked)}/> หากมีวันที่ขาดหาย ยืนยันให้ตีความเป็นยอดขายศูนย์</label>
          <button disabled={busy||!writer||!products.length}>คำนวณและบันทึก Forecast</button>
        </form>
        {selectedRun&&<Result run={selectedRun} exportRun={()=>void exportRun(selectedRun)}/>}
        <section className="op-card"><h2>ประวัติ Forecast / Re-forecast</h2>{runs.length?runs.map(run=><div className="op-history" key={run.id}><div><b>#{run.id} {run.product_code} / {run.region}</b><p>{run.created_at} · {run.model} · {run.horizon} วัน · {run.data_version!==info?.data_version?"ข้อมูลรุ่นเก่า":"ข้อมูลรุ่นปัจจุบัน"}</p></div><button onClick={()=>setSelectedRun(run)}>ดูผล</button><button disabled={busy||!writer} onClick={()=>{setCode(run.product_code);setRegion(run.region);setHorizon(run.horizon);setSignals(run.signals);setSelectedRun(null);setNotice("โหลดค่ารอบเดิมแล้ว กดคำนวณเพื่อใช้ข้อมูลล่าสุด");}}>ตั้งค่า Re-forecast</button></div>):<p className="op-empty">ยังไม่มี Forecast</p>}</section>
      </>}
      {view==="products"&&<>
        <section className="op-card"><h2>สินค้า / Lead time / Safety stock</h2><input placeholder="ค้นหาสินค้า" aria-label="ค้นหาสินค้า" value={filter} onChange={e=>setFilter(e.target.value)}/>{products.filter(p=>(p.name+p.code).toLowerCase().includes(filter.toLowerCase())).map(p=><form className="op-product" key={`${p.id}-${p.name}-${p.lead_time_days}-${p.safety_stock}`} onSubmit={e=>void saveProduct(e,p)}><b>{p.code}</b><label>ชื่อ<input name="name" defaultValue={p.name} maxLength={120} required/></label><label>Lead time (วัน)<input type="number" name="lead" min="1" max="365" defaultValue={p.lead_time_days} required/></label><label>Safety stock<input type="number" name="stock" min="0" defaultValue={p.safety_stock} required/></label><button disabled={!writer||busy}>บันทึก</button></form>)}{!products.length&&<p>สินค้าเพิ่มอัตโนมัติเมื่อนำเข้าข้อมูล</p>}</section>
        <section className="op-card"><h2>Inventory snapshot ล่าสุดต่อสินค้า / ภูมิภาค</h2><p>เป็น snapshot ณ วันที่ระบุ ไม่ใช่ยอดสต็อกแบบ real-time และไม่ใช่ผลรวม inventory ของทุกรายการ</p><Table rows={inventory}/></section>
      </>}
      {view==="alerts"&&<section className="op-card"><h2>Alerts และการทบทวน</h2><p>บันทึกผู้ทบทวน วันเวลา และเหตุผลลง DB การอนุมัติเป็นบันทึกการตัดสินใจ ไม่ได้ส่งคำสั่งผลิตอัตโนมัติ</p>{!alerts.length&&<p className="op-empty">ยังไม่มี Alert · ระบบจะสร้างเมื่อ Forecast พบความเปลี่ยนแปลง ความเสี่ยง stock หรือ error สูง</p>}{alerts.map(a=><article className={`op-alert ${a.stale?"op-stale":""}`} key={a.id}><div className="op-row"><span className={`op-level ${a.level.toLowerCase()}`}>{a.level}</span><b>Alert #{a.id} / Forecast #{a.forecast_id}</b><span>{a.stale?"ข้อมูลรุ่นเก่า":a.review_status}</span></div><p>{a.message}</p>{a.reviewed_at&&<p>ทบทวนโดย User #{a.reviewed_by} · {a.reviewed_at} · {a.review_note}</p>}<form className="op-row" onSubmit={e=>void review(e,a)}><select name="status" defaultValue={a.review_status}><option value="pending">รอทบทวน</option><option value="approved">รับทราบ / อนุมัติ</option><option value="dismissed">ไม่ดำเนินการ</option></select><input name="note" placeholder="เหตุผลประกอบการทบทวน" maxLength={2000} defaultValue={a.review_note||""} required/><button disabled={busy||!writer}>บันทึก Review</button><button type="button" onClick={()=>{setSelectedRun(runs.find(r=>r.id===a.forecast_id)||null);onNavigate("/forecast");}}>ดู Forecast</button></form></article>)}</section>}
      {view==="monitoring"&&<>
        <section className="op-card"><h2>Actual vs Forecast</h2><p>Holdout เป็นการทดสอบย้อนหลัง ส่วน Live metrics จะปรากฏเมื่อเพิ่มยอดขายในวันที่พยากรณ์แล้ว ไม่มี Actual ใหม่จะแสดงรอข้อมูล ไม่สร้างตัวเลขแทน</p>{!monitor.runs.length&&<p className="op-empty">ยังไม่มี Forecast สำหรับติดตาม</p>}{monitor.runs.map(r=><details key={r.id} className="op-monitor"><summary>#{r.id} {r.product_code} / {r.region} · Holdout WAPE {number(r.holdout.wape_percent)}% · Actual ใหม่ {r.matched_days} วัน {r.stale&&"· ข้อมูลรุ่นเก่า"}</summary>{r.live_metrics?<><p>Live WAPE {number(r.live_metrics.wape_percent)}% · MAE {number(r.live_metrics.mae)}</p><Table rows={r.actual_vs_forecast.map(p=>({date:p.date,actual:p.actual??null,forecast:p.forecast}))}/></>:<p>{r.lineage_changed?"ชุดข้อมูลถูกแทนที่แล้ว จึงไม่เทียบกับ Actual ของชุดใหม่":"รอเพิ่มยอดขายหลังวันต้นกำเนิด Forecast"}</p>}<button disabled={busy||!writer||r.lineage_changed} onClick={()=>void action(async()=>{const result=await rpc<{inserted:number}>("/integrations/mock-erp-sync",{forecast_id:r.id,days:7});setNotice(`เพิ่ม Actual จำลองจาก mock ERP ${result.inserted} วันแล้ว`);setReload(v=>v+1);})}>จำลอง Actual 7 วันจาก Mock ERP</button><p>ปุ่มนี้สร้างยอดขายจำลองใหม่ใน DB เพื่อทดลอง Monitor/Re-forecast ไม่ใช่ข้อมูลจาก ERP จริง และไม่เพิ่มวันที่มีข้อมูลอยู่แล้ว</p><h3>Holdout Actual vs Forecast</h3><Table rows={r.backtest.map(p=>({date:p.date,actual:p.actual??null,forecast:p.forecast}))}/></details>)}</section>
        <section className="op-card"><h2>Activity / Audit trail</h2><Table rows={monitor.events}/></section>
      </>}
      {view==="settings"&&<>
        <form className="op-card" onSubmit={saveSettings}><h2>Workspace</h2><div className="op-form-grid"><label>ชื่อ Workspace<input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} required maxLength={120}/></label><label>Demand alert threshold (%)<input type="number" min="5" max="100" value={threshold} onChange={e=>setThreshold(Number(e.target.value))} required/></label></div><label className="op-check"><input type="checkbox" checked={refreshEnabled} onChange={e=>setRefreshEnabled(e.target.checked)}/>รีเฟรชข้อมูลทุก 15 นาที</label><label className="op-check"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/>แสดงตารางแบบกระชับ</label><p>แจ้งเตือนในแอป ไม่มีการส่งอีเมลหรือข้อมูลไปบริการภายนอก</p><button disabled={busy||!manager}>บันทึกการตั้งค่า</button></form>
        <section className="op-card"><h2>สมาชิกทีม</h2><p>Owner จัดการสมาชิก; Admin ตั้งค่าและจัดการข้อมูล; Planner นำเข้า/พยากรณ์/Review; Viewer อ่านอย่างเดียว สมาชิกต้องสมัครบัญชีแล้ว</p><Table rows={members}/>{info?.role==="owner"&&<><form className="op-row" onSubmit={saveMember}><input aria-label="username สมาชิก" placeholder="username" value={memberName} onChange={e=>setMemberName(e.target.value)} required/><select value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option>planner</option><option>viewer</option><option>admin</option></select><button disabled={busy}>เพิ่ม / เปลี่ยนสิทธิ์</button></form>{members.filter(m=>m.role!=="owner").map(m=><button key={m.id} disabled={busy} onClick={()=>void action(async()=>{await rpc(`/members/${m.id}`,undefined,"DELETE");setReload(v=>v+1);setNotice(`นำ ${m.username} ออกจากทีมแล้ว`);})}>นำ {m.username} ออกจากทีม</button>)}</>}</section>
        <form className="op-card" onSubmit={e=>{e.preventDefault();void action(async()=>{await onChangePassword({current_password:currentPassword,new_password:newPassword});setCurrentPassword("");setNewPassword("");setNotice("เปลี่ยนรหัสผ่านแล้ว");});}}><h2>เปลี่ยนรหัสผ่าน</h2><div className="op-form-grid"><label>รหัสผ่านเดิม<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></label><label>รหัสผ่านใหม่<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label></div><button disabled={busy}>เปลี่ยนรหัสผ่าน</button></form>
      </>}
      </>}
    </main>
  </div>;
}
