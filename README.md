# Demandly — AI Demand Forecasting Platform

Frontend MVP สำหรับ persona Supply Chain Planner จาก User Journey และ
Frontend Workflow ของ AI Demand Forecasting Platform

## สิ่งที่มีในโปรเจกต์

- Dashboard: KPI, Actual vs Forecast, Product ranking, Region contribution และ Recent alerts
- Data onboarding: Upload CSV/Excel, Preview, Column mapping และ Data quality score
- Forecast workspace: ตั้งค่า Product/Region/Period/External signals, จำลอง Run Forecast และ Forecast result
- Explainable AI: Confidence, ปัจจัยที่เกี่ยวข้อง และ Human review decision support
- Products: Product portfolio, Inventory health, Demand by region และ Product detail
- Alerts: High/Medium/Low priority, Alert detail และ Mark as reviewed
- Monitoring: Actual vs Forecast performance, Model health และ Re-forecast loop
- Login / Settings: โครงหน้าสำหรับ onboarding และ workspace preferences

ข้อมูลในหน้านี้เป็น demo data เพื่อให้ทดลอง journey ได้ทันที โดยจุดเชื่อม REST API
สามารถต่อแทนใน `app/lib/demo-data.ts` และ event handlers ใน `app/forecast-app.tsx`
ได้ภายหลัง

## เริ่มต้นใช้งาน

ต้องใช้ Node.js `>=22.13.0`

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000/`

## ตรวจสอบก่อน deploy

```bash
npm run build
npm run lint
```

โปรเจกต์ใช้ vinext + Vite starter ที่รองรับ Sites/Cloudflare Worker และมี
`.openai/hosting.json` สำหรับประกาศ binding เมื่อเพิ่ม persistence ในอนาคต

## Route หลัก

```text
/
├── /login
├── /dashboard
├── /data
│   ├── /upload
│   └── /quality
├── /forecast
│   ├── /new
│   └── /:forecastId
├── /products
│   └── /:productId
├── /alerts
│   └── /:alertId
├── /monitoring
└── /settings
```
