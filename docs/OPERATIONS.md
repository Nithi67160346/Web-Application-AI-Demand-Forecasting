# ดูแลระบบและ deployment

## Database migrations

Docker / Local launcher รัน `alembic upgrade head` ก่อนเปิด API.
Revision 0001 เป็น schema snapshot ที่ไม่ import model รุ่นใหม่ ยอมรับตาราง auth/sales เดิมโดยไม่ลบข้อมูล.
Revision 0002 เพิ่ม data lineage และถือ Forecast ที่ไม่มี lineage จากเวอร์ชันเก่าเป็น legacy.
การเปลี่ยน schema ครั้งต่อไปสร้าง migration ใหม่ อย่าแก้ revision ที่ใช้ไปแล้ว.

```powershell
cd api
..\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"
# ตรวจ upgrade/downgrade ที่สร้างก่อนใช้กับข้อมูลจริง
..\.venv\Scripts\python.exe -m alembic upgrade head
```

`DATABASE_URL` ต้องชี้ฐานข้อมูลที่ถูกต้อง. Backup ก่อน migration และจำกัดให้มี migrator เพียงหนึ่งตัวต่อ DB.
API ไม่เรียก create_all เปลี่ยน schema PostgreSQL อัตโนมัติใน lifespan.

## Backup / Restore

ตั้ง `DATABASE_URL` ผ่าน environment (อย่าใส่ password ใน command line หรือ Git).
ตัวอย่าง Local ที่ฟังเฉพาะเครื่องนี้:

```powershell
$env:DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:25432/demandly_local'
.venv\Scripts\python.exe scripts\database-backup.py backup backups\demandly-20261003.json.gz
```

Backup ใช้ REPEATABLE READ snapshot ครบทุกตารางของแอป; streaming export และ gzip.
มี password hashes และข้อมูลผู้ใช้ ต้องเก็บส่วนตัว/เข้ารหัส storage และเก็บสำเนานอกเครื่อง.
โฟลเดอร์ backups ถูก ignore. จัดเวลาสำรองตามการใช้งาน และทดสอบ restore เป็นระยะ.

Restore ต้องสร้าง PostgreSQL database ใหม่ก่อน แล้วเปลี่ยน DATABASE_URL ให้ชี้ DB ใหม่นั้น:

```powershell
.venv\Scripts\python.exe scripts\database-backup.py restore backups\demandly-20261003.json.gz
cd api
..\.venv\Scripts\python.exe -m alembic upgrade head
```

Restore ปฏิเสธฐานข้อมูลที่มีข้อมูลอยู่แล้ว ไม่ truncate/ทับตารางเดิม. ใช้ code revision ที่ schema ตรงกับ backup.
คืนค่า generated primary-key sequences ด้วย. `scripts/verify-recovery.py` ทดสอบกู้คืนใน DB ใหม่
และตรวจจำนวน/เนื้อหาทุกตารางกับ backup snapshot; จำกัดที่ mock environment บน localhost.

## Build สำหรับใช้งานต่อเนื่อง

`docker-compose.production.yml` ใช้ build ที่ไม่ mount source และไม่เปิด DB/Adminer port.
Web เรียก `/api` ผ่าน Caddy gateway จึงใช้ origin เดียวกัน. Gateway ฟัง `127.0.0.1:8088`
เป็นค่าเริ่มต้น; ไม่เผยแพร่ระบบให้ internet อัตโนมัติ.

สร้าง `.env.production` (ไฟล์นี้ถูก ignore) จาก `deploy/.env.production.example`
เปลี่ยน password/secret ที่สุ่มใหม่ และ URL-encode password ใน PRODUCTION_DATABASE_URL ให้ตรงกับ POSTGRES_PASSWORD:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --wait
```

เปิด `http://localhost:8088`. ต้องมี Docker engine ที่พร้อมใช้งาน.
ก่อนเปิดให้คนอื่นผ่าน internet ต้องกำหนด hosting/domain/TLS ของสถานที่ deploy,
ตั้ง reverse proxy ให้ยอมรับ Host ที่ถูกต้อง และปรับ CORS/log retention/backup ให้เข้ากับสถานที่นั้น.
ยังไม่มีการ deploy ไป cloud ใน repo นี้.

## Security ที่มี

- JWT + Argon2; password change invalidates all old sessions; logout revokes token.
- User list เฉพาะ global admin; profile คนอื่นอ่านไม่ได้ ยกเว้น admin.
- Workspace membership/roles ตรวจที่ backend ทุก endpoint และกัน cross-workspace ID access.
- จำกัด upload 20 MB/250k rows, expanded XLSX 100 MB, request body 29 MB.
- ใช้ defusedxml สำหรับ XML ใน Excel และ parameterized ORM queries.
- Authentication burst limit ต่อ process/IP (production ตั้ง 20 ครั้ง/นาที).
- ถ้ารันหลาย API process ให้ใช้ reverse proxy/shared rate limiter แทน limiter ในหน่วยความจำ.
- เก็บ bearer token ใน browser localStorage; ถ้าขยายเป็น public production ควรประเมิน session cookie/CSRF และ CSP ตาม deployment.
- เจ้าของ Workspace ลบ account ผ่าน API ไม่ได้เพื่อรักษาข้อมูลและ audit; admin สามารถ disable แทน.

ผู้ดูแลที่เข้าถึง DATABASE_URL ใช้ console command จากโฟลเดอร์ `api` ได้:
`..\.venv\Scripts\python.exe -m app.admin promote USERNAME`
หรือ `disable USERNAME` / `enable USERNAME`. ไม่มีบัญชี admin/password สำเร็จรูป.

## Verification

```powershell
npm run lint
npx tsc --noEmit
npm run build
node --test tests/rendered-html.test.mjs
cd api
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

`scripts/verify-mock-workflow.py --api URL` สร้าง QA account ใหม่ แล้วตรวจ dataset ทั้ง 5 ชุด
ผ่าน HTTP/PostgreSQL (ไม่แตะ Workspace ของผู้ใช้). Credentials/results อยู่ใน .cache ที่ไม่ขึ้น Git.
GitHub Actions `Verify application` รัน lint/types/build/render/API checks ทุก push/PR.
