# Demandly Database Indexing Lab

นำแนวทางจาก `indexing-lab_02.zip` มาประยุกต์กับ AI Demand Forecasting: เปลี่ยนจาก
transactions/customer เป็นยอดขายของผู้ใช้แต่ละราย ตามสินค้า ภูมิภาค และวันที่
ทดลอง PostgreSQL 16 สองตัวที่มีข้อมูลสังเคราะห์ **เหมือนกัน 1,000,000 แถว**
ฐาน `pg_no_index` มี Primary Key ตามปกติ ส่วน `pg_with_index` เพิ่ม index ของโปรเจกต์

## สิ่งที่นำไปใช้กับโปรเจกต์จริง

ก่อนปรับปรุง Backend มีเฉพาะ `users` และ `revoked_tokens` ซึ่งมี index สำหรับ login
และ lookup อยู่แล้ว ส่วน Sales/Forecast/Alerts เป็น frontend demo จึงไม่มี query
ยอดขายจริงให้ปรับความเร็ว การเปลี่ยนแปลงนี้เพิ่ม:

- `SalesRecord` ใน `api/app/models.py` สำหรับข้อมูลยอดขายจริง
- `POST /sales/batch`: บันทึกครั้งละไม่เกิน 1,000 แถวด้วย bulk INSERT
- `GET /sales`: ค้นประวัติของผู้ใช้ที่ login ด้วยสินค้า/ภูมิภาค/ช่วงวันที่
  ส่งไม่เกิน 100 แถว และใช้ cursor `(sale_date, id)` แทน OFFSET ที่ลึกมาก
- `GET /sales/daily`: รวมยอดรายวันสำหรับกราฟ/ข้อมูลตั้งต้น Forecast
  จำกัดช่วงไม่เกิน 366 วัน ส่งเฉพาะข้อมูลของผู้ใช้ที่ login
- B-tree index สองตัวตาม query จริง (นอกเหนือจาก Primary Key)

| Index | Column order | ใช้กับ |
|---|---|---|
| `idx_sales_user_product_region_date` | user_id, product_code, region, sale_date, id | ประวัติ/ยอดรายวันของสินค้าในภูมิภาค และ latest/cursor page |
| `idx_sales_user_date` | user_id, sale_date, id | ประวัติรวมทุกสินค้าและ filter วันที่ของผู้ใช้ |

Equality อยู่ก่อน range/order; `id` ทำให้เรียงลำดับแน่นอนเมื่อหลายแถวมีวันที่เดียวกัน
ดัชนีเดิมบน username/email/JWT ไม่ต้องสร้างเพิ่มทุก column
Foreign Key `user_id` และทุก query มีเงื่อนไขผู้ใช้เพื่อแยกข้อมูลระหว่างบัญชี
เมื่อผู้ใช้ถูกลบ ยอดขายของบัญชีนั้นจะถูกลบตาม `ON DELETE CASCADE`

**Frontend Forecast และ Upload wizard ยังใช้ demo data** การเพิ่ม API นี้เป็นส่วน
ฐานข้อมูลจริงสำหรับนำไปเชื่อมต่อในขั้นถัดไป ไม่ได้เปลี่ยนให้เป็นโมเดล AI จริง
ห้องทดลองแยกออกจากฐานหลัก และไม่เปิด API ของโปรเจกต์เข้าไปที่ฐาน lab
ตาราง `users` ใน lab เก็บเพียง 10 ownership IDs ไม่ใช่บัญชีสำหรับ login

## เริ่มทดลอง

ต้องมี Docker Desktop ที่ engine ทำงาน และ Docker Compose v2
รันคำสั่งจาก **โฟลเดอร์หลักของโปรเจกต์** ไม่ต้องแก้ไฟล์ `.env` ของระบบหลัก

```powershell
docker compose -f indexing-lab/docker-compose.yml up -d --wait --wait-timeout 300
docker compose -f indexing-lab/docker-compose.yml ps
```

ครั้งแรก seed ทั้งสองฐานและสร้าง index อาจใช้เวลาหลายนาที
health check ใช้ TCP ซึ่งจะพร้อมหลัง init script ทั้งหมดจบแล้ว
หากยังไม่พร้อม ให้ดู `docker compose -f indexing-lab/docker-compose.yml logs pg_with_index pg_no_index`

