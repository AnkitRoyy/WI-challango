import re
from datetime import datetime, timezone
from typing import Optional, Tuple
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.party import Party
from app.models.setting import AppSetting


def increment_challan_no(val: str) -> str:
    """
    Increments a challan number string while preserving prefix and zero-padding.
    Examples:
      - 'WI-001' -> 'WI-002'
      - 'WI-099' -> 'WI-100'
      - 'ABC/24/005' -> 'ABC/24/006'
      - '1' -> '2'
      - '101' -> '102'
      - 'WI' -> 'WI-001'
    """
    clean = val.strip()
    if not clean:
        return "WI-001"

    match = re.match(r"^(.*?)(\d+)$", clean)
    if match:
        prefix, digits = match.groups()
        new_num = int(digits) + 1
        return f"{prefix}{new_num:0{len(digits)}d}"

    if clean.endswith("-") or clean.endswith("/"):
        return f"{clean}001"
    return f"{clean}-001"


def get_wi_starting_challan_no(db: Session) -> str:
    """Returns the configured starting challan number for WI company series."""
    setting = db.query(AppSetting).filter(AppSetting.key == "wi_initial_challan_no").first()
    if setting and setting.value and setting.value.strip():
        return setting.value.strip()
    return "WI-001"


def set_wi_starting_challan_no(db: Session, new_val: str, user_id: Optional[int] = None) -> str:
    """Sets the starting challan number for WI company series."""
    clean = new_val.strip()
    if not clean:
        clean = "WI-001"
    now = datetime.now(timezone.utc)
    setting = db.query(AppSetting).filter(AppSetting.key == "wi_initial_challan_no").first()
    if not setting:
        setting = AppSetting(
            key="wi_initial_challan_no",
            value=clean,
            description="Starting challan number for WI company series",
            updated_by=user_id,
            updated_at=now,
        )
        db.add(setting)
    else:
        setting.value = clean
        setting.updated_by = user_id
        setting.updated_at = now
    db.commit()
    return setting.value


def get_next_challan_no(
    db: Session,
    series_type: str = "own",
    party_id: Optional[int] = None,
    party_name: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Calculates the next suggested challan number for either Our Own (WI) series
    or a specific Party ledger series.
    Returns: (next_challan_no, source_reason)
    """
    normalized_series = series_type.strip().lower() if series_type else "own"

    if normalized_series == "party":
        party = None
        if party_id:
            party = db.query(Party).filter(Party.id == party_id).first()
        elif party_name and party_name.strip():
            party = (
                db.query(Party)
                .filter(
                    (func.lower(Party.name) == party_name.strip().lower())
                    | (func.lower(Party.trade_name) == party_name.strip().lower())
                )
                .first()
            )

        if party:
            names = [party.name]
            if party.trade_name and party.trade_name != party.name:
                names.append(party.trade_name)

            p_start = party.initial_challan_no.strip() if party.initial_challan_no and party.initial_challan_no.strip() else None

            # 1. Check if any entries were created for this party after the party was updated
            query = db.query(Entry).filter(
                Entry.is_deleted.is_(False),
                Entry.challan_series == "party",
                Entry.party_name.in_(names),
            )
            if party.updated_at:
                query = query.filter(Entry.created_at >= party.updated_at)

            latest_entry = query.order_by(Entry.created_at.desc(), Entry.id.desc()).first()
            if latest_entry and latest_entry.challan_no:
                return increment_challan_no(latest_entry.challan_no), "party_incremental"

            if p_start:
                # Check if p_start has been used
                existing_initial = (
                    db.query(Entry)
                    .filter(
                        Entry.is_deleted.is_(False),
                        Entry.challan_series == "party",
                        Entry.party_name.in_(names),
                        Entry.challan_no == p_start,
                    )
                    .first()
                )
                if not existing_initial:
                    return p_start, "party_initial"

                any_latest = (
                    db.query(Entry)
                    .filter(
                        Entry.is_deleted.is_(False),
                        Entry.challan_series == "party",
                        Entry.party_name.in_(names),
                    )
                    .order_by(Entry.created_at.desc(), Entry.id.desc())
                    .first()
                )
                if any_latest and any_latest.challan_no:
                    return increment_challan_no(any_latest.challan_no), "party_incremental"
                return p_start, "party_initial"

            # Default party series prefix if none provided
            party_code = re.sub(r"[^A-Z0-9]", "", (party.trade_name or party.name).upper())[:4]
            default_p = f"{party_code}-001" if party_code else "WI-001"
            any_latest = (
                db.query(Entry)
                .filter(
                    Entry.is_deleted.is_(False),
                    Entry.challan_series == "party",
                    Entry.party_name.in_(names),
                )
                .order_by(Entry.created_at.desc(), Entry.id.desc())
                .first()
            )
            if any_latest and any_latest.challan_no:
                return increment_challan_no(any_latest.challan_no), "party_incremental"
            return default_p, "party_default"

    # Default: Our Own (WI) series
    setting = db.query(AppSetting).filter(AppSetting.key == "wi_initial_challan_no").first()
    wi_start = setting.value.strip() if (setting and setting.value and setting.value.strip()) else "WI-001"

    # Match prefix/digits pattern of wi_start
    prefix_match = re.match(r"^(.*?)(\d+)$", wi_start)
    prefix = prefix_match.group(1) if prefix_match else ""

    # Check if wi_start itself has ever been used in active own entries
    used_wi_start = (
        db.query(Entry)
        .filter(
            Entry.is_deleted.is_(False),
            (Entry.challan_series == "own") | (Entry.challan_series.is_(None)),
            Entry.challan_no == wi_start,
        )
        .first()
    )
    if not used_wi_start:
        return wi_start, "wi_initial"

    # Query entries matching wi_start's pattern
    pattern_query = db.query(Entry).filter(
        Entry.is_deleted.is_(False),
        (Entry.challan_series == "own") | (Entry.challan_series.is_(None)),
    )
    if prefix:
        pattern_query = pattern_query.filter(Entry.challan_no.like(f"{prefix}%"))
    else:
        # Numeric pattern: entries where challan_no consists of digits
        bind = db.get_bind()
        if bind and bind.dialect.name == "postgresql":
            pattern_query = pattern_query.filter(Entry.challan_no.op("~")(r"^\d+$"))
        else:
            pattern_query = pattern_query.filter(
                ~Entry.challan_no.like("%-%"),
                ~Entry.challan_no.like("%/%"),
                ~Entry.challan_no.like("% %"),
            )

    latest_own_entry = pattern_query.order_by(Entry.created_at.desc(), Entry.id.desc()).first()
    base_no = latest_own_entry.challan_no if (latest_own_entry and latest_own_entry.challan_no) else wi_start
    cand = increment_challan_no(base_no)

    # Ensure cand is not already taken in active entries
    while (
        db.query(Entry)
        .filter(
            Entry.is_deleted.is_(False),
            (Entry.challan_series == "own") | (Entry.challan_series.is_(None)),
            Entry.challan_no == cand,
        )
        .first()
    ):
        cand = increment_challan_no(cand)

    return cand, "wi_incremental"
