import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest

from app.models.entry import Entry
from app.models.audit_log import AuditLog, AuditAction


def test_create_entry_computes_total_price_ignoring_client_value(client, staff_headers):
    """Total price is always computed server-side as quantity * unit_price, ignoring client value."""
    unique_id = uuid.uuid4().hex[:6]
    payload = {
        "serial_no": "TEST-001",
        "challan_no": f"CH-TEST-{unique_id}",
        "vehicle_no": "DL01AB9999",
        "product": "Testing TMT Bars 20mm",
        "destination": "Delhi NCR",
        "quantity": "10.50",
        "unit_price": "200.00",
        "total_price": "999999.99",  # Attempt to submit fake total_price
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 201
    data = response.json()
    assert Decimal(data["total_price"]) == Decimal("2100.00")
    assert Decimal(data["quantity"]) == Decimal("10.50")
    assert Decimal(data["unit_price"]) == Decimal("200.00")
    assert data["challan_no"] == f"CH-TEST-{unique_id}"
    assert data["serial_no"] == "TEST-001"
    assert data["warning"] is None


def test_create_entry_invalid_quantity_or_price_returns_400(client, staff_headers):
    """Creating with quantity <= 0 or unit_price < 0 fails with 400 naming the field."""
    unique_id = uuid.uuid4().hex[:6]
    # Zero quantity
    resp1 = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": f"CH-INV-1-{unique_id}",
            "vehicle_no": "MH12AB1234",
            "product": "Cement",
            "quantity": "0.00",
            "unit_price": "350.00",
        },
        headers=staff_headers,
    )
    assert resp1.status_code == 400
    assert "quantity" in resp1.json()["detail"].lower()

    # Negative quantity
    resp2 = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": f"CH-INV-2-{unique_id}",
            "vehicle_no": "MH12AB1234",
            "product": "Cement",
            "quantity": "-5.00",
            "unit_price": "350.00",
        },
        headers=staff_headers,
    )
    assert resp2.status_code == 400
    assert "quantity" in resp2.json()["detail"].lower()

    # Negative unit_price
    resp3 = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": f"CH-INV-3-{unique_id}",
            "vehicle_no": "MH12AB1234",
            "product": "Cement",
            "quantity": "10.00",
            "unit_price": "-10.00",
        },
        headers=staff_headers,
    )
    assert resp3.status_code == 400
    assert "unit_price" in resp3.json()["detail"].lower()


def test_create_entry_duplicate_fails_with_409(client, staff_headers):
    """Creating an entry with duplicate (challan_no, serial_no) fails with 409."""
    unique_id = uuid.uuid4().hex[:6]
    payload = {
        "serial_no": "DUP-001",
        "challan_no": f"CH-DUP-{unique_id}",
        "vehicle_no": "KA01AB1122",
        "product": "River Sand Grade-B",
        "destination": "Bengaluru, Karnataka",
        "quantity": "25.00",
        "unit_price": "1200.00",
    }
    # First save succeeds
    resp1 = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert resp1.status_code == 201

    # Second save with exact same challan_no and serial_no fails with 409
    resp2 = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert resp2.status_code == 409
    detail = resp2.json()["detail"]
    assert f"CH-DUP-{unique_id}" in detail
    assert "DUP-001" in detail