| Service | Host connection | Secondary indexes |
|---|---|---|
| pg_with_index | localhost:15432 | index ของโปรเจกต์ 2 ตัว |
| pg_no_index | localhost:15433 | ไม่มี (ยังมี Primary Key) |
| Adminer | http://localhost:18080 | เลือก Server ตามชื่อ service |

User: `student` / Password: `student` / Database: `demandly_lab`
Adminer เลือก System: PostgreSQL และ Server: `pg_with_index` หรือ `pg_no_index`
สำหรับ DBeaver ใช้ localhost และ port ตามตาราง
พอร์ตไม่ชนระบบหลัก 5432/8080 และเปิดเฉพาะ localhost
Compose project/volumes แยกจาก Demandly หลัก

## Lab ตามตัวอย่างที่แนบ

คำสั่งตัวอย่าง (ไม่ใช้ container_name แบบตายตัว จึงไม่ชนตัวอย่างต้นฉบับ):

```powershell
docker compose -f indexing-lab/docker-compose.yml exec -T pg_no_index psql -X -v ON_ERROR_STOP=1 -U student -d demandly_lab -f /labs/01-explain.sql
docker compose -f indexing-lab/docker-compose.yml exec -T pg_with_index psql -X -v ON_ERROR_STOP=1 -U student -d demandly_lab -f /labs/01-explain.sql
```

เปลี่ยนชื่อไฟล์ท้ายคำสั่งให้ตรงบททดลอง และเลือก service ตามตาราง:

| ไฟล์ | รันบน | สิ่งที่ต้องสังเกต |
|---|---|---|
| 01-explain.sql | ทั้งสอง | Exact date, composite range, ORDER BY/LIMIT, wide range, daily totals, Index Only Scan |
| 01b-create-index-live.sql | pg_no_index | 100 product lookups ก่อน/หลังสร้าง index ใน transaction |
| 02-size.sql | ทั้งสอง | Table/index/total bytes และสถิติ index usage |
| 03-insert-cost.sql | ทั้งสอง | INSERT 200,000 แถว แล้ว ROLLBACK + VACUUM |
| 04-pitfalls.sql | pg_with_index | Function บนวันที่, คำนวณ column, low cardinality, LIKE prefix/suffix |
| 05-composite.sql | pg_with_index | ลำดับ column, leading columns, index scan ที่ลด Sort |
| 06-workshop.sql | pg_with_index | ออกแบบ index/แก้ query และอธิบายหลักฐานด้วยตัวเอง |
| 07-choose-columns.sql | pg_with_index | Cardinality และต้นทุนเมื่อเพิ่ม index โดยไม่จำเป็น |

