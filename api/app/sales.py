"""Bounded, user-scoped sales queries matching the project's B-tree indexes."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, insert, select, tuple_
from sqlalchemy.orm import Session

from .database import get_db
from .deps import get_current_auth
from .models import SalesRecord, User
from .workflow_models import Workspace

router = APIRouter(prefix="/sales", tags=["Sales history"])


class SaleInput(BaseModel):
    sale_date: date
    product_code: str = Field(min_length=1, max_length=64)
    region: str = Field(min_length=1, max_length=64)
    sales_quantity: int = Field(ge=0, le=2_147_483_647)
    inventory: int | None = Field(default=None, ge=0, le=2_147_483_647)

    @field_validator("product_code", "region")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Must not be blank")
        return value


class SalesBatch(BaseModel):
    items: list[SaleInput] = Field(min_length=1, max_length=1000)


class SaleResponse(SaleInput):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SalesPage(BaseModel):
    items: list[SaleResponse]
    next_cursor: str | None


class DailySales(BaseModel):
    sale_date: date
    sales_quantity: int


def date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date >= end_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date (exclusive)")


def filters(user_id: int, product_code: str | None, region: str | None, start_date: date | None, end_date: date | None):
    conditions = [SalesRecord.user_id == user_id]
    if product_code is not None:
        conditions.append(SalesRecord.product_code == product_code)
    if region is not None:
        conditions.append(SalesRecord.region == region)
    if start_date is not None:
        conditions.append(SalesRecord.sale_date >= start_date)
    if end_date is not None:
        conditions.append(SalesRecord.sale_date < end_date)
    return conditions


@router.post("/batch", status_code=201)
def import_sales(
    payload: SalesBatch,
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    user, _ = current_auth
    workspace = db.scalar(select(Workspace).where(Workspace.owner_id == user.id).with_for_update())
    db.execute(insert(SalesRecord), [item.model_dump() | {"user_id": user.id} for item in payload.items])
    if workspace:
        workspace.data_version += 1
    db.commit()
    return {"inserted": len(payload.items)}


@router.get("", response_model=SalesPage)
def list_sales(
    product_code: str | None = Query(default=None, min_length=1, max_length=64),
    region: str | None = Query(default=None, min_length=1, max_length=64),
    start_date: date | None = None,
    end_date: date | None = None,
    cursor: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=50, ge=1, le=100),
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> SalesPage:
    date_range(start_date, end_date)
    user, _ = current_auth
    conditions = filters(user.id, product_code, region, start_date, end_date)
    if cursor:
        try:
            raw_date, raw_id = cursor.split(":")
            cursor_date, cursor_id = date.fromisoformat(raw_date), int(raw_id)
            if not 0 < cursor_id <= 9_223_372_036_854_775_807:
                raise ValueError("Invalid id")
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="Invalid cursor; use next_cursor from the previous response") from exc
        conditions.append(tuple_(SalesRecord.sale_date, SalesRecord.id) < tuple_(cursor_date, cursor_id))
    rows = db.scalars(
        select(SalesRecord).where(*conditions)
        .order_by(SalesRecord.sale_date.desc(), SalesRecord.id.desc()).limit(limit + 1)
    ).all()
    items = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        next_cursor = f"{last.sale_date.isoformat()}:{last.id}"
    return SalesPage(items=[SaleResponse.model_validate(row) for row in items], next_cursor=next_cursor)


@router.get("/daily", response_model=list[DailySales])
def daily_sales(
    start_date: date,
    end_date: date,
    product_code: str | None = Query(default=None, min_length=1, max_length=64),
    region: str | None = Query(default=None, min_length=1, max_length=64),
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[DailySales]:
    date_range(start_date, end_date)
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Select at most 366 days per request")
    user, _ = current_auth
    rows = db.execute(
        select(SalesRecord.sale_date, func.sum(SalesRecord.sales_quantity).label("sales_quantity"))
        .where(*filters(user.id, product_code, region, start_date, end_date))
        .group_by(SalesRecord.sale_date).order_by(SalesRecord.sale_date)
    ).all()
    return [DailySales(sale_date=row.sale_date, sales_quantity=row.sales_quantity) for row in rows]
