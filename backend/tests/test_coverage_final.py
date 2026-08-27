"""
The last uncovered branches: settings auto-creation on the attendance routes,
the full status matrix inside correction approval, the empty-filename guards,
and the development-only login shortcut.

Two of these began as defect documentation and are now regression guards:
PAY-B2 (the transient OfficeSetting) and SEC-016 (the demo-credentials
shortcut), both since fixed.
"""

import io
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest
from PIL import Image

from app.core.config import settings as app_settings
from app.core.security import create_jwt_token, get_password_hash
from app.models.models import (
    Attendance,
    AttendanceCorrectionRequest,
    EmployeeProfile,
    OfficeSetting,
    Organization,
    User,
)
from app.routers.assistant import extract_text_from_file
from app.routers.attendance import parse_attendance_file_rows


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), (40, 80, 120)).save(buf, format="PNG")
    return buf.getvalue()


def selfie() -> str:
    import base64

    return "data:image/png;base64," + base64.b64encode(png_bytes()).decode()


def csv_bytes(rows: list[list]) -> bytes:
    import csv

    out = io.StringIO()
    csv.writer(out).writerows(rows)
    return out.getvalue().encode("utf-8")


def xlsx_bytes(rows: list[list]) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def fresh_tenant(client, db):
    """A tenant with an employee and deliberately no OfficeSetting row."""
    org = Organization(name="Greenfield Co", slug=f"green-{uuid.uuid4().hex[:8]}", is_active=True)
    db.add(org)
    db.flush()

    employee = User(
        organization_id=org.id,
        email=f"green.{uuid.uuid4().hex[:8]}@company.com",
        hashed_password=get_password_hash("GreenPass1"),
        role="Employee",
        is_active=True,
    )
    db.add(employee)
    db.flush()
    db.add(
        EmployeeProfile(
            organization_id=org.id,
            user_id=employee.id,
            first_name="Green",
            last_name="Field",
            employee_id=f"GRN{uuid.uuid4().hex[:5]}",
        )
    )
    db.commit()
    assert db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first() is None

    client.cookies.set(
        "access_token",
        create_jwt_token(subject=employee.id, role="Employee", organization_id=org.id),
    )
    return {"org": org, "employee": employee, "client": client}


# --------------------------------------------------------------------------
# Office settings auto-creation on the attendance routes
# --------------------------------------------------------------------------


def test_att_076_clock_in_creates_office_settings_for_a_new_tenant(fresh_tenant, db):
    """
    A tenant whose admin never opened the settings screen must still be able to
    clock in: the route creates the defaults and commits them.
    """
    org = fresh_tenant["org"]
    defaults = OfficeSetting()  # the geofence centre the route will apply
    res = fresh_tenant["client"].post(
        "/api/attendance/clock-in",
        json={"latitude": 28.6139, "longitude": 77.2090, "selfie_base64": selfie()},
    )
    assert res.status_code == 200

    created = db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first()
    assert created is not None
    assert created.weekends == "Saturday,Sunday"
    assert created.require_selfie is True


def test_att_077_clock_out_without_a_settings_row_succeeds(fresh_tenant, db):
    """
    ATT-077 / PAY-B2 — regression guard, fixed.

    Clock-out used to build a transient OfficeSetting() when the tenant had no
    row, instead of committing one the way clock-in does. Column(default=...)
    only applies at INSERT, so office_end_time was None on that object and
    datetime.combine raised, surfacing as a 500. It now persists the row.

    The settings row is deleted between the two punches to reach the branch.
    """
    org = fresh_tenant["org"]
    client = fresh_tenant["client"]

    assert client.post(
        "/api/attendance/clock-in",
        json={"latitude": 28.6139, "longitude": 77.2090, "selfie_base64": selfie()},
    ).status_code == 200

    db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).delete()
    db.commit()

    res = client.post("/api/attendance/clock-out")
    assert res.status_code == 200
    assert res.json()["clock_out"] is not None
    assert db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first() is not None


