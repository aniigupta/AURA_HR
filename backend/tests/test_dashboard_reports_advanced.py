import pytest
from datetime import date, timedelta
from app.models.models import User, EmployeeProfile, Attendance, LeaveRequest

SAMPLE_SELFIE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_admin_dashboard_cards_and_metrics(admin_client, employee_client):
    # Clock in employee
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    body = res.json()
    assert "cards" in body
    cards = body["cards"]
    assert cards["total_employees"] >= 1
    assert cards["present_today"] >= 1

def test_admin_dashboard_daily_graph_format(admin_client):
    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    graphs = res.json()["graphs"]
    assert "daily" in graphs
    assert len(graphs["daily"]) == 7
    for point in graphs["daily"]:
        assert "date" in point
        assert "day" in point
        assert "present" in point
        assert "late" in point
        assert "wfh" in point

def test_admin_dashboard_monthly_graph_format(admin_client):
    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    graphs = res.json()["graphs"]
    assert "monthly" in graphs
    assert len(graphs["monthly"]) == 6
    for point in graphs["monthly"]:
        assert "month" in point
        assert "present" in point

def test_admin_dashboard_action_center(admin_client, employee_client):
    # Apply pending leave
    employee_client.post("/api/leaves/", json={
        "leave_type": "Casual",
        "start_date": (date.today() + timedelta(days=10)).isoformat(),
        "end_date": (date.today() + timedelta(days=11)).isoformat(),
        "reason": "Test"
    })

    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    needs_attn = res.json()["needs_attention"]
    assert any(item["type"] == "leave_pending" for item in needs_attn)

def test_employee_dashboard_stats(employee_client):
    res = employee_client.get("/api/dashboard/employee")
    assert res.status_code == 200
    body = res.json()
    assert "today" in body
    assert "stats" in body
    assert "leave_balances" in body["stats"]
    assert body["stats"]["leave_balances"]["casual"] == 12

def test_reports_summary_with_status_filter(admin_client, employee_client):
    employee_client.post("/api/attendance/clock-in", json={
        "latitude": 28.3971956,
        "longitude": 77.3131177,
        "selfie_base64": SAMPLE_SELFIE
    })

    res = admin_client.get("/api/reports/summary?status_filter=Present")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_reports_summary_with_department_filter(admin_client, db):
    from app.models.models import Department
    dept = db.query(Department).first()

    res = admin_client.get(f"/api/reports/summary?department_id={dept.id}")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_reports_csv_export_headers(admin_client):
    res = admin_client.get("/api/reports/export/csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "Date,Employee ID,Name,Email" in res.text

def test_reports_excel_export_bytes(admin_client):
    res = admin_client.get("/api/reports/export/excel")
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]
    assert len(res.content) > 100

def test_payroll_report_calculation_accuracy(admin_client, db):
    emp = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == "EMP001").first()
    emp.hourly_rate = 100.0
    db.commit()

    today_str = date.today().isoformat()
    res = admin_client.get(f"/api/reports/payroll?start_date={today_str}&end_date={today_str}")
    assert res.status_code == 200
    data = res.json()
    emp_record = next((r for r in data if r["employee_id"] == "EMP001"), None)
    assert emp_record is not None
    assert emp_record["hourly_rate"] == 100.0
    assert "working_salary" in emp_record
    assert "overtime_pay" in emp_record
    assert "total_salary" in emp_record
