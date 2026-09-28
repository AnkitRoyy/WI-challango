import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.entry import Entry
from app.models.audit_log import AuditLog
from app.schemas.user import UserCreate, UserResponse, UserListResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/users", tags=["Users"])
logger = logging.getLogger("challango.users")


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Create a new user (admin only).
    Rejects duplicate email with 409 Conflict.
    Hashes password with bcrypt before persisting.
    """
    email = user_in.email.lower().strip()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    new_user = User(
        name=user_in.name.strip(),
        email=email,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role.value if hasattr(user_in.role, "value") else str(user_in.role),
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(f"Admin {current_admin.email} created new user: {new_user.email} (Role: {new_user.role})")
    return new_user


@router.get("", response_model=UserListResponse)
def list_users(
    skip: int = Query(0, ge=0, description="Records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum records to return"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    List registered users with pagination (admin only).
    Omits password hashes from response.
    """
    total = db.query(User).count()
    users = (
        db.query(User)
        .order_by(User.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return UserListResponse(
        items=users,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Deactivate a user account (admin only).
    Preserves user record and historical audit associations.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Prevent admin from deactivating their own active account
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own admin account",
        )

    user.is_active = False
    db.commit()
    db.refresh(user)

    logger.info(f"Admin {current_admin.email} deactivated user ID {user.id} ({user.email})")
    return user


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def hard_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Hard-delete a user permanently (admin only).
    - Prevents admin from deleting their own account (400).
    - Prevents deleting the last remaining admin account (400).
    - Verifies user exists (404).
    - Checks if user has associated entries (created_by or updated_by) or audit_log rows.
      If yes, returns 409 Conflict with advice to deactivate.
    - If no history, physically deletes the user row.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if last admin
    if user.role == UserRole.ADMIN.value:
        admin_count = db.query(User).filter(User.role == UserRole.ADMIN.value).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining admin account",
            )

    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account",
        )

    # Check for associated entries or audit logs
    has_entries = db.query(Entry).filter(
        (Entry.created_by == user.id) | (Entry.updated_by == user.id)
    ).first() is not None

    has_audit = db.query(AuditLog).filter(
        AuditLog.user_id == user.id
    ).first() is not None

    if has_entries or has_audit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user has existing records and cannot be permanently deleted. Deactivate them instead.",
        )

    db.delete(user)
    db.commit()

    logger.info(f"Admin {current_admin.email} permanently hard-deleted user ID {user_id} ({user.email})")
    return {"detail": "User permanently deleted", "id": user_id}
