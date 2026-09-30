import os
import sys
from decimal import Decimal
from datetime import datetime, timedelta, timezone

# Ensure app package is accessible
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import func
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.core.vehicle import normalize_vehicle_no
from app.models.user import User, UserRole
from app.models.entry import Entry
from app.models.product import Product
from app.models.audit_log import AuditLog, AuditAction


SAMPLE_PRODUCTS = [
    ("TMT Steel Bars 12mm (Fe550D)", Decimal("650.00")),
    ("TMT Steel Bars 16mm (Fe550D)", Decimal("820.00")),
    ("TMT Steel Bars 8mm (Fe550D)", Decimal("480.00")),
    ("UltraTech Portland Cement 50kg", Decimal("385.00")),
    ("ACC Super Cement 50kg", Decimal("375.00")),
    ("Ambuja Cement PPC 50kg", Decimal("390.00")),
    ("Coromandel King Cement 50kg", Decimal("370.00")),
    ("River Sand Grade-A (Metric Ton)", Decimal("1450.00")),
    ("Crushed Stone Aggregate 20mm (Ton)", Decimal("950.00")),
    ("Coarse Aggregate 10mm (Ton)", Decimal("1100.00")),
    ("Red Clay Bricks (1000 pcs pack)", Decimal("7500.00")),
    ("Ready Mix Concrete M25 (Cu.M)", Decimal("4200.00")),
    ("PVC Pipes 4-inch 6m (Supreme)", Decimal("620.00")),
    ("PVC Elbow Joint 4-inch", Decimal("45.00")),
    ("CPVC Plumbing Pipes 1-inch 3m", Decimal("290.00")),
    ("Brass Ball Valve 1-inch", Decimal("410.00")),
    ("Astral Drainage Pipe 110mm 3m", Decimal("540.00")),
    ("Granite Slabs Black Galaxy (sq ft)", Decimal("220.00")),
    ("Italian White Marble Tile 2x2", Decimal("145.00")),
    ("Ceramic Floor Tiles 600x600mm (Box)", Decimal("580.00")),
    ("Vitrified Wall Tiles 300x450mm", Decimal("360.00")),
    ("Kajaria Glazed Vitrified Tiles 800x800", Decimal("850.00")),
    ("Asian Paints Apex Exterior 20L", Decimal("4800.00")),
    ("Asian Paints Primer 20L", Decimal("2100.00")),
    ("Berger Wall Putty 40kg Bag", Decimal("780.00")),
    ("Nerolac Synthetic Enamel Gloss White 20L", Decimal("3900.00")),
    ("Finolex 2.5 sq mm Copper Wire 90m", Decimal("1850.00")),
    ("Havells 4 sq mm Copper Cable 100m", Decimal("3450.00")),
    ("Schneider MCB Single Pole 16A", Decimal("195.00")),
    ("Anchor Roma Modular Switches Pack 20", Decimal("1400.00")),
    ("Waterproofing Chemical Dr Fixit 20L", Decimal("3400.00")),
    ("Structural Steel I-Beam 200mm", Decimal("8500.00")),
    ("Mild Steel Square Tube 50x50x3mm 6m", Decimal("1420.00")),
    ("Tata Tiscon Steel Rebars 10mm", Decimal("560.00")),
    ("CenturyPly Marine Grade Plywood 8x4", Decimal("2850.00")),
    ("Teak Wood Planks 8x4 ft", Decimal("3200.00")),
]

