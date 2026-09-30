import logging
import re
import time
from typing import Dict, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
import httpx

from app.core.config import settings
from app.schemas.gst import GSTLookupResponse
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/gst", tags=["GST"])
logger = logging.getLogger("challango.gst")

# GSTIN Regex: 2 digit state code + 10 char PAN + 1 entity num + 'Z' + 1 check char
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

# In-memory cache for lookups: {gstin: (expire_timestamp, GSTLookupResponse)}
_CACHE_TTL_SECONDS = 300  # 5 minutes
_gst_cache: Dict[str, Tuple[float, GSTLookupResponse]] = {}

# Indian GST State Code mapping (2-digit prefix)
GST_STATE_MAP = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
}


def validate_gstin_format(gstin: str) -> str:
    cleaned = gstin.strip().upper()
    if len(cleaned) != 15 or not GSTIN_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GSTIN format: Must be 15 alphanumeric characters matching Indian GST format",
        )
    return cleaned


@router.get("/lookup", response_model=GSTLookupResponse)
def lookup_gstin(
    gstin: str = Query(..., description="15-character Indian GST identification number"),
    current_user: User = Depends(get_current_user),
):
    """
    Lookup business details for a given GSTIN via verification provider (gstinapi.in).
    Validates GSTIN format first (rejects malformed input with 400).
    Caches successful lookups for 5 minutes.
    Falls back gracefully if external provider is slow, down, or API key is unconfigured.
    """
    valid_gstin = validate_gstin_format(gstin)

    # 1. Check cache
    now = time.time()
    if valid_gstin in _gst_cache:
        cached_exp, cached_data = _gst_cache[valid_gstin]
        if now < cached_exp:
            logger.info(f"GST lookup cache hit for {valid_gstin}")
            return cached_data
        else:
            del _gst_cache[valid_gstin]

    # 2. Check if GSTINAPI_KEY is configured
    if not settings.GSTINAPI_KEY or not settings.GSTINAPI_KEY.strip():
        logger.warning("GSTINAPI_KEY is not configured in environment variables.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GST lookup not configured, enter details manually",
        )

    # 3. Call gstinapi.in API with 5 second timeout
    url = f"https://www.gstinapi.in/v1/gstin/{valid_gstin}"
    headers = {
        "x-api-key": settings.GSTINAPI_KEY.strip(),
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 404:
                logger.warning(f"GSTIN not found on gstinapi.in: {valid_gstin}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Couldn't fetch GST details, please enter manually",
                )
            if resp.status_code in (401, 402, 403):
                logger.error(f"gstinapi.in auth/credits error ({resp.status_code}): {resp.text}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="GST lookup not configured, enter details manually",
                )
            if resp.status_code != 200:
                logger.error(f"gstinapi.in returned status {resp.status_code}: {resp.text}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Couldn't fetch GST details, please enter manually",
                )

            data = resp.json()
            if not data.get("success", False) or not data.get("data"):
                error_msg = str(data.get("error", "")).lower()
                logger.warning(f"gstinapi.in lookup unsuccessful for {valid_gstin}: {data}")
                if "not found" in error_msg:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Couldn't fetch GST details, please enter manually",
                    )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Couldn't fetch GST details, please enter manually",
                )

            info = data["data"]
            legal_name = info.get("legal_name") or info.get("trade_name") or "Unknown Legal Name"
            trade_name = info.get("trade_name")

            # Format address
            addr_details = info.get("address_details") if isinstance(info.get("address_details"), dict) else {}
            address_str = info.get("address")
            if not address_str:
                addr_parts = [
                    addr_details.get("building_number"),
                    addr_details.get("building_name"),
                    addr_details.get("street"),
                    addr_details.get("locality"),
                    info.get("city"),
                    addr_details.get("pincode") or info.get("pincode"),
                ]
                address_str = ", ".join(str(p).strip() for p in addr_parts if p and str(p).strip()) or None

            # Determine state
            state_code = str(info.get("state_code") or valid_gstin[:2]).zfill(2)
            state_str = addr_details.get("state") or GST_STATE_MAP.get(state_code) or state_code

            gst_status = info.get("status", "Active")

            result = GSTLookupResponse(
                gstin=valid_gstin,
                legal_name=legal_name,
                trade_name=trade_name,
                address=address_str,
                state=state_str,
                gst_status=gst_status,
            )

            # Store in cache
            _gst_cache[valid_gstin] = (now + _CACHE_TTL_SECONDS, result)
            return result

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.warning(f"GST lookup timed out for {valid_gstin}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Couldn't fetch GST details, please enter manually",
        )
    except httpx.RequestError as exc:
        logger.error(f"Network error during GST lookup: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't fetch GST details, please enter manually",
        )
