from datetime import datetime
from typing import List
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = UserRole.STAFF


class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    skip: int
    limit: int
