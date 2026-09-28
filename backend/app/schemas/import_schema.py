from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ImportRowPreview(BaseModel):
    row_number: int
    status: Literal["ok", "warning", "duplicate", "error"]
    messages: List[str]
    data: Dict[str, Any]


class ImportPreviewResponse(BaseModel):
    preview_id: str
    filename: str
    total_rows: int
    ok_count: int
    warning_count: int
    duplicate_count: int
    error_count: int
    rows: List[ImportRowPreview]


class ImportCommitRequest(BaseModel):
    preview_id: str = Field(..., min_length=1)
    duplicate_strategy: Literal["skip", "update"] = "skip"


class ImportCommitResponse(BaseModel):
    inserted: int
    updated: int
    skipped: int
    failed: int
    message: str
