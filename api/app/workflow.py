"""End-to-end operational mock-data workspace API."""
import base64
import binascii
import hashlib
import json
from datetime import date, timedelta
from pathlib import Path
from time import perf_counter
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, insert, select, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .database import get_db
from .deps import get_current_auth
from .models import SalesRecord, User, utc_now
from .workflow_models import Workspace, WorkspaceMember, ProductRecord, ImportJob, ForecastRun, AlertRecord, AuditEvent
from .importing import FIELDS, MAX_BYTES, read_file, validate_rows
from .forecasting import forecast_series

router = APIRouter(prefix='/workspace', tags=['Operational workspace'])
DATASETS = {'stable': '01_stable_demand.csv', 'growth': '02_growth_trend.csv', 'seasonal': '03_seasonal_demand.csv',
            'spike': '04_demand_spike.csv', 'large': '05_large_skewed_sales.csv'}
NAMES = {'TK-A-001': 'Test Kit A', 'GL-B-014': 'Gloves B', 'MK-C-028': 'Mask C', 'SY-D-039': 'Syringe D', 'AG-E-052': 'Antigen E'}


def context(workspace_id: int | None = Header(default=None, alias='X-Workspace-ID'),
            auth: tuple[User, dict] = Depends(get_current_auth), db: Session = Depends(get_db)):
    user = auth[0]
    if workspace_id is None:
        workspace = db.scalar(select(Workspace).where(Workspace.owner_id == user.id))
        if workspace is None:
            workspace = Workspace(owner_id=user.id, name=f'{user.username} · Mock Demand Lab', settings={})
            db.add(workspace)
            try:
                db.flush()
                db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role='owner'))
                db.commit()
            except IntegrityError:
                db.rollback()
                workspace = db.scalar(select(Workspace).where(Workspace.owner_id == user.id))
                if workspace is None:
                    raise HTTPException(409, 'Workspace creation changed concurrently. Retry the request.')
        role = 'owner'
    else:
        workspace = db.get(Workspace, workspace_id)
        member = db.get(WorkspaceMember, (workspace_id, user.id))
        if workspace is None or member is None:
            raise HTTPException(404, 'Workspace not found.')
        role = member.role
    return workspace, user, role, db


def authorize(ctx, roles=('owner', 'admin', 'planner')):
    if ctx[2] not in roles:
        raise HTTPException(403, 'Your workspace role does not allow this action.')


def audit(ctx, action, detail):
    workspace, user, _, db = ctx
    db.add(AuditEvent(workspace_id=workspace.id, user_id=user.id, action=action, detail=detail))


def owned(model, record_id, ctx):
    record = ctx[3].get(model, record_id)
    if record is None or record.workspace_id != ctx[0].id:
        raise HTTPException(404, 'Record not found.')
    return record


def serialize_job(job):
    return {'id': job.id, 'filename': job.filename, 'status': job.status, 'report': job.report,
            'created_at': job.created_at.isoformat(), 'applied_version': job.applied_version}


def serialize_run(run):
    return {'id': run.id, 'product_code': run.product_code, 'region': run.region, 'data_version': run.data_version, 'data_generation': run.data_generation,
            'created_at': run.created_at.isoformat(), **run.result}


@router.get('')
def workspace_info(ctx=Depends(context)):
    workspace, user, role, db = ctx
    workspaces = db.execute(select(Workspace, WorkspaceMember.role).join(WorkspaceMember)
                            .where(WorkspaceMember.user_id == user.id).order_by(Workspace.id)).all()
    return {'id': workspace.id, 'name': workspace.name, 'role': role, 'data_version': workspace.data_version,
            'settings': workspace.settings, 'workspaces': [{'id': w.id, 'name': w.name, 'role': r} for w, r in workspaces]}


@router.get('/datasets')
def datasets(ctx=Depends(context)):
    return [{'id': key, 'filename': filename, 'source': 'synthetic', 'rows': 200000 if key == 'large' else 18250} for key, filename in DATASETS.items()]


class FileRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(max_length=28 * 1024 * 1024)
    mapping: dict[str, str] | None = None


def decode_file(payload):
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
        header, rows = read_file(content, payload.filename)
        return content, header, rows
    except Exception as exc:
        # Only parser errors are surfaced; never dump file contents.
        raise HTTPException(422, f'Cannot read file: {type(exc).__name__}: {str(exc)[:200]}') from exc


@router.post('/imports/preview')
def preview_file(payload: FileRequest, ctx=Depends(context)):
    authorize(ctx)
    _, header, rows = decode_file(payload)
    return {'headers': header, 'total_rows': len(rows), 'preview': rows[:20],
            'suggested_mapping': {field: field if field in header else '' for field in FIELDS}}


def stage_file(content, filename, mapping, ctx):
    workspace, user, _, db = ctx
    try:
        header, raw = read_file(content, filename)
        mapping = mapping or {field: field for field in FIELDS if field in header}
        rows, report = validate_rows(header, raw, mapping)
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    fingerprint = hashlib.sha256(content + json.dumps(mapping, sort_keys=True).encode()).hexdigest()
    existing = db.scalar(select(ImportJob).where(ImportJob.workspace_id == workspace.id, ImportJob.fingerprint == fingerprint)
                         .order_by(ImportJob.id.desc()).limit(1))
    if existing and (existing.source_version == workspace.data_version and existing.status == 'validated'
                     or existing.status == 'committed' and existing.report.get('data_generation') == workspace.data_generation):
        return serialize_job(existing)
    job = ImportJob(workspace_id=workspace.id, created_by=user.id, filename=filename, fingerprint=fingerprint,
                    source_version=workspace.data_version, report=report, rows=rows)
    db.add(job)
    audit(ctx, 'import.validated', f'{filename}: {len(raw)} rows, {report["invalid_rows"]} invalid')
    db.commit()
    return serialize_job(job)


@router.post('/imports/validate')
def validate_file(payload: FileRequest, ctx=Depends(context)):
    authorize(ctx)
    content, _, _ = decode_file(payload)
    return stage_file(content, payload.filename, payload.mapping, ctx)


@router.post('/datasets/{dataset_id}/validate')
def validate_dataset(dataset_id: str, ctx=Depends(context)):
    authorize(ctx)
    if dataset_id not in DATASETS:
        raise HTTPException(404, 'Dataset not found.')
    directories = (Path('/datasets'), Path(__file__).resolve().parents[2] / 'datasets', Path(__file__).resolve().parents[3] / 'datasets')
    source = next((directory / DATASETS[dataset_id] for directory in directories if (directory / DATASETS[dataset_id]).is_file()), None)
    if source is None:
        raise HTTPException(503, 'Dataset volume is unavailable. Mount ./datasets:/datasets:ro or upload the CSV.')
    return stage_file(source.read_bytes(), source.name, None, ctx)


class CommitRequest(BaseModel):
    mode: Literal['append', 'replace'] = 'append'
    acknowledge_duplicates: bool = False


