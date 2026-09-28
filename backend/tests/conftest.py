import os
import sys
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add app to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings
from app.core.security import get_password_hash, create_access_token
from app.models.user import User, UserRole

# Test engine
test_engine = create_engine(settings.sync_database_url)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session")
def db():
    # Make sure tables exist
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="session")
def client():
    # Session-wide test client
    session = TestingSessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    session.close()


@pytest.fixture(scope="session")
def admin_user(db):
    user = db.query(User).filter(User.email == "admin@challango.in").first()
    if not user:
        user = User(
            name="System Administrator",
            email="admin@challango.in",
            password_hash=get_password_hash("Admin@123456"),
            role=UserRole.ADMIN.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        user.is_active = True
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture(scope="session")
def staff_user(db):
    user = db.query(User).filter(User.email == "staff@challango.in").first()
    if not user:
        user = User(
            name="Ramesh Kumar (Staff)",
            email="staff@challango.in",
            password_hash=get_password_hash("Staff@123456"),
            role=UserRole.STAFF.value,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        user.is_active = True
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture(scope="session")
def admin_headers(admin_user):
    token = create_access_token(subject=admin_user.id, role=admin_user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def staff_headers(staff_user):
    token = create_access_token(subject=staff_user.id, role=staff_user.role)
    return {"Authorization": f"Bearer {token}"}