ไฟล์ที่สร้าง/ลบ index ชั่วคราวใช้ `BEGIN ... ROLLBACK` คืนโครงสร้างหลังทดลอง
Lab 03/07 ใช้ explicit ID เพื่อไม่เลื่อน sequence; ROLLBACK คืนข้อมูล แต่ไม่ได้คืน
เวลา/WAL/I/O ที่ใช้ไป และอาจเหลือ dead tuples จึง VACUUM หลังจบ
ขนาดไฟล์ index อาจยังเพิ่มหลัง ROLLBACK/VACUUM; วัด benchmark ก่อน lab ที่เขียน
ข้อมูลหากต้องการเปรียบเทียบพื้นที่หลัง seed โดยตรง
หากรันใน DBeaver ให้ข้ามคำสั่ง psql ที่ขึ้นต้นด้วย `\` และเปิด transaction ให้ครบ
อย่าทดลอง DROP INDEX/INSERT จำนวนมากกับฐานระบบหลัก

## วัดผลอัตโนมัติและสร้างรายงาน

ต้องมี Python 3.10+ (ใช้ standard library ไม่ต้อง pip install)

```powershell
python indexing-lab/benchmark.py --runs 5
```

สคริปต์ตรวจจำนวนแถว fingerprint ที่รวมทุก field และรายชื่อ index ของทั้งสองฐาน
ตรวจผลลัพธ์แต่ละ query ตรงกัน ทิ้ง warm-up หนึ่งครั้งต่อ query สลับลำดับฐานที่รัน
แล้วใช้ median จาก 5 ครั้งของ PostgreSQL `Execution Time` ใน `EXPLAIN ANALYZE`
ไม่บังคับปิด Seq Scan และไม่แก้ข้อมูล/index

ผลอยู่ใน `indexing-lab/results/`:

- `benchmark.md`: ตารางเวลา/จำนวนเท่าที่เร็วขึ้น/พื้นที่
- `benchmark.csv`: median/min/max, scan nodes, index names, buffer hit/read
- `benchmark.json`: SQL, ทุก query plan, versions, dataset fingerprint และเวลา UTC

ถ้าจัดเตรียมฐาน PostgreSQL ทดลองเอง ใช้ตัวเลือก `--dsn-no-index` และ
`--dsn-with-index` แทน Docker ได้ (ต้องมี `psycopg` จาก requirements ของ API)
ต้องใช้สองฐานที่ seed ตามไฟล์ lab และมี index ตรงตามที่สคริปต์ตรวจสอบ
สคริปต์จะระบุ connection mode จริงในรายงาน และไม่บันทึก DSN/password ลงผลลัพธ์

`speedup = median ก่อน / median หลัง`; ค่าน้อยกว่า 1 หมายถึงช้าลง
เวลานี้ไม่รวม network/HTTP/การแปลง JSON และวัดหลัง warm-up
ไม่ได้รับประกันว่าทุก page ของข้อมูลยังอยู่ใน shared buffers
ใช้เครื่องและ query เดียวกัน ปิดงานอื่นที่แย่งทรัพยากร และรันสองฐานแบบลำดับ
ไม่ถือว่าตัวเลขครั้งเดียวแทน production load test หรือ concurrent users จริง
Lab 01b ใช้ lookup ต่อเนื่องเพื่อสาธิต repeated queries ไม่ใช่ 100 concurrent clients

เปิดผลบนเครื่องของตนเอง และนำค่าจริงไปกรอก `REPORT-TEMPLATE.md`
ไม่มีการกำหนด speedup ตายตัว เพราะขึ้นกับเครื่อง cache ความหลากหลายของข้อมูล
และจำนวนแถวที่เลือก Wide range อาจยังใช้ Seq Scan และไม่ได้เร็วขึ้น

ผลตรวจสอบที่วัดระหว่างพัฒนาอยู่ใน [VALIDATION.md](VALIDATION.md)
และ raw evidence ใน `evidence/` ใช้เป็นตัวอย่างประกอบการอ่านผล
นิสิตควรรันและส่งผลจากเครื่องตนเอง

## อ่าน EXPLAIN อย่างไร

- `Seq Scan` / `Parallel Seq Scan`: อ่านตาราง อาจเหมาะเมื่อเลือกข้อมูลส่วนใหญ่
- `Index Scan` / `Bitmap Index Scan`: ดู `Index Name` และ `Index Cond` ว่าใช้ตัวไหน
- `Index Only Scan`: อาจลด heap reads; ดู `Heap Fetches` และ visibility หลัง VACUUM
- `Rows Removed by Filter`: แถวที่อ่านมาแล้วต้องทิ้ง หากมากควรตรวจ filter/index
- `Buffers: shared hit/read`: ดูงานอ่านข้อมูล ไม่ดูเวลาอย่างเดียว
- `Sort`: query ล่าสุดที่มี equality prefix และ ordering ตรงกับ index ควรลด Sort ได้
- `Execution Time`: เวลาที่วัดจริง แยกจาก `cost` ซึ่งเป็นค่าประเมินของ planner

index ไม่ได้เร็วกับทุก query; leading columns ของ composite มีผลกับช่วงที่ต้องอ่าน
แม้ข้าม column หน้าได้บางกรณี แต่ต้องดูแผนและ buffers จริง
คอลัมน์ที่ค่าซ้ำมากไม่ได้แปลว่าห้าม index เสมอ ให้ดู selectivity และ workload
จำนวน `idx_scan` อาจอัปเดตช้า และต้องเทียบช่วงเวลาการใช้งานเดียวกัน

## ใช้ในฐานโปรเจกต์ที่มีอยู่แล้ว

การเปิด API ใหม่สร้างตาราง/index ผ่าน SQLAlchemy บนฐานใหม่โดยอัตโนมัติ
`create_all` ไม่ใช่ migration ของตารางที่มีอยู่: หากมี `sales_records` แล้ว
ให้ใช้ SQL ต่อไปนี้จากโฟลเดอร์หลักเพื่อเพิ่ม index โดยไม่ต้องล้าง volume:

```powershell
docker compose up -d db api
docker compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /project-sql/001-sales-records.sql'
docker compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /project-sql/002-sales-indexes.sql'
```

ฐานต้องมี `users` จาก API ก่อน SQL ทั้งสองไฟล์ใช้ `IF NOT EXISTS` และทำซ้ำได้
ไฟล์ index ใช้ `CREATE INDEX CONCURRENTLY` ให้รันนอก BEGIN/COMMIT
ถ้าใช้ hosting อื่น ให้รันไฟล์เดียวกันผ่าน psql ของผู้ให้บริการ
`IF NOT EXISTS` ตรวจชื่อ ไม่ได้ตรวจว่า definition ของ index ที่มีอยู่ถูกต้อง:
ตรวจ `pg_indexes.indexdef` และ `pg_index.indisvalid` หาก index เคยสร้างไม่สำเร็จ

ทดลอง API ใน Swagger `http://localhost:8000/docs`: Register/Login แล้วใช้ token
กับ Authorize ก่อนเรียก `POST /sales/batch` ด้วยข้อมูล:

