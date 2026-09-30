from decimal import Decimal
from datetime import datetime
from sqlalchemy import BigInteger, String, Boolean, DateTime, Numeric, Float, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    challan_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    challan_series: Mapped[str] = mapped_column(String(50), nullable=False, default="own", server_default="own", index=True)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    product: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    destination: Mapped[str] = mapped_column(String(255), nullable=False, default="Mumbai", index=True)
    destination_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    destination_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    party_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gst_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none", server_default="none")
    gst_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    total_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    created_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    updated_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_entries")
    updater = relationship("User", foreign_keys=[updated_by], back_populates="updated_entries")

    __table_args__ = (
        Index(
            "uq_challan_product_active",
            "challan_no",
            "product",
            unique=True,
            postgresql_where=(is_deleted.is_(False)),
        ),
    )
