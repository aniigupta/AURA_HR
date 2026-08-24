import base64
import pytest
from datetime import date, timedelta
from app.models.models import User, EmployeeProfile, Attendance, BreakSession

SAMPLE_SELFIE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_clock_in_success_inside_geofence(employee_client):
    # Coords match seeded office (28.3971956, 77.3131177)
    res = employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE,
        "gps_accuracy": 10.0
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ["Present", "Late", "Work From Home"]
    assert body["clock_in"] is not None

def test_clock_in_outside_geofence_rejected(client, db):
    # Create an employee that hasn't clocked in yet
    from app.core.security import get_password_hash, create_jwt_token
    from app.models.models import Organization
    org = db.query(Organization).first()

    u = User(organization_id=org.id, email="geo_tester@company.com", hashed_password=get_password_hash("pass"), role="Employee", is_active=True)
    db.add(u)
    db.flush()
    prof = EmployeeProfile(organization_id=org.id, user_id=u.id, first_name="Geo", last_name="Tester", employee_id="EMP_GEO_1")
    db.add(prof)
    db.commit()

    token = create_jwt_token(subject=u.id, role="Employee", organization_id=org.id)
    client.cookies.set("access_token", token)

    # Attempt clock-in from 50km away (Mumbai / random far coordinates)
    res = client.post("/api/attendance/clock-in", json={
        "latitude": 19.0760,
        "longitude": 72.8777,
        "selfie_base64": SAMPLE_SELFIE,
        "gps_accuracy": 10.0
    })
    assert res.status_code == 400
    assert "outside office" in res.json()["detail"].lower()

def test_clock_in_wfh_bypasses_geofence(client, db):
    from app.core.security import get_password_hash, create_jwt_token
    from app.models.models import Organization
    org = db.query(Organization).first()

    u = User(organization_id=org.id, email="wfh_tester@company.com", hashed_password=get_password_hash("pass"), role="Employee", is_active=True)
    db.add(u)
    db.flush()
    prof = EmployeeProfile(
        organization_id=org.id,
        user_id=u.id,
        first_name="WFH",
        last_name="Tester",
        employee_id="EMP_WFH_1",
        wfh_enabled=True
    )
    db.add(prof)
    db.commit()

    token = create_jwt_token(subject=u.id, role="Employee", organization_id=org.id)
    client.cookies.set("access_token", token)

    # Far coordinates but WFH is active
    res = client.post("/api/attendance/clock-in", json={
        "latitude": 19.0760,
        "longitude": 72.8777,
        "selfie_base64": SAMPLE_SELFIE,
        "gps_accuracy": 10.0
    })
    assert res.status_code == 200
    assert res.json()["is_wfh"] is True
    assert res.json()["status"] == "Work From Home"

def test_clock_in_duplicate_same_day_rejected(employee_client):
    # 1. First clock in
    res1 = employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })
    assert res1.status_code == 200

    # 2. Duplicate clock in attempt
    res2 = employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })
    assert res2.status_code == 400
    assert "already clocked in" in res2.json()["detail"].lower()

def test_clock_in_requires_selfie_for_employee(employee_client):
    res = employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": None
    })
    assert res.status_code == 400
    assert "selfie verification is required" in res.json()["detail"].lower()

def test_clock_in_suspicious_gps_accuracy(employee_client):
    res = employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE,
        "gps_accuracy": 500.0  # Accuracy > 200m is suspicious
    })
    assert res.status_code == 200
    assert res.json()["is_suspicious"] is True

def test_clock_out_without_clock_in_rejected(employee_client):
    res = employee_client.post("/api/attendance/clock-out")
    assert res.status_code == 400
    assert "must clock in first" in res.json()["detail"].lower()

def test_clock_out_calculates_working_hours(employee_client):
    # 1. Clock in
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    # 2. Clock out
    res = employee_client.post("/api/attendance/clock-out")
    assert res.status_code == 200
    body = res.json()
    assert body["clock_out"] is not None
    assert "working_hours" in body

def test_clock_out_duplicate_rejected(employee_client):
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })
    res1 = employee_client.post("/api/attendance/clock-out")
    assert res1.status_code == 200

    res2 = employee_client.post("/api/attendance/clock-out")
    assert res2.status_code == 400
    assert "already clocked out" in res2.json()["detail"].lower()

def test_break_session_full_lifecycle(employee_client):
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    # 1. Start break
    res_b1 = employee_client.post("/api/attendance/break/start")
    assert res_b1.status_code == 200
    assert "Break started" in res_b1.json()["message"]

    # 2. Duplicate break start -> error
    res_b_dup = employee_client.post("/api/attendance/break/start")
    assert res_b_dup.status_code == 400
    assert "already on a break" in res_b_dup.json()["detail"].lower()

    # 3. End break
    res_end = employee_client.post("/api/attendance/break/end")
    assert res_end.status_code == 200
    assert "Break ended" in res_end.json()["message"]

def test_end_break_when_not_on_break_rejected(employee_client):
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    res = employee_client.post("/api/attendance/break/end")
    assert res.status_code == 400
    assert "not on a break" in res.json()["detail"].lower()

def test_attendance_today_endpoint(employee_client):
    # Before clock-in
    res1 = employee_client.get("/api/attendance/today")
    assert res1.status_code == 200
    assert res1.json() is None

    # After clock-in
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })
    res2 = employee_client.get("/api/attendance/today")
    assert res2.status_code == 200
    assert res2.json()["date"] == date.today().isoformat()

def test_attendance_history_filters(admin_client, employee_client):
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    today_str = date.today().isoformat()
    res = admin_client.get(f"/api/attendance/history?start_date={today_str}&end_date={today_str}")
    assert res.status_code == 200
    assert len(res.json()) >= 1

def test_attendance_correction_request_lifecycle(employee_client, admin_client):
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()

    # 1. Employee creates correction request
    res_corr = employee_client.post("/api/attendance/corrections", json={
        "date": yesterday_str,
        "proposed_clock_in": f"{yesterday_str}T09:30:00Z",
        "proposed_clock_out": f"{yesterday_str}T18:30:00Z",
        "reason": "Forgot to clock out due to client meeting"
    })
    assert res_corr.status_code == 200
    corr_id = res_corr.json()["id"]

    # 2. Employee views correction requests
    emp_corrs = employee_client.get("/api/attendance/corrections")
    assert emp_corrs.status_code == 200
    assert any(c["id"] == corr_id for c in emp_corrs.json())

    # 3. Admin approves correction request
    review_res = admin_client.patch(f"/api/attendance/corrections/{corr_id}/review", json={
        "status": "Approved",
        "comment": "Approved after manager confirmation"
    })
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "Approved"

def test_attendance_correction_duplicate_pending_rejected(employee_client):
    yesterday_str = (date.today() - timedelta(days=2)).isoformat()

    employee_client.post("/api/attendance/corrections", json={
        "date": yesterday_str,
        "reason": "Reason 1"
    })

    # Duplicate pending for same date
    res_dup = employee_client.post("/api/attendance/corrections", json={
        "date": yesterday_str,
        "reason": "Reason 2"
    })
    assert res_dup.status_code == 400
    assert "already have a pending correction" in res_dup.json()["detail"].lower()