@router.post('/imports/{job_id}/commit')
def commit_import(job_id: int, payload: CommitRequest, ctx=Depends(context)):
    authorize(ctx)
    workspace, _, _, db = ctx
    # Lock workspace and job, guaranteeing one atomic application under concurrent requests.
    workspace = db.scalar(select(Workspace).where(Workspace.id == workspace.id).with_for_update().execution_options(populate_existing=True))
    job = db.scalar(select(ImportJob).where(ImportJob.id == job_id, ImportJob.workspace_id == workspace.id).with_for_update())
    if job is None:
        raise HTTPException(404, 'Import not found.')
    if job.status == 'committed':
        if job.report.get('data_generation') != workspace.data_generation:
            raise HTTPException(409, 'This import belongs to a replaced dataset. Validate the file again.')
        return serialize_job(job)
    if job.source_version != workspace.data_version:
        raise HTTPException(409, 'Data changed after validation. Validate the file again.')
    if job.report['invalid_rows']:
        raise HTTPException(422, 'Fix all invalid rows before importing. No sales rows were written.')
    if job.report['exact_duplicate_rows'] and not payload.acknowledge_duplicates:
        raise HTTPException(409, 'Acknowledge exact duplicate transaction rows before importing.')
    if payload.mode == 'replace':
        db.execute(delete(SalesRecord).where(SalesRecord.user_id == workspace.owner_id))
        workspace.data_generation += 1
    for offset in range(0, len(job.rows), 1000):
        batch = [{**row, 'sale_date': date.fromisoformat(row['sale_date']), 'user_id': workspace.owner_id} for row in job.rows[offset:offset+1000]]
        db.execute(insert(SalesRecord), batch)
    existing = set(db.scalars(select(ProductRecord.code).where(ProductRecord.workspace_id == workspace.id)).all())
    for code in sorted({row['product_code'] for row in job.rows} - existing):
        db.add(ProductRecord(workspace_id=workspace.id, code=code, name=NAMES.get(code, code)))
    workspace.data_version += 1
    job.status = 'committed'
    job.report = job.report | {'commit_mode': payload.mode, 'data_generation': workspace.data_generation}
    job.applied_version = workspace.data_version
    job.rows = []  # Retain report/fingerprint, not a second permanent copy of all sales.
    audit(ctx, 'import.committed', f'{job.filename}: {job.report["valid_rows"]} rows ({payload.mode})')
    db.commit()
    return serialize_job(job)


@router.get('/imports')
def import_history(ctx=Depends(context)):
    return [serialize_job(job) for job in ctx[3].scalars(select(ImportJob).where(ImportJob.workspace_id == ctx[0].id).order_by(ImportJob.id.desc()).limit(50))]


def daily_rows(ctx, product=None, region=None, as_of=None):
    conditions = [SalesRecord.user_id == ctx[0].owner_id]
    if product:
        conditions.append(SalesRecord.product_code == product)
    if region:
        conditions.append(SalesRecord.region == region)
    if as_of:
        conditions.append(SalesRecord.sale_date <= as_of)
    return ctx[3].execute(select(SalesRecord.sale_date, func.sum(SalesRecord.sales_quantity))
                         .where(*conditions).group_by(SalesRecord.sale_date).order_by(SalesRecord.sale_date)).all()


def inventory_snapshots(ctx, product=None, as_of=None):
    conditions = [SalesRecord.user_id == ctx[0].owner_id, SalesRecord.inventory.is_not(None)]
    if product:
        conditions.append(SalesRecord.product_code == product)
    if as_of:
        conditions.append(SalesRecord.sale_date <= as_of)
    # Select latest individual snapshot per product/region; never sum transaction snapshots.
    ranked = select(SalesRecord.product_code, SalesRecord.region, SalesRecord.sale_date, SalesRecord.inventory,
                    func.row_number().over(partition_by=(SalesRecord.product_code, SalesRecord.region),
                    order_by=(SalesRecord.sale_date.desc(), SalesRecord.id.desc())).label('rank')).where(*conditions).subquery()
    return [dict(row._mapping) for row in ctx[3].execute(select(ranked.c.product_code, ranked.c.region, ranked.c.sale_date,
                                                            ranked.c.inventory).where(ranked.c.rank == 1))]


