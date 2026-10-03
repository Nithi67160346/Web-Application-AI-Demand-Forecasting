# การตรวจหน้าจอเดิมที่เชื่อมกับฐานข้อมูล

## Interactive demo สำหรับ GitHub Pages (3 ตุลาคม 2026)

- Browser workflow tests 6 กรณีผ่าน: CSV quoted/multiline/zero, invalid import atomicity,
  duplicate acknowledgement/idempotence, Forecast cutoff และ stock snapshot,
  Monitoring/replace lineage, persistence ของ settings/product/review,
  concurrent tabs และ XLSX date/shared strings/column mapping/zero.
- ทดสอบ static export ที่ path /Web-Application-AI-Demand-Forecasting/ ผ่าน browser:
  เปิด demo ไม่ใช้รหัสผ่าน, อัปโหลด CSV 140 รายการ, Forecast 30 วันรวม 3,255 หน่วย,
  stock Alert, บันทึก Review, นำเข้า Actual 7 วัน และ Monitoring แสดง Live WAPE 4.86%.
- Refresh หน้ารายละเอียด Forecast ผ่าน static 404 fallback แล้วยังเปิดผลที่บันทึกไว้ได้.
- Demo เริ่มว่างและไม่มี server-side user/database; ข้อมูลตัวอย่างต้องดาวน์โหลดแล้วอัปโหลดเอง.
  บัญชีและ PostgreSQL ในระบบเต็มไม่ถูกเปลี่ยนจากการใช้งาน Pages.
- ESLint, TypeScript, build ระบบเต็ม และ rendered-route tests 2 กรณีผ่าน.

ตรวจวันที่ 3 ตุลาคม 2026 (Asia/Bangkok) ก่อนเผยแพร่การแก้ไขขึ้น branch main ตามคำขอของผู้ใช้.

- API behavioral tests 20 กรณีผ่าน รวม product summary แยกพื้นที่ทำงาน และ Forecast 180 วันตาม cutoff.
- ESLint, TypeScript, production build และ rendered-route tests 2 กรณีผ่านหลังปรับหน้าจอ.
- ทดสอบผ่านเบราว์เซอร์ด้วยบัญชี QA แยกจากผู้ใช้: บัญชีใหม่ว่าง, นำเข้า 18,250 รายการ,
  Forecast 180 วันได้ 32,661.74 หน่วย, แก้ Safety stock, Forecast 30 วันได้ 5,447.33 หน่วย.
- Alert จาก stock risk บันทึกผล Review พร้อม username/time/note ผ่านหน้าเดิม.
- อัปโหลด CSV ยอดขายใหม่ 7 รายการผ่าน file picker; Preview, mapping, quality และ commit ผ่าน.
  Monitoring เทียบ Actual 180 หน่วยต่อวันกับ Forecast เดิม แสดง Live WAPE 2.021% และ matched 7 วันต่อรอบ.
- การทดสอบใช้ข้อมูลสังเคราะห์เฉพาะบัญชี QA; ไม่แก้หรือแทนที่ยอดขายของบัญชีผู้ใช้เดิม.
- หน้า Data ปัจจุบันให้ผู้ใช้เลือกไฟล์เอง ไม่มี Data library และไม่เติมข้อมูลให้บัญชีใหม่.
- บันทึก Settings ผ่านหน้าเว็บแล้วโหลดใหม่: ชื่อพื้นที่ทำงาน, threshold และ compact table คงอยู่.
  ตรวจ PostgreSQL หลังรีสตาร์ตพบยอดขาย QA 18,257 รายการ; export 30 วันมี 31 บรรทัดรวม header.
- Forecast ย้อนหลัง ณ 2026-09-30 เก็บ inventory snapshot วันที่เดียวกัน 3,626 หน่วย
  แม้มีคงคลังวันที่ใหม่กว่าในฐานข้อมูลแล้ว; ไม่ใช้ข้อมูลอนาคตประกอบผลย้อนหลัง.

