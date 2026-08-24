import sys
import os
from datetime import date, time
from typing import Dict, List, Any

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.models import Organization, User, EmployeeProfile, Department, OfficeSetting, Holiday

# Seed Data Definitions
DEFAULT_ORG_NAME = "Aura Technologies India Pvt Ltd"
DEFAULT_ORG_SLUG = "aura-tech"

DEFAULT_DEPARTMENTS: List[Dict[str, str]] = [
    {"name": "Engineering & Tech", "description": "Software architecture, cloud infrastructure, and product development"},
    {"name": "Human Resources", "description": "Talent acquisition, employee relations, payroll, and organizational compliance"},
    {"name": "Finance & Accounts", "description": "Financial planning, statutory compliance, audit, and tax management"},
    {"name": "Sales & Business", "description": "Enterprise client acquisition, revenue growth, and account management"},
    {"name": "Marketing & Growth", "description": "Brand positioning, digital marketing, and market expansion"},
    {"name": "Operations & Facilities", "description": "Daily business operations, vendor logistics, and office facilities"},
]

DEFAULT_OFFICE_SETTING: Dict[str, Any] = {
    "latitude": 28.613939,
    "longitude": 77.209021,
    "allowed_radius": 150.0,
    "office_start_time": time(9, 30, 0),
    "office_end_time": time(18, 30, 0),
    "lunch_break_hours": 1.0,
    "required_working_hours": 8.0,
    "weekends": "Saturday,Sunday",
    "timezone": "Asia/Kolkata",
}

DEFAULT_USERS: List[Dict[str, Any]] = [
    {
        "email": "admin@company.com",
        "password": "adminpassword",
        "role": "Admin",
        "profile": {
            "first_name": "Rajesh",
            "last_name": "Sharma",
            "employee_id": "EMP000",
            "phone": "+91 98765 12345",
            "designation": "Vice President HR & Operations",
            "department": "Human Resources",
            "join_date": date(2023, 4, 1),
            "leave_balance_casual": 12,
            "leave_balance_sick": 10,
            "leave_balance_paid": 15,
            "hourly_rate": 1200.0,
            "base_salary": 180000.0,  # ₹1,80,000 / month
            "wfh_enabled": False,
        },
    },
    {
        "email": "employee@company.com",
        "password": "employeepassword",
        "role": "Employee",
        "profile": {
            "first_name": "Priya",
            "last_name": "Patel",
            "employee_id": "EMP001",
            "phone": "+91 98765 43210",
            "designation": "Senior Full Stack Engineer",
            "department": "Engineering & Tech",
            "join_date": date(2024, 6, 1),
            "leave_balance_casual": 12,
            "leave_balance_sick": 10,
            "leave_balance_paid": 15,
            "hourly_rate": 650.0,
            "base_salary": 95000.0,  # ₹95,000 / month
            "wfh_enabled": False,
        },
    },
    {
        "email": "amit.verma@company.com",
        "password": "employeepassword",
        "role": "Employee",
        "profile": {
            "first_name": "Amit",
            "last_name": "Verma",
            "employee_id": "EMP002",
            "phone": "+91 98765 67890",
            "designation": "Lead Financial Analyst",
            "department": "Finance & Accounts",
            "join_date": date(2024, 2, 15),
            "leave_balance_casual": 10,
            "leave_balance_sick": 8,
            "leave_balance_paid": 14,
            "hourly_rate": 750.0,
            "base_salary": 110000.0,  # ₹1,10,000 / month
            "wfh_enabled": True,
            "wfh_reason": "Statutory Quarterly Audit",
        },
    },
    {
        "email": "sneha.rao@company.com",
        "password": "employeepassword",
        "role": "Employee",
        "profile": {
            "first_name": "Sneha",
            "last_name": "Rao",
            "employee_id": "EMP003",
            "phone": "+91 98765 98765",
            "designation": "Business Development Manager",
            "department": "Sales & Business",
            "join_date": date(2024, 8, 1),
            "leave_balance_casual": 12,
            "leave_balance_sick": 10,
            "leave_balance_paid": 15,
            "hourly_rate": 700.0,
            "base_salary": 105000.0,  # ₹1,05,000 / month
            "wfh_enabled": False,
        },
    },
]

INDIAN_PUBLIC_HOLIDAYS: List[Dict[str, Any]] = [
    {"name": "Republic Day", "date": date(2026, 1, 26), "description": "National Holiday"},
    {"name": "Holi (Festival of Colors)", "date": date(2026, 3, 4), "description": "Gazetted Holiday"},
    {"name": "Good Friday", "date": date(2026, 4, 3), "description": "Public Holiday"},
    {"name": "Independence Day", "date": date(2026, 8, 15), "description": "National Holiday"},
    {"name": "Mahatma Gandhi Jayanti", "date": date(2026, 10, 2), "description": "National Holiday"},
    {"name": "Dussehra (Vijayadashami)", "date": date(2026, 10, 20), "description": "Gazetted Holiday"},
    {"name": "Diwali (Deepavali)", "date": date(2026, 11, 8), "description": "Festival of Lights"},
    {"name": "Guru Nanak Jayanti", "date": date(2026, 11, 24), "description": "Gazetted Holiday"},
    {"name": "Christmas Day", "date": date(2026, 12, 25), "description": "Public Holiday"},
]

