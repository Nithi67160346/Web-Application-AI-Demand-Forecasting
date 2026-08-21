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

## หลักการทำงานของ Frontend

โปรเจกต์นี้ออกแบบตาม User Journey ของ Supply Chain Planner โดยให้ผู้ใช้เดินตามลำดับ:

```text
Login / Register
    ↓
Dashboard
    ↓
Data onboarding → Data quality
    ↓
Forecast setup → AI processing → Forecast result
    ↓
Product / Alert → Human review และตัดสินใจ
    ↓
Monitoring → Re-forecast
```

### โครงสร้างการทำงานโดยรวม

- ไฟล์ `app/*/page.tsx` ทำหน้าที่เป็น route entry ของแต่ละ URL และส่งค่า `initialView` ให้ `ForecastApp`
- UI หลักของทุกหน้ารวมอยู่ใน `app/forecast-app.tsx` เพื่อให้แชร์ state, navigation และข้อมูลระหว่างหน้าได้
- `view` ใช้บอกว่ากำลังแสดงหน้าหลักใด ส่วน `currentPath` ใช้แยกหน้ารายละเอียด เช่น Product detail และ Alert detail
- ฟังก์ชัน `navigate()` ใช้ `history.pushState()` เปลี่ยน URL โดยไม่ reload หน้า ทำให้การเปลี่ยนหน้ารวดเร็วแบบ Single Page Application
- ข้อมูล Forecast, Product, Alert และกราฟตัวอย่างอยู่ใน `app/lib/demo-data.ts`
- การเรียก REST API และการจัดการ Authentication อยู่ใน `app/lib/api.ts`
- กราฟ Actual vs Forecast ใช้ component กลาง `app/components/ForecastChart.tsx`

## อธิบายหน้าหลักตาม User Journey

### 1. Login และ Register

URL:

- `/login`
- `/register`

หน้าสองหน้านี้เป็น public page ที่ผู้ใช้สามารถเข้าได้โดยไม่ต้องมี token

หลักการทำงาน:

1. ผู้ใช้กรอก Username/Email และ Password หรือกรอกข้อมูลสมัครสมาชิก
2. Frontend เรียก `login()` หรือ `register()` จาก `app/lib/api.ts`
3. เมื่อสำเร็จ ระบบเก็บ `access_token` ไว้ใน `localStorage` ชื่อ `demandly_access_token`
4. เก็บข้อมูลผู้ใช้ไว้ใน state ของ `ForecastApp` แล้วนำไปหน้า `/dashboard`
5. เมื่อเปิดหน้า private page ระบบตรวจ token และเรียก `GET /me` เพื่อยืนยันตัวตน
6. ถ้าไม่มี token หรือ token ใช้งานไม่ได้ ระบบจะพากลับไป `/login`

ในโหมด Full-stack จะเชื่อม FastAPI จริง ส่วน GitHub Pages Demo จะใช้ Demo mode ใน browser โดยไม่ตรวจสอบรหัสผ่านกับฐานข้อมูล ทำให้สามารถทดลองหน้าเว็บได้ทันที

### 2. Dashboard — ภาพรวม

URL: `/dashboard`

เป็นหน้าหลักหลัง Login ใช้สำหรับดูสถานการณ์ Demand ภายในหน้าเดียว ประกอบด้วย:

- KPI ของ Forecast demand, Forecast accuracy, High risk products และ Stock-out risk
- กราฟแนวโน้ม `Actual vs Forecast`
- AI Insight ที่อธิบายแนวโน้มและ Confidence
- ตารางสินค้าที่ต้องจับตา
- Demand contribution แยกตาม Region
- รายการ Alert ล่าสุด
- Core Journey ที่แสดงลำดับ `Data → Forecast → Insight → Decision → Monitor`

การกดปุ่ม `นำเข้าข้อมูล` จะไป `/data/upload` และปุ่ม `สร้าง Forecast ใหม่` จะไป `/forecast/new` ส่วนการกด Product หรือ Alert จะเปิดหน้ารายละเอียดที่เกี่ยวข้อง

