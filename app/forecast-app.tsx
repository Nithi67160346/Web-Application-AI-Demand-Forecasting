"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { ForecastChart } from "./components/ForecastChart";
import {
  changePassword as apiChangePassword,
  checkUsername,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
} from "./lib/api";
import {
  alerts,
  demandTrend,
  detailTrend,
  formatNumber,
  getAlert,
  getProduct,
  navItems,
  previewRows,
  products,
  regions,
  type AlertItem,
  type Product,
  type RiskLevel,
} from "./lib/demo-data";

export type AppView =
  | "dashboard"
  | "forecast"
  | "products"
  | "alerts"
  | "data"
  | "monitoring"
  | "settings"
  | "login"
  | "register";

type ForecastStage = "setup" | "running" | "result";
type DataStep = "upload" | "preview" | "mapping" | "quality";

type ForecastAppProps = {
  initialView: AppView;
  initialPath?: string;
};

const forecastStatuses = [
  "Preparing data",
  "Running forecast",
  "Analyzing demand",
  "Generating result",
];

const signalOptions = [
  { id: "disease", label: "Disease trend", detail: "แนวโน้มโรคและผู้ป่วย" },
  { id: "seasonality", label: "Seasonality", detail: "รูปแบบยอดขายตามฤดูกาล" },
  { id: "policy", label: "Public health policy", detail: "นโยบายสาธารณสุข" },
  { id: "population", label: "Population", detail: "จำนวนประชากรในพื้นที่" },
];

const pageMeta: Record<AppView, { title: string; eyebrow: string }> = {
  dashboard: { title: "ภาพรวม Demand Forecast", eyebrow: "Overview" },
  forecast: { title: "การพยากรณ์ Demand", eyebrow: "Forecast workspace" },
  products: { title: "สินค้าทั้งหมด", eyebrow: "Product portfolio" },
  alerts: { title: "แจ้งเตือนที่ต้องตัดสินใจ", eyebrow: "Early warning" },
  data: { title: "นำเข้าข้อมูลบริษัท", eyebrow: "Data onboarding" },
  monitoring: { title: "ติดตามผลจริงเทียบ Forecast", eyebrow: "Monitoring" },
  settings: { title: "ตั้งค่าพื้นที่ทำงาน", eyebrow: "Workspace settings" },
  login: { title: "เข้าสู่ระบบ", eyebrow: "Welcome back" },
  register: { title: "สร้างบัญชี", eyebrow: "Create account" },
};

const iconGlyphs: Record<string, string> = {
  grid: "▦",
  trend: "⌁",
  box: "◫",
  bell: "♢",
  database: "◉",
  pulse: "⌁",
  settings: "⚙",
  help: "?",
  search: "⌕",
  calendar: "▣",
  arrow: "↗",
  upload: "↑",
  check: "✓",
  spark: "✦",
  filter: "≡",
  download: "↓",
  chevron: "›",
  close: "×",
  plus: "+",
  refresh: "↻",
  shield: "◇",
  menu: "☰",
  lock: "⌑",
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`icon icon-${name} ${className}`} aria-hidden="true">
      {iconGlyphs[name] ?? "•"}
    </span>
  );
}

function viewFromPath(path: string): AppView {
  if (path.startsWith("/login")) return "login";
  if (path.startsWith("/register")) return "register";
  if (path.startsWith("/forecast")) return "forecast";
  if (path.startsWith("/products")) return "products";
  if (path.startsWith("/alerts")) return "alerts";
  if (path.startsWith("/data")) return "data";
  if (path.startsWith("/monitoring")) return "monitoring";
  if (path.startsWith("/settings")) return "settings";
  return "dashboard";
}

function pathForView(view: AppView) {
  if (view === "forecast") return "/forecast/new";
  if (view === "data") return "/data/upload";
  if (view === "login") return "/login";
  if (view === "register") return "/register";
  return `/${view}`;
}

const APP_BASE_PATH = (import.meta.env.VITE_BASE_PATH || "").replace(/\/$/, "");

function stripAppBasePath(path: string) {
  if (!APP_BASE_PATH || APP_BASE_PATH === "/") return path;
  if (path === APP_BASE_PATH) return "/";
  return path.startsWith(`${APP_BASE_PATH}/`) ? path.slice(APP_BASE_PATH.length) || "/" : path;
}

function addAppBasePath(path: string) {
  if (!APP_BASE_PATH || APP_BASE_PATH === "/") return path;
  return path === "/" ? `${APP_BASE_PATH}/` : `${APP_BASE_PATH}${path}`;
}

function riskLabel(risk: RiskLevel) {
  if (risk === "HIGH") return "สูง";
  if (risk === "MEDIUM") return "กลาง";
  return "ต่ำ";
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`risk-badge risk-${risk.toLowerCase()}`}>{riskLabel(risk)}</span>;
}

