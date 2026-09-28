import logging
import time
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
import httpx

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/places", tags=["Places"])
logger = logging.getLogger("challango.places")

# In-memory cache: query_lower -> (timestamp, list of results)
PLACES_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
CACHE_TTL_SECONDS = 300.0  # 5 minutes cache
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ChallanGo/1.0 (contact: admin@challango.in)"


class PlaceSearchResult(BaseModel):
    display_name: str
    lat: Optional[float] = None
    lon: Optional[float] = None


@router.get("/search", response_model=List[PlaceSearchResult])
def search_places(
    q: str = Query(..., min_length=1, description="Search query for Indian place or city"),
    current_user: User = Depends(get_current_user),
):
    """
    Proxy place autocomplete to OpenStreetMap Nominatim restricted to India (countrycodes=in).
    Caches queries in-memory for 5 minutes and returns an empty list on timeout or external API errors.
    """
    query_clean = q.strip().lower()
    if len(query_clean) < 2:
        return []

    now = time.time()
    if query_clean in PLACES_CACHE:
        cached_time, cached_results = PLACES_CACHE[query_clean]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_results

    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(
                NOMINATIM_URL,
                params={
                    "q": q.strip(),
                    "countrycodes": "in",
                    "format": "json",
                    "limit": 8,
                    "addressdetails": 1,
                },
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json",
                },
            )
            if resp.status_code == 200:
                raw_items = resp.json()
                results = []
                seen_names = set()
                for item in raw_items:
                    display_name = item.get("display_name", "").strip()
                    if not display_name or display_name in seen_names:
                        continue
                    seen_names.add(display_name)
                    try:
                        results.append({
                            "display_name": display_name,
                            "lat": float(item["lat"]) if "lat" in item and item["lat"] is not None else None,
                            "lon": float(item["lon"]) if "lon" in item and item["lon"] is not None else None,
                        })
                    except (ValueError, TypeError):
                        continue

                PLACES_CACHE[query_clean] = (now, results)
                return results
            else:
                logger.warning(f"Nominatim returned HTTP {resp.status_code} for query: {q}")
                return []
    except Exception as exc:
        logger.warning(f"Nominatim request failed or timed out for query '{q}': {exc}")
        return []
