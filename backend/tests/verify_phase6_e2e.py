import httpx
import io
import pandas as pd

BASE_URL = "http://localhost:8000/api/v1"

def run_e2e_verification():
    print("=== Starting Phase 6 End-to-End Live Verification ===")
    
    # 1. Login as Admin
    print("\n1. Testing Login as Admin...")
    login_resp = httpx.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@challango.in",
        "password": "Admin@123456"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    admin_token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  -> Admin Login SUCCESS. Token received.")

    # 2. Verify /auth/me
    print("\n2. Testing /auth/me...")
    me_resp = httpx.get(f"{BASE_URL}/auth/me", headers=admin_headers)
    assert me_resp.status_code == 200
    user_data = me_resp.json()
    assert user_data["role"] == "admin"
    assert "password_hash" not in user_data
    print(f"  -> Verified user: {user_data['name']} ({user_data['role']})")

    # 3. List seeded entries
    print("\n3. Testing Entries List and Summary...")
    list_resp = httpx.get(f"{BASE_URL}/entries?page=1&page_size=10", headers=admin_headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    print(f"  -> Total seeded entries: {list_data['total_count']}, Page: {list_data['page']}/{list_data['total_pages']}")
    assert len(list_data["items"]) == 10

    summary_resp = httpx.get(f"{BASE_URL}/entries/summary", headers=admin_headers)
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()
    print(f"  -> Summary: count={summary_data['count']}, sum_quantity={summary_data['sum_quantity']}, sum_total_price={summary_data['sum_total_price']}")
    assert summary_data["count"] == list_data["total_count"]

    # 4. Create New Entry
    print("\n4. Testing Create Entry (with vehicle normalization and auto total_price)...")
    create_payload = {
        "serial_no": "E2E-LIVE-01",
        "challan_no": "CH-2026-LIVE",
        "vehicle_no": "dl 04 ab 9999",
        "product": "TMT Steel Rods Fe550",
        "quantity": "50.00",
        "unit_price": "400.00"
    }
    create_resp = httpx.post(f"{BASE_URL}/entries", json=create_payload, headers=admin_headers)
    assert create_resp.status_code == 201, f"Create failed: {create_resp.text}"
    created_entry = create_resp.json()
    created_id = created_entry["id"]
    print(f"  -> Created Entry ID: {created_id}")
    print(f"  -> Vehicle No normalized: '{created_entry['vehicle_no']}' (DL04AB9999)")
    print(f"  -> Computed Total Price: {created_entry['total_price']} (Expected: 20000.00)")
    assert created_entry["vehicle_no"] == "DL04AB9999"
    assert float(created_entry["total_price"]) == 20000.00

    # 5. Search for the entry
    print("\n5. Testing Filtered Search by Challan No...")
    search_resp = httpx.get(f"{BASE_URL}/entries?q=CH-2026-LIVE", headers=admin_headers)
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert search_data["total_count"] == 1
    assert search_data["items"][0]["id"] == created_id
    print("  -> Search matches 1 row exactly.")

    # 6. Edit the entry (Update quantity to 60)
    print("\n6. Testing Edit Entry (Quantity 50 -> 60)...")
    update_resp = httpx.patch(f"{BASE_URL}/entries/{created_id}", json={
        "quantity": "60.00"
    }, headers=admin_headers)
    assert update_resp.status_code == 200
    updated_entry = update_resp.json()
    print(f"  -> Recomputed Total Price: {updated_entry['total_price']} (Expected: 24000.00)")
    assert float(updated_entry["total_price"]) == 24000.00

    # 7. Summary with filter
    print("\n7. Testing Summary for filtered search...")
    filtered_summary = httpx.get(f"{BASE_URL}/entries/summary?q=CH-2026-LIVE", headers=admin_headers).json()
    assert filtered_summary["count"] == 1
    assert float(filtered_summary["sum_total_price"]) == 24000.00
    print(f"  -> Filtered summary matched: count=1, sum={filtered_summary['sum_total_price']}")

    # 8. Export filtered search to CSV
    print("\n8. Testing Export CSV for filtered search...")
    csv_resp = httpx.get(f"{BASE_URL}/entries/export?format=csv&q=CH-2026-LIVE", headers=admin_headers)
    assert csv_resp.status_code == 200
    csv_text = csv_resp.text
    csv_lines = [line for line in csv_text.strip().split("\n") if line]
    print(f"  -> CSV exported lines count: {len(csv_lines)} (1 header + 1 data row)")
    assert len(csv_lines) == 2
    assert "CH-2026-LIVE" in csv_lines[1]
    assert "24000.00" in csv_lines[1]
    print("  -> CSV Export verification SUCCESS.")

    # 9. Export filtered search to XLSX
    print("\n9. Testing Export XLSX for filtered search...")
    xlsx_resp = httpx.get(f"{BASE_URL}/entries/export?format=xlsx&q=CH-2026-LIVE", headers=admin_headers)
    assert xlsx_resp.status_code == 200
    df = pd.read_excel(io.BytesIO(xlsx_resp.content))
    print(f"  -> XLSX exported rows: {len(df)}")
    assert len(df) == 1
    assert df.iloc[0]["Challan No"] == "CH-2026-LIVE"
    assert float(df.iloc[0]["Total Price"]) == 24000.00
    print("  -> XLSX Export verification SUCCESS.")

    # 10. Test Staff Permission Guard on Delete
    print("\n10. Testing Staff Role Permission Guard on Delete...")
    staff_login = httpx.post(f"{BASE_URL}/auth/login", json={
        "email": "staff@challango.in",
        "password": "Staff@123456"
    }).json()
    staff_headers = {"Authorization": f"Bearer {staff_login['access_token']}"}
    staff_del_resp = httpx.delete(f"{BASE_URL}/entries/{created_id}", headers=staff_headers)
    assert staff_del_resp.status_code == 403, f"Expected 403 for staff delete, got {staff_del_resp.status_code}"
    print("  -> Staff delete correctly rejected with HTTP 403 Forbidden.")

    # 11. Admin Deletes the entry
    print("\n11. Testing Admin Soft-Delete...")
    del_resp = httpx.delete(f"{BASE_URL}/entries/{created_id}", headers=admin_headers)
    assert del_resp.status_code == 200
    print("  -> Entry soft-deleted successfully.")

    # 12. Confirm entry no longer appears in queries
    verify_del = httpx.get(f"{BASE_URL}/entries?q=CH-2026-LIVE", headers=admin_headers).json()
    assert verify_del["total_count"] == 0
    print("  -> Verified 0 entries match deleted challan. Soft-delete confirmed.")

    print("\n=== ALL 12 END-TO-END VERIFICATIONS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_e2e_verification()
