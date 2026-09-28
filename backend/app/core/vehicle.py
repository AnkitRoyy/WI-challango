import re
from typing import Optional, Tuple

# Standard Indian vehicle registration format:
# 2 state letters + 1-2 RTO digits + 1-3 series letters + 4 registration digits (e.g. DL01AB1234, MH12D5678, HR26AAA9999)
# Also accounts for optional BH series (e.g. 22BH1234AA)
INDIAN_VEHICLE_REGEX = re.compile(
    r"^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$"
)


def normalize_vehicle_no(vehicle_no: str) -> str:
    """
    Normalizes vehicle registration numbers:
    - Uppercase
    - Strips all whitespace, hyphens, and dots
    Example: 'dl 01 ab-1234' -> 'DL01AB1234'
    """
    if not vehicle_no:
        return ""
    # Remove whitespace, hyphens, periods
    cleaned = re.sub(r"[\s\-\.]+", "", vehicle_no.strip())
    return cleaned.upper()


def validate_indian_vehicle_format(normalized_vehicle_no: str) -> Tuple[bool, Optional[str]]:
    """
    Validates against typical Indian vehicle registration formats.
    Returns (is_valid, warning_message).
    Never rejects the save — only produces an informative warning.
    """
    if not normalized_vehicle_no:
        return False, "Vehicle number is empty."

    if not INDIAN_VEHICLE_REGEX.match(normalized_vehicle_no):
        return (
            False,
            f"Vehicle number '{normalized_vehicle_no}' does not match standard Indian registration format (e.g. DL01AB1234)."
        )

    return True, None
