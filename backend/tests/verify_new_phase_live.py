import io
import csv
import httpx
import openpyxl

BASE_URL = "http://localhost:8000/api/v1"

def run_live_verification():
    print("=== STARTING LIVE VERIFICATION OF NEW PHASE ===")

    # 1. Login as admin
    print("\n[Step 1] Logging in as admin...")
    with httpx.Client(base_url=BASE_URL, timeout=15.0) as client:
        login_res = client.post("/auth/login", json={"email": "admin@challango.in", "password": "Admin@123456"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("  ✓ Admin logged in successfully")

        # 2. Add a product to the catalog
        print("\n[Step 2] Adding a product to the catalog...")
        test_product_name = f"Reinforced Steel Angle {openpyxl.__name__[:3].upper()}"
        prod_res = client.post(
            "/products",
            json={"name": test_product_name, "default_unit_price": 540.00},
            headers=headers,
        )
        if prod_res.status_code == 409:
            # Already exists from previous run, get it
            get_res = client.get(f"/products?search={test_product_name}", headers=headers)
            test_product = get_res.json()[0]
            print(f"  ✓ Product '{test_product_name}' already in catalog with price {test_product['default_unit_price']}")
        else:
            assert prod_res.status_code == 201, f"Product create failed: {prod_res.text}"
            test_product = prod_res.json()
            print(f"  ✓ Created product '{test_product['name']}' with default unit price Rs. {test_product['default_unit_price']}")

        # 3. Test duplicate product rejected (case-insensitive)
        print("\n[Step 3] Verifying duplicate product name rejection (case-insensitive)...")
        dup_res = client.post(
            "/products",
            json={"name": test_product_name.lower(), "default_unit_price": 600.00},
            headers=headers,
        )
        assert dup_res.status_code == 409, f"Expected 409 duplicate conflict, got: {dup_res.status_code}"
        print(f"  ✓ Duplicate rejected with 409: {dup_res.json()['detail']}")

        # 4. Destination place search
        print("\n[Step 4] Searching places for destination autocomplete...")
        place_res = client.get("/places/search?q=Bengaluru", headers=headers)
        assert place_res.status_code == 200, f"Places search failed: {place_res.text}"
        places = place_res.json()
        print(f"  ✓ Found {len(places)} places for query 'Bengaluru'")
        if places:
            first_place = places[0]
            print(f"    Suggestion: {first_place['display_name'][:60]}... (Lat: {first_place['lat']}, Lon: {first_place['lon']})")

        # 5. Create entry with product + price override + suggestion coordinates
        print("\n[Step 5] Creating entry selecting catalog product with price override and suggested place coordinates...")
        import uuid
        unique_suffix = uuid.uuid4().hex[:6].upper()
        entry_payload_1 = {
            "serial_no": f"VER-{unique_suffix}-1",
            "challan_no": f"CH-VER-{unique_suffix}-1",
            "vehicle_no": "KA 01 AB 9999",
            "product": test_product["name"],
            "destination": places[0]["display_name"] if places else "Bengaluru, Karnataka, India",
            "destination_lat": float(places[0]["lat"]) if places else 12.9716,
            "destination_lng": float(places[0]["lon"]) if places else 77.5946,
            "quantity": 25.0,
            "unit_price": 575.50,  # Overridden from 540.00!
        }
        create_res_1 = client.post("/entries", json=entry_payload_1, headers=headers)
        assert create_res_1.status_code == 201, f"Create entry failed: {create_res_1.text}"
        e1 = create_res_1.json()
        print(f"  ✓ Created entry #{e1['id']}: Product='{e1['product']}', Unit Price={e1['unit_price']} (catalog price was {test_product['default_unit_price']})")
        print(f"    Destination='{e1['destination'][:50]}...', Coordinates=({e1['destination_lat']}, {e1['destination_lng']})")
        print(f"    Computed Total Price={e1['total_price']} (25 * 575.50 = 14387.50)")
        assert float(e1["total_price"]) == 14387.50

        # 6. Create entry with free-text (non-suggested) destination (null coordinates)
        print("\n[Step 6] Creating entry with custom typed free-text destination (null coordinates)...")
        entry_payload_2 = {
            "serial_no": f"VER-{unique_suffix}-2",
            "challan_no": f"CH-VER-{unique_suffix}-2",
            "vehicle_no": "MH 12 CD 4321",
            "product": "Custom Unlisted Cement Bags 50kg",
            "destination": "Godown #4B, Turbhe MIDC, Navi Mumbai",  # Free-text site
            "destination_lat": None,
            "destination_lng": None,
            "quantity": 100.0,
            "unit_price": 380.00,
        }
        create_res_2 = client.post("/entries", json=entry_payload_2, headers=headers)
        assert create_res_2.status_code == 201, f"Create entry failed: {create_res_2.text}"
        e2 = create_res_2.json()
        print(f"  ✓ Created entry #{e2['id']}: Destination='{e2['destination']}', Lat={e2['destination_lat']}, Lng={e2['destination_lng']}")
        assert e2["destination_lat"] is None and e2["destination_lng"] is None

        # 7. Export XLSX and CSV and verify Destination column position
        print("\n[Step 7] Exporting XLSX and verifying Destination column order...")
        xlsx_res = client.get(f"/entries/export?format=xlsx&q=VER-{unique_suffix}", headers=headers)
        assert xlsx_res.status_code == 200, f"Export xlsx failed: {xlsx_res.status_code}"
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_res.content))
        ws = wb.active
        headers_row = [cell.value for cell in ws[1]]
        print(f"  ✓ XLSX Header row: {headers_row}")
        expected_headers = [
            "Serial No", "Challan No", "Vehicle No", "Product", "Destination",
            "Quantity", "Unit Price", "Total Price", "Created At"
        ]
        assert headers_row == expected_headers, f"Expected {expected_headers}, got {headers_row}"
        assert headers_row[4] == "Destination", "Destination must be at index 4 (after Product, before Quantity)"
        row2 = [cell.value for cell in ws[2]]
        print(f"  ✓ XLSX Data row: {row2}")

        print("\n[Step 8] Exporting CSV and verifying Destination column...")
        csv_res = client.get(f"/entries/export?format=csv&q=VER-{unique_suffix}", headers=headers)
        assert csv_res.status_code == 200, f"Export csv failed: {csv_res.status_code}"
        csv_reader = csv.reader(io.StringIO(csv_res.text))
        csv_headers = [h.lstrip("\ufeff") for h in next(csv_reader)]
        assert csv_headers == expected_headers, f"CSV headers mismatch: {csv_headers}"
        print(f"  ✓ CSV Header row: {csv_headers}")

        # 8. User deletion tests: fresh user vs user with history
        print("\n[Step 9] Testing Hard Delete on fresh unused user...")
        user_suffix = uuid.uuid4().hex[:5]
        fresh_user_res = client.post(
            "/users",
            json={
                "name": f"Fresh Unused User {user_suffix}",
                "email": f"unused_{user_suffix}@challango.in",
                "password": "Password123!",
                "role": "staff",
            },
            headers=headers,
        )
        assert fresh_user_res.status_code == 201
        fresh_user = fresh_user_res.json()
        print(f"  ✓ Created fresh unused user #{fresh_user['id']} ({fresh_user['email']})")

        # Hard delete the fresh unused user
        del_res = client.delete(f"/users/{fresh_user['id']}", headers=headers)
        assert del_res.status_code == 200, f"Delete failed: {del_res.text}"
        print(f"  ✓ Fresh unused user deleted successfully: {del_res.json()['detail']}")

        # Confirm user is completely gone (404)
        users_list = client.get("/users?limit=100", headers=headers).json()
        assert not any(u["id"] == fresh_user["id"] for u in users_list["items"])
        print(f"  ✓ Confirmed fresh user #{fresh_user['id']} was removed from database")

        print("\n[Step 10] Testing Hard Delete on user WITH history (expect 409 Conflict)...")
        # Attempt to delete the user who created entry e1 (admin user)
        # Or let's create a staff user, create an entry with that staff user, then try to delete them
        staff_res = client.post(
            "/users",
            json={
                "name": f"Staff With History {user_suffix}",
                "email": f"staff_hist_{user_suffix}@challango.in",
                "password": "Password123!",
                "role": "staff",
            },
            headers=headers,
        )
        assert staff_res.status_code == 201
        staff_user = staff_res.json()

        # Login as staff and create an entry
        staff_login = client.post(
            "/auth/login",
            json={"email": staff_user["email"], "password": "Password123!"}
        )
        staff_token = staff_login.json()["access_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}

        staff_entry = client.post(
            "/entries",
            json={
                "serial_no": f"STF-{user_suffix}",
                "challan_no": f"CH-STF-{user_suffix}",
                "vehicle_no": "DL 04 EF 5555",
                "product": "Steel Rebars 10mm",
                "destination": "New Delhi Okhla Industrial Area",
                "quantity": 10.0,
                "unit_price": 400.0,
            },
            headers=staff_headers,
        )
        assert staff_entry.status_code == 201, f"Staff entry creation failed: {staff_entry.text}"
        print(f"  ✓ Staff user #{staff_user['id']} created an entry #{staff_entry.json()['id']}")

        # Now admin attempts to hard-delete this staff user with history
        del_conflict_res = client.delete(f"/users/{staff_user['id']}", headers=headers)
        assert del_conflict_res.status_code == 409, f"Expected 409 conflict, got: {del_conflict_res.status_code}"
        expected_msg = "This user has existing records and cannot be permanently deleted. Deactivate them instead."
        assert del_conflict_res.json()["detail"] == expected_msg
        print(f"  ✓ Hard delete rejected with 409 Conflict!")
        print(f"    Backend detail message: \"{del_conflict_res.json()['detail']}\"")

        # Confirm staff user still exists
        check_user = client.get(f"/users?limit=100", headers=headers).json()
        assert any(u["id"] == staff_user["id"] for u in check_user["items"])
        print(f"  ✓ Confirmed user #{staff_user['id']} still exists in the database")

        # Deactivate them instead
        deact_res = client.patch(f"/users/{staff_user['id']}/deactivate", headers=headers)
        assert deact_res.status_code == 200
        print(f"  ✓ User deactivated instead successfully (is_active={deact_res.json()['is_active']})")

    print("\n=== ALL LIVE VERIFICATION CHECKS PASSED PERFECTLY ===")

if __name__ == "__main__":
    run_live_verification()
