from unittest.mock import patch, MagicMock
import pytest
from app.core.config import settings
from app.api.v1.gst import _gst_cache


def test_gst_lookup_invalid_format(client, staff_headers):
    """Invalid GSTIN format raises 400 Bad Request."""
    resp = client.get("/api/v1/gst/lookup?gstin=INVALID123", headers=staff_headers)
    assert resp.status_code == 400
    assert "Invalid GSTIN format" in resp.json()["detail"]


def test_gst_lookup_unconfigured_key_returns_503(client, staff_headers):
    """When GSTINAPI_KEY is None or empty, returns 503 with clear message without crashing."""
    with patch.object(settings, "GSTINAPI_KEY", None):
        resp = client.get("/api/v1/gst/lookup?gstin=27AAPFU0939F1ZV", headers=staff_headers)
        assert resp.status_code == 503
        assert resp.json()["detail"] == "GST lookup not configured, enter details manually"


def test_gst_lookup_success_and_caching(client, staff_headers):
    """When GSTINAPI_KEY is configured and external API succeeds, returns details and caches result."""
    valid_gst = "27AAPFU0939F1ZV"
    _gst_cache.clear()

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "success": True,
        "gstin": valid_gst,
        "credits_remaining": 490,
        "response_ms": 120,
        "data": {
            "gstin": valid_gst,
            "legal_name": "Acme Industrial Logistics Ltd",
            "trade_name": "Acme Logistics",
            "status": "Active",
            "state_code": "27",
            "address": "Plot 42, MIDC Industrial Area, Andheri East, Mumbai, 400093",
            "address_details": {
                "building_number": "Plot 42",
                "street": "MIDC Industrial Area",
                "locality": "Andheri East",
                "pincode": "400093",
                "state": "Maharashtra",
            },
        },
    }

    mock_client_instance = MagicMock()
    mock_client_instance.__enter__.return_value.get.return_value = mock_response

    with patch.object(settings, "GSTINAPI_KEY", "mock_key_secret_123"):
        with patch("app.api.v1.gst.httpx.Client", return_value=mock_client_instance):
            resp = client.get(f"/api/v1/gst/lookup?gstin={valid_gst}", headers=staff_headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["gstin"] == valid_gst
            assert data["legal_name"] == "Acme Industrial Logistics Ltd"
            assert data["trade_name"] == "Acme Logistics"
            assert "Andheri East" in data["address"]
            assert data["state"] == "Maharashtra"
            assert data["gst_status"] == "Active"

            # Verify external GET call was made with x-api-key header
            get_mock = mock_client_instance.__enter__.return_value.get
            assert get_mock.call_count == 1
            call_url = get_mock.call_args[0][0]
            call_headers = get_mock.call_args[1].get("headers", {})
            assert f"/v1/gstin/{valid_gst}" in call_url
            assert call_headers.get("x-api-key") == "mock_key_secret_123"

            # Second call should hit the in-memory cache and not make another HTTP call
            cached_resp = client.get(f"/api/v1/gst/lookup?gstin={valid_gst}", headers=staff_headers)
            assert cached_resp.status_code == 200
            assert cached_resp.json()["legal_name"] == "Acme Industrial Logistics Ltd"
            assert get_mock.call_count == 1  # Still 1


def test_gst_lookup_not_found(client, staff_headers):
    """When GSTIN does not exist, returns 404 with graceful fallback message."""
    valid_gst = "27AAPFU0939F1ZV"
    _gst_cache.clear()

    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.json.return_value = {"success": False, "error": "GSTIN not found"}

    mock_client_instance = MagicMock()
    mock_client_instance.__enter__.return_value.get.return_value = mock_response

    with patch.object(settings, "GSTINAPI_KEY", "mock_key_secret_123"):
        with patch("app.api.v1.gst.httpx.Client", return_value=mock_client_instance):
            resp = client.get(f"/api/v1/gst/lookup?gstin={valid_gst}", headers=staff_headers)
            assert resp.status_code == 404
            assert resp.json()["detail"] == "Couldn't fetch GST details, please enter manually"
