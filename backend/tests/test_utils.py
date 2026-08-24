import io
import pytest
from datetime import date, time
from PIL import Image
from app.core.utils import (
    calculate_haversine_distance, is_wfh_active, get_day_status_for_employee,
    get_safe_timezone, validate_image_bytes, log_audit
)
from app.models.models import EmployeeProfile, OfficeSetting, Holiday, AuditLog

def test_calculate_haversine_distance():
    # Coords of New Delhi (28.6139, 77.2090)
    dist_same = calculate_haversine_distance(28.6139, 77.2090, 28.6139, 77.2090)
    assert dist_same == 0.0

    # Dist between New Delhi and Faridabad (approx 28.4089, 77.3178)
    dist_far = calculate_haversine_distance(28.6139, 77.2090, 28.4089, 77.3178)
    assert dist_far > 20000.0 # > 20km

def test_haversine_coordinate_clamping():
    # Test values exceeding ±90 lat and ±180 lon are clamped safely
    dist = calculate_haversine_distance(100.0, 200.0, 90.0, 180.0)
    assert dist == 0.0

def test_is_wfh_active():
    profile = EmployeeProfile(
        wfh_enabled=True,
        wfh_start_date=date(2026, 8, 1),
        wfh_end_date=date(2026, 8, 10),
        wfh_reason="Work from home"
    )

    # Active WFH dates
    assert is_wfh_active(profile, date(2026, 8, 5)) is True
    assert is_wfh_active(profile, date(2026, 8, 1)) is True
    assert is_wfh_active(profile, date(2026, 8, 10)) is True

    # Inactive WFH dates
    assert is_wfh_active(profile, date(2026, 7, 31)) is False
    assert is_wfh_active(profile, date(2026, 8, 11)) is False

    # Disabled profile
    profile.wfh_enabled = False
    assert is_wfh_active(profile, date(2026, 8, 5)) is False

def test_is_wfh_active_edge_cases():
    # None profile
    assert is_wfh_active(None, date(2026, 8, 5)) is False

    # wfh_enabled without date range (permanent WFH)
    profile = EmployeeProfile(wfh_enabled=True, wfh_start_date=None, wfh_end_date=None)
    assert is_wfh_active(profile, date(2026, 8, 5)) is True

    # Only start date specified
    profile_start = EmployeeProfile(wfh_enabled=True, wfh_start_date=date(2026, 8, 5), wfh_end_date=None)
    assert is_wfh_active(profile_start, date(2026, 8, 6)) is True
    assert is_wfh_active(profile_start, date(2026, 8, 4)) is False

    # Only end date specified
    profile_end = EmployeeProfile(wfh_enabled=True, wfh_start_date=None, wfh_end_date=date(2026, 8, 10))
    assert is_wfh_active(profile_end, date(2026, 8, 9)) is True
    assert is_wfh_active(profile_end, date(2026, 8, 11)) is False

def test_get_safe_timezone():
    # Valid timezone
    tz_ist = get_safe_timezone("Asia/Kolkata")
    assert tz_ist is not None

    # Valid US timezone
    tz_ny = get_safe_timezone("America/New_York")
    assert tz_ny is not None

    # Invalid / Garbage timezone should safely fallback to IST without throwing
    tz_fallback = get_safe_timezone("Invalid/NonExistent_TZ")
    assert tz_fallback is not None

    # None / Empty fallback
    tz_none = get_safe_timezone(None)
    assert tz_none is not None

def test_validate_image_bytes_valid_and_corrupt():
    # 1. Create valid in-memory PNG
    img = Image.new("RGB", (100, 100), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    valid_png_bytes = buf.getvalue()

    validate_image_bytes(valid_png_bytes)  # Should pass without exception

    # 2. Corrupt / Non-image bytes should raise ValueError
    with pytest.raises(ValueError):
        validate_image_bytes(b"NOT_A_VALID_IMAGE_DATA_STRING")

    # 3. Empty bytes should raise ValueError
    with pytest.raises(ValueError):
        validate_image_bytes(b"")

def test_get_day_status_for_employee(db):
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    settings = db.query(OfficeSetting).first()

    # 1. Test WFH Active status
    profile.wfh_enabled = True
    profile.wfh_start_date = date(2026, 8, 1)
    profile.wfh_end_date = date(2026, 8, 10)
    status_wfh = get_day_status_for_employee(db, profile.user_id, date(2026, 8, 5), profile, settings)
    assert status_wfh == "Work From Home"

    # Reset WFH
    profile.wfh_enabled = False
    db.commit()

    # 2. Test Weekend status (Saturday/Sunday)
    sat_date = date(2026, 8, 8)
    status_sat = get_day_status_for_employee(db, profile.user_id, sat_date, profile, settings)
    assert status_sat == "Weekend"

    # 3. Test Holiday status
    new_holiday = Holiday(organization_id=profile.organization_id, name="Test Holiday", date=date(2026, 8, 15), description="Independence Day")
    db.add(new_holiday)
    db.commit()
    
    status_holiday = get_day_status_for_employee(db, profile.user_id, date(2026, 8, 15), profile, settings)
    assert status_holiday == "Holiday"

    # 4. Test Absent status (Default on workday when not clocked in)
    status_workday = get_day_status_for_employee(db, profile.user_id, date(2026, 8, 7), profile, settings)
    assert status_workday == "Absent"

def test_log_audit_utility(db):
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    
    log_audit(
        db=db,
        user_id=profile.user_id,
        action="TEST_ACTION_EXECUTION",
        ip_address="127.0.0.1",
        details="Sample details for audit test",
        organization_id=profile.organization_id
    )

    audit_entry = db.query(AuditLog).filter(AuditLog.action == "TEST_ACTION_EXECUTION").first()
    assert audit_entry is not None
    assert audit_entry.user_id == profile.user_id
    assert audit_entry.ip_address == "127.0.0.1"
    assert audit_entry.organization_id == profile.organization_id
