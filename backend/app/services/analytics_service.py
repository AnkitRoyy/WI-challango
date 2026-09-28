from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import Tuple, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.models.entry import Entry
from app.schemas.analytics import (
    AnalyticsBucket,
    AnalyticsSummaryResponse,
    TopProductItem,
    TopProductsResponse,
    TopDestinationItem,
    TopDestinationsResponse,
)


VALID_PERIODS = {"day", "week", "month", "year"}


def resolve_date_range(
    period: str,
    date_from_str: Optional[str] = None,
    date_to_str: Optional[str] = None,
) -> Tuple[datetime, datetime]:
    """
    Resolve and validate date range for analytics queries.
    Default ranges:
    - day: last 30 days
    - week: last 12 weeks
    - month: last 12 months (~365 days)
    - year: last 5 years (~1825 days)
    """
    now = datetime.now(timezone.utc)

    if date_to_str:
        try:
            if "T" in date_to_str:
                date_to = datetime.fromisoformat(date_to_str)
            else:
                date_to = datetime.strptime(date_to_str, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_to format '{date_to_str}'. Use YYYY-MM-DD or ISO-8601.",
            )
    else:
        date_to = now

    if date_from_str:
        try:
            if "T" in date_from_str:
                date_from = datetime.fromisoformat(date_from_str)
            else:
                date_from = datetime.strptime(date_from_str, "%Y-%m-%d").replace(
                    hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_from format '{date_from_str}'. Use YYYY-MM-DD or ISO-8601.",
            )
    else:
        if period == "day":
            date_from = date_to - timedelta(days=30)
        elif period == "week":
            date_from = date_to - timedelta(weeks=12)
        elif period == "month":
            date_from = date_to - timedelta(days=365)
        elif period == "year":
            date_from = date_to - timedelta(days=1826)
        else:
            date_from = date_to - timedelta(days=30)

    # Ensure timezone awareness
    if date_from.tzinfo is None:
        date_from = date_from.replace(tzinfo=timezone.utc)
    if date_to.tzinfo is None:
        date_to = date_to.replace(tzinfo=timezone.utc)

    return date_from, date_to


def format_bucket_label(dt: datetime, period: str) -> str:
    if period == "day":
        return dt.strftime("%Y-%m-%d")
    elif period == "week":
        iso_year, iso_week, _ = dt.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    elif period == "month":
        return dt.strftime("%Y-%m")
    elif period == "year":
        return dt.strftime("%Y")
    return dt.strftime("%Y-%m-%d")


def get_analytics_summary(
    db: Session,
    period: str,
    date_from_str: Optional[str] = None,
    date_to_str: Optional[str] = None,
) -> AnalyticsSummaryResponse:
    period_clean = period.lower().strip()
    if period_clean not in VALID_PERIODS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid period '{period}'. Must be one of: day, week, month, year.",
        )

    date_from, date_to = resolve_date_range(period_clean, date_from_str, date_to_str)

    # Database-level grouping using date_trunc
    bucket_expr = func.date_trunc(period_clean, Entry.created_at).label("bucket")
    rows = (
        db.query(
            bucket_expr,
            func.count(Entry.id).label("entry_count"),
            func.coalesce(func.sum(Entry.quantity), Decimal("0.00")).label("total_quantity"),
            func.coalesce(func.sum(Entry.total_price), Decimal("0.00")).label("total_value"),
        )
        .filter(Entry.is_deleted == False)
        .filter(Entry.created_at >= date_from)
        .filter(Entry.created_at <= date_to)
        .group_by(bucket_expr)
        .order_by(bucket_expr.asc())
        .all()
    )

    buckets: List[AnalyticsBucket] = []
    total_entries = 0
    total_quantity = Decimal("0.00")
    total_value = Decimal("0.00")

    for row in rows:
        b_dt = row.bucket
        if b_dt.tzinfo is None:
            b_dt = b_dt.replace(tzinfo=timezone.utc)
        label = format_bucket_label(b_dt, period_clean)
        count = int(row.entry_count)
        qty = Decimal(str(row.total_quantity))
        val = Decimal(str(row.total_value))

        buckets.append(
            AnalyticsBucket(
                bucket_label=label,
                bucket_date=b_dt,
                entry_count=count,
                total_quantity=qty,
                total_value=val,
            )
        )
        total_entries += count
        total_quantity += qty
        total_value += val

    return AnalyticsSummaryResponse(
        period=period_clean,
        date_from=date_from,
        date_to=date_to,
        total_entries=total_entries,
        total_quantity=total_quantity,
        total_value=total_value,
        buckets=buckets,
    )