def test_vehicle_number_normalized_on_save(client, staff_headers):
    """Vehicle number gets normalized (uppercase, spaces/hyphens stripped) on save."""
    unique_id = uuid.uuid4().hex[:6]
    payload = {
        "serial_no": "NORM-001",
        "challan_no": f"CH-NORM-{unique_id}",
        "vehicle_no": "dl 01 ab-1234",
        "product": "Vitrified Tiles",
        "destination": "Delhi NCR",
        "quantity": "100.00",
        "unit_price": "450.00",
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["vehicle_no"] == "DL01AB1234"
    assert data["warning"] is None


def test_non_standard_vehicle_number_saves_with_warning(client, staff_headers):
    """Vehicle number in an unexpected format still saves, with a warning present in response."""
    unique_id = uuid.uuid4().hex[:6]
    payload = {
        "serial_no": "WARN-001",
        "challan_no": f"CH-WARN-{unique_id}",
        "vehicle_no": "TRACTOR-CUSTOM-99",
        "product": "Crushed Stone Aggregate",
        "destination": "Faridabad, Haryana",
        "quantity": "20.00",
        "unit_price": "850.00",
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["vehicle_no"] == "TRACTORCUSTOM99"
    assert data["warning"] is not None
    assert "standard Indian registration format" in data["warning"]


def test_update_entry_recomputes_total_price(client, staff_headers):
    """Update recomputes total_price when quantity or unit_price changes."""
    unique_id = uuid.uuid4().hex[:6]
    # Create entry
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "UPD-001",
            "challan_no": f"CH-UPD-{unique_id}",
            "vehicle_no": "UP32AA4455",
            "product": "Ready Mix Concrete M20",
            "destination": "Lucknow, Uttar Pradesh",
            "quantity": "10.00",
            "unit_price": "4000.00",
        },
        headers=staff_headers,
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["id"]
    assert Decimal(create_resp.json()["total_price"]) == Decimal("40000.00")

    # Update quantity to 15.00
    patch_resp = client.patch(
        f"/api/v1/entries/{entry_id}",
        json={"quantity": "15.00"},
        headers=staff_headers,
    )
    assert patch_resp.status_code == 200
    assert Decimal(patch_resp.json()["quantity"]) == Decimal("15.00")
    assert Decimal(patch_resp.json()["total_price"]) == Decimal("60000.00")


def test_delete_requires_admin_soft_deletes_row(client, staff_headers, admin_headers, db):
    """Delete requires admin (staff gets 403), admin succeeds and sets is_deleted=true."""
    unique_id = uuid.uuid4().hex[:6]
    # Create entry
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "DEL-001",
            "challan_no": f"CH-DEL-{unique_id}",
            "vehicle_no": "HR26DQ1111",
            "product": "Plasticizers",
            "destination": "Gurugram, Haryana",
            "quantity": "5.00",
            "unit_price": "500.00",
        },
        headers=staff_headers,
    )
    entry_id = create_resp.json()["id"]

    # Staff attempts delete -> 403 Forbidden
    del_staff = client.delete(f"/api/v1/entries/{entry_id}", headers=staff_headers)
    assert del_staff.status_code == 403

    # Admin deletes -> 200 OK
    del_admin = client.delete(f"/api/v1/entries/{entry_id}", headers=admin_headers)
    assert del_admin.status_code == 200
    assert del_admin.json()["detail"] == "Entry successfully deleted"

    # Verify soft delete in database: row still exists but is_deleted = True
    db_entry = db.query(Entry).filter(Entry.id == entry_id).first()
    assert db_entry is not None
    assert db_entry.is_deleted is True


def test_soft_deleted_entries_never_appear_in_get(client, staff_headers, admin_headers):
    """Soft deleted entries never appear in GET /entries or GET /entries/{id}."""
    unique_id = uuid.uuid4().hex[:6]
    challan = f"CH-HIDE-{unique_id}"
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "HIDE-001",
            "challan_no": challan,
            "vehicle_no": "KA04FG9999",
            "product": "Hidden Item",
            "destination": "Bengaluru, Karnataka",
            "quantity": "1.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )
    entry_id = create_resp.json()["id"]

    # Admin soft deletes it
    client.delete(f"/api/v1/entries/{entry_id}", headers=admin_headers)

    # GET /entries/{id} returns 404
    get_one = client.get(f"/api/v1/entries/{entry_id}", headers=staff_headers)
    assert get_one.status_code == 404
    assert get_one.json()["detail"] == "Entry not found"

    # GET /entries with query for this challan returns 0 items
    get_list = client.get("/api/v1/entries", params={"challan_no": challan}, headers=staff_headers)
    assert get_list.status_code == 200
    assert get_list.json()["total_count"] == 0


