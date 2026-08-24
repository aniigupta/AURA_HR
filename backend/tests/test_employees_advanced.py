import io
import pytest
from PIL import Image
from app.models.models import User, EmployeeProfile, Department, Organization

def test_employee_plan_limit_enforcement(admin_client, db):
    # Set max_employees on test organization to 2
    org = db.query(Organization).filter(Organization.slug == "test-company").first()
    org.max_employees = 2
    db.commit()

    # Organization already has 1 employee ("test_employee@company.com")
    # 1. Create 2nd employee -> should succeed
    res1 = admin_client.post("/api/employees/", json={
        "email": "emp2@company.com",
        "password": "Password123",
        "role": "Employee",
        "profile": {
            "first_name": "Emp",
            "last_name": "Two",
            "employee_id": "EMP002"
        }
    })
    assert res1.status_code == 200

    # 2. Attempt to create 3rd employee -> should fail with 403 (Limit reached)
    res2 = admin_client.post("/api/employees/", json={
        "email": "emp3@company.com",
        "password": "Password123",
        "role": "Employee",
        "profile": {
            "first_name": "Emp",
            "last_name": "Three",
            "employee_id": "EMP003"
        }
    })
    assert res2.status_code == 403
    assert "limit reached" in res2.json()["detail"].lower()

def test_employee_duplicate_email_same_org(admin_client):
    res = admin_client.post("/api/employees/", json={
        "email": "test_employee@company.com",
        "password": "Password123",
        "role": "Employee",
        "profile": {
            "first_name": "Dup",
            "last_name": "User",
            "employee_id": "EMP999"
        }
    })
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"].lower()

def test_employee_duplicate_code_same_org(admin_client):
    res = admin_client.post("/api/employees/", json={
        "email": "brand_new_email@company.com",
        "password": "Password123",
        "role": "Employee",
        "profile": {
            "first_name": "Dup",
            "last_name": "Code",
            "employee_id": "EMP001" # Already used by test_employee
        }
    })
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"].lower()

