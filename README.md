# 🎤 คาราโอเกะโอเกะ — Karaoke Room Booking (Full-stack)

เว็บแอปจองห้องคาราโอเกะ สร้างตาม User Journey Map 10 ระยะ พร้อมแผนผังห้องแบบ 3D
ที่แสดงสถานะห้องว่าง/ไม่ว่างด้วยไฟสี (เขียว/ฟ้า = ว่าง, แดง = ไม่ว่าง)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | React 19 + Vite |
| 3D | Three.js ผ่าน `@react-three/fiber` + `@react-three/drei` |
| Routing | `react-router-dom` (HashRouter — deploy ง่ายบน static host ใด ๆ โดยไม่ต้องตั้งค่า rewrite) |
| State | React Context (`BookingContext`) — เชื่อมข้อมูลกับ REST API |
| Styling | Plain CSS + CSS variables (design tokens), ไม่ใช้ framework เพื่อให้เห็นโครงสร้างชัดเจน |
| Backend | Express + TypeScript + Prisma |
| Database | PostgreSQL ผ่าน Docker Compose |

## เริ่มต้นใช้งาน

```powershell
docker compose up --build   # PostgreSQL + API + frontend
# เปิดเว็บที่ http://localhost:5173

# ถ้าต้องการรันเฉพาะ frontend แบบ local (ต้องมี Node.js/npm)
npm install
npm run dev                 # http://localhost:5173
npm run build               # สร้างไฟล์ production ที่ dist/
npm run preview             # ดูผลลัพธ์ build ก่อน deploy จริง
```

API ใช้ base URL `http://localhost:3000/api/v1` และ frontend ตั้งค่าไว้ใน `.env` ผ่าน `VITE_API_URL`

บัญชีสำหรับทดลองระบบ:

- Admin: `admin` / `Admin12345!`
- User: `demo_user` / `Demo12345!`

## โครงสร้างโปรเจกต์

```
src/
├── main.jsx                 # จุดเริ่มแอป
├── App.jsx                  # Router + Layout (Navbar + Stepper + Routes)
├── index.css                # Design tokens (สี, ฟอนต์) + global styles
├── context/
│   └── BookingContext.jsx   # เก็บ state การจองทั้งหมดข้ามหน้า (branch, room, time, addons, user, payment...)
├── data/
│   └── rooms.js             # room type/time slot metadata สำหรับแสดงผล
├── services/
│   └── api.js               # ตัวช่วยเรียก REST API และแนบ Bearer token
├── components/
│   ├── Navbar.jsx            # แถบเมนูบนสุด
│   ├── JourneyStepper.jsx    # แถบขั้นตอน 10 ระยะ (sync กับ URL)
│   ├── Room3D.jsx             # ★ ฉาก 3D แผนผังห้อง — หัวใจของงานนี้
│   └── RoomLegend.jsx         # คำอธิบายสีไฟสถานะ
└── pages/                    # 1 หน้า = 1 ระยะใน User Journey
    ├── Home.jsx               # 1. รู้จัก/ค้นหาข้อมูล
    ├── SearchRooms.jsx        # 2. ค้นหา ห้องคาราโอเกะ
    ├── RoomSelection.jsx      # 3. เลือกห้อง & วันเวลา (ใช้ Room3D)
    ├── AddOns.jsx             # 4. เพิ่มบริการเสริม
    ├── Auth.jsx               # 5. สมัคร/เข้าสู่ระบบ
    ├── Checkout.jsx           # 6. ตรวจสอบ & ชำระเงิน
    ├── Confirmation.jsx       # 7. ยืนยันการจอง (QR Code)
    ├── Notifications.jsx      # 8. แจ้งเตือนก่อนถึงวันจอง
    ├── CheckIn.jsx            # 9. เช็คอินที่ร้าน (สแกน QR)
    └── Review.jsx             # 10. รีวิว / Feedback

api/                           # Express + Prisma REST API
docker-compose.yml             # PostgreSQL + API containers
```

## แผนผังห้อง 3D ทำงานอย่างไร (`Room3D.jsx`)

- แต่ละห้องคือ `<mesh>` กล่อง 3D วางบนกริด 4x3 โดยโหลดจาก `GET /api/v1/branches/:branchId/rooms`
- สถานะห้องกำหนดสี:
  - **ว่าง** → สีฟ้า/เขียวนีออน (`--status-available`)
  - **ไม่ว่าง** → สีแดง (`--status-occupied`) พร้อมไฟกระพริบเบา ๆ (`useFrame` ปรับ `intensity` ของ `pointLight` ตามเวลา)
  - **เลือกอยู่** → สีทอง (`--neon-gold`)
- คลิกที่ห้อง → เรียก `onSelect(room)`; ถ้าห้องไม่ว่างจะไม่ให้เลือก (`if (room.status === 'occupied') return`)
- ใช้ `OrbitControls` ให้ผู้ใช้หมุน/ซูมดูห้องได้อิสระ
- ป้ายชื่อห้องลอยเหนือกล่องทำด้วย `<Html>` จาก drei (แสดง DOM จริงในพิกัด 3D)

**การเชื่อมกับ Backend:** frontend เรียก
`GET /api/v1/branches/:branchId/rooms?date=...&startTime=...&durationHours=2`
และแปลง `available` จาก API เป็นสถานะสำหรับแสดงผล 3D
(แนะนำใช้ WebSocket หรือ polling ทุก 10-15 วิ เพื่อให้ไฟสถานะอัปเดตเมื่อมีคนอื่นจองพร้อมกัน)

## Workflow การทำงานของระบบ (ตาม User Journey)

