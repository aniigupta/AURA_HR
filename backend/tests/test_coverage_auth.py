"""
Coverage for the authentication branches the happy-path tests never reach:
multi-tenant login resolution, the full MFA challenge lifecycle, refresh-token
failure modes, and the registration rollback path.
"""

import uuid

import jwt
import pyotp
import pytest

from app.core.config import settings
from app.core.security import (
    create_jwt_token,
    create_mfa_challenge_token,
    get_password_hash,
)
from app.models.models import Organization, User
from app.schemas.schemas import validate_password_strength


def register_payload(**overrides) -> dict:
    unique = uuid.uuid4().hex[:8]
    payload = {
        "company_name": "Coverage Corp",
        "company_slug": f"cov-{unique}",
        "admin_name": "Ada Lovelace",
        "admin_email": f"ada.{unique}@coverage.com",
        "admin_password": "CoveragePass1",
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------
# schemas.py — the length rule, which the API's Field(min_length) shadows
# --------------------------------------------------------------------------


def test_emp_020a_the_length_rule_is_reachable_and_correct():
    """
    The API rejects a short password at Field(min_length=8) before the
    validator runs, so the length branch is only observable by calling the
    rule directly. It still has to be right: the two checks must agree, or a
    caller that bypasses the schema gets a different answer.
    """
    with pytest.raises(ValueError, match="at least 8 characters long"):
        validate_password_strength("Ab1")
    assert validate_password_strength("CoveragePass1") == "CoveragePass1"


# --------------------------------------------------------------------------
# register-company — rollback and error surface
# --------------------------------------------------------------------------


def test_reg_008_a_failure_mid_transaction_leaves_no_partial_tenant(client, db, monkeypatch):
    """REG-008 — the whole bootstrap is one transaction or none of it."""
    before = db.query(Organization).count()

    def explode(*args, **kwargs):
        raise RuntimeError("holiday seeding blew up")

    monkeypatch.setattr("app.routers.auth.CompanyPolicy", explode)

    res = client.post("/api/auth/register-company", json=register_payload())
    assert res.status_code == 500
    assert db.query(Organization).count() == before


def test_reg_009_registration_failures_should_not_echo_internals(client, db, monkeypatch):
    """
    REG-009 / SEC-015 — this route builds its 500 body from str(e), unlike
    every other route, which routes through the sanitized global handler.

    The assertion below documents the current behaviour rather than the
    desired one: the exception text does reach the client. Tighten this to
    `not in` once the handler stops interpolating the exception.
    """
    def explode(*args, **kwargs):
        raise RuntimeError("column organizations.secret_column does not exist")

    monkeypatch.setattr("app.routers.auth.CompanyPolicy", explode)

    res = client.post("/api/auth/register-company", json=register_payload())
    assert res.status_code == 500
    assert "secret_column" in res.text  # SEC-015 — known leak, see the plan


def test_reg_002_a_duplicate_slug_is_refused_before_any_write(client, db):
    """REG-002 — the slug check happens first, so nothing is half-created."""
    payload = register_payload()
    assert client.post("/api/auth/register-company", json=payload).status_code == 200

    before = db.query(Organization).count()
    second = client.post("/api/auth/register-company", json=register_payload(company_slug=payload["company_slug"]))
    assert second.status_code == 400
    assert "already registered" in second.json()["detail"]
    assert db.query(Organization).count() == before


# --------------------------------------------------------------------------
# login — multi-tenant resolution
# --------------------------------------------------------------------------


def test_auth_005_an_unknown_company_slug_is_refused(client):
    """AUTH-005 — a slug that matches no tenant cannot authenticate anyone."""
    res = client.post(
        "/api/auth/login",
        json={"email": "test_employee@company.com", "password": "employeepassword", "company_slug": "no-such-tenant"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Organization not found with the specified company slug"


def test_auth_003_an_explicit_slug_resolves_the_right_tenant(client, db):
    """AUTH-003 — with a slug given, resolution is a direct lookup."""
    res = client.post(
        "/api/auth/login",
        json={"email": "test_employee@company.com", "password": "employeepassword", "company_slug": "test-company"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["organization_slug"] == "test-company"


def test_auth_008_the_same_email_in_two_tenants_is_resolved_by_password(client, db):
    """
    AUTH-008 / SEC-014 — with no slug, login verifies the password against
    every tenant holding that email. A single match logs in; two matches
    return a distinct error that confirms the password works in both.
    """
    shared_email = f"shared.{uuid.uuid4().hex[:8]}@company.com"
    orgs = []
    for i in range(2):
        org = Organization(name=f"Shared {i}", slug=f"shared-{uuid.uuid4().hex[:8]}", is_active=True)
        db.add(org)
        db.flush()
        orgs.append(org)

    db.add(User(organization_id=orgs[0].id, email=shared_email,
                hashed_password=get_password_hash("FirstTenant1"), role="Admin", is_active=True))
    db.add(User(organization_id=orgs[1].id, email=shared_email,
                hashed_password=get_password_hash("SecondTenant1"), role="Admin", is_active=True))
    db.commit()

    # Exactly one tenant matches this password → resolved unambiguously.
    ok = client.post("/api/auth/login", json={"email": shared_email, "password": "FirstTenant1"})
    assert ok.status_code == 200
    assert ok.json()["user"]["organization_slug"] == orgs[0].slug

    # Same password in both tenants → the ambiguity is reported, and in doing
    # so confirms the password is valid in more than one organization.
    db.add(User(organization_id=orgs[0].id, email=f"dup.{uuid.uuid4().hex[:6]}@company.com",
                hashed_password=get_password_hash("x"), role="Admin", is_active=True))
    for org in orgs:
        user = db.query(User).filter(User.organization_id == org.id, User.email == shared_email).first()
        user.hashed_password = get_password_hash("SamePass1")
    db.commit()

    ambiguous = client.post("/api/auth/login", json={"email": shared_email, "password": "SamePass1"})
    assert ambiguous.status_code == 400
    assert "specify your company slug" in ambiguous.json()["detail"]


def test_auth_006_an_inactive_user_is_refused_at_login(client, db):
    """AUTH-006 — deactivation blocks login as well as live requests."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    employee.is_active = False
    db.commit()

    res = client.post(
        "/api/auth/login", json={"email": "test_employee@company.com", "password": "employeepassword"}
    )
    assert res.status_code == 403
    assert "Inactive user account" in res.json()["detail"]


def test_auth_007a_a_suspended_organization_blocks_login(client, db):
    """AUTH-007 — tenant suspension is enforced at the login gate too."""
    org = db.query(Organization).filter(Organization.slug == "test-company").first()
    org.is_active = False
    db.commit()

    res = client.post(
        "/api/auth/login", json={"email": "test_employee@company.com", "password": "employeepassword"}
    )
    assert res.status_code == 403
    assert "suspended or inactive" in res.json()["detail"]


def test_auth_009_lockout_engages_after_the_threshold(client):
    """AUTH-009 — repeated failures lock the email, with a wait time given."""
    email = "test_employee@company.com"
    for _ in range(settings.FAILED_LOGIN_LOCKOUT_THRESHOLD):
        assert client.post("/api/auth/login", json={"email": email, "password": "WrongPass1"}).status_code == 400

    locked = client.post("/api/auth/login", json={"email": email, "password": "employeepassword"})
    assert locked.status_code == 429
    assert "Too many failed login attempts" in locked.json()["detail"]


# --------------------------------------------------------------------------
# MFA — the full challenge lifecycle
# --------------------------------------------------------------------------


@pytest.fixture
def mfa_admin(admin_client, db):
    """An Admin enrolled in TOTP, with the secret available to the test."""
    setup = admin_client.post("/api/auth/mfa/setup")
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    assert setup.json()["qr_code_base64"].startswith("data:image/png;base64,")

    enable = admin_client.post("/api/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()})
    assert enable.status_code == 200

    admin = db.query(User).filter(User.email == "test_admin@company.com").first()
    db.refresh(admin)
    assert admin.mfa_enabled is True
    return {"user": admin, "secret": secret}


def test_auth_023_an_enrolled_admin_gets_a_challenge_not_a_session(client, mfa_admin):
    """AUTH-023 — no session cookie is issued until the code is verified."""
    res = client.post(
        "/api/auth/login", json={"email": "test_admin@company.com", "password": "adminpassword"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["mfa_required"] is True
    assert body["mfa_token"]
    assert not any("access_token=" in c for c in res.headers.get_list("set-cookie"))


def test_auth_024_a_valid_code_completes_the_login(client, mfa_admin):
    """AUTH-024 — verification exchanges the challenge for a real session."""
    challenge = client.post(
        "/api/auth/login", json={"email": "test_admin@company.com", "password": "adminpassword"}
    ).json()["mfa_token"]

    res = client.post(
        "/api/auth/mfa/verify",
        json={"mfa_token": challenge, "code": pyotp.TOTP(mfa_admin["secret"]).now()},
    )
    assert res.status_code == 200
    assert any("access_token=" in c for c in res.headers.get_list("set-cookie"))


def test_auth_025_a_wrong_code_is_refused(client, mfa_admin):
    """AUTH-025 — an incorrect TOTP does not yield a session."""
    challenge = client.post(
        "/api/auth/login", json={"email": "test_admin@company.com", "password": "adminpassword"}
    ).json()["mfa_token"]

    res = client.post("/api/auth/mfa/verify", json={"mfa_token": challenge, "code": "000000"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid authentication code"


def test_auth_027_an_access_token_cannot_stand_in_for_the_challenge(client, db, mfa_admin):
    """AUTH-027 — the mfa_challenge type claim is enforced."""
    admin = mfa_admin["user"]
    access = create_jwt_token(subject=admin.id, role="Admin", organization_id=admin.organization_id)
    res = client.post(
        "/api/auth/mfa/verify",
        json={"mfa_token": access, "code": pyotp.TOTP(mfa_admin["secret"]).now()},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid or expired MFA session"


def test_auth_036_a_challenge_for_an_unknown_subject_is_refused(client):
    """A challenge token naming a user who does not exist cannot be redeemed."""
    token = create_mfa_challenge_token(uuid.uuid4())
    res = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": "123456"})
    assert res.status_code == 401


def test_auth_037_a_challenge_with_a_non_uuid_subject_is_refused(client):
    """A hand-forged challenge with a junk subject fails the UUID parse."""
    token = jwt.encode(
        {"sub": "not-a-uuid", "type": "mfa_challenge", "exp": 9999999999},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    res = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": "123456"})
    assert res.status_code == 401


def test_auth_038_enabling_mfa_requires_running_setup_first(admin_client):
    """There is no secret to verify against until setup has generated one."""
    res = admin_client.post("/api/auth/mfa/enable", json={"code": "123456"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Run MFA setup first"


def test_auth_039_enabling_mfa_rejects_a_wrong_code(admin_client):
    """Enrolment is only confirmed by a code the authenticator actually produced."""
    admin_client.post("/api/auth/mfa/setup")
    res = admin_client.post("/api/auth/mfa/enable", json={"code": "000000"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid authentication code"


def test_auth_028_disabling_mfa_requires_the_account_password(admin_client, db, mfa_admin):
    """AUTH-028 — a wrong password leaves MFA on and the secret intact."""
    wrong = admin_client.post("/api/auth/mfa/disable", json={"password": "not-the-password"})
    assert wrong.status_code == 400
    db.refresh(mfa_admin["user"])
    assert mfa_admin["user"].mfa_enabled is True

    right = admin_client.post("/api/auth/mfa/disable", json={"password": "adminpassword"})
    assert right.status_code == 200
    db.refresh(mfa_admin["user"])
    assert mfa_admin["user"].mfa_enabled is False
    assert mfa_admin["user"].totp_secret is None


# --------------------------------------------------------------------------
# refresh — failure modes
# --------------------------------------------------------------------------


def test_auth_040_refresh_without_a_token_is_a_401(client):
    """No cookie and no header is a clean 401, not a 500."""
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401
    assert res.json()["detail"] == "Refresh token missing"


def test_auth_041_refresh_accepts_the_bearer_header_fallback(client, db):
    """The header path mirrors the cookie path, as it does on access tokens."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    refresh = create_jwt_token(
        subject=employee.id, role=employee.role,
        organization_id=employee.organization_id, is_refresh=True,
    )
    res = client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {refresh}"})
    assert res.status_code == 200
    assert any("access_token=" in c for c in res.headers.get_list("set-cookie"))


def test_auth_016_an_access_token_is_not_accepted_at_the_refresh_endpoint(client, db):
    """AUTH-016 — the type claim is checked in both directions."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    access = create_jwt_token(
        subject=employee.id, role=employee.role, organization_id=employee.organization_id
    )
    client.cookies.set("refresh_token", access)
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid refresh token"


def test_auth_042_refresh_for_a_deactivated_user_is_refused(client, db):
    """A refresh token must not outlive the account it belongs to."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    refresh = create_jwt_token(
        subject=employee.id, role=employee.role,
        organization_id=employee.organization_id, is_refresh=True,
    )
    employee.is_active = False
    db.commit()

    client.cookies.set("refresh_token", refresh)
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401
    assert res.json()["detail"] == "User not found or inactive"


def test_auth_043_a_structurally_broken_refresh_token_is_a_401(client):
    """Anything that is not a decodable token fails closed."""
    client.cookies.set("refresh_token", "not.a.token")
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401


# --------------------------------------------------------------------------
# forgot-password
# --------------------------------------------------------------------------


def test_auth_021_forgot_password_is_the_same_for_known_and_unknown_emails(client):
    """AUTH-021 — the response must not reveal whether an account exists."""
    known = client.post("/api/auth/forgot-password", json={"email": "test_employee@company.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@nowhere.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json()["message"].startswith("Password reset instructions")
    assert unknown.json()["message"].startswith("Password reset instructions")


def test_auth_044_forgot_password_can_be_scoped_to_a_company_slug(client):
    """The slug narrows which tenant's account the reset refers to."""
    res = client.post(
        "/api/auth/forgot-password",
        json={"email": "test_employee@company.com", "company_slug": "test-company"},
    )
    assert res.status_code == 200

    unknown_slug = client.post(
        "/api/auth/forgot-password",
        json={"email": "test_employee@company.com", "company_slug": "no-such-tenant"},
    )
    assert unknown_slug.status_code == 200  # still no enumeration signal


def test_auth_022_forgot_password_performs_no_actual_reset(client):
    """
    AUTH-022 / GAP-01 — the flow emails the user to contact an administrator.
    There is no token, no link and no password change: the old credentials
    keep working. This asserts the gap so it cannot be mistaken for a feature.
    """
    client.post("/api/auth/forgot-password", json={"email": "test_employee@company.com"})
    still_works = client.post(
        "/api/auth/login", json={"email": "test_employee@company.com", "password": "employeepassword"}
    )
    assert still_works.status_code == 200


# --------------------------------------------------------------------------
# logout / change-password
# --------------------------------------------------------------------------


def test_auth_045_logout_clears_both_cookies(employee_client):
    """Logout expires the session cookies it set at login."""
    res = employee_client.post("/api/auth/logout")
    assert res.status_code == 200
    cookies = " ".join(res.headers.get_list("set-cookie"))
    assert "access_token=" in cookies and "refresh_token=" in cookies


def test_auth_019_change_password_rejects_a_wrong_current_password(employee_client):
    """AUTH-019 — knowing the session is not enough to rotate the password."""
    res = employee_client.post(
        "/api/auth/change-password",
        json={"old_password": "not-the-password", "new_password": "BrandNewPass1"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Incorrect current password"


def test_auth_046_change_password_takes_effect_immediately(employee_client, client):
    """The new password works and the old one stops working."""
    res = employee_client.post(
        "/api/auth/change-password",
        json={"old_password": "employeepassword", "new_password": "BrandNewPass1"},
    )
    assert res.status_code == 200

    assert client.post(
        "/api/auth/login", json={"email": "test_employee@company.com", "password": "employeepassword"}
    ).status_code == 400
    assert client.post(
        "/api/auth/login", json={"email": "test_employee@company.com", "password": "BrandNewPass1"}
    ).status_code == 200