SAMPLE_ENTRIES = [
    # (challan_no, vehicle_no, product, destination, quantity, unit_price, days_ago)
    # Batch 1 (Days 1 to 28)
    ("CH-2026-001", "DL01AB1234", "TMT Steel Bars 12mm (Fe550D)", "Delhi NCR", Decimal("50.00"), Decimal("650.00"), 28),
    ("CH-2026-001", "DL01AB1234", "TMT Steel Bars 16mm (Fe550D)", "Delhi NCR", Decimal("35.00"), Decimal("820.00"), 28),
    ("CH-2026-002", "MH12DE5678", "UltraTech Portland Cement 50kg", "Pune, Maharashtra", Decimal("200.00"), Decimal("385.00"), 26),
    ("CH-2026-002", "MH12DE5678", "ACC Super Cement 50kg", "Pune, Maharashtra", Decimal("150.00"), Decimal("375.00"), 26),
    ("CH-2026-003", "HR26DQ5555", "River Sand Grade-A (Metric Ton)", "Gurugram, Haryana", Decimal("45.50"), Decimal("1450.00"), 25),
    ("CH-2026-004", "KA05MB9012", "Red Clay Bricks (1000 pcs pack)", "Bengaluru, Karnataka", Decimal("12.00"), Decimal("7500.00"), 23),
    ("CH-2026-005", "TN09BZ4433", "PVC Pipes 4-inch 6m (Supreme)", "Chennai, Tamil Nadu", Decimal("80.00"), Decimal("620.00"), 22),
    ("CH-2026-005", "TN09BZ4433", "PVC Elbow Joint 4-inch", "Chennai, Tamil Nadu", Decimal("120.00"), Decimal("45.00"), 22),
    ("CH-2026-006", "GJ01XY8821", "Granite Slabs Black Galaxy (sq ft)", "Ahmedabad, Gujarat", Decimal("350.00"), Decimal("220.00"), 20),
    ("CH-2026-006", "GJ01XY8821", "Italian White Marble Tile 2x2", "Ahmedabad, Gujarat", Decimal("500.00"), Decimal("145.00"), 20),
    ("CH-2026-007", "UP32AA1122", "Ready Mix Concrete M25 (Cu.M)", "Lucknow, Uttar Pradesh", Decimal("28.00"), Decimal("4200.00"), 18),
    ("CH-2026-008", "WB02CD3344", "Structural Steel I-Beam 200mm", "Kolkata, West Bengal", Decimal("15.00"), Decimal("8500.00"), 17),
    ("CH-2026-009", "RJ14EF7788", "Asian Paints Apex Exterior 20L", "Jaipur, Rajasthan", Decimal("25.00"), Decimal("4800.00"), 15),
    ("CH-2026-009", "RJ14EF7788", "Asian Paints Primer 20L", "Jaipur, Rajasthan", Decimal("20.00"), Decimal("2100.00"), 15),
    ("CH-2026-010", "AP09GH9900", "Teak Wood Planks 8x4 ft", "Vijayawada, Andhra Pradesh", Decimal("40.00"), Decimal("3200.00"), 14),
    ("CH-2026-011", "TS07JK2211", "Finolex 2.5 sq mm Copper Wire 90m", "Hyderabad, Telangana", Decimal("60.00"), Decimal("1850.00"), 12),
    ("CH-2026-011", "TS07JK2211", "Schneider MCB Single Pole 16A", "Hyderabad, Telangana", Decimal("100.00"), Decimal("195.00"), 12),
    ("CH-2026-012", "KL07LM4455", "Ceramic Floor Tiles 600x600mm (Box)", "Kochi, Kerala", Decimal("110.00"), Decimal("580.00"), 10),
    ("CH-2026-013", "MP09NO6677", "Waterproofing Chemical Dr Fixit 20L", "Indore, Madhya Pradesh", Decimal("18.00"), Decimal("3400.00"), 9),
    ("CH-2026-014", "PB10PQ8899", "Gypsum Ceiling Board 6x4 ft", "Ludhiana, Punjab", Decimal("75.00"), Decimal("420.00"), 8),
    ("CH-2026-015", "CH01RS1212", "Aluminium Window Sections (kg)", "Chandigarh", Decimal("220.00"), Decimal("310.00"), 7),
    ("CH-2026-016", "DL04TU3434", "TMT Steel Bars 8mm (Fe550D)", "Delhi NCR", Decimal("60.00"), Decimal("480.00"), 6),
    ("CH-2026-016", "DL04TU3434", "Binding Wire 18 Gauge (Bundle)", "Delhi NCR", Decimal("30.00"), Decimal("350.00"), 6),
    ("CH-2026-017", "MH04VW5656", "Vitrified Wall Tiles 300x450mm", "Thane, Maharashtra", Decimal("90.00"), Decimal("360.00"), 5),
    ("CH-2026-018", "HR51XY7878", "Crushed Stone Aggregate 20mm (Ton)", "Faridabad, Haryana", Decimal("55.00"), Decimal("950.00"), 4),
    ("CH-2026-019", "KA03ZA9090", "CPVC Plumbing Pipes 1-inch 3m", "Bengaluru, Karnataka", Decimal("140.00"), Decimal("290.00"), 3),
    ("CH-2026-019", "KA03ZA9090", "Brass Ball Valve 1-inch", "Bengaluru, Karnataka", Decimal("45.00"), Decimal("410.00"), 3),
    ("CH-2026-020", "TN01BC1122", "Berger Wall Putty 40kg Bag", "Chennai, Tamil Nadu", Decimal("80.00"), Decimal("780.00"), 2),
    ("CH-2026-021", "GJ06DE3344", "Astral Drainage Pipe 110mm 3m", "Vadodara, Gujarat", Decimal("65.00"), Decimal("540.00"), 1),
    ("CH-2026-022", "UP16FG5566", "Tata Tiscon Steel Rebars 10mm", "Noida, Uttar Pradesh", Decimal("40.00"), Decimal("560.00"), 0),

    # Batch 2 (Days 29 to 58) — varied products, valid and non-standard vehicle formats
    ("CH-2026-023", "MH02CB9988", "Ambuja Cement PPC 50kg", "Mumbai, Maharashtra", Decimal("180.00"), Decimal("390.00"), 30),
    ("CH-2026-023", "MH02CB9988", "Coarse Aggregate 10mm (Ton)", "Mumbai, Maharashtra", Decimal("40.00"), Decimal("1100.00"), 30),
    ("CH-2026-024", "DL-SPECIAL-99", "Pre-Cast Concrete Curb Stones", "Delhi NCR", Decimal("120.00"), Decimal("340.00"), 32),
    ("CH-2026-025", "KA01AB4321", "Havells 4 sq mm Copper Cable 100m", "Bengaluru, Karnataka", Decimal("25.00"), Decimal("3450.00"), 34),
    ("CH-2026-025", "KA01AB4321", "Havells LED Panel Light 15W", "Bengaluru, Karnataka", Decimal("50.00"), Decimal("420.00"), 34),
    ("CH-2026-026", "TN07CD8765", "Hindware One-Piece Water Closet", "Coimbatore, Tamil Nadu", Decimal("8.00"), Decimal("9500.00"), 36),
    ("CH-2026-026", "TN07CD8765", "Jaquar Chrome Basin Mixer Tap", "Coimbatore, Tamil Nadu", Decimal("12.00"), Decimal("3200.00"), 36),
    ("CH-2026-027", "GJ03EF2468", "Kajaria Glazed Vitrified Tiles 800x800", "Rajkot, Gujarat", Decimal("85.00"), Decimal("850.00"), 38),
    ("CH-2026-028", "HR10GH1357", "Tata Shaktee Corrugated GI Sheet 10ft", "Panipat, Haryana", Decimal("30.00"), Decimal("1250.00"), 40),
    ("CH-2026-029", "UP14JK9876", "Fosroc Conbextra GP Non-Shrink Grout", "Ghaziabad, Uttar Pradesh", Decimal("40.00"), Decimal("980.00"), 42),
    ("CH-2026-029", "UP14JK9876", "Sika Plastocrete Plus Admixture 20L", "Ghaziabad, Uttar Pradesh", Decimal("15.00"), Decimal("2200.00"), 42),
    ("CH-2026-030", "WB01LM5544", "CenturyPly Marine Grade Plywood 8x4", "Kolkata, West Bengal", Decimal("35.00"), Decimal("2850.00"), 44),
    ("CH-2026-031", "RJ02NP7711", "Kota Stone Slabs Natural Finish (sq ft)", "Kota, Rajasthan", Decimal("450.00"), Decimal("48.00"), 46),
    ("CH-2026-032", "AP03QR8833", "Jindal Stainless Steel Railing Pipe 2-inch", "Visakhapatnam, Andhra Pradesh", Decimal("22.00"), Decimal("2400.00"), 48),
    ("CH-2026-033", "TS08ST4422", "Polycarbonate Roofing Sheet Clear 2mm", "Warangal, Telangana", Decimal("18.00"), Decimal("3800.00"), 50),
    ("CH-2026-034", "TRACTOR-SITE-04", "Solid Concrete Masonry Blocks 400x200", "Surat, Gujarat", Decimal("300.00"), Decimal("65.00"), 52),
    ("CH-2026-035", "KL01UV9911", "Nerolac Synthetic Enamel Gloss White 20L", "Thiruvananthapuram, Kerala", Decimal("16.00"), Decimal("3900.00"), 53),
    ("CH-2026-035", "KL01UV9911", "NC Thinner Premium Grade 5L Can", "Thiruvananthapuram, Kerala", Decimal("24.00"), Decimal("750.00"), 53),
    ("CH-2026-036", "MP04WX6633", "Glass Wool Thermal Insulation Roll 50mm", "Bhopal, Madhya Pradesh", Decimal("20.00"), Decimal("1850.00"), 54),
    ("CH-2026-037", "PB02YZ1188", "Armstrong Acoustic Ceiling Tile 2x2", "Amritsar, Punjab", Decimal("60.00"), Decimal("620.00"), 55),
    ("CH-2026-038", "CH02AA5500", "Fire Rated Steel Door 120min 2.1x1m", "Chandigarh", Decimal("4.00"), Decimal("18500.00"), 56),
    ("CH-2026-039", "DL08BC7722", "Anchor Roma Modular Switches Pack 20", "Delhi NCR", Decimal("15.00"), Decimal("1400.00"), 57),
    ("CH-2026-039", "DL08BC7722", "Anchor Roma 6M Modular Base Plate", "Delhi NCR", Decimal("25.00"), Decimal("180.00"), 57),
    ("CH-2026-040", "MH01DE3399", "Bitumen VG-30 Paving Grade (Drum 200kg)", "Mumbai, Maharashtra", Decimal("10.00"), Decimal("9200.00"), 58),
    ("CH-2026-041", "KA04FG8811", "Solar Water Heater 200 LPD (Tata Power)", "Mysuru, Karnataka", Decimal("3.00"), Decimal("32000.00"), 59),
    ("CH-2026-042", "HR03HJ2244", "Epoxy Flooring Resin Self-Leveling 20kg", "Sonipat, Haryana", Decimal("12.00"), Decimal("5400.00"), 60),
    ("CH-2026-043", "UP70KL9933", "uPVC Sliding Window 3-Track 5x4 ft", "Prayagraj, Uttar Pradesh", Decimal("6.00"), Decimal("7800.00"), 60),
    ("CH-2026-043", "UP70KL9933", "Toughened Safety Glass 8mm (sq ft)", "Prayagraj, Uttar Pradesh", Decimal("140.00"), Decimal("115.00"), 60),
    ("CH-2026-044", "GJ01MN6677", "Coromandel King Cement 50kg", "Surat, Gujarat", Decimal("160.00"), Decimal("370.00"), 60),
    ("CH-2026-045", "DL12PQ3344", "Mild Steel Square Tube 50x50x3mm 6m", "Delhi NCR", Decimal("30.00"), Decimal("1420.00"), 60),
]


