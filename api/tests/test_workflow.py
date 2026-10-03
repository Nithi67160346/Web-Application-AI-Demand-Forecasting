"""Behavioral checks for atomic imports, tenant roles, temporal forecasts and persistence."""
import base64
import csv
import io
import os
import unittest
from datetime import date, timedelta

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['JWT_SECRET_KEY'] = 'isolated-test-secret-for-sales-tests'
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app
from app.forecasting import forecast_series


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda conn, _: conn.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        def db():
            with Session(self.engine) as session:
                yield session
        app.dependency_overrides[get_db] = db
        self.client = TestClient(app)
        self.headers = self.register('owner1')
        self.other = self.register('other1')
        self.workspace = self.get('').json()['id']

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def register(self, name):
        response = self.client.post('/register', json={'username': name, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 201, response.text)
        return {'Authorization': 'Bearer ' + response.json()['access_token']}

    def get(self, path, headers=None):
        return self.client.get('/workspace' + path, headers=headers or self.headers)

    def post(self, path, body, headers=None):
        return self.client.post('/workspace' + path, json=body, headers=headers or self.headers)

    def file(self, days=140, invalid=False, duplicate=False, offset=0):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['sale_date', 'product_code', 'region', 'sales_quantity', 'inventory'])
        rows = [[(date(2026, 1, 1)+timedelta(days=i+offset)).isoformat(), 'TK-A-001', 'Bangkok', 100, 10] for i in range(days)]
        if invalid:
            rows[3][3] = -1
        if duplicate:
            rows.append(rows[0])
        writer.writerows(rows)
        return {'filename': 'sales.csv', 'content_base64': base64.b64encode(output.getvalue().encode()).decode()}

    def import_file(self, payload=None, mode='append', ack=False):
        stage = self.post('/imports/validate', payload or self.file())
        self.assertEqual(stage.status_code, 200, stage.text)
        committed = self.post(f'/imports/{stage.json()["id"]}/commit', {'mode': mode, 'acknowledge_duplicates': ack})
        self.assertEqual(committed.status_code, 200, committed.text)
        return stage.json()['id']

    def forecast(self):
        response = self.post('/forecasts', {'product_code': 'TK-A-001', 'region': 'Bangkok', 'horizon': 30})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_atomic_invalid_import_and_idempotence(self):
        stage = self.post('/imports/validate', self.file(invalid=True)).json()
        self.assertEqual(stage['report']['invalid_rows'], 1)
        self.assertEqual(self.post(f'/imports/{stage["id"]}/commit', {}).status_code, 422)
        self.assertEqual(self.get('/dashboard').json()['records'], 0)
        job = self.import_file()
        self.assertEqual(self.post(f'/imports/{job}/commit', {}).status_code, 200)
        self.assertEqual(self.get('/dashboard').json()['records'], 140)
        self.assertEqual(self.get('/dashboard', self.other).json()['records'], 0)
        self.assertEqual(self.get(f'/imports', self.other | {'X-Workspace-ID': str(self.workspace)}).status_code, 404)

    def test_product_summary_is_tenant_scoped_and_uses_latest_snapshots(self):
        self.import_file(self.file(duplicate=True), ack=True)
        product = self.get('/products').json()[0]
        summary = self.get(f'/products/{product["id"]}/summary')
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.json()['recent_sales'], 3000)
        self.assertEqual(summary.json()['daily_average'], 100)
        self.assertEqual(summary.json()['inventory'][0]['inventory'], 10)
        self.assertEqual(len(summary.json()['trend']), 90)
        self.assertEqual(self.get(f'/products/{product["id"]}/summary', self.other).status_code, 404)

    def test_six_month_forecast_preserves_temporal_cutoff_and_bound(self):
        self.import_file(self.file(days=200))
        cutoff = (date(2026, 1, 1)+timedelta(days=139)).isoformat()
        run = self.post('/forecasts', {'product_code':'TK-A-001','region':'Bangkok','horizon':180,'as_of':cutoff})
        self.assertEqual(run.status_code, 201, run.text)
        self.assertEqual(run.json()['origin'], cutoff)
        self.assertEqual(len(run.json()['points']), 180)
        self.assertEqual(run.json()['total'], 18000)
        self.assertEqual(run.json()['inventory_snapshot']['sale_date'], cutoff)
        persisted = self.get(f'/forecasts/{run.json()["id"]}').json()
        self.assertEqual(persisted['inventory_snapshot']['inventory'], 10)
        self.assertEqual(self.post('/forecasts', {'product_code':'TK-A-001','region':'Bangkok','horizon':181}).status_code, 422)

    def test_duplicates_require_acknowledgment_and_snapshot_is_not_sum(self):
        payload = self.file(duplicate=True)
        stage = self.post('/imports/validate', payload).json()
        self.assertEqual(stage['report']['exact_duplicate_rows'], 1)
        self.assertEqual(self.post(f'/imports/{stage["id"]}/commit', {}).status_code, 409)
        self.import_file(payload, ack=True)
        stock = self.get('/inventory').json()
        self.assertEqual(stock[0]['inventory'], 10)
        self.assertEqual(self.get('/dashboard').json()['records'], 141)

    def test_forecast_monitoring_review_export_and_replace(self):
        self.import_file()
        run = self.forecast()
        self.assertEqual(run['total'], 3000)
        self.assertEqual(run['metrics']['mae'], 0)
        self.assertEqual(len(run['points']), 30)
        self.assertEqual(run['points'][0]['date'], '2026-05-21')
        self.assertEqual(self.get('/monitoring').json()['runs'][0]['matched_days'], 0)
        alerts = self.get('/alerts').json()
        self.assertTrue(any(a['kind']=='stock_risk' if 'kind' in a else 'stock' in a['message'].lower() for a in alerts))
        response = self.client.put(f'/workspace/alerts/{alerts[0]["id"]}/review', headers=self.headers, json={'status':'approved','note':'Verified mock scenario'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get('/alerts').json()[0]['review_note'], 'Verified mock scenario')
        self.assertEqual(self.get(f'/forecasts/{run["id"]}/export').text.count('\n'), 31)
        self.assertEqual(self.get(f'/forecasts/{run["id"]}', self.other).status_code, 404)
        self.import_file(self.file(days=7, offset=140))
        monitor = self.get('/monitoring').json()['runs'][0]
        self.assertEqual(monitor['matched_days'], 7)
        self.assertEqual(monitor['live_metrics']['mae'], 0)
        self.import_file(self.file(days=112), mode='replace')
        self.assertEqual(self.get('/dashboard').json()['records'], 112)
        self.assertTrue(self.get('/alerts').json()[0]['stale'])
        replaced=self.get('/monitoring').json()['runs'][0]
        self.assertTrue(replaced['lineage_changed'])
        self.assertIsNone(replaced['live_metrics'])
        self.assertEqual(self.post('/integrations/mock-erp-sync',{'forecast_id':run['id']}).status_code,409)

    def test_viewer_team_permissions_and_user_privacy(self):
        added = self.client.put('/workspace/members', headers=self.headers, json={'username':'other1','role':'viewer'})
        self.assertEqual(added.status_code, 200)
        shared = self.other | {'X-Workspace-ID': str(self.workspace)}
        self.assertEqual(self.get('/dashboard', shared).status_code, 200)
        self.assertEqual(self.post('/imports/preview', self.file(), shared).status_code, 403)
        self.assertEqual(self.post('/forecasts', {'product_code':'TK-A-001','region':'Bangkok'}, shared).status_code, 403)
        self.assertEqual(self.client.put('/workspace/settings', headers=shared, json={'name':'Changed'}).status_code, 403)
        self.assertEqual(self.client.get('/users', headers=self.headers).status_code, 403)
        owner_id = self.client.get('/me', headers=self.headers).json()['id']
        self.assertEqual(self.client.get(f'/users/{owner_id}', headers=self.other).status_code, 403)

    def test_stale_validation_requires_recheck_and_settings_persist(self):
        first = self.post('/imports/validate', self.file()).json()
        self.import_file(self.file(days=7, offset=200))
        self.assertEqual(self.post(f'/imports/{first["id"]}/commit', {}).status_code, 409)
        result = self.client.put('/workspace/settings', headers=self.headers, json={'name':'Scenario Team','auto_refresh':False,'compact_table':True,'alert_threshold_percent':25})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.get('').json()['name'], 'Scenario Team')
        self.assertTrue(self.get('').json()['settings']['compact_table'])

    def test_same_file_is_not_reimported_after_unrelated_append(self):
        first=self.import_file()
        self.import_file(self.file(days=7,offset=200))
        stage=self.post('/imports/validate',self.file()).json()
        self.assertEqual(stage['id'],first)
        self.assertEqual(stage['status'],'committed')
        self.assertEqual(self.get('/dashboard').json()['records'],147)

    def test_excel_zero_and_mapping(self):
        from openpyxl import Workbook
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(['Date','SKU','Area','Units','Stock'])
        sheet.append([date(2026,1,1),'P1','North',0,0])
        output = io.BytesIO()
        workbook.save(output)
        payload = {'filename':'mapped.xlsx','content_base64':base64.b64encode(output.getvalue()).decode(),
                   'mapping':dict(zip(['sale_date','product_code','region','sales_quantity','inventory'],['Date','SKU','Area','Units','Stock']))}
        report = self.post('/imports/validate', payload)
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()['report']['preview'][0]['sales_quantity'], 0)
        self.assertEqual(report.json()['report']['preview'][0]['inventory'], 0)
        self.assertEqual(self.post('/imports/preview', {'filename':'bad.csv','content_base64':'not-base64'}).status_code, 422)

    def test_no_temporal_leakage_in_model_selection(self):
        rows = [(date(2024,1,1)+timedelta(days=i),100+i*.1) for i in range(500)]
        original = forecast_series(rows, 30, [])
        changed = rows[:-28]+[(day, quantity*10) for day,quantity in rows[-28:]]
        shifted = forecast_series(changed,30,[])
        self.assertEqual(original['model'],shifted['model'])
        self.assertEqual(original['selection_mae'],shifted['selection_mae'])
        self.assertGreater(shifted['metrics']['mae'],original['metrics']['mae'])

    def test_mock_erp_sync_is_explicit_and_idempotent(self):
        self.import_file()
        run=self.forecast()
        first=self.post('/integrations/mock-erp-sync',{'forecast_id':run['id'],'days':7})
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual(first.json()['inserted'],7)
        second=self.post('/integrations/mock-erp-sync',{'forecast_id':run['id'],'days':7})
        self.assertEqual(second.json()['inserted'],0)
        self.assertEqual(second.json()['data_version'],first.json()['data_version'])
        monitor=self.get('/monitoring').json()['runs'][0]
        self.assertEqual(monitor['matched_days'],7)
        self.assertGreater(monitor['live_metrics']['mae'],0)

    def test_forecast_as_of_does_not_read_future_sales_or_stock(self):
        self.import_file()
        future=self.file(days=2,offset=200)
        future['content_base64']=base64.b64encode(base64.b64decode(future['content_base64']).replace(b',100,10',b',10000,100000')).decode()
        self.import_file(future)
        run=self.post('/forecasts',{'product_code':'TK-A-001','region':'Bangkok','horizon':7,'as_of':'2026-05-05'})
        self.assertEqual(run.status_code,201,run.text)
        self.assertEqual(run.json()['origin'],'2026-05-05')
        self.assertEqual(run.json()['points'][0]['date'],'2026-05-06')
        self.assertEqual(run.json()['total'],700)
        self.assertTrue(any(alert['kind']=='stock_risk' and alert['forecast_id']==run.json()['id'] for alert in self.get('/alerts').json()))


if __name__ == '__main__':
    unittest.main()
