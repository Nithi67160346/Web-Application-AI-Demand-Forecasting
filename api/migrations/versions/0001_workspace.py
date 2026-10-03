"""Frozen initial schema, adopts existing auth/sales tables without dropping data."""
revision = "0001_workspace"
down_revision = None
branch_labels = None
depends_on = None
from alembic import op
from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sqlalchemy.orm import DeclarativeBase
class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="planner", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SalesRecord(Base):
    __tablename__ = "sales_records"
    __table_args__ = (
        CheckConstraint("sales_quantity >= 0", name="ck_sales_quantity_nonnegative"),
        CheckConstraint("inventory IS NULL OR inventory >= 0", name="ck_sales_inventory_nonnegative"),
        Index("idx_sales_user_product_region_date", "user_id", "product_code", "region", "sale_date", "id"),
        Index("idx_sales_user_date", "user_id", "sale_date", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    product_code: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    sales_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    inventory: Mapped[int | None] = mapped_column(Integer, nullable=True)

"""Persistent operational workspace; synthetic inputs are still stored as real data."""
from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column




class Workspace(Base):
    __tablename__ = 'workspaces'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)
    name: Mapped[str] = mapped_column(String(120), default='Mock Demand Lab')
    data_version: Mapped[int] = mapped_column(Integer, default=0)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class WorkspaceMember(Base):
    __tablename__ = 'workspace_members'
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default='planner')


class ProductRecord(Base):
    __tablename__ = 'products'
    __table_args__ = (UniqueConstraint('workspace_id', 'code'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(120))
    lead_time_days: Mapped[int] = mapped_column(Integer, default=14)
    safety_stock: Mapped[int] = mapped_column(Integer, default=0)


class ImportJob(Base):
    __tablename__ = 'import_jobs'
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    filename: Mapped[str] = mapped_column(String(255))
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20), default='validated')
    source_version: Mapped[int] = mapped_column(Integer)
    applied_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    report: Mapped[dict] = mapped_column(JSON)
    rows: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ForecastRun(Base):
    __tablename__ = 'forecast_runs'
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    product_code: Mapped[str] = mapped_column(String(64))
    region: Mapped[str] = mapped_column(String(64))
    data_version: Mapped[int] = mapped_column(Integer)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AlertRecord(Base):
    __tablename__ = 'alerts'
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    forecast_id: Mapped[int] = mapped_column(ForeignKey('forecast_runs.id', ondelete='CASCADE'))
    level: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(String(20), default='pending')
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

def upgrade():
    Base.metadata.create_all(op.get_bind(), checkfirst=True)

def downgrade():
    raise RuntimeError("Initial schema downgrade would delete user data. Restore a verified backup instead.")
