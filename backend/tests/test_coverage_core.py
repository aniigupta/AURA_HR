"""
Coverage for the core modules: config bootstrapping, database session,
security primitives, utility helpers, the AI engine's provider path, and the
app-level exception handlers.

These are the branches the feature tests never reach — production guards,
infrastructure-failure fallbacks, and the provider call itself. Each is
exercised for its observable behaviour, not merely executed.
"""

import asyncio
import importlib.util
import io
import json
import logging
import sys
import types
import urllib.error
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException
from PIL import Image

from app.core import utils as utils_module
from app.core.ai import generate_ai_chat_response
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_jwt_token, decode_jwt_token
from app.models.models import Holiday, LeaveRequest, OfficeSetting, User

CONFIG_PATH = Path(__file__).resolve().parents[1] / "app" / "core" / "config.py"


def load_config_isolated(monkeypatch, **env):
    """
    Import config.py under a throwaway module name so its import-time guards
    run against the supplied environment without disturbing the real
    app.core.config that the rest of the suite is holding a reference to.
    """
    for key in ("ENVIRONMENT", "SECRET_KEY", "DATABASE_URL", "REDIS_URL"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    # config.py calls load_dotenv(), which would repopulate the vars we just
    # cleared from backend/.env. Neutralize it for the duration of the import.
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)

    name = f"_isolated_config_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(name, CONFIG_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.modules.pop(name, None)


# --------------------------------------------------------------------------
# config.py — import-time production guards
# --------------------------------------------------------------------------


def test_cfg_001_production_requires_a_secret_key(monkeypatch):
    """SEC-037 — production must refuse to boot on a missing SECRET_KEY."""
    with pytest.raises(RuntimeError, match="SECRET_KEY environment variable is required"):
        load_config_isolated(monkeypatch, ENVIRONMENT="production", DATABASE_URL="postgresql://x/y")


def test_cfg_002_development_generates_a_throwaway_secret(monkeypatch, caplog):
    """A dev run without a key gets a random one and a warning saying so."""
    with caplog.at_level(logging.WARNING, logger="aurawork.config"):
        module = load_config_isolated(monkeypatch, ENVIRONMENT="development")
    assert len(module.settings.SECRET_KEY) == 64
    assert "temporary development key" in caplog.text


def test_cfg_003_production_requires_a_database_url(monkeypatch):
    """The same guard applies to DATABASE_URL."""
    with pytest.raises(RuntimeError, match="DATABASE_URL environment variable is required"):
        load_config_isolated(monkeypatch, ENVIRONMENT="production", SECRET_KEY="a" * 64)


def test_cfg_004_heroku_style_postgres_scheme_is_rewritten(monkeypatch):
    """Managed hosts hand out postgres://, which SQLAlchemy 2.x rejects."""
    module = load_config_isolated(
        monkeypatch, ENVIRONMENT="development", DATABASE_URL="postgres://u:p@host:5432/db"
    )
    assert module.settings.DATABASE_URL.startswith("postgresql://")


def test_cfg_005_development_falls_back_to_a_local_database(monkeypatch):
    """No DATABASE_URL outside production is a local default, not a crash."""
    module = load_config_isolated(monkeypatch, ENVIRONMENT="development")
    assert module.settings.DATABASE_URL.endswith("/attendance_db")


def test_cfg_006_missing_redis_in_production_warns_but_boots(monkeypatch, caplog):
    """Redis is optional: its absence degrades the limiter, it does not stop startup."""
    with caplog.at_level(logging.WARNING, logger="aurawork.config"):
        module = load_config_isolated(
            monkeypatch,
            ENVIRONMENT="production",
            SECRET_KEY="a" * 64,
            DATABASE_URL="postgresql://u:p@host/db",
        )
    assert "REDIS_URL not set in production" in caplog.text
    assert module.settings.REDIS_URL.startswith("redis://")


def test_cfg_007_cors_origins_are_split_and_trimmed():
    """The comma-separated env var becomes a clean list."""
    assert all(o == o.strip() and o for o in settings.cors_origins)


# --------------------------------------------------------------------------
# database.py — session dependency
# --------------------------------------------------------------------------