def test_employee_get_by_id_admin_access(admin_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()
    res = admin_client.get(f"/api/employees/{emp.id}")
    assert res.status_code == 200
    assert res.json()["email"] == "test_employee@company.com"

def test_employee_get_by_id_other_employee_forbidden(employee_client, db):
    admin = db.query(User).filter(User.email == "test_admin@company.com").first()
    res = employee_client.get(f"/api/employees/{admin.id}")
    assert res.status_code == 403
    assert "own profile" in res.json()["detail"].lower()

def test_employee_cannot_modify_salary_or_leave_balances(employee_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()
    
    # Employee tries to tamper with their salary and leave balance
    res = employee_client.put(f"/api/employees/{emp.id}", json={
        "hourly_rate": 9999.0,
        "leave_balance_casual": 50,
        "phone": "+91 99999 11111"
    })
    assert res.status_code == 200

    db.expire_all()
    updated_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == emp.id).first()
    assert updated_profile.phone == "+91 99999 11111"
    assert updated_profile.hourly_rate != 9999.0 # Restrict tampering
    assert updated_profile.leave_balance_casual == 12 # Preserved

def test_admin_can_modify_salary_and_balances(admin_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()
    
    res = admin_client.put(f"/api/employees/{emp.id}", json={
        "hourly_rate": 550.0,
        "base_salary": 85000.0,
        "leave_balance_casual": 14,
        "designation": "Staff Engineer"
    })
    assert res.status_code == 200
    assert res.json()["profile"]["hourly_rate"] == 550.0
    assert res.json()["profile"]["leave_balance_casual"] == 14

def test_toggle_employee_status_flow(admin_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()
    assert emp.is_active is True

    # 1. Deactivate
    res1 = admin_client.patch(f"/api/employees/{emp.id}/toggle-status")
    assert res1.status_code == 200
    assert "False" in res1.json()["message"]

    db.expire_all()
    assert emp.is_active is False

    # 2. Reactivate
    res2 = admin_client.patch(f"/api/employees/{emp.id}/toggle-status")
    assert res2.status_code == 200
    assert "True" in res2.json()["message"]

def test_delete_employee_flow(admin_client, db):
    # Create temp employee to delete
    res_create = admin_client.post("/api/employees/", json={
        "email": "to_delete@company.com",
        "password": "Password123",
        "role": "Employee",
        "profile": {
            "first_name": "Delete",
            "last_name": "Me",
            "employee_id": "EMP_DEL_1"
        }
    })
    assert res_create.status_code == 200
    user_id = res_create.json()["id"]

    # Delete
    del_res = admin_client.delete(f"/api/employees/{user_id}")
    assert del_res.status_code == 200

    # Verify not found
    get_res = admin_client.get(f"/api/employees/{user_id}")
    assert get_res.status_code == 404

def test_reset_employee_password_admin_only(admin_client, employee_client, client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()

    # 1. Employee cannot reset password via admin endpoint
    res_emp = employee_client.post(f"/api/employees/{emp.id}/reset-password", json={
        "new_password": "NewHackedPassword123"
    })
    assert res_emp.status_code == 403

    # 2. Admin resets password
    res_admin = admin_client.post(f"/api/employees/{emp.id}/reset-password", json={
        "new_password": "FreshAdminSetPassword123"
    })
    assert res_admin.status_code == 200

    # 3. Employee can login with new password
    login_res = client.post("/api/auth/login", json={
        "email": "test_employee@company.com",
        "password": "FreshAdminSetPassword123"
    })
    assert login_res.status_code == 200

def test_avatar_upload_valid_png(employee_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()

    img = Image.new("RGB", (64, 64), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    res = employee_client.post(
        f"/api/employees/{emp.id}/upload-avatar",
        files={"file": ("avatar.png", buf, "image/png")}
    )
    assert res.status_code == 200
    assert "profile_image_url" in res.json()

def test_avatar_upload_invalid_extension(employee_client, db):
    emp = db.query(User).filter(User.email == "test_employee@company.com").first()

    res = employee_client.post(
        f"/api/employees/{emp.id}/upload-avatar",
        files={"file": ("malicious.exe", b"fake binary", "application/octet-stream")}
    )
    assert res.status_code == 400

def test_avatar_upload_other_employee_forbidden(employee_client, db):
    admin = db.query(User).filter(User.email == "test_admin@company.com").first()

    img = Image.new("RGB", (64, 64), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    res = employee_client.post(
        f"/api/employees/{admin.id}/upload-avatar",
        files={"file": ("avatar.png", buf, "image/png")}
    )
    assert res.status_code == 403

def test_department_crud_flow(admin_client, employee_client):
    # 1. Admin creates new department
    res = admin_client.post("/api/employees/departments", json={
        "name": "Quality Assurance",
        "description": "Software testing & automated QA"
    })
    assert res.status_code == 200
    assert res.json()["name"] == "Quality Assurance"

    # 2. Duplicate department name rejected
    res_dup = admin_client.post("/api/employees/departments", json={
        "name": "Quality Assurance"
    })
    assert res_dup.status_code == 400

    # 3. Employee can view department list
    res_list = employee_client.get("/api/employees/departments")
    assert res_list.status_code == 200
    assert any(d["name"] == "Quality Assurance" for d in res_list.json())

def test_search_employees_by_name_and_code(admin_client):
    # Search by first name
    res1 = admin_client.get("/api/employees/?search=Test")
    assert res1.status_code == 200
    assert len(res1.json()) > 0

    # Search by employee_id
    res2 = admin_client.get("/api/employees/?search=EMP001")
    assert res2.status_code == 200
    assert len(res2.json()) == 1

    # Search non-existent
    res3 = admin_client.get("/api/employees/?search=NonExistentPersonXYZ")
    assert res3.status_code == 200
    assert len(res3.json()) == 0
