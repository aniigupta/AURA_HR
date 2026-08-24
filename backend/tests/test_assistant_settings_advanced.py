import pytest
from datetime import date
from app.models.models import Organization, OfficeSetting, Holiday, CompanyPolicy, User, EmployeeProfile
from app.core.security import get_password_hash, create_jwt_token

def test_organization_settings_get_and_update(admin_client):
    # 1. Get organization details
    res_get = admin_client.get("/api/settings/organization")
    assert res_get.status_code == 200
    assert res_get.json()["slug"] == "test-company"

    # 2. Update organization name
    res_put = admin_client.put("/api/settings/organization", json={
        "name": "Updated Enterprise Corp"
    })
    assert res_put.status_code == 200
    assert res_put.json()["name"] == "Updated Enterprise Corp"

def test_office_settings_shift_timing_update(admin_client):
    res = admin_client.put("/api/settings/office", json={
        "office_start_time": "09:00:00",
        "office_end_time": "18:00:00",
        "allowed_radius": 250.0,
        "lunch_break_hours": 1.5,
        "required_working_hours": 7.5,
        "weekends": "Saturday,Sunday",
        "timezone": "Asia/Kolkata"
    })
    assert res.status_code == 200
    assert res.json()["allowed_radius"] == 250.0

def test_holiday_creation_and_deletion(admin_client):
    test_date = "2026-12-31"
    
    # 1. Create holiday
    res_c = admin_client.post("/api/settings/holidays", json={
        "name": "New Year Eve Special",
        "date": test_date,
        "description": "Year end holiday"
    })
    assert res_c.status_code == 200
    h_id = res_c.json()["id"]

    # 2. Delete holiday
    res_d = admin_client.delete(f"/api/settings/holidays/{h_id}")
    assert res_d.status_code == 200
    assert "deleted successfully" in res_d.json()["message"].lower()

def test_holiday_duplicate_date_rejected(admin_client):
    test_date = "2026-11-15"
    admin_client.post("/api/settings/holidays", json={"name": "Festival 1", "date": test_date})

    # Duplicate on same date
    res_dup = admin_client.post("/api/settings/holidays", json={"name": "Festival 2", "date": test_date})
    assert res_dup.status_code == 400
    assert "already configured" in res_dup.json()["detail"].lower()

def test_company_policy_category_filtering(admin_client):
    admin_client.post("/api/assistant/policies", json={
        "title": "Maternity & Paternity Leave Policy",
        "category": "Leaves",
        "content": "26 weeks of paid maternity leave."
    })
    admin_client.post("/api/assistant/policies", json={
        "title": "IT Device Security Policy",
        "category": "General",
        "content": "All laptops must have disk encryption enabled."
    })

    res = admin_client.get("/api/assistant/policies")
    assert res.status_code == 200
    policies = res.json()
    assert any(p["category"] == "Leaves" for p in policies)
    assert any(p["category"] == "General" for p in policies)

def test_company_policy_draft_hidden_from_employees(admin_client, employee_client):
    # Admin creates a draft policy
    res_c = admin_client.post("/api/assistant/policies", json={
        "title": "Draft Secret Bonus Policy",
        "category": "Benefits",
        "content": "Confidential draft",
        "is_published": False
    })
    assert res_c.status_code == 200
    policy_id = res_c.json()["id"]

    # Employee lists policies -> draft should be excluded
    res_emp = employee_client.get("/api/assistant/policies")
    assert res_emp.status_code == 200
    assert not any(p["id"] == policy_id for p in res_emp.json())

    # Admin lists policies -> sees the draft
    res_admin = admin_client.get("/api/assistant/policies")
    assert res_admin.status_code == 200
    assert any(p["id"] == policy_id for p in res_admin.json())

def test_ai_assistant_chat_wfh_policy_inquiry(employee_client, admin_client):
    admin_client.post("/api/assistant/policies", json={
        "title": "Work From Home Guidelines",
        "category": "Attendance",
        "content": "Employees may work remotely up to 2 days per week with manager approval."
    })

    res = employee_client.post("/api/assistant/chat", json={
        "message": "What is the policy for work from home?"
    })
    assert res.status_code == 200
    body = res.json()
    assert "work" in body["reply"].lower() or "home" in body["reply"].lower()

def test_ai_assistant_chat_upcoming_holidays_inquiry(employee_client, admin_client):
    admin_client.post("/api/settings/holidays", json={
        "name": "Spring Harvest Festival",
        "date": "2026-10-15",
        "description": "Harvest Celebrations"
    })

    res = employee_client.post("/api/assistant/chat", json={
        "message": "When is the next upcoming public holiday?"
    })
    assert res.status_code == 200
    assert "holiday" in res.json()["reply"].lower()

def test_ai_assistant_chat_conversational_history(employee_client):
    res = employee_client.post("/api/assistant/chat", json={
        "message": "What is my casual leave balance?",
        "history": [
            {"role": "user", "content": "Hello HR bot"},
            {"role": "assistant", "content": "Hello! How can I assist you with company policies?"}
        ]
    })
    assert res.status_code == 200
    assert "Casual" in res.json()["reply"]

def test_cross_tenant_assistant_isolation(client, db):
    # 1. Create Tenant Delta
    reg_delta = client.post("/api/auth/register-company", json={
        "company_name": "Delta Systems",
        "company_slug": "delta-sys",
        "admin_name": "Admin Delta",
        "admin_email": "admin@deltasys.com",
        "admin_password": "DeltaPassword123"
    })
    assert reg_delta.status_code == 200
    token_delta = reg_delta.cookies["access_token"]
    client.cookies.set("access_token", token_delta)

    # 2. Add secret custom policy in Delta Systems
    client.post("/api/assistant/policies", json={
        "title": "Delta Exclusive Profit Sharing",
        "category": "Benefits",
        "content": "All Delta staff receive 15% quarterly revenue share."
    })

    # 3. Delta admin chats with AI -> AI knows Delta policy
    res_delta_chat = client.post("/api/assistant/chat", json={
        "message": "Tell me about our profit sharing policy"
    })
    assert res_delta_chat.status_code == 200
    assert "15%" in res_delta_chat.json()["reply"] or "revenue" in res_delta_chat.json()["reply"].lower()
