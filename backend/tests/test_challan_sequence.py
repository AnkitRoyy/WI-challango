import uuid
import pytest
from app.services.challan_sequence_service import increment_challan_no


def test_increment_challan_no_units():
    assert increment_challan_no("WI-001") == "WI-002"
    assert increment_challan_no("WI-099") == "WI-100"
    assert increment_challan_no("1") == "2"
    assert increment_challan_no("100") == "101"
    assert increment_challan_no("INV-9") == "INV-10"
    assert increment_challan_no("ABC/24/005") == "ABC/24/006"
    assert increment_challan_no("WI") == "WI-001"
    assert increment_challan_no("") == "WI-001"


def test_next_challan_no_endpoints(client, admin_headers):
    uid = uuid.uuid4().hex[:6].upper()

    # Preserve current setting
    r_orig = client.get("/api/v1/settings/challan-series", headers=admin_headers)
    orig_val = r_orig.json().get("wi_initial_challan_no", "1")

    try:
        # 1. Check default WI next challan no
        r = client.get("/api/v1/entries/next-challan-no?series_type=own", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["series_type"] == "own"
        assert "next_challan_no" in data

        # 2. Update WI starting variable
        r = client.put(
            "/api/v1/settings/challan-series",
            json={"wi_initial_challan_no": "WI-100"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["wi_initial_challan_no"] == "WI-100"

        # Verify settings fetch
        r = client.get("/api/v1/settings/challan-series", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["wi_initial_challan_no"] == "WI-100"

        # 3. Create a party with initial_challan_no
        p_name = f"Tata Motors {uid}"
        init_no = f"TATA-{uid}"
        r_party = client.post(
            "/api/v1/parties",
            json={
                "name": p_name,
                "initial_challan_no": init_no,
            },
            headers=admin_headers,
        )
        assert r_party.status_code == 201
        party_data = r_party.json()
        party_id = party_data["id"]
        assert party_data["initial_challan_no"] == init_no

        # Check next challan no for party series before any entries
        r = client.get(f"/api/v1/entries/next-challan-no?series_type=party&party_id={party_id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["next_challan_no"] == init_no

        # 4. Create an entry using party series
        entry_payload = {
            "challan_no": init_no,
            "challan_series": "party",
            "vehicle_no": "MH12AB1234",
            "product": f"Steel Coil {uid}",
            "destination": "Pune Plant",
            "party_name": p_name,
            "quantity": 10,
            "unit_price": 500,
        }
        r_entry = client.post("/api/v1/entries", json=entry_payload, headers=admin_headers)
        assert r_entry.status_code == 201
        assert r_entry.json()["challan_series"] == "party"

        # Next challan no for this party should now be incremented
        expected_next = increment_challan_no(init_no)
        r = client.get(f"/api/v1/entries/next-challan-no?series_type=party&party_id={party_id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["next_challan_no"] == expected_next

        # Next challan no for another party with initial_challan_no
        r_party2 = client.post(
            "/api/v1/parties",
            json={"name": f"Reliance Industries {uid}", "initial_challan_no": f"RELI-{uid}"},
            headers=admin_headers,
        )
        assert r_party2.status_code == 201
        party2_id = r_party2.json()["id"]

        r = client.get(f"/api/v1/entries/next-challan-no?series_type=party&party_id={party2_id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["next_challan_no"] == f"RELI-{uid}"
    finally:
        client.put(
            "/api/v1/settings/challan-series",
            json={"wi_initial_challan_no": orig_val},
            headers=admin_headers,
        )
