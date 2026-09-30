from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


class PartyBase(BaseModel):
    name: str
    trade_name: Optional[str] = None
    legal_name: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    initial_challan_no: Optional[str] = None


class PartyCreate(BaseModel):
    name: Optional[str] = None
    trade_name: Optional[str] = None
    legal_name: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    initial_challan_no: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None

    @field_validator("trade_name")
    @classmethod
    def validate_trade_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None

    @field_validator("legal_name")
    @classmethod
    def validate_legal_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None

    @field_validator("gst_number")
    @classmethod
    def validate_gst_number(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        clean = v.strip().upper()
        return clean if clean else None

    @field_validator("initial_challan_no")
    @classmethod
    def validate_initial_challan_no(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return None


class PartyUpdate(BaseModel):
    name: Optional[str] = None
    trade_name: Optional[str] = None
    legal_name: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    initial_challan_no: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return v

    @field_validator("trade_name")
    @classmethod
    def validate_trade_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return v

    @field_validator("legal_name")
    @classmethod
    def validate_legal_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return v

    @field_validator("gst_number")
    @classmethod
    def validate_gst_number(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip().upper()
            return clean if clean else None
        return v

    @field_validator("initial_challan_no")
    @classmethod
    def validate_initial_challan_no(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            return clean if clean else None
        return v


class PartyResponse(PartyBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
