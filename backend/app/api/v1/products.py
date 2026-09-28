import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/products", tags=["Products"])
logger = logging.getLogger("challango.products")


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Create a new product in the catalog (admin only).
    Rejects duplicate names case-insensitively with 409 Conflict.
    """
    clean_name = product_in.name.strip()
    existing = (
        db.query(Product)
        .filter(func.lower(Product.name) == clean_name.lower())
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A product named '{existing.name}' already exists in the catalog.",
        )

    product = Product(
        name=clean_name,
        default_unit_price=product_in.default_unit_price,
        is_active=True,
        created_by=current_admin.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    logger.info(f"Admin {current_admin.email} created product: {product.name} (Default: Rs. {product.default_unit_price})")
    return product


@router.get("", response_model=List[ProductResponse])
def list_products(
    search: Optional[str] = Query(None, description="Optional search term to filter product names"),
    include_inactive: bool = Query(False, description="Whether to include soft-deleted products (admin view)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List products sorted alphabetically for entry dropdowns or admin management.
    By default returns only active products.
    """
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.is_active.is_(True))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(Product.name.ilike(term))

    products = query.order_by(Product.name.asc()).all()
    return products


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve product details by ID.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Update a product's name, default price, or active status (admin only).
    Rejects renaming to an existing product name (case-insensitive) with 409 Conflict.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product_in.name is not None:
        clean_name = product_in.name.strip()
        existing = (
            db.query(Product)
            .filter(
                func.lower(Product.name) == clean_name.lower(),
                Product.id != product_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another product named '{existing.name}' already exists in the catalog.",
            )
        product.name = clean_name

    if product_in.default_unit_price is not None:
        product.default_unit_price = product_in.default_unit_price

    if product_in.is_active is not None:
        product.is_active = product_in.is_active

    db.commit()
    db.refresh(product)
    logger.info(f"Admin {current_admin.email} updated product ID {product.id} ({product.name})")
    return product


@router.delete("/{product_id}", response_model=ProductResponse)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Soft-delete a product by setting is_active=false (admin only).
    Existing delivery entries referencing the product name as text remain completely preserved.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    product.is_active = False
    db.commit()
    db.refresh(product)
    logger.info(f"Admin {current_admin.email} soft-deleted product ID {product.id} ({product.name})")
    return product