ปุ่ม Refresh ใน Demo จำลองการโหลดข้อมูลประมาณช่วงเวลาสั้น ๆ แล้วแสดง Toast ว่าอัปเดตสำเร็จ ส่วนข้อมูล KPI และกราฟปัจจุบันเป็นข้อมูลตัวอย่างจาก `demo-data.ts`

### 3. Data onboarding — นำเข้าข้อมูลบริษัท

URL หลัก: `/data/upload`

หน้านี้ออกแบบเป็น Wizard 4 ขั้นตอนเพื่อแก้ปัญหาข้อมูลหลายระบบและข้อมูลไม่ครบก่อนนำไปทำ Forecast:

#### Step 1: Upload

- รองรับการลากไฟล์มาวางหรือเลือกไฟล์จากเครื่อง
- รองรับ `.csv`, `.xlsx`, `.xls` ขนาดไม่เกิน 20 MB
- เก็บชื่อไฟล์ไว้ใน React state เพื่อแสดงสถานะไฟล์ที่เลือก
- ปุ่มไปขั้นถัดไปจะเปิดใช้งานเมื่อเลือกไฟล์แล้ว

#### Step 2: Preview

- แสดงตัวอย่าง Date, Product, Region, Sales quantity และ Inventory
- ตรวจสอบเบื้องต้นว่าอ่านข้อมูลและรูปแบบวันที่ได้
- ในเวอร์ชัน Demo ตารางเป็นข้อมูลจำลองเพื่อแสดงหน้าจอ Workflow

#### Step 3: Column mapping

- จับคู่ชื่อ column จากไฟล์ของผู้ใช้กับ field ที่ระบบต้องใช้
- ตัวอย่างเช่น `sales_qty` → `Sales quantity`
- แสดงสถานะการจับคู่ว่าครบหรือไม่ ก่อนเข้าสู่ Data quality

#### Step 4: Data quality

- แสดงคะแนนคุณภาพข้อมูล
- ตรวจ Completeness, Validity, Duplicates และ Coverage
- ถ้าข้อมูลพร้อม ผู้ใช้กด `ใช้ข้อมูลนี้สร้าง Forecast` เพื่อไป `/forecast/new`
- ถ้าพบปัญหา ผู้ใช้สามารถย้อนกลับไปแก้ข้อมูลหรือเปิดรายการที่ต้องตรวจสอบ

ในปัจจุบัน Frontend จำลองขั้นตอน Preview, Mapping และ Quality ไว้ก่อน จุดเชื่อมต่อจริงในอนาคตคือส่งไฟล์ไปยัง FastAPI เพื่อ parse, validate และบันทึกข้อมูลลง PostgreSQL

### 4. Forecast workspace — ตั้งค่าและสร้าง Forecast

URL: `/forecast/new`

ผู้ใช้กำหนดคำถามทางธุรกิจก่อนให้ระบบประมวลผล:

- Product ที่ต้องการวิเคราะห์
- Region
- ช่วงเวลา Forecast: 1, 3 หรือ 6 เดือน
- External signals เช่น Disease trend, Seasonality, Public health policy และ Population

เมื่อกด `Run Forecast` ระบบจะเปลี่ยน state ตาม 3 ช่วง:

```text
setup → running → result
```

- `setup`: แสดงแบบฟอร์มและตัวอย่างผลลัพธ์
- `running`: แสดงสถานะการทำงานของ AI เป็นลำดับขั้น
- `result`: แสดง Forecast, Confidence, Accuracy, Inventory cover และกราฟวิเคราะห์

หน้าผลลัพธ์มี Explainable AI ที่แสดงปัจจัยประกอบ เช่น Disease trend, Seasonality และ Historical sales พร้อมข้อความ `Human review required` เพื่อสื่อว่า AI เป็นตัวช่วย ไม่ได้ตัดสินใจแทนทีม

ปุ่มถัดไปจะเชื่อมไปยัง High demand Alert, Product detail หรือเริ่มสร้าง Forecast ใหม่ได้ โดยเวอร์ชันปัจจุบันใช้ timer และข้อมูลจำลองเพื่อให้เห็น Journey ครบโดยไม่ต้องมี Model service จริง

