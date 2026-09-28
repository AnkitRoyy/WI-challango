import uuid
from decimal import Decimal
import pytest

from app.models.product import Product
from app.models.entry import Entry


def test_create_product_admin_success(client, admin_headers):
    """Admin can create a new catalog product."""
    u = uuid.uuid4().hex[:6]
    name = f"Test Product {u}"
    response = client.post(
        "/api/v1/products",
        json={"name": name, "default_unit_price": "750.50"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == name
    assert Decimal(data["default_unit_price"]) == Decimal("750.50")
    assert data["is_active"] is True
    assert "id" in data


def test_create_product_duplicate_name_case_insensitive_returns_409(client, admin_headers):
    """Creating a product with duplicate name (regardless of case) returns 409 Conflict."""
    u = uuid.uuid4().hex[:6]
    name_orig = f"Steel Beams {u}"
    name_dup_case = f"sTeEl bEaMs {u}"

    # 1. Create first product
    r1 = client.post(
        "/api/v1/products",
        json={"name": name_orig, "default_unit_price": "1200.00"},
        headers=admin_headers,
    )
    assert r1.status_code == 201

    # 2. Attempt duplicate with different casing
    r2 = client.post(
        "/api/v1/products",
        json={"name": name_dup_case, "default_unit_price": "1400.00"},
        headers=admin_headers,
    )
    assert r2.status_code == 409
    assert "already exists" in r2.json()["detail"].lower()


def test_list_products_returns_only_active_sorted_by_name(client, admin_headers, staff_headers):
    """GET /products returns active products sorted by name alphabetically."""
    u = uuid.uuid4().hex[:6]
    # Create products: B and A, and inactive C
    p_b = f"B Product {u}"
    p_a = f"A Product {u}"
    p_c = f"C Product Inactive {u}"

    client.post("/api/v1/products", json={"name": p_b, "default_unit_price": "100.00"}, headers=admin_headers)
    client.post("/api/v1/products", json={"name": p_a, "default_unit_price": "200.00"}, headers=admin_headers)
    r_c = client.post("/api/v1/products", json={"name": p_c, "default_unit_price": "300.00"}, headers=admin_headers)
    prod_c_id = r_c.json()["id"]

    # Deactivate product C
    del_resp = client.delete(f"/api/v1/products/{prod_c_id}", headers=admin_headers)
    assert del_resp.status_code == 200

    # Staff lists products with search for unique id
    list_resp = client.get(f"/api/v1/products?search={u}", headers=staff_headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 2
    assert items[0]["name"] == p_a
    assert items[1]["name"] == p_b
    assert all(i["is_active"] is True for i in items)


def test_update_product_price_and_name_succeeds(client, admin_headers):
    """Admin can update product name and default unit price."""
    u = uuid.uuid4().hex[:6]
    orig_name = f"Old Name {u}"
    new_name = f"New Name {u}"

    create_resp = client.post(
        "/api/v1/products",
        json={"name": orig_name, "default_unit_price": "500.00"},
        headers=admin_headers,
    )
    prod_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/v1/products/{prod_id}",
        json={"name": new_name, "default_unit_price": "650.00"},
        headers=admin_headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["name"] == new_name
    assert Decimal(data["default_unit_price"]) == Decimal("650.00")


def test_soft_deleting_product_leaves_entries_unaffected(client, admin_headers, staff_headers, db):
    """Soft deleting a product does NOT break or delete entries that reference that product name."""
    u = uuid.uuid4().hex[:6]
    prod_name = f"Historical Item {u}"

    # 1. Create product
    p_resp = client.post(
        "/api/v1/products",
        json={"name": prod_name, "default_unit_price": "800.00"},
        headers=admin_headers,
    )
    prod_id = p_resp.json()["id"]

    # 2. Create entry with this product
    challan = f"CH-HIST-{u}"
    e_resp = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": challan,
            "vehicle_no": "MH01AB1111",
            "product": prod_name,
            "destination": "Mumbai, Maharashtra",
            "quantity": "10.00",
            "unit_price": "800.00",
        },
        headers=staff_headers,
    )
    assert e_resp.status_code == 201
    entry_id = e_resp.json()["id"]

    # 3. Soft-delete product
    del_resp = client.delete(f"/api/v1/products/{prod_id}", headers=admin_headers)
    assert del_resp.status_code == 200

    # 4. Entry is completely unaffected and still has the product name as free text
    db.expire_all()
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    assert entry is not None
    assert entry.product == prod_name
    assert entry.is_deleted is False


def test_entry_created_with_custom_product_not_in_catalog(client, staff_headers):
    """An entry can be created with a free-text product name not in products table at all."""
    u = uuid.uuid4().hex[:6]
    custom_product = f"Custom One-Off Product {u}"
    response = client.post(
        "/api/v1/entries",
        json={
            "serial_no": "001",
            "challan_no": f"CH-CUST-{u}",
            "vehicle_no": "KA02CD2222",
            "product": custom_product,
            "destination": "Bengaluru, Karnataka",
            "quantity": "5.00",
            "unit_price": "125.00",
        },
        headers=staff_headers,
    )
    assert response.status_code == 201
    assert response.json()["product"] == custom_product


def test_staff_cannot_create_update_or_delete_product(client, staff_headers):
    """Staff role is rejected with 403 on mutation endpoints."""
    # Create attempt
    r1 = client.post(
        "/api/v1/products",
        json={"name": "Forbidden Product", "default_unit_price": "100.00"},
        headers=staff_headers,
    )
    assert r1.status_code == 403

    # Update attempt
    r2 = client.patch(
        "/api/v1/products/1",
        json={"default_unit_price": "200.00"},
        headers=staff_headers,
    )
    assert r2.status_code == 403

    # Delete attempt
    r3 = client.delete("/api/v1/products/1", headers=staff_headers)
    assert r3.status_code == 403
