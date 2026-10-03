"""Validate recovery in a newly created, isolated PostgreSQL database."""
import hashlib
import gzip
import json
import os
import secrets
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
import psycopg
from psycopg import sql
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'api'))
from app.database import Base
from app import models, workflow_models  # noqa: F401
source_url=make_url(os.environ['DATABASE_URL'])
if source_url.host not in ('localhost','127.0.0.1'):
    raise SystemExit('Recovery verification is limited to the local mock environment.')
name='demandly_recovery_'+secrets.token_hex(4)
with psycopg.connect(host=source_url.host,port=source_url.port,user=source_url.username,password=source_url.password,dbname='postgres',autocommit=True) as admin:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
target_url=source_url.set(database=name)
env=os.environ|{'DATABASE_URL':target_url.render_as_string(hide_password=False)}
backup_file=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'.cache/qa-backup-v2.json.gz'
subprocess.run([sys.executable,str(ROOT/'scripts/database-backup.py'),'restore',str(backup_file)],env=env,check=True)
subprocess.run([sys.executable,'-m','alembic','upgrade','head'],cwd=ROOT/'api',env=env,check=True)
target=create_engine(target_url)
results={}
with gzip.open(backup_file,'rt',encoding='utf-8') as stream:
    snapshot=json.load(stream)
with target.connect() as recovered:
    for table in Base.metadata.sorted_tables:
        statement=select(table).order_by(*table.primary_key.columns)
        def checksum(connection):
            digest=hashlib.sha256();count=0
            for row in connection.execute(statement):
                digest.update(json.dumps(dict(row._mapping),sort_keys=True,default=str,ensure_ascii=False).encode())
                count+=1
            return count,digest.hexdigest()
        # Compare to the consistent backup snapshot, not a source that may have
        # received new forecasts while the recovery was being tested.
        expected=[]
        for raw in snapshot['tables'][table.name]:
            row=dict(raw)
            for column in table.columns:
                if row[column.name] is not None and column.type.python_type in (date,datetime):
                    row[column.name]=column.type.python_type.fromisoformat(row[column.name])
            expected.append(row)
        expected.sort(key=lambda row:tuple(row[c.name] for c in table.primary_key.columns))
        digest=hashlib.sha256()
        for row in expected:
            digest.update(json.dumps(row,sort_keys=True,default=str,ensure_ascii=False).encode())
        before=(len(expected),digest.hexdigest())
        after=checksum(recovered)
        assert before==after,(table.name,before,after)
        results[table.name]={'rows':before[0],'sha256':before[1]}
with target.begin() as connection:
    identifier=connection.execute(models.User.__table__.insert().values(username='recovery_probe',hashed_password='disabled-test-account').returning(models.User.id)).scalar()
    assert identifier==max(row['id'] for row in snapshot['tables']['users'])+1
print('PASS: every restored table count and content hash matches; migrations and next primary key work.')
(ROOT/'.cache/recovery-verification.json').write_text(json.dumps({'database':name,'results':results,'sequence_probe':True},indent=2))
