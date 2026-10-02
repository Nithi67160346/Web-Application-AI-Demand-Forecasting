# รายงานทดลอง Database Indexing — Demandly

ชื่อ / รหัสนิสิต: ...
วันที่ทดลอง / เครื่อง / CPU / RAM / PostgreSQL version: ...
จำนวนข้อมูล: ...; จำนวน warm-up: ...; จำนวนครั้งที่วัด: ...
แนบ `results/benchmark.md`, `benchmark.csv` และ `benchmark.json` ที่รันจริง

## หลักฐานข้อมูลและ index

ยืนยัน fingerprint และจำนวนแถวเหมือนกัน: ...
รายชื่อ index ของ baseline (ต้องมี Primary Key): ...
รายชื่อ index ของฐานที่ปรับปรุง: ...

## เวลาและ Query Plan

| Query | ก่อน (median ms) | หลัง (median ms) | ก่อน/หลัง | Scan/index ที่ใช้ | Buffers ก่อน/หลัง |
|---|---:|---:|---:|---|---|
| Exact date | | | | | |
| Product/region/date range | | | | | |
| Latest page | | | | | |
| Cursor page | | | | | |
| Daily totals | | | | | |
| COUNT date | | | | | |
| Wide range | | | | | |

## ต้นทุนและข้อจำกัด

| รายการ | ไม่มี secondary index | มี index โปรเจกต์ | เพิ่ม index ที่ไม่จำเป็น |
|---|---:|---:|---:|
| Table size | | | |
| Index size | | | |
| INSERT 200,000 rows (ms) | | | |

1. Query ใดเร็วขึ้นมากที่สุด เพราะเหตุใด? อ้าง Index Cond และ buffers
2. Query ใดไม่ดีขึ้น และเหตุใด Seq Scan จึงอาจเหมาะกว่า?
3. Rewrite filter วันที่จาก to_char เป็น range ส่งผลต่อแผนอย่างไร?
4. เปลี่ยนลำดับ composite index แล้วส่งผลต่อ product/region/date query อย่างไร?
5. Index เพิ่มพื้นที่และต้นทุน INSERT เท่าไร? คุ้มกับ workload ใด?
6. เลือก index สำหรับ workshop แล้วแนบ EXPLAIN ก่อน/หลังพร้อม SQL
7. จุดที่นำไปใช้กับโปรเจกต์ตนเอง: ตาราง, endpoint, filter/order, DDL และเหตุผล
8. ข้อจำกัดของการทดลอง: cache, การกระจายข้อมูล, ขนาดข้อมูล, เครื่อง, concurrency

## ผลตรวจสอบการใช้งานจริง

- ทดลอง POST /sales/batch และอ่าน /sales, /sales/daily: ...
- ตรวจว่าผู้ใช้คนอื่นมองไม่เห็นยอดขายของเรา: ...
- คืน experimental indexes/ข้อมูล lab หลังจบ: ...
- การปรับปรุงถัดไปตามหลักฐานที่พบ: ...
