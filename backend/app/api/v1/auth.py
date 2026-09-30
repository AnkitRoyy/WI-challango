import logging
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.models.audit_log import AuditLog
from app.schemas.user import LoginRequest, TokenResponse, UserResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger("challango.auth")

# In-memory tracking of failed login attempts: email -> (count, timestamp)
FAILED_ATTEMPTS: Dict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))
MAX_FAILED_WARNING_THRESHOLD = 3
RESET_WINDOW_SECONDS = 300  # 5 minutes


def _track_failed_attempt(email: str):
    count, first_time = FAILED_ATTEMPTS[email]
    now = time.time()
    if now - first_time > RESET_WINDOW_SECONDS:
        count = 1
        first_time = now
    else:
        count += 1
    FAILED_ATTEMPTS[email] = (count, first_time)

    if count >= MAX_FAILED_WARNING_THRESHOLD:
        logger.warning(
            f"SECURITY ALERT: {count} consecutive failed login attempts for email: {email} within {RESET_WINDOW_SECONDS}s window."
        )
    else:
        logger.info(f"Failed login attempt for email: {email} (Attempt count: {count})")


def _clear_failed_attempts(email: str):
    if email in FAILED_ATTEMPTS:
        del FAILED_ATTEMPTS[email]


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate user via email and password.
    Returns JWT access token with user ID and role claims.
    Returns generic 401 on invalid email or password without revealing which was incorrect.
    """
    email = credentials.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    # Generic error detail to avoid user enumeration
    generic_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user:
        _track_failed_attempt(email)
        raise generic_error

    if not verify_password(credentials.password, user.password_hash):
        _track_failed_attempt(email)
        raise generic_error

    if not user.is_active:
        logger.warning(f"Login attempt by deactivated user: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Login succeeded
    _clear_failed_attempts(email)
    logger.info(f"Successful login for user: {user.email} (Role: {user.role})")

    # Audit: record login event
    try:
        db.add(AuditLog(
            user_id=user.id,
            action="login",
            entry_id=None,
            details={"email": user.email, "role": user.role},
        ))
        db.commit()
    except Exception:
        db.rollback()  # never fail a login because of audit write

    access_token = create_access_token(
        subject=user.id,
        role=user.role,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    """
    Return current authenticated user profile without sensitive fields like password_hash.
    """
    return current_user