## ผลตรวจเดิมก่อนปรับหน้าเว็บ


ตรวจวันที่ 3 ตุลาคม 2026 (Asia/Bangkok).

## ผ่านแล้ว

- API behavioral tests 18 กรณี: atomic import, validation, duplicate acknowledgement,
  idempotence แม้เพิ่มไฟล์อื่นไปแล้ว, tenant isolation/roles, privacy, password/session revocation,
  request/rate limits, Excel mapping/zero values, Forecast cutoff ไม่อ่านข้อมูลอนาคต,
  temporal model selection, Alert review, mock ERP/Monitoring, lineage หลังเปลี่ยน dataset และ Settings persistence.
- ESLint, TypeScript `tsc --noEmit`, production frontend build และ rendered-route tests 2 กรณี.
- เปิดผ่าน Local launcher กับ PostgreSQL 16.14 จริง; stop/restart รักษาข้อมูลและเลือกพอร์ตว่างได้.
- HTTP integration ใช้ **ทุกแถวของ dataset ทั้ง 5 ชุด**: DB count และยอดรวมตรง CSV,
  นำเข้า job เดิมซ้ำไม่เพิ่มข้อมูล, Forecast 30 วัน/holdout 28 วัน, Alerts/Review,
  Monitoring และ PostgreSQL query plans.
- ทดสอบผ่าน browser: Login, Dashboard 200,000 แถว, Run Forecast สร้างผลบันทึกจริง,
  ดูประวัติ, dataset validation และ mock ERP เพิ่ม Actual 7 วันแล้วแสดง Live metrics.
- สำรองด้วย REPEATABLE READ แล้วกู้คืนใน DB ใหม่ ตรวจจำนวนและ SHA-256 เนื้อหาทุกตาราง
  ตรง backup snapshot, migration และ generated ID หลัง restore ทำงาน.
- Docker Compose dev/production configuration ตรวจผ่าน.

## ผลตัวอย่างจาก PostgreSQL

ใช้ TK-A-001 / กรุงเทพฯ, horizon 30 วัน, origin 2026-09-30,
ไม่เปิด mock disease/policy/population. WAPE เป็น holdout baseline ไม่ใช่ confidence.

| Dataset | แถว | โมเดลที่เลือก | Holdout WAPE | Forecast 30 วัน |
|---|---:|---|---:|---:|
| Stable | 18,250 | weekday_mean | 5.022% | 5,447.33 |
| Growth | 18,250 | linear_trend | 5.844% | 10,363.80 |
| Seasonal | 18,250 | annual_seasonal | 6.128% | 5,270.61 |
| Demand spike | 18,250 | last_value | 4.768% | 5,340.00 |
| Large / skewed | 200,000 | last_value | 5.017% | 104,970.00 |

ชุด Large มี 4,072 แถวที่เหมือนกันทุกค่า ต้องยืนยันก่อนนำเข้า; ไม่ลบธุรกรรมอัตโนมัติ.
หลักฐาน HTTP รายชุดอยู่ใน `docs/evidence/workflow-verification.json`.
เวลาในรายงานขึ้นกับเครื่อง/cache ไม่ใช่ SLA หรือการวัด concurrency.

## ขอบเขตการตรวจ

Docker Desktop บนเครื่องนี้เปิด engine ไม่สำเร็จในรอบตรวจ จึงตรวจ runtime ระบบเต็ม
ด้วย PostgreSQL Local แทน. ไม่อ้างว่า production Compose containers ผ่าน runtime test.
Production profile ยังไม่ได้ deploy ไป cloud และยังไม่ทดสอบ load หลายผู้ใช้พร้อมกัน.
CI workflow เพิ่มใน repository แล้ว; ผลบน GitHub ต้องอ่านหลัง push.
ข้อมูลสังเคราะห์และสัญญาณ mock ไม่พิสูจน์ผลลัพธ์กับข้อมูลธุรกิจจริง.
