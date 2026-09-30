
import io
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import openpyxl
import pandas as pd
import pytest

from app.models.entry import Entry
from app.models.audit_log import AuditLog, AuditAction
from app.models.import_preview import ImportPreview


def _create_test_xlsx_bytes(headers, rows):
    """Helper to create an in-memory .xlsx file."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def _create_test_csv_bytes(headers, rows):
    """Helper to create an in-memory .csv file."""
    df = pd.DataFrame(rows, columns=headers)
    output = io.BytesIO()
    df.to_csv(output, index=False)
    output.seek(0)
    return output.getvalue()


STANDARD_HEADERS = [
    "Challan No",
    "Vehicle No",
    "Product",
    "Destination",
    "Quantity",
    "Unit Price",
    "Total Price",
]

TEMPLATE_HEADERS = [
    "Challan No",
    "Vehicle No",
    "Party",
    "Product",
    "Destination",
    "Quantity",
    "Unit Price",
    "Subtotal",
    "GST Type",
    "GST Rate (%)",
    "GST Amount",
    "Total Price",
]


def test_import_template_headers_and_example_row(client, staff_headers):
    """Template download has correct headers in correct order and includes example row."""
    response = client.get("/api/v1/entries/import/template", headers=staff_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert 'filename="challan_import_template.xlsx"' in response.headers["content-disposition"]

    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    ws = wb.active

    # Freeze panes
    assert ws.freeze_panes == "A2"

    # Header check
    headers = [ws.cell(1, col).value for col in range(1, 13)]
    assert headers == TEMPLATE_HEADERS

    # Example row check
    assert ws.cell(2, 1).value == "CH1001"
    assert ws.cell(2, 2).value == "DL01AB1234"
    assert ws.cell(2, 3).value == "Acme Enterprises"
    assert ws.cell(2, 1).font.italic is True
    # Comment on A2
    assert ws.cell(2, 1).comment is not None
    assert "delete or overwrite" in ws.cell(2, 1).comment.text.lower()


def test_import_csv_template_headers_and_example(client, staff_headers):
    """CSV template download has correct headers and example row."""
    response = client.get("/api/v1/entries/import/template?format=csv", headers=staff_headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert 'filename="challan_import_template.csv"' in response.headers["content-disposition"]
    lines = response.text.strip().split("\r\n" if "\r\n" in response.text else "\n")
    assert lines[0] == ",".join(TEMPLATE_HEADERS)
    assert "WEST INDUSTRIES" in lines[1]


def test_preview_valid_file_all_ok(client, staff_headers):
    """Valid file with clean rows returns status 'ok' for every row and accurate counts."""
    u = uuid.uuid4().hex[:6]
    rows = [
        [f"CH-VAL-{u}-1", "DL01AB1234", "Steel Rods", "Mumbai, Maharashtra", "10", "500.00", "5000.00"],
        [f"CH-VAL-{u}-1", "DL01AB1234", "Cement Bags", "Pune, Maharashtra", "20", "350.00", "7000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("test_valid.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_rows"] == 2
    assert data["ok_count"] == 2
    assert data["warning_count"] == 0
    assert data["duplicate_count"] == 0
    assert data["error_count"] == 0
    assert len(data["rows"]) == 2
    assert data["rows"][0]["status"] == "ok"
    assert data["rows"][1]["status"] == "ok"
    assert "preview_id" in data


def test_preview_missing_required_header_fails_immediately(client, staff_headers):
    """Missing a required header fails with 400 listing the missing header with no row processing."""
    # Missing 'Unit Price'
    bad_headers = ["Challan No", "Vehicle No", "Product", "Destination", "Quantity"]
    rows = [["CH-1", "DL01AB1234", "Pipes", "Delhi NCR", "10"]]
    file_bytes = _create_test_xlsx_bytes(bad_headers, rows)

    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("missing_header.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 400
    assert "Missing required columns" in response.json()["detail"]
    assert "Unit Price" in response.json()["detail"]


def test_preview_non_numeric_quantity_marked_error(client, staff_headers):
    """Row with non-numeric quantity gets status 'error' with clear message."""
    u = uuid.uuid4().hex[:6]
    rows = [
        [f"CH-NUM-{u}", "DL01AB1234", "Bricks", "Delhi NCR", "NOT_A_NUMBER", "100.00", "1000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("bad_qty.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["error_count"] == 1
    assert data["rows"][0]["status"] == "error"
    assert any("Quantity is not a valid number" in m for m in data["rows"][0]["messages"])


def test_preview_total_price_mismatch_marked_warning(client, staff_headers):
    """Row with Total Price mismatching Quantity x Unit Price gets status 'warning' not error."""
    u = uuid.uuid4().hex[:6]
    # 10 * 500 = 5000, but file says 9999.00
    rows = [
        [f"CH-MIS-{u}", "DL01AB1234", "Granite", "Ahmedabad, Gujarat", "10", "500.00", "9999.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("mismatch.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["error_count"] == 0
    assert data["warning_count"] == 1
    assert data["rows"][0]["status"] == "warning"
    assert any("Total Price does not match" in m for m in data["rows"][0]["messages"])
    # Computed total is 5000.00
    assert data["rows"][0]["data"]["total_price"] == "5000.00"


def test_preview_in_file_duplicate_marked_error_on_second_occurrence(client, staff_headers):
    """Two rows in the same file with same (Challan No, Product) -> first ok, second error."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-DUPFILE-{u}"
    rows = [
        [challan, "DL01AB1234", "Tiles", "Jaipur, Rajasthan", "10", "200.00", "2000.00"],
        [challan, "DL01AB1234", "Tiles", "Jaipur, Rajasthan", "15", "200.00", "3000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("in_file_dup.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rows"][0]["status"] == "ok"
    assert data["rows"][1]["status"] == "error"
    assert any("previously seen on row 2" in m for m in data["rows"][1]["messages"])


def test_preview_db_duplicate_marked_duplicate(client, staff_headers):
    """Row matching existing DB entry gets status 'duplicate'."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-DBEXIST-{u}"
    # 1. Create entry in DB first
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "challan_no": challan,
            "vehicle_no": "DL01AB1234",
            "product": "Original DB Product",
            "destination": "Kolkata, West Bengal",
            "quantity": "5.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )
    assert create_resp.status_code == 201

    # 2. Upload file with same challan + product
    rows = [
        [challan, "DL01AB1234", "Original DB Product", "Kolkata, West Bengal", "8.00", "120.00", "960.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("db_dup.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["duplicate_count"] == 1
    assert data["rows"][0]["status"] == "duplicate"
    assert any("Matches existing entry in database" in m for m in data["rows"][0]["messages"])


def test_preview_skips_blank_rows_silently(client, staff_headers):
    """Blank rows in the middle of file are skipped silently and not counted as errors."""
    u = uuid.uuid4().hex[:6]
    rows = [
        [f"CH-BLK-{u}-1", "DL01AB1234", "Product A", "Mumbai, Maharashtra", "10", "100.00", "1000.00"],
        ["", "", "", "", "", "", ""],  # Completely blank
        [f"CH-BLK-{u}-2", "DL01AB1234", "Product B", "Delhi NCR", "20", "200.00", "4000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("with_blank.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_rows"] == 2
    assert data["error_count"] == 0
    assert data["ok_count"] == 2


def test_preview_file_over_10000_rows_rejected_with_400(client, staff_headers):
    """File over 10,000 rows is rejected with 400 before heavy processing."""
    rows = [[f"CH-{i}", "DL01AB1234", f"Product-{i}", "City", "1", "10.00", "10.00"] for i in range(10005)]
    file_bytes = _create_test_csv_bytes(STANDARD_HEADERS, rows)

    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("too_many_rows.csv", file_bytes, "text/csv")},
        headers=staff_headers,
    )
    assert response.status_code == 400
    assert "over 10,000 rows" in response.json()["detail"]


def test_preview_file_over_10mb_rejected_with_400(client, staff_headers):
    """File over 10MB is rejected with 400."""
    # 10.5 MB of dummy data
    large_payload = b"x" * (10 * 1024 * 1024 + 100)
    response = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("large_file.csv", large_payload, "text/csv")},
        headers=staff_headers,
    )
    assert response.status_code == 400
    assert "exceeds maximum allowed limit of 10 MB" in response.json()["detail"]


def test_commit_strategy_skip(client, staff_headers, db):
    """Commit with strategy 'skip': duplicate rows are NOT modified, ok/warning rows ARE inserted, error rows NOT inserted."""
    u = uuid.uuid4().hex[:6]
    challan_exist = f"CH-SKIP-EX-{u}"
    challan_new = f"CH-SKIP-NEW-{u}"

    # 1. Existing entry
    existing_entry = Entry(
        challan_no=challan_exist,
        vehicle_no="DL01AB1234",
        product="Old Unchanged Product",
        destination="Delhi NCR",
        quantity=Decimal("10.00"),
        unit_price=Decimal("100.00"),
        total_price=Decimal("1000.00"),
        is_deleted=False,
    )
    db.add(existing_entry)
    db.commit()

    # 2. Preview file with 1 existing duplicate, 1 ok new row, 1 error row
    rows = [
        [challan_exist, "DL01AB1234", "Old Unchanged Product", "Delhi NCR", "99", "999.00", "98901.00"], # Duplicate
        [challan_new, "DL01AB1234", "New Valid Product", "Mumbai, Maharashtra", "5", "200.00", "1000.00"],       # OK
        [challan_new, "DL01AB1234", "Invalid Product", "Mumbai, Maharashtra", "-5", "200.00", "0.00"],          # Error
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    preview_resp = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("test_skip.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert preview_resp.status_code == 200
    preview_id = preview_resp.json()["preview_id"]

    # 3. Commit with strategy "skip"
    commit_resp = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": preview_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert commit_resp.status_code == 200
    res = commit_resp.json()
    assert res["inserted"] == 1
    assert res["skipped"] == 1
    assert res["failed"] == 1
    assert res["updated"] == 0

    # 4. Verify DB state: existing entry unchanged
    db.expire_all()
    reloaded = db.query(Entry).filter(Entry.challan_no == challan_exist).first()
    assert reloaded.product == "Old Unchanged Product"
    assert reloaded.quantity == Decimal("10.00")

    # New entry inserted
    new_db = db.query(Entry).filter(Entry.challan_no == challan_new, Entry.product == "New Valid Product").first()
    assert new_db is not None
    assert new_db.product == "New Valid Product"

    # Error row was not inserted
    err_db = db.query(Entry).filter(Entry.challan_no == challan_new, Entry.product == "Invalid Product").first()
    assert err_db is None


def test_commit_strategy_update(client, staff_headers, db):
    """Commit with strategy 'update': duplicate rows ARE updated with new values and total_price is recomputed."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-UPD-EX-{u}"

    # 1. Existing entry
    existing_entry = Entry(
        challan_no=challan,
        vehicle_no="DL01AB1234",
        product="Original Product",
        destination="Pune, Maharashtra",
        quantity=Decimal("10.00"),
        unit_price=Decimal("100.00"),
        total_price=Decimal("1000.00"),
        is_deleted=False,
    )
    db.add(existing_entry)
    db.commit()

    # 2. Preview file updating this row with new quantity and unit price
    rows = [
        [challan, "MH12DE9999", "Original Product", "Pune, Maharashtra", "20", "150.00", "3000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)
    preview_resp = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("test_update.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert preview_resp.status_code == 200
    preview_id = preview_resp.json()["preview_id"]

    # 3. Commit with strategy "update"
    commit_resp = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": preview_id, "duplicate_strategy": "update"},
        headers=staff_headers,
    )
    assert commit_resp.status_code == 200
    res = commit_resp.json()
    assert res["updated"] == 1
    assert res["inserted"] == 0

    # 4. Verify DB entry was updated and total_price recomputed server-side
    db.expire_all()
    reloaded = db.query(Entry).filter(Entry.challan_no == challan, Entry.product == "Original Product").first()
    assert reloaded.product == "Original Product"
    assert reloaded.vehicle_no == "MH12DE9999"
    assert reloaded.quantity == Decimal("20.00")
    assert reloaded.unit_price == Decimal("150.00")
    assert reloaded.total_price == Decimal("3000.00")


def test_commit_invalid_or_expired_preview_id_returns_404_or_410(client, staff_headers, db):
    """Commit with non-existent or expired preview returns 404 / 410."""
    # 1. Non-existent preview
    bad_id = str(uuid.uuid4())
    resp1 = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": bad_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert resp1.status_code == 404

    # 2. Expired preview
    expired_id = str(uuid.uuid4())
    past_time = datetime.now(timezone.utc) - timedelta(minutes=5)
    expired_preview = ImportPreview(
        id=expired_id,
        user_id=1,
        filename="expired.xlsx",
        summary={},
        rows=[],
        expires_at=past_time,
    )
    db.add(expired_preview)
    db.commit()

    resp2 = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": expired_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert resp2.status_code == 410
    assert "expired" in resp2.json()["detail"].lower()


def test_formula_injection_sanitized_in_preview_and_db(client, staff_headers, db):
    """Formula injection attempt is sanitized in preview and stored with leading single quote."""
    u = uuid.uuid4().hex[:6]
    challan = f"CH-INJIMP-{u}"
    dangerous_product = "=SUM(A1:A10)"
    rows = [
        [challan, "DL01AB1234", dangerous_product, "Surat, Gujarat", "10", "100.00", "1000.00"],
    ]
    file_bytes = _create_test_xlsx_bytes(STANDARD_HEADERS, rows)

    # 1. Preview checks
    preview_resp = client.post(
        "/api/v1/entries/import/preview",
        files={"file": ("inject.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=staff_headers,
    )
    assert preview_resp.status_code == 200
    p_data = preview_resp.json()
    assert p_data["rows"][0]["data"]["product"] == f"'{dangerous_product}"
    preview_id = p_data["preview_id"]

    # 2. Commit
    commit_resp = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": preview_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert commit_resp.status_code == 200

    # 3. Check DB
    db_entry = db.query(Entry).filter(Entry.challan_no == challan).first()
    assert db_entry is not None
    assert db_entry.product == f"'{dangerous_product}"
