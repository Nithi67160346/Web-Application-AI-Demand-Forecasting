# ใช้งาน Demandly กับข้อมูลจำลอง

## เปิดระบบเต็มใน Windows

ทางเลือก Docker Desktop: ดับเบิลคลิก `setup.cmd` แล้ว `start-web.cmd`.

ทางเลือก Local (ไม่ต้องเปิด Docker): ติดตั้ง Node.js >=22.13.0 และ Python >=3.10
แล้วดับเบิลคลิก `setup-local.cmd` จากนั้น `start-local.cmd`.
Local ใช้ PostgreSQL 16 แบบ portable จากแพ็กเกจ npm ที่ pin เวอร์ชัน
เก็บฐานข้อมูลใน `.cache/local-db` ไม่ติดตั้ง Windows service และไม่ใช้ฐานข้อมูล Docker ร่วมกัน.
ถ้าเครื่องนี้มี `.venv` และ runtime แล้ว เปิด `start-local.cmd` ได้ทันที.

URL ที่ใช้จริงแสดงในหน้าต่าง launcher (ถ้าพอร์ตเดิมไม่ว่าง จะใช้พอร์ตถัดไป).
สร้างบัญชีของตัวเองผ่านหน้า Register แล้ว Login. แต่ละบัญชีได้ Workspace ของตัวเอง.
Local database อนุญาต connection แบบ trust เฉพาะ loopback เพื่อใช้ mock lab บนเครื่องเดียว
จึงไม่ควรนำ Local mode ไปเปิดรับ connection จากเครื่องอื่น.

ปิดด้วย `stop-local.cmd` หรือ `stop-web.cmd` ให้ตรงกับโหมดที่เปิด. ข้อมูลยังอยู่.
อย่าลบ `.cache/local-db` / Docker database volume ถ้าต้องการเก็บข้อมูลเดิม.

## Workflow ที่ทำงานกับ DB จริง

หลังเข้าสู่ระบบ หน้าเดิมของเว็บจะแสดงเป็นค่าเริ่มต้น รวม Dashboard, Forecast,
Products, Alerts, Data และ Monitoring. มุมมองนี้ใช้ตัวเลขตัวอย่างเดิมเพื่อแสดงรูปแบบหน้าจอ.
กด **เครื่องมือฐานข้อมูล** ด้านบนเพื่อใช้ข้อมูลที่นำเข้าและผลคำนวณจริงในเมนูเดียวกัน.
เครื่องมือใช้ Sidebar และ Topbar เดิม และกด **หน้าจอเดิม** เพื่อกลับได้ตลอดเวลา.
การสลับมุมมองไม่ลบข้อมูล งานนำเข้า หรือผล Forecast ที่บันทึกไว้.

1. **Data**: เลือก 1 ใน 5 dataset หรือเลือก CSV UTF-8 / Excel `.xlsx` (แผ่นแรก).
2. ตรวจ Preview แล้วจับคู่ Date, Product, Region, Sales, Inventory. CSV ตัวอย่างจับคู่ให้อัตโนมัติ.
3. ดูรายงานทุกแถว: ข้อมูลผิด, วันที่, ค่า inventory ว่าง และแถวเหมือนกันทุกค่า.
4. แก้ข้อมูลผิดในไฟล์ต้นทางก่อนนำเข้า. แถวซ้ำต้องยืนยันให้เก็บ เพราะอาจเป็นธุรกรรมจริงคนละรายการ.
5. เลือก **เพิ่มข้อมูล** หรือเลือก checkbox **แทนที่ยอดขายเดิมของ Workspace** หากเปลี่ยน scenario.
6. กดบันทึก. ระบบนำเข้าทั้งงานเป็น transaction เดียว; กดซ้ำ job เดิมไม่เพิ่มซ้ำ.
7. **Dashboard**: ยอดขาย จำนวนแถว กราฟ และอันดับคำนวณจากข้อมูลที่นำเข้า.
8. **Forecast**: เลือกสินค้า ภูมิภาค และ 7–90 วัน. เว้นวันต้นกำเนิดว่างเพื่อใช้วันที่ล่าสุดในข้อมูล.
9. ดูผล กราฟ ช่วงความไม่แน่นอน MAE/WAPE โมเดล และดาวน์โหลด CSV.
10. **Alerts**: ดูการเปลี่ยนแปลง demand, stock risk และ model error; บันทึกผู้ทบทวน/เหตุผล.
11. **Monitoring**: เทียบ Actual กับ Forecast. ถ้ายังไม่มี Actual ในวันที่พยากรณ์ จะไม่มี Live metrics.
12. กด **จำลอง Actual 7 วันจาก Mock ERP** เพื่อเพิ่มข้อมูลจำลองจริงใน DB แล้วทดลอง Re-forecast.

