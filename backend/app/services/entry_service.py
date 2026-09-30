import math
from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple
from sqlalchemy import or_, func
from sqlalchemy.orm import Query, Session

from app.core.vehicle import normalize_vehicle_no, validate_indian_vehicle_format
from app.models.entry import Entry
from app.models.audit_log import AuditLog, AuditAction


def build_entries_filter_query(
    db: Session,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product: Optional[str] = None,
    vehicle_no: Optional[str] = None,
    challan_no: Optional[str] = None,
    destination: Optional[str] = None,
    party_name: Optional[str] = None,
) -> Query:
    """
    Builds the base SQLAlchemy query with filters and search applied.
    Always excludes soft-deleted rows.
    Reused across list, summary, and export endpoints.
    """
    query = db.query(Entry).filter(Entry.is_deleted.is_(False))

    # Free-text multi-column search 'q'
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Entry.challan_no.ilike(term),
                Entry.vehicle_no.ilike(term),
                Entry.product.ilike(term),
                Entry.destination.ilike(term),
                Entry.party_name.ilike(term),
            )
        )

    # Specific field filters
    if product and product.strip():
        query = query.filter(Entry.product.ilike(f"%{product.strip()}%"))

    if destination and destination.strip():
        query = query.filter(Entry.destination.ilike(f"%{destination.strip()}%"))

    if party_name and party_name.strip():
        query = query.filter(Entry.party_name.ilike(f"%{party_name.strip()}%"))

    if vehicle_no and vehicle_no.strip():
        clean_v = normalize_vehicle_no(vehicle_no)
        query = query.filter(Entry.vehicle_no.ilike(f"%{clean_v}%"))

    if challan_no and challan_no.strip():
        query = query.filter(Entry.challan_no.ilike(f"%{challan_no.strip()}%"))

    # Date range filters on created_at
    if date_from and date_from.strip():
        try:
            # Handle YYYY-MM-DD or full ISO strings
            dt_from = datetime.fromisoformat(date_from.strip())
            if dt_from.tzinfo is None:
                dt_from = dt_from.replace(tzinfo=timezone.utc)
            query = query.filter(Entry.created_at >= dt_from)
        except ValueError:
            # Fallback for simple date YYYY-MM-DD
            d = datetime.strptime(date_from.strip()[:10], "%Y-%m-%d")
            dt_from = datetime.combine(d.date(), time.min).replace(tzinfo=timezone.utc)
            query = query.filter(Entry.created_at >= dt_from)

    if date_to and date_to.strip():
        try:
            dt_to = datetime.fromisoformat(date_to.strip())
            if dt_to.tzinfo is None:
                dt_to = dt_to.replace(tzinfo=timezone.utc)
            query = query.filter(Entry.created_at <= dt_to)
        except ValueError:
            d = datetime.strptime(date_to.strip()[:10], "%Y-%m-%d")
            dt_to = datetime.combine(d.date(), time.max).replace(tzinfo=timezone.utc)
            query = query.filter(Entry.created_at <= dt_to)

    return query


def log_entry_audit(
    db: Session,
    user_id: Optional[int],
    action: AuditAction,
    entry_id: Optional[int],
    details: Dict[str, Any],
):
    """Writes an audit log row for entry actions."""
    audit = AuditLog(
        user_id=user_id,
        action=action.value,
        entry_id=entry_id,
        details=details,
    )
    db.add(audit)


def compute_entry_pricing(
    quantity: Decimal,
    unit_price: Decimal,
    gst_type: Optional[str] = "none",
    gst_rate: Optional[Decimal] = None,
) -> Tuple[Decimal, str, Optional[Decimal], Decimal, Decimal]:
    """
    Computes subtotal, gst_amount, and total_price server-side.
    Returns: (subtotal, gst_type, gst_rate, gst_amount, total_price)
    """
    subtotal = (quantity * unit_price).quantize(Decimal("0.01"))
    norm_type = (gst_type or "none").strip().lower()

    if norm_type in ("cgst_sgst", "igst") and gst_rate is not None and gst_rate > Decimal("0"):
        rate = gst_rate.quantize(Decimal("0.01"))
        gst_amount = (subtotal * (rate / Decimal("100"))).quantize(Decimal("0.01"))
        total_price = subtotal + gst_amount
        return subtotal, norm_type, rate, gst_amount, total_price
    else:
        return subtotal, "none", None, Decimal("0.00"), subtotal

