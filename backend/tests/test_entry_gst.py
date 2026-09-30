import uuid
from decimal import Decimal
import pytest


def test_entry_gst_calculations_and_party(client, staff_headers):
    unique = uuid.uuid4().hex[:6]
    challan = f"CH-GST-{unique}"

    # 1. Entry with no GST
    resp_no_gst = client.post(
        "/api/v1/entries",
        json={
            "challan_no": f"{challan}-1",
            "vehicle_no": "MH12AB1234",
            "product": "Product A",
            "destination": "Pune, Maharashtra",
            "party_name": "Tata Motors",
            "quantity": "10.00",
            "unit_price": "100.00",
            "gst_type": "none",
        },
        headers=staff_headers,
    )
    assert resp_no_gst.status_code == 201
    d1 = resp_no_gst.json()
    assert d1["party_name"] == "Tata Motors"
    assert d1["subtotal"] == "1000.00"
    assert d1["gst_type"] == "none"
    assert d1["gst_rate"] is None
    assert d1["gst_amount"] == "0.00"
    assert d1["total_price"] == "1000.00"

    # 2. Entry with CGST+SGST (18%)
    resp_gst = client.post(
        "/api/v1/entries",
        json={
            "challan_no": f"{challan}-2",
            "vehicle_no": "MH12AB1234",
            "product": "Product B",
            "destination": "Mumbai, Maharashtra",
            "party_name": "Reliance Retail",
            "quantity": "20.00",
            "unit_price": "250.00",
            "gst_type": "cgst_sgst",
            "gst_rate": "18.00",
        },
        headers=staff_headers,
    )
    assert resp_gst.status_code == 201
    d2 = resp_gst.json()
    assert d2["party_name"] == "Reliance Retail"
    assert d2["subtotal"] == "5000.00"
    assert d2["gst_type"] == "cgst_sgst"
    assert d2["gst_rate"] == "18.00"
    assert d2["gst_amount"] == "900.00"
    assert d2["total_price"] == "5900.00"
    entry_id = d2["id"]

    # 3. Update entry: change quantity and GST rate to IGST (12%)
    patch_resp = client.patch(
        f"/api/v1/entries/{entry_id}",
        json={
            "quantity": "10.00",
            "gst_type": "igst",
            "gst_rate": "12.00",
        },
        headers=staff_headers,
    )
    assert patch_resp.status_code == 200
    d3 = patch_resp.json()
    # 10 * 250 = 2500, 12% of 2500 = 300, total = 2800
    assert d3["subtotal"] == "2500.00"
    assert d3["gst_type"] == "igst"
    assert d3["gst_rate"] == "12.00"
    assert d3["gst_amount"] == "300.00"
    assert d3["total_price"] == "2800.00"

    # 4. Search entries by party_name
    search_resp = client.get(
        f"/api/v1/entries?q=Tata Motors",
        headers=staff_headers,
    )
    assert search_resp.status_code == 200
    found = [item for item in search_resp.json()["items"] if item["challan_no"] == f"{challan}-1"]
    assert len(found) == 1
