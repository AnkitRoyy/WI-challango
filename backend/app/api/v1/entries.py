import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.vehicle import normalize_vehicle_no, validate_indian_vehicle_format
from app.models.user import User
from app.models.entry import Entry
from app.models.audit_log import AuditAction
from app.schemas.entry import (
    EntryCreate,
    EntryUpdate,
    EntryResponse,
    EntryListResponse,
    EntrySummaryResponse,
)
from app.api.deps import get_current_user, require_admin
from app.services.entry_service import build_entries_filter_query, log_entry_audit, compute_entry_pricing
from app.services.challan_sequence_service import get_next_challan_no
from app.services.export_service import generate_xlsx_export, generate_csv_export
from app.schemas.import_schema import (
    ImportPreviewResponse,
    ImportCommitRequest,
    ImportCommitResponse,
)
from app.services.import_service import (
    generate_import_template,
    generate_import_csv_template,
    parse_and_preview_import,
    commit_import,
)

router = APIRouter(prefix="/entries", tags=["Entries"])


def _to_entry_response(entry: Entry, warning: Optional[str] = None) -> EntryResponse:
    """Helper to convert Entry model into EntryResponse with vehicle warning check."""
    if warning is None:
        _, warning = validate_indian_vehicle_format(entry.vehicle_no)
    resp = EntryResponse.model_validate(entry)
    resp.warning = warning
    return resp


