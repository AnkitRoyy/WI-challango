import uuid
from datetime import datetime, timedelta, timezone

from app.models.entry import Entry
from app.models.import_preview import ImportPreview


def test_commit_transactional_rollback_on_failure(client, staff_headers, db):
    """
    Commit is transactional: if a constraint violation or database failure occurs,
    the entire transaction is rolled back and ZERO rows from that batch are persisted.
    """
    u = uuid.uuid4().hex[:6]
    challan = f"CH-TXFAIL-{u}"
    preview_id = str(uuid.uuid4())

    # 1. Preview contains 2 rows (both considered OK initially)
    now = datetime.now(timezone.utc)
    preview = ImportPreview(
        id=preview_id,
        user_id=1,
        filename="transaction_test.xlsx",
        summary={"error_count": 0},
        rows=[
            {
                "status": "ok",
                "data": {
                    "challan_no": challan,
                    "vehicle_no": "DL01AB1111",
                    "product": "Product First That Must Rollback",
                    "destination": "Delhi NCR",
                    "quantity": "10.00",
                    "unit_price": "100.00",
                    "total_price": "1000.00",
                },
            },
            {
                "status": "ok",
                "data": {
                    "challan_no": challan,
                    "vehicle_no": "DL01AB1111",
                    "product": "Product Second Causing Collision",
                    "destination": "Delhi NCR",
                    "quantity": "20.00",
                    "unit_price": "200.00",
                    "total_price": "4000.00",
                },
            },
        ],
        expires_at=now + timedelta(minutes=30),
    )
    db.add(preview)
    db.commit()

    # 2. Before commit runs, simulate a concurrent insertion of 'Product Second Causing Collision'
    # so that when commit runs, row 2 hits the unique constraint uq_challan_product_active
    conflicting_entry = Entry(
        challan_no=challan,
        vehicle_no="DL01AB1111",
        product="Product Second Causing Collision",
        destination="Delhi NCR",
        quantity="5.00",
        unit_price="50.00",
        total_price="250.00",
        is_deleted=False,
    )
    db.add(conflicting_entry)
    db.commit()

    # 3. Commit the preview -> row 1 succeeds, row 2 triggers IntegrityError
    commit_resp = client.post(
        "/api/v1/entries/import/commit",
        json={"preview_id": preview_id, "duplicate_strategy": "skip"},
        headers=staff_headers,
    )
    assert commit_resp.status_code == 500
    assert "Import transaction failed" in commit_resp.json()["detail"]

    # 4. Verify that row 1 was ROLLED BACK and NOT committed to DB!
    db.expire_all()
    inserted_first_row = (
        db.query(Entry)
        .filter(Entry.challan_no == challan, Entry.product == "Product First That Must Rollback")
        .first()
    )
    assert inserted_first_row is None  # Confirms atomic rollback!
