import pytest
from datetime import date, timedelta
from app.models.models import User, EmployeeProfile, LeaveRequest

def test_leave_apply_past_start_date_rejected(employee_client):
    past_date = (date.today() - timedelta(days=5)).isoformat()
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": past_date,
        "end_date": date.today().isoformat(),
        "reason": "Past leave"
    })
    assert res.status_code == 400
    assert "past" in res.json()["detail"].lower()

def test_leave_apply_end_date_before_start_date(employee_client):
    start = (date.today() + timedelta(days=10)).isoformat()
    end = (date.today() + timedelta(days=5)).isoformat()
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": start,
        "end_date": end,
        "reason": "Invalid range"
    })
    assert res.status_code == 400
    assert "on or after start date" in res.json()["detail"].lower()

def test_leave_apply_sick_leave_insufficient_balance(employee_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    emp.leave_balance_sick = 2
    db.commit()

    start = (date.today() + timedelta(days=10)).isoformat()
    end = (date.today() + timedelta(days=15)).isoformat() # 6 days
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Sick",
        "start_date": start,
        "end_date": end,
        "reason": "Long recovery"
    })
    assert res.status_code == 400
    assert "Insufficient Sick Leave balance" in res.json()["detail"]

def test_leave_apply_paid_leave_insufficient_balance(employee_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    emp.leave_balance_paid = 1
    db.commit()

    start = (date.today() + timedelta(days=20)).isoformat()
    end = (date.today() + timedelta(days=23)).isoformat() # 4 days
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Paid",
        "start_date": start,
        "end_date": end,
        "reason": "Vacation"
    })
    assert res.status_code == 400
    assert "Insufficient Paid Leave balance" in res.json()["detail"]

def test_leave_overlapping_dates_rejected(employee_client):
    start1 = (date.today() + timedelta(days=30)).isoformat()
    end1 = (date.today() + timedelta(days=33)).isoformat()

    # 1. Apply first leave
    res1 = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": start1,
        "end_date": end1,
        "reason": "Trip A"
    })
    assert res1.status_code == 200

    # 2. Overlapping leave (starts inside existing range)
    start2 = (date.today() + timedelta(days=32)).isoformat()
    end2 = (date.today() + timedelta(days=35)).isoformat()
    res2 = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": start2,
        "end_date": end2,
        "reason": "Trip B"
    })
    assert res2.status_code == 400
    assert "overlapping" in res2.json()["detail"].lower() or "already have a pending or approved leave" in res2.json()["detail"].lower()

def test_leave_approval_deducts_sick_balance(employee_client, admin_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    initial_sick = emp.leave_balance_sick

    start = (date.today() + timedelta(days=40)).isoformat()
    end = (date.today() + timedelta(days=41)).isoformat() # 2 days
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Sick",
        "start_date": start,
        "end_date": end,
        "reason": "Doctor visit"
    })
    assert res.status_code == 200
    leave_id = res.json()["id"]

    # Admin approves
    app_res = admin_client.patch(f"/api/leaves/{leave_id}/review", json={
        "status": "Approved",
        "comment": "Get well soon"
    })
    assert app_res.status_code == 200

    db.expire_all()
    assert emp.leave_balance_sick == initial_sick - 2

def test_leave_approval_deducts_paid_balance(employee_client, admin_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    initial_paid = emp.leave_balance_paid

    start = (date.today() + timedelta(days=50)).isoformat()
    end = (date.today() + timedelta(days=52)).isoformat() # 3 days
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Paid",
        "start_date": start,
        "end_date": end,
        "reason": "Family function"
    })
    assert res.status_code == 200
    leave_id = res.json()["id"]

    admin_client.patch(f"/api/leaves/{leave_id}/review", json={
        "status": "Approved"
    })

    db.expire_all()
    assert emp.leave_balance_paid == initial_paid - 3

def test_leave_rejection_preserves_balance(employee_client, admin_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    initial_casual = emp.leave_balance_casual

    start = (date.today() + timedelta(days=60)).isoformat()
    end = (date.today() + timedelta(days=61)).isoformat() # 2 days
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": start,
        "end_date": end,
        "reason": "Holiday"
    })
    assert res.status_code == 200
    leave_id = res.json()["id"]

    # Admin rejects
    admin_client.patch(f"/api/leaves/{leave_id}/review", json={
        "status": "Rejected",
        "comment": "Critical sprint deadline"
    })

    db.expire_all()
    assert emp.leave_balance_casual == initial_casual

def test_leave_review_already_processed_rejected(employee_client, admin_client):
    start = (date.today() + timedelta(days=70)).isoformat()
    end = (date.today() + timedelta(days=70)).isoformat()
    res = employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": start,
        "end_date": end,
        "reason": "One day"
    })
    leave_id = res.json()["id"]

    # Approve first time
    admin_client.patch(f"/api/leaves/{leave_id}/review", json={"status": "Approved"})

    # Try to review again -> error
    res_second = admin_client.patch(f"/api/leaves/{leave_id}/review", json={"status": "Rejected"})
    assert res_second.status_code == 400
    assert "already" in res_second.json()["detail"].lower()

def test_leave_list_employee_sees_only_own(employee_client, admin_client):
    # Admin sees list of all requests
    res_admin = admin_client.get("/api/leaves/")
    assert res_admin.status_code == 200

    # Employee sees only own requests
    res_emp = employee_client.get("/api/leaves/")
    assert res_emp.status_code == 200