def seed_db() -> None:
    """Optimized multi-tenant database seeder with default organization, users, and office settings."""
    print("[*] Initializing Multi-Tenant Indian Enterprise HRMS Database Seeder...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Ensure Default Organization exists
        org = db.query(Organization).filter(Organization.slug == DEFAULT_ORG_SLUG).first()
        if not org:
            org = Organization(
                name=DEFAULT_ORG_NAME,
                slug=DEFAULT_ORG_SLUG,
                plan="Enterprise",
                max_employees=100,
                is_active=True
            )
            db.add(org)
            db.flush()
            print(f"  [+] Created Default Organization: {org.name} ({org.slug})")

        # 2. Batch Sync Departments for Organization
        existing_depts = {d.name: d for d in db.query(Department).filter(Department.organization_id == org.id).all()}
        for item in DEFAULT_DEPARTMENTS:
            name = item["name"]
            if name not in existing_depts:
                dept = Department(organization_id=org.id, name=name, description=item["description"])
                db.add(dept)
                db.flush()
                existing_depts[name] = dept
                print(f"  [+] Created Department: {name}")
            else:
                existing_depts[name].description = item["description"]

        # 3. Sync Office & Geofencing Settings for Organization
        settings = db.query(OfficeSetting).filter(OfficeSetting.organization_id == org.id).first()
        if not settings:
            settings = OfficeSetting(organization_id=org.id, **DEFAULT_OFFICE_SETTING)
            db.add(settings)
            db.flush()
            print(f"  [+] Configured Office Settings for {org.name}")
        else:
            for key, val in DEFAULT_OFFICE_SETTING.items():
                setattr(settings, key, val)

        # 4. Batch Sync Users & Employee Profiles for Organization
        existing_users = {u.email: u for u in db.query(User).filter(User.organization_id == org.id).all()}
        for u_data in DEFAULT_USERS:
            email = u_data["email"]
            prof_data = u_data["profile"]
            dept_obj = existing_depts.get(prof_data["department"])
            dept_id = dept_obj.id if dept_obj else None

            if email not in existing_users:
                user = User(
                    organization_id=org.id,
                    email=email,
                    hashed_password=get_password_hash(u_data["password"]),
                    role=u_data["role"],
                    is_active=True,
                )
                db.add(user)
                db.flush()

                profile = EmployeeProfile(
                    organization_id=org.id,
                    user_id=user.id,
                    first_name=prof_data["first_name"],
                    last_name=prof_data["last_name"],
                    employee_id=prof_data["employee_id"],
                    phone=prof_data["phone"],
                    designation=prof_data["designation"],
                    department_id=dept_id,
                    join_date=prof_data["join_date"],
                    leave_balance_casual=prof_data["leave_balance_casual"],
                    leave_balance_sick=prof_data["leave_balance_sick"],
                    leave_balance_paid=prof_data["leave_balance_paid"],
                    hourly_rate=prof_data["hourly_rate"],
                    base_salary=prof_data["base_salary"],
                    wfh_enabled=prof_data.get("wfh_enabled", False),
                    wfh_reason=prof_data.get("wfh_reason"),
                )
                db.add(profile)
                db.flush()
                print(f"  [+] Created User Profile: {prof_data['first_name']} {prof_data['last_name']} ({email})")
            else:
                user = existing_users[email]
                if user.profile:
                    user.profile.hourly_rate = prof_data["hourly_rate"]
                    user.profile.base_salary = prof_data["base_salary"]
                    user.profile.department_id = dept_id
                    user.profile.designation = prof_data["designation"]
                    user.profile.phone = prof_data["phone"]

        # 5. Batch Sync Public Holidays for Organization
        existing_holiday_dates = {h.date: h for h in db.query(Holiday).filter(Holiday.organization_id == org.id).all()}
        new_holidays = 0
        for h in INDIAN_PUBLIC_HOLIDAYS:
            if h["date"] not in existing_holiday_dates:
                db.add(Holiday(organization_id=org.id, name=h["name"], date=h["date"], description=h["description"]))
                new_holidays += 1

        if new_holidays > 0:
            print(f"  [+] Added {new_holidays} Public Holidays for {org.name}")

        db.commit()
        print("[OK] Multi-Tenant Enterprise HRMS Database seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error seeding database: {e}", file=sys.stderr)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