def seed_database():
    db = SessionLocal()
    try:
        # 1. Seed or sync Admin User
        admin_user = db.query(User).filter(User.email == settings.INITIAL_ADMIN_EMAIL).first()
        if not admin_user:
            admin_user = User(
                name=settings.INITIAL_ADMIN_NAME,
                email=settings.INITIAL_ADMIN_EMAIL,
                password_hash=get_password_hash(settings.INITIAL_ADMIN_PASSWORD),
                role=UserRole.ADMIN.value,
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print(f"Created initial admin user: {admin_user.email} (Role: {admin_user.role})")
        else:
            admin_user.password_hash = get_password_hash(settings.INITIAL_ADMIN_PASSWORD)
            admin_user.role = UserRole.ADMIN.value
            admin_user.is_active = True
            db.commit()
            print(f"Synced existing admin user credentials: {admin_user.email}")

        # Sync sample staff user
        staff_email = "staff@challango.in"
        staff_user = db.query(User).filter(User.email == staff_email).first()
        if not staff_user:
            staff_user = User(
                name="Ramesh Kumar (Staff)",
                email=staff_email,
                password_hash=get_password_hash("Staff@123456"),
                role=UserRole.STAFF.value,
                is_active=True,
            )
            db.add(staff_user)
            db.commit()
            db.refresh(staff_user)
            print(f"Created sample staff user: {staff_user.email} (Role: {staff_user.role})")
        else:
            staff_user.password_hash = get_password_hash("Staff@123456")
            staff_user.is_active = True
            db.commit()
            print(f"Synced existing staff user credentials: {staff_user.email}")

        # 2. Seed sample catalog products
        seeded_products_count = 0
        for prod_name, prod_price in SAMPLE_PRODUCTS:
            existing_prod = db.query(Product).filter(func.lower(Product.name) == prod_name.lower()).first()
            if not existing_prod:
                new_prod = Product(
                    name=prod_name,
                    default_unit_price=prod_price,
                    is_active=True,
                    created_by=admin_user.id,
                )
                db.add(new_prod)
                seeded_products_count += 1
        if seeded_products_count > 0:
            db.commit()
            print(f"Successfully seeded {seeded_products_count} catalog products.")
        else:
            print("All catalog products already present.")

        # 3. Seed realistic entries
        now = datetime.now(timezone.utc)
        inserted_count = 0

        for challan, vehicle, prod, dest, qty, unit_p, days in SAMPLE_ENTRIES:
            normalized_v = normalize_vehicle_no(vehicle)
            # Check if this exact challan + product already exists
            existing = (
                db.query(Entry)
                .filter(
                    Entry.challan_no == challan,
                    Entry.product == prod,
                )
                .first()
            )
            if not existing:
                total_p = (qty * unit_p).quantize(Decimal("0.01"))
                entry_date = now - timedelta(days=days, hours=(abs(hash(prod)) % 12))
                entry = Entry(
                    challan_no=challan,
                    vehicle_no=normalized_v,
                    product=prod,
                    destination=dest,
                    destination_lat=None,
                    destination_lng=None,
                    quantity=qty,
                    unit_price=unit_p,
                    total_price=total_p,
                    created_at=entry_date,
                    updated_at=entry_date,
                    created_by=admin_user.id,
                    updated_by=admin_user.id,
                    is_deleted=False,
                )
                db.add(entry)
                inserted_count += 1
            elif not existing.destination:
                existing.destination = dest

        if inserted_count > 0:
            db.flush()
            audit_log = AuditLog(
                user_id=admin_user.id,
                action=AuditAction.IMPORT.value,
                entry_id=None,
                details={"message": f"Seeded {inserted_count} new challan entries."},
            )
            db.add(audit_log)
            db.commit()
            print(f"Successfully seeded {inserted_count} new sample challan entries.")
        else:
            print(f"All sample entries already present. No new entries added.")

        total_active_entries = db.query(Entry).filter(Entry.is_deleted.is_(False)).count()
        print(f"Total active challan entries in database: {total_active_entries}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