@router.get('/dashboard')
def dashboard(ctx=Depends(context)):
    workspace, _, _, db = ctx
    rows = daily_rows(ctx)
    count = db.scalar(select(func.count()).select_from(SalesRecord).where(SalesRecord.user_id == workspace.owner_id))
    end = rows[-1][0] if rows else None
    latest = db.scalar(select(ForecastRun).where(ForecastRun.workspace_id == workspace.id, ForecastRun.data_version == workspace.data_version,
                       ForecastRun.data_generation == workspace.data_generation).order_by(ForecastRun.id.desc()).limit(1))
    rankings = db.execute(select(SalesRecord.product_code, func.sum(SalesRecord.sales_quantity).label('quantity'))
                          .where(SalesRecord.user_id == workspace.owner_id).group_by(SalesRecord.product_code).order_by(text('quantity DESC'))).all()
    regions = db.execute(select(SalesRecord.region, func.sum(SalesRecord.sales_quantity).label('quantity'))
                        .where(SalesRecord.user_id == workspace.owner_id).group_by(SalesRecord.region).order_by(text('quantity DESC'))).all()
    return {'records': count, 'last_date': end, 'recent_sales': sum(q for day, q in rows if day > end-timedelta(days=30)) if end else 0,
            'trend': [{'date': day, 'actual': quantity} for day, quantity in rows[-60:]],
            'products': [{'code': p, 'quantity': q} for p, q in rankings], 'regions': [{'region': r, 'quantity': q} for r, q in regions],
            'latest_forecast': serialize_run(latest) if latest else None,
            'pending_alerts': db.scalar(select(func.count()).select_from(AlertRecord).join(ForecastRun).where(
                AlertRecord.workspace_id == workspace.id, AlertRecord.review_status == 'pending', ForecastRun.data_version == workspace.data_version)),
            'source': 'Persisted sales; synthetic dataset source', 'data_version': workspace.data_version}


@router.get('/products')
def product_list(ctx=Depends(context)):
    return [{'id': p.id, 'code': p.code, 'name': p.name, 'lead_time_days': p.lead_time_days, 'safety_stock': p.safety_stock}
            for p in ctx[3].scalars(select(ProductRecord).where(ProductRecord.workspace_id == ctx[0].id).order_by(ProductRecord.code))]


class ProductUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lead_time_days: int = Field(ge=1, le=365)
    safety_stock: int = Field(ge=0, le=2147483647)


@router.put('/products/{product_id}')
def update_product(product_id: int, payload: ProductUpdate, ctx=Depends(context)):
    authorize(ctx)
    product = owned(ProductRecord, product_id, ctx)
    for key, value in payload.model_dump().items():
        setattr(product, key, value)
    audit(ctx, 'product.updated', product.code)
    ctx[3].commit()
    return {'message': 'Product saved.'}


@router.get('/inventory')
def inventory(ctx=Depends(context)):
    return inventory_snapshots(ctx)


class ForecastRequest(BaseModel):
    product_code: str = Field(min_length=1, max_length=64)
    region: str = Field(min_length=1, max_length=64)
    horizon: int = Field(default=30, ge=7, le=90)
    signals: list[Literal['disease', 'seasonality', 'policy', 'population']] = Field(default_factory=list, max_length=4)
    acknowledge_missing_days: bool = False
    as_of: date | None = None


