import httpx
import io
import openpyxl

BASE_URL = "http://localhost:8000/api/v1"

def run_phase7_verification():
    print("=== Starting Phase 7 Live Verification ===")

    # 1. Admin Login
    print("\n1. Admin Login...")
    admin_login = httpx.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@challango.in",
        "password": "Admin@123456"
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  -> Admin Login SUCCESS.")

    # 2. Download Import Template
    print("\n2. Testing GET /entries/import/template...")
    template_resp = httpx.get(f"{BASE_URL}/entries/import/template", headers=admin_headers)
    assert template_resp.status_code == 200
    assert "spreadsheet" in template_resp.headers.get("content-type", "") or "octet-stream" in template_resp.headers.get("content-type", "")
    wb_template = openpyxl.load_workbook(io.BytesIO(template_resp.content))
    ws_template = wb_template.active
    headers = [cell.value for cell in ws_template[1]]
    print(f"  -> Template headers verified: {headers}")
    expected_headers = ["Serial No", "Challan No", "Vehicle No", "Product", "Quantity", "Unit Price", "Total Price"]
    assert headers == expected_headers

    # 3. Create a Test Import Excel File with:
    #    - Row 1: Valid new entry
    #    - Row 2: Warning entry (warning format vehicle no, total price mismatch)
    #    - Row 3: In-file duplicate of Row 1
    #    - Row 4: Error entry (invalid quantity)
    print("\n3. Generating test spreadsheet with good, bad, and duplicate rows...")
    import uuid
    run_tag = uuid.uuid4().hex[:6].upper()
    sn1 = f"SN-{run_tag}-01"
    ch1 = f"CH-{run_tag}-01"
    sn2 = f"SN-{run_tag}-02"
    ch2 = f"CH-{run_tag}-02"
    sn4 = f"SN-{run_tag}-04"
    ch4 = f"CH-{run_tag}-04"

    test_wb = openpyxl.Workbook()
    test_ws = test_wb.active
    test_ws.title = "Delivery Entries"
    test_ws.append(expected_headers)
    
    # Row 1: OK
    test_ws.append([sn1, ch1, "DL01AB1111", "UltraTech Cement 50kg", 100, 380.00, 38000.00])
    # Row 2: Warning (vehicle format unusual, total price mismatch)
    test_ws.append([sn2, ch2, "TEMP9999", "Tata Tiscon TMT 12mm", 50, 500.00, 20000.00])
    # Row 3: In-file duplicate of Row 1 (same serial_no + challan_no)
    test_ws.append([sn1, ch1, "DL01AB1111", "UltraTech Cement 50kg", 100, 380.00, 38000.00])
    # Row 4: Error (non-numeric quantity)
    test_ws.append([sn4, ch4, "HR26DK8888", "Asian Paints Apex 20L", "invalid_qty", 4500.00, 0])

    test_file_bytes = io.BytesIO()
    test_wb.save(test_file_bytes)
    test_file_bytes.seek(0)
    print("  -> Test Excel file generated (4 data rows).")

    # 4. Upload to Preview Endpoint
    print("\n4. Testing POST /entries/import/preview...")
    preview_resp = httpx.post(
        f"{BASE_URL}/entries/import/preview",
        headers=admin_headers,
        files={"file": ("test_import_p7.xlsx", test_file_bytes.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert preview_resp.status_code == 200, f"Preview failed: {preview_resp.text}"
    preview_data = preview_resp.json()
    preview_id = preview_data["preview_id"]
    print(f"  -> Preview ID generated: {preview_id}")
    print(f"  -> Total rows: {preview_data['total_rows']}")
    print(f"  -> OK rows: {preview_data['ok_count']}")
    print(f"  -> Warning rows: {preview_data['warning_count']}")
    print(f"  -> Duplicate rows: {preview_data['duplicate_count']}")
    print(f"  -> Error rows: {preview_data['error_count']}")

    assert preview_data["total_rows"] == 4
    assert preview_data["error_count"] >= 2  # In-file duplicate + non-numeric quantity
    assert preview_data["ok_count"] >= 1  # Row 1 is OK
    assert preview_data["warning_count"] >= 1  # Row 2 has warnings

    # Check row statuses
    row_statuses = {r["row_number"]: (r["status"], r["messages"]) for r in preview_data["rows"]}
    print(f"  -> Row 2 status: {row_statuses[2][0]} (OK)")
    print(f"  -> Row 3 status: {row_statuses[3][0]} (Messages: {row_statuses[3][1]})")
    print(f"  -> Row 4 status: {row_statuses[4][0]} (Messages: {row_statuses[4][1]})")
    print(f"  -> Row 5 status: {row_statuses[5][0]} (Messages: {row_statuses[5][1]})")
    assert row_statuses[2][0] == "ok"
    assert row_statuses[3][0] == "warning"
    assert row_statuses[4][0] == "error"
    assert row_statuses[5][0] == "error"
    print("  -> Per-row statuses verified successfully.")

    # 5. Commit Import with duplicate_strategy='skip'
    print("\n5. Testing POST /entries/import/commit (strategy='skip')...")
    commit_resp = httpx.post(
        f"{BASE_URL}/entries/import/commit",
        headers=admin_headers,
        json={"preview_id": preview_id, "duplicate_strategy": "skip"}
    )
    assert commit_resp.status_code == 200, f"Commit failed: {commit_resp.text}"
    commit_data = commit_resp.json()
    print(f"  -> Commit result: {commit_data}")
    # Rows 2 and 3 should be inserted (2 valid/warning rows)
    assert commit_data["inserted"] == 2
    assert commit_data["failed"] >= 2
    print("  -> Import commit verification SUCCESS.")

    # 6. Verify inserted records in database
    print("\n6. Verifying imported records in /entries...")
    verify_resp = httpx.get(f"{BASE_URL}/entries?q={ch1}", headers=admin_headers).json()
    assert verify_resp["total_count"] == 1
    imported_row = verify_resp["items"][0]
    assert imported_row["serial_no"] == sn1
    assert float(imported_row["total_price"]) == 38000.00
    print(f"  -> Verified entry in DB: Challan={imported_row['challan_no']}, Total={imported_row['total_price']}")

    # 7. Test User Management: Create User as Admin
    print("\n7. Testing POST /users (Admin creates staff user)...")
    import uuid
    test_user_email = f"priya.{uuid.uuid4().hex[:6]}@challango.in"
    create_user_resp = httpx.post(
        f"{BASE_URL}/users",
        headers=admin_headers,
        json={
            "name": "Priya Operator",
            "email": test_user_email,
            "password": "Password@123",
            "role": "staff"
        }
    )
    assert create_user_resp.status_code == 201, f"User creation failed: {create_user_resp.text}"
    created_user = create_user_resp.json()
    new_user_id = created_user["id"]
    print(f"  -> Created user: ID={new_user_id}, Name={created_user['name']}, Role={created_user['role']}")

    # 8. Verify New User can Login
    print("\n8. Testing New User Login...")
    user_login = httpx.post(f"{BASE_URL}/auth/login", json={
        "email": test_user_email,
        "password": "Password@123"
    })
    assert user_login.status_code == 200
    new_user_token = user_login.json()["access_token"]
    print("  -> New user login SUCCESS.")

    # 9. Admin Deactivates the User
    print("\n9. Testing PATCH /users/{id}/deactivate (Admin deactivates user)...")
    deact_resp = httpx.patch(f"{BASE_URL}/users/{new_user_id}/deactivate", headers=admin_headers)
    assert deact_resp.status_code == 200
    deact_data = deact_resp.json()
    assert deact_data["is_active"] is False
    print(f"  -> User ID {new_user_id} is_active: {deact_data['is_active']}")

    # 10. Verify Deactivated User Login is Rejected
    print("\n10. Testing Deactivated User Login is rejected...")
    deact_login = httpx.post(f"{BASE_URL}/auth/login", json={
        "email": test_user_email,
        "password": "Password@123"
    })
    assert deact_login.status_code == 401
    assert "deactivated" in deact_login.json()["detail"].lower()
    print("  -> Deactivated user login rejected with 401 ('User account is deactivated').")

    # 11. Test Audit Logs
    print("\n11. Testing GET /audit-logs...")
    audit_resp = httpx.get(f"{BASE_URL}/audit-logs?page=1&page_size=10", headers=admin_headers)
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    print(f"  -> Audit logs retrieved: {audit_data['total_count']} total entries")
    assert audit_data["total_count"] > 0
    actions = [item["action"] for item in audit_data["items"]]
    print(f"  -> Recent audit actions: {actions[:5]}")
    assert "import" in actions or "create" in actions

    # 12. Clean up test entries so DB remains clean
    print("\n12. Cleaning up test entries...")
    row1 = httpx.get(f"{BASE_URL}/entries?q={ch1}", headers=admin_headers).json()["items"]
    if row1:
        httpx.delete(f"{BASE_URL}/entries/{row1[0]['id']}", headers=admin_headers)
    row2 = httpx.get(f"{BASE_URL}/entries?q={ch2}", headers=admin_headers).json()["items"]
    if row2:
        httpx.delete(f"{BASE_URL}/entries/{row2[0]['id']}", headers=admin_headers)
    print("  -> Test records cleaned up successfully.")

    print("\n=== ALL 12 PHASE 7 LIVE VERIFICATIONS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_phase7_verification()
