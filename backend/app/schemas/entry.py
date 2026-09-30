from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class EntryBase(BaseModel):
    challan_no: str
    challan_series: str = "own"
    vehicle_no: str
    product: str
    destination: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    party_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    gst_type: str = "none"
    gst_rate: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None  # Recomputed on server
    gst_amount: Optional[Decimal] = None  # Recomputed on server
    total_price: Optional[Decimal] = None  # Recomputed on server


class EntryCreate(BaseModel):
    challan_no: str
    challan_series: str = "own"
    vehicle_no: str
    product: str
    destination: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    party_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    gst_type: str = "none"
    gst_rate: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None
    gst_amount: Optional[Decimal] = None
    total_price: Optional[Decimal] = None

    @field_validator("quantity")
    @classmethod
    def validate_quantity_field(cls, v: Decimal) -> Decimal:
        if v <= Decimal("0"):
            raise ValueError("Field 'quantity' must be greater than 0")
        return v

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price_field(cls, v: Decimal) -> Decimal:
        if v < Decimal("0"):
            raise ValueError("Field 'unit_price' must be greater than or equal to 0")
        return v

    @field_validator("gst_type")
    @classmethod
    def validate_gst_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("none", "cgst_sgst", "igst"):
            raise ValueError("Field 'gst_type' must be one of: 'none', 'cgst_sgst', 'igst'")
        return clean

    @field_validator("gst_rate")
    @classmethod
    def validate_gst_rate(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and (v < Decimal("0") or v > Decimal("100")):
            raise ValueError("Field 'gst_rate' must be between 0 and 100")
        return v

    @field_validator("challan_no", "vehicle_no", "product", "destination")
    @classmethod
    def validate_non_empty_strings(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise ValueError(f"Field '{info.field_name}' is required and cannot be blank")
        return v.strip()

    @field_validator("party_name")
    @classmethod
    def validate_party_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None


class EntryUpdate(BaseModel):
    challan_no: Optional[str] = None
    challan_series: Optional[str] = None
    vehicle_no: Optional[str] = None
    product: Optional[str] = None
    destination: Optional[str] = None
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    party_name: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    gst_type: Optional[str] = None
    gst_rate: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None
    gst_amount: Optional[Decimal] = None
    total_price: Optional[Decimal] = None

    @field_validator("quantity")
    @classmethod
    def validate_quantity_update(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= Decimal("0"):
            raise ValueError("Field 'quantity' must be greater than 0")
        return v

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price_update(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < Decimal("0"):
            raise ValueError("Field 'unit_price' must be greater than or equal to 0")
        return v

    @field_validator("gst_type")
    @classmethod
    def validate_gst_type_update(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip().lower()
            if clean not in ("none", "cgst_sgst", "igst"):
                raise ValueError("Field 'gst_type' must be one of: 'none', 'cgst_sgst', 'igst'")
            return clean
        return v

    @field_validator("gst_rate")
    @classmethod
    def validate_gst_rate_update(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and (v < Decimal("0") or v > Decimal("100")):
            raise ValueError("Field 'gst_rate' must be between 0 and 100")
        return v

    @field_validator("challan_no", "vehicle_no", "product", "destination")
    @classmethod
    def validate_optional_strings(cls, v: Optional[str], info) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError(f"Field '{info.field_name}' cannot be empty")
        return v.strip() if v is not None else None

    @field_validator("party_name")
    @classmethod
    def validate_party_name_update(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None


class EntryResponse(BaseModel):
    id: int
    challan_no: str
    challan_series: str = "own"
    vehicle_no: str
    product: str
    destination: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    party_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    gst_type: str = "none"
    gst_rate: Optional[Decimal] = None
    subtotal: Decimal
    gst_amount: Decimal
    total_price: Decimal
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    warning: Optional[str] = None

    class Config:
        from_attributes = True


class EntryListResponse(BaseModel):
    items: List[EntryResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int


class EntrySummaryResponse(BaseModel):
    count: int
    sum_total_price: Decimal
    sum_quantity: Decimal
