import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { RiskLevel } from "../lib/demo-data";
import { Icon } from "./icons";
function riskLabel(risk: RiskLevel) {
  if (risk === "HIGH") return "สูง";
  if (risk === "MEDIUM") return "กลาง";
  return "ต่ำ";
}
export { Icon };

/** Switches data-theme on <html>; layout.tsx restores the saved choice before paint. */
const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
const readTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark");
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("demandly-theme", next); } catch { /* storage may be blocked; theme still applies */ }
  }
  const label = theme === "dark" ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด";
  return <button type="button" className="icon-button topbar-icon theme-toggle" onClick={toggle} aria-label={label} title={label}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>;
}

export function PageIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
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

export function Button({
  children,
  onClick,
  variant = "primary",
  icon,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`button button-${variant}`}>{icon && <Icon name={icon} />}{children}</button>;
}

export function KpiCard({ label, value, detail, change, tone, icon, isTextChange = false }: { label: string; value: string; detail: string; change: string; tone: string; icon: string; isTextChange?: boolean }) {
  return <article className={`kpi-card kpi-${tone}`}><div className="kpi-card-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon name={icon} /></span></div><strong className="kpi-value">{value}</strong><div className="kpi-card-bottom"><span>{detail}</span><span className={`kpi-change ${isTextChange ? "kpi-change-text" : ""}`}>{isTextChange ? change : `↑ ${change}`}</span></div></article>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`risk-badge risk-${risk.toLowerCase()}`}>{riskLabel(risk)}</span>;
}

export function TrendValue({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`trend-value ${positive ? "is-positive" : "is-negative"}`}>
      {positive ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

export function DetailStat({ label, value, suffix, note, tone }: { label: string; value: string; suffix: string; note: string; tone: string }) { return <article className={`detail-stat detail-stat-${tone}`}><span className="panel-kicker">{label}</span><strong>{value} <small>{suffix}</small></strong><span>{note}</span></article>; }

export function EmptyState({ title, detail, action, onClick }: { title: string; detail: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span className="empty-icon"><Icon name="search" /></span><strong>{title}</strong><span>{detail}</span>{action && <button className="text-button" type="button" onClick={onClick}>{action} <Icon name="arrow" /></button>}</div>; }

export function TimelineItem({ date, title, detail, active = false }: { date: string; title: string; detail: string; active?: boolean }) { return <div className={`timeline-item ${active ? "is-active" : ""}`}><span className="timeline-marker"><i /></span><span className="timeline-date">{date}</span><span><strong>{title}</strong><small>{detail}</small></span></div>; }

export function QualityCheck({ title, detail, value, tone }: { title: string; detail: string; value: string; tone: string }) { return <div className="quality-check"><span className={`quality-check-icon ${tone}`}><Icon name={tone === "good" ? "check" : "bell"} /></span><span><strong>{title}</strong><small>{detail}</small></span><b className={`quality-value-${tone}`}>{value}</b></div>; }

export function StepItem({ number, label, active, complete }: { number: string; label: string; active: boolean; complete: boolean }) {
  return <div className={`step-item ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}><span>{complete ? <Icon name="check" /> : number}</span><strong>{label}</strong></div>;
}

export function StepLine({ complete }: { complete: boolean }) { return <span className={`step-line ${complete ? "is-complete" : ""}`} />; }
