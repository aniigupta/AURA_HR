import pytest
from datetime import date
from uuid import UUID
from app.models.models import User, EmployeeProfile, LeaveRequest

# --- Auth Endpoint Tests ---

def test_login_success(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "test_employee@company.com", "password": "employeepassword"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "test_employee@company.com"
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies

def test_login_invalid_credentials(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "test_employee@company.com", "password": "wrongpassword"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Incorrect email or password"

# --- Employee RBAC & Profile Wiping Fix Tests ---

def test_get_employees_list_rbac(admin_client, employee_client):
    # Admin can list all
    admin_response = admin_client.get("/api/employees/")
    assert admin_response.status_code == 200
    assert len(admin_response.json()) > 0

    # Employee is blocked
    emp_response = employee_client.get("/api/employees/")
    assert emp_response.status_code == 403
    assert emp_response.json()["detail"] == "Employees are not allowed to view other employee list"

def test_profile_update_integrity_bug_fix(employee_client, db):
    # Retrieve pre-update employee profile values
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    assert emp_profile.phone is None
    assert emp_profile.leave_balance_casual == 12
    assert emp_profile.leave_balance_sick == 10
    assert emp_profile.leave_balance_paid == 15
    user_id = emp_profile.user_id

    # Update only phone number using employee client
    response = employee_client.put(
        f"/api/employees/{user_id}",
        json={"phone": "+1 (555) 123-4567"}
    )
    assert response.status_code == 200

    # Refresh DB session
    db.expire_all()
    emp_profile_after = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    
    # Phone number MUST be updated
    assert emp_profile_after.phone == "+1 (555) 123-4567"
    
    # CRITICAL VERIFICATION: Leave balances, designation, and ID must NOT be wiped (set to NULL)
    assert emp_profile_after.leave_balance_casual == 12
    assert emp_profile_after.leave_balance_sick == 10
    assert emp_profile_after.leave_balance_paid == 15
    assert emp_profile_after.employee_id == "EMP001"

# --- Leave Management Double-Spend Validation Tests ---

def test_leave_double_spend_check(employee_client, admin_client, db):
    # Retrieve employee profile balances
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    emp_profile.leave_balance_casual = 5  # Give them exactly 5 casual days
    db.commit()

    # 1. Apply for a 3-day leave (Active WFH/GPS validation date check bypass)
    # Start: 2026-09-01 (Tuesday) to 2026-09-03 (Thursday) = 3 days
    req_body_1 = {
        "leave_type": "Casual",
        "start_date": "2026-09-01",
        "end_date": "2026-09-03",
        "reason": "Trip"
    }
    response_1 = employee_client.post("/api/leaves/", json=req_body_1)
    assert response_1.status_code == 200
    leave_1_id = response_1.json()["id"]

    # 2. Try to apply for another 3-day leave before the first is reviewed
    # Start: 2026-09-10 (Thursday) to 2026-09-12 (Saturday) = 3 days
    # Combined requested days: 3 + 3 = 6 days, which exceeds the balance of 5!
    # Expected: 400 Bad Request due to double-spend protection!
    req_body_2 = {
        "leave_type": "Casual",
        "start_date": "2026-09-10",
        "end_date": "2026-09-12",
        "reason": "Another Trip"
    }
    response_2 = employee_client.post("/api/leaves/", json=req_body_2)
    assert response_2.status_code == 400
    assert "Insufficient Casual Leave balance" in response_2.json()["detail"]

    # 3. Apply for a valid 2-day leave
    # Start: 2026-09-15 to 2026-09-16 = 2 days
    # Combined requested: 3 + 2 = 5 days (which exactly matches the balance of 5)
    # Expected: 200 Success
    req_body_3 = {
        "leave_type": "Casual",
        "start_date": "2026-09-15",
        "end_date": "2026-09-16",
        "reason": "Short Trip"
    }
    response_3 = employee_client.post("/api/leaves/", json=req_body_3)
    assert response_3.status_code == 200
    leave_2_id = response_3.json()["id"]

    # 4. Review and approve the first leave (3 days)
    # Deducts balance from 5 to 2
    approve_response = admin_client.patch(
        f"/api/leaves/{leave_1_id}/review",
        json={"status": "Approved", "comment": "Okay"}
    )
    assert approve_response.status_code == 200

    db.expire_all()
    emp_profile_after_1 = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    assert emp_profile_after_1.leave_balance_casual == 2

    # 5. Try to approve the second leave (2 days), but first reduce their balance manually to 1
    # This simulates a situation where another request was approved first and left them with insufficient balance.
    emp_profile_after_1.leave_balance_casual = 1
    db.commit()

    # Approving leave_2 (2 days) when balance is only 1 MUST fail!
    # Expected: 400 Bad Request due to strict balance review checks!
    approve_response_fail = admin_client.patch(
        f"/api/leaves/{leave_2_id}/review",
        json={"status": "Approved", "comment": "Force approve"}
    )
    assert approve_response_fail.status_code == 400
    assert "Insufficient Casual Leave balance" in approve_response_fail.json()["detail"]

# --- Salary & Payroll Report Tests ---

def test_employee_salary_and_payroll_report(admin_client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    user_id = emp_profile.user_id

    # 1. Update employee hourly rate to $30.00/hr
    update_res = admin_client.put(
        f"/api/employees/{user_id}",
        json={"hourly_rate": 30.0, "base_salary": 4800.0}
    )
    assert update_res.status_code == 200
    assert update_res.json()["profile"]["hourly_rate"] == 30.0

    # 2. Fetch Payroll Report
    today_str = date.today().isoformat()
    payroll_res = admin_client.get(f"/api/reports/payroll?start_date={today_str}&end_date={today_str}")
    assert payroll_res.status_code == 200
    data = payroll_res.json()
    assert isinstance(data, list)
    emp_data = next((item for item in data if item["employee_id"] == "EMP001"), None)
    assert emp_data is not None
    assert emp_data["hourly_rate"] == 30.0
    assert "working_salary" in emp_data
    assert "overtime_pay" in emp_data
    assert "total_salary" in emp_data

    # 3. Verify Payroll Excel export
    excel_res = admin_client.get(f"/api/reports/export/payroll?start_date={today_str}&end_date={today_str}")
    assert excel_res.status_code == 200
    assert "spreadsheetml" in excel_res.headers["content-type"]

    # 4. Verify Payroll PDF export
    pdf_res = admin_client.get(f"/api/reports/export/payroll/pdf?start_date={today_str}&end_date={today_str}")
    assert pdf_res.status_code == 200
    assert "pdf" in pdf_res.headers["content-type"]

# --- Security Headers & Centralized Error Handler Tests ---

def test_security_headers(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Content-Security-Policy" in response.headers

def test_validation_error_envelope(client):
    # Send empty invalid login body
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert data["errorCode"] == "VALIDATION_ERROR"
    assert "detail" in data

# --- Attendance Lifecycle & Break Tracking Tests ---

def test_attendance_and_break_lifecycle(employee_client, admin_client, db):
    # 1. Test out-of-bounds rejection
    tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    far_payload = {
        "latitude": 12.9716,  # Bengaluru (Far away)
        "longitude": 77.5946,
        "selfie_base64": tiny_png_b64,
        "gps_accuracy": 10.0,
        "device_info": "Test Device"
    }
    far_res = employee_client.post("/api/attendance/clock-in", json=far_payload)
    assert far_res.status_code == 400
    assert "outside office location" in far_res.json()["detail"]

    # 2. Clock in within office radius (28.3971956, 77.3131177)
    clock_in_payload = {
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": tiny_png_b64,
        "gps_accuracy": 10.0,
        "device_info": "Test Device"
    }
    cin_res = employee_client.post("/api/attendance/clock-in", json=clock_in_payload)
    assert cin_res.status_code == 200
    assert cin_res.json()["status"] in ["Present", "Late", "Work From Home"]

    # Prevent duplicate clock-in
    cin_dup = employee_client.post("/api/attendance/clock-in", json=clock_in_payload)
    assert cin_dup.status_code == 400
    assert "already clocked in" in cin_dup.json()["detail"]

    # 3. Start Break
    break_start_res = employee_client.post("/api/attendance/break/start")
    assert break_start_res.status_code == 200
    assert "Break started" in break_start_res.json()["message"]

    # 4. End Break
    break_end_res = employee_client.post("/api/attendance/break/end")
    assert break_end_res.status_code == 200
    assert "Break ended" in break_end_res.json()["message"]

    # 5. Clock Out
    cout_res = employee_client.post("/api/attendance/clock-out")
    assert cout_res.status_code == 200
    assert cout_res.json()["clock_out"] is not None

# --- Attendance Correction Request & Review Tests ---

def test_attendance_correction_flow(employee_client, admin_client):
    corr_payload = {
        "date": "2026-08-01",
        "proposed_clock_in": "2026-08-01T09:30:00Z",
        "proposed_clock_out": "2026-08-01T18:30:00Z",
        "reason": "Forgot to punch out due to client meeting"
    }
    create_res = employee_client.post("/api/attendance/corrections", json=corr_payload)
    assert create_res.status_code == 200
    corr_id = create_res.json()["id"]

    # Admin reviews and approves
    review_res = admin_client.patch(
        f"/api/attendance/corrections/{corr_id}/review",
        json={"status": "Approved", "comment": "Approved as per timesheet"}
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "Approved"

# --- Holiday Management Tests ---

def test_holiday_crud_flow(admin_client):
    holiday_payload = {
        "name": "Diwali Special Holiday",
        "date": "2026-11-09",
        "description": "Celebration holiday"
    }
    create_res = admin_client.post("/api/settings/holidays", json=holiday_payload)
    assert create_res.status_code == 200
    holiday_id = create_res.json()["id"]

    # Listing holidays
    list_res = admin_client.get("/api/settings/holidays")
    assert list_res.status_code == 200
    assert any(h["name"] == "Diwali Special Holiday" for h in list_res.json())

    # Deleting holiday
    del_res = admin_client.delete(f"/api/settings/holidays/{holiday_id}")
    assert del_res.status_code == 200

