import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.party import Party
from app.models.user import User
from app.models.audit_log import AuditLog
from app.schemas.party import PartyCreate, PartyUpdate, PartyResponse
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/parties", tags=["Parties"])
logger = logging.getLogger("challango.parties")


@router.post("", response_model=PartyResponse, status_code=status.HTTP_201_CREATED)
def create_party(
    party_in: PartyCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Create a new party (customer/vendor) in the catalog (admin only).
    Accepts trade_name and legal_name separately.
    Rejects duplicate names case-insensitively with 409 Conflict.
    Rejects duplicate GST numbers among active parties with 409 Conflict.
    Logs audit activity so it appears in the admin audit trail.
    """
    clean_trade = party_in.trade_name.strip() if party_in.trade_name else None
    clean_legal = party_in.legal_name.strip() if party_in.legal_name else None
    clean_name = (party_in.name.strip() if party_in.name else None) or clean_trade or clean_legal

    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of Party Name, Trade Name, or Legal Name must be provided.",
        )

    existing_name = (
        db.query(Party)
        .filter(func.lower(Party.name) == clean_name.lower(), Party.is_active.is_(True))
        .first()
    )
    if existing_name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active party named '{existing_name.name}' already exists in the catalog.",
        )

    if party_in.gst_number:
        clean_gst = party_in.gst_number.strip().upper()
        existing_gst = (
            db.query(Party)
            .filter(Party.gst_number == clean_gst, Party.is_active.is_(True))
            .first()
        )
        if existing_gst:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An active party with GSTIN '{clean_gst}' already exists ({existing_gst.name}).",
            )

    if not party_in.initial_challan_no or not party_in.initial_challan_no.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'initial_challan_no' is required",
        )

    clean_initial_challan = party_in.initial_challan_no.strip()

    party = Party(
        name=clean_name,
        trade_name=clean_trade,
        legal_name=clean_legal,
        gst_number=party_in.gst_number.strip().upper() if party_in.gst_number else None,
        address=party_in.address.strip() if party_in.address else None,
        state=party_in.state.strip() if party_in.state else None,
        phone=party_in.phone.strip() if party_in.phone else None,
        initial_challan_no=clean_initial_challan,
        is_active=True,
        created_by=current_admin.id,
        updated_by=current_admin.id,
    )
    db.add(party)
    db.flush()

    # Log to audit trail
    audit_entry = AuditLog(
        user_id=current_admin.id,
        action="create",
        entry_id=None,
        details={
            "entity": "party",
            "party": party.trade_name or party.name,
            "trade_name": party.trade_name,
            "legal_name": party.legal_name,
            "gstin": party.gst_number,
            "phone": party.phone,
            "state": party.state,
            "address": party.address,
        },
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(party)

    logger.info(f"Admin {current_admin.email} created party: {party.name} (GST: {party.gst_number})")
    return party


@router.get("", response_model=List[PartyResponse])
def list_parties(
    search: Optional[str] = Query(None, description="Optional search term to filter party name, GST number, or phone"),
    q: Optional[str] = Query(None, description="Alias for search query"),
    include_inactive: bool = Query(False, description="Whether to include soft-deleted parties (admin view)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List parties sorted alphabetically for entry dropdowns or admin management.
    By default returns only active parties.
    """
    query = db.query(Party)
    if not include_inactive:
        query = query.filter(Party.is_active.is_(True))

    search_val = (search or q or "").strip()
    if search_val:
        term = f"%{search_val}%"
        query = query.filter(
            (Party.name.ilike(term))
            | (Party.trade_name.ilike(term))
            | (Party.legal_name.ilike(term))
            | (Party.gst_number.ilike(term))
            | (Party.phone.ilike(term))
        )

    parties = query.order_by(Party.name.asc()).all()
    return parties


@router.get("/{party_id}", response_model=PartyResponse)
def get_party(
    party_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve party details by ID.
    """
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party not found")
    return party


@router.patch("/{party_id}", response_model=PartyResponse)
def update_party(
    party_id: int,
    party_in: PartyUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Update a party's fields or active status (admin only).
    Logs audit activity so it appears in the admin audit trail.
    """
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party not found")

    if party_in.trade_name is not None:
        party.trade_name = party_in.trade_name.strip() if party_in.trade_name.strip() else None

    if party_in.legal_name is not None:
        party.legal_name = party_in.legal_name.strip() if party_in.legal_name.strip() else None

    if party_in.name is not None and party_in.name.strip().lower() != party.name.lower():
        clean_name = party_in.name.strip()
        existing = (
            db.query(Party)
            .filter(
                Party.id != party.id,
                func.lower(Party.name) == clean_name.lower(),
                Party.is_active.is_(True),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An active party named '{clean_name}' already exists.",
            )
        party.name = clean_name

    if party_in.gst_number is not None:
        clean_gst = party_in.gst_number.strip().upper() if party_in.gst_number.strip() else None
        if clean_gst and clean_gst != party.gst_number:
            existing = (
                db.query(Party)
                .filter(
                    Party.id != party.id,
                    Party.gst_number == clean_gst,
                    Party.is_active.is_(True),
                )
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"An active party with GSTIN '{clean_gst}' already exists.",
                )
        party.gst_number = clean_gst

    if party_in.address is not None:
        party.address = party_in.address.strip() if party_in.address.strip() else None

    if party_in.state is not None:
        party.state = party_in.state.strip() if party_in.state.strip() else None

    if party_in.phone is not None:
        party.phone = party_in.phone.strip() if party_in.phone.strip() else None

    if party_in.initial_challan_no is not None:
        clean_init = party_in.initial_challan_no.strip()
        if not clean_init:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Field 'initial_challan_no' cannot be empty.",
            )
        party.initial_challan_no = clean_init

    if party_in.is_active is not None:
        party.is_active = party_in.is_active

    party.updated_by = current_admin.id

    # Log to audit trail
    audit_entry = AuditLog(
        user_id=current_admin.id,
        action="update",
        entry_id=None,
        details={
            "entity": "party",
            "party": party.trade_name or party.name,
            "trade_name": party.trade_name,
            "legal_name": party.legal_name,
            "gstin": party.gst_number,
            "phone": party.phone,
            "state": party.state,
            "address": party.address,
            "is_active": party.is_active,
        },
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(party)

    logger.info(f"Admin {current_admin.email} updated party {party.id} ({party.name})")
    return party


@router.delete("/{party_id}", status_code=status.HTTP_200_OK)
def delete_party(
    party_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Soft-delete a party (admin only).
    Sets is_active = False, never physically deletes the row.
    Historical entries remain untouched.
    Logs audit activity so it appears in the admin audit trail.
    """
    party = db.query(Party).filter(Party.id == party_id, Party.is_active.is_(True)).first()
    if not party:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party not found")

    party.is_active = False
    party.updated_by = current_admin.id

    # Log to audit trail
    audit_entry = AuditLog(
        user_id=current_admin.id,
        action="delete",
        entry_id=None,
        details={
            "entity": "party",
            "party": party.trade_name or party.name,
            "trade_name": party.trade_name,
            "legal_name": party.legal_name,
            "gstin": party.gst_number,
            "note": "Party removed from catalog",
        },
    )
    db.add(audit_entry)
    db.commit()

    logger.info(f"Admin {current_admin.email} soft-deleted party {party.id} ({party.name})")
    return {"detail": "Party soft-deleted successfully", "id": party_id}
