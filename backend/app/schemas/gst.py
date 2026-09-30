from typing import Optional
from pydantic import BaseModel


class GSTLookupResponse(BaseModel):
    gstin: str
    legal_name: str
    trade_name: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    gst_status: str = "Active"
