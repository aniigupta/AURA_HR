import pytest
from datetime import date, time
from app.core.utils import calculate_haversine_distance, is_wfh_active, get_day_status_for_employee
from app.models.models import EmployeeProfile, OfficeSetting, Holiday

def test_calculate_haversine_distance():
    # Coords of New Delhi (28.6139, 77.2090)
    # Target coord is 50 meters away: (28.6139, 77.2095) approximately
    # Haversine check
    dist_same = calculate_haversine_distance(28.6139, 77.2090, 28.6139, 77.2090)
    assert dist_same == 0.0

    # Dist between New Delhi and Faridabad (approx 28.4089, 77.3178)
    dist_far = calculate_haversine_distance(28.6139, 77.2090, 28.4089, 77.3178)
    assert dist_far > 20000.0 # > 20km

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
    # 2026-08-08 is Saturday
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
    # 2026-08-07 is Friday
    status_workday = get_day_status_for_employee(db, profile.user_id, date(2026, 8, 7), profile, settings)
    assert status_workday == "Absent"
