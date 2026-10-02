# Dataset จำลอง 5 ชุด — Demandly

ข้อมูลสังเคราะห์สำหรับทดลองยอดขายเครื่องมือแพทย์และ database indexing
ช่วง **2024-10-01 ถึง 2026-09-30** จำนวนสินค้า 5 รหัส ภูมิภาค 5 กลุ่ม
ข้อมูลสร้างจากสมมติฐานเพื่อการทดลอง ไม่มีข้อมูลลูกค้าหรือข้อมูลโรคระบาดจริง
ทุกไฟล์เป็น CSV แบบ UTF-8 พร้อม BOM เพื่อเปิดชื่อภูมิภาคภาษาไทยใน Excel ได้

| ไฟล์ | จำนวนแถว | สถานการณ์ | ใช้ทดลอง |
|---|---:|---|---|
| [01_stable_demand.csv](01_stable_demand.csv) | 18,250 | ยอดขายคงที่ มี noise ±10% | baseline, ยอดรายวัน, query ตามสินค้า/ภูมิภาค |
| [02_growth_trend.csv](02_growth_trend.csv) | 18,250 | แนวโน้มยอดขายเพิ่มประมาณ 90% ในสองปี | trend, เปรียบเทียบต้น/ปลายช่วง |
| [03_seasonal_demand.csv](03_seasonal_demand.csv) | 18,250 | ฤดูกาลรายปี พีคกลางเดือนกรกฎาคม | grouping รายเดือน, เปรียบเทียบฤดูกาลสองปี |
| [04_demand_spike.csv](04_demand_spike.csv) | 18,250 | พุ่งช่วง 2026-07-01 ถึง 2026-08-15 พร้อม stock cover ลดลง | ตรวจ spike, กรองช่วงวันที่แคบ, เตรียมข้อมูล Alert |
| [05_large_skewed_sales.csv](05_large_skewed_sales.csv) | 200,000 | Test Kit A ประมาณ 70%, กรุงเทพฯ ประมาณ 60%, วันที่ล่าสุดมีข้อมูลหนาแน่น | indexing, selectivity, pagination และข้อมูลกระจายไม่เท่ากัน |

รวม **273,000 แถว** ไฟล์แต่ละชุดเล็กกว่า 20 MB
ดาวน์โหลดรวมได้จาก [demandly_datasets_5.zip](demandly_datasets_5.zip)
รายละเอียด seed, SHA-256, จำนวนแถวต่อสินค้า/ภูมิภาค และยอดรวมอยู่ใน [manifest.json](manifest.json)
ผลตรวจ schema, จำนวนแถว, checksum และลักษณะของแต่ละสถานการณ์อยู่ใน
[validation.json](validation.json) ทุกชุดผ่านการทดสอบนำเข้าตัวอย่าง 1,001 แถว
ด้วย Sales API บนฐาน SQLite ที่แยกในหน่วยความจำ รวมการตรวจยอดรายวันและแยกบัญชีผู้ใช้

## Schema และหน่วยข้อมูล

```csv
sale_date,product_code,region,sales_quantity,inventory
2024-10-01,TK-A-001,กรุงเทพฯ,174,2927
```

| คอลัมน์ | ความหมาย |
|---|---|
| sale_date | วันที่ยอดขาย รูปแบบ YYYY-MM-DD |
| product_code | รหัสสินค้า ตรงกับ SKU ในหน้า Demo |
| region | กรุงเทพฯ / ภาคกลาง / ภาคตะวันออก / ภาคเหนือ / ภาคใต้ |
| sales_quantity | จำนวนหน่วยที่ขาย รวมยอดได้ |
| inventory | จำนวนหน่วยคงคลัง ณ snapshot ของแถวนั้น ไม่ให้นำมาบวกรวมเป็นยอดขาย |

สินค้า: `TK-A-001` Test Kit A, `GL-B-014` Gloves B, `MK-C-028` Mask C,
`SY-D-039` Syringe D, `AG-E-052` Antigen E

ชุด 01–04 มีหนึ่งแถวต่อ **วัน × สินค้า × ภูมิภาค** ครบ 730 วัน
ชุด 05 เป็น **รายการขายรายธุรกรรม** จึงมีหลายแถวในวัน/สินค้า/ภูมิภาคเดียวกัน
ให้ SUM sales_quantity เพื่อดูยอดรายวัน ไม่ลบแถวที่วัน/สินค้า/ภูมิภาคซ้ำโดยอัตโนมัติ
เพราะเป็นรายการขายคนละรายการ CSV ชุดนี้ไม่มี transaction identifier
ชุด 05 มี 4,072 แถวที่ค่าทุกคอลัมน์เหมือนแถวก่อนหน้า จึงไม่สามารถตัดสินว่าเป็น
ธุรกรรมซ้ำจากคอลัมน์เหล่านี้เพียงอย่างเดียวได้ หากต้องการตรวจรายการซ้ำในข้อมูลจริง
ควรเพิ่ม transaction identifier จากระบบต้นทาง
ค่า inventory เป็น snapshot จำลอง ไม่ใช่บัญชีเคลื่อนไหวรับเข้า/จ่ายออกที่ reconcile ได้

