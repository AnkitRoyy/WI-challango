import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.api.deps import get_current_user, require_admin
from app.services.challan_sequence_service import (
    get_wi_starting_challan_no,
    set_wi_starting_challan_no,
)

router = APIRouter(prefix="/settings", tags=["Settings"])
logger = logging.getLogger("challango.settings")


class ChallanSeriesSettingsResponse(BaseModel):
    wi_initial_challan_no: str


class ChallanSeriesSettingsUpdate(BaseModel):
    wi_initial_challan_no: str


@router.get("/challan-series", response_model=ChallanSeriesSettingsResponse)
def get_challan_series_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the configured starting variable for the WI company challan sequence.
    """
    current_val = get_wi_starting_challan_no(db)
    return ChallanSeriesSettingsResponse(wi_initial_challan_no=current_val)


@router.put("/challan-series", response_model=ChallanSeriesSettingsResponse)
def update_challan_series_settings(
    settings_in: ChallanSeriesSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Update the base variable for the WI company challan sequence (admin only).
    """
    new_val = settings_in.wi_initial_challan_no.strip()
    if not new_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WI starting challan number cannot be empty",
        )

    old_val = get_wi_starting_challan_no(db)
    updated_val = set_wi_starting_challan_no(db, new_val, user_id=current_admin.id)

    # Log to audit trail
    audit_entry = AuditLog(
        user_id=current_admin.id,
        action="update",
        entry_id=None,
        details={
            "setting": "wi_initial_challan_no",
            "old_value": old_val,
            "new_value": updated_val,
        },
    )
    db.add(audit_entry)
    db.commit()

    logger.info(f"Admin {current_admin.email} updated WI starting challan no from '{old_val}' to '{updated_val}'")
    return ChallanSeriesSettingsResponse(wi_initial_challan_no=updated_val)


# ─── Company Phone (WhatsApp) ─────────────────────────────────────────────────

COMPANY_PHONE_KEY = "company_phone"
COMPANY_PHONE_DEFAULT = "9034218483"


def _get_company_phone(db: Session) -> str:
    from app.models.setting import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == COMPANY_PHONE_KEY).first()
    return row.value if row else COMPANY_PHONE_DEFAULT


def _set_company_phone(db: Session, value: str, user_id: int) -> str:
    from app.models.setting import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == COMPANY_PHONE_KEY).first()
    if row:
        row.value = value
        row.updated_by = user_id
    else:
        row = AppSetting(key=COMPANY_PHONE_KEY, value=value, description="Company WhatsApp/contact number shown on challans", updated_by=user_id)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row.value


class CompanyPhoneResponse(BaseModel):
    company_phone: str


class CompanyPhoneUpdate(BaseModel):
    company_phone: str


@router.get("/company-phone", response_model=CompanyPhoneResponse)
def get_company_phone(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the company WhatsApp/contact number shown on challans."""
    return CompanyPhoneResponse(company_phone=_get_company_phone(db))


@router.put("/company-phone", response_model=CompanyPhoneResponse)
def update_company_phone(
    payload: CompanyPhoneUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update the company WhatsApp/contact number (admin only)."""
    new_val = payload.company_phone.strip()
    if not new_val:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number cannot be empty")

    old_val = _get_company_phone(db)
    updated_val = _set_company_phone(db, new_val, user_id=current_admin.id)

    audit_entry = AuditLog(
        user_id=current_admin.id,
        action="update",
        entry_id=None,
        details={"setting": COMPANY_PHONE_KEY, "old_value": old_val, "new_value": updated_val},
    )
    db.add(audit_entry)
    db.commit()

    logger.info(f"Admin {current_admin.email} updated company_phone to '{updated_val}'")
    return CompanyPhoneResponse(company_phone=updated_val)
