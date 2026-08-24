import base64
from io import BytesIO
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

# --- Account Lockout Tests ---
# NOTE: these deliberately avoid hammering /api/auth/login repeatedly — that
# endpoint shares a 10/minute rate limit across the whole test session (keyed
# by the TestClient's fixed source IP), so repeated real failed-login HTTP
# calls here would eat into the same budget as every other login test in this
# file and risk flaky 429s unrelated to what's actually being tested.

def test_account_lockout_logic(db):
    from app.core.utils import is_login_locked_out, record_failed_login, clear_failed_logins
    from app.core.config import settings
    email = "lockout-logic-test@company.com"
    clear_failed_logins(email)
    try:
        assert is_login_locked_out(email) is False
        for _ in range(settings.FAILED_LOGIN_LOCKOUT_THRESHOLD):
            record_failed_login(email)
        assert is_login_locked_out(email) is True
    finally:
        clear_failed_logins(email)
    assert is_login_locked_out(email) is False

def test_login_endpoint_returns_429_when_locked_out(client):
    from app.core.utils import record_failed_login, clear_failed_logins
    from app.core.config import settings
    email = "lockout-http-test@company.com"
    clear_failed_logins(email)
    try:
        for _ in range(settings.FAILED_LOGIN_LOCKOUT_THRESHOLD):
            record_failed_login(email)
        res = client.post("/api/auth/login", json={"email": email, "password": "irrelevant"})
        assert res.status_code == 429
        assert "too many failed login attempts" in res.json()["detail"].lower()
    finally:
        clear_failed_logins(email)

def test_successful_login_clears_lockout_counter(client):
    from app.core.utils import record_failed_login, is_login_locked_out, clear_failed_logins
    email = "test_employee@company.com"
    clear_failed_logins(email)
    record_failed_login(email)  # one failure, well under the threshold
    res = client.post("/api/auth/login", json={"email": email, "password": "employeepassword"})
    assert res.status_code == 200
    assert is_login_locked_out(email) is False

# --- MFA (TOTP) Tests ---