### 5. Products — ภาพรวมสินค้าและรายละเอียดสินค้า

URL:

- `/products`
- `/products/:productId`

หน้า Products ใช้ดูข้อมูลทั้ง Portfolio ในมุมมองเดียว ได้แก่ Forecast, Trend, Confidence, Risk และ Inventory

หลักการทำงาน:

- ช่องค้นหาจะกรองตามชื่อสินค้า รหัสสินค้า หรือ Region แบบทันที
- คลิกแถวสินค้าเพื่อไป Product detail
- Product detail แสดง KPI ของสินค้า, Demand trend, Inventory health, Stock cover และ Demand แยกตาม Region
- ปุ่ม `สร้าง Forecast จากสินค้านี้` จะส่ง Product ที่เลือกไปเริ่ม Workflow Forecast
- ปุ่มคำแนะนำเติม Stock จะเชื่อมไปยัง Alert ที่เกี่ยวข้อง

ข้อมูลในหน้านี้มาจาก `products` ใน `app/lib/demo-data.ts` และสามารถเปลี่ยนเป็น API เช่น `GET /products` ได้ภายหลัง

### 6. Alerts — แจ้งเตือนและ Human decision

URL:

- `/alerts`
- `/alerts/:alertId`

หน้านี้ใช้หลักการ Early Warning โดยให้ AI ช่วยตรวจจับความผิดปกติ แต่ให้ผู้เชี่ยวชาญเป็นผู้ตัดสินใจ:

- แบ่ง Alert เป็น High, Medium และ Low
- กรองรายการตามระดับความสำคัญ
- แสดง Demand change, ช่วงเวลาที่ได้รับผลกระทบ และ Possible factor
- Alert detail แสดงหลักฐาน, กราฟ, ปัจจัยที่เกี่ยวข้อง และคำแนะนำถัดไป
- ปุ่ม `Mark as reviewed` ใช้บันทึกว่า Planner ได้ตรวจสอบแล้ว
- เมื่อทบทวนแล้ว สถานะจะเปลี่ยนเป็น `จัดการแล้ว` และแสดงในรายการ

สถานะการ Review ปัจจุบันอยู่ใน React state จึงเหมาะสำหรับ Demo เท่านั้น ในระบบจริงควรบันทึกผ่าน API เช่น `PUT /alerts/{id}` เพื่อให้สมาชิกทีมคนอื่นเห็นสถานะเดียวกัน

### 7. Monitoring — ติดตาม Actual เทียบ Forecast

URL: `/monitoring`

หน้า Monitoring เป็นวงจรหลังจากนำ Forecast ไปใช้งานจริง โดยแสดง:

- Actual demand ของเดือนปัจจุบัน
- Forecast variance หรือความคลาดเคลื่อนระหว่าง Actual กับ Forecast
- Model ที่ควร Review
- วันที่ทำ Re-forecast ล่าสุด
- กราฟ Portfolio monitoring
- Model health และ Accuracy ของแต่ละ Model
- Timeline ของการอัปโหลดข้อมูล ตรวจ variance และทำ Re-forecast

เมื่อ Actual ต่างจาก Forecast มากหรือ Model health ลดลง ผู้ใช้สามารถกด `สร้าง Re-forecast` เพื่อกลับไปหน้า `/forecast/new` และเริ่มรอบการวิเคราะห์ใหม่

### 8. Settings — ตั้งค่าพื้นที่ทำงานและบัญชี

URL: `/settings`

หน้านี้แบ่งเป็น 3 แนวคิด:

- Notifications: เปิด/ปิด Email alerts, Daily summary และ Alert digest
- Workspace preferences: ตั้ง Auto refresh data และรูปแบบตารางสินค้า
- Account security: เปลี่ยนรหัสผ่านผ่าน `POST /change-password`

ปุ่ม Logout จะเรียก `POST /logout` เมื่อมี token จากนั้นลบ token และข้อมูลผู้ใช้ออกจาก state/localStorage แล้วกลับไปหน้า Login เสมอ แม้ API จะขัดข้องชั่วคราว

## การเชื่อมต่อ Frontend กับ REST API

