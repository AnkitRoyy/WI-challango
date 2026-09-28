import math
from datetime import date, datetime, time, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogItemResponse, AuditLogListResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action (create, update, delete, import, export)"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Retrieve server audit logs with optional action, user, and date range filters (admin only).
    """
    query = db.query(AuditLog).options(joinedload(AuditLog.user))

    if action:
        query = query.filter(AuditLog.action == action.lower().strip())
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        start_dt = datetime.combine(date_from, time.min).replace(tzinfo=timezone.utc)
        query = query.filter(AuditLog.created_at >= start_dt)
    if date_to:
        end_dt = datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)
        query = query.filter(AuditLog.created_at <= end_dt)

    total_count = query.count()
    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1
    offset = (page - 1) * page_size

    logs = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(page_size).all()

    items = []
    for log in logs:
        items.append(
            AuditLogItemResponse(
                id=log.id,
                user_id=log.user_id,
                user_name=log.user.name if log.user else (log.details.get("user_email") if isinstance(log.details, dict) else "System"),
                user_email=log.user.email if log.user else (log.details.get("user_email") if isinstance(log.details, dict) else None),
                action=log.action,
                entry_id=log.entry_id,
                details=log.details or {},
                created_at=log.created_at,
            )
        )

    return AuditLogListResponse(
        items=items,
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
