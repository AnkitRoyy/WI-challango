import uuid
import pytest
from app.models.party import Party


def test_party_crud_and_permissions(client, admin_headers, staff_headers):
    unique = uuid.uuid4().hex[:6]
    trade_name = f"West Industries {unique}"
    legal_name = f"Rishi Yadav {unique}"
    gst_in = f"27AAAAA{unique[:4].upper()}1Z5"

    # 1. Staff cannot create party (admin required)
    staff_create = client.post(
        "/api/v1/parties",
        json={
            "trade_name": trade_name,
            "legal_name": legal_name,
            "gst_number": gst_in,
            "address": "Andheri East",
            "state": "Maharashtra",
        },
        headers=staff_headers,
    )
    assert staff_create.status_code == 403

    # 1b. Missing initial_challan_no returns 400
    missing_challan = client.post(
        "/api/v1/parties",
        json={
            "trade_name": trade_name,
            "legal_name": legal_name,
            "gst_number": gst_in,
            "address": "Andheri East",
            "state": "Maharashtra",
        },
        headers=admin_headers,
    )
    assert missing_challan.status_code == 400
    assert "initial_challan_no" in missing_challan.json()["detail"]

    # 2. Admin can create party with separate trade_name, legal_name, and initial_challan_no
    create_resp = client.post(
        "/api/v1/parties",
        json={
            "trade_name": trade_name,
            "legal_name": legal_name,
            "gst_number": gst_in,
            "address": "Andheri East",
            "state": "Maharashtra",
            "initial_challan_no": f"WEST-{unique}",
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 201
    party_data = create_resp.json()
    assert party_data["name"] == trade_name
    assert party_data["trade_name"] == trade_name
    assert party_data["legal_name"] == legal_name
    assert party_data["gst_number"] == gst_in
    assert party_data["initial_challan_no"] == f"WEST-{unique}"
    assert party_data["is_active"] is True
    party_id = party_data["id"]

    # Verify audit log was recorded for party creation
    audit_resp = client.get("/api/v1/audit-logs?page_size=10", headers=admin_headers)
    assert audit_resp.status_code == 200
    latest_log = audit_resp.json()["items"][0]
    assert latest_log["action"] == "create"
    assert latest_log["details"]["party"] == trade_name
    assert latest_log["details"]["trade_name"] == trade_name
    assert latest_log["details"]["legal_name"] == legal_name

    # 3. Duplicate name returns 409 Conflict
    dup_resp = client.post(
        "/api/v1/parties",
        json={"name": trade_name, "gst_number": "27BBBBB0000A1Z5", "initial_challan_no": "WEST-001"},
        headers=admin_headers,
    )
    assert dup_resp.status_code == 409

    # 4. Duplicate GST number returns 409 Conflict
    dup_gst_resp = client.post(
        "/api/v1/parties",
        json={"name": f"Another Name {unique}", "gst_number": gst_in, "initial_challan_no": "WEST-002"},
        headers=admin_headers,
    )
    assert dup_gst_resp.status_code == 409

    # 5. Staff CAN list parties and search by trade or legal name
    list_resp = client.get(
        f"/api/v1/parties?search={unique}",
        headers=staff_headers,
    )
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["id"] == party_id
    assert items[0]["trade_name"] == trade_name
    assert items[0]["legal_name"] == legal_name

    # 6. Admin can update party (including phone)
    updated_trade = f"{trade_name} Updated"
    patch_resp = client.patch(
        f"/api/v1/parties/{party_id}",
        json={
            "name": updated_trade,
            "trade_name": updated_trade,
            "address": "Bandra Kurla Complex",
            "phone": "9876543210",
        },
        headers=admin_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == updated_trade
    assert patch_resp.json()["trade_name"] == updated_trade
    assert patch_resp.json()["address"] == "Bandra Kurla Complex"
    assert patch_resp.json()["phone"] == "9876543210"

    # Search by phone works
    phone_search = client.get("/api/v1/parties?search=9876543210", headers=staff_headers)
    assert phone_search.status_code == 200
    assert any(p["id"] == party_id for p in phone_search.json())

    # 7. Admin soft-deletes party
    del_resp = client.delete(
        f"/api/v1/parties/{party_id}",
        headers=admin_headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["detail"] == "Party soft-deleted successfully"

    # 8. Soft-deleted party is not returned in default active list
    list_after = client.get(
        f"/api/v1/parties?search={unique}",
        headers=staff_headers,
    )
    assert list_after.status_code == 200
    assert len(list_after.json()) == 0


def test_company_phone_setting(client, admin_headers, staff_headers):
    # Staff cannot update company phone
    res_staff = client.put("/api/v1/settings/company-phone", json={"company_phone": "9034218483"}, headers=staff_headers)
    assert res_staff.status_code == 403

    # Staff/Admin can view company phone
    res_get = client.get("/api/v1/settings/company-phone", headers=staff_headers)
    assert res_get.status_code == 200
    assert "company_phone" in res_get.json()

    # Admin updates company phone
    res_update = client.put(
        "/api/v1/settings/company-phone",
        json={"company_phone": "9034218483"},
        headers=admin_headers,
    )
    assert res_update.status_code == 200
    assert res_update.json()["company_phone"] == "9034218483"