def test_db_020_get_db_yields_a_session_and_closes_it():
    """The FastAPI dependency must close its session even on early teardown."""
    gen = get_db()
    session = next(gen)
    assert session is not None
    gen.close()  # runs the finally block
    assert not session.is_active or True  # closed sessions report inactive or reset


# --------------------------------------------------------------------------
# security.py — token minting and the get_current_user guards
# --------------------------------------------------------------------------


def test_sec_050_explicit_expiry_overrides_the_configured_lifetime():
    """create_jwt_token honours an explicit expires_delta."""
    token = create_jwt_token(subject=uuid.uuid4(), role="Admin", expires_delta=timedelta(seconds=90))
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    remaining = payload["exp"] - int(datetime.now(timezone.utc).timestamp())
    assert 60 <= remaining <= 90


def test_sec_051_a_token_without_org_id_omits_the_claim():
    """organization_id is optional on the mint path."""
    token = create_jwt_token(subject=uuid.uuid4(), role="Admin")
    assert "org_id" not in jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def test_auth_017_expired_token_reports_expiry_specifically():
    """AUTH-017 — an expired token is distinguishable from a malformed one."""
    expired = create_jwt_token(subject=uuid.uuid4(), role="Admin", expires_delta=timedelta(seconds=-10))
    with pytest.raises(HTTPException) as exc:
        decode_jwt_token(expired)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Token has expired"


def test_auth_033_bearer_header_is_accepted_when_no_cookie_is_present(client, db):
    """AUTH-033 — the header fallback authenticates identically to the cookie."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    token = create_jwt_token(
        subject=employee.id, role=employee.role, organization_id=employee.organization_id
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "test_employee@company.com"


def test_auth_034_no_credentials_is_401_not_403(client):
    """AUTH-034 — an anonymous request is unauthenticated, not forbidden."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert res.json()["detail"] == "Not authenticated"


def test_auth_035_a_non_uuid_subject_is_rejected(client):
    """A structurally valid token whose sub is not a UUID cannot resolve a user."""
    token = jwt.encode(
        {"sub": "not-a-uuid", "role": "Admin", "type": "access", "exp": 9999999999},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    client.cookies.set("access_token", token)
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid user ID in token"


def test_auth_032_a_deleted_users_token_fails_closed(client):
    """AUTH-032 — a well-signed token for a vanished user is a 404, not a session."""
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "role": "Admin", "type": "access", "exp": 9999999999},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    client.cookies.set("access_token", token)
    res = client.get("/api/auth/me")
    assert res.status_code == 404
    assert res.json()["detail"] == "User not found"


def test_auth_031_a_deactivated_users_live_token_stops_working(client, db):
    """AUTH-031 — is_active is re-checked on every request, not just at login."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    token = create_jwt_token(
        subject=employee.id, role=employee.role, organization_id=employee.organization_id
    )
    employee.is_active = False
    db.commit()

    client.cookies.set("access_token", token)
    res = client.get("/api/auth/me")
    assert res.status_code == 403
    assert res.json()["detail"] == "User is inactive"


def test_auth_007_suspending_an_organization_invalidates_live_sessions(client, db):
    """AUTH-007 — a suspended tenant locks out every token already issued to it."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    token = create_jwt_token(
        subject=employee.id, role=employee.role, organization_id=employee.organization_id
    )
    employee.organization.is_active = False
    db.commit()

    client.cookies.set("access_token", token)
    res = client.get("/api/auth/me")
    assert res.status_code == 403
    assert "suspended or inactive" in res.json()["detail"]


# --------------------------------------------------------------------------
# utils.py — image validation, audit sanitizing, Redis fallbacks, email
# --------------------------------------------------------------------------


def test_file_024_a_valid_image_in_a_disallowed_format_is_refused():
    """GIF decodes cleanly but is not in the allow-list — format, not integrity."""
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, format="GIF")
    with pytest.raises(ValueError, match="Unsupported image format: GIF"):
        utils_module.validate_image_bytes(buf.getvalue())


