import uuid
import pytest

from app.models.user import User, UserRole
from app.models.entry import Entry
from app.models.audit_log import AuditLog, AuditAction
from app.core.security import get_password_hash


def test_hard_delete_unused_user_succeeds(client, admin_headers, db):
    """Deleting a user with zero associated entries or audit logs succeeds and physically removes row."""
    u = uuid.uuid4().hex[:6]
    fresh_user = User(
        name=f"Accidental User {u}",
        email=f"accidental_{u}@challango.in",
        password_hash=get_password_hash("Password123!"),
        role=UserRole.STAFF.value,
        is_active=True,
    )
    db.add(fresh_user)
    db.commit()
    db.refresh(fresh_user)
    user_id = fresh_user.id

    # Admin deletes this unused user
    resp = client.delete(f"/api/v1/users/{user_id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "User permanently deleted"
    assert resp.json()["id"] == user_id

    # Confirm row is physically deleted from DB
    db.expire_all()
    deleted_row = db.query(User).filter(User.id == user_id).first()
    assert deleted_row is None


def test_hard_delete_user_with_associated_entries_fails_with_409(client, admin_headers, db):
    """Deleting a user who created or updated entries returns 409 Conflict with clear message to deactivate."""
    u = uuid.uuid4().hex[:6]
    active_worker = User(
        name=f"Active Worker {u}",
        email=f"worker_{u}@challango.in",
        password_hash=get_password_hash("Password123!"),
        role=UserRole.STAFF.value,
        is_active=True,
    )
    db.add(active_worker)
    db.commit()
    db.refresh(active_worker)
    worker_id = active_worker.id

    # Create an entry associated with this worker
    entry = Entry(
        challan_no=f"CH-WRK-{u}",
        vehicle_no="MH12AB9999",
        product="Steel Rebars",
        destination="Pune, Maharashtra",
        quantity="10.00",
        unit_price="100.00",
        total_price="1000.00",
        created_by=worker_id,
        updated_by=worker_id,
        is_deleted=False,
    )
    db.add(entry)
    db.commit()

    # Attempt hard delete
    del_resp = client.delete(f"/api/v1/users/{worker_id}", headers=admin_headers)
    assert del_resp.status_code == 409
    detail = del_resp.json()["detail"]
    assert "This user has existing records and cannot be permanently deleted" in detail
    assert "Deactivate them instead" in detail

    # Verify user still exists in DB
    db.expire_all()
    recheck_user = db.query(User).filter(User.id == worker_id).first()
    assert recheck_user is not None


def test_hard_delete_user_with_audit_logs_fails_with_409(client, admin_headers, db):
    """Deleting a user who has audit log rows returns 409 Conflict."""
    u = uuid.uuid4().hex[:6]
    audited_user = User(
        name=f"Audited User {u}",
        email=f"audited_{u}@challango.in",
        password_hash=get_password_hash("Password123!"),
        role=UserRole.STAFF.value,
        is_active=True,
    )
    db.add(audited_user)
    db.commit()
    db.refresh(audited_user)
    user_id = audited_user.id

    # Add audit log row for this user
    audit = AuditLog(
        user_id=user_id,
        action=AuditAction.EXPORT.value,
        entry_id=None,
        details={"ip": "127.0.0.1"},
    )
    db.add(audit)
    db.commit()

    # Attempt hard delete
    del_resp = client.delete(f"/api/v1/users/{user_id}", headers=admin_headers)
    assert del_resp.status_code == 409
    assert "existing records and cannot be permanently deleted" in del_resp.json()["detail"]


def test_cannot_delete_last_remaining_admin(client, admin_user, admin_headers, db):
    """Cannot delete the last remaining admin (returns 400)."""
    # 1. Remove any other admins that might exist from previous tests
    other_admins = db.query(User).filter(User.role == UserRole.ADMIN.value, User.id != admin_user.id).all()
    for oa in other_admins:
        db.delete(oa)
    db.commit()

    # Now exactly 1 admin exists in the database
    assert db.query(User).filter(User.role == UserRole.ADMIN.value).count() == 1

    # Attempt to delete this last admin
    resp = client.delete(f"/api/v1/users/{admin_user.id}", headers=admin_headers)
    assert resp.status_code == 400
    assert "Cannot delete the last remaining admin account" in resp.json()["detail"]


def test_admin_cannot_delete_own_account(client, admin_user, admin_headers, db):
    """Admin cannot delete their own account even if other admins exist (returns 400)."""
    u = uuid.uuid4().hex[:6]
    second_admin = User(
        name=f"Second Admin {u}",
        email=f"second_admin_{u}@challango.in",
        password_hash=get_password_hash("Password123!"),
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(second_admin)
    db.commit()

    try:
        # Now 2 admins exist, so admin_count > 1, but self-delete check triggers
        resp = client.delete(f"/api/v1/users/{admin_user.id}", headers=admin_headers)
        assert resp.status_code == 400
        assert "Cannot delete your own admin account" in resp.json()["detail"]
    finally:
        db.delete(second_admin)
        db.commit()


def test_delete_non_existent_user_returns_404(client, admin_headers):
    """Deleting non-existent user returns 404."""
    resp = client.delete("/api/v1/users/999999", headers=admin_headers)
    assert resp.status_code == 404
    assert "User not found" in resp.json()["detail"]


def test_staff_cannot_delete_users(client, staff_headers):
    """Staff cannot access DELETE /users/{id} (403 Forbidden)."""
    resp = client.delete("/api/v1/users/1", headers=staff_headers)
    assert resp.status_code == 403
