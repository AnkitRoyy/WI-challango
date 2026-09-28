from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class AnalyticsBucket(BaseModel):
    bucket_label: str
    bucket_date: datetime
    entry_count: int
    total_quantity: Decimal = Field(default=Decimal("0.00"))
    total_value: Decimal = Field(default=Decimal("0.00"))


class AnalyticsSummaryResponse(BaseModel):
    period: str
    date_from: datetime
    date_to: datetime
    total_entries: int
    total_quantity: Decimal
    total_value: Decimal
    buckets: List[AnalyticsBucket]


class TopProductItem(BaseModel):
    product: str
    entry_count: int
    total_quantity: Decimal = Field(default=Decimal("0.00"))
    total_value: Decimal = Field(default=Decimal("0.00"))


class TopProductsResponse(BaseModel):
    period: str
    date_from: datetime
    date_to: datetime
    by_value: List[TopProductItem]
    by_quantity: List[TopProductItem]


class TopDestinationItem(BaseModel):
    destination: str
    entry_count: int
    total_quantity: Decimal = Field(default=Decimal("0.00"))
    total_value: Decimal = Field(default=Decimal("0.00"))


class TopDestinationsResponse(BaseModel):
    period: str
    date_from: datetime
    date_to: datetime
    by_value: List[TopDestinationItem]
    by_quantity: List[TopDestinationItem]
