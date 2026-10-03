"""Consistent logical backup and restore to a NEW PostgreSQL database only.

Use DATABASE_URL environment variable (never pass credentials on the command line).
Restoration refuses a database containing any user data; it never truncates tables.
"""
import argparse
import gzip
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'api'))
from sqlalchemy import create_engine, select, func
from app.database import Base
from app import models, workflow_models  # noqa: F401

parser=argparse.ArgumentParser()
parser.add_argument('action',choices=['backup','restore'])
parser.add_argument('file',type=Path)
args=parser.parse_args()
url=os.environ.get('DATABASE_URL')
if not url:
    raise SystemExit('Set DATABASE_URL in the environment first.')
engine=create_engine(url)
tables=list(Base.metadata.sorted_tables)
schema={table.name:list(table.columns.keys()) for table in tables}

if args.action=='backup':
    if args.file.exists():
        raise SystemExit('Backup file already exists; choose a new filename.')
    args.file.parent.mkdir(parents=True,exist_ok=True)
    with engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
        with connection.begin():
            with gzip.open(args.file,'wt',encoding='utf-8') as output:
                output.write(json.dumps({'format':'demandly-logical-v1','schema':schema})[:-1]+',"tables":{')
                for index,table in enumerate(tables):
                    if index:
                        output.write(',')
                    output.write(json.dumps(table.name)+':[')
                    first=True
                    for row in connection.execution_options(stream_results=True).execute(select(table)):
                        if not first:
                            output.write(',')
                        first=False
                        output.write(json.dumps(dict(row._mapping),default=lambda item:item.isoformat(),ensure_ascii=False))
                    output.write(']')
                output.write('}}')
    print(f'Backup written: {args.file} (contains account hashes and business data; keep private).')
else:
    with gzip.open(args.file,'rt',encoding='utf-8') as source:
        backup=json.load(source)
    if backup.get('format')!='demandly-logical-v1' or backup.get('schema')!=schema:
        raise SystemExit('Backup schema/version differs from this application. Use the matching code revision.')
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        if any(connection.scalar(select(func.count()).select_from(table)) for table in tables):
            raise SystemExit('Refusing restore: target database contains data. Create a new recovery database.')
        for table in tables:
            rows=backup['tables'][table.name]
            for offset in range(0,len(rows),1000):
                converted=[]
                for raw in rows[offset:offset+1000]:
                    row=dict(raw)
                    for column in table.columns:
                        value=row[column.name]
                        if value is not None and column.type.python_type in (date,datetime):
                            row[column.name]=column.type.python_type.fromisoformat(value)
                    converted.append(row)
                if converted:
                    connection.execute(table.insert(),converted)
        if connection.dialect.name=='postgresql':
            from sqlalchemy import text
            for table in tables:
                column=table.c.get('id')
                if column is not None and column.primary_key:
                    # All names are fixed application metadata; no user SQL identifiers.
                    connection.execute(text(f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), COALESCE((SELECT MAX(id) FROM {table.name}), 1), EXISTS(SELECT 1 FROM {table.name}))"))
    print('Restore complete. Run alembic upgrade head with this DATABASE_URL before starting the recovered database.')
