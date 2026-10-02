from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


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
