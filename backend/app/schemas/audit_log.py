from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AuditLogItemResponse(BaseModel):
    id: int
    user_id: Optional[int]
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    action: str
    entry_id: Optional[int] = None
    details: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: List[AuditLogItemResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int
