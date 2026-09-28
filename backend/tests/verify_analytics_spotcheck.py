import sys
import os
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.main import app
from app.core.database import get_db, SessionLocal
from app.models.user import User
from app.models.entry import Entry
from app.core.security import get_password_hash, create_access_token

@pytest.mark.asyncio
async def test_spotcheck_analytics_vs_entries_summary():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as admin
        login_res = await client.post("/api/v1/auth/login", json={
            "email": "admin@challango.in",
            "password": "Admin@123456"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Add sample entries if none exist or use existing entries
        db = SessionLocal()
        admin_user = db.query(User).filter(User.email == "admin@challango.in").first()
        
        # Insert 3 entries across today and yesterday
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        
        entry1 = Entry(
            serial_no=f"SC-01-{int(now.timestamp())}",
            challan_no=f"CH-SC1-{int(now.timestamp())}",
            vehicle_no="DL01AB1234",
            product="Spotcheck Rods",
            quantity=Decimal("15.50"),
            unit_price=Decimal("100.00"),
            total_price=Decimal("1550.00"),
            destination="Delhi",
            is_deleted=False,
            created_by=admin_user.id,
            updated_by=admin_user.id,
        )
        entry2 = Entry(
            serial_no=f"SC-02-{int(now.timestamp())}",
            challan_no=f"CH-SC2-{int(now.timestamp())}",
            vehicle_no="HR02CD5678",
            product="Spotcheck Cement",
            quantity=Decimal("25.00"),
            unit_price=Decimal("200.00"),
            total_price=Decimal("5000.00"),
            destination="Jaipur",
            is_deleted=False,
            created_by=admin_user.id,
            updated_by=admin_user.id,
        )
        db.add_all([entry1, entry2])
        db.commit()

        # Query with ISO range covering the full period
        date_from_iso = (now - timedelta(days=2)).strftime("%Y-%m-%d") + "T00:00:00"
        date_to_iso = (now + timedelta(days=1)).strftime("%Y-%m-%d") + "T23:59:59"

        # 3. Query Analytics Summary for this date range
        analytics_res = await client.get(
            f"/api/v1/analytics/summary?period=day&date_from={date_from_iso}&date_to={date_to_iso}",
            headers=headers
        )
        assert analytics_res.status_code == 200, analytics_res.text
        analytics_data = analytics_res.json()
        
        # Sum all buckets from analytics
        total_bucket_count = sum(b["entry_count"] for b in analytics_data["buckets"])
        total_bucket_qty = sum(Decimal(str(b["total_quantity"])) for b in analytics_data["buckets"])
        total_bucket_val = sum(Decimal(str(b["total_value"])) for b in analytics_data["buckets"])

        # 4. Query Entries Summary with the exact same date range
        entries_sum_res = await client.get(
            f"/api/v1/entries/summary?date_from={date_from_iso}&date_to={date_to_iso}",
            headers=headers
        )
        assert entries_sum_res.status_code == 200, entries_sum_res.text
        entries_sum_data = entries_sum_res.json()

        entry_count = entries_sum_data["count"]
        entry_qty = Decimal(str(entries_sum_data["sum_quantity"]))
        entry_val = Decimal(str(entries_sum_data["sum_total_price"]))

        print(f"\n--- SPOTCHECK VERIFICATION FOR {date_str} ---")
        print(f"Analytics: count={total_bucket_count}, qty={total_bucket_qty}, val={total_bucket_val}")
        print(f"Entries:   count={entry_count}, qty={entry_qty}, val={entry_val}")

        # Assert exact equality!
        assert total_bucket_count == entry_count, f"Count mismatch: {total_bucket_count} != {entry_count}"
        assert total_bucket_qty == entry_qty, f"Qty mismatch: {total_bucket_qty} != {entry_qty}"
        assert total_bucket_val == entry_val, f"Valuation mismatch: {total_bucket_val} != {entry_val}"

        # Clean up sample entries
        db.delete(entry1)
        db.delete(entry2)
        db.commit()
        db.close()
        print("--- SPOTCHECK MATCHED 100% PERFECTLY! ---")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_spotcheck_analytics_vs_entries_summary())