ไฟล์ `app/lib/api.ts` เป็นจุดกลางสำหรับเรียก API โดยใช้ `VITE_API_BASE_URL` เป็น URL ของ FastAPI และส่ง token ใน header:

```http
Authorization: Bearer <access_token>
```

การเชื่อมต่อหลัก:

| การทำงาน | Endpoint |
| --- | --- |
| สมัครสมาชิก | `POST /register` |
| Login | `POST /login` |
| Logout | `POST /logout` |
| ข้อมูลผู้ใช้ปัจจุบัน | `GET /me` |
| ตรวจ Username | `GET /check-username/{name}` |
| เปลี่ยนรหัสผ่าน | `POST /change-password` |
| จัดการผู้ใช้ | `GET/PUT/DELETE /users...` |

ส่วน Forecast, Product, Alert และ Monitoring ใน Frontend ตอนนี้ยังใช้ Demo data เพื่อให้แสดง User Journey ได้ครบ ส่วน REST API ของ Authentication และ User Management เชื่อมกับ FastAPI/PostgreSQL แล้ว

## โหมดการทำงานของโปรเจกต์

| โหมด | ใช้สำหรับ | แหล่งข้อมูลหลัก |
| --- | --- | --- |
| Full-stack local | พัฒนาและทดสอบระบบจริง | FastAPI + PostgreSQL + JWT |
| GitHub Pages Demo | นำเสนอ Frontend และ User Journey | Demo data + localStorage |

### Full-stack local

```bash
docker compose up --build
```

Frontend จะเรียก FastAPI ที่ `http://localhost:8000` และ FastAPI จะเชื่อม PostgreSQL ใน container `db` โดยสามารถดู API ผ่าน Swagger ที่ `http://localhost:8000/docs` และดูฐานข้อมูลผ่าน Adminer ที่ `http://localhost:8080`

### GitHub Pages Demo

Workflow `.github/workflows/deploy-pages.yml` จะ build โดยตั้งค่า `VITE_DEMO_MODE=true` ทำให้ไม่ต้องเปิด Docker, FastAPI หรือ PostgreSQL เพื่อสาธิตหน้าเว็บ

Demo URL ของโปรเจกต์:

<https://nithi67160346.github.io/Web-Application-AI-Demand-Forecasting/>

ในโหมดนี้:

- Login ใช้ Username หรือ Email ใดก็ได้เพื่อเข้าหน้า Dashboard
- Register สร้าง Demo user และจำข้อมูลไว้ใน browser
- Forecast และข้อมูลธุรกิจเป็นข้อมูลจำลอง
- การเปลี่ยนผู้ใช้จะเกิดเฉพาะใน browser เครื่องนั้น ไม่ได้สร้างข้อมูลใน PostgreSQL

## วิธีทดลอง Demo ตามลำดับ

1. เปิด `/login` แล้ว Login หรือกดสมัครสมาชิก
2. ตรวจ KPI และ Alert จากหน้า Dashboard
3. เข้า Data onboarding แล้วเลือกไฟล์ CSV/Excel เพื่อดู 4 ขั้นตอน
4. เข้า Forecast setup เลือก Product, Region, Period และ External signals
5. กด `Run Forecast` แล้วรอหน้าผลลัพธ์
6. เปิด Explainable AI และไปดู High demand Alert
7. กด `Mark as reviewed` เพื่อจำลอง Human review
8. เปิด Product detail และ Monitoring เพื่อดู Stock cover, Model health และ Re-forecast loop
9. ทดลอง Settings, เปลี่ยนรหัสผ่าน และ Logout

## จุดที่ควรพัฒนาต่อเมื่อนำไปใช้จริง

- สร้าง API สำหรับ Upload, Preview, Column mapping และ Data quality
- เปลี่ยน Demo data เป็นข้อมูลจาก PostgreSQL หรือ Forecast service
- บันทึก Alert review และ Production decision ลงฐานข้อมูล
- เพิ่ม role/permission สำหรับ Planner, Manager และ Admin
- เพิ่ม pagination และ filter ที่เชื่อมกับ Backend จริง
- เพิ่มการทดสอบ API, validation ไฟล์ และการจัดการ error แบบ production
