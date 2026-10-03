"""Persistent operational workspace; synthetic inputs are still stored as real data."""
from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base
from .models import utc_now


class Workspace(Base):
    __tablename__ = 'workspaces'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)
    name: Mapped[str] = mapped_column(String(120), default='Mock Demand Lab')
    data_version: Mapped[int] = mapped_column(Integer, default=0)
    data_generation: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
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
    data_generation: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
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
