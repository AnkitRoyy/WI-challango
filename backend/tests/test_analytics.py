import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest

from app.models.entry import Entry


def create_test_entry(db, serial, challan, vehicle, product, destination, qty, price, created_at, is_deleted=False):
    entry = Entry(
        challan_no=challan,
        vehicle_no=vehicle,
        product=product,
        destination=destination,
        quantity=Decimal(str(qty)),
        unit_price=Decimal(str(price)),
        total_price=Decimal(str(qty)) * Decimal(str(price)),
        created_at=created_at,
        is_deleted=is_deleted,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def test_analytics_endpoints_require_admin(client, staff_headers):
    """Staff users and unauthenticated requests are rejected with 403 / 401."""
    # Unauthenticated
    assert client.get("/api/v1/analytics/summary").status_code == 401
    assert client.get("/api/v1/analytics/top-products").status_code == 401
    assert client.get("/api/v1/analytics/top-destinations").status_code == 401

    # Staff forbidden
    assert client.get("/api/v1/analytics/summary", headers=staff_headers).status_code == 403
    assert client.get("/api/v1/analytics/top-products", headers=staff_headers).status_code == 403
    assert client.get("/api/v1/analytics/top-destinations", headers=staff_headers).status_code == 403


def test_analytics_summary_day_week_month_year(client, admin_headers, db):
    """Verify summary grouping by day, week, month, and year against specific dates."""
    u = uuid.uuid4().hex[:5]
    now = datetime(2026, 9, 29, 12, 0, 0, tzinfo=timezone.utc)
    t1 = now - timedelta(days=2) # 2026-09-27
    t2 = now - timedelta(days=1) # 2026-09-28
    t3 = now # 2026-09-29

    # Day 1: 10 * 100 = 1000
    create_test_entry(db, f"S1-{u}", f"CH1-{u}", "DL01AA1111", f"ProdA-{u}", "Delhi", 10, 100, t1)
    # Day 2: 20 * 200 = 4000
    create_test_entry(db, f"S2-{u}", f"CH2-{u}", "DL01AA2222", f"ProdB-{u}", "Mumbai", 20, 200, t2)
    # Day 3: 5 * 50 = 250
    create_test_entry(db, f"S3-{u}", f"CH3-{u}", "DL01AA3333", f"ProdA-{u}", "Delhi", 5, 50, t3)
    # Soft deleted row: 100 * 100 = 10000 (must be ignored)
    create_test_entry(db, f"S4-{u}", f"CH4-{u}", "DL01AA4444", f"ProdC-{u}", "Kolkata", 100, 100, t3, is_deleted=True)

    date_from = (t1 - timedelta(hours=1)).strftime("%Y-%m-%d")
    date_to = (t3 + timedelta(hours=1)).strftime("%Y-%m-%d")

    # 1. Day grouping
    res_day = client.get(
        f"/api/v1/analytics/summary?period=day&date_from={date_from}&date_to={date_to}",
        headers=admin_headers,
    )
    assert res_day.status_code == 200
    d_data = res_day.json()
    assert d_data["period"] == "day"
    # Find our specific bucket labels
    bucket_map = {b["bucket_label"]: b for b in d_data["buckets"]}
    d1_label = t1.strftime("%Y-%m-%d")
    d2_label = t2.strftime("%Y-%m-%d")
    d3_label = t3.strftime("%Y-%m-%d")

    assert d1_label in bucket_map
    assert bucket_map[d1_label]["entry_count"] >= 1
    assert Decimal(str(bucket_map[d1_label]["total_quantity"])) >= Decimal("10.00")
    assert Decimal(str(bucket_map[d1_label]["total_value"])) >= Decimal("1000.00")

    # 2. Week grouping
    res_week = client.get(
        f"/api/v1/analytics/summary?period=week&date_from={date_from}&date_to={date_to}",
        headers=admin_headers,
    )
    assert res_week.status_code == 200
    w_data = res_week.json()
    assert w_data["period"] == "week"
    for b in w_data["buckets"]:
        assert "-W" in b["bucket_label"] # e.g. "2026-W40"

    # 3. Month grouping
    res_month = client.get(
        f"/api/v1/analytics/summary?period=month&date_from={date_from}&date_to={date_to}",
        headers=admin_headers,
    )
    assert res_month.status_code == 200
    m_data = res_month.json()
    assert m_data["period"] == "month"
    for b in m_data["buckets"]:
        assert len(b["bucket_label"]) == 7 # "YYYY-MM"

    # 4. Year grouping
    res_year = client.get(
        f"/api/v1/analytics/summary?period=year&date_from={date_from}&date_to={date_to}",
        headers=admin_headers,
    )
    assert res_year.status_code == 200
    y_data = res_year.json()
    assert y_data["period"] == "year"
    for b in y_data["buckets"]:
        assert len(b["bucket_label"]) == 4 # "YYYY"


def test_analytics_summary_empty_date_range_returns_empty_buckets(client, admin_headers):
    """An empty date range in the far future returns empty buckets, not an error."""
    res = client.get(
        "/api/v1/analytics/summary?period=month&date_from=2099-01-01&date_to=2099-02-01",
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_entries"] == 0
    assert Decimal(str(data["total_quantity"])) == Decimal("0.00")
    assert Decimal(str(data["total_value"])) == Decimal("0.00")
    assert data["buckets"] == []


def test_analytics_top_products_ranking_and_soft_delete(client, admin_headers, db):
    """GET /analytics/top-products returns items ranked by total_value and total_quantity excluding soft-deleted."""
    u = uuid.uuid4().hex[:6]
    now = datetime(2028, 9, 29, 12, 0, 0, tzinfo=timezone.utc)
    t = now - timedelta(days=1)

    # High value, low qty
    prod_expensive = f"Expensive Titanium {u}"
    create_test_entry(db, f"SE1-{u}", f"CHE1-{u}", "DL01AA1111", prod_expensive, "Mumbai", 2, 50000, t)

    # Low value, high qty
    prod_bulk = f"Bulk Sand {u}"
    create_test_entry(db, f"SE2-{u}", f"CHE2-{u}", "DL01AA2222", prod_bulk, "Delhi", 500, 10, t)

    # Soft deleted row: must NOT appear in rankings
    prod_deleted = f"Deleted Product {u}"
    create_test_entry(db, f"SE3-{u}", f"CHE3-{u}", "DL01AA3333", prod_deleted, "Goa", 10000, 1000, t, is_deleted=True)

    date_from = (t - timedelta(hours=1)).strftime("%Y-%m-%d")
    date_to = (now + timedelta(hours=1)).strftime("%Y-%m-%d")

    res = client.get(
        f"/api/v1/analytics/top-products?date_from={date_from}&date_to={date_to}&limit=50",
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()

    # Verify deleted product is not in by_value or by_quantity
    val_map = {item["product"]: item for item in data["by_value"]}
    qty_map = {item["product"]: item for item in data["by_quantity"]}

    assert prod_deleted not in val_map
    assert prod_deleted not in qty_map

    assert prod_expensive in val_map
    assert prod_bulk in qty_map
    assert Decimal(str(val_map[prod_expensive]["total_value"])) >= Decimal("100000.00")
    assert Decimal(str(qty_map[prod_bulk]["total_quantity"])) >= Decimal("500.00")


def test_analytics_top_destinations_ranking(client, admin_headers, db):
    """GET /analytics/top-destinations returns destinations ranked by total_value and total_quantity."""
    u = uuid.uuid4().hex[:6]
    now = datetime(2026, 9, 29, 12, 0, 0, tzinfo=timezone.utc)
    t = now - timedelta(days=1)

    dest_val = f"Bengaluru Tech Park {u}"
    create_test_entry(db, f"SD1-{u}", f"CHD1-{u}", "KA01AA1111", "Steel", dest_val, 10, 25000, t)

    dest_qty = f"Hyderabad Depot {u}"
    create_test_entry(db, f"SD2-{u}", f"CHD2-{u}", "TS01AA2222", "Cement", dest_qty, 800, 50, t)

    date_from = (t - timedelta(hours=1)).strftime("%Y-%m-%d")
    date_to = (now + timedelta(hours=1)).strftime("%Y-%m-%d")

    res = client.get(
        f"/api/v1/analytics/top-destinations?date_from={date_from}&date_to={date_to}&limit=50",
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()

    val_map = {item["destination"]: item for item in data["by_value"]}
    qty_map = {item["destination"]: item for item in data["by_quantity"]}

    assert dest_val in val_map
    assert dest_qty in qty_map
    assert Decimal(str(val_map[dest_val]["total_value"])) >= Decimal("250000.00")
    assert Decimal(str(qty_map[dest_qty]["total_quantity"])) >= Decimal("800.00")
