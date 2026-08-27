"""
Coverage for the router branches the feature tests never reach: not-found
paths, filter combinations, the S3 upload backend, and the dashboard panels
that only render when there is something to report.

Every test asserts observable behaviour. Where a branch is only reachable on
certain calendar dates, the clock is frozen rather than the branch skipped.
"""

import io
import sys
import types
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from PIL import Image

from app.core.config import settings
from app.models.models import (
    Attendance,
    AttendanceCorrectionRequest,
    Department,
    EmployeeProfile,
    Holiday,
    LeaveRequest,
    OfficeSetting,
    Organization,
    User,
)

MISSING_UUID = "00000000-0000-0000-0000-000000000000"


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (12, 12), (10, 60, 90)).save(buf, format="PNG")
    return buf.getvalue()


def future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


# --------------------------------------------------------------------------
# schemas.py — every branch of the password rule
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "password,expected",
    [
        ("Ab1", "at least 8 characters"),
        ("ABCDEFG1", "lowercase letter"),
        ("abcdefg1", "uppercase letter"),
        ("abcdefgH", "one digit"),
    ],
    ids=["too-short", "no-lowercase", "no-uppercase", "no-digit"],
)
def test_emp_020_each_password_rule_names_the_rule_it_failed(admin_client, password, expected):
    """EMP-020 — the message must identify which rule failed, not just 'invalid'."""
    res = admin_client.post(
        "/api/employees",
        json={
            "email": f"pw.{uuid.uuid4().hex[:8]}@company.com",
            "password": password,
            "role": "Employee",
            "profile": {"first_name": "P", "last_name": "W", "employee_id": f"PW{uuid.uuid4().hex[:6]}"},
        },
    )
    assert res.status_code == 422
    assert expected in res.json()["message"]


# --------------------------------------------------------------------------
# employees.py — filters, not-found paths, and the S3 backend
# --------------------------------------------------------------------------


@pytest.fixture
def employee_row(admin_client, db) -> dict:
    unique = uuid.uuid4().hex[:8]
    res = admin_client.post(
        "/api/employees",
        json={
            "email": f"cov.{unique}@company.com",
            "password": "CoveragePass1",
            "role": "Employee",
            "profile": {
                "first_name": "Cov",
                "last_name": "Erage",
                "employee_id": f"COV{unique}",
                "department_id": db.query(Department).first().id,
            },
        },
    )
    assert res.status_code == 200
    return res.json()


def test_emp_025_department_and_active_filters_narrow_the_directory(admin_client, db, employee_row):
    """EMP-009 — department_id and is_active compose rather than override."""
    dept_id = db.query(Department).first().id

    in_dept = admin_client.get("/api/employees", params={"department_id": dept_id})
    assert in_dept.status_code == 200
    assert any(u["id"] == employee_row["id"] for u in in_dept.json())

    other_dept = admin_client.get("/api/employees", params={"department_id": 999999})
    assert other_dept.json() == []

    admin_client.patch(f"/api/employees/{employee_row['id']}/toggle-status")
    assert all(u["id"] != employee_row["id"] for u in admin_client.get("/api/employees", params={"is_active": True}).json())
    assert any(u["id"] == employee_row["id"] for u in admin_client.get("/api/employees", params={"is_active": False}).json())


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("put", f"/api/employees/{MISSING_UUID}", {"first_name": "Ghost"}),
        ("delete", f"/api/employees/{MISSING_UUID}", None),
        ("patch", f"/api/employees/{MISSING_UUID}/toggle-status", None),
        ("post", f"/api/employees/{MISSING_UUID}/reset-password", {"new_password": "NewSecret1"}),
    ],
    ids=["update", "delete", "toggle", "reset-password"],
)
def test_emp_026_every_id_route_404s_on_an_unknown_employee(admin_client, method, path, body):
    """EMP-026 — a well-formed but unknown UUID is a 404 on every write route."""
    res = getattr(admin_client, method)(path, **({"json": body} if body else {}))
    assert res.status_code == 404
    assert res.json()["detail"] in ("Employee not found", "Employee profile not found")