@router.post('/forecasts', status_code=201)
def run_forecast(payload: ForecastRequest, ctx=Depends(context)):
    authorize(ctx)
    workspace, user, _, db = ctx
    # Serializes with imports so a forecast never claims a different data version.
    workspace = db.scalar(select(Workspace).where(Workspace.id == workspace.id).with_for_update().execution_options(populate_existing=True))
    rows = daily_rows(ctx, payload.product_code, payload.region, payload.as_of)
    if not rows:
        raise HTTPException(422, 'Import sales for this product and region first.')
    missing = (rows[-1][0]-rows[0][0]).days + 1 - len(rows)
    if missing and not payload.acknowledge_missing_days:
        raise HTTPException(409, f'{missing} missing dates. Explicitly acknowledge zero filling before forecasting.')
    try:
        result = forecast_series(rows, payload.horizon, list(dict.fromkeys(payload.signals)))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    run = ForecastRun(workspace_id=workspace.id, created_by=user.id, data_generation=workspace.data_generation, product_code=payload.product_code,
                      region=payload.region, data_version=workspace.data_version, result=result)
    db.add(run)
    db.flush()
    product = db.scalar(select(ProductRecord).where(ProductRecord.workspace_id == workspace.id, ProductRecord.code == payload.product_code))
    snapshot = next((item for item in inventory_snapshots(ctx, payload.product_code, rows[-1][0]) if item['region'] == payload.region), None)
    threshold = workspace.settings.get('alert_threshold_percent', 15)
    origin = rows[-1][0]
    recent = [q for d, q in rows if d > origin-timedelta(days=7)]
    previous = [q for d, q in rows if origin-timedelta(days=35) < d <= origin-timedelta(days=7)]
    if previous and recent and sum(previous) > 0:
        observed_change = (sum(recent)/7 / (sum(previous)/28)-1)*100
        if abs(observed_change) >= threshold:
            db.add(AlertRecord(workspace_id=workspace.id, forecast_id=run.id, level='HIGH' if abs(observed_change) >= 30 else 'MEDIUM',
                               kind='observed_change', message=f'Observed recent 7-day demand changed {observed_change:.1f}% versus prior 28 days at {origin}. Synthetic sales, verify before acting.'))
    if result['change_percent'] is not None and abs(result['change_percent']) >= threshold:
        db.add(AlertRecord(workspace_id=workspace.id, forecast_id=run.id, level='HIGH' if abs(result['change_percent']) >= 30 else 'MEDIUM',
                           kind='demand_change', message=f'{payload.product_code} / {payload.region}: demand change {result["change_percent"]}% (mock scenario).'))
    if snapshot and product:
        daily_demand = result['total'] / payload.horizon
        needed = daily_demand * product.lead_time_days + product.safety_stock
        if snapshot['inventory'] < needed:
            db.add(AlertRecord(workspace_id=workspace.id, forecast_id=run.id, level='HIGH', kind='stock_risk',
                               message=f'Stock snapshot {snapshot["inventory"]} on {snapshot["sale_date"]}; estimated lead-time demand + safety stock {needed:.0f}. Verify snapshot freshness before acting.'))
    if result['metrics']['wape_percent'] is not None and result['metrics']['wape_percent'] > 25:
        db.add(AlertRecord(workspace_id=workspace.id, forecast_id=run.id, level='MEDIUM', kind='model_error', message='Holdout WAPE exceeds 25%; human review required.'))
    audit(ctx, 'forecast.completed', f'{payload.product_code}/{payload.region}: {result["model"]}, run {run.id}')
    db.commit()
    return serialize_run(run)


@router.get('/forecasts')
def forecast_history(ctx=Depends(context)):
    return [serialize_run(run) for run in ctx[3].scalars(select(ForecastRun).where(ForecastRun.workspace_id == ctx[0].id).order_by(ForecastRun.id.desc()).limit(50))]


@router.get('/forecasts/{run_id}')
def get_forecast(run_id: int, ctx=Depends(context)):
    return serialize_run(owned(ForecastRun, run_id, ctx))