def test_att_078_an_on_time_arrival_is_recorded_as_present(employee_client, db):
    """
    ATT-011 — the else-branch of the late calculation.

    Office start is pushed to the end of the day so the clock-in is
    unambiguously on time regardless of when the suite runs.
    """
    setting = db.query(OfficeSetting).first()
    setting.office_start_time = time(23, 59)
    db.commit()

    res = employee_client.post(
        "/api/attendance/clock-in",
        json={"latitude": setting.latitude, "longitude": setting.longitude, "selfie_base64": selfie()},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "Present"
    assert res.json()["late_minutes"] == 0


@pytest.mark.parametrize(
    "office_end,expect_early",
    [(time(23, 59), True), (time(0, 1), False)],
    ids=["left-before-close", "left-after-close"],
)
def test_att_085_early_leaving_is_measured_against_the_office_close(
    employee_client, db, office_end, expect_early
):
    """
    ATT-085 — the early-leaving branch of clock-out, pinned to a fixed office
    close rather than to whenever the suite happens to run.

    This branch was previously covered only by accident: other tests clock out
    at the real wall-clock time, so `local_now < office_end_dt` was true only
    when the suite ran before the seeded 19:00 close. A run after 7pm silently
    lost the coverage — which is exactly how it was found.
    """
    setting = db.query(OfficeSetting).first()
    setting.office_end_time = office_end
    db.commit()

    assert employee_client.post(
        "/api/attendance/clock-in",
        json={"latitude": setting.latitude, "longitude": setting.longitude, "selfie_base64": selfie()},
    ).status_code == 200

    res = employee_client.post("/api/attendance/clock-out")
    assert res.status_code == 200
    if expect_early:
        assert res.json()["early_leaving_minutes"] > 0
    else:
        assert res.json()["early_leaving_minutes"] == 0


# --------------------------------------------------------------------------
# Correction approval — the full recomputed-status matrix
# --------------------------------------------------------------------------


def raise_correction(employee_client, target: date, start: time, end: time) -> str:
    res = employee_client.post(
        "/api/attendance/corrections",
        json={
            "date": target.isoformat(),
            "proposed_clock_in": datetime.combine(target, start, tzinfo=timezone.utc).isoformat(),
            "proposed_clock_out": datetime.combine(target, end, tzinfo=timezone.utc).isoformat(),
            "reason": "Recomputation probe",
        },
    )
    assert res.status_code == 200
    return res.json()["id"]


@pytest.mark.parametrize(
    "start,end,expected",
    [
        (time(4, 30), time(13, 30), "Present"),   # on time, full day
        (time(6, 0), time(15, 0), "Late"),        # more than 15 minutes late
        (time(4, 30), time(7, 30), "Half Day"),   # under half the required hours
    ],
    ids=["present", "late", "half-day"],
)
def test_att_079_approval_recomputes_the_days_status(
    admin_client, employee_client, db, start, end, expected
):
    """
    ATT-040 — an approved correction re-derives status, late minutes, early
    leaving and overtime from the proposed times, in the office timezone.

    Office hours are pinned in UTC terms (the seeded tenant is Asia/Kolkata,
    +05:30) so the boundaries land where this test intends.
    """
    setting = db.query(OfficeSetting).first()
    setting.timezone = "UTC"
    setting.office_start_time = time(9, 0)
    setting.office_end_time = time(18, 0)
    setting.required_working_hours = 8.0
    setting.lunch_break_hours = 1.0
    db.commit()

    target = date.today() - timedelta(days=30)
    # The proposed times above are UTC; shift them onto the 09:00-18:00 window.
    offset = timedelta(hours=4, minutes=30)
    correction_id = raise_correction(
        employee_client,
        target,
        (datetime.combine(target, start) + offset).time(),
        (datetime.combine(target, end) + offset).time(),
    )

    res = admin_client.patch(
        f"/api/attendance/corrections/{correction_id}/review", json={"status": "Approved"}
    )
    assert res.status_code == 200

    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    record = db.query(Attendance).filter(
        Attendance.user_id == employee.id, Attendance.date == target
    ).first()
    assert record.status == expected
    assert record.modified_by_admin is True


def test_att_080_an_approved_correction_for_a_wfh_employee_records_wfh(
    admin_client, employee_client, db
):
    """The WFH branch wins over the hours-derived status."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    target = date.today() - timedelta(days=40)
    employee.profile.wfh_enabled = True
    employee.profile.wfh_start_date = target - timedelta(days=1)
    employee.profile.wfh_end_date = target + timedelta(days=1)
    db.commit()

    correction_id = raise_correction(employee_client, target, time(9, 0), time(18, 0))
    assert admin_client.patch(
        f"/api/attendance/corrections/{correction_id}/review", json={"status": "Approved"}
    ).status_code == 200

    record = db.query(Attendance).filter(
        Attendance.user_id == employee.id, Attendance.date == target
    ).first()
    assert record.status == "Work From Home"
    assert record.is_wfh is True


def test_att_081_a_long_shift_correction_records_overtime(admin_client, employee_client, db):
    """Overtime is recomputed too, not carried over from the original record."""
    setting = db.query(OfficeSetting).first()
    setting.required_working_hours = 8.0
    setting.lunch_break_hours = 1.0
    db.commit()

    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    target = date.today() - timedelta(days=50)
    correction_id = raise_correction(employee_client, target, time(3, 0), time(17, 0))

    assert admin_client.patch(
        f"/api/attendance/corrections/{correction_id}/review", json={"status": "Approved"}
    ).status_code == 200

    record = db.query(Attendance).filter(
        Attendance.user_id == employee.id, Attendance.date == target
    ).first()
    assert record.overtime_minutes > 0


def test_att_082_approving_a_correction_creates_settings_if_absent(fresh_tenant, admin_client, db):
    """The review route upserts the settings row before recomputing the day."""
    org = fresh_tenant["org"]
    employee = fresh_tenant["employee"]
    target = date.today() - timedelta(days=5)

    correction = AttendanceCorrectionRequest(
        organization_id=org.id,
        user_id=employee.id,
        date=target,
        proposed_clock_in=datetime.combine(target, time(9, 0), tzinfo=timezone.utc),
        proposed_clock_out=datetime.combine(target, time(18, 0), tzinfo=timezone.utc),
        reason="Settings upsert probe",
        status="Pending",
    )
    db.add(correction)
    db.commit()

    # An admin of the same greenfield tenant reviews it.
    admin = User(
        organization_id=org.id,
        email=f"greenadmin.{uuid.uuid4().hex[:6]}@company.com",
        hashed_password=get_password_hash("GreenPass1"),
        role="Admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()

    admin_client.cookies.set(
        "access_token", create_jwt_token(subject=admin.id, role="Admin", organization_id=org.id)
    )
    res = admin_client.patch(
        f"/api/attendance/corrections/{correction.id}/review", json={"status": "Approved"}
    )
    assert res.status_code == 200
    assert db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first() is not None


def test_att_042a_a_correction_cannot_be_reviewed_twice(admin_client, employee_client, db):
    """ATT-042 — the second decision is refused, naming the existing one."""
    target = date.today() - timedelta(days=60)
    correction_id = raise_correction(employee_client, target, time(9, 0), time(18, 0))

    assert admin_client.patch(
        f"/api/attendance/corrections/{correction_id}/review", json={"status": "Rejected"}
    ).status_code == 200

    second = admin_client.patch(
        f"/api/attendance/corrections/{correction_id}/review", json={"status": "Approved"}
    )
    assert second.status_code == 400
    assert second.json()["detail"] == "Request is already Rejected."


# --------------------------------------------------------------------------
# Empty-filename guards on the three upload routes
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/api/attendance/import",
        "/api/assistant/policies/extract-document",
        "/api/assistant/policies/upload-file",
    ],
)
def test_file_045_a_file_part_with_no_filename_is_rejected(admin_client, path):
    """
    A multipart part with an empty filename is not treated as a file at all:
    FastAPI's File(...) binding rejects it as a missing field, so the request
    never reaches the handler and the answer is 422 rather than the handler's
    own 400. Pinned because the difference matters to the client — 422 carries
    the validation envelope, 400 carries the handler's message.
    """
    res = admin_client.post(path, files={"file": ("", b"some content", "text/plain")})
    assert res.status_code == 422
    assert res.json()["errorCode"] == "VALIDATION_ERROR"


def test_file_047_the_handlers_own_empty_filename_guard_holds():
    """
    Because FastAPI intercepts first, the `if not file.filename` guard inside
    each upload handler is unreachable over HTTP. It is still the last line of
    defence if the binding ever changes — os.path.splitext("") yields no
    extension, so without it an unknown type would reach a parser. Exercised
    by calling the handlers directly with a filename-less upload.
    """
    import asyncio

    from fastapi import HTTPException, UploadFile

    from app.routers.assistant import extract_policy_document, upload_policy_file
    from app.routers.attendance import import_attendance_file

    def nameless() -> UploadFile:
        return UploadFile(filename="", file=io.BytesIO(b"content"))

    for coro in (
        extract_policy_document(file=nameless(), admin_user=None),
        upload_policy_file(request=None, file=nameless(), db=None, admin_user=None),
        import_attendance_file(request=None, file=nameless(), db=None, admin_user=None),
    ):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(coro)
        assert exc.value.status_code == 400
        assert "No file selected" in exc.value.detail


def test_file_004a_an_avatar_with_a_mismatched_content_type_is_refused(employee_client, db):
    """FILE-004 — the declared MIME type is checked as well as the extension."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    res = employee_client.post(
        f"/api/employees/{employee.id}/upload-avatar",
        files={"file": ("avatar.png", png_bytes(), "text/html")},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid image content type"


def test_emp_015_an_employee_cannot_update_a_peers_profile(employee_client, admin_client, db):
    """EMP-015 — the ownership check fires before any field filtering."""
    peer = admin_client.post(
        "/api/employees",
        json={
            "email": f"peer.{uuid.uuid4().hex[:8]}@company.com",
            "password": "PeerPass1",
            "role": "Employee",
            "profile": {"first_name": "Peer", "last_name": "Person", "employee_id": f"PR{uuid.uuid4().hex[:6]}"},
        },
    )
    assert peer.status_code == 200

    res = employee_client.put(f"/api/employees/{peer.json()['id']}", json={"first_name": "Hijacked"})
    assert res.status_code == 403
    assert res.json()["detail"] == "You cannot update other employee's profile"


# --------------------------------------------------------------------------
# auth.py — the remaining error paths and the development shortcut
# --------------------------------------------------------------------------


def test_sec_016_no_environment_grants_a_credential_shortcut(client, db, monkeypatch):
    """
    SEC-016 — regression guard, fixed.

    login() carried a development-only shortcut: four seeded email addresses
    authenticated against any of three hardcoded passwords, bypassing the
    stored hash. It was gated on ENVIRONMENT == "development" — but
    ENVIRONMENT defaults to "development" when unset, so a missing env var was
    a credential bypass on named accounts.

    Removing it cost nothing: app/seed.py already hashes those exact
    passwords, so the demo accounts still log in through the normal path. What
    no longer works is the case that made it a hole — a demo account whose
    password was changed still accepting the old demo password.
    """
    org = db.query(Organization).first()
    demo = User(
        organization_id=org.id,
        email="admin@company.com",
        hashed_password=get_password_hash("SomethingCompletelyDifferent1"),
        role="Admin",
        is_active=True,
    )
    db.add(demo)
    db.commit()

    for environment in ("development", "production", "staging"):
        monkeypatch.setattr(app_settings, "ENVIRONMENT", environment)
        res = client.post(
            "/api/auth/login", json={"email": "admin@company.com", "password": "adminpassword"}
        )
        assert res.status_code == 400, f"credential shortcut is live under ENVIRONMENT={environment}"
        assert res.json()["detail"] == "Incorrect email or password"

    # The account's real password still works, in every environment.
    monkeypatch.setattr(app_settings, "ENVIRONMENT", "development")
    ok = client.post(
        "/api/auth/login",
        json={"email": "admin@company.com", "password": "SomethingCompletelyDifferent1"},
    )
    assert ok.status_code == 200


def test_auth_047_a_malformed_mfa_token_is_rejected_before_lookup(client):
    """A token that will not decode fails at the decode step, not the query."""
    res = client.post("/api/auth/mfa/verify", json={"mfa_token": "not.a.jwt", "code": "123456"})
    assert res.status_code == 401


def test_auth_048_a_refresh_token_with_a_non_uuid_subject_is_a_401(client):
    """
    The refresh handler's catch-all: uuid.UUID() raises ValueError rather than
    HTTPException, so it lands in the generic branch and must still fail closed.
    """
    import jwt

    token = jwt.encode(
        {"sub": "not-a-uuid", "type": "refresh", "exp": 9999999999},
        app_settings.SECRET_KEY,
        algorithm=app_settings.ALGORITHM,
    )
    client.cookies.set("refresh_token", token)
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid refresh token session"


# --------------------------------------------------------------------------
# Defensive branches that no valid input can reach
# --------------------------------------------------------------------------


def test_file_046_text_extraction_reports_a_decode_failure(monkeypatch):
    """
    latin-1 decodes every possible byte sequence, so the inner decode guard in
    extract_text_from_file cannot be reached with real bytes. It is defence
    against a future encoding change rather than a live path — exercised here
    by making the fallback decode itself fail.
    """
    class Undecodable(bytes):
        def decode(self, encoding="utf-8", *args, **kwargs):
            # utf-8 fails the way real mojibake does; the latin-1 retry then
            # fails for a different reason, which is the branch under test.
            if encoding == "utf-8":
                raise UnicodeDecodeError("utf-8", b"", 0, 1, "invalid start byte")
            raise LookupError("unknown codec")

    with pytest.raises(ValueError, match="Failed to decode text document"):
        extract_text_from_file(Undecodable(b"content"), "policy.txt")


def test_att_083_an_unreadable_csv_reports_a_read_failure(monkeypatch):
    """
    The CSV reader decodes with errors="replace", so no byte sequence reaches
    its except branch either. Forcing the reader to raise proves the failure is
    reported as a clean ValueError rather than escaping as a 500.
    """
    import app.routers.attendance as attendance_module

    def exploding_reader(*args, **kwargs):
        raise RuntimeError("csv module failure")

    monkeypatch.setattr(attendance_module.csv, "reader", exploding_reader)
    with pytest.raises(ValueError, match="Failed to read CSV text"):
        attendance_module.parse_attendance_file_rows(b"a,b\n1,2\n", "import.csv")


def test_att_084_every_reader_drops_blank_rows_before_the_record_builder():
    """
    Blank rows are filtered by each reader, not by the record builder.

    This matters because the builder's own blank-row guard is consequently
    unreachable — the XLSX filter is character-identical to it — and is marked
    `# pragma: no cover` in the source for that reason. What is worth asserting
    is the behaviour users actually depend on: spacer rows in a spreadsheet do
    not become attendance records, and do not shift the row numbers reported in
    import errors.
    """
    rows = [
        ["Employee ID", "Date"],
        ["EMP001", "2026-03-17"],
        ["", ""],
        ["   ", "  "],
        ["EMP002", "2026-03-18"],
    ]
    from_csv = parse_attendance_file_rows(csv_bytes(rows), "spacers.csv")
    from_xlsx = parse_attendance_file_rows(xlsx_bytes(rows), "spacers.xlsx")

    assert [r["employee_raw"] for r in from_csv] == ["EMP001", "EMP002"]
    assert [r["employee_raw"] for r in from_xlsx] == ["EMP001", "EMP002"]
