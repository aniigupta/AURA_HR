"""
Database Cleanup Script for AuraWork HRMS
Safely clears all organizations, users, and tenant data from a target database (production or local).
"""

import os
import sys
import argparse
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path so app models can be imported if needed
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

TABLES_TO_CLEAR = [
    "break_sessions",
    "attendance_correction_requests",
    "attendance",
    "leave_requests",
    "employee_profiles",
    "audit_logs",
    "company_policies",
    "holidays",
    "office_settings",
    "departments",
    "users",
    "organizations"
]

def get_row_counts(engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    counts = {}
    with engine.connect() as conn:
        for tbl in TABLES_TO_CLEAR:
            if tbl in existing_tables:
                result = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
                counts[tbl] = result.scalar()
            else:
                counts[tbl] = 0
    return counts

def clear_database(database_url: str, force: bool = False, specific_org_slug: str = None, dry_run: bool = False):
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    print(f"\n[INFO] Connecting to database...")
    # Mask password for display
    display_url = database_url
    if "@" in display_url and "://" in display_url:
        prefix, rest = display_url.split("://", 1)
        userpass, hostdb = rest.split("@", 1)
        user = userpass.split(":", 1)[0] if ":" in userpass else userpass
        display_url = f"{prefix}://{user}:****@{hostdb}"
    print(f"[INFO] Target: {display_url}\n")

    engine = create_engine(database_url)

    # 1. Fetch current counts
    counts = get_row_counts(engine)
    print("--- Current Database Statistics ---")
    for tbl, cnt in counts.items():
        print(f"  {tbl:<32}: {cnt} records")
    print("-----------------------------------")

    total_records = sum(counts.values())
    if total_records == 0:
        print("\n[INFO] Database is already completely empty. No data to delete.")
        return

    # 2. Check organizations
    with engine.connect() as conn:
        if "organizations" in inspect(engine).get_table_names():
            orgs = conn.execute(text("SELECT id, name, slug FROM organizations")).fetchall()
            print(f"\nExisting Organizations ({len(orgs)}):")
            for org in orgs:
                print(f"  - [{org[0]}] {org[1]} (slug: {org[2]})")

    if dry_run:
        print("\n[DRY RUN] No records were modified or deleted. Dry run complete.")
        return

    # 3. Confirmation prompt if not forced
    if not force:
        if specific_org_slug:
            prompt_msg = f"\n[WARNING] Are you SURE you want to permanently delete organization '{specific_org_slug}' and all its data? (type 'yes' to confirm): "
        else:
            prompt_msg = f"\n[DANGER] Are you SURE you want to permanently delete ALL organizations, users, and data from this database? (type 'DELETE ALL' to confirm): "
        
        response = input(prompt_msg).strip()
        expected = "yes" if specific_org_slug else "DELETE ALL"
        if response != expected:
            print("[CANCELLED] Operation aborted by user.")
            return

    # 4. Perform Deletion
    with engine.begin() as conn:
        if specific_org_slug:
            print(f"\n[INFO] Deleting organization with slug: {specific_org_slug}...")
            # Because of ON DELETE CASCADE, deleting from organizations removes all child rows
            res = conn.execute(
                text("DELETE FROM organizations WHERE slug = :slug RETURNING id, name"),
                {"slug": specific_org_slug}
            )
            deleted = res.fetchall()
            if not deleted:
                print(f"[WARNING] No organization found with slug '{specific_org_slug}'. Nothing deleted.")
                return
            for d in deleted:
                print(f"[SUCCESS] Deleted organization: {d[1]} ({d[0]})")
        else:
            print("\n[INFO] Clearing all tenant and company data...")
            is_postgres = engine.dialect.name == "postgresql"
            inspector = inspect(engine)
            existing_tables = set(inspector.get_table_names())

            existing_to_clear = [t for t in TABLES_TO_CLEAR if t in existing_tables]

            if is_postgres:
                # PostgreSQL TRUNCATE CASCADE is fastest and resets auto-increment IDs
                tables_csv = ", ".join(f'"{t}"' for t in existing_to_clear)
                conn.execute(text(f"TRUNCATE TABLE {tables_csv} RESTART IDENTITY CASCADE;"))
            else:
                # SQLite / Other: Delete in reverse dependency order
                for tbl in existing_to_clear:
                    conn.execute(text(f"DELETE FROM {tbl};"))

    print("\n[SUCCESS] Cleanup operation completed!")

    # 5. Show post-cleanup statistics
    new_counts = get_row_counts(engine)
    print("\n--- Post-Cleanup Database Statistics ---")
    for tbl, cnt in new_counts.items():
        print(f"  {tbl:<32}: {cnt} records")
    print("----------------------------------------")

    # 6. Check AUTO_SEED reminder
    auto_seed = os.getenv("AUTO_SEED", "").lower() in ("true", "1", "yes")
    if auto_seed:
        print("\n[IMPORTANT REMINDER]:")
        print("  AUTO_SEED is currently set to 'true'. When your backend restarts,")
        print("  it will automatically recreate the demo company ('Aura Technologies India Pvt Ltd').")
        print("  To keep the production database empty, set AUTO_SEED=false in your production environment variables (e.g. in Render/Docker).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wipe organizations and data from database.")
    parser.add_argument(
        "--database-url",
        type=str,
        default=None,
        help="Database connection URL (defaults to DATABASE_URL in .env if not specified)."
    )
    parser.add_argument(
        "--org-slug",
        type=str,
        default=None,
        help="Specific organization slug to delete instead of wiping all."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect existing records and organizations without deleting anything."
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Bypass interactive confirmation prompt."
    )

    args = parser.parse_args()

    db_url = args.database_url or os.getenv("DATABASE_URL") or settings.DATABASE_URL
    if not db_url:
        print("[ERROR] No DATABASE_URL provided. Specify via --database-url or set DATABASE_URL environment variable.")
        sys.exit(1)

    clear_database(db_url, force=args.yes, specific_org_slug=args.org_slug, dry_run=args.dry_run)