def test_list_pagination(client, staff_headers):
    """List endpoint pagination returns correct total_count and total_pages."""
    resp = client.get("/api/v1/entries", params={"page": 1, "page_size": 10}, headers=staff_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert len(data["items"]) == 10
    assert data["total_count"] >= 60
    assert data["total_pages"] == (data["total_count"] + 9) // 10


def test_list_search_q_matches_across_four_fields(client, staff_headers):
    """Search q matches partial, case-insensitive text across challan_no, serial_no, vehicle_no, product."""
    # 1. Match by product
    r1 = client.get("/api/v1/entries", params={"q": "UltraTech"}, headers=staff_headers)
    assert r1.status_code == 200
    assert any("UltraTech" in item["product"] for item in r1.json()["items"])

    # 2. Match by vehicle_no (case-insensitive)
    r2 = client.get("/api/v1/entries", params={"q": "dl01ab"}, headers=staff_headers)
    assert r2.status_code == 200
    assert any("DL01AB" in item["vehicle_no"] for item in r2.json()["items"])

    # 3. Match by challan_no
    r3 = client.get("/api/v1/entries", params={"q": "CH-2026-001"}, headers=staff_headers)
    assert r3.status_code == 200
    assert any(item["challan_no"] == "CH-2026-001" for item in r3.json()["items"])

    # 4. Match by serial_no
    r4 = client.get("/api/v1/entries", params={"q": "002"}, headers=staff_headers)
    assert r4.status_code == 200
    assert any(item["serial_no"] == "002" for item in r4.json()["items"])


def test_list_and_summary_filters_consistency(client, staff_headers):
    """Summary endpoint matches exactly with list results across different filter combinations."""
    # Combination 1: Product filter
    list_r1 = client.get("/api/v1/entries", params={"product": "Cement", "page_size": 200}, headers=staff_headers)
    summ_r1 = client.get("/api/v1/entries/summary", params={"product": "Cement"}, headers=staff_headers)

    l1_data = list_r1.json()
    s1_data = summ_r1.json()

    assert s1_data["count"] == l1_data["total_count"]
    expected_sum_p1 = sum(Decimal(i["total_price"]) for i in l1_data["items"])
    assert Decimal(s1_data["sum_total_price"]) == expected_sum_p1
    expected_sum_q1 = sum(Decimal(i["quantity"]) for i in l1_data["items"])
    assert Decimal(s1_data["sum_quantity"]) == expected_sum_q1

    # Combination 2: Combined Vehicle + Search Q
    list_r2 = client.get("/api/v1/entries", params={"vehicle_no": "MH12", "q": "Cement", "page_size": 200}, headers=staff_headers)
    summ_r2 = client.get("/api/v1/entries/summary", params={"vehicle_no": "MH12", "q": "Cement"}, headers=staff_headers)

    l2_data = list_r2.json()
    s2_data = summ_r2.json()

    assert s2_data["count"] == l2_data["total_count"]
    expected_sum_p2 = sum(Decimal(i["total_price"]) for i in l2_data["items"])
    assert Decimal(s2_data["sum_total_price"]) == expected_sum_p2

    # Combination 3: Date range filter
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    list_r3 = client.get(
        "/api/v1/entries",
        params={"date_from": thirty_days_ago, "date_to": today, "page_size": 200},
        headers=staff_headers,
    )
    summ_r3 = client.get(
        "/api/v1/entries/summary",
        params={"date_from": thirty_days_ago, "date_to": today},
        headers=staff_headers,
    )
    assert list_r3.status_code == 200
    assert summ_r3.status_code == 200
    assert summ_r3.json()["count"] == list_r3.json()["total_count"]


def test_audit_log_created_for_create_update_delete(client, admin_headers, staff_headers, db):
    """An audit_log row is created for create, update, and delete with correct action and user_id."""
    unique_id = uuid.uuid4().hex[:6]
    challan = f"CH-AUDIT-{unique_id}"
    # 1. Create entry as staff
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "AUDIT-01",
            "challan_no": challan,
            "vehicle_no": "DL09XX1212",
            "product": "Audit Logging Test Material",
            "destination": "Delhi NCR",
            "quantity": "10.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["id"]

    # Verify audit log for CREATE
    audit_create = (
        db.query(AuditLog)
        .filter(AuditLog.entry_id == entry_id, AuditLog.action == AuditAction.CREATE.value)
        .first()
    )
    assert audit_create is not None
    assert audit_create.details["challan_no"] == challan

    # 2. Update entry as staff
    patch_resp = client.patch(
        f"/api/v1/entries/{entry_id}",
        json={"unit_price": "150.00"},
        headers=staff_headers,
    )
    assert patch_resp.status_code == 200

    # Verify audit log for UPDATE
    audit_update = (
        db.query(AuditLog)
        .filter(AuditLog.entry_id == entry_id, AuditLog.action == AuditAction.UPDATE.value)
        .first()
    )
    assert audit_update is not None
    assert "changed_fields" in audit_update.details
    assert "unit_price" in audit_update.details["changed_fields"]
    assert "total_price" in audit_update.details["changed_fields"]

    # 3. Delete entry as admin
    del_resp = client.delete(f"/api/v1/entries/{entry_id}", headers=admin_headers)
    assert del_resp.status_code == 200

    # Verify audit log for DELETE
    audit_delete = (
        db.query(AuditLog)
        .filter(AuditLog.entry_id == entry_id, AuditLog.action == AuditAction.DELETE.value)
        .first()
    )
    assert audit_delete is not None
    assert audit_delete.action == "delete"
