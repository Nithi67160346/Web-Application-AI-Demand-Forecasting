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
- Login / Register / Settings: สมัครสมาชิกและเข้าสู่ระบบจริงผ่าน REST API รวมถึงเปลี่ยนรหัสผ่านและ Logout

ข้อมูล Forecast ในหน้านี้ยังเป็น demo data เพื่อให้ทดลอง journey ได้ทันที ส่วน
Authentication และ User Management เชื่อมกับ FastAPI REST API แล้ว

## Full-stack ด้วย FastAPI และ Docker Compose

ต้องติดตั้ง Docker Desktop แล้วรันจากโฟลเดอร์โปรเจกต์:

    docker compose up --build

จากนั้นเปิดใช้งานที่:

- Frontend: http://localhost:3000
- FastAPI Swagger: http://localhost:8000/docs
- API health check: http://localhost:8000/health
- Database viewer (Adminer): http://localhost:8080

โปรเจกต์ใช้ PostgreSQL จึงใช้ Adminer แทน phpMyAdmin เพราะ phpMyAdmin
รองรับ MySQL/MariaDB ไม่ใช่ PostgreSQL โดยในหน้า Adminer ให้เลือก System เป็น
PostgreSQL, Server เป็น db, Username/Password ตามไฟล์ .env และ Database เป็น demandly

Backend อยู่ในโฟลเดอร์ api/ และใช้ PostgreSQL ใน container แยกผ่าน
docker-compose.yml โดยมี JWT authentication และ endpoint หลักดังนี้:

    POST   /register
    POST   /login
    POST   /logout
    POST   /change-password
    GET    /me
    GET    /check-username/{name}
    GET    /users?skip=0&limit=20
    GET    /users/{id}
    PUT    /users/{id}
    DELETE /users/{id}

ก่อนนำไปใช้งานจริงให้คัดลอก .env.example เป็น .env และเปลี่ยน
JWT_SECRET_KEY เป็นค่าที่สุ่มและเก็บเป็นความลับ

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

## เปิด Frontend Demo ด้วย GitHub Pages

โปรเจกต์มี workflow ที่ `.github/workflows/deploy-pages.yml` สำหรับ Build และเปิด
เฉพาะ Frontend เป็น Demo บน GitHub Pages อัตโนมัติเมื่อ Push ไปที่ branch `main`

ใน Demo จะใช้ข้อมูล Forecast จำลองและโหมด Login/Register จำลองใน browser จึงไม่ต้อง
เปิด FastAPI หรือ PostgreSQL เพื่อดูหน้าจอและทดลอง User Journey เบื้องต้น

วิธีตั้งค่าและ Push ดูได้ในไฟล์ `DEPLOY_GITHUB.md`

ถ้าต้องการรันระบบเต็มรูปแบบในเครื่อง ให้ใช้ Docker Compose ตามหัวข้อด้านบน โดย
Frontend จะเชื่อม FastAPI ผ่านตัวแปร `VITE_API_BASE_URL`

## Route หลัก

```text
/
├── /login
├── /register
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