```
1. รู้จัก/ค้นหาข้อมูล  →  2. ค้นหาห้อง  →  3. เลือกห้อง+เวลา (3D)  →  4. บริการเสริม
        ↓                                                                    ↓
10. รีวิว  ←  9. เช็คอิน (QR)  ←  8. แจ้งเตือน  ←  7. ยืนยันจอง (QR)  ←  6. ชำระเงิน  ←  5. Login
```

**รายละเอียดการไหลของข้อมูล (state) ผ่าน `BookingContext`:**

1. **หน้าแรก** → ผู้ใช้กดเริ่มค้นหา ไม่มี state ใดถูกตั้งค่า
2. **ค้นหา** → เลือกสาขา → บันทึกลง `state.branch`
3. **เลือกห้อง** → โหลดห้องทั้งหมดของสาขาจาก API → render เป็น 3D →
   ผู้ใช้คลิกห้องว่าง + เลือกเวลา → บันทึก `state.room`, `state.time`, `state.date`
4. **บริการเสริม** → toggle รายการ → บันทึก `state.addOns` (array of id)
5. **Login** → เรียก `POST /api/v1/auth/login` หรือ `POST /api/v1/auth/register` → เก็บ Bearer token และ `state.user`
6. **ชำระเงิน** → เรียก `POST /api/v1/bookings` เพื่อสร้างการจอง →
   เรียก `POST /api/v1/bookings/:id/pay` เพื่อยืนยันการชำระเงินจำลอง → ได้ `bookingCode`
   - ระบบ API คำนวณราคาและตรวจสอบห้องซ้ำจากฐานข้อมูล
7. **ยืนยันการจอง** → แสดง QR Code (ตอนนี้ใช้ QR generator API ฟรีเพื่อ demo)
   - **Production:** ควร generate QR ฝั่ง backend และผูกกับ booking ID จริงในฐานข้อมูล
8. **แจ้งเตือน** → แสดงตัวอย่างการแจ้งเตือนที่ระบบจะส่ง (Push/LINE/SMS)
   - **Production:** ใช้ cron job / message queue (เช่น BullMQ) ยิงแจ้งเตือนตามเวลาจริงก่อนถึงวันจอง
9. **เช็คอิน** → เรียก `POST /api/v1/bookings/:id/check-in` และอัปเดตสถานะ booking
10. **รีวิว** → ให้ดาว + คอมเมนต์ → ส่งไป `POST /api/v1/bookings/:id/review`

## REST API และ Docker

backend อยู่ในโฟลเดอร์ `api/` และใช้ PostgreSQL ผ่าน `docker-compose.yml`

```text
api/
├── prisma/schema.prisma       # User, Session, Branch, Room, Booking, Review
├── prisma/seed.ts             # ข้อมูลสาขา ห้อง บริการเสริม และ user ทดสอบ
└── src/
    ├── routes/auth.ts         # register/login/logout/change-password
    ├── routes/users.ts        # me/users/check-username
    ├── routes/catalog.ts      # branches/rooms/add-ons
    └── routes/bookings.ts     # booking/pay/cancel/check-in/review
```

เส้นทาง API หลักอยู่ใต้ `/api/v1`:

| Method | Path | รายละเอียด |
|---|---|---|
| POST | `/auth/register` | สมัครสมาชิก |
| POST | `/auth/login` | เข้าสู่ระบบ |
| POST | `/auth/logout` | ออกจากระบบ |
| POST | `/auth/change-password` | เปลี่ยนรหัสผ่าน |
| GET | `/me` | ข้อมูลตัวเอง |
| GET | `/users` | รายการ user แบบ pagination |
| GET | `/branches/:branchId/rooms` | ห้องและสถานะว่างตามวัน/เวลา |
| POST | `/bookings` | สร้างการจอง |
| POST | `/bookings/:id/pay` | ชำระเงินจำลอง |
| POST | `/bookings/:id/check-in` | เช็คอิน |
| POST | `/bookings/:id/review` | บันทึกรีวิว |

การชำระเงินในโปรเจกต์นี้ยังเป็น demo endpoint ไม่ใช่ payment gateway จริง

## Guest and member flow

- Guest mode can open the home page, search branches, view live room availability, choose a room, and select add-ons without signing in.
- Login or registration is required only when the user confirms and pays for a booking. The selected room and add-ons remain in the current session.
- Members can continue from add-ons directly to checkout, complete the booking through the REST API, receive a booking QR code, check in, and submit a review.
- `docker compose up --build` starts PostgreSQL, the API, and the frontend together. Open `http://localhost:5173` after the containers become healthy.

## Deploy

Frontend build ด้วย Vite เป็น static site — deploy ได้กับ:

- **Vercel:** `vercel.json` เตรียมไว้แล้ว → เชื่อม repo แล้วกด deploy ได้เลย
- **Netlify:** `netlify.toml` เตรียมไว้แล้ว → เชื่อม repo หรือลาก `dist/` ไปวางบน Netlify Drop
- **Static host อื่น ๆ** (GitHub Pages, Cloudflare Pages): รัน `npm run build` แล้วอัปโหลดโฟลเดอร์ `dist/`
  (ใช้ HashRouter อยู่แล้ว จึงไม่ต้องตั้งค่า rewrite rule สำหรับ client-side routing)

Backend ต้อง deploy แยกบนเครื่องที่รัน Docker/PostgreSQL ได้ และตั้งค่า `VITE_API_URL` ให้ชี้ไปยัง API จริง


67160168 ณัฐวัฒน์ บุญไขรัศมี
67160346 นิธิ วรรณวงษ์
