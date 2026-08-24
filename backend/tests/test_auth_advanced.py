import pytest
from app.models.models import User, Organization
from app.core.security import create_jwt_token

def test_register_company_invalid_email(client):
    res = client.post("/api/auth/register-company", json={
        "company_name": "Bad Email Corp",
        "company_slug": "bad-email-corp",
        "admin_name": "John Doe",
        "admin_email": "not-an-email",
        "admin_password": "Password123"
    })
    assert res.status_code == 422

def test_register_company_short_password(client):
    res = client.post("/api/auth/register-company", json={
        "company_name": "Short Pass Corp",
        "company_slug": "short-pass-corp",
        "admin_name": "John Doe",
        "admin_email": "john@shortpass.com",
        "admin_password": "123"
    })
    assert res.status_code == 422

def test_register_company_duplicate_admin_email_same_org(client):
    payload = {
        "company_name": "Unique Tech",
        "company_slug": "unique-tech",
        "admin_name": "Admin One",
        "admin_email": "admin@uniquetech.com",
        "admin_password": "Password123"
    }
    res1 = client.post("/api/auth/register-company", json=payload)
    assert res1.status_code == 200

    # Second attempt with same slug
    res2 = client.post("/api/auth/register-company", json=payload)
    assert res2.status_code == 400

def test_login_case_insensitivity(client):
    # Registered email is "test_employee@company.com"
    res = client.post("/api/auth/login", json={
        "email": "TEST_EMPLOYEE@COMPANY.COM",
        "password": "employeepassword"
    })
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "test_employee@company.com"

def test_refresh_token_rotation_flow(client):
    # 1. Login to get cookies
    login_res = client.post("/api/auth/login", json={
        "email": "test_employee@company.com",
        "password": "employeepassword"
    })
    assert login_res.status_code == 200
    assert "refresh_token" in login_res.cookies
    refresh_token = login_res.cookies["refresh_token"]

    # 2. Call /auth/refresh with refresh_token cookie
    client.cookies.set("refresh_token", refresh_token)
    ref_res = client.post("/api/auth/refresh")
    assert ref_res.status_code == 200
    assert "access_token" in ref_res.cookies

def test_refresh_token_invalid_or_tampered(client):
    client.cookies.set("refresh_token", "invalid.tampered.token")
    res = client.post("/api/auth/refresh")
    assert res.status_code in [400, 401]

def test_auth_me_authenticated_employee(employee_client):
    res = employee_client.get("/api/auth/me")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "test_employee@company.com"
    assert body["role"] == "Employee"
    assert body["organization_id"] is not None

def test_auth_me_authenticated_admin(admin_client):
    res = admin_client.get("/api/auth/me")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "test_admin@company.com"
    assert body["role"] == "Admin"

def test_auth_me_unauthenticated(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401

def test_password_change_correct_flow(employee_client):
    res = employee_client.post("/api/auth/change-password", json={
        "old_password": "employeepassword",
        "new_password": "NewEmployeePassword123"
    })
    assert res.status_code == 200
    assert res.json()["message"] == "Password changed successfully"

def test_password_change_wrong_old_password(employee_client):
    res = employee_client.post("/api/auth/change-password", json={
        "old_password": "completelywrongpassword",
        "new_password": "NewPassword123"
    })
    assert res.status_code == 400
    assert "Incorrect current password" in res.json()["detail"]

def test_forgot_password_submission(client):
    res = client.post("/api/auth/forgot-password", json={
        "email": "test_employee@company.com"
    })
    assert res.status_code == 200
    assert "instructions" in res.json()["message"].lower()

def test_deactivated_user_login_blocked(client, db):
    user = db.query(User).filter(User.email == "test_employee@company.com").first()
    user.is_active = False
    db.commit()

    res = client.post("/api/auth/login", json={
        "email": "test_employee@company.com",
        "password": "employeepassword"
    })
    assert res.status_code == 403
    assert "inactive" in res.json()["detail"].lower()

def test_mfa_setup_requires_login(client):
    res = client.post("/api/auth/mfa/setup")
    assert res.status_code == 401

def test_logout_clears_cookies(employee_client):
    res = employee_client.post("/api/auth/logout")
    assert res.status_code == 200
    assert "logout" in res.json()["message"].lower()