@router.post("", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
def create_entry(
    entry_in: EntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new challan delivery entry.
    - Recomputes subtotal, gst_amount, and total_price server-side.
    - Normalizes vehicle number (uppercase, strips spaces and hyphens).
    - Returns warning if vehicle number format is unusual (does not reject).
    - Enforces uniqueness on (challan_no, product) among active entries (409 Conflict).
    - Records audit log.
    """
    # Explicit validation safeguards for exact field naming
    if entry_in.quantity <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'quantity' must be greater than 0",
        )
    if entry_in.unit_price < Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'unit_price' must be greater than or equal to 0",
        )

    challan_no = entry_in.challan_no.strip()
    product = entry_in.product.strip()

    # Normalize vehicle number
    normalized_vehicle = normalize_vehicle_no(entry_in.vehicle_no)
    _, vehicle_warning = validate_indian_vehicle_format(normalized_vehicle)

    # Check active duplicate collision on (challan_no, product)
    existing = (
        db.query(Entry)
        .filter(
            Entry.challan_no == challan_no,
            Entry.product == product,
            Entry.is_deleted.is_(False),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active entry with Challan No '{challan_no}' and Product '{product}' already exists",
        )

    # Server-side calculation of subtotal, gst_amount, and total_price
    subtotal, gst_type, gst_rate, gst_amount, server_total_price = compute_entry_pricing(
        quantity=entry_in.quantity,
        unit_price=entry_in.unit_price,
        gst_type=entry_in.gst_type,
        gst_rate=entry_in.gst_rate,
    )

    now = datetime.now(timezone.utc)
    new_entry = Entry(
        challan_no=challan_no,
        vehicle_no=normalized_vehicle,
        product=product,
        destination=entry_in.destination.strip(),
        destination_lat=entry_in.destination_lat,
        destination_lng=entry_in.destination_lng,
        party_name=entry_in.party_name.strip() if entry_in.party_name else None,
        challan_series=(entry_in.challan_series.strip().lower() if entry_in.challan_series else "own"),
        quantity=entry_in.quantity,
        unit_price=entry_in.unit_price,
        gst_type=gst_type,
        gst_rate=gst_rate,
        subtotal=subtotal,
        gst_amount=gst_amount,
        total_price=server_total_price,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
        updated_by=current_user.id,
        is_deleted=False,
    )

    try:
        db.add(new_entry)
        db.flush()

        # Audit log
        log_entry_audit(
            db=db,
            user_id=current_user.id,
            action=AuditAction.CREATE,
            entry_id=new_entry.id,
            details={
                "challan_no": new_entry.challan_no,
                "challan_series": new_entry.challan_series,
                "vehicle_no": new_entry.vehicle_no,
                "product": new_entry.product,
                "destination": new_entry.destination,
                "party_name": new_entry.party_name,
                "quantity": str(new_entry.quantity),
                "unit_price": str(new_entry.unit_price),
                "gst_type": new_entry.gst_type,
                "gst_rate": str(new_entry.gst_rate) if new_entry.gst_rate is not None else None,
                "subtotal": str(new_entry.subtotal),
                "gst_amount": str(new_entry.gst_amount),
                "total_price": str(new_entry.total_price),
            },
        )
        db.commit()
        db.refresh(new_entry)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active entry with Challan No '{challan_no}' and Product '{product}' already exists",
        )

    return _to_entry_response(new_entry, vehicle_warning)


@router.get("/next-challan-no")
def get_next_challan_number(
    series_type: str = Query("own", description="'own' or 'party'"),
    party_id: Optional[int] = Query(None, description="Party ID if series_type is party"),
    party_name: Optional[str] = Query(None, description="Party name if party_id is not available"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the next auto-incremented challan number for either 'own' (WI series)
    or 'party' (Buyer Company Ledger series).
    """
    next_no, source = get_next_challan_no(
        db=db,
        series_type=series_type,
        party_id=party_id,
        party_name=party_name,
    )
    return {
        "series_type": series_type,
        "next_challan_no": next_no,
        "source": source,
    }


@router.get("/vehicle-suggestions", response_model=List[str])
def get_vehicle_suggestions(
    q: Optional[str] = Query(None, description="Search term for vehicle number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns distinct vehicle_no values from past non-deleted entries where vehicle_no
    matches the typed text (case-insensitive partial match), most-recently-used first, limit 10.
    """
    query = (
        db.query(Entry.vehicle_no)
        .filter(Entry.is_deleted.is_(False))
    )
    if q and q.strip():
        clean_q = q.strip()
        query = query.filter(Entry.vehicle_no.ilike(f"%{clean_q}%"))

    results = (
        query.group_by(Entry.vehicle_no)
        .order_by(func.max(Entry.created_at).desc())
        .limit(10)
        .all()
    )
    return [r[0] for r in results]


@router.get("/summary", response_model=EntrySummaryResponse)
def get_entries_summary(
    q: Optional[str] = Query(None, description="Multi-column search query"),
    date_from: Optional[str] = Query(None, description="Filter created_at from date (YYYY-MM-DD or ISO)"),
    date_to: Optional[str] = Query(None, description="Filter created_at to date (YYYY-MM-DD or ISO)"),
    product: Optional[str] = Query(None, description="Filter by product name"),
    destination: Optional[str] = Query(None, description="Filter by destination"),
    vehicle_no: Optional[str] = Query(None, description="Filter by vehicle registration number"),
    challan_no: Optional[str] = Query(None, description="Filter by challan number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get aggregated count and sums for the current search and filter criteria.
    Powers the UI summary bar using the exact same filters as the list endpoint.
    """
    query = build_entries_filter_query(
        db=db,
        q=q,
        date_from=date_from,
        date_to=date_to,
        product=product,
        destination=destination,
        vehicle_no=vehicle_no,
        challan_no=challan_no,
    )

    count, sum_price, sum_qty = (
        query.with_entities(
            func.count(Entry.id),
            func.coalesce(func.sum(Entry.total_price), 0),
            func.coalesce(func.sum(Entry.quantity), 0),
        ).one()
    )

    return EntrySummaryResponse(
        count=count,
        sum_total_price=Decimal(str(sum_price)).quantize(Decimal("0.01")),
        sum_quantity=Decimal(str(sum_qty)).quantize(Decimal("0.01")),
    )


@router.get("", response_model=EntryListResponse)
def list_entries(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=200, description="Items per page"),
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_dir: str = Query("desc", description="Sort direction (asc or desc)"),
    q: Optional[str] = Query(None, description="Search across challan_no, vehicle_no, product, destination"),
    date_from: Optional[str] = Query(None, description="Filter created_at from date"),
    date_to: Optional[str] = Query(None, description="Filter created_at to date"),
    product: Optional[str] = Query(None, description="Filter by product name"),
    destination: Optional[str] = Query(None, description="Filter by destination"),
    vehicle_no: Optional[str] = Query(None, description="Filter by vehicle registration number"),
    challan_no: Optional[str] = Query(None, description="Filter by challan number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve paginated list of challan entries with search, filters, and sorting.
    Excludes soft-deleted entries.
    """
    query = build_entries_filter_query(
        db=db,
        q=q,
        date_from=date_from,
        date_to=date_to,
        product=product,
        destination=destination,
        vehicle_no=vehicle_no,
        challan_no=challan_no,
    )

    total_count = query.count()

    # Sort validation and application
    allowed_sort_fields = {
        "created_at": Entry.created_at,
        "challan_no": Entry.challan_no,
        "vehicle_no": Entry.vehicle_no,
        "product": Entry.product,
        "destination": Entry.destination,
        "total_price": Entry.total_price,
        "quantity": Entry.quantity,
        "unit_price": Entry.unit_price,
    }
    sort_col = allowed_sort_fields.get(sort_by, Entry.created_at)
    order_clause = sort_col.asc() if sort_dir.lower() == "asc" else sort_col.desc()
    query = query.order_by(order_clause)

    offset = (page - 1) * page_size
    entries = query.offset(offset).limit(page_size).all()
    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 0

    items = [_to_entry_response(e) for e in entries]

    return EntryListResponse(
        items=items,
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export")
def export_entries(
    format: str = Query("xlsx", description="Export format: 'xlsx' or 'csv'"),
    q: Optional[str] = Query(None, description="Search across challan_no, vehicle_no, product, destination"),
    date_from: Optional[str] = Query(None, description="Filter created_at from date"),
    date_to: Optional[str] = Query(None, description="Filter created_at to date"),
    product: Optional[str] = Query(None, description="Filter by product name"),
    destination: Optional[str] = Query(None, description="Filter by destination"),
    vehicle_no: Optional[str] = Query(None, description="Filter by vehicle registration number"),
    challan_no: Optional[str] = Query(None, description="Filter by challan number"),
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_dir: str = Query("desc", description="Sort direction (asc or desc)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export matching entries to formatted Excel (.xlsx) or CSV (.csv).
    Applies the same search and filters as the list endpoint without pagination.
    Guards against formula injection and streams file download.
    """
    export_format = format.lower().strip()
    if export_format not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid export format '{format}'. Supported formats are 'xlsx' and 'csv'",
        )

    # Reuse the exact same filter building query
    query = build_entries_filter_query(
        db=db,
        q=q,
        date_from=date_from,
        date_to=date_to,
        product=product,
        destination=destination,
        vehicle_no=vehicle_no,
        challan_no=challan_no,
    )

    # Apply sorting
    allowed_sort_fields = {
        "created_at": Entry.created_at,
        "challan_no": Entry.challan_no,
        "vehicle_no": Entry.vehicle_no,
        "product": Entry.product,
        "destination": Entry.destination,
        "total_price": Entry.total_price,
        "quantity": Entry.quantity,
        "unit_price": Entry.unit_price,
    }
    sort_col = allowed_sort_fields.get(sort_by, Entry.created_at)
    order_clause = sort_col.asc() if sort_dir.lower() == "asc" else sort_col.desc()
    entries = query.order_by(order_clause).all()

    # Log export action in audit_log
    log_entry_audit(
        db=db,
        user_id=current_user.id,
        action=AuditAction.EXPORT,
        entry_id=None,
        details={
            "format": export_format,
            "filters": {
                "q": q,
                "date_from": date_from,
                "date_to": date_to,
                "product": product,
                "destination": destination,
                "vehicle_no": vehicle_no,
                "challan_no": challan_no,
                "sort_by": sort_by,
                "sort_dir": sort_dir,
            },
        },
    )
    db.commit()

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"entries_export_{today_str}.{export_format}"

    if export_format == "xlsx":
        stream = generate_xlsx_export(entries)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        stream = generate_csv_export(entries)
        media_type = "text/csv; charset=utf-8"

    return StreamingResponse(
        stream,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/import/template")
def download_import_template(
    format: str = Query("xlsx", description="Template format: xlsx or csv"),
    current_user: User = Depends(get_current_user),
):
    """
    Download a blank CSV template (.csv) or Excel template (.xlsx) with exact column headers
    and an example row including Party and GST fields.
    """
    if format.lower() == "xlsx":
        stream = generate_import_template()
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": 'attachment; filename="challan_import_template.xlsx"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    else:
        stream = generate_import_csv_template()
        return StreamingResponse(
            stream,
            media_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="challan_import_template.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_entries_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and validate an Excel or CSV file.
    Performs full per-row validation, vehicle normalization, duplicate checks,
    and returns a preview with error/warning counts.
    Saves NOTHING to the database at this step.
    """
    filename = file.filename or "uploaded_file.xlsx"
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    if ext not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only .xlsx and .csv files are supported",
        )

    # 10 MB size limit
    MAX_SIZE = 10 * 1024 * 1024
    file_bytes = await file.read(MAX_SIZE + 1)
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum allowed limit of 10 MB",
        )

    return parse_and_preview_import(
        file_bytes=file_bytes,
        filename=filename,
        db=db,
        user_id=current_user.id,
    )


@router.post("/import/commit", response_model=ImportCommitResponse)
def commit_entries_import(
    request: ImportCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Commit a previously validated import preview into the database.
    Applies the chosen duplicate strategy ('skip' or 'update') in a single atomic transaction.
    """
    return commit_import(
        preview_id=request.preview_id,
        duplicate_strategy=request.duplicate_strategy,
        db=db,
        user_id=current_user.id,
    )


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a single entry by ID.
    Returns 404 if entry does not exist or has been soft-deleted.
    """
    entry = db.query(Entry).filter(Entry.id == entry_id, Entry.is_deleted.is_(False)).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )
    return _to_entry_response(entry)


@router.patch("/{entry_id}", response_model=EntryResponse)
def update_entry(
    entry_id: int,
    entry_in: EntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Partially update an entry.
    - Recomputes total_price if quantity or unit_price changes.
    - Re-validates unique constraint if challan_no or product changes.
    - Logs changed fields (old vs new values) in audit_log.
    """
    entry = db.query(Entry).filter(Entry.id == entry_id, Entry.is_deleted.is_(False)).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )

    # Check field validations if provided
    if entry_in.quantity is not None and entry_in.quantity <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'quantity' must be greater than 0",
        )
    if entry_in.unit_price is not None and entry_in.unit_price < Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'unit_price' must be greater than or equal to 0",
        )

    # Determine new candidate values
    new_challan_no = entry_in.challan_no.strip() if entry_in.challan_no is not None else entry.challan_no
    new_product = entry_in.product.strip() if entry_in.product is not None else entry.product

    # Check collision if challan_no or product changed
    if new_challan_no != entry.challan_no or new_product != entry.product:
        collision = (
            db.query(Entry)
            .filter(
                Entry.id != entry.id,
                Entry.challan_no == new_challan_no,
                Entry.product == new_product,
                Entry.is_deleted.is_(False),
            )
            .first()
        )
        if collision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An active entry with Challan No '{new_challan_no}' and Product '{new_product}' already exists",
            )

    changed_fields = {}

    if entry_in.challan_no is not None and entry.challan_no != new_challan_no:
        changed_fields["challan_no"] = {"old": entry.challan_no, "new": new_challan_no}
        entry.challan_no = new_challan_no

    if entry_in.vehicle_no is not None:
        norm_v = normalize_vehicle_no(entry_in.vehicle_no)
        if entry.vehicle_no != norm_v:
            changed_fields["vehicle_no"] = {"old": entry.vehicle_no, "new": norm_v}
            entry.vehicle_no = norm_v

    if entry_in.product is not None and entry.product != new_product:
        changed_fields["product"] = {"old": entry.product, "new": new_product}
        entry.product = new_product

    if entry_in.destination is not None and entry.destination != entry_in.destination.strip():
        new_dest = entry_in.destination.strip()
        changed_fields["destination"] = {"old": entry.destination, "new": new_dest}
        entry.destination = new_dest

    if entry_in.destination_lat is not None:
        entry.destination_lat = entry_in.destination_lat

    if entry_in.destination_lng is not None:
        entry.destination_lng = entry_in.destination_lng

    if entry_in.party_name is not None:
        new_party = entry_in.party_name.strip() if entry_in.party_name else None
        if entry.party_name != new_party:
            changed_fields["party_name"] = {"old": entry.party_name, "new": new_party}
            entry.party_name = new_party

    if entry_in.challan_series is not None:
        new_series = entry_in.challan_series.strip().lower()
        if entry.challan_series != new_series:
            changed_fields["challan_series"] = {"old": entry.challan_series, "new": new_series}
            entry.challan_series = new_series

    # Recalculate price and GST if quantity, unit_price, gst_type, or gst_rate changed
    new_qty = entry_in.quantity if entry_in.quantity is not None else entry.quantity
    new_unit_p = entry_in.unit_price if entry_in.unit_price is not None else entry.unit_price
    new_gst_type = entry_in.gst_type if entry_in.gst_type is not None else entry.gst_type
    new_gst_rate = entry_in.gst_rate if entry_in.gst_rate is not None else entry.gst_rate

    pricing_changed = (
        (entry_in.quantity is not None and entry.quantity != new_qty)
        or (entry_in.unit_price is not None and entry.unit_price != new_unit_p)
        or (entry_in.gst_type is not None and entry.gst_type != new_gst_type)
        or (entry_in.gst_rate is not None and entry.gst_rate != new_gst_rate)
    )

    if pricing_changed:
        subtotal, eff_gst_type, eff_gst_rate, gst_amount, total_price = compute_entry_pricing(
            quantity=new_qty,
            unit_price=new_unit_p,
            gst_type=new_gst_type,
            gst_rate=new_gst_rate,
        )
        if entry.quantity != new_qty:
            changed_fields["quantity"] = {"old": str(entry.quantity), "new": str(new_qty)}
            entry.quantity = new_qty
        if entry.unit_price != new_unit_p:
            changed_fields["unit_price"] = {"old": str(entry.unit_price), "new": str(new_unit_p)}
            entry.unit_price = new_unit_p
        if entry.gst_type != eff_gst_type:
            changed_fields["gst_type"] = {"old": entry.gst_type, "new": eff_gst_type}
            entry.gst_type = eff_gst_type
        if entry.gst_rate != eff_gst_rate:
            changed_fields["gst_rate"] = {
                "old": str(entry.gst_rate) if entry.gst_rate is not None else None,
                "new": str(eff_gst_rate) if eff_gst_rate is not None else None,
            }
            entry.gst_rate = eff_gst_rate
        if entry.subtotal != subtotal:
            changed_fields["subtotal"] = {"old": str(entry.subtotal), "new": str(subtotal)}
            entry.subtotal = subtotal
        if entry.gst_amount != gst_amount:
            changed_fields["gst_amount"] = {"old": str(entry.gst_amount), "new": str(gst_amount)}
            entry.gst_amount = gst_amount
        if entry.total_price != total_price:
            changed_fields["total_price"] = {"old": str(entry.total_price), "new": str(total_price)}
            entry.total_price = total_price

    entry.updated_by = current_user.id
    entry.updated_at = datetime.now(timezone.utc)

    if changed_fields:
        log_entry_audit(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            entry_id=entry.id,
            details={"changed_fields": changed_fields},
        )

    try:
        db.commit()
        db.refresh(entry)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active entry with Challan No '{new_challan_no}' and Product '{new_product}' already exists",
        )

    _, warning = validate_indian_vehicle_format(entry.vehicle_no)
    return _to_entry_response(entry, warning)


@router.delete("/{entry_id}", status_code=status.HTTP_200_OK)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Soft-delete an entry (Admin only).
    Sets is_deleted = True, never physically removes the database row.
    """
    entry = db.query(Entry).filter(Entry.id == entry_id, Entry.is_deleted.is_(False)).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )

    entry.is_deleted = True
    entry.updated_by = current_admin.id
    entry.updated_at = datetime.now(timezone.utc)

    log_entry_audit(
        db=db,
        user_id=current_admin.id,
        action=AuditAction.DELETE,
        entry_id=entry.id,
        details={
            "challan_no": entry.challan_no,
            "product": entry.product,
            "message": "Soft deleted entry",
        },
    )

    db.commit()
    return {"detail": "Entry successfully deleted", "id": entry_id}


from pydantic import BaseModel as _BaseModel


class ShareChallanRequest(_BaseModel):
    channel: str  # e.g. "whatsapp_buyer", "whatsapp_company", "pdf_share"
    recipient_phone: Optional[str] = None


@router.post("/{entry_id}/share", status_code=status.HTTP_200_OK)
def record_challan_share(
    entry_id: int,
    payload: ShareChallanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record a challan-sharing event in the audit trail.
    Called by the frontend whenever a user shares a challan via WhatsApp or PDF.
    Does not send anything — only persists the audit record.
    """
    entry = db.query(Entry).filter(Entry.id == entry_id, Entry.is_deleted.is_(False)).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    log_entry_audit(
        db=db,
        user_id=current_user.id,
        action=AuditAction.SHARE,
        entry_id=entry.id,
        details={
            "challan_no": entry.challan_no,
            "party_name": entry.party_name,
            "channel": payload.channel,
            "recipient_phone": payload.recipient_phone,
        },
    )
    db.commit()
    return {"detail": "Share event recorded", "entry_id": entry_id, "channel": payload.channel}
