import uuid
from decimal import Decimal
from unittest.mock import patch
import httpx
import pytest

from app.models.entry import Entry
from app.services.import_service import parse_and_preview_import
from tests.test_import import _create_test_xlsx_bytes, STANDARD_HEADERS


def test_places_search_success_restricted_to_india(client, staff_headers):
    """GET /places/search returns simplified places list restricted to India."""
    # Mock httpx response to avoid network flake or hitting rate limit in tests
    mock_nominatim_data = [
        {
            "place_id": 12345,
            "display_name": "Mumbai, Maharashtra, India",
            "lat": "19.0760",
            "lon": "72.8777",
            "type": "city",
        },
        {
            "place_id": 67890,
            "display_name": "Mumbai Suburban, Maharashtra, India",
            "lat": "19.1300",
            "lon": "72.8800",
            "type": "administrative",
        },
    ]

    mock_client_instance = httpx.Client()
    with patch("app.api.v1.places.httpx.Client") as mock_client_cls:
        mock_ctx = mock_client_cls.return_value.__enter__.return_value
        mock_resp = httpx.Response(200, json=mock_nominatim_data, request=httpx.Request("GET", "https://nominatim.openstreetmap.org/search"))
        mock_ctx.get.return_value = mock_resp

        response = client.get("/api/v1/places/search?q=MockCityQuery", headers=staff_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["display_name"] == "Mumbai, Maharashtra, India"
        assert data[0]["lat"] == pytest.approx(19.0760)
        assert data[0]["lon"] == pytest.approx(72.8777)


def test_places_search_handles_external_timeout_or_failure_gracefully(client, staff_headers):
    """If Nominatim fails or times out, endpoint returns 200 with empty list [] rather than 500 error."""
    with patch("app.api.v1.places.httpx.Client") as mock_client_cls:
        mock_ctx = mock_client_cls.return_value.__enter__.return_value
        mock_ctx.get.side_effect = httpx.TimeoutException("Nominatim timed out")

        response = client.get("/api/v1/places/search?q=NonExistentTownOrSlowAPI", headers=staff_headers)
        assert response.status_code == 200
        assert response.json() == []


def test_create_entry_without_destination_fails_400(client, staff_headers):
    """Creating an entry without destination fails with 400 (required field)."""
    unique_id = uuid.uuid4().hex[:6]
    payload = {
        "serial_no": "001",
        "challan_no": f"CH-NODEST-{unique_id}",
        "vehicle_no": "DL01AB1111",
        "product": "Steel Wire",
        "quantity": "10.00",
        "unit_price": "100.00",
        # Missing destination
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 400
    assert "destination" in response.json()["detail"].lower()


def test_create_entry_with_destination_no_coordinates_succeeds(client, staff_headers, db):
    """User can type a free-text destination without selecting coordinates (coordinates stay null)."""
    unique_id = uuid.uuid4().hex[:6]
    challan = f"CH-FREETEXT-{unique_id}"
    payload = {
        "serial_no": "001",
        "challan_no": challan,
        "vehicle_no": "DL01AB2222",
        "product": "River Sand",
        "destination": "Near City Highway Toll Gate, Custom Site",
        "destination_lat": None,
        "destination_lng": None,
        "quantity": "20.00",
        "unit_price": "150.00",
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["destination"] == "Near City Highway Toll Gate, Custom Site"
    assert data["destination_lat"] is None
    assert data["destination_lng"] is None

    # Check in DB
    db_entry = db.query(Entry).filter(Entry.challan_no == challan).first()
    assert db_entry is not None
    assert db_entry.destination == "Near City Highway Toll Gate, Custom Site"
    assert db_entry.destination_lat is None
    assert db_entry.destination_lng is None


def test_create_entry_with_coordinates_from_suggestion_succeeds(client, staff_headers, db):
    """Selecting a place suggestion stores both destination string and latitude/longitude."""
    unique_id = uuid.uuid4().hex[:6]
    challan = f"CH-COORDS-{unique_id}"
    payload = {
        "serial_no": "001",
        "challan_no": challan,
        "vehicle_no": "MH12DE3333",
        "product": "Aggregate 20mm",
        "destination": "Shivaji Nagar, Pune, Maharashtra",
        "destination_lat": 18.5314,
        "destination_lng": 73.8446,
        "quantity": "15.00",
        "unit_price": "200.00",
    }
    response = client.post("/api/v1/entries", json=payload, headers=staff_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["destination"] == "Shivaji Nagar, Pune, Maharashtra"
    assert data["destination_lat"] == 18.5314
    assert data["destination_lng"] == 73.8446


def test_multi_column_search_q_matches_destination(client, staff_headers):
    """The multi-column search query 'q' matches text in destination."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-DESTQ-{u}"
    client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": challan,
            "vehicle_no": "KA01AB4444",
            "product": "Special Ceramic Tiles",
            "destination": f"Indiranagar-{u}, Bengaluru",
            "quantity": "10.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )

    # Search with q matching the unique destination
    resp = client.get("/api/v1/entries", params={"q": f"Indiranagar-{u}"}, headers=staff_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert any(i["challan_no"] == challan for i in items)


def test_destination_filter_param(client, staff_headers):
    """Filter ?destination= matches entries by destination text."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-DESTFILT-{u}"
    client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": challan,
            "vehicle_no": "KA01AB5555",
            "product": "Pipes",
            "destination": f"Whitefield-{u}, Karnataka",
            "quantity": "10.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )

    resp = client.get("/api/v1/entries", params={"destination": f"Whitefield-{u}"}, headers=staff_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["challan_no"] == challan


def test_import_missing_destination_marked_error(client, staff_headers):
    """Import preview marks rows with missing Destination as status 'error'."""
    u = uuid.uuid4().hex[:6]
    # Row with blank Destination
    rows = [
        ["001", f"CH-IMPERR-{u}", "DL01AB1234", "Steel Rods", "", "10", "500.00", "5000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("missing_dest.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["error_count"] == 1
    assert data["rows"][0]["status"] == "error"
    assert any("Destination is required" in m for m in data["rows"][0]["messages"])


def test_import_any_destination_text_succeeds(client, staff_headers, db):
    """Import preview and commit accept any free-text destination and store coordinates as null."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-IMPDEST-{u}"
    custom_dest = "Remote Project Warehouse Sector 42"
    rows = [
        ["001", challan, "DL01AB1234", "Steel Rods", custom_dest, "10", "500.00", "5000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    preview_resp = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("custom_dest.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert preview_resp.status_code == 200
    assert preview_resp.json()["ok_count"] == 1
    preview_id = preview_resp.json()["preview_id"]

    # Commit
    commit_resp = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": preview_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert commit_resp.status_code == 200
    assert commit_resp.json()["inserted"] == 1

    # Verify DB
    db_entry = db.query(Entry).filter(Entry.challan_no == challan).first()
    assert db_entry is not None
    assert db_entry.destination == custom_dest
    assert db_entry.destination_lat is None
    assert db_entry.destination_lng is None