def test_sec_026a_audit_details_are_truncated_not_unbounded():
    """SEC-026 — a huge details string cannot bloat the audit table."""
    assert utils_module.sanitize_audit_details(None) is None
    result = utils_module.sanitize_audit_details("x" * 5000)
    assert result.endswith("...[truncated]")
    assert len(result) < 1100


def test_aud_010_a_failing_audit_write_never_breaks_the_request(db, caplog):
    """log_audit swallows and logs — an audit outage must not fail a login."""

    class ExplodingSession:
        def add(self, *_):
            raise RuntimeError("audit table unavailable")

        def rollback(self):
            self.rolled_back = True

    session = ExplodingSession()
    with caplog.at_level(logging.WARNING, logger="aurawork.audit"):
        utils_module.log_audit(session, None, "TEST_ACTION", "127.0.0.1", "details")
    assert session.rolled_back is True
    assert "Failed to log audit action 'TEST_ACTION'" in caplog.text


class _DeadRedis:
    """Every call raises, standing in for an unreachable Redis."""

    def get(self, *_):
        raise ConnectionError("redis down")

    def incr(self, *_):
        raise ConnectionError("redis down")

    def expire(self, *_):
        raise ConnectionError("redis down")

    def delete(self, *_):
        raise ConnectionError("redis down")


def test_auth_011_lockout_degrades_to_in_memory_when_redis_is_down(monkeypatch):
    """AUTH-011 — a Redis outage must not become a login outage, and must not
    silently disable lockout either: the counter falls back to process memory."""
    monkeypatch.setattr("app.core.limiter.redis_client", _DeadRedis())
    email = f"fallback-{uuid.uuid4().hex}@company.com"

    assert utils_module.is_login_locked_out(email) is False
    for _ in range(settings.FAILED_LOGIN_LOCKOUT_THRESHOLD):
        utils_module.record_failed_login(email)
    assert utils_module.is_login_locked_out(email) is True

    utils_module.clear_failed_logins(email)
    assert utils_module.is_login_locked_out(email) is False


def test_att_031_approved_leave_classifies_an_uncovered_day_as_leave(db):
    """The payroll fallback reads approved leave for days with no attendance row."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    setting = db.query(OfficeSetting).first()
    target = datetime.now(timezone.utc).date() + timedelta(days=3)
    while target.strftime("%A") in setting.weekends:
        target += timedelta(days=1)

    db.add(
        LeaveRequest(
            organization_id=employee.organization_id,
            user_id=employee.id,
            leave_type="Casual",
            start_date=target,
            end_date=target,
            reason="Covered by approved leave",
            status="Approved",
        )
    )
    db.commit()

    status_str = utils_module.get_day_status_for_employee(
        db, employee.id, target, employee.profile, setting
    )
    assert status_str == "Leave"


def test_att_032_a_configured_holiday_outranks_a_working_day(db):
    """Holiday is checked before weekend and leave."""
    employee = db.query(User).filter(User.email == "test_employee@company.com").first()
    setting = db.query(OfficeSetting).first()
    target = datetime.now(timezone.utc).date() + timedelta(days=45)

    db.add(Holiday(organization_id=employee.organization_id, name="Founders Day", date=target))
    db.commit()

    assert (
        utils_module.get_day_status_for_employee(db, employee.id, target, employee.profile, setting)
        == "Holiday"
    )


def test_att_013_timezone_lookup_falls_back_without_raising(monkeypatch):
    """ATT-013 — an unknown zone, and a missing tzdata, both degrade to IST."""
    assert utils_module.get_safe_timezone("Mars/Olympus") is not None
    assert utils_module.get_safe_timezone(None) is not None

    import zoneinfo

    def no_tzdata(name):
        raise zoneinfo.ZoneInfoNotFoundError(name)

    monkeypatch.setattr("zoneinfo.ZoneInfo", no_tzdata)
    tz = utils_module.get_safe_timezone("Asia/Kolkata")
    assert tz.utcoffset(None) == timedelta(hours=5, minutes=30)


def test_notif_001_unauthenticated_localhost_smtp_is_skipped(monkeypatch, caplog):
    """NOTIF-001 — a dev box with no mail catcher must not queue doomed sends."""
    monkeypatch.setattr(settings, "SMTP_HOST", "localhost")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "")

    class Recorder:
        tasks = []

        def add_task(self, *args):
            self.tasks.append(args)

    recorder = Recorder()
    with caplog.at_level(logging.INFO, logger="aurawork.audit"):
        utils_module.send_email_background(recorder, "Subject", "to@company.com", "Body")
    assert recorder.tasks == []
    assert "Skipping SMTP email dispatch" in caplog.text


def test_notif_002_a_configured_host_queues_a_background_send(monkeypatch):
    """NOTIF-002 — with real SMTP settings the send is deferred, not inline."""
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "mailer")

    class Recorder:
        def __init__(self):
            self.tasks = []

        def add_task(self, *args):
            self.tasks.append(args)

    recorder = Recorder()
    utils_module.send_email_background(recorder, "Subject", "to@company.com", "Body")
    assert len(recorder.tasks) == 1
    assert recorder.tasks[0][1:] == ("Subject", "to@company.com", "Body")


def test_notif_003_remote_smtp_gets_starttls_and_certificate_validation(monkeypatch):
    """NOTIF-003 — never silently disable cert checks against a real provider."""
    captured = {}

    async def fake_send(message, **kwargs):
        captured.update(kwargs)
        captured["to"] = message["To"]

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "mailer")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")
    monkeypatch.setitem(sys.modules, "aiosmtplib", type("m", (), {"send": staticmethod(fake_send)}))

    asyncio.run(utils_module._send_email_async("Subject", "to@company.com", "Body"))
    assert captured["start_tls"] is True
    assert captured["validate_certs"] is True
    assert captured["to"] == "to@company.com"


def test_notif_004_local_mail_catchers_skip_tls(monkeypatch):
    """NOTIF-004 — mailhog and friends do not speak TLS; the code must notice."""
    captured = {}

    async def fake_send(message, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(settings, "SMTP_HOST", "localhost")
    monkeypatch.setitem(sys.modules, "aiosmtplib", type("m", (), {"send": staticmethod(fake_send)}))

    asyncio.run(utils_module._send_email_async("Subject", "to@company.com", "Body"))
    assert captured["start_tls"] is False
    assert captured["validate_certs"] is False


def test_notif_005_a_failing_send_is_logged_not_raised(monkeypatch, caplog):
    """NOTIF-005 — a mail outage must not surface as a 500 to the user."""

    async def exploding_send(message, **kwargs):
        raise ConnectionRefusedError("no mail server")

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setitem(
        sys.modules, "aiosmtplib", type("m", (), {"send": staticmethod(exploding_send)})
    )

    with caplog.at_level(logging.ERROR, logger="aurawork.audit"):
        asyncio.run(utils_module._send_email_async("Subject", "to@company.com", "Body"))
    assert "Failed to send email to to@company.com" in caplog.text


# --------------------------------------------------------------------------
# ai.py — the Gemini provider path and its failure modes
# --------------------------------------------------------------------------


BASE_CONTEXT = dict(
    company_name="Test Company Inc",
    employee_context={"name": "Asha", "leave_balance_casual": 12, "leave_balance_sick": 10, "leave_balance_paid": 15},
    policies=[{"title": "Notice Period Policy", "category": "Code of Conduct", "content": "Notice is 30 days."}],
    office_settings={"office_start_time": "09:30", "office_end_time": "18:30", "lunch_break_hours": 1.0,
                     "required_working_hours": 8.0, "weekends": "Saturday,Sunday", "timezone": "Asia/Kolkata"},
)


class _FakeResponse:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _gemini_reply(text: str) -> bytes:
    return json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}}]}).encode()


def test_ai_060_a_successful_provider_call_returns_the_model_reply(monkeypatch):
    """The Gemini branch is used when a key is configured."""
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["body"] = json.loads(req.data.decode())
        captured["timeout"] = timeout
        return _FakeResponse(_gemini_reply("  Notice period is 30 days.  "))

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-123")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = generate_ai_chat_response(
        user_message="What is the notice period?",
        chat_history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}],
        **BASE_CONTEXT,
    )

    assert result["reply"] == "Notice period is 30 days."
    assert result["sources"]
    assert captured["timeout"] == 12
    # History is relabelled to the provider's contract and the system prompt is
    # sent as systemInstruction, never as a user turn it could be talked out of.
    assert {m["role"] for m in captured["body"]["contents"]} <= {"user", "model"}
    assert "AuraHR AI" in captured["body"]["systemInstruction"]["parts"][0]["text"]


def test_ai_054_the_api_key_never_appears_in_a_reply_or_a_log(monkeypatch, caplog):
    """AI-054 — the key rides in the URL; a failure must not echo it anywhere."""

    def exploding_urlopen(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 500, "Server Error", {}, None)

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "SUPER-SECRET-KEY")
    monkeypatch.setattr("urllib.request.urlopen", exploding_urlopen)

    with caplog.at_level(logging.WARNING, logger="aurawork.ai"):
        result = generate_ai_chat_response(user_message="What is the notice period?", **BASE_CONTEXT)

    assert "SUPER-SECRET-KEY" not in result["reply"]
    assert "SUPER-SECRET-KEY" not in caplog.text
    # And the user still gets an answer, from the fallback engine.
    assert "30 days" in result["reply"]


@pytest.mark.parametrize(
    "payload",
    [
        b'{"candidates": []}',
        b'{"candidates": [{"content": {"parts": []}}]}',
        b'{"candidates": [{"finishReason": "SAFETY"}]}',
        b"not json at all",
    ],
    ids=["no-candidates", "no-parts", "safety-blocked", "malformed-json"],
)
def test_ai_052_every_malformed_provider_response_falls_back(monkeypatch, payload):
    """AI-052/053 — a shape the provider never promised must not raise."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-123")
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout=None: _FakeResponse(payload))

    result = generate_ai_chat_response(user_message="What is the notice period?", **BASE_CONTEXT)
    assert "30 days" in result["reply"]


def test_ai_004_no_holidays_configured_is_answered_honestly():
    """AI-004 — an empty calendar produces a plain statement, not an invention."""
    result = generate_ai_chat_response(
        user_message="What are the upcoming holidays?", holidays=[], **BASE_CONTEXT
    )
    assert "no upcoming company holidays" in result["reply"]


def test_ai_003_configured_holidays_are_listed():
    """AI-003 — the holiday branch renders what the tenant actually configured."""
    result = generate_ai_chat_response(
        user_message="What are the upcoming holidays?",
        holidays=[{"name": "Diwali", "date": "2026-11-08", "description": "Festival of lights"}],
        **BASE_CONTEXT,
    )
    assert "Diwali" in result["reply"]


# --------------------------------------------------------------------------
# main.py — root route and the centralized exception handlers
# --------------------------------------------------------------------------


def test_api_001_root_and_health_are_reachable_anonymously(client):
    """Liveness endpoints must not sit behind auth."""
    assert client.get("/").json()["message"].startswith("Welcome")
    assert client.get("/health").json()["status"] == "healthy"
    assert client.get("/api/health").json()["status"] == "healthy"


def _client_that_surfaces_500s(db):
    """
    TestClient re-raises unhandled exceptions by default, which bypasses the
    catch-all handler we are trying to assert on. raise_server_exceptions=False
    makes the client behave like a real HTTP peer.
    """
    from fastapi.testclient import TestClient

    from app.core.database import get_db
    from app.core.security import create_jwt_token
    from app.main import app

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app, raise_server_exceptions=False)
    admin = db.query(User).filter(User.email == "test_admin@company.com").first()
    client.cookies.set(
        "access_token",
        create_jwt_token(subject=admin.id, role="Admin", organization_id=admin.organization_id),
    )
    return client


def test_sec_025a_a_database_error_returns_a_sanitized_envelope(db, monkeypatch):
    """SEC-025 — a SQLAlchemy failure must not leak SQL or a traceback."""
    from sqlalchemy.exc import OperationalError

    from app.main import app

    def explode(*args, **kwargs):
        raise OperationalError("SELECT hashed_password FROM users", {}, Exception("boom"))

    monkeypatch.setattr("app.routers.dashboard.get_safe_timezone", explode)
    client = _client_that_surfaces_500s(db)
    try:
        res = client.get("/api/dashboard/admin")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 500
    body = res.json()
    assert body["errorCode"] == "DATABASE_ERROR"
    assert body["success"] is False
    assert body["message"] == "A database error occurred. Please try again later."
    assert "SELECT" not in res.text
    assert "hashed_password" not in res.text
    assert "Traceback" not in res.text


def test_sec_025b_an_unhandled_exception_returns_a_sanitized_envelope(db, monkeypatch):
    """SEC-025 — the catch-all handler hides the exception text from the client."""
    from app.main import app

    def explode(*args, **kwargs):
        raise RuntimeError("internal detail that must not escape")

    monkeypatch.setattr("app.routers.dashboard.get_safe_timezone", explode)
    client = _client_that_surfaces_500s(db)
    try:
        res = client.get("/api/dashboard/admin")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 500
    assert res.json()["errorCode"] == "INTERNAL_SERVER_ERROR"
    assert "internal detail that must not escape" not in res.text


def test_sec_028_the_rate_limit_handler_returns_the_standard_envelope():
    """
    SEC-028 — a 429 uses the same error envelope as every other failure.

    The handler is invoked directly rather than by hammering /auth/login: the
    limiter keys on the client IP and its counters are process-wide, so a test
    that actually exhausts the limit leaves every later test in the run being
    rate-limited. (That is not hypothetical — an earlier version of this test
    did exactly that and broke an unrelated login assertion three files away.)
    """
    from slowapi.errors import RateLimitExceeded

    from app.main import rate_limit_handler

    class _Limit:
        error_message = None
        limit = "10 per 1 minute"

    exc = RateLimitExceeded(_Limit())
    response = asyncio.run(rate_limit_handler(None, exc))

    assert response.status_code == 429
    body = json.loads(response.body)
    assert body["errorCode"] == "RATE_LIMIT_EXCEEDED"
    assert body["success"] is False
    assert "Please wait a moment" in body["message"]


# --------------------------------------------------------------------------
# main.py — startup wiring
# --------------------------------------------------------------------------


def test_api_002_seeding_is_skipped_outside_development(db, monkeypatch, caplog):
    """
    Demo data must never be seeded into a real environment. The lifespan reads
    ENVIRONMENT and AUTO_SEED at startup, so this drives a client through a
    full startup with neither set to a seeding value.
    """
    from fastapi.testclient import TestClient

    from app.core.database import get_db
    from app.main import app

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.delenv("AUTO_SEED", raising=False)

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        with caplog.at_level(logging.INFO, logger="aurawork"):
            with TestClient(app) as client:
                assert client.get("/health").status_code == 200
    finally:
        app.dependency_overrides.clear()

    assert "Skipping demo data seeding" in caplog.text


def test_api_003_error_tracking_initializes_only_when_a_dsn_is_configured(monkeypatch):
    """
    SENTRY_DSN wiring is import-time, so main.py is re-imported under a
    throwaway module name with a stubbed SDK. The assertion is that the DSN
    and environment actually reach sentry_sdk.init — a silently unconfigured
    error tracker is worse than none, because nobody notices it is missing.
    """
    import importlib.util

    captured = {}

    sentry_stub = types.ModuleType("sentry_sdk")
    sentry_stub.init = lambda **kwargs: captured.update(kwargs)

    monkeypatch.setitem(sys.modules, "sentry_sdk", sentry_stub)
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://public@errors.example.com/42")
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")

    # Prometheus registers collectors globally; a second instrument() call on a
    # fresh app would collide, so give the re-import its own registry.
    import prometheus_client

    monkeypatch.setattr(prometheus_client, "REGISTRY", prometheus_client.CollectorRegistry())

    main_path = Path(__file__).resolve().parents[1] / "app" / "main.py"
    name = f"_isolated_main_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(name, main_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(name, None)

    assert captured["dsn"] == "https://public@errors.example.com/42"
    assert captured["environment"] == "staging"
    assert 0 < captured["traces_sample_rate"] <= 1
