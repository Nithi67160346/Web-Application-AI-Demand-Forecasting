# Demandly REST API

FastAPI service สำหรับ authentication และ user management ของโปรเจกต์

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