ในชุด spike จะเพิ่มยอด Test Kit A, Mask C และ Antigen E เฉพาะกรุงเทพฯ/ภาคกลาง
ยอดสูงสุดตั้งใจให้ประมาณ 3.2 เท่าของระดับปกติ และลด inventory snapshot ในช่วงเหตุการณ์
ภูมิภาค/สินค้าอื่นใช้ระดับปกติเพื่อเป็นกลุ่มเปรียบเทียบ

## ตรวจไฟล์และนำเข้า API จริง

จากโฟลเดอร์หลักของโปรเจกต์ ใช้ Python 3.10+ สคริปต์นี้ไม่ต้องติดตั้ง dependency เพิ่ม:

```powershell
python datasets/import_sales.py datasets/01_stable_demand.csv
```

คำสั่งปกติ **ตรวจไฟล์เท่านั้น** หากใช้ virtual environment ของโปรเจกต์
แทน `python` ด้วย `.venv/Scripts/python.exe` ได้
เมื่อเปิด FastAPI แล้ว ให้ Register/Login ผ่าน Swagger ที่ `http://localhost:8000/docs`
นำ access token มาใช้ก่อนส่งข้อมูล:

```powershell
$env:DEMANDLY_ACCESS_TOKEN = 'access-token-จาก-login'
python datasets/import_sales.py datasets/01_stable_demand.csv --apply
Remove-Item Env:DEMANDLY_ACCESS_TOKEN
```

สคริปต์ตรวจทุกแถวก่อนเริ่มส่ง แล้วแบ่งส่ง `POST /sales/batch` ครั้งละไม่เกิน 1,000 แถว
API กำหนดเจ้าของข้อมูลจาก token ไม่ต้องใส่ user_id ใน CSV
ชุดทั่วไปใช้ 19 requests; ชุดใหญ่ใช้ 200 requests ควรมีอายุ token เพียงพอ

ทดสอบหลังนำเข้า:

```text
GET /sales?product_code=TK-A-001&region=กรุงเทพฯ&start_date=2026-07-01&end_date=2026-08-01&limit=50
GET /sales/daily?product_code=TK-A-001&region=กรุงเทพฯ&start_date=2026-07-01&end_date=2026-08-01
```

ใช้ชื่อภูมิภาคตรงกับ CSV และ URL-encode เมื่อเรียก URL เอง
API daily จำกัดช่วงไม่เกิน 366 วัน จึงควรขอกราฟปีละช่วง
`end_date` ไม่รวมวันสุดท้าย และหน้าถัดไปใช้ `next_cursor` พร้อม filter เดิม

**เลือกนำเข้าทีละสถานการณ์ในบัญชีทดลองแยกกัน** เพราะแต่ละชุดมีช่วงวันที่และ SKU เหมือนกัน
หากรวมทุกชุดในบัญชีเดียวจะเป็นยอดรวมหลายสถานการณ์ ไม่ใช่การเปรียบเทียบสถานการณ์
API ไม่มี dataset_id และไม่ deduplicate การนำเข้าไฟล์เดิมซ้ำจะเพิ่มยอดซ้ำ
แต่ละ batch commit แยกกัน หากเครือข่ายหลุดให้ตรวจ batch ล่าสุดก่อนส่งซ้ำ

## ทดลอง indexing

ใช้ pattern เดียวกับ index ของโปรเจกต์:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM sales_records
WHERE user_id = 4
  AND product_code = 'TK-A-001'
  AND region = 'กรุงเทพฯ'
  AND sale_date >= DATE '2026-07-01'
  AND sale_date < DATE '2026-08-01'
ORDER BY sale_date DESC, id DESC
LIMIT 50;
```

เปลี่ยน user_id เป็นบัญชีที่ใช้จริง และทดลองทั้งสินค้า/ภูมิภาคที่พบมากกับที่พบน้อย
ในชุด 05 เพื่อดูผลของ selectivity ชุด API จริงมี index อยู่แล้ว
ใช้ [ห้องทดลองแยก](../indexing-lab/README.md) เมื่อต้องการทดลองก่อน/หลังโดยสร้าง/ลบ index
อย่าลบ index ของระบบหลักเพื่อทดลอง
ข้อมูลชุดใหม่นี้ไม่ได้แทน seed เดิมของ lab; `benchmark.py` เดิมยังตรวจ seed 1 ล้านแถว
และใช้รหัส `product-0042`/`region-3` ตามบททดลองเดิม

หน้า Upload/Forecast ปัจจุบันยังใช้ demo preview แม้จะเลือก CSV ได้
ใช้สคริปต์นำเข้าและ API เพื่อทดลองข้อมูลชุดนี้จริง ส่วนการพยากรณ์/Alert จากข้อมูล
ต้องเชื่อมโมเดลและ Frontend เพิ่มก่อน
