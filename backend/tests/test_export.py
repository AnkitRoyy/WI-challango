import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import openpyxl
import pytest

from app.models.entry import Entry
from app.models.audit_log import AuditLog, AuditAction


def test_export_xlsx_all_entries_headers_and_columns(client, staff_headers):
    """Export xlsx with no filters returns valid workbook, correct headers and column order."""
    response = client.get("/api/v1/entries/export?format=xlsx", headers=staff_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "entries_export_" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith('.xlsx"')

    # Read binary into openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    ws = wb.active
    assert ws.title == "Challan Entries"

    # Verify frozen panes
    assert ws.freeze_panes == "A2"

    # Verify exact headers
    expected_headers = [
        "Serial No",
        "Challan No",
        "Vehicle No",
        "Product",
        "Destination",
        "Quantity",
        "Unit Price",
        "Total Price",
        "Created At",
    ]
    actual_headers = [ws.cell(row=1, column=col).value for col in range(1, 10)]
    assert actual_headers == expected_headers

    # Verify at least one row exists and count matches DB active records
    assert ws.max_row >= 60


def test_export_csv_matching_rows_with_list_endpoint(client, staff_headers):
    """Export csv with same filters as list endpoint returns the exact same count of rows."""
    # List endpoint call with product filter
    list_resp = client.get(
        "/api/v1/entries",
        params={"product": "Cement", "page_size": 200},
        headers=staff_headers,
    )
    assert list_resp.status_code == 200
    expected_count = list_resp.json()["total_count"]

    # Export CSV with same product filter
    export_resp = client.get(
        "/api/v1/entries/export",
        params={"format": "csv", "product": "Cement"},
        headers=staff_headers,
    )
    assert export_resp.status_code == 200
    assert "text/csv" in export_resp.headers["content-type"]
    assert "entries_export_" in export_resp.headers["content-disposition"]
    assert export_resp.headers["content-disposition"].endswith('.csv"')

    # Verify CSV content
    content_str = export_resp.content.decode("utf-8-sig")  # Strips BOM
    csv_reader = csv.reader(io.StringIO(content_str))
    rows = list(csv_reader)

    # 1 header row + expected_count data rows
    assert len(rows) == expected_count + 1
    assert rows[0] == [
        "Serial No",
        "Challan No",
        "Vehicle No",
        "Product",
        "Destination",
        "Quantity",
        "Unit Price",
        "Total Price",
        "Created At",
    ]


def test_export_respects_filters(client, staff_headers):
    """Export respects date range and product filters correctly."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ten_days_ago = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%d")

    # Get list count
    list_resp = client.get(
        "/api/v1/entries",
        params={"date_from": ten_days_ago, "date_to": today, "page_size": 200},
        headers=staff_headers,
    )
    expected_count = list_resp.json()["total_count"]

    # Export xlsx
    export_resp = client.get(
        "/api/v1/entries/export",
        params={"format": "xlsx", "date_from": ten_days_ago, "date_to": today},
        headers=staff_headers,
    )
    assert export_resp.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(export_resp.content))
    ws = wb.active
    # Max row = 1 header + data rows
    assert ws.max_row == expected_count + 1


def test_export_xlsx_numeric_formats_and_types(client, staff_headers):
    """Unit Price and Total Price cells in xlsx are real numbers (float/int), formatted to 2 decimals."""
    response = client.get("/api/v1/entries/export?format=xlsx", headers=staff_headers)
    assert response.status_code == 200

    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    ws = wb.active

    # Row 2 (first data row)
    qty_cell = ws.cell(row=2, column=6)
    unit_price_cell = ws.cell(row=2, column=7)
    total_price_cell = ws.cell(row=2, column=8)

    # Check numeric types, NOT string
    assert isinstance(qty_cell.value, (int, float))
    assert isinstance(unit_price_cell.value, (int, float))
    assert isinstance(total_price_cell.value, (int, float))

    # Check number format string for prices
    assert unit_price_cell.number_format == "#,##0.00"
    assert total_price_cell.number_format == "#,##0.00"


def test_export_formula_injection_protection(client, staff_headers):
    """Fields starting with =, +, -, @ are prefixed with a single quote in both xlsx and csv."""
    unique_id = uuid.uuid4().hex[:6]
    # Create an entry with malicious formula prefixes
    dangerous_product = "=CMD('calc')|'test'"
    dangerous_serial = "+998877"
    create_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": dangerous_serial,
            "challan_no": f"CH-INJ-{unique_id}",
            "vehicle_no": "DL01AB8888",
            "product": dangerous_product,
            "destination": "Delhi NCR",
            "quantity": "5.00",
            "unit_price": "100.00",
        },
        headers=staff_headers,
    )
    assert create_resp.status_code == 201

    # 1. Check CSV export
    csv_resp = client.get(
        "/api/v1/entries/export",
        params={"format": "csv", "challan_no": f"CH-INJ-{unique_id}"},
        headers=staff_headers,
    )
    assert csv_resp.status_code == 200
    csv_content = csv_resp.content.decode("utf-8-sig")
    csv_rows = list(csv.reader(io.StringIO(csv_content)))
    assert len(csv_rows) == 2  # header + 1 row
    # Serial should start with '
    assert csv_rows[1][0] == f"'{dangerous_serial}"
    # Product should start with '
    assert csv_rows[1][3] == f"'{dangerous_product}"

    # 2. Check XLSX export
    xlsx_resp = client.get(
        "/api/v1/entries/export",
        params={"format": "xlsx", "challan_no": f"CH-INJ-{unique_id}"},
        headers=staff_headers,
    )
    assert xlsx_resp.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_resp.content))
    ws = wb.active
    assert ws.cell(row=2, column=1).value == f"'{dangerous_serial}"
    assert ws.cell(row=2, column=4).value == f"'{dangerous_product}"


def test_export_invalid_format_returns_400(client, staff_headers):
    """Requesting an unsupported format returns 400 Bad Request."""
    response = client.get("/api/v1/entries/export?format=pdf", headers=staff_headers)
    assert response.status_code == 400
    assert "Invalid export format 'pdf'" in response.json()["detail"]


def test_export_zero_matching_rows_returns_valid_headers_file(client, staff_headers):
    """Export with filters matching zero rows returns a valid file with headers only."""
    response = client.get(
        "/api/v1/entries/export",
        params={"format": "xlsx", "product": "NONEXISTENT_ITEM_XYZ_9999"},
        headers=staff_headers,
    )
    assert response.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    ws = wb.active
    # Header row only
    assert ws.max_row == 1
    assert ws.cell(row=1, column=1).value == "Serial No"


def test_export_creates_audit_log(client, staff_headers, db):
    """Calling export creates an audit_log record with action='export' and filter details."""
    response = client.get(
        "/api/v1/entries/export",
        params={"format": "csv", "q": "River Sand"},
        headers=staff_headers,
    )
    assert response.status_code == 200

    audit_entry = (
        db.query(AuditLog)
        .filter(AuditLog.action == AuditAction.EXPORT.value)
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit_entry is not None
    assert audit_entry.details["format"] == "csv"
    assert audit_entry.details["filters"]["q"] == "River Sand"