```json
{
  "items": [
    {"sale_date": "2026-09-10", "product_code": "TK-A-001", "region": "Bangkok", "sales_quantity": 100, "inventory": 1200},
    {"sale_date": "2026-09-11", "product_code": "TK-A-001", "region": "Bangkok", "sales_quantity": 140}
  ]
}
```

เรียก `/sales?product_code=TK-A-001&region=Bangkok&start_date=2026-09-01&end_date=2026-10-01&limit=50`
และ `/sales/daily?product_code=TK-A-001&region=Bangkok&start_date=2026-09-01&end_date=2026-10-01`
โดย `start_date` รวมวันนั้น และ `end_date` ไม่รวมวันนั้น
หน้าแรกคืน `next_cursor`; ส่งเป็น `cursor` พร้อม filter เดิมเพื่ออ่านหน้าถัดไป
วันที่เดียวกันเรียงด้วย id ลดหลั่น จึงไม่ข้ามแถวที่มีวันที่ซ้ำ
Batch ไม่ deduplicate: ส่ง batch เดิมซ้ำจะเพิ่มยอดขายซ้ำ ต้องตรวจไฟล์ก่อนนำเข้าจริง

## ทดสอบ API

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r api/requirements-dev.txt
cd api
../.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Functional tests ใช้ SQLite ในหน่วยความจำแยกจากฐานจริง สำหรับ auth, ownership,
pagination, date boundaries, validation และ cascade delete
ต้องใช้ PostgreSQL lab เพื่อพิสูจน์ performance/query plan จริง

## ปิดและเริ่มใหม่

```powershell
docker compose -f indexing-lab/docker-compose.yml down
```

คำสั่งนี้เก็บข้อมูล lab ไว้ Init script จะไม่รันซ้ำเมื่อ volume มีข้อมูลแล้ว
หากตั้งใจลบ **ข้อมูล lab เท่านั้น** เพื่อ seed ใหม่ ใช้
`docker compose -f indexing-lab/docker-compose.yml down -v`
ห้ามใช้คำสั่งล้าง volume ของระบบหลักเพื่อทดลอง indexing

## เอกสารอ้างอิง

- [PostgreSQL 16: Multicolumn Indexes](https://www.postgresql.org/docs/16/indexes-multicolumn.html)
- [PostgreSQL 16: EXPLAIN](https://www.postgresql.org/docs/16/sql-explain.html)
- [PostgreSQL 16: CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html)
- [PostgreSQL 16: Unique Indexes](https://www.postgresql.org/docs/16/indexes-unique.html)