def test_emp_027_a_user_without_a_profile_reports_that_specifically(admin_client, db):
    """A User row with no EmployeeProfile is a data fault, not a missing user."""
    orphan = User(
        organization_id=db.query(Organization).first().id,
        email=f"orphan.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Employee",
        is_active=True,
    )
    db.add(orphan)
    db.commit()

    res = admin_client.put(f"/api/employees/{orphan.id}", json={"first_name": "Ghost"})
    assert res.status_code == 404
    assert res.json()["detail"] == "Profile not found"

    avatar = admin_client.post(
        f"/api/employees/{orphan.id}/upload-avatar",
        files={"file": ("a.png", png_bytes(), "image/png")},
    )
    assert avatar.status_code == 404


def test_file_025_an_oversized_avatar_is_refused_by_size_not_content(admin_client, db):
    """FILE-008 — the 5 MB cap is checked before image verification."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    oversized = b"\x89PNG\r\n\x1a\n" + b"\x00" * (settings.MAX_UPLOAD_SIZE_BYTES + 1)
    res = admin_client.post(
        f"/api/employees/{employee.id}/upload-avatar",
        files={"file": ("big.png", oversized, "image/png")},
    )
    assert res.status_code == 400
    assert "5 MB limit" in res.json()["detail"]


def _install_fake_boto3(monkeypatch, *, fail: bool = False):
    """Stand in for boto3 + botocore so the S3 branch runs without a network."""
    uploads = []

    class ClientError(Exception):
        pass

    class FakeS3:
        def upload_fileobj(self, fileobj, bucket, key, ExtraArgs=None):
            if fail:
                raise ClientError("AccessDenied")
            uploads.append({"bucket": bucket, "key": key, "extra": ExtraArgs, "size": len(fileobj.read())})

    boto3_mod = types.ModuleType("boto3")
    boto3_mod.client = lambda service, **kwargs: FakeS3()

    botocore = types.ModuleType("botocore")
    exceptions_mod = types.ModuleType("botocore.exceptions")
    exceptions_mod.ClientError = ClientError
    botocore.exceptions = exceptions_mod

    monkeypatch.setitem(sys.modules, "boto3", boto3_mod)
    monkeypatch.setitem(sys.modules, "botocore", botocore)
    monkeypatch.setitem(sys.modules, "botocore.exceptions", exceptions_mod)
    return uploads


def test_file_023_avatars_go_to_s3_when_credentials_are_configured(admin_client, db, monkeypatch):
    """FILE-023 — with S3 configured the file leaves local disk entirely."""
    uploads = _install_fake_boto3(monkeypatch)
    monkeypatch.setattr(settings, "S3_ACCESS_KEY", "AKIAFAKE")
    monkeypatch.setattr(settings, "S3_SECRET_KEY", "secret")
    monkeypatch.setattr(settings, "S3_ENDPOINT", "")
    monkeypatch.setattr(settings, "S3_BUCKET", "aurawork-test")
    monkeypatch.setattr(settings, "S3_REGION", "ap-south-1")

    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    res = admin_client.post(
        f"/api/employees/{employee.id}/upload-avatar",
        files={"file": ("a.png", png_bytes(), "image/png")},
    )
    assert res.status_code == 200
    url = res.json()["profile_image_url"]
    assert url.startswith("https://aurawork-test.s3.ap-south-1.amazonaws.com/")
    assert len(uploads) == 1
    assert uploads[0]["extra"] == {"ContentType": "image/png"}


def test_file_026_a_custom_s3_endpoint_builds_a_path_style_url(admin_client, db, monkeypatch):
    """S3-compatible stores (MinIO, R2) need the endpoint-prefixed URL form."""
    _install_fake_boto3(monkeypatch)
    monkeypatch.setattr(settings, "S3_ACCESS_KEY", "AKIAFAKE")
    monkeypatch.setattr(settings, "S3_ENDPOINT", "https://minio.internal")
    monkeypatch.setattr(settings, "S3_BUCKET", "aurawork-test")

    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    res = admin_client.post(
        f"/api/employees/{employee.id}/upload-avatar",
        files={"file": ("a.png", png_bytes(), "image/png")},
    )
    assert res.status_code == 200
    assert res.json()["profile_image_url"].startswith("https://minio.internal/aurawork-test/")


def test_file_027_an_s3_failure_is_a_500_that_names_no_credential(admin_client, db, monkeypatch):
    """A storage outage surfaces as a server error without leaking the key."""
    _install_fake_boto3(monkeypatch, fail=True)
    monkeypatch.setattr(settings, "S3_ACCESS_KEY", "AKIASECRETVALUE")
    monkeypatch.setattr(settings, "S3_SECRET_KEY", "SUPERSECRET")
    monkeypatch.setattr(settings, "S3_ENDPOINT", "")

    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    res = admin_client.post(
        f"/api/employees/{employee.id}/upload-avatar",
        files={"file": ("a.png", png_bytes(), "image/png")},
    )
    assert res.status_code == 500
    assert "AKIASECRETVALUE" not in res.text
    assert "SUPERSECRET" not in res.text


# --------------------------------------------------------------------------
# leaves.py — admin filters, missing profile, approval balance guards
# --------------------------------------------------------------------------


def test_leave_023_admin_can_filter_the_queue_by_status(admin_client, employee_client):
    """LEAVE-023 — status_filter is an admin-only narrowing of the tenant queue."""
    applied = employee_client.post(
        "/api/leaves",
        json={"leave_type": "Casual", "start_date": future(5), "end_date": future(5), "reason": "Filter probe"},
    )
    assert applied.status_code == 200

    pending = admin_client.get("/api/leaves", params={"status_filter": "Pending"})
    assert pending.status_code == 200
    assert any(l["id"] == applied.json()["id"] for l in pending.json())

    approved = admin_client.get("/api/leaves", params={"status_filter": "Approved"})
    assert all(l["id"] != applied.json()["id"] for l in approved.json())


def test_leave_024_a_user_without_a_profile_cannot_apply(client, db):
    """Applying requires a profile to hold the balance being spent."""
    from app.core.security import create_jwt_token

    org = db.query(Organization).first()
    orphan = User(
        organization_id=org.id,
        email=f"noprofile.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Employee",
        is_active=True,
    )
    db.add(orphan)
    db.commit()

    client.cookies.set(
        "access_token",
        create_jwt_token(subject=orphan.id, role="Employee", organization_id=org.id),
    )
    res = client.post(
        "/api/leaves",
        json={"leave_type": "Casual", "start_date": future(5), "end_date": future(5), "reason": "No profile"},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Employee profile not found"


def test_leave_025_a_malformed_leave_id_is_a_400(admin_client):
    """LEAVE-025 — the review route parses the id itself and reports clearly."""
    res = admin_client.patch("/api/leaves/not-a-uuid/review", json={"status": "Approved"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid leave ID format"


def test_leave_021a_reviewing_an_unknown_leave_is_a_404(admin_client):
    """A well-formed id that belongs to nobody is a 404, not a 500."""
    res = admin_client.patch(f"/api/leaves/{MISSING_UUID}/review", json={"status": "Approved"})
    assert res.status_code == 404


@pytest.mark.parametrize(
    "leave_type,balance_field",
    [("Sick", "leave_balance_sick"), ("Paid", "leave_balance_paid")],
)
def test_leave_018_approval_is_refused_when_the_balance_dropped(
    admin_client, employee_client, db, leave_type, balance_field
):
    """LEAVE-018 — the balance is re-checked at approval, per leave type."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    setattr(employee.profile, balance_field, 10)
    db.commit()

    applied = employee_client.post(
        "/api/leaves",
        json={
            "leave_type": leave_type,
            "start_date": future(70),
            "end_date": future(74),
            "reason": f"{leave_type} balance race",
        },
    )
    assert applied.status_code == 200

    # HR lowers the balance after the request was filed but before approving.
    setattr(employee.profile, balance_field, 1)
    db.commit()

    res = admin_client.patch(f"/api/leaves/{applied.json()['id']}/review", json={"status": "Approved"})
    assert res.status_code == 400
    assert f"Insufficient {leave_type} Leave balance" in res.json()["detail"]
    db.refresh(employee.profile)
    assert getattr(employee.profile, balance_field) == 1  # nothing debited


