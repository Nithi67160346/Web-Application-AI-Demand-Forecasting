# ผลตรวจสอบและทดลองจริง

ทดสอบวันที่ **3 ตุลาคม 2026 เวลา 03:58 น. (Asia/Bangkok)**
ด้วย PostgreSQL **16.14, Windows x64** แบบ portable ภายใน workspace
ใช้ฐานทดลองสองฐานบน server เดียวกันที่ localhost (shared_buffers ค่าเริ่มต้น 128 MB)
Docker Desktop บนเครื่องนี้เริ่มแล้วปิดตัวเอง จึงตรวจ Compose ด้วย `config --quiet`
และตรวจ SQL/API บน PostgreSQL portable; ยังไม่ได้ตรวจการเปิด containers จริง

## การตรวจสอบที่ผ่าน

- Functional API tests 4 ชุดบน SQLite ที่แยกในหน่วยความจำ:
  authentication/validation, ownership/keyset pagination, exclusive end date/daily totals,
  และ cascade delete
- ทดลอง Register, bulk INSERT, history pages ที่มีวันที่ซ้ำ, daily aggregation,
  validation และลบเจ้าของข้อมูลกับ PostgreSQL จริง ผ่านทั้งหมด
- ตรวจชื่อและลำดับ column ของ index ที่ ORM สร้าง ตรงกับ DDL ที่ใช้ใน lab
- รัน SQL ของทุกบท lab บน PostgreSQL จริง รวม live index, pitfalls, composite,
  INSERT cost, workshop queries และ extra-index cost ไม่มี SQL error
- ทดลอง migration index ซ้ำ ไม่มี error
- หลังแต่ละชุดทดลอง ROLLBACK คืน index/data และเหลือ 1,000,000 แถวตามเดิม
- Benchmark ตรวจ row count และ fingerprint ของทุก field ตรงกันทั้งสองฐาน
  ตรวจผลลัพธ์ของทั้ง 7 query ตรงกัน และตรวจรายชื่อ index ตรงกับ baseline/optimized

## ผล query ก่อน/หลัง

ใช้ median ของ 5 ครั้ง หลัง warm-up หนึ่งครั้งต่อ query/database
สลับลำดับฐานที่วัด ไม่บังคับปิด Seq Scan
ก่อนบันทึกผลสุดท้าย REINDEX และ VACUUM ANALYZE ทั้งสองฐานทดลอง
เพื่อคืนสภาพ index หลังการทดลอง INSERT/ROLLBACK

| Query | ไม่มี secondary index (ms) | มี index (ms) | เร็วขึ้น |
|---|---:|---:|---:|
| Exact date ของผู้ใช้ | 69.758 | 0.754 | 92.52 เท่า |
| สินค้า + ภูมิภาค + ช่วงวันที่ | 67.725 | 0.196 | 345.54 เท่า |
| ประวัติล่าสุด LIMIT 50 | 61.217 | 0.226 | 270.87 เท่า |
| หน้าถัดไปด้วย cursor | 67.724 | 0.315 | 215.00 เท่า |
| รวมยอดรายวัน | 78.085 | 0.315 | 247.89 เท่า |
| COUNT ตามวันที่ | 68.388 | 0.200 | 341.94 เท่า |
| ช่วงกว้างข้ามผู้ใช้ | 82.020 | 89.692 | 0.91 เท่า (ช้าลง) |

Query สินค้า/ภูมิภาคเปลี่ยนจาก Seq Scan เป็น Bitmap Index Scan
บน `idx_sales_user_product_region_date`; buffers ของ representative run
ลดจาก 9,346 blocks (hit + read) เป็น 27 blocks
Latest/cursor page ใช้ Index Scan และไม่มี Sort; COUNT ใช้ Index Only Scan
Wide range ยังใช้ Seq Scan ทั้งสองฐาน ไม่ได้มีประโยชน์จาก index เหล่านี้

ดูหลักฐาน [benchmark.md](evidence/benchmark.md),
[benchmark.csv](evidence/benchmark.csv) และ [query plans ทุกครั้ง](evidence/benchmark.json)
ไฟล์ JSON เก็บ SQL, Execution Time, nodes, Index Cond, buffers และ PostgreSQL version
ไม่ได้เก็บ DSN/password

## ต้นทุนพื้นที่และการเขียน

หลัง compact index และมี 1 ล้านแถว:

| รายการ | ไม่มี secondary index | มี index โปรเจกต์ |
|---|---:|---:|
| Table | 76,562,432 bytes | 76,562,432 bytes |
| Index รวม Primary Key | 22,487,040 bytes | 113,033,216 bytes |
| Total relation | 99,098,624 bytes | 189,644,800 bytes |

Index เพิ่มพื้นที่ประมาณ **86.35 MiB** ส่วนข้อมูลในตารางเท่ากัน
ต้นทุน INSERT 200,000 แถวจาก Lab 03/07 (ตัวอย่างครั้งเดียว ไม่ใช่ median):

| สภาพ index | Execution Time (ms) |
|---|---:|
| Primary Key เท่านั้น (Lab 03) | 2,531.002 |
| Primary Key + index โปรเจกต์ 2 ตัว (Lab 03) | 5,812.062 |
| index โปรเจกต์ ก่อนเพิ่ม index ไม่จำเป็น (Lab 07) | 4,951.509 |
| เพิ่ม quantity/inventory/region indexes (Lab 07) | 8,520.748 |

รายละเอียด execution plans และผลตรวจ row count ของทุกบทอยู่ใน
[lab-validation.txt](evidence/lab-validation.txt)

ตัวอย่างนี้แสดงต้นทุนการดูแล index เมื่อเขียนข้อมูล ควรทดลองซ้ำบนเครื่องตนเอง
ก่อนสรุปตัวเลขต้นทุนจริง `ROLLBACK` คืนข้อมูล แต่ไม่คืนงานเขียน/WAL และอาจเพิ่ม
ขนาดไฟล์ index แม้ VACUUM แล้ว

## ข้อจำกัดของผล

ผลเป็น synthetic workload บนเครื่องเดียว ไม่รวม HTTP, network และ serialization
ฐานทั้งสองใช้ portable PostgreSQL server ร่วมกัน จึงใช้ cache/resources ร่วมกัน
การ warm-up ไม่ได้ทำให้ทุก page อยู่ใน shared buffers โดยเฉพาะ Seq Scan ของทั้งตาราง
ข้อมูลจริงอาจกระจายต่างออกไป และยังไม่ได้ทดสอบ concurrent clients หรือ Docker runtime
นิสิตควรเปิด Docker lab และวัดผลเองตาม README เพื่อยืนยันในสภาพแวดล้อมของตน
Frontend Upload/Forecast ยังเป็น demo; ส่วนยอดขายที่เพิ่มเป็น API/DB จริง
