export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type Product = {
  id: string;
  name: string;
  code: string;
  category: string;
  region: string;
  forecast: number;
  change: number;
  confidence: number;
  risk: RiskLevel;
  inventory: number;
  coverDays: number;
  accuracy: number;
  updated: string;
};

export type AlertItem = {
  id: string;
  level: RiskLevel;
  title: string;
  product: string;
  region: string;
  change: number;
  period: string;
  factor: string;
  status: "ต้องตรวจสอบ" | "กำลังทบทวน" | "จัดการแล้ว";
};

export type TrendPoint = {
  label: string;
  actual?: number;
  forecast?: number;
};

export const products: Product[] = [
  {
    id: "test-kit-a",
    name: "Test Kit A",
    code: "TK-A-001",
    category: "Diagnostic",
    region: "กรุงเทพฯ",
    forecast: 20430,
    change: 40,
    confidence: 87,
    risk: "HIGH",
    inventory: 12100,
    coverDays: 18,
    accuracy: 91,
    updated: "วันนี้ 09:42",
  },
  {
    id: "gloves-b",
    name: "Gloves B",
    code: "GL-B-014",
    category: "Protection",
    region: "ภาคกลาง",
    forecast: 52000,
    change: 4,
    confidence: 94,
    risk: "LOW",
    inventory: 68700,
    coverDays: 39,
    accuracy: 96,
    updated: "วันนี้ 09:39",
  },
  {
    id: "mask-c",
    name: "Mask C",
    code: "MK-C-028",
    category: "Protection",
    region: "ภาคตะวันออก",
    forecast: 38200,
    change: 12,
    confidence: 89,
    risk: "MEDIUM",
    inventory: 31800,
    coverDays: 24,
    accuracy: 93,
    updated: "วันนี้ 09:38",
  },
  {
    id: "syringe-d",
    name: "Syringe D",
    code: "SY-D-039",
    category: "Clinical",
    region: "ภาคเหนือ",
    forecast: 27600,
    change: -8,
    confidence: 92,
    risk: "LOW",
    inventory: 41100,
    coverDays: 46,
    accuracy: 95,
    updated: "เมื่อวาน 17:20",
  },
  {
    id: "antigen-e",
    name: "Antigen E",
    code: "AG-E-052",
    category: "Diagnostic",
    region: "ภาคใต้",
    forecast: 16800,
    change: 21,
    confidence: 84,
    risk: "MEDIUM",
    inventory: 14600,
    coverDays: 27,
    accuracy: 88,
    updated: "เมื่อวาน 16:05",
  },
];

export const alerts: AlertItem[] = [
  {
    id: "alert-test-kit-a",
    level: "HIGH",
    title: "Demand spike detected",
    product: "Test Kit A",
    region: "กรุงเทพฯ",
    change: 40,
    period: "มิ.ย. 2025",
    factor: "โรคทางเดินหายใจเพิ่มขึ้นในกรุงเทพฯ",
    status: "ต้องตรวจสอบ",
  },
  {
    id: "alert-antigen-e",
    level: "MEDIUM",
    title: "Forecast above safety stock",
    product: "Antigen E",
    region: "ภาคใต้",
    change: 21,
    period: "ก.ค. 2025",
    factor: "ฤดูกาลท่องเที่ยวและปริมาณผู้ป่วยเพิ่มขึ้น",
    status: "กำลังทบทวน",
  },
  {
    id: "alert-mask-c",
    level: "LOW",
    title: "Accuracy improved",
    product: "Mask C",
    region: "ภาคตะวันออก",
    change: 12,
    period: "ก.ค. 2025",
    factor: "รูปแบบยอดขายสอดคล้องกับ seasonality",
    status: "จัดการแล้ว",
  },
];

export const demandTrend: TrendPoint[] = [
  { label: "ม.ค.", actual: 68 },
  { label: "ก.พ.", actual: 74 },
  { label: "มี.ค.", actual: 71 },
  { label: "เม.ย.", actual: 82 },
  { label: "พ.ค.", actual: 89 },
  { label: "มิ.ย.", actual: 94, forecast: 94 },
  { label: "ก.ค.", forecast: 108 },
  { label: "ส.ค.", forecast: 116 },
  { label: "ก.ย.", forecast: 111 },
  { label: "ต.ค.", forecast: 122 },
  { label: "พ.ย.", forecast: 118 },
];

export const detailTrend: TrendPoint[] = [
  { label: "ม.ค.", actual: 52 },
  { label: "ก.พ.", actual: 61 },
  { label: "มี.ค.", actual: 57 },
  { label: "เม.ย.", actual: 70 },
  { label: "พ.ค.", actual: 74 },
  { label: "มิ.ย.", actual: 81, forecast: 81 },
  { label: "ก.ค.", forecast: 96 },
  { label: "ส.ค.", forecast: 110 },
  { label: "ก.ย.", forecast: 103 },
  { label: "ต.ค.", forecast: 119 },
];

export const previewRows = [
  { date: "2025-05-01", product: "Test Kit A", region: "Bangkok", sales: "1,240", inventory: "12,100" },
  { date: "2025-05-02", product: "Gloves B", region: "Central", sales: "3,820", inventory: "68,700" },
  { date: "2025-05-03", product: "Mask C", region: "Eastern", sales: "2,160", inventory: "31,800" },
  { date: "2025-05-04", product: "Syringe D", region: "North", sales: "1,780", inventory: "41,100" },
];

export const regions = [
  { name: "กรุงเทพฯ", value: "35.4%", tone: "teal" },
  { name: "ภาคกลาง", value: "24.8%", tone: "blue" },
  { name: "ภาคตะวันออก", value: "18.3%", tone: "purple" },
  { name: "ภาคใต้", value: "12.6%", tone: "orange" },
];

export const navItems = [
  { id: "dashboard", label: "ภาพรวม", caption: "Dashboard", icon: "grid", path: "/dashboard" },
  { id: "forecast", label: "การพยากรณ์", caption: "Forecast", icon: "trend", path: "/forecast/new" },
  { id: "products", label: "สินค้า", caption: "Products", icon: "box", path: "/products" },
  { id: "alerts", label: "แจ้งเตือน", caption: "Alerts", icon: "bell", path: "/alerts" },
  { id: "data", label: "ข้อมูลบริษัท", caption: "Data onboarding", icon: "database", path: "/data/upload" },
  { id: "monitoring", label: "ติดตามผล", caption: "Monitoring", icon: "pulse", path: "/monitoring" },
] as const;

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function getProduct(productId: string | undefined) {
  return products.find((product) => product.id === productId) ?? products[0];
}

export function getAlert(alertId: string | undefined) {
  return alerts.find((alert) => alert.id === alertId) ?? alerts[0];
}