def get_top_products(
    db: Session,
    period: str = "month",
    date_from_str: Optional[str] = None,
    date_to_str: Optional[str] = None,
    limit: int = 10,
) -> TopProductsResponse:
    period_clean = period.lower().strip() if period else "month"
    if period_clean not in VALID_PERIODS:
        period_clean = "month"

    date_from, date_to = resolve_date_range(period_clean, date_from_str, date_to_str)
    safe_limit = max(1, min(limit, 50))

    base_query = (
        db.query(
            Entry.product.label("product"),
            func.count(Entry.id).label("entry_count"),
            func.coalesce(func.sum(Entry.quantity), Decimal("0.00")).label("total_quantity"),
            func.coalesce(func.sum(Entry.total_price), Decimal("0.00")).label("total_value"),
        )
        .filter(Entry.is_deleted == False)
        .filter(Entry.created_at >= date_from)
        .filter(Entry.created_at <= date_to)
        .group_by(Entry.product)
    )

    rows_val = base_query.order_by(func.sum(Entry.total_price).desc()).limit(safe_limit).all()
    rows_qty = base_query.order_by(func.sum(Entry.quantity).desc()).limit(safe_limit).all()

    by_value = [
        TopProductItem(
            product=r.product,
            entry_count=int(r.entry_count),
            total_quantity=Decimal(str(r.total_quantity)),
            total_value=Decimal(str(r.total_value)),
        )
        for r in rows_val
    ]

    by_quantity = [
        TopProductItem(
            product=r.product,
            entry_count=int(r.entry_count),
            total_quantity=Decimal(str(r.total_quantity)),
            total_value=Decimal(str(r.total_value)),
        )
        for r in rows_qty
    ]

    return TopProductsResponse(
        period=period_clean,
        date_from=date_from,
        date_to=date_to,
        by_value=by_value,
        by_quantity=by_quantity,
    )


def get_top_destinations(
    db: Session,
    period: str = "month",
    date_from_str: Optional[str] = None,
    date_to_str: Optional[str] = None,
    limit: int = 10,
) -> TopDestinationsResponse:
    period_clean = period.lower().strip() if period else "month"
    if period_clean not in VALID_PERIODS:
        period_clean = "month"

    date_from, date_to = resolve_date_range(period_clean, date_from_str, date_to_str)
    safe_limit = max(1, min(limit, 50))

    base_query = (
        db.query(
            Entry.destination.label("destination"),
            func.count(Entry.id).label("entry_count"),
            func.coalesce(func.sum(Entry.quantity), Decimal("0.00")).label("total_quantity"),
            func.coalesce(func.sum(Entry.total_price), Decimal("0.00")).label("total_value"),
        )
        .filter(Entry.is_deleted == False)
        .filter(Entry.created_at >= date_from)
        .filter(Entry.created_at <= date_to)
        .group_by(Entry.destination)
    )

    rows_val = base_query.order_by(func.sum(Entry.total_price).desc()).limit(safe_limit).all()
    rows_qty = base_query.order_by(func.sum(Entry.quantity).desc()).limit(safe_limit).all()

    by_value = [
        TopDestinationItem(
            destination=r.destination,
            entry_count=int(r.entry_count),
            total_quantity=Decimal(str(r.total_quantity)),
            total_value=Decimal(str(r.total_value)),
        )
        for r in rows_val
    ]

    by_quantity = [
        TopDestinationItem(
            destination=r.destination,
            entry_count=int(r.entry_count),
            total_quantity=Decimal(str(r.total_quantity)),
            total_value=Decimal(str(r.total_value)),
        )
        for r in rows_qty
    ]

    return TopDestinationsResponse(
        period=period_clean,
        date_from=date_from,
        date_to=date_to,
        by_value=by_value,
        by_quantity=by_quantity,
    )