function TrendValue({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`trend-value ${positive ? "is-positive" : "is-negative"}`}>
      {positive ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

function AppLogo({ light = false }: { light?: boolean }) {
  return (
    <span className={`app-logo ${light ? "app-logo-light" : ""}`}>
      <span className="app-logo-mark"><i /><i /><i /></span>
      <span className="app-logo-word">demandly</span>
    </span>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-check"><Icon name="check" /></span>
      <span>{message}</span>
      <button className="icon-button toast-close" onClick={onClose} aria-label="ปิดข้อความ">
        <Icon name="close" />
      </button>
    </div>
  );
}

function accountDisplayName(user: AuthUser | null) {
  return user?.full_name?.trim() || user?.username || "ผู้ใช้งาน";
}

function accountRoleLabel(user: AuthUser | null) {
  return user?.role === "admin" ? "Administrator" : "Supply Chain Planner";
}

function Sidebar({
  activeView,
  isOpen,
  onNavigate,
  onClose,
  user,
}: {
  activeView: AppView;
  isOpen: boolean;
  onNavigate: (path: string) => void;
  onClose: () => void;
  user: AuthUser | null;
}) {
  const displayName = accountDisplayName(user);
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? "is-visible" : ""}`} role="button" tabIndex={0} aria-label="ปิดเมนู" onClick={onClose} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onClose(); }} />
      <aside className={`sidebar ${isOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <AppLogo light />
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="ปิดเมนู">
            <Icon name="close" />
          </button>
        </div>

        <button className="workspace-switcher" type="button">
          <span className="workspace-avatar">BH</span>
          <span className="workspace-copy">
            <strong>BioHealth Manufacturing</strong>
            <small>Supply chain workspace</small>
          </span>
          <span className="workspace-chevron">⌄</span>
        </button>

        <nav className="sidebar-nav" aria-label="เมนูหลัก">
          <span className="nav-section-label">WORKSPACE</span>
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${activeView === item.id ? "is-active" : ""}`}
              onClick={() => onNavigate(item.path)}
            >
              <Icon name={item.icon} />
              <span className="nav-item-copy">
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </span>
              {item.id === "alerts" && <span className="nav-count">3</span>}
            </button>
          ))}

          <span className="nav-section-label nav-section-secondary">ACCOUNT</span>
          <button
            type="button"
            className={`nav-item ${activeView === "settings" ? "is-active" : ""}`}
            onClick={() => onNavigate("/settings")}
          >
            <Icon name="settings" />
            <span className="nav-item-copy">
              <strong>ตั้งค่า</strong>
              <small>Settings</small>
            </span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-card-icon"><Icon name="help" /></span>
            <strong>ต้องการความช่วยเหลือ?</strong>
            <span>ดูคู่มือการใช้งาน Forecast</span>
            <button type="button" onClick={() => window.alert("คู่มือ demo จะพร้อมในเวอร์ชันถัดไป")}>เปิดคู่มือ <Icon name="arrow" /></button>
          </div>
          <div className="sidebar-user">
            <span className="user-avatar">{displayInitial}</span>
            <span><strong>{displayName}</strong><small>{accountRoleLabel(user)}</small></span>
            <button className="icon-button" onClick={() => onNavigate("/settings")} aria-label="เปิดโปรไฟล์"><Icon name="chevron" /></button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  title,
  eyebrow,
  onMenu,
  onNavigate,
  onRefresh,
  userLabel,
}: {
  title: string;
  eyebrow: string;
  onMenu: () => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  userLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim()) onNavigate("/products");
  }

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="เปิดเมนู"><Icon name="menu" /></button>
        <div>
          <span className="topbar-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <form className="search-box" onSubmit={submitSearch}>
          <Icon name="search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาสินค้า, region..." aria-label="ค้นหา" />
          <kbd>⌘ K</kbd>
        </form>
        <button className="topbar-date" type="button"><Icon name="calendar" /> 21 มิ.ย. 2025 <span>⌄</span></button>
        <div className="notification-wrap">
          <button className="icon-button topbar-icon" onClick={() => setShowNotifications((value) => !value)} aria-label="แจ้งเตือน" aria-expanded={showNotifications}>
            <Icon name="bell" /><span className="notification-dot" />
          </button>
          {showNotifications && (
            <div className="notification-popover">
              <div className="popover-header"><strong>แจ้งเตือนล่าสุด</strong><span>3 รายการ</span></div>
              {alerts.slice(0, 2).map((alert) => <button key={alert.id} type="button" onClick={() => onNavigate(`/alerts/${alert.id}`)}><span className={`mini-alert-dot dot-${alert.level.toLowerCase()}`} /><span><strong>{alert.product}</strong><small>{alert.title}</small></span><Icon name="chevron" /></button>)}
              <button className="popover-footer" type="button" onClick={() => onNavigate("/alerts")}>ดูทั้งหมด <Icon name="arrow" /></button>
            </div>
          )}
        </div>
        <button className="icon-button topbar-icon help-button" aria-label="ช่วยเหลือ"><Icon name="help" /></button>
        <button className="profile-trigger" onClick={() => onNavigate("/settings")} type="button"><span className="user-avatar">{(userLabel || "ผู้ใช้งาน").charAt(0).toUpperCase()}</span><span>{userLabel || "ผู้ใช้งาน"}</span><span className="profile-chevron">⌄</span></button>
      </div>
      <button className="refresh-button" type="button" onClick={onRefresh} aria-label="รีเฟรชข้อมูล"><Icon name="refresh" /></button>
    </header>
  );
}

function PageIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = "primary",
  icon,
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`button button-${variant}`}>{icon && <Icon name={icon} />}{children}</button>;
}

function DashboardView({
  loading,
  onNavigate,
  onRefresh,
  userName,
}: {
  loading: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  userName: string;
}) {
  return (
    <div className="page-content dashboard-page">
      <PageIntro
        title={"สวัสดีครับ, คุณ" + userName + " 👋"}
        description="นี่คือภาพรวม Demand Forecast ของวันนี้ ตรวจสอบความเสี่ยงและตัดสินใจได้ในหน้าเดียว"
        actions={<><Button variant="secondary" icon="upload" onClick={() => onNavigate("/data/upload")}>นำเข้าข้อมูล</Button><Button icon="plus" onClick={() => onNavigate("/forecast/new")}>สร้าง Forecast ใหม่</Button></>}
      />

      {loading ? <DashboardLoading /> : (
        <>
          <section className="kpi-grid" aria-label="ตัวชี้วัดหลัก">
            <KpiCard label="Forecast demand" value="128.4k" detail="หน่วยใน 30 วันข้างหน้า" change="12.8%" tone="teal" icon="trend" />
            <KpiCard label="Forecast accuracy" value="92.4%" detail="ค่าเฉลี่ยจาก 6 เดือนล่าสุด" change="2.1%" tone="blue" icon="shield" />
            <KpiCard label="High risk products" value="03" detail="สินค้าที่ต้องทบทวนวันนี้" change="ต้องตรวจสอบ" tone="orange" icon="bell" isTextChange />
            <KpiCard label="Stock-out risk" value="6.8%" detail="ลดลงจากสัปดาห์ก่อน" change="1.4%" tone="purple" icon="box" />
          </section>

          <section className="dashboard-primary-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div><span className="panel-kicker">Demand overview</span><h3>แนวโน้ม Actual vs Forecast</h3></div>
                <div className="panel-controls"><button className="select-button" type="button">ทุกสินค้า <span>⌄</span></button><button className="select-button" type="button">6 เดือน <span>⌄</span></button><button className="icon-button panel-more" aria-label="ตัวเลือกเพิ่มเติม">•••</button></div>
              </div>
              <div className="chart-summary"><strong>128.4k <small>units</small></strong><span className="positive-copy">↑ 12.8% <small>เทียบกับเดือนก่อน</small></span></div>
              <ForecastChart data={demandTrend} />
            </article>

            <article className="panel insight-panel">
              <div className="ai-badge"><Icon name="spark" /> AI INSIGHT</div>
              <h3>Demand มีแนวโน้มเพิ่มขึ้น</h3>
              <p className="insight-lead">คาดว่า Test Kit A จะเพิ่มขึ้น <strong>40%</strong> ในเดือนหน้า</p>
              <div className="insight-visual"><div className="insight-ring"><span>+40<small>%</small></span></div><div><span className="mini-label">Confidence</span><strong>87%</strong><small>ความมั่นใจของโมเดล</small></div></div>
              <div className="insight-divider" />
              <div className="insight-reason"><span className="reason-icon"><Icon name="spark" /></span><span><strong>ปัจจัยที่เกี่ยวข้อง</strong><small>แนวโน้มโรคทางเดินหายใจในกรุงเทพฯ เพิ่มขึ้น</small></span></div>
              <Button variant="secondary" onClick={() => onNavigate("/alerts/alert-test-kit-a")}>ดูรายละเอียด Alert <Icon name="arrow" /></Button>
            </article>
          </section>

          <section className="dashboard-secondary-grid">
            <article className="panel table-panel">
              <div className="panel-heading"><div><span className="panel-kicker">Portfolio health</span><h3>สินค้าที่ต้องจับตา</h3></div><button className="text-button" onClick={() => onNavigate("/products")}>ดูทั้งหมด <Icon name="arrow" /></button></div>
              <ProductTable products={products.slice(0, 4)} onProduct={(product) => onNavigate(`/products/${product.id}`)} />
            </article>
            <article className="panel region-panel">
              <div className="panel-heading"><div><span className="panel-kicker">Demand contribution</span><h3>สัดส่วนตาม Region</h3></div><button className="icon-button panel-more" aria-label="ตัวเลือกเพิ่มเติม">•••</button></div>
              <div className="region-donut"><div className="donut-center"><strong>128.4k</strong><span>total units</span></div></div>
              <div className="region-list">{regions.map((region) => <div className="region-row" key={region.name}><span className={`region-dot region-${region.tone}`} /><span>{region.name}</span><strong>{region.value}</strong></div>)}</div>
            </article>
            <article className="panel alerts-panel">
              <div className="panel-heading"><div><span className="panel-kicker">Early warning</span><h3>แจ้งเตือนล่าสุด <span className="heading-count">3</span></h3></div><button className="text-button" onClick={() => onNavigate("/alerts")}>ดูทั้งหมด <Icon name="arrow" /></button></div>
              <div className="alert-mini-list">{alerts.map((alert) => <button key={alert.id} className="alert-mini-row" type="button" onClick={() => onNavigate(`/alerts/${alert.id}`)}><span className={`alert-level-dot dot-${alert.level.toLowerCase()}`} /><span className="alert-mini-copy"><strong>{alert.product} · {alert.region}</strong><small>{alert.title}</small></span><span className="alert-mini-time">2 ชม.</span></button>)}</div>
              <button className="alert-setup-link" type="button" onClick={onRefresh}><Icon name="refresh" /> อัปเดตเมื่อ 09:42 น.</button>
            </article>
          </section>

          <section className="journey-strip">
            <div className="journey-strip-copy"><span className="journey-kicker">CORE JOURNEY</span><strong>Data → Forecast → Insight → Decision</strong><span>เดินตามขั้นตอนสำคัญของ Supply Chain Planner ได้จากแถบเมนูด้านซ้าย</span></div>
            <div className="journey-steps"><span className="journey-step is-done"><i>✓</i>Validate</span><span className="journey-line is-done" /><span className="journey-step is-done"><i>✓</i>Forecast</span><span className="journey-line" /><span className="journey-step"><i>3</i>Human review</span><span className="journey-line" /><span className="journey-step"><i>4</i>Monitor</span></div>
          </section>
        </>
      )}
    </div>
  );
}

function DashboardLoading() {
  return <div className="dashboard-loading"><div className="loading-orb"><Icon name="refresh" /></div><strong>กำลังโหลดข้อมูลล่าสุด</strong><span>เชื่อมต่อกับ Forecast workspace...</span></div>;
}

function AuthCheckingView() {
  return <main className="auth-check-screen"><div className="dashboard-loading"><div className="loading-orb"><Icon name="shield" /></div><strong>กำลังตรวจสอบบัญชี</strong><span>กำลังเตรียมพื้นที่ทำงานของคุณ...</span></div></main>;
}

function KpiCard({ label, value, detail, change, tone, icon, isTextChange = false }: { label: string; value: string; detail: string; change: string; tone: string; icon: string; isTextChange?: boolean }) {
  return <article className={`kpi-card kpi-${tone}`}><div className="kpi-card-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon name={icon} /></span></div><strong className="kpi-value">{value}</strong><div className="kpi-card-bottom"><span>{detail}</span><span className={`kpi-change ${isTextChange ? "kpi-change-text" : ""}`}>{isTextChange ? change : `↑ ${change}`}</span></div></article>;
}

function ProductTable({ products: rows, onProduct }: { products: Product[]; onProduct: (product: Product) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>สินค้า</th><th>Forecast</th><th>Trend</th><th>Confidence</th><th>Risk</th><th /></tr></thead><tbody>{rows.map((product) => <tr key={product.id} onClick={() => onProduct(product)}><td><span className="product-cell"><span className="product-thumb">{product.name.charAt(0)}</span><span><strong>{product.name}</strong><small>{product.code}</small></span></span></td><td><strong>{formatNumber(product.forecast)}</strong><small> units</small></td><td><TrendValue value={product.change} /></td><td><span className="confidence-cell"><span className="confidence-track"><i style={{ width: `${product.confidence}%` }} /></span>{product.confidence}%</span></td><td><RiskBadge risk={product.risk} /></td><td><button className="row-arrow" onClick={(event) => { event.stopPropagation(); onProduct(product); }} aria-label={`ดู ${product.name}`}><Icon name="chevron" /></button></td></tr>)}</tbody></table></div>;
}

function ForecastView({
  stage,
  statusIndex,
  productId,
  region,
  period,
  signals,
  onProductChange,
  onRegionChange,
  onPeriodChange,
  onToggleSignal,
  onRun,
  onNavigate,
  onReset,
}: {
  stage: ForecastStage;
  statusIndex: number;
  productId: string;
  region: string;
  period: string;
  signals: string[];
  onProductChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  onToggleSignal: (value: string) => void;
  onRun: () => void;
  onNavigate: (path: string) => void;
  onReset: () => void;
}) {
  const product = getProduct(productId);
  return <div className="page-content forecast-page"><PageIntro title="สร้าง Forecast ใหม่" description="ตั้งค่าการพยากรณ์ให้ตรงกับคำถามทางธุรกิจ แล้วให้ AI ช่วยวิเคราะห์ Demand ล่วงหน้า" actions={<Button variant="secondary" icon="help">ดูวิธีใช้งาน</Button>} />
    <div className="journey-stepper"><StepItem number="1" label="ตั้งค่า Forecast" active={stage === "setup"} complete={stage !== "setup"} /><StepLine complete={stage !== "setup"} /><StepItem number="2" label="AI กำลังวิเคราะห์" active={stage === "running"} complete={stage === "result"} /><StepLine complete={stage === "result"} /><StepItem number="3" label="ดูผลลัพธ์และตัดสินใจ" active={stage === "result"} complete={false} /></div>
    {stage === "setup" && <ForecastSetup productId={productId} region={region} period={period} signals={signals} onProductChange={onProductChange} onRegionChange={onRegionChange} onPeriodChange={onPeriodChange} onToggleSignal={onToggleSignal} onRun={onRun} product={product} />}
    {stage === "running" && <ForecastRunning statusIndex={statusIndex} product={product} />}
    {stage === "result" && <ForecastResult product={product} region={region} period={period} onNavigate={onNavigate} onReset={onReset} />}
  </div>;
}

function StepItem({ number, label, active, complete }: { number: string; label: string; active: boolean; complete: boolean }) {
  return <div className={`step-item ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}><span>{complete ? <Icon name="check" /> : number}</span><strong>{label}</strong></div>;
}

function StepLine({ complete }: { complete: boolean }) { return <span className={`step-line ${complete ? "is-complete" : ""}`} />; }

function ForecastSetup({ productId, region, period, signals, onProductChange, onRegionChange, onPeriodChange, onToggleSignal, onRun, product }: { productId: string; region: string; period: string; signals: string[]; onProductChange: (value: string) => void; onRegionChange: (value: string) => void; onPeriodChange: (value: string) => void; onToggleSignal: (value: string) => void; onRun: () => void; product: Product }) {
  return <div className="forecast-setup-grid"><article className="panel setup-form-panel"><div className="panel-heading"><div><span className="panel-kicker">Forecast parameters</span><h3>ข้อมูลที่ต้องการ Forecast</h3></div><span className="setup-required"><span>*</span> จำเป็นต้องกรอก</span></div><div className="form-grid"><label className="form-field"><span>สินค้า <em>*</em></span><select value={productId} onChange={(event) => onProductChange(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select><small>เลือกสินค้าที่ต้องการวางแผน</small></label><label className="form-field"><span>Region <em>*</em></span><select value={region} onChange={(event) => onRegionChange(event.target.value)}><option>กรุงเทพฯ</option><option>ภาคกลาง</option><option>ภาคตะวันออก</option><option>ภาคเหนือ</option><option>ภาคใต้</option><option>ทุก Region</option></select><small>กรองตามพื้นที่จัดจำหน่าย</small></label></div><div className="form-field period-field"><span>ช่วงเวลา Forecast <em>*</em></span><div className="period-options">{["1 เดือน", "3 เดือน", "6 เดือน"].map((option) => <button type="button" key={option} className={period === option ? "is-selected" : ""} onClick={() => onPeriodChange(option)}>{option}<small>{option === "1 เดือน" ? "Quick view" : option === "3 เดือน" ? "Recommended" : "Long range"}</small></button>)}</div></div><div className="form-field signals-field"><div className="field-heading"><span>External Signals <small>เลือกได้มากกว่า 1 รายการ</small></span><span className="optional-label">Optional</span></div><div className="signals-grid">{signalOptions.map((signal) => <label className={`signal-option ${signals.includes(signal.id) ? "is-selected" : ""}`} key={signal.id}><input type="checkbox" checked={signals.includes(signal.id)} onChange={() => onToggleSignal(signal.id)} /><span className="custom-checkbox"><Icon name="check" /></span><span><strong>{signal.label}</strong><small>{signal.detail}</small></span></label>)}</div></div><div className="setup-form-footer"><span><Icon name="shield" /> AI จะใช้ข้อมูลที่เลือกเพื่อเพิ่มความแม่นยำ</span><Button icon="trend" onClick={onRun}>Run Forecast</Button></div></article><aside className="forecast-preview-card"><div className="preview-card-top"><span className="ai-badge"><Icon name="spark" /> AI READY</span><span className="live-dot"><i /> Model v2.4</span></div><h3>ตัวอย่างผลลัพธ์</h3><p>เมื่อรัน Forecast แล้ว คุณจะเห็นข้อมูลสำคัญเหล่านี้</p><div className="preview-metric"><span>Next month forecast</span><strong>{formatNumber(product.forecast)} <small>units</small></strong><TrendValue value={product.change} /></div><div className="preview-divider" /><div className="preview-list"><span><i className="preview-icon"><Icon name="shield" /></i><span><strong>Confidence</strong><small>ความมั่นใจของโมเดล</small></span><b>{product.confidence}%</b></span><span><i className="preview-icon preview-icon-orange"><Icon name="bell" /></i><span><strong>Risk level</strong><small>ระดับความเสี่ยง</small></span><RiskBadge risk={product.risk} /></span><span><i className="preview-icon preview-icon-purple"><Icon name="box" /></i><span><strong>Inventory cover</strong><small>จำนวนวันที่ stock รองรับ</small></span><b>{product.coverDays} วัน</b></span></div><div className="preview-note"><Icon name="spark" /><span>โมเดลจะอธิบายปัจจัยที่มีผลต่อ Demand ให้ดูในหน้าผลลัพธ์</span></div></aside></div>;
}

function ForecastRunning({ statusIndex, product }: { statusIndex: number; product: Product }) {
  return <div className="running-state panel"><div className="running-orbit"><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /><span className="running-core"><Icon name="spark" /></span></div><span className="panel-kicker">AI FORECAST ENGINE</span><h3>กำลังวิเคราะห์ Demand ของ {product.name}</h3><p>ระบบกำลังดูข้อมูลย้อนหลัง, external signals และรูปแบบยอดขาย เพื่อสร้าง Forecast ที่อธิบายได้</p><div className="running-progress"><div className="running-progress-track"><i style={{ width: `${Math.min(96, 24 + statusIndex * 25)}%` }} /></div><span>{Math.min(96, 24 + statusIndex * 25)}%</span></div><div className="running-steps">{forecastStatuses.map((status, index) => <div className={`running-step ${index < statusIndex ? "is-complete" : ""} ${index === statusIndex ? "is-current" : ""}`} key={status}><span>{index < statusIndex ? <Icon name="check" /> : index === statusIndex ? <i className="spinner-dot" /> : index + 1}</span><strong>{status}</strong>{index === statusIndex && <small>กำลังดำเนินการ...</small>}</div>)}</div><div className="running-footnote"><Icon name="shield" /> การวิเคราะห์นี้ใช้ข้อมูล demo ในเครื่อง เพื่อให้ทดลอง journey ได้ทันที</div></div>;
}

function ForecastResult({ product, region, period, onNavigate, onReset }: { product: Product; region: string; period: string; onNavigate: (path: string) => void; onReset: () => void }) {
  return <div className="forecast-result"><div className="result-banner"><div className="result-banner-icon"><Icon name="check" /></div><div><span className="panel-kicker">Forecast completed · วันนี้ 09:42 น.</span><h3>พร้อมใช้ผลลัพธ์เพื่อวางแผน</h3><p>ระบบพบแนวโน้ม Demand ที่ควรทบทวนก่อนตัดสินใจผลิตหรือเติม Stock</p></div><Button variant="secondary" icon="download" onClick={() => window.alert("สร้างรายงาน Forecast สำหรับดาวน์โหลดแล้ว")}>Export report</Button></div><section className="result-kpi-grid"><article className="result-kpi-card result-kpi-highlight"><span className="panel-kicker">Next {period} forecast</span><strong>{formatNumber(product.forecast)}</strong><small>units · {product.name} · {region}</small><TrendValue value={product.change} /></article><article className="result-kpi-card"><span className="panel-kicker">Confidence</span><strong>{product.confidence}%</strong><small>ความมั่นใจของโมเดล</small><div className="result-meter"><i style={{ width: `${product.confidence}%` }} /></div></article><article className="result-kpi-card"><span className="panel-kicker">Forecast accuracy</span><strong>{product.accuracy}%</strong><small>จากข้อมูลย้อนหลัง 6 เดือน</small><span className="positive-copy">↑ 2.1% จากเดือนก่อน</span></article><article className="result-kpi-card"><span className="panel-kicker">Inventory cover</span><strong>{product.coverDays} <small>วัน</small></strong><small>ควรเตรียม Stock เพิ่ม</small><RiskBadge risk={product.risk} /></article></section><section className="result-main-grid"><article className="panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">Demand analysis</span><h3>Actual vs Forecast · {product.name}</h3></div><button className="select-button" type="button">{region} <span>⌄</span></button></div><ForecastChart data={detailTrend} /></article><aside className="panel factor-panel"><div className="panel-heading"><div><span className="panel-kicker">Explainable AI</span><h3>อะไรมีผลต่อ Forecast?</h3></div></div><div className="factor-highlight"><span className="factor-emoji">↗</span><div><strong>Demand มีแนวโน้มเพิ่มขึ้น</strong><span>คาดการณ์สูงกว่าค่าเฉลี่ย 40%</span></div></div><div className="factor-list"><FactorRow label="Disease trend" detail="ผลกระทบสูง" value="+18%" tone="teal" /><FactorRow label="Seasonality" detail="ผลกระทบปานกลาง" value="+12%" tone="orange" /><FactorRow label="Historical sales" detail="ผลกระทบปานกลาง" value="+7%" tone="blue" /><FactorRow label="Other signals" detail="ผลกระทบต่ำ" value="+3%" tone="purple" /></div><div className="human-review-note"><Icon name="shield" /><span><strong>Human review required</strong><small>AI เป็นตัวช่วยประกอบการตัดสินใจ การผลิตจริงยังเป็นหน้าที่ของทีมคุณ</small></span></div></aside></section><section className="decision-panel panel"><div><span className="panel-kicker">Next best action</span><h3>คุณต้องการทำอะไรต่อ?</h3><p>ทบทวน Alert ก่อนสรุปแผน Production หรือ Inventory</p></div><div className="decision-actions"><Button variant="secondary" onClick={() => onNavigate("/alerts/alert-test-kit-a")}>เปิด High demand alert <Icon name="arrow" /></Button><Button onClick={() => onNavigate(`/products/${product.id}`)}>ดู Product detail <Icon name="arrow" /></Button><button className="text-button" onClick={onReset}>สร้าง Forecast ใหม่</button></div></section></div>;
}

function FactorRow({ label, detail, value, tone }: { label: string; detail: string; value: string; tone: string }) { return <div className="factor-row"><span className={`factor-dot factor-dot-${tone}`} /><span><strong>{label}</strong><small>{detail}</small></span><b>{value}</b></div>; }

function DataView({ step, fileName, onFile, onStep, onNavigate }: { step: DataStep; fileName: string; onFile: (file: File | undefined) => void; onStep: (step: DataStep) => void; onNavigate: (path: string) => void }) {
  const steps: { id: DataStep; label: string; caption: string }[] = [
    { id: "upload", label: "อัปโหลดไฟล์", caption: "CSV / Excel" },
    { id: "preview", label: "Preview", caption: "ตรวจข้อมูลเบื้องต้น" },
    { id: "mapping", label: "Column mapping", caption: "จับคู่ field" },
    { id: "quality", label: "Data quality", caption: "ตรวจสอบก่อน Forecast" },
  ];
  const activeIndex = steps.findIndex((candidate) => candidate.id === step);
  return (
    <div className="page-content data-page">
      <PageIntro title="นำเข้าข้อมูลบริษัท" description="นำเข้า Sales และ Inventory แล้วตรวจสอบคุณภาพข้อมูลให้พร้อมก่อนสร้าง Forecast" actions={<Button variant="secondary" icon="download" onClick={() => window.alert("ดาวน์โหลดไฟล์ template CSV แล้ว")}>ดาวน์โหลด Template</Button>} />
      <div className="data-stepper">
        {steps.map((item, index) => (
          <button type="button" key={item.id} className={`data-step ${step === item.id ? "is-active" : ""} ${activeIndex > index ? "is-complete" : ""}`} onClick={() => (index <= activeIndex ? onStep(item.id) : undefined)}>
            <span>{activeIndex > index ? <Icon name="check" /> : index + 1}</span>
            <div><strong>{item.label}</strong><small>{item.caption}</small></div>
          </button>
        ))}
      </div>
      {step === "upload" && <UploadPanel fileName={fileName} onFile={onFile} onStep={onStep} />}
      {step === "preview" && <PreviewPanel fileName={fileName} onStep={onStep} />}
      {step === "mapping" && <MappingPanel onStep={onStep} />}
      {step === "quality" && <QualityPanel onNavigate={onNavigate} />}
    </div>
  );
}

function UploadPanel({ fileName, onFile, onStep }: { fileName: string; onFile: (file: File | undefined) => void; onStep: (step: DataStep) => void }) {
  function handleDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); onFile(event.dataTransfer.files?.[0]); }
  function handleInput(event: ChangeEvent<HTMLInputElement>) { onFile(event.target.files?.[0]); }
  return <div className="upload-layout"><article className="panel upload-panel"><div className="upload-panel-heading"><div><span className="panel-kicker">Step 1 · Data onboarding</span><h3>อัปโหลดไฟล์ยอดขายและ Inventory</h3><p>รองรับไฟล์ CSV หรือ Excel ขนาดไม่เกิน 20 MB</p></div><span className="secure-badge"><Icon name="shield" /> Secure upload</span></div><div className={`drop-zone ${fileName ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}><input id="file-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleInput} /><span className="drop-icon"><Icon name={fileName ? "check" : "upload"} /></span>{fileName ? <><strong>{fileName}</strong><span>ไฟล์พร้อมตรวจสอบแล้ว · <button type="button" onClick={() => onFile(undefined)}>เปลี่ยนไฟล์</button></span></> : <><strong>ลากไฟล์มาวางที่นี่</strong><span>หรือ <label htmlFor="file-upload">เลือกไฟล์จากเครื่อง</label></span></>}<small>CSV, XLSX หรือ XLS · สูงสุด 20 MB</small></div>{fileName && <div className="file-ready"><span className="file-type">CSV</span><span><strong>{fileName}</strong><small>อัปโหลดเมื่อสักครู่ · 2.4 MB</small></span><span className="file-ok"><Icon name="check" /></span></div>}<div className="upload-actions"><span><Icon name="help" /> ต้องใช้ column อะไรบ้าง?</span><Button disabled={!fileName} onClick={() => onStep("preview")} icon="arrow">ดูตัวอย่างข้อมูล</Button></div></article><aside className="panel upload-guide"><div className="guide-icon"><Icon name="database" /></div><h3>ข้อมูลที่ระบบต้องการ</h3><p>เตรียมข้อมูลให้อยู่ในรูปแบบที่ระบบอ่านได้ง่าย เพื่อผลลัพธ์ที่แม่นยำขึ้น</p><div className="required-fields"><span><i>1</i><strong>Date</strong><small>วันที่ขาย</small></span><span><i>2</i><strong>Product</strong><small>รหัสหรือชื่อสินค้า</small></span><span><i>3</i><strong>Region</strong><small>พื้นที่จำหน่าย</small></span><span><i>4</i><strong>Sales</strong><small>จำนวนยอดขาย</small></span><span><i>5</i><strong>Inventory</strong><small>จำนวนคงคลัง</small></span></div><div className="guide-tip"><Icon name="spark" /><span><strong>แนะนำ</strong><small>ใช้ข้อมูลย้อนหลังอย่างน้อย 6 เดือนเพื่อเพิ่มความแม่นยำของ Forecast</small></span></div></aside></div>;
}

function PreviewPanel({ fileName, onStep }: { fileName: string; onStep: (step: DataStep) => void }) { return <div className="panel data-panel"><div className="panel-heading"><div><span className="panel-kicker">Step 2 · Preview</span><h3>ตรวจสอบข้อมูลเบื้องต้น</h3><p>ตัวอย่างข้อมูลจาก <strong>{fileName}</strong> · แสดง 4 จาก 12,840 records</p></div><span className="data-count"><strong>12,840</strong> records</span></div><div className="data-table-wrap"><table className="data-table preview-table"><thead><tr><th>#</th><th>Date</th><th>Product</th><th>Region</th><th>Sales quantity</th><th>Inventory</th></tr></thead><tbody>{previewRows.map((row, index) => <tr key={row.date}><td>{String(index + 1).padStart(2, "0")}</td><td>{row.date}</td><td><strong>{row.product}</strong></td><td>{row.region}</td><td>{row.sales}</td><td>{row.inventory}</td></tr>)}</tbody></table></div><div className="data-panel-footer"><span><Icon name="check" /> อ่านข้อมูลสำเร็จ · Date format ถูกต้อง</span><Button onClick={() => onStep("mapping")} icon="arrow">ตรวจสอบ Column mapping</Button></div></div>; }

function MappingPanel({ onStep }: { onStep: (step: DataStep) => void }) { const mappingRows = [{ source: "date", target: "Date", detail: "วันที่ของรายการ", state: "matched" }, { source: "product_name", target: "Product", detail: "ชื่อหรือรหัสสินค้า", state: "matched" }, { source: "region", target: "Region", detail: "พื้นที่จำหน่าย", state: "matched" }, { source: "sales_qty", target: "Sales quantity", detail: "ยอดขายต่อวัน", state: "matched" }, { source: "on_hand", target: "Inventory", detail: "คงคลังปัจจุบัน", state: "matched" }]; return <div className="mapping-layout"><article className="panel data-panel"><div className="panel-heading"><div><span className="panel-kicker">Step 3 · Column mapping</span><h3>ยืนยันการจับคู่ข้อมูล</h3><p>ตรวจสอบว่าคอลัมน์จากไฟล์ตรงกับข้อมูลที่ระบบต้องใช้</p></div><span className="mapping-score"><Icon name="check" /> 5/5 matched</span></div><div className="mapping-list">{mappingRows.map((row) => <div className="mapping-row" key={row.source}><span className="mapping-source">{row.source}</span><Icon name="arrow" /><span className="mapping-target">{row.target}</span><span className="mapping-detail">{row.detail}</span><span className="mapping-ok"><Icon name="check" /> matched</span></div>)}</div><div className="data-panel-footer"><span><Icon name="help" /> สามารถแก้ mapping ได้ภายหลังใน Settings</span><Button onClick={() => onStep("quality")} icon="arrow">ตรวจสอบ Data quality</Button></div></article><aside className="panel mapping-tip"><div className="guide-icon"><Icon name="spark" /></div><h3>Column mapping คืออะไร?</h3><p>เป็นการบอกระบบว่าข้อมูลแต่ละคอลัมน์หมายถึงอะไร เพื่อให้ AI ใช้คำนวณ Forecast ได้ถูกต้อง</p><div className="mapping-example"><span>ไฟล์ของคุณ</span><strong>sales_qty</strong><i>→</i><strong>Sales quantity</strong></div></aside></div>; }

function QualityPanel({ onNavigate }: { onNavigate: (path: string) => void }) { return <div className="quality-layout"><article className="panel quality-summary"><div className="quality-header"><div><span className="panel-kicker">Step 4 · Data quality</span><h3>ข้อมูลพร้อมสำหรับ Forecast</h3><p>ระบบตรวจสอบข้อมูลทั้งหมด 12,840 records เรียบร้อยแล้ว</p></div><div className="quality-score"><strong>96</strong><span>/100</span><small>Data quality score</small></div></div><div className="quality-bar"><i style={{ width: "96%" }} /></div><div className="quality-checks"><QualityCheck title="Completeness" detail="Missing value น้อยกว่า 1%" value="99.2%" tone="good" /><QualityCheck title="Validity" detail="ประเภทข้อมูลและ Date format ถูกต้อง" value="100%" tone="good" /><QualityCheck title="Duplicates" detail="พบรายการซ้ำ 28 records" value="ต้องทบทวน" tone="warning" /><QualityCheck title="Coverage" detail="ข้อมูลย้อนหลัง 12 เดือน" value="เหมาะสม" tone="good" /></div><div className="quality-actions"><Button variant="secondary" onClick={() => onNavigate("/data/upload")}>แก้ไขข้อมูล</Button><Button onClick={() => onNavigate("/forecast/new")} icon="trend">ใช้ข้อมูลนี้สร้าง Forecast</Button></div></article><aside className="panel quality-issue"><span className="issue-icon"><Icon name="bell" /></span><span className="panel-kicker">Attention needed</span><h3>พบ Duplicate 28 records</h3><p>รายการซ้ำมีผลต่อการคำนวณค่าเฉลี่ย หากแน่ใจว่าเป็นข้อมูลที่ถูกต้องสามารถใช้ต่อได้</p><button className="text-button" type="button" onClick={() => window.alert("เปิดรายการ duplicate สำหรับตรวจสอบ")}>ดูรายการที่พบ <Icon name="arrow" /></button><div className="quality-decision"><span>AI แนะนำ</span><strong>ใช้ข้อมูลต่อได้</strong><small>ผลกระทบต่อ Forecast ต่ำ</small></div></aside></div>; }

function QualityCheck({ title, detail, value, tone }: { title: string; detail: string; value: string; tone: string }) { return <div className="quality-check"><span className={`quality-check-icon ${tone}`}><Icon name={tone === "good" ? "check" : "bell"} /></span><span><strong>{title}</strong><small>{detail}</small></span><b className={`quality-value-${tone}`}>{value}</b></div>; }

function ProductsView({ query, onQuery, onNavigate }: { query: string; onQuery: (value: string) => void; onNavigate: (path: string) => void }) { const filtered = useMemo(() => products.filter((product) => `${product.name} ${product.code} ${product.region}`.toLowerCase().includes(query.toLowerCase())), [query]); return <div className="page-content products-page"><PageIntro title="สินค้าทั้งหมด" description="ดู Forecast, Inventory และความเสี่ยงของสินค้าทั้ง portfolio ในมุมมองเดียว" actions={<Button icon="plus" onClick={() => onNavigate("/forecast/new")}>สร้าง Forecast ใหม่</Button>} /><div className="product-toolbar"><div className="toolbar-search"><Icon name="search" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="ค้นหาชื่อสินค้า หรือรหัส..." /></div><button className="select-button" type="button">ทุก Risk level <span>⌄</span></button><button className="select-button" type="button">ทุก Region <span>⌄</span></button><button className="icon-button filter-button" aria-label="ตัวกรอง"><Icon name="filter" /></button><span className="toolbar-spacer" /><span className="table-result-count">{filtered.length} จาก {products.length} สินค้า</span></div><article className="panel products-table-panel"><div className="panel-heading"><div><span className="panel-kicker">Product portfolio</span><h3>สถานะ Forecast ล่าสุด</h3></div><Button variant="secondary" icon="download" onClick={() => window.alert("Export product portfolio แล้ว")}>Export</Button></div>{filtered.length ? <ProductTable products={filtered} onProduct={(product) => onNavigate(`/products/${product.id}`)} /> : <EmptyState title="ไม่พบสินค้าที่ค้นหา" detail="ลองค้นหาด้วยชื่อสินค้า รหัส หรือ Region อื่น" action="ล้างคำค้น" onClick={() => onQuery("")} />}</article></div>; }

function ProductDetailView({ product, onNavigate }: { product: Product; onNavigate: (path: string) => void }) { return <div className="page-content product-detail-page"><button className="back-link" type="button" onClick={() => onNavigate("/products")}><Icon name="chevron" /> กลับไปสินค้าทั้งหมด</button><PageIntro title={product.name} description={`${product.code} · ${product.category} · อัปเดตล่าสุด ${product.updated}`} actions={<><Button variant="secondary" icon="download" onClick={() => window.alert("Export product detail แล้ว")}>Export</Button><Button icon="trend" onClick={() => onNavigate("/forecast/new")}>สร้าง Forecast จากสินค้านี้</Button></>} /><div className="product-detail-banner"><span className="product-detail-avatar">{product.name.charAt(0)}</span><div><span className="panel-kicker">Selected product</span><h3>{product.name}</h3><p>สินค้านี้กำลังเป็นหนึ่งในรายการที่มีการเปลี่ยนแปลง Demand สูง</p></div><div className="detail-banner-risk"><span>Risk level</span><RiskBadge risk={product.risk} /></div></div><section className="detail-stat-grid"><DetailStat label="Current inventory" value={formatNumber(product.inventory)} suffix="units" note={`${product.coverDays} วันของ Stock cover`} tone="blue" /><DetailStat label="Next month forecast" value={formatNumber(product.forecast)} suffix="units" note={`เพิ่มขึ้น ${product.change}% จากเดือนนี้`} tone="teal" /><DetailStat label="Forecast accuracy" value={`${product.accuracy}%`} suffix="" note="ค่าเฉลี่ยย้อนหลัง 6 เดือน" tone="purple" /><DetailStat label="Confidence" value={`${product.confidence}%`} suffix="" note="ความมั่นใจของโมเดล" tone="orange" /></section><section className="detail-content-grid"><article className="panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">Demand history</span><h3>Demand trend</h3></div><div className="panel-controls"><button className="select-button" type="button">6 เดือน <span>⌄</span></button><button className="select-button" type="button">{product.region} <span>⌄</span></button></div></div><ForecastChart data={detailTrend} /></article><aside className="panel inventory-panel"><div className="panel-heading"><div><span className="panel-kicker">Inventory health</span><h3>สถานะคงคลัง</h3></div><span className="status-pill status-good"><i /> Healthy</span></div><div className="inventory-gauge"><div className="gauge-circle"><strong>{product.coverDays}</strong><span>วัน</span></div><div><span>Stock cover</span><strong>เพียงพอถึง</strong><b>08 ก.ค. 2025</b></div></div><div className="inventory-line"><span>Safety stock</span><strong>9,000 units</strong><div className="inventory-track"><i style={{ width: "74%" }} /></div><small>คงเหลือมากกว่า safety stock 34%</small></div><Button variant="secondary" onClick={() => onNavigate("/alerts/alert-test-kit-a")}>ดูคำแนะนำเติม Stock <Icon name="arrow" /></Button></aside></section><section className="panel region-breakdown"><div className="panel-heading"><div><span className="panel-kicker">Regional demand</span><h3>Demand แยกตาม Region</h3></div><button className="text-button" type="button">ดูรายละเอียด <Icon name="arrow" /></button></div><div className="region-bars">{[{ name: "กรุงเทพฯ", value: 82, units: "8,240" }, { name: "ภาคกลาง", value: 64, units: "5,920" }, { name: "ภาคตะวันออก", value: 47, units: "4,180" }, { name: "ภาคใต้", value: 31, units: "2,090" }].map((item) => <div className="region-bar-row" key={item.name}><span>{item.name}</span><div><i style={{ width: `${item.value}%` }} /></div><strong>{item.units}</strong></div>)}</div></section></div>; }

function DetailStat({ label, value, suffix, note, tone }: { label: string; value: string; suffix: string; note: string; tone: string }) { return <article className={`detail-stat detail-stat-${tone}`}><span className="panel-kicker">{label}</span><strong>{value} <small>{suffix}</small></strong><span>{note}</span></article>; }

function AlertsView({ filter, onFilter, onNavigate, reviewed }: { filter: string; onFilter: (value: string) => void; onNavigate: (path: string) => void; reviewed: string[] }) { const filtered = filter === "all" ? alerts : alerts.filter((alert) => alert.level === filter); return <div className="page-content alerts-page"><PageIntro title="แจ้งเตือนที่ต้องตัดสินใจ" description="AI ช่วยตรวจจับความผิดปกติ แต่การตัดสินใจผลิตและเติม Stock ยังเป็นของทีมคุณ" actions={<Button variant="secondary" icon="settings" onClick={() => onNavigate("/settings")}>ตั้งค่า Alert</Button>} /><div className="alert-overview-grid"><AlertOverview label="High priority" value="1" note="ต้อง review วันนี้" tone="high" /><AlertOverview label="Medium priority" value="1" note="กำลังติดตาม" tone="medium" /><AlertOverview label="Resolved" value="1" note="จัดการแล้วเดือนนี้" tone="low" /><article className="alert-guidance"><span className="guidance-icon"><Icon name="shield" /></span><span><strong>Decision support only</strong><small>อย่าใช้ Alert แทนการพิจารณาของผู้เชี่ยวชาญ</small></span></article></div><div className="alert-toolbar"><div className="alert-tabs"><button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => onFilter("all")}>ทั้งหมด <span>3</span></button><button type="button" className={filter === "HIGH" ? "is-active" : ""} onClick={() => onFilter("HIGH")}>High <span>1</span></button><button type="button" className={filter === "MEDIUM" ? "is-active" : ""} onClick={() => onFilter("MEDIUM")}>Medium <span>1</span></button><button type="button" className={filter === "LOW" ? "is-active" : ""} onClick={() => onFilter("LOW")}>Low <span>1</span></button></div><button className="select-button" type="button">ล่าสุดก่อน <span>⌄</span></button></div><div className="alert-list">{filtered.map((alert) => <AlertCard key={alert.id} alert={{ ...alert, status: reviewed.includes(alert.id) ? "จัดการแล้ว" : alert.status }} onClick={() => onNavigate(`/alerts/${alert.id}`)} />)}{filtered.length === 0 && <EmptyState title="ไม่มี Alert ระดับนี้" detail="เมื่อระบบพบความผิดปกติ รายการจะแสดงที่นี่" />}</div></div>; }

function AlertOverview({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { return <article className={`alert-overview alert-overview-${tone}`}><span className="overview-dot" /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }

function AlertCard({ alert, onClick }: { alert: AlertItem; onClick: () => void }) { return <button className="alert-card" type="button" onClick={onClick}><span className={`alert-card-strip strip-${alert.level.toLowerCase()}`} /><div className="alert-card-main"><div className="alert-card-top"><span className={`level-label level-${alert.level.toLowerCase()}`}><i /> {alert.level}</span><span className="alert-status">{alert.status}</span></div><h3>{alert.title}</h3><p><strong>{alert.product}</strong><span>·</span>{alert.region}<span>·</span>{alert.period}</p><div className="alert-card-bottom"><span><small>Demand change</small><strong className={alert.change > 0 ? "positive-copy" : ""}>+{alert.change}%</strong></span><span><small>Possible factor</small><strong>{alert.factor}</strong></span><span className="card-chevron"><Icon name="chevron" /></span></div></div></button>; }

function AlertDetailView({ alert, isReviewed, onReview, onNavigate }: { alert: AlertItem; isReviewed: boolean; onReview: () => void; onNavigate: (path: string) => void }) { return <div className="page-content alert-detail-page"><button className="back-link" type="button" onClick={() => onNavigate("/alerts")}><Icon name="chevron" /> กลับไปแจ้งเตือน</button><div className={`alert-detail-hero hero-${alert.level.toLowerCase()}`}><div className="hero-alert-icon"><Icon name={alert.level === "HIGH" ? "bell" : "spark"} /></div><div><span className="level-label"><i /> {alert.level} PRIORITY · {isReviewed ? "จัดการแล้ว" : "ต้องตรวจสอบ"}</span><h2>{alert.title}</h2><p>ตรวจพบจาก AI Anomaly Detection เมื่อวันนี้ 09:42 น.</p></div><div className="hero-actions"><Button variant="secondary" onClick={onReview} icon={isReviewed ? "check" : "shield"}>{isReviewed ? "จัดการแล้ว" : "Mark as reviewed"}</Button><button className="icon-button hero-more" aria-label="ตัวเลือกเพิ่มเติม">•••</button></div></div><div className="alert-detail-grid"><main><section className="panel alert-evidence"><div className="panel-heading"><div><span className="panel-kicker">Alert evidence</span><h3>สิ่งที่ระบบค้นพบ</h3></div></div><div className="evidence-grid"><EvidenceItem label="Product" value={alert.product} detail="TK-A-001" /><EvidenceItem label="Region" value={alert.region} detail="Demand share 35.4%" /><EvidenceItem label="Expected change" value={`+${alert.change}%`} detail="สูงกว่าค่าเฉลี่ย 6 เดือน" tone="orange" /><EvidenceItem label="Forecast period" value={alert.period} detail="Next month" /></div><div className="evidence-chart"><ForecastChart data={detailTrend} /></div></section><section className="panel factor-detail-panel"><div className="panel-heading"><div><span className="panel-kicker">Possible factors</span><h3>สาเหตุที่เกี่ยวข้อง</h3></div><span className="explainable-tag"><Icon name="spark" /> Explainable AI</span></div><div className="factor-detail-list"><FactorRow label="Disease trend" detail={alert.factor} value="High" tone="teal" /><FactorRow label="Seasonality" detail="รูปแบบ Demand ช่วงกลางปี" value="Medium" tone="orange" /><FactorRow label="Historical sales" detail="ยอดขายเพิ่มต่อเนื่อง 3 สัปดาห์" value="Medium" tone="blue" /></div></section></main><aside><section className="panel review-panel"><span className="panel-kicker">Human review</span><h3>เตรียมตัดสินใจ</h3><p>ตรวจสอบข้อมูลประกอบก่อนเลือกว่าจะเพิ่ม Production หรือเติม Inventory</p><label className="review-checkbox"><input type="checkbox" checked={isReviewed} onChange={onReview} /><span className="custom-checkbox"><Icon name="check" /></span><span>ฉันได้ทบทวน Alert นี้แล้ว</span></label><Button onClick={() => onNavigate(`/products/${getProduct("test-kit-a").id}`)} icon="arrow">เปิด Product detail</Button></section><section className="panel decision-guide"><div className="guide-icon"><Icon name="spark" /></div><span className="panel-kicker">Recommended next step</span><h3>ทบทวนแผน Production</h3><p>Forecast สูงขึ้นและ Stock cover เหลือ 18 วัน แนะนำทบทวน safety stock กับทีมผลิต</p><button type="button" className="text-button" onClick={() => window.alert("เปิดพื้นที่สำหรับ Production plan")}>บันทึกแผนการตัดสินใจ <Icon name="arrow" /></button></section></aside></div></div>; }

function EvidenceItem({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: string }) { return <div className="evidence-item"><span className={`evidence-icon evidence-${tone}`}><Icon name={label === "Expected change" ? "trend" : label === "Region" ? "grid" : label === "Product" ? "box" : "calendar"} /></span><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></div>; }

function MonitoringView({ onNavigate }: { onNavigate: (path: string) => void }) { return <div className="page-content monitoring-page"><PageIntro title="ติดตามผลจริงเทียบ Forecast" description="ดูว่า Forecast ที่สร้างไว้สอดคล้องกับ Actual Demand แค่ไหน และรู้เมื่อไหร่ควร Re-forecast" actions={<Button icon="refresh" onClick={() => window.alert("เริ่มประมวลผล Actual demand ล่าสุดแล้ว")}>อัปเดต Actual demand</Button>} /><section className="monitor-kpi-grid"><KpiCard label="Actual demand this month" value="94.2k" detail="อัปเดตเมื่อ 09:42 น." change="8.6%" tone="teal" icon="pulse" /><KpiCard label="Forecast variance" value="-2.4%" detail="Actual ต่ำกว่า Forecast" change="อยู่ในเกณฑ์" tone="blue" icon="trend" isTextChange /><KpiCard label="Models to review" value="02" detail="Accuracy ลดลงมากกว่า 5%" change="ต้องตรวจสอบ" tone="orange" icon="bell" isTextChange /><KpiCard label="Last re-forecast" value="7 วัน" detail="ครั้งล่าสุดเมื่อ 14 มิ.ย." change="สม่ำเสมอ" tone="purple" icon="refresh" isTextChange /></section><section className="monitor-main-grid"><article className="panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">Portfolio monitoring</span><h3>Actual vs Forecast performance</h3></div><div className="panel-controls"><button className="select-button" type="button">ทุกสินค้า <span>⌄</span></button><button className="select-button" type="button">เดือนนี้ <span>⌄</span></button></div></div><ForecastChart data={detailTrend} /></article><aside className="panel monitor-status-panel"><div className="panel-heading"><div><span className="panel-kicker">Model health</span><h3>สถานะ Model</h3></div><span className="status-pill status-good"><i /> Healthy</span></div><div className="model-health-score"><strong>92.4%</strong><span>average accuracy</span><div className="health-track"><i style={{ width: "92.4%" }} /></div></div><div className="model-list"><div><span className="model-dot good" /><span><strong>Demand model</strong><small>อัปเดตเมื่อ 09:42 น.</small></span><b>96%</b></div><div><span className="model-dot good" /><span><strong>Seasonality model</strong><small>อัปเดตเมื่อ 09:40 น.</small></span><b>93%</b></div><div><span className="model-dot warning" /><span><strong>Region signal</strong><small>ควร review ใน 3 วัน</small></span><b>86%</b></div></div><Button variant="secondary" onClick={() => onNavigate("/forecast/new")}>สร้าง Re-forecast <Icon name="arrow" /></Button></aside></section><section className="panel timeline-panel"><div className="panel-heading"><div><span className="panel-kicker">Monitor loop</span><h3>ประวัติการอัปเดต</h3></div><span className="live-dot"><i /> Live monitoring</span></div><div className="monitor-timeline"><TimelineItem date="21 มิ.ย. 09:42" title="Actual demand updated" detail="เพิ่มข้อมูลยอดขายล่าสุด 1,240 records" active /><TimelineItem date="20 มิ.ย. 16:20" title="Forecast variance checked" detail="ค่าเบี่ยงเบนทั้ง portfolio อยู่ในเกณฑ์ปกติ" /><TimelineItem date="14 มิ.ย. 11:05" title="Re-forecast completed" detail="สร้าง Forecast ใหม่สำหรับ Test Kit A และ Mask C" /><TimelineItem date="01 มิ.ย. 09:15" title="New data uploaded" detail="May_Sales_Inventory.csv ผ่าน Data quality 96/100" /></div></section></div>; }

function TimelineItem({ date, title, detail, active = false }: { date: string; title: string; detail: string; active?: boolean }) { return <div className={`timeline-item ${active ? "is-active" : ""}`}><span className="timeline-marker"><i /></span><span className="timeline-date">{date}</span><span><strong>{title}</strong><small>{detail}</small></span></div>; }

function SettingsView({
  onNavigate,
  onLogout,
  onChangePassword,
}: {
  onNavigate: (path: string) => void;
  onLogout: () => Promise<void>;
  onChangePassword: (payload: { current_password: string; new_password: string }) => Promise<void>;
}) {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compactTable, setCompactTable] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityLoading, setSecurityLoading] = useState(false);

  async function submitChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setSecurityMessage("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    setSecurityLoading(true);
    setSecurityMessage("");
    try {
      await onChangePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityMessage("เปลี่ยนรหัสผ่านสำเร็จ");
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setSecurityLoading(false);
    }
  }

  return <div className="page-content settings-page"><PageIntro title="ตั้งค่าพื้นที่ทำงาน" description="กำหนดการแจ้งเตือนและรูปแบบการแสดงผลให้เข้ากับวิธีทำงานของทีม" actions={<Button onClick={() => window.alert("บันทึกการตั้งค่าแล้ว")} icon="check">บันทึกการเปลี่ยนแปลง</Button>} /><div className="settings-layout"><div className="settings-nav panel"><button className="settings-nav-item is-active" type="button"><Icon name="settings" /><span><strong>Workspace</strong><small>พื้นที่ทำงาน</small></span><Icon name="chevron" /></button><button className="settings-nav-item" type="button" onClick={() => onNavigate("/data/upload")}><Icon name="database" /><span><strong>Data mapping</strong><small>การจับคู่ข้อมูล</small></span><Icon name="chevron" /></button><button className="settings-nav-item" type="button" onClick={() => window.alert("เปิดจัดการสมาชิกทีม") }><Icon name="grid" /><span><strong>Team members</strong><small>สมาชิกในทีม</small></span><Icon name="chevron" /></button></div><div className="settings-sections"><section className="panel settings-card"><div className="settings-card-heading"><div><span className="panel-kicker">Notifications</span><h3>การแจ้งเตือน</h3></div><span className="settings-heading-icon"><Icon name="bell" /></span></div><ToggleRow title="Email alerts" detail="ส่งอีเมลเมื่อมี High demand alert" checked={emailAlerts} onChange={() => setEmailAlerts((value) => !value)} /><ToggleRow title="Daily summary" detail="สรุป Forecast และความเสี่ยงทุกเช้าเวลา 09:00" checked={true} onChange={() => undefined} /><ToggleRow title="Alert digest" detail="รวมแจ้งเตือน Medium และ Low เป็นรายสัปดาห์" checked={false} onChange={() => undefined} /></section><section className="panel settings-card"><div className="settings-card-heading"><div><span className="panel-kicker">Workspace preferences</span><h3>รูปแบบการใช้งาน</h3></div><span className="settings-heading-icon settings-icon-purple"><Icon name="settings" /></span></div><ToggleRow title="Auto refresh data" detail="อัปเดต Dashboard ทุก 15 นาที" checked={autoRefresh} onChange={() => setAutoRefresh((value) => !value)} /><ToggleRow title="Compact product table" detail="แสดงข้อมูลสินค้าในรูปแบบกระชับ" checked={compactTable} onChange={() => setCompactTable((value) => !value)} /></section><section className="panel settings-card"><div className="settings-card-heading"><div><span className="panel-kicker">Account security</span><h3>เปลี่ยนรหัสผ่าน</h3></div><span className="settings-heading-icon settings-icon-purple"><Icon name="lock" /></span></div><form className="settings-security-form" onSubmit={submitChangePassword}><label className="form-field"><span>รหัสผ่านปัจจุบัน</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={1} required /></label><label className="form-field"><span>รหัสผ่านใหม่</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /><small>อย่างน้อย 8 ตัวอักษร</small></label><label className="form-field"><span>ยืนยันรหัสผ่านใหม่</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{securityMessage && <p className={securityMessage === "เปลี่ยนรหัสผ่านสำเร็จ" ? "auth-success" : "auth-error"}>{securityMessage}</p>}<Button type="submit" disabled={securityLoading} icon="lock">{securityLoading ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}</Button></form></section><section className="panel workspace-profile-card"><span className="workspace-avatar large-avatar">BH</span><div><span className="panel-kicker">Current workspace</span><h3>BioHealth Manufacturing</h3><p>Thailand · Health supplies · 12 members</p></div><Button variant="danger" onClick={onLogout} icon="close">ออกจากระบบ</Button></section></div></div></div>;
}

function ToggleRow({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: () => void }) {
  return <div className="toggle-row"><span><strong>{title}</strong><small>{detail}</small></span><button type="button" role="switch" aria-label={title} aria-checked={checked} className={`toggle-control ${checked ? "is-checked" : ""}`} onClick={onChange}><i className="toggle-ui" /></button></div>;
}

type LoginPayload = { username_or_email: string; password: string };
type RegisterPayload = { username: string; email: string; password: string; full_name: string };

function LoginView({
  onLogin,
  onRegister,
  isLoading,
  error,
}: {
  onLogin: (payload: LoginPayload) => Promise<void>;
  onRegister: () => void;
  isLoading: boolean;
  error: string;
}) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");

  return <main className="login-screen"><div className="login-decoration"><div className="login-orbit orbit-large" /><div className="login-orbit orbit-small" /><span className="login-deco-dot dot-one" /><span className="login-deco-dot dot-two" /><div className="login-quote"><span className="ai-badge"><Icon name="spark" /> HUMAN + AI</span><h2>เห็น Demand<br />ก่อนตลาด<br /><em>ขยับตัว</em></h2><p>ใช้ข้อมูลที่คุณมี เพื่อวางแผนสิ่งที่กำลังจะเกิดขึ้น</p></div><div className="login-mini-chart"><span>DEMAND SIGNAL</span><div><i style={{ height: "36%" }} /><i style={{ height: "52%" }} /><i style={{ height: "44%" }} /><i style={{ height: "72%" }} /><i style={{ height: "62%" }} /><i style={{ height: "88%" }} /><i style={{ height: "78%" }} /></div></div></div><div className="login-card-wrap"><div className="login-brand"><AppLogo /><span>for modern supply chains</span></div><div className="login-card"><span className="panel-kicker">WELCOME BACK</span><h1>เข้าสู่ระบบ</h1><p>เริ่มต้นวันของคุณด้วยภาพรวม Demand ที่ชัดขึ้น</p><form onSubmit={(event) => { event.preventDefault(); void onLogin({ username_or_email: usernameOrEmail, password }); }}><label className="form-field"><span>Username หรือ Email</span><input value={usernameOrEmail} onChange={(event) => setUsernameOrEmail(event.target.value)} autoComplete="username" required /></label><label className="form-field"><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label><div className="login-options"><label><input type="checkbox" defaultChecked /> <span>จดจำฉัน</span></label><button type="button" onClick={onRegister}>สมัครสมาชิก</button></div>{error && <p className="auth-error" role="alert">{error}</p>}<Button type="submit" disabled={isLoading} icon="arrow">{isLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ Demandly"}</Button></form><div className="login-divider"><span>หรือ</span></div><button className="sso-button" type="button" onClick={onRegister}><span className="sso-mark">+</span> สร้างบัญชีใหม่สำหรับทีม</button></div><p className="login-footnote"><Icon name="shield" /> ข้อมูลของคุณได้รับการปกป้องด้วย enterprise-grade security</p></div></main>;
}

function RegisterView({
  onRegister,
  onLogin,
  isLoading,
  error,
}: {
  onRegister: (payload: RegisterPayload) => Promise<void>;
  onLogin: () => void;
  isLoading: boolean;
  error: string;
}) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [validationError, setValidationError] = useState("");

  async function inspectUsername(value: string) {
    const normalized = value.trim();
    if (normalized.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    try {
      const result = await checkUsername(normalized);
      setUsernameStatus(result.available ? "available" : "taken");
    } catch {
      setUsernameStatus("idle");
    }
  }

  function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setValidationError("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    if (usernameStatus === "taken") {
      setValidationError("Username นี้ถูกใช้งานแล้ว");
      return;
    }
    setValidationError("");
    void onRegister({ username, email, password, full_name: fullName });
  }

  const visibleError = validationError || error;
  const usernameStatusClass = usernameStatus === "available" ? " is-available" : usernameStatus === "taken" ? " is-taken" : "";
  const usernameStatusText = usernameStatus === "checking" ? "กำลังตรวจสอบ..." : usernameStatus === "available" ? "Username นี้ใช้ได้" : usernameStatus === "taken" ? "Username นี้ถูกใช้งานแล้ว" : "ใช้ 3–32 ตัวอักษร a-z, 0-9, . _ -";

  return <main className="login-screen"><div className="login-decoration"><div className="login-orbit orbit-large" /><div className="login-orbit orbit-small" /><span className="login-deco-dot dot-one" /><span className="login-deco-dot dot-two" /><div className="login-quote"><span className="ai-badge"><Icon name="spark" /> HUMAN + AI</span><h2>วางแผนได้<br />ก่อน Demand<br /><em>เปลี่ยนทิศ</em></h2><p>สร้าง workspace ของคุณ แล้วเริ่มต้นจากข้อมูลที่ทีมมีอยู่</p></div><div className="login-mini-chart"><span>DEMAND SIGNAL</span><div><i style={{ height: "36%" }} /><i style={{ height: "52%" }} /><i style={{ height: "44%" }} /><i style={{ height: "72%" }} /><i style={{ height: "62%" }} /><i style={{ height: "88%" }} /><i style={{ height: "78%" }} /></div></div></div><div className="login-card-wrap"><div className="login-brand"><AppLogo /><span>for modern supply chains</span></div><div className="login-card"><span className="panel-kicker">GET STARTED</span><h1>สร้างบัญชี</h1><p>เริ่มใช้งาน Demandly สำหรับทีม Supply Chain ของคุณ</p><form onSubmit={submitRegister}><label className="form-field"><span>Username</span><input value={username} onChange={(event) => { setUsername(event.target.value); setUsernameStatus("idle"); }} onBlur={(event) => void inspectUsername(event.target.value)} autoComplete="username" required /><small className={"username-check" + usernameStatusClass}>{usernameStatusText}</small></label><label className="form-field"><span>ชื่อที่ใช้แสดง</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="เช่น กิตติ Supply Planner" /></label><label className="form-field"><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label><label className="form-field"><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required /><small className="password-hint">อย่างน้อย 8 ตัวอักษร</small></label><label className="form-field"><span>ยืนยัน Password</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label>{visibleError && <p className="auth-error" role="alert">{visibleError}</p>}<Button type="submit" disabled={isLoading} icon="arrow">{isLoading ? "กำลังสร้างบัญชี..." : "สร้างบัญชีและเริ่มใช้งาน"}</Button></form><div className="auth-switch">มีบัญชีอยู่แล้ว? <button type="button" onClick={onLogin}>เข้าสู่ระบบ</button></div></div><p className="login-footnote"><Icon name="shield" /> ข้อมูลของคุณได้รับการปกป้องด้วย enterprise-grade security</p></div></main>;
}

function EmptyState({ title, detail, action, onClick }: { title: string; detail: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span className="empty-icon"><Icon name="search" /></span><strong>{title}</strong><span>{detail}</span>{action && <button className="text-button" type="button" onClick={onClick}>{action} <Icon name="arrow" /></button>}</div>; }

export function ForecastApp({ initialView, initialPath }: ForecastAppProps) {
  const [view, setView] = useState<AppView>(initialView);
  const [currentPath, setCurrentPath] = useState(initialPath ?? pathForView(initialView));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(currentPath.split("/")[2] || "test-kit-a");
  const [selectedAlertId, setSelectedAlertId] = useState(currentPath.split("/")[2] || "alert-test-kit-a");
  const [productQuery, setProductQuery] = useState("");
  const [alertFilter, setAlertFilter] = useState("all");
  const [reviewedAlerts, setReviewedAlerts] = useState<string[]>([]);
  const [forecastStage, setForecastStage] = useState<ForecastStage>("setup");
  const [forecastStatusIndex, setForecastStatusIndex] = useState(0);
  const [forecastProductId, setForecastProductId] = useState("test-kit-a");
  const [forecastRegion, setForecastRegion] = useState("กรุงเทพฯ");
  const [forecastPeriod, setForecastPeriod] = useState("3 เดือน");
  const [forecastSignals, setForecastSignals] = useState(["disease", "seasonality"]);
  const [dataStep, setDataStep] = useState<DataStep>("upload");
  const [fileName, setFileName] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    function handlePopState() {
      const path = stripAppBasePath(window.location.pathname);
      setCurrentPath(path);
      setView(viewFromPath(path));
      setSelectedProductId(path.split("/")[2] || "test-kit-a");
      setSelectedAlertId(path.split("/")[2] || "alert-test-kit-a");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (forecastStage !== "running") return;
    const interval = window.setInterval(() => setForecastStatusIndex((value) => Math.min(value + 1, forecastStatuses.length - 1)), 500);
    const timer = window.setTimeout(() => { setForecastStage("result"); setToast("Forecast สร้างเสร็จแล้ว พร้อมดูผลลัพธ์"); }, 2200);
    return () => { window.clearInterval(interval); window.clearTimeout(timer); };
  }, [forecastStage]);

  useEffect(() => {
    const path = stripAppBasePath(window.location.pathname);
    const isPublicPath = path.startsWith("/login") || path.startsWith("/register");
    const savedToken = window.localStorage.getItem("demandly_access_token");
    if (!savedToken) {
      const timer = window.setTimeout(() => {
        setAuthReady(true);
        if (!isPublicPath) navigate("/login");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    getMe(savedToken)
      .then((user) => {
        setAuthToken(savedToken);
        setAuthUser(user);
        setAuthReady(true);
        if (path === "/") navigate("/dashboard");
      })
      .catch(() => {
        window.localStorage.removeItem("demandly_access_token");
        setAuthToken(null);
        setAuthUser(null);
        setAuthReady(true);
        if (!isPublicPath) navigate("/login");
      });
  }, []);

  function navigate(path: string) {
    const nextView = viewFromPath(path);
    const browserPath = addAppBasePath(path);
    if (typeof window !== "undefined" && window.location.pathname !== browserPath) window.history.pushState({}, "", browserPath);
    setCurrentPath(path);
    setView(nextView);
    setSidebarOpen(false);
    if (path.startsWith("/products/")) setSelectedProductId(path.split("/")[2] || "test-kit-a");
    if (path.startsWith("/alerts/")) setSelectedAlertId(path.split("/")[2] || "alert-test-kit-a");
    if (nextView === "data" && path.endsWith("/upload")) setDataStep("upload");
  }

  function refreshDashboard() {
    setDashboardLoading(true);
    window.setTimeout(() => { setDashboardLoading(false); setToast("อัปเดตข้อมูลล่าสุดเรียบร้อยแล้ว"); }, 700);
  }

  function runForecast() {
    setForecastStage("running");
    setForecastStatusIndex(0);
  }

  function toggleSignal(signal: string) {
    setForecastSignals((current) => current.includes(signal) ? current.filter((item) => item !== signal) : [...current, signal]);
  }

  function chooseFile(file: File | undefined) {
    setFileName(file?.name ?? "");
    if (file) setToast(`เลือกไฟล์ ${file.name} แล้ว`);
  }

  function markAlertReviewed(id: string) {
    setReviewedAlerts((current) => current.includes(id) ? current : [...current, id]);
    setToast("บันทึกว่าได้ทบทวน Alert แล้ว");
  }

  async function handleLogin(payload: LoginPayload) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await apiLogin(payload);
      window.localStorage.setItem("demandly_access_token", response.access_token);
      setAuthToken(response.access_token);
      setAuthUser(response.user);
      navigate("/dashboard");
      setToast("เข้าสู่ระบบสำเร็จ");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(payload: RegisterPayload) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await apiRegister(payload);
      window.localStorage.setItem("demandly_access_token", response.access_token);
      setAuthToken(response.access_token);
      setAuthUser(response.user);
      navigate("/dashboard");
      setToast("สร้างบัญชีสำเร็จ");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "สร้างบัญชีไม่สำเร็จ");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    const token = authToken;
    try {
      if (token) await apiLogout(token);
    } catch {
      // Clear the local session even when the API is temporarily unavailable.
    } finally {
      window.localStorage.removeItem("demandly_access_token");
      setAuthToken(null);
      setAuthUser(null);
      setAuthError("");
      navigate("/login");
    }
  }

  async function handleChangePassword(payload: { current_password: string; new_password: string }) {
    if (!authToken) throw new Error("กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    await apiChangePassword(authToken, payload);
    setToast("เปลี่ยนรหัสผ่านสำเร็จ");
  }

  const isPublicView = view === "login" || view === "register";
  if (!isPublicView && !authReady) return <AuthCheckingView />;
  if (view === "login") return <LoginView onLogin={handleLogin} onRegister={() => { setAuthError(""); navigate("/register"); }} isLoading={authLoading} error={authError} />;
  if (view === "register") return <RegisterView onRegister={handleRegister} onLogin={() => { setAuthError(""); navigate("/login"); }} isLoading={authLoading} error={authError} />;
  if (!authUser) return <LoginView onLogin={handleLogin} onRegister={() => { setAuthError(""); navigate("/register"); }} isLoading={authLoading} error={authError} />;

  const selectedProduct = getProduct(selectedProductId);
  const selectedAlert = getAlert(selectedAlertId);
  const meta = pageMeta[view];

  return <div className="app-shell"><Sidebar activeView={view} isOpen={sidebarOpen} onNavigate={navigate} onClose={() => setSidebarOpen(false)} user={authUser} /><div className="app-main"><Topbar title={meta.title} eyebrow={meta.eyebrow} onMenu={() => setSidebarOpen(true)} onNavigate={navigate} onRefresh={refreshDashboard} userLabel={accountDisplayName(authUser)} /><main className="content-scroll">{view === "dashboard" && <DashboardView loading={dashboardLoading} userName={accountDisplayName(authUser)} onNavigate={navigate} onRefresh={refreshDashboard} />}{view === "forecast" && <ForecastView stage={forecastStage} statusIndex={forecastStatusIndex} productId={forecastProductId} region={forecastRegion} period={forecastPeriod} signals={forecastSignals} onProductChange={setForecastProductId} onRegionChange={setForecastRegion} onPeriodChange={setForecastPeriod} onToggleSignal={toggleSignal} onRun={runForecast} onNavigate={navigate} onReset={() => setForecastStage("setup")} />}{view === "data" && <DataView step={dataStep} fileName={fileName} onFile={chooseFile} onStep={setDataStep} onNavigate={navigate} />}{view === "products" && (currentPath.startsWith("/products/") ? <ProductDetailView product={selectedProduct} onNavigate={navigate} /> : <ProductsView query={productQuery} onQuery={setProductQuery} onNavigate={navigate} />)}{view === "alerts" && (currentPath.startsWith("/alerts/") ? <AlertDetailView alert={selectedAlert} isReviewed={reviewedAlerts.includes(selectedAlert.id)} onReview={() => markAlertReviewed(selectedAlert.id)} onNavigate={navigate} /> : <AlertsView filter={alertFilter} onFilter={setAlertFilter} onNavigate={navigate} reviewed={reviewedAlerts} />)}{view === "monitoring" && <MonitoringView onNavigate={navigate} />}{view === "settings" && <SettingsView onNavigate={navigate} onLogout={handleLogout} onChangePassword={handleChangePassword} />}</main></div><Toast message={toast} onClose={() => setToast("")} /></div>;
}
