"""
Tests for the per-organization clock-in selfie requirement.

HR can turn photo verification off for their tenant via
PUT /api/settings/office { "require_selfie": false }. The requirement defaults
to on, so existing tenants are unaffected by the introduction of the flag.

Covers ATT-004a/b, SET-016..019 from the test plan.
"""

import base64
import io

import pytest
from PIL import Image

from app.models.models import OfficeSetting, User


def png_data_uri() -> str:
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (90, 120, 200)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture
def office(db) -> OfficeSetting:
    return db.query(OfficeSetting).first()


def _clock_in_payload(office: OfficeSetting, with_selfie: bool) -> dict:
    payload = {"latitude": office.latitude, "longitude": office.longitude}
    if with_selfie:
        payload["selfie_base64"] = png_data_uri()
    return payload


# --------------------------------------------------------------------------
# Default: the requirement is on
# --------------------------------------------------------------------------


def test_set_016_selfie_is_required_by_default(admin_client):
    """SET-016 — a tenant that never touched the setting still requires selfies."""
    res = admin_client.get("/api/settings/office")
    assert res.status_code == 200
    assert res.json()["require_selfie"] is True


def test_att_004a_employee_blocked_without_selfie_while_required(employee_client, office):
    """ATT-004a — the existing guard still fires when the requirement is on."""
    res = employee_client.post("/api/attendance/clock-in", json=_clock_in_payload(office, with_selfie=False))
    assert res.status_code == 400
    assert "Selfie verification is required" in res.json()["detail"]


# --------------------------------------------------------------------------
# Turned off: employees clock in without a photo
# --------------------------------------------------------------------------


def test_att_004b_employee_can_clock_in_without_selfie_when_disabled(admin_client, employee_client, office, db):
    """ATT-004b — with the requirement off, a GPS-only clock-in succeeds."""
    toggle = admin_client.put("/api/settings/office", json={"require_selfie": False})
    assert toggle.status_code == 200
    assert toggle.json()["require_selfie"] is False

    res = employee_client.post("/api/attendance/clock-in", json=_clock_in_payload(office, with_selfie=False))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("Present", "Late")
    # No photo was sent, so none is recorded against the record.
    assert body["selfie_url"] is None


def test_set_017_disabling_does_not_reject_a_volunteered_selfie(admin_client, employee_client, office):
    """SET-017 — turning the requirement off relaxes it; it does not refuse evidence."""
    admin_client.put("/api/settings/office", json={"require_selfie": False})

    res = employee_client.post("/api/attendance/clock-in", json=_clock_in_payload(office, with_selfie=True))
    assert res.status_code == 200
    assert res.json()["selfie_url"] is not None


def test_set_018_geofence_still_applies_when_selfies_are_disabled(admin_client, employee_client, office):
    """SET-018 — the photo toggle must not weaken the location check."""
    admin_client.put("/api/settings/office", json={"require_selfie": False})

    res = employee_client.post(
        "/api/attendance/clock-in",
        json={"latitude": office.latitude + 5.0, "longitude": office.longitude + 5.0},
    )
    assert res.status_code == 400
    assert "outside office location" in res.json()["detail"]


def test_set_019_toggle_is_reversible_and_takes_effect_immediately(admin_client, employee_client, office):
    """SET-019 — switching back on blocks the very next photo-less clock-in."""
    admin_client.put("/api/settings/office", json={"require_selfie": False})
    admin_client.put("/api/settings/office", json={"require_selfie": True})

    assert admin_client.get("/api/settings/office").json()["require_selfie"] is True
    res = employee_client.post("/api/attendance/clock-in", json=_clock_in_payload(office, with_selfie=False))
    assert res.status_code == 400


# --------------------------------------------------------------------------
# Authorization and isolation
# --------------------------------------------------------------------------


def test_set_020_employee_cannot_change_the_requirement(employee_client):
    """SET-020 — RBAC: only an Admin may relax photo verification."""
    res = employee_client.put("/api/settings/office", json={"require_selfie": False})
    assert res.status_code == 403


def test_set_021_employee_can_read_the_requirement(employee_client):
    """SET-021 — the employee dashboard needs to read it to skip the camera."""
    res = employee_client.get("/api/settings/office")
    assert res.status_code == 200
    assert res.json()["require_selfie"] is True


def test_set_022_partial_update_leaves_other_office_settings_intact(admin_client):
    """SET-022 — toggling the flag must not reset the geofence or shift times."""
    before = admin_client.get("/api/settings/office").json()

    admin_client.put("/api/settings/office", json={"require_selfie": False})
    after = admin_client.get("/api/settings/office").json()

    for field in (
        "latitude",
        "longitude",
        "allowed_radius",
        "office_start_time",
        "office_end_time",
        "lunch_break_hours",
        "required_working_hours",
        "weekends",
        "timezone",
    ):
        assert after[field] == before[field], f"{field} changed unexpectedly"
    assert after["require_selfie"] is False


def test_set_023_admin_clock_in_is_unaffected_by_the_toggle(admin_client, office, db):
    """SET-023 — Admins were always exempt; the flag must not change that."""
    admin = db.query(User).filter(User.email == "test_admin@company.com").first()
    assert admin is not None

    res = admin_client.post("/api/attendance/clock-in", json=_clock_in_payload(office, with_selfie=False))
    assert res.status_code == 200