def test_mfa_full_enrollment_and_login_flow(admin_client, client, db):
    import pyotp
    from app.models.models import User

    # 1. Setup returns a secret + QR code, but doesn't enable MFA yet
    setup_res = admin_client.post("/api/auth/mfa/setup")
    assert setup_res.status_code == 200
    secret = setup_res.json()["secret"]
    assert setup_res.json()["qr_code_base64"].startswith("data:image/png;base64,")

    db.expire_all()
    admin_user = db.query(User).filter(User.email == "test_admin@company.com").first()
    assert admin_user.mfa_enabled is False

    # 2. Enable requires proving possession of the authenticator
    enable_res = admin_client.post("/api/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()})
    assert enable_res.status_code == 200

    db.expire_all()
    admin_user = db.query(User).filter(User.email == "test_admin@company.com").first()
    assert admin_user.mfa_enabled is True

    # 3. A real login now returns a challenge instead of a session
    login_res = client.post("/api/auth/login", json={"email": "test_admin@company.com", "password": "adminpassword"})
    assert login_res.status_code == 200
    login_body = login_res.json()
    assert login_body["mfa_required"] is True
    assert "access_token" not in login_res.cookies
    mfa_token = login_body["mfa_token"]

    # 4. Verifying with a fresh valid code completes the session
    verify_res = client.post("/api/auth/mfa/verify", json={"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()})
    assert verify_res.status_code == 200
    assert verify_res.json()["user"]["email"] == "test_admin@company.com"
    assert "access_token" in verify_res.cookies
    assert "refresh_token" in verify_res.cookies

def test_mfa_verify_rejects_invalid_code(admin_client, client):
    import pyotp
    secret = admin_client.post("/api/auth/mfa/setup").json()["secret"]
    admin_client.post("/api/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()})

    login_res = client.post("/api/auth/login", json={"email": "test_admin@company.com", "password": "adminpassword"})
    mfa_token = login_res.json()["mfa_token"]

    bad_res = client.post("/api/auth/mfa/verify", json={"mfa_token": mfa_token, "code": "000000"})
    assert bad_res.status_code == 400

def test_mfa_disable_requires_correct_password(admin_client, db):
    import pyotp
    from app.models.models import User

    secret = admin_client.post("/api/auth/mfa/setup").json()["secret"]
    admin_client.post("/api/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()})

    wrong_res = admin_client.post("/api/auth/mfa/disable", json={"password": "wrongpassword"})
    assert wrong_res.status_code == 400

    ok_res = admin_client.post("/api/auth/mfa/disable", json={"password": "adminpassword"})
    assert ok_res.status_code == 200

    db.expire_all()
    admin_user = db.query(User).filter(User.email == "test_admin@company.com").first()
    assert admin_user.mfa_enabled is False
    assert admin_user.totp_secret is None

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

# --- Password Strength Validation Tests ---

def test_password_strength_rejected_on_employee_create(admin_client):
    weak_payload = {
        "email": "weakpass@company.com",
        "password": "weak",
        "role": "Employee",
        "profile": {
            "first_name": "Weak",
            "last_name": "Pass",
            "employee_id": "EMP999",
        }
    }
    res = admin_client.post("/api/employees/", json=weak_payload)
    assert res.status_code == 422

def test_password_strength_rejected_on_change_password(employee_client):
    # No digit / no uppercase -> rejected before it ever reaches the handler
    res = employee_client.post(
        "/api/auth/change-password",
        json={"old_password": "employeepassword", "new_password": "alllowercase"}
    )
    assert res.status_code == 422

def test_strong_password_accepted_on_change_password(employee_client):
    res = employee_client.post(
        "/api/auth/change-password",
        json={"old_password": "employeepassword", "new_password": "NewStrongPass1"}
    )
    assert res.status_code == 200

# --- Avatar Upload Content Validation Tests ---

def test_avatar_upload_rejects_non_image_content(employee_client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    fake_file = BytesIO(b"not actually an image, just plain text bytes")
    res = employee_client.post(
        f"/api/employees/{emp_profile.user_id}/upload-avatar",
        files={"file": ("fake.jpg", fake_file, "image/jpeg")}
    )
    assert res.status_code == 400
    assert "not a valid image" in res.json()["detail"].lower()

def test_avatar_upload_accepts_real_image(employee_client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    png_bytes = base64.b64decode(tiny_png_b64)
    res = employee_client.post(
        f"/api/employees/{emp_profile.user_id}/upload-avatar",
        files={"file": ("avatar.png", BytesIO(png_bytes), "image/png")}
    )
    assert res.status_code == 200
    assert "profile_image_url" in res.json()

# --- Employee Admin CRUD Lifecycle Tests ---

def test_create_employee_admin_flow(admin_client, employee_client, db):
    payload = {
        "email": "new.hire@company.com",
        "password": "NewHireStrongPass1",
        "role": "Employee",
        "profile": {
            "first_name": "New",
            "last_name": "Hire",
            "employee_id": "EMP500",
        }
    }
    res = admin_client.post("/api/employees/", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "new.hire@company.com"
    assert body["profile"]["employee_id"] == "EMP500"

    # Duplicate email is rejected
    dup_res = admin_client.post("/api/employees/", json=payload)
    assert dup_res.status_code == 400

    # Non-admins cannot create employees
    forbidden_res = employee_client.post("/api/employees/", json={**payload, "email": "other@company.com", "profile": {**payload["profile"], "employee_id": "EMP501"}})
    assert forbidden_res.status_code == 403

def test_toggle_employee_status_admin_only(admin_client, employee_client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    user_id = emp_profile.user_id

    forbidden_res = employee_client.patch(f"/api/employees/{user_id}/toggle-status")
    assert forbidden_res.status_code == 403

    res = admin_client.patch(f"/api/employees/{user_id}/toggle-status")
    assert res.status_code == 200

    db.expire_all()
    user = db.query(User).filter(User.id == user_id).first()
    assert user.is_active is False

def test_admin_reset_employee_password(admin_client, client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    user_id = emp_profile.user_id

    res = admin_client.post(f"/api/employees/{user_id}/reset-password", json={"new_password": "AdminSetPass1"})
    assert res.status_code == 200

    # Weak password rejected by the same strength validator used everywhere else
    weak_res = admin_client.post(f"/api/employees/{user_id}/reset-password", json={"new_password": "weak"})
    assert weak_res.status_code == 422

    # New password actually works for login
    login_res = client.post("/api/auth/login", json={"email": "test_employee@company.com", "password": "AdminSetPass1"})
    assert login_res.status_code == 200

def test_delete_employee_admin_only(admin_client, employee_client, db):
    emp_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    user_id = emp_profile.user_id

    forbidden_res = employee_client.delete(f"/api/employees/{user_id}")
    assert forbidden_res.status_code == 403

    res = admin_client.delete(f"/api/employees/{user_id}")
    assert res.status_code == 200

    db.expire_all()
    assert db.query(User).filter(User.id == user_id).first() is None

def test_department_create_and_duplicate_rejection(admin_client, employee_client):
    res = admin_client.post("/api/employees/departments", json={"name": "Legal", "description": "Legal & Compliance"})
    assert res.status_code == 200

    dup_res = admin_client.post("/api/employees/departments", json={"name": "Legal", "description": "duplicate"})
    assert dup_res.status_code == 400

    forbidden_res = employee_client.post("/api/employees/departments", json={"name": "Another Dept"})
    assert forbidden_res.status_code == 403

# --- Dashboard Analytics Tests ---

def test_admin_dashboard_returns_expected_shape(admin_client, employee_client):
    forbidden_res = employee_client.get("/api/dashboard/admin")
    assert forbidden_res.status_code == 403

    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    body = res.json()
    assert "cards" in body
    assert "total_employees" in body["cards"]
    assert "graphs" in body
    assert "daily" in body["graphs"] and "monthly" in body["graphs"]
    assert "needs_attention" in body
    assert "currently_working" in body

def test_employee_dashboard_returns_expected_shape(employee_client):
    res = employee_client.get("/api/dashboard/employee")
    assert res.status_code == 200
    body = res.json()
    assert "today" in body
    assert "status" in body["today"]
    assert "stats" in body
    assert "leave_balances" in body["stats"]

def test_employee_dashboard_reflects_after_clock_in(employee_client):
    clock_in_payload = {
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "gps_accuracy": 10.0,
    }
    employee_client.post("/api/attendance/clock-in", json=clock_in_payload)

    res = employee_client.get("/api/dashboard/employee")
    assert res.status_code == 200
    assert res.json()["today"]["status"] in ["Present", "Late", "Work From Home"]
    assert res.json()["today"]["clock_in"] is not None

# --- Office Settings Tests ---

def test_office_settings_get_creates_default_then_admin_can_update(admin_client, employee_client):
    get_res = employee_client.get("/api/settings/office")
    assert get_res.status_code == 200

    forbidden_res = employee_client.put("/api/settings/office", json={"allowed_radius": 200.0})
    assert forbidden_res.status_code == 403

    update_res = admin_client.put("/api/settings/office", json={"allowed_radius": 200.0, "timezone": "Asia/Kolkata"})
    assert update_res.status_code == 200
    assert update_res.json()["allowed_radius"] == 200.0

# --- General Attendance Reports & Exports Tests ---

def test_reports_summary_and_csv_export(admin_client, employee_client):
    forbidden_res = employee_client.get("/api/reports/summary")
    assert forbidden_res.status_code == 403

    summary_res = admin_client.get("/api/reports/summary")
    assert summary_res.status_code == 200
    assert isinstance(summary_res.json(), list)

    csv_res = admin_client.get("/api/reports/export/csv")
    assert csv_res.status_code == 200
    assert "csv" in csv_res.headers["content-type"]

def test_reports_excel_and_pdf_export(admin_client):
    excel_res = admin_client.get("/api/reports/export/excel")
    assert excel_res.status_code == 200
    assert "spreadsheetml" in excel_res.headers["content-type"]

    pdf_res = admin_client.get("/api/reports/export/pdf")
    assert pdf_res.status_code == 200
    assert "pdf" in pdf_res.headers["content-type"]

def test_reports_reflect_attendance_data(admin_client, employee_client):
    clock_in_payload = {
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "gps_accuracy": 10.0,
    }
    employee_client.post("/api/attendance/clock-in", json=clock_in_payload)

    res = admin_client.get("/api/reports/summary")
    assert res.status_code == 200
    data = res.json()
    assert any(row["employee_id"] == "EMP001" for row in data)

# --- Multi-Tenant SaaS Tests ---

def test_multi_tenant_company_registration(client, db):
    payload = {
        "company_name": "Zenith Cloud Solutions",
        "company_slug": "zenith-cloud",
        "admin_name": "Vikram Malhotra",
        "admin_email": "vikram@zenithcloud.com",
        "admin_password": "SecurePassword123",
        "admin_phone": "+91 98111 22233",
        "designation": "Chief Technology Officer",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "allowed_radius": 200.0
    }

    res = client.post("/api/auth/register-company", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["message"] == "Login successful"
    assert body["user"]["email"] == "vikram@zenithcloud.com"
    assert body["user"]["organization_name"] == "Zenith Cloud Solutions"
    assert body["user"]["organization_slug"] == "zenith-cloud"
    assert body["user"]["role"] == "Admin"
    assert "access_token" in res.cookies

    # Duplicate slug registration should fail
    dup_res = client.post("/api/auth/register-company", json=payload)
    assert dup_res.status_code == 400
    assert "already registered" in dup_res.json()["detail"]

def test_multi_tenant_data_isolation(client, db):
    # 1. Register Company A
    reg_a = client.post("/api/auth/register-company", json={
        "company_name": "Alpha Corp",
        "company_slug": "alpha-corp",
        "admin_name": "Admin Alpha",
        "admin_email": "admin@alpha.com",
        "admin_password": "AlphaPassword123"
    })
    assert reg_a.status_code == 200
    token_a = reg_a.cookies["access_token"]

    # 2. Register Company B
    reg_b = client.post("/api/auth/register-company", json={
        "company_name": "Beta Industries",
        "company_slug": "beta-ind",
        "admin_name": "Admin Beta",
        "admin_email": "admin@beta.com",
        "admin_password": "BetaPassword123"
    })
    assert reg_b.status_code == 200
    token_b = reg_b.cookies["access_token"]

    # 3. Create employee in Company A
    client.cookies.set("access_token", token_a)
    create_emp_res = client.post("/api/employees/", json={
        "email": "dev@alpha.com",
        "password": "DevPassword123",
        "role": "Employee",
        "profile": {
            "first_name": "Alpha",
            "last_name": "Dev",
            "employee_id": "ALP001"
        }
    })
    assert create_emp_res.status_code == 200

    # 4. Company A Admin sees the new employee
    emp_list_a = client.get("/api/employees/").json()
    assert any(e["email"] == "dev@alpha.com" for e in emp_list_a)

    # 5. Switch to Company B Admin - must NOT see Company A's employee
    client.cookies.set("access_token", token_b)
    emp_list_b = client.get("/api/employees/").json()
    assert not any(e["email"] == "dev@alpha.com" for e in emp_list_b)

    # 6. Company B can create employee with SAME employee_id "ALP001" without collision!
    create_b_emp = client.post("/api/employees/", json={
        "email": "dev@beta.com",
        "password": "DevPassword123",
        "role": "Employee",
        "profile": {
            "first_name": "Beta",
            "last_name": "Dev",
            "employee_id": "ALP001"
        }
    })
    assert create_b_emp.status_code == 200

# --- AI HR Assistant & Company Policy Tests ---

def test_company_policy_crud_and_tenant_isolation(admin_client, employee_client, client):
    # 1. Admin creates a new custom company policy
    create_res = admin_client.post("/api/assistant/policies", json={
        "title": "Gym & Wellness Allowance",
        "category": "Benefits",
        "content": "All full-time employees are eligible for INR 2,000 monthly fitness reimbursement.",
        "is_published": True
    })
    assert create_res.status_code == 200
    policy_id = create_res.json()["id"]
    assert create_res.json()["title"] == "Gym & Wellness Allowance"

    # 2. Employee can read published policies
    emp_policies_res = employee_client.get("/api/assistant/policies")
    assert emp_policies_res.status_code == 200
    policies = emp_policies_res.json()
    assert any(p["id"] == policy_id for p in policies)

    # 3. Employee cannot create/update/delete policies
    emp_create_fail = employee_client.post("/api/assistant/policies", json={
        "title": "Unauthorized Policy",
        "category": "General",
        "content": "Test"
    })
    assert emp_create_fail.status_code == 403

    # 4. Admin updates policy
    update_res = admin_client.put(f"/api/assistant/policies/{policy_id}", json={
        "title": "Gym & Health Club Allowance",
        "content": "Updated reimbursement limit to INR 2,500 monthly."
    })
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Gym & Health Club Allowance"

    # 5. Cross-tenant isolation check: Register Company C and ensure it cannot see Company A's policy
    reg_c = client.post("/api/auth/register-company", json={
        "company_name": "Gamma Tech",
        "company_slug": "gamma-tech",
        "admin_name": "Admin Gamma",
        "admin_email": "admin@gamma.com",
        "admin_password": "GammaPassword123"
    })
    assert reg_c.status_code == 200
    token_c = reg_c.cookies["access_token"]
    client.cookies.set("access_token", token_c)

    gamma_policies = client.get("/api/assistant/policies").json()
    assert not any(p["title"] == "Gym & Health Club Allowance" for p in gamma_policies)

    # 6. Admin deletes policy
    del_res = admin_client.delete(f"/api/assistant/policies/{policy_id}")
    assert del_res.status_code == 200

def test_ai_assistant_chat_policy_and_balance_answering(employee_client, db):
    # 1. Ask about leave balance
    res_leave = employee_client.post("/api/assistant/chat", json={
        "message": "How many casual and sick leaves do I have remaining?"
    })
    assert res_leave.status_code == 200
    body_leave = res_leave.json()
    assert "Casual" in body_leave["reply"]
    assert "12" in body_leave["reply"] # Default test employee casual balance is 12
    assert len(body_leave["sources"]) > 0

    # 2. Ask about office timings
    res_timing = employee_client.post("/api/assistant/chat", json={
        "message": "What are our official office timings and working hours?"
    })
    assert res_timing.status_code == 200
    body_timing = res_timing.json()
    assert "10:00" in body_timing["reply"] or "office" in body_timing["reply"].lower()

    # 3. Ask about general policy help
    res_help = employee_client.post("/api/assistant/chat", json={
        "message": "Hi, what policies can you help me with?"
    })
    assert res_help.status_code == 200
    assert "Assistant" in res_help.json()["reply"]