@router.get('/forecasts/{run_id}/export')
def export_forecast(run_id: int, ctx=Depends(context)):
    import csv
    import io
    run = owned(ForecastRun, run_id, ctx)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['date', 'forecast', 'baseline', 'lower', 'upper'])
    writer.writeheader()
    writer.writerows(run.result['points'])
    return Response('\ufeff' + output.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="forecast-{run.id}.csv"'})


@router.get('/alerts')
def alert_list(ctx=Depends(context)):
    rows = ctx[3].execute(select(AlertRecord, ForecastRun.data_version).join(ForecastRun).where(AlertRecord.workspace_id == ctx[0].id)
                          .order_by(AlertRecord.id.desc()).limit(100)).all()
    return [{'id': a.id, 'forecast_id': a.forecast_id, 'level': a.level, 'kind': a.kind, 'message': a.message,
             'review_status': a.review_status, 'review_note': a.review_note, 'reviewed_by': a.reviewed_by,
             'reviewed_at': a.reviewed_at, 'stale': version != ctx[0].data_version} for a, version in rows]


class ReviewRequest(BaseModel):
    status: Literal['approved', 'dismissed', 'pending']
    note: str = Field(min_length=1, max_length=2000)


@router.put('/alerts/{alert_id}/review')
def review_alert(alert_id: int, payload: ReviewRequest, ctx=Depends(context)):
    authorize(ctx)
    alert = owned(AlertRecord, alert_id, ctx)
    alert.review_status, alert.review_note = payload.status, payload.note
    alert.reviewed_by, alert.reviewed_at = ctx[1].id, utc_now()
    audit(ctx, 'alert.reviewed', f'{alert.id}: {payload.status}')
    ctx[3].commit()
    return {'message': 'Review saved.'}


@router.get('/monitoring')
def monitoring(ctx=Depends(context)):
    runs = list(ctx[3].scalars(select(ForecastRun).where(ForecastRun.workspace_id == ctx[0].id).order_by(ForecastRun.id.desc()).limit(20)))
    results = []
    for run in runs:
        lineage_changed = run.data_generation != ctx[0].data_generation
        actual = {} if lineage_changed else dict(daily_rows(ctx, run.product_code, run.region))
        matched = [{'date': p['date'], 'forecast': p['forecast'], 'actual': actual[date.fromisoformat(p['date'])]}
                   for p in run.result['points'] if date.fromisoformat(p['date']) in actual]
        from .forecasting import metrics
        results.append({'id': run.id, 'product_code': run.product_code, 'region': run.region,
                        'stale': run.data_version != ctx[0].data_version, 'lineage_changed': lineage_changed, 'holdout': run.result['metrics'], 'matched_days': len(matched),
                        'live_metrics': metrics([p['actual'] for p in matched], [p['forecast'] for p in matched]) if matched else None,
                        'actual_vs_forecast': matched, 'backtest': run.result['backtest']})
    events = ctx[3].scalars(select(AuditEvent).where(AuditEvent.workspace_id == ctx[0].id).order_by(AuditEvent.id.desc()).limit(50))
    return {'runs': results, 'events': [{'action': e.action, 'detail': e.detail, 'created_at': e.created_at} for e in events]}


class MockSyncRequest(BaseModel):
    forecast_id: int
    days: int = Field(default=7, ge=1, le=30)


@router.post('/integrations/mock-erp-sync')
def mock_erp_sync(payload: MockSyncRequest, ctx=Depends(context)):
    """Explicit synthetic ERP adapter for demonstrating the monitor/reforecast loop."""
    authorize(ctx)
    workspace, _, _, db = ctx
    workspace = db.scalar(select(Workspace).where(Workspace.id == workspace.id).with_for_update().execution_options(populate_existing=True))
    run = owned(ForecastRun, payload.forecast_id, ctx)
    if run.data_generation != workspace.data_generation:
        raise HTTPException(409, 'This forecast belongs to a replaced dataset. Run a new forecast before simulating actuals.')
    actual = dict(daily_rows(ctx, run.product_code, run.region))
    snapshots = inventory_snapshots(ctx, run.product_code)
    stock = next((p['inventory'] for p in snapshots if p['region'] == run.region), None)
    inserted = 0
    for i, point in enumerate(run.result['points'][:payload.days]):
        day = date.fromisoformat(point['date'])
        if day in actual:
            continue
        # Fixed reproducible perturbation; an illustrative outcome, not real ERP data.
        quantity = max(0, round(point['baseline'] * (0.9 + ((day.toordinal() + workspace.id) % 11) / 50)))
        if stock is not None:
            stock = max(0, stock-quantity)
        db.add(SalesRecord(user_id=workspace.owner_id, sale_date=day, product_code=run.product_code,
                           region=run.region, sales_quantity=quantity, inventory=stock))
        inserted += 1
    if inserted:
        workspace.data_version += 1
        audit(ctx, 'mock_erp.synced', f'Explicit synthetic actuals: {inserted} dates for forecast {run.id}')
        db.commit()
    return {'inserted': inserted, 'source': 'mock ERP simulator; not a real business integration', 'data_version': workspace.data_version}


class SettingsRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    auto_refresh: bool = True
    compact_table: bool = False
    alert_threshold_percent: int = Field(default=15, ge=5, le=100)


@router.put('/settings')
def save_settings(payload: SettingsRequest, ctx=Depends(context)):
    authorize(ctx, ('owner', 'admin'))
    ctx[0].name = payload.name
    ctx[0].settings = payload.model_dump(exclude={'name'})
    audit(ctx, 'settings.saved', 'Workspace settings updated')
    ctx[3].commit()
    return workspace_info(ctx)


@router.get('/members')
def members(ctx=Depends(context)):
    rows = ctx[3].execute(select(User, WorkspaceMember.role).join(WorkspaceMember).where(WorkspaceMember.workspace_id == ctx[0].id)).all()
    return [{'id': user.id, 'username': user.username, 'role': role} for user, role in rows]


class MemberRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    role: Literal['admin', 'planner', 'viewer']


@router.put('/members')
def add_member(payload: MemberRequest, ctx=Depends(context)):
    authorize(ctx, ('owner',))
    user = ctx[3].scalar(select(User).where(User.username == payload.username.lower().strip()))
    if user is None:
        raise HTTPException(404, 'User must register first.')
    if user.id == ctx[0].owner_id:
        raise HTTPException(409, 'Owner role cannot be changed.')
    member = ctx[3].get(WorkspaceMember, (ctx[0].id, user.id))
    if member:
        member.role = payload.role
    else:
        ctx[3].add(WorkspaceMember(workspace_id=ctx[0].id, user_id=user.id, role=payload.role))
    audit(ctx, 'member.saved', f'{user.username}: {payload.role}')
    ctx[3].commit()
    return members(ctx)


@router.delete('/members/{user_id}')
def remove_member(user_id: int, ctx=Depends(context)):
    authorize(ctx, ('owner',))
    if user_id == ctx[0].owner_id:
        raise HTTPException(409, 'Cannot remove workspace owner.')
    ctx[3].execute(delete(WorkspaceMember).where(WorkspaceMember.workspace_id == ctx[0].id, WorkspaceMember.user_id == user_id))
    audit(ctx, 'member.removed', str(user_id))
    ctx[3].commit()
    return {'message': 'Member removed.'}


@router.get('/sales/query')
def query_sales(product_code: str | None = Query(default=None, max_length=64), region: str | None = Query(default=None, max_length=64),
                limit: int = Query(default=50, ge=1, le=100), ctx=Depends(context)):
    conditions = [SalesRecord.user_id == ctx[0].owner_id]
    if product_code:
        conditions.append(SalesRecord.product_code == product_code)
    if region:
        conditions.append(SalesRecord.region == region)
    query = select(SalesRecord).where(*conditions).order_by(SalesRecord.sale_date.desc(), SalesRecord.id.desc()).limit(limit)
    start = perf_counter()
    rows = ctx[3].scalars(query).all()
    elapsed = (perf_counter()-start)*1000
    plan = None
    if ctx[3].bind.dialect.name == 'postgresql':
        # Constants are generated by SQLAlchemy's dialect literal renderer, not concatenated user SQL.
        sql = str(query.compile(ctx[3].bind, compile_kwargs={'literal_binds': True}))
        plan = ctx[3].execute(text('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql)).scalar()
    return {'items': [{'id': row.id, 'sale_date': row.sale_date, 'product_code': row.product_code, 'region': row.region,
                       'sales_quantity': row.sales_quantity, 'inventory': row.inventory} for row in rows],
            'query_ms': round(elapsed, 3), 'plan': plan, 'note': 'Measured database query only; EXPLAIN runs a second warm query. Before/after index comparison is in indexing-lab.'}