# --------------------------------------------------------------------------
# settings.py — auto-creation and not-found paths
# --------------------------------------------------------------------------


def test_set_024_office_settings_are_created_on_first_read(client, db):
    """SET-007 — a tenant with no settings row gets defaults, not a 404."""
    from app.core.security import create_jwt_token

    org = Organization(name="Fresh Co", slug=f"fresh-{uuid.uuid4().hex[:8]}", is_active=True)
    db.add(org)
    db.flush()
    admin = User(
        organization_id=org.id,
        email=f"fresh.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    assert db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first() is None

    client.cookies.set(
        "access_token", create_jwt_token(subject=admin.id, role="Admin", organization_id=org.id)
    )
    res = client.get("/api/settings/office")
    assert res.status_code == 200
    assert res.json()["require_selfie"] is True
    assert db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first() is not None


def test_set_025_updating_office_settings_creates_the_row_if_absent(client, db):
    """SET-025 — PUT is an upsert; a tenant can configure before ever reading."""
    from app.core.security import create_jwt_token

    org = Organization(name="Upsert Co", slug=f"upsert-{uuid.uuid4().hex[:8]}", is_active=True)
    db.add(org)
    db.flush()
    admin = User(
        organization_id=org.id,
        email=f"upsert.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()

    client.cookies.set(
        "access_token", create_jwt_token(subject=admin.id, role="Admin", organization_id=org.id)
    )
    res = client.put("/api/settings/office", json={"allowed_radius": 250.0})
    assert res.status_code == 200
    assert res.json()["allowed_radius"] == 250.0


def test_set_026_organization_routes_404_when_the_tenant_row_is_gone(client, db):
    """A token outliving its organization must not 500 the settings screen."""
    from app.core.security import create_jwt_token

    ghost_org_id = uuid.uuid4()
    org = db.query(Organization).first()
    admin = db.query(User).filter(User.email == "test_admin@company.com").first()
    token = create_jwt_token(subject=admin.id, role="Admin", organization_id=org.id)
    client.cookies.set("access_token", token)

    admin.organization_id = org.id  # keep the FK valid for get_current_user

    # Point the lookup at an id that does not exist by deleting nothing and
    # querying a fresh org id through a monkeyless route: use a second admin
    # whose organization row we drop after minting the token.
    other = Organization(name="Doomed", slug=f"doomed-{uuid.uuid4().hex[:8]}", is_active=True)
    db.add(other)
    db.flush()
    doomed_admin = User(
        organization_id=other.id,
        email=f"doomed.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Admin",
        is_active=True,
    )
    db.add(doomed_admin)
    db.commit()

    doomed_token = create_jwt_token(subject=doomed_admin.id, role="Admin", organization_id=other.id)
    doomed_admin.organization_id = ghost_org_id  # dangling reference
    db.commit()

    client.cookies.set("access_token", doomed_token)
    assert client.get("/api/settings/organization").status_code == 404
    assert client.put("/api/settings/organization", json={"name": "Renamed"}).status_code == 404


def test_set_027_deleting_an_unknown_holiday_is_a_404(admin_client):
    """SET-027 — a stale holiday id from a second browser tab is a clean 404."""
    res = admin_client.delete("/api/settings/holidays/999999")
    assert res.status_code == 404
    assert res.json()["detail"] == "Holiday not found"


# --------------------------------------------------------------------------
# dashboard.py — the panels that only appear when there is something to show
# --------------------------------------------------------------------------


def test_dash_006_the_attention_panel_lists_missing_clock_outs_and_corrections(admin_client, db):
    """DASH-006 — yesterday's open shifts and pending corrections both surface."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    yesterday = date.today() - timedelta(days=1)

    db.add(
        Attendance(
            organization_id=employee.organization_id,
            user_id=employee.id,
            date=yesterday,
            clock_in=datetime.now(timezone.utc) - timedelta(days=1),
            clock_out=None,
            status="Present",
        )
    )
    db.add(
        AttendanceCorrectionRequest(
            organization_id=employee.organization_id,
            user_id=employee.id,
            date=yesterday,
            reason="Forgot to punch out",
            status="Pending",
        )
    )
    db.commit()

    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    attention = res.json()["needs_attention"]
    assert any("Test Employee" == item["employee_name"] for item in attention)
    assert len(attention) >= 2


def test_dash_007_today_counters_cover_wfh_open_shifts_and_half_days(admin_client, db):
    """DASH-001 — each headline counter is driven by a distinct status."""
    org_id = db.query(Organization).first().id
    dept = db.query(Department).first()

    def make_employee(tag: str) -> User:
        user = User(
            organization_id=org_id,
            email=f"{tag}.{uuid.uuid4().hex[:6]}@company.com",
            hashed_password="x",
            role="Employee",
            is_active=True,
        )
        db.add(user)
        db.flush()
        db.add(
            EmployeeProfile(
                organization_id=org_id,
                user_id=user.id,
                first_name=tag.title(),
                last_name="Counter",
                employee_id=f"{tag.upper()}{uuid.uuid4().hex[:5]}",
                department_id=dept.id,
            )
        )
        return user

    now = datetime.now(timezone.utc)
    wfh_user = make_employee("wfh")
    half_user = make_employee("half")
    db.flush()

    db.add(
        Attendance(
            organization_id=org_id, user_id=wfh_user.id, date=date.today(),
            clock_in=now, clock_out=None, status="Work From Home", is_wfh=True,
        )
    )
    db.add(
        Attendance(
            organization_id=org_id, user_id=half_user.id, date=date.today(),
            clock_in=now, clock_out=now, status="Half Day", working_hours=3.0,
        )
    )
    db.commit()

    cards = admin_client.get("/api/dashboard/admin").json()["cards"]
    assert cards["wfh_today"] >= 1
    assert cards["working_today"] >= 1  # the WFH employee has no clock-out yet
    assert cards["present_today"] >= 2  # WFH and Half Day both count as present


def test_dash_008_the_six_month_graph_spans_a_year_boundary(admin_client, monkeypatch):
    """
    DASH-008 — the December rollover in the month-range maths.

    The window is the last six months, so December only falls inside it for
    part of the year. Freeze the clock rather than let this branch go
    untested for seven months of every twelve.
    """
    class FrozenDate(date):
        @classmethod
        def today(cls):
            return cls(2027, 2, 15)

    monkeypatch.setattr("app.routers.dashboard.date", FrozenDate)

    res = admin_client.get("/api/dashboard/admin")
    assert res.status_code == 200
    labels = [row["month"] for row in res.json()["graphs"]["monthly"]]
    assert "Dec 2026" in labels
    assert "Feb 2027" in labels


def test_dash_005_an_employee_without_a_profile_gets_a_clean_404(client, db):
    """DASH-005 — the employee dashboard needs a profile for its balances."""
    from app.core.security import create_jwt_token

    org = db.query(Organization).first()
    orphan = User(
        organization_id=org.id,
        email=f"dash.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password="x",
        role="Employee",
        is_active=True,
    )
    db.add(orphan)
    db.commit()

    client.cookies.set(
        "access_token", create_jwt_token(subject=orphan.id, role="Employee", organization_id=org.id)
    )
    res = client.get("/api/dashboard/employee")
    assert res.status_code == 404
    assert res.json()["detail"] == "Profile not found"
