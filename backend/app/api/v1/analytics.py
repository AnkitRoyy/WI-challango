import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsSummaryResponse,
    TopProductsResponse,
    TopDestinationsResponse,
)
from app.services.analytics_service import (
    get_analytics_summary,
    get_top_products,
    get_top_destinations,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])
logger = logging.getLogger("challango.analytics")


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def analytics_summary_endpoint(
    period: str = Query("month", description="Grouping period: day, week, month, year"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO-8601)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO-8601)"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Get aggregated analytics summary bucketed by day, week, month, or year.
    Admin access only. Excludes soft-deleted entries.
    """
    return get_analytics_summary(
        db=db,
        period=period,
        date_from_str=date_from,
        date_to_str=date_to,
    )


@router.get("/top-products", response_model=TopProductsResponse)
def top_products_endpoint(
    period: str = Query("month", description="Period for date range calculation if dates omitted"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO-8601)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO-8601)"),
    limit: int = Query(10, ge=1, le=50, description="Max items to return"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Get top products ranked separately by total_value and total_quantity.
    Admin access only. Excludes soft-deleted entries.
    """
    return get_top_products(
        db=db,
        period=period,
        date_from_str=date_from,
        date_to_str=date_to,
        limit=limit,
    )


@router.get("/top-destinations", response_model=TopDestinationsResponse)
def top_destinations_endpoint(
    period: str = Query("month", description="Period for date range calculation if dates omitted"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO-8601)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO-8601)"),
    limit: int = Query(10, ge=1, le=50, description="Max items to return"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Get top destinations ranked separately by total_value and total_quantity.
    Admin access only. Excludes soft-deleted entries.
    """
    return get_top_destinations(
        db=db,
        period=period,
        date_from_str=date_from,
        date_to_str=date_to,
        limit=limit,
    )
