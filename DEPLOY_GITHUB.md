# เปิด Frontend Demo ด้วย GitHub Pages

ส่วนนี้ใช้ GitHub เท่านั้นสำหรับเก็บโค้ดและเปิดหน้าเว็บ Demo โดยไม่ Deploy FastAPI
หรือ Database ขึ้น Public Server

## 1. สร้าง Repository บน GitHub

สร้าง Repository ใหม่แบบว่าง เช่น `demandly-forecasting-platform` แล้วเปิด PowerShell:

```powershell
cd D:\University\web-application
git remote remove sites
git remote add origin https://github.com/<ชื่อผู้ใช้หรือองค์กร>/<ชื่อ-repository>.git
git add .
git commit -m "Prepare frontend demo for GitHub Pages"
git branch -M main
git push -u origin main
```

ถ้าไม่มี remote ชื่อ `sites` ให้ข้ามคำสั่ง `git remote remove sites` ได้

## 2. เปิดใช้ GitHub Pages

1. เข้า Repository บน GitHub
2. เลือก `Settings` → `Pages`
3. ที่ `Build and deployment` เลือก Source เป็น `GitHub Actions`
4. ไปที่แท็บ `Actions` แล้วรอ workflow ชื่อ `Deploy frontend demo to GitHub Pages` ทำงานเสร็จ

URL Demo จะมีรูปแบบ:

```text
https://<ชื่อผู้ใช้หรือองค์กร>.github.io/<ชื่อ-repository>/
```

## 3. ทดลอง Demo

- เปิด URL หลัก จะเริ่มที่หน้า Login
- กดสมัครสมาชิก แล้วกรอกข้อมูลอะไรก็ได้ตาม validation ของฟอร์ม
- ระบบจะเก็บบัญชี Demo ไว้ใน browser เครื่องนั้น และพาไป Dashboard
- ทดลอง Dashboard, Forecast, Products, Alerts, Data onboarding และ Monitoring ได้

Demo นี้เป็น Frontend จำลองเท่านั้น จึงไม่ได้บันทึกข้อมูลลงฐานข้อมูลจริงและไม่ควรใช้
รหัสผ่านจริง

## 4. อัปเดต Demo ครั้งต่อไป

```powershell
cd D:\University\web-application
git add .
git commit -m "Update frontend demo"
git push
```

ทุกครั้งที่ Push ไป `main` GitHub Actions จะ Build และ Deploy ใหม่

## หมายเหตุ

- GitHub Pages ใช้สำหรับ Frontend แบบ Static เท่านั้น
- FastAPI, PostgreSQL และ Adminer ยังอยู่ในโปรเจกต์สำหรับรันเต็มระบบในเครื่องด้วย Docker Compose
- ห้าม Commit ค่า JWT secret, password หรือไฟล์ `.env` จริงขึ้น GitHub
