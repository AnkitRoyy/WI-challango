from datetime import timedelta
import pytest
from app.core.security import create_access_token, verify_password, get_password_hash
from app.models.user import User, UserRole


def test_login_success(client):
    """Login with correct credentials succeeds and returns a usable token."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@challango.in", "password": "Admin@123456"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "expires_in" in data
    assert data["expires_in"] > 0

    # Verify the returned token works for protected /auth/me
    token = data["access_token"]
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "admin@challango.in"
    assert me_data["role"] == "admin"


def test_login_wrong_password_fails_401(client):
    """Login with wrong password fails with generic 401."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@challango.in", "password": "WrongPassword999!"},
    )
    assert response.status_code == 401
    data = response.json()
    assert data["detail"] == "Incorrect email or password"


def test_login_nonexistent_email_fails_with_same_401(client):
    """Login with non-existent email returns the EXACT same 401 message as wrong password."""
    resp_wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@challango.in", "password": "WrongPassword999!"},
    )
    resp_wrong_email = client.post(
        "/api/v1/auth/login",
        json={"email": "doesnotexist_9988@challango.in", "password": "AnyPassword123"},
    )

    assert resp_wrong_email.status_code == 401
    assert resp_wrong_email.json()["detail"] == resp_wrong_pw.json()["detail"]
    assert resp_wrong_email.json()["detail"] == "Incorrect email or password"


def test_auth_me_valid_token_excludes_password_hash(client, admin_headers):
    """/auth/me returns user profile and NEVER exposes password_hash."""
    response = client.get("/api/v1/auth/me", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "name" in data
    assert "email" in data
    assert "role" in data
    assert "is_active" in data
    assert "password_hash" not in data
    assert "password" not in data


def test_auth_me_no_token_returns_401(client):
    """/auth/me with missing Authorization header returns 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_auth_me_garbage_token_returns_401(client):
    """/auth/me with invalid or malformed token returns 401."""
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt-token"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"


def test_auth_me_expired_token_returns_401(client, admin_user):
    """/auth/me with an expired token returns 401 with clear message."""
    expired_token = create_access_token(
        subject=admin_user.id,
        role=admin_user.role,
        expires_delta=timedelta(seconds=-10),  # expired 10 seconds ago
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


def test_admin_endpoint_rejects_staff_with_403(client, staff_headers):
    """Admin-only endpoint rejects a staff-role token with 403."""
    response = client.get("/api/v1/users", headers=staff_headers)
    assert response.status_code == 403
    assert "Admin privileges required" in response.json()["detail"]


def test_admin_endpoint_accepts_admin_with_200(client, admin_headers):
    """Admin-only endpoint accepts an admin-role token with 200."""
    response = client.get("/api/v1/users", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    for user_item in data["items"]:
        assert "password_hash" not in user_item


def test_create_user_duplicate_email_returns_409(client, admin_headers):
    """Creating a user with an existing email returns 409 Conflict."""
    payload = {
        "name": "Duplicate Test User",
        "email": "admin@challango.in",  # already registered
        "password": "Password123!",
        "role": "staff"
    }
    response = client.post("/api/v1/users", json=payload, headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"


def test_create_user_hashes_password_and_saves_successfully(client, admin_headers, db):
    """Creating a user hashes the password in the database, never storing plaintext."""
    raw_password = "SecretSuperPassword123"
    payload = {
        "name": "Pooja Sharma",
        "email": "pooja.sharma@challango.in",
        "password": raw_password,
        "role": "staff"
    }
    # Clean up if existed from a previous run
    existing = db.query(User).filter(User.email == payload["email"]).first()
    if existing:
        db.delete(existing)
        db.commit()

    response = client.post("/api/v1/users", json=payload, headers=admin_headers)
    assert response.status_code == 201
    created = response.json()
    assert created["email"] == payload["email"]
    assert "password_hash" not in created

    # Verify directly in DB
    db_user = db.query(User).filter(User.email == payload["email"]).first()
    assert db_user is not None
    assert db_user.password_hash != raw_password
    assert db_user.password_hash.startswith("$2b$")
    assert verify_password(raw_password, db_user.password_hash) is True


def test_deactivated_user_token_is_rejected_on_next_request(client, admin_headers, db):
    """Deactivated user's token stops working immediately on the next protected request."""
    # 1. Create a user to test deactivation
    test_email = "deactivate_me@challango.in"
    user = db.query(User).filter(User.email == test_email).first()
    if not user:
        user = User(
            name="To Be Deactivated",
            email=test_email,
            password_hash=get_password_hash("Password123!"),
            role=UserRole.STAFF.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.is_active = True
        db.commit()

    # 2. Generate a valid token for this user
    token = create_access_token(subject=user.id, role=user.role)

    # 3. Request should work initially
    resp1 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp1.status_code == 200

    # 4. Admin deactivates the user
    deactivate_resp = client.patch(f"/api/v1/users/{user.id}/deactivate", headers=admin_headers)
    assert deactivate_resp.status_code == 200
    assert deactivate_resp.json()["is_active"] is False

    # 5. User's existing token should now be rejected with 401
    resp2 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp2.status_code == 401
    assert resp2.json()["detail"] == "User account is deactivated"


def test_database_password_hashes_are_never_plaintext(db):
    """Verify all users in the database have bcrypt hashed passwords, never plaintext."""
    users = db.query(User).all()
    assert len(users) > 0
    for u in users:
        assert u.password_hash is not None
        assert u.password_hash.startswith("$2b$")
        assert len(u.password_hash) >= 50
