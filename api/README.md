# Demandly REST API

FastAPI service สำหรับ authentication, user management และยอดขายจริงที่ค้นผ่าน database indexes

## Run with Docker Compose

จากโฟลเดอร์โปรเจกต์หลัก:

```bash
docker compose up --build
```

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`
- Database viewer (Adminer): `http://localhost:8080`

โปรเจกต์ใช้ PostgreSQL ดังนั้นใช้ Adminer สำหรับเปิดดูข้อมูลแทน phpMyAdmin
ซึ่งรองรับ MySQL/MariaDB โดยให้เลือก System เป็น PostgreSQL และ Server เป็น `db`

## Endpoints

### Sales history และ Database Indexing

- `POST /sales/batch`: bulk insert 1–1,000 แถว สำหรับผู้ใช้ที่ login
- `GET /sales`: filter `product_code`, `region`, `start_date`, `end_date` (exclusive)
  และ `limit` 1–100; ใช้ `next_cursor` เป็น `cursor` ของหน้าถัดไปกับ filter เดิม
- `GET /sales/daily`: รวมยอดรายวัน ช่วงไม่เกิน 366 วัน; ต้องระบุ start/end

ทุก endpoint ต้องใช้ Bearer token และอ่าน/เขียนเฉพาะยอดขายของผู้ใช้ปัจจุบัน
ตารางใหม่ `sales_records` มี composite index สำหรับ product/region/date
และ index สำหรับ user/date โดย SQLAlchemy สร้างให้เมื่อสร้างตารางใหม่
ฐานที่มีตารางเดิมใช้ `sql/001-sales-records.sql` และ `sql/002-sales-indexes.sql`
ผ่าน psql; CREATE INDEX CONCURRENTLY ต้องรันนอก transaction

ดู [คู่มือ indexing lab](../indexing-lab/README.md) สำหรับข้อมูล 1 ล้านแถว
บททดลองตาม ZIP, วิธีวัดผล และ migration ของฐานเดิม
ข้อมูล Sales จริงส่วนนี้ยังไม่ได้เชื่อมเข้า Frontend demo หรือโมเดล AI

### Authentication

- `POST /register` สมัครสมาชิกและคืน JWT access token
- `POST /login` เข้าสู่ระบบด้วย username หรือ email
- `POST /logout` revoke token ปัจจุบัน
- `POST /change-password` เปลี่ยนรหัสผ่านของผู้ใช้ปัจจุบัน

### User management

- `GET /me` ข้อมูลของผู้ใช้ปัจจุบัน
- `GET /users/{id}` ข้อมูลผู้ใช้ตาม id
- `GET /users?skip=0&limit=20` รายการผู้ใช้แบบ pagination
- `PUT /users/{id}` แก้ไข profile ของตนเอง หรือแก้ไขผู้อื่นเมื่อเป็น admin
- `DELETE /users/{id}` ลบผู้ใช้ของตนเอง หรือผู้ใช้คนอื่นเมื่อเป็น admin
- `GET /check-username/{name}` ตรวจสอบ username ว่าว่างหรือไม่

Endpoint ที่ต้องยืนยันตัวตนใช้ header:

```text
Authorization: Bearer <access_token>
```

Swagger สามารถทดลอง request ได้จาก `/docs`
