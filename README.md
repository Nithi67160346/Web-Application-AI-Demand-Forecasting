# 🎤 คาราโอเกะโอเกะ — Karaoke Room Booking (Frontend)

เว็บแอปจองห้องคาราโอเกะ สร้างตาม User Journey Map 10 ระยะ พร้อมแผนผังห้องแบบ 3D
ที่แสดงสถานะห้องว่าง/ไม่ว่างด้วยไฟสี (เขียว/ฟ้า = ว่าง, แดง = ไม่ว่าง)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | React 19 + Vite |
| 3D | Three.js ผ่าน `@react-three/fiber` + `@react-three/drei` |
| Routing | `react-router-dom` (HashRouter — deploy ง่ายบน static host ใด ๆ โดยไม่ต้องตั้งค่า rewrite) |
| State | React Context (`BookingContext`) — จำลอง global state ของการจอง |
| Styling | Plain CSS + CSS variables (design tokens), ไม่ใช้ framework เพื่อให้เห็นโครงสร้างชัดเจน |

## เริ่มต้นใช้งาน

```bash
npm install
npm run dev        # http://localhost:5173
npm run build       # สร้างไฟล์ production ที่ dist/
npm run preview     # ดูผลลัพธ์ build ก่อน deploy จริง
```

## โครงสร้างโปรเจกต์

```
src/
├── main.jsx                 # จุดเริ่มแอป
├── App.jsx                  # Router + Layout (Navbar + Stepper + Routes)
├── index.css                # Design tokens (สี, ฟอนต์) + global styles
├── context/
│   └── BookingContext.jsx   # เก็บ state การจองทั้งหมดข้ามหน้า (branch, room, time, addons, user, payment...)
├── data/
│   └── rooms.js             # Mock data — จุดเชื่อมต่อ API จริงในอนาคต
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
```

## แผนผังห้อง 3D ทำงานอย่างไร (`Room3D.jsx`)

- แต่ละห้องคือ `<mesh>` กล่อง 3D วางบนกริด 4x3 (`generateRooms()` ใน `data/rooms.js`)
- สถานะห้องกำหนดสี:
  - **ว่าง** → สีฟ้า/เขียวนีออน (`--status-available`)
  - **ไม่ว่าง** → สีแดง (`--status-occupied`) พร้อมไฟกระพริบเบา ๆ (`useFrame` ปรับ `intensity` ของ `pointLight` ตามเวลา)
  - **เลือกอยู่** → สีทอง (`--neon-gold`)
- คลิกที่ห้อง → เรียก `onSelect(room)`; ถ้าห้องไม่ว่างจะไม่ให้เลือก (`if (room.status === 'occupied') return`)
- ใช้ `OrbitControls` ให้ผู้ใช้หมุน/ซูมดูห้องได้อิสระ
- ป้ายชื่อห้องลอยเหนือกล่องทำด้วย `<Html>` จาก drei (แสดง DOM จริงในพิกัด 3D)

**การเชื่อมกับ Backend จริง:** แทนที่ `generateRooms()` ด้วย API call เช่น
`GET /api/branches/:id/rooms?date=...&time=...` ที่คืนค่า `status` ของแต่ละห้องแบบเรียลไทม์
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
3. **เลือกห้อง** → โหลดห้องทั้งหมดของสาขา (mock: `generateRooms`) → render เป็น 3D →
   ผู้ใช้คลิกห้องว่าง + เลือกเวลา → บันทึก `state.room`, `state.time`, `state.date`
4. **บริการเสริม** → toggle รายการ → บันทึก `state.addOns` (array of id)
5. **Login** → mock OAuth (Google/LINE/Facebook) → บันทึก `state.user`
   - **Production:** แทนที่ด้วย NextAuth.js, Firebase Auth, หรือ Supabase Auth จริง
6. **ชำระเงิน** → คำนวณราคารวมจาก `roomType.pricePerHr * ชม. + addOns` →
   เลือกช่องทาง (PromptPay/บัตร/Wallet) → เรียก `confirmBooking()` → ได้ `bookingCode`
   - **Production:** เรียก payment gateway จริง เช่น Omise, 2C2P, GB Prime Pay
     แล้วรอ webhook ยืนยันการชำระก่อนตั้งค่า `paid: true`
7. **ยืนยันการจอง** → แสดง QR Code (ตอนนี้ใช้ QR generator API ฟรีเพื่อ demo)
   - **Production:** ควร generate QR ฝั่ง backend และผูกกับ booking ID จริงในฐานข้อมูล
8. **แจ้งเตือน** → แสดงตัวอย่างการแจ้งเตือนที่ระบบจะส่ง (Push/LINE/SMS)
   - **Production:** ใช้ cron job / message queue (เช่น BullMQ) ยิงแจ้งเตือนตามเวลาจริงก่อนถึงวันจอง
9. **เช็คอิน** → จำลองการสแกน QR → ตั้งค่า `state.checkedIn = true`
   - **Production:** ใช้ library สแกนกล้องจริงเช่น `html5-qrcode` แล้วส่ง booking code ไป backend
     เพื่อตรวจสอบสิทธิ์และอัปเดตสถานะห้องเป็น "ไม่ว่าง" แบบเรียลไทม์
10. **รีวิว** → ให้ดาว + คอมเมนต์ → บันทึก `state.review`
    - **Production:** ส่งไป `POST /api/reviews` และแสดงผลรวมกับรีวิวคนอื่นในหน้าค้นหา

## แนวทางต่อยอดเป็น Full-stack

โปรเจกต์นี้คือ **frontend only** (mock data ทั้งหมดอยู่ใน `src/data/rooms.js`) ออกแบบให้
สลับไปเรียก API จริงได้ง่าย โดยแนะนำโครงสร้าง backend ดังนี้:

```
backend (แยก repo หรือ /api):
├── /api/branches              GET  รายชื่อสาขา
├── /api/rooms?branch&date&time GET  สถานะห้องแบบเรียลไทม์ (ใช้ WebSocket ถ้าต้องการ)
├── /api/bookings               POST สร้างการจอง
├── /api/payments/webhook       POST รับผลการชำระเงินจาก payment gateway
├── /api/checkin                POST ยืนยันเช็คอินจาก QR scan
└── /api/reviews                POST/GET รีวิว
```

Database แนะนำ: PostgreSQL (ตาราง `branches`, `rooms`, `bookings`, `addons`, `reviews`)
พร้อม index บน `(room_id, date, time)` เพื่อเช็คห้องว่างเร็ว และป้องกันการจองซ้อน (unique constraint)

## Deploy

โปรเจกต์นี้ build ด้วย Vite เป็น static site — deploy ได้ทันทีกับ:

- **Vercel:** `vercel.json` เตรียมไว้แล้ว → เชื่อม repo แล้วกด deploy ได้เลย
- **Netlify:** `netlify.toml` เตรียมไว้แล้ว → เชื่อม repo หรือลาก `dist/` ไปวางบน Netlify Drop
- **Static host อื่น ๆ** (GitHub Pages, Cloudflare Pages): รัน `npm run build` แล้วอัปโหลดโฟลเดอร์ `dist/`
  (ใช้ HashRouter อยู่แล้ว จึงไม่ต้องตั้งค่า rewrite rule สำหรับ client-side routing)


67160168 ณัฐวัฒน์ บุญไขรัศมี
67160346 นิธิ วรรณวงษ์