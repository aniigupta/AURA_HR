import fakeredis
import pytest
from datetime import time, date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash, create_jwt_token
from app.main import app
from app.models.models import Organization, User, EmployeeProfile, Department, OfficeSetting

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """
    slowapi keys its counters on the client IP, and every TestClient request
    presents the same one. Its storage is process-wide, so without this a test
    that exhausts the 10/minute login limit leaves every later test in the run
    getting 429s — which is exactly how an unrelated employee test started
    failing once the auth suite grew. Clearing between tests keeps the limit
    testable inside a test without leaking outside it.
    """
    from app.core.limiter import limiter

    def clear():
        for storage in (getattr(limiter, "_storage", None), getattr(limiter, "_fallback_storage", None)):
            try:
                if storage is not None:
                    storage.reset()
            except Exception:
                # An unreachable Redis is fine here: the in-memory fallback is
                # the storage that actually accumulates state in tests.
                pass

    clear()
    yield
    clear()


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.core.limiter.redis_client", fake)
    yield fake
    fake.flushall()

# SQLite in-memory configuration for fast isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db_session = TestingSessionLocal()
    
    try:
        seed_test_data(db_session)
        yield db_session
    finally:
        db_session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def admin_client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        admin = db.query(User).filter(User.email == "test_admin@company.com").first()
        token = create_jwt_token(subject=admin.id, role="Admin", organization_id=admin.organization_id, is_refresh=False)
        test_client.cookies.set("access_token", token)
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def employee_client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        employee = db.query(User).filter(User.email == "test_employee@company.com").first()
        token = create_jwt_token(subject=employee.id, role="Employee", organization_id=employee.organization_id, is_refresh=False)
        test_client.cookies.set("access_token", token)
        yield test_client
    app.dependency_overrides.clear()

def seed_test_data(db_session):
    # Create Default Test Organization
    org = Organization(
        name="Test Company Inc",
        slug="test-company",
        plan="Starter",
        max_employees=25,
        is_active=True
    )
    db_session.add(org)
    db_session.flush()

    # Create Office Settings (IST +5.5 hours)
    settings = OfficeSetting(
        organization_id=org.id,
        latitude=28.3971956,
        longitude=77.3131177,
        allowed_radius=100.0,
        office_start_time=time(10, 0, 0),
        office_end_time=time(19, 0, 0),
        lunch_break_hours=1.0,
        required_working_hours=8.0,
        weekends="Saturday,Sunday",
        timezone="Asia/Kolkata"
    )
    db_session.add(settings)

    # Create Departments
    eng_dept = Department(organization_id=org.id, name="Engineering", description="Engineering Dept")
    hr_dept = Department(organization_id=org.id, name="HR", description="HR Dept")
    db_session.add_all([eng_dept, hr_dept])
    db_session.flush()

    # Create Admin
    admin_user = User(
        organization_id=org.id,
        email="test_admin@company.com",
        hashed_password=get_password_hash("adminpassword"),
        role="Admin",
        is_active=True
    )
    db_session.add(admin_user)
    db_session.flush()

    admin_profile = EmployeeProfile(
        organization_id=org.id,
        user_id=admin_user.id,
        first_name="Test",
        last_name="Admin",
        employee_id="EMP000",
        department_id=eng_dept.id,
        leave_balance_casual=12,
        leave_balance_sick=10,
        leave_balance_paid=15
    )
    db_session.add(admin_profile)

    # Create Employee
    emp_user = User(
        organization_id=org.id,
        email="test_employee@company.com",
        hashed_password=get_password_hash("employeepassword"),
        role="Employee",
        is_active=True
    )
    db_session.add(emp_user)
    db_session.flush()

    emp_profile = EmployeeProfile(
        organization_id=org.id,
        user_id=emp_user.id,
        first_name="Test",
        last_name="Employee",
        employee_id="EMP001",
        department_id=eng_dept.id,
        leave_balance_casual=12,
        leave_balance_sick=10,
        leave_balance_paid=15
    )
    db_session.add(emp_profile)
    db_session.commit()
