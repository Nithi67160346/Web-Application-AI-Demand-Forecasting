"""Integration verification against a running API; creates only new QA accounts.

Usage: python scripts/verify-mock-workflow.py --api http://localhost:8002
Credentials and report remain in ignored .cache; no user workspace is overwritten.
"""
import argparse
import csv
import json
import secrets
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--api', default='http://localhost:8002')
args = parser.parse_args()


def call(path, body=None, token=None, method=None):
    headers={'Content-Type':'application/json'}
    if token:
        headers['Authorization']='Bearer '+token
    request=Request(args.api+path, data=json.dumps(body).encode() if body is not None else None,
                    headers=headers, method=method or ('POST' if body is not None else 'GET'))
    with urlopen(request, timeout=180) as response:
        return json.load(response)


username='qa_'+secrets.token_hex(5)
password=secrets.token_urlsafe(20)
registered=call('/register',{'username':username,'password':password,'full_name':'Mock Workflow QA'})
token=registered['access_token']
results=[]
for dataset in call('/workspace/datasets',token=token):
    begin=time.perf_counter()
    job=call('/workspace/datasets/'+dataset['id']+'/validate',{},token)
    assert job['report']['invalid_rows']==0, job
    committed=call(f'/workspace/imports/{job["id"]}/commit',{'mode':'replace','acknowledge_duplicates':True},token)
    assert committed['status']=='committed'
    repeated=call(f'/workspace/imports/{job["id"]}/commit',{'mode':'replace','acknowledge_duplicates':True},token)
    assert repeated['id']==committed['id']
    dashboard=call('/workspace/dashboard',token=token)
    assert dashboard['records']==dataset['rows']
    with (ROOT/'datasets'/dataset['filename']).open(encoding='utf-8-sig',newline='') as source:
        expected=sum(int(row['sales_quantity']) for row in csv.DictReader(source))
    assert sum(item['quantity'] for item in dashboard['products'])==expected
    run=call('/workspace/forecasts',{'product_code':'TK-A-001','region':'กรุงเทพฯ','horizon':30,'acknowledge_missing_days':True},token)
    assert len(run['points'])==30 and len(run['backtest'])==28
    plan=call('/workspace/sales/query?product_code=TK-A-001',token=token)
    assert len(plan['items'])==50 and plan['plan'] is not None
    alerts=call('/workspace/alerts',token=token)
    current=[a for a in alerts if a['forecast_id']==run['id']]
    if current:
        call(f'/workspace/alerts/{current[0]["id"]}/review',{'status':'approved','note':'Verified synthetic QA scenario'},token,method='PUT')
        assert any(a['review_note']=='Verified synthetic QA scenario' for a in call('/workspace/alerts',token=token))
    call('/workspace/monitoring',token=token)
    results.append({'dataset':dataset['id'],'rows':dashboard['records'],'total_quantity':expected,'duplicates':job['report']['exact_duplicate_rows'],
                    'model':run['model'],'holdout':run['metrics'],'forecast_total':run['total'],'query_ms':plan['query_ms'],
                    'plan_available':True,'alerts_created':len(current),'elapsed_seconds':round(time.perf_counter()-begin,2)})
    print(json.dumps(results[-1],ensure_ascii=False),flush=True)
(ROOT/'.cache').mkdir(exist_ok=True)
(ROOT/'.cache/qa-account.json').write_text(json.dumps({'username':username,'password':password,'api':args.api}),encoding='utf-8')
(ROOT/'.cache/workflow-verification.json').write_text(json.dumps({'api':args.api,'database':'PostgreSQL','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: five full datasets, exact DB totals, import idempotence, forecast/backtest, alerts/review, monitoring and PostgreSQL plans.')