Dataset 01–04 มีชุดละ 18,250 แถว; dataset 05 มี 200,000 ธุรกรรม.
อย่ารวมหลาย scenario เป็นยอดขายเดียวกันโดยไม่ตั้งใจ: ถ้าต้องการเปรียบเทียบ ให้แทนที่ชุดข้อมูล.
Forecast และ audit เดิมเก็บไว้ แต่ระบบไม่ให้คะแนน Live จาก dataset คนละรุ่นที่ถูกแทนที่.

## ทดลองเหตุการณ์ Demand Spike

นำเข้าชุด `04_demand_spike.csv` แล้วสร้าง Forecast สำหรับ `TK-A-001`, กรุงเทพฯ
ณ วันที่ `2026-07-12`. ระบบจะใช้ประวัติถึงวันนั้นและไม่อ่านยอดขายอนาคตในการฝึก.
ก.ค.–ส.ค. เป็นช่วง spike ของชุดนี้; หากใช้วันที่ล่าสุด `2026-09-30` เหตุการณ์ได้จบไปแล้ว.
จึงไม่ควรคาดหวัง High alert จาก spike ในอดีตทุกครั้งที่รันปลายกันยายน.

## โมเดลและตัวเลขที่แสดง

- โมเดลสถิติที่เลือก: last value, weekday mean, linear trend และ annual seasonal เมื่อมีประวัติพอ.
- ต้องมีอย่างน้อย 112 วันปฏิทินและ 56 วันที่มีข้อมูล. วันขาดหายต้องยืนยันให้เติมศูนย์.
- ใช้ validation 2 ช่วง ช่วงละ 28 วัน เลือกโมเดล; holdout 28 วันท้ายใช้ประเมินแยกต่างหาก.
- MAE คือ error เฉลี่ยต่อวัน; WAPE คือผลรวม absolute error / ผลรวม Actual. ถ้า Actual รวมเป็นศูนย์ WAPE ไม่มีค่า.
- ไม่มีการแสดง accuracy/confidence ที่กำหนดขึ้นเอง. ช่วง uncertainty ใช้ empirical holdout residual
  และขยายตาม horizon ไม่รับประกัน coverage 95% ในอนาคต.
- disease +15% เฉพาะ ก.ค.–ส.ค., policy +5%, population +2% เป็น **สมมติฐาน mock**
  ที่ปรับ baseline ไม่ใช่ข้อมูลจากหน่วยงานภายนอก และไม่ใช่โมเดล causal.
- Inventory ใช้ snapshot ล่าสุดต่อสินค้า/ภูมิภาค ไม่รวม inventory ของธุรกรรมทุกแถว.
  ตั้ง Lead time / Safety stock ที่หน้าสินค้า ก่อนใช้ stock-risk alert.

## ทีมและสิทธิ์

Owner เพิ่มผู้ใช้ที่สมัครไว้แล้วให้ Workspace และกำหนด admin/planner/viewer ได้.
Admin ตั้งค่า Workspace และเขียนข้อมูล; Planner นำเข้า Forecast/Review; Viewer อ่านเท่านั้น.
เลือก Workspace ที่มุมบนเพื่อสลับทีม. ผู้ไม่อยู่ในทีมอ่านข้อมูลไม่ได้.
Settings บันทึกใน DB; auto refresh ทำทุก 15 นาที. แจ้งเตือนในแอปเท่านั้น.
เปลี่ยนรหัสผ่านแล้ว session เดิมทั้งหมดใช้ไม่ได้ ต้อง Login ใหม่.

## Indexing

หน้า Data มี Query จริงพร้อมเวลาเฉพาะ database และ `EXPLAIN (ANALYZE, BUFFERS)`.
EXPLAIN เป็น query ครั้งที่สอง อาจได้ประโยชน์จาก cache จึงไม่ใช่เวลาเดียวกับ query ครั้งแรก.
การเปรียบเทียบก่อน/หลัง index และต้นทุน INSERT อยู่ใน `indexing-lab/README.md`.
ระบบใช้งานไม่ลบ index ของข้อมูลผู้ใช้เพื่อสาธิต.

## ขอบเขต

ระบบครบ workflow สำหรับนำเข้า/พยากรณ์/Review/Monitor กับ mock data และไฟล์รูปแบบเดียวกัน.
ERP และ external signals เป็น simulator. ไม่มีการส่ง email, subscription/billing หรือคำสั่งผลิต.
โมเดลที่ดีบน synthetic data ไม่พิสูจน์ผลกับข้อมูลธุรกิจจริง.
GitHub Pages เป็น static demo รุ่นเดิม; ระบบที่เชื่อม PostgreSQL ต้องรัน Local/Docker
หรือ deploy Backend + DB ตาม `docs/OPERATIONS.md`.
