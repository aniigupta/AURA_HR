#!/usr/bin/env bash
set -euo pipefail

# AuraHR Postgres backup script.
#
# Dumps the production database (via `docker compose exec`, no DB port needs
# to be published to the host — matches the locked-down docker-compose.prod.yml
# from the audit pass), gzips it, retains local backups for RETENTION_DAYS,
# and optionally pushes a copy off the VPS via rclone. See README.md in this
# directory for cron setup and a restore drill — an untested backup isn't a
# backup.

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Off-site copy (optional but strongly recommended — a backup that lives on
# the same VPS as the database doesn't protect against losing the VPS).
# Set BACKUP_REMOTE to an rclone remote path, e.g. "b2:my-bucket/aurahr",
# after running `rclone config` once on the host to set up the destination.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

# Load POSTGRES_* from .env.production so this script doesn't need its own
# copy of the credentials.
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env.production}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER must be set (in $ENV_FILE or the environment)}"
: "${POSTGRES_DB:?POSTGRES_DB must be set (in $ENV_FILE or the environment)}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DUMP_FILE="$BACKUP_DIR/aurahr_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "[backup] Dumping database '$POSTGRES_DB' -> $DUMP_FILE"
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip > "$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  echo "[backup] ERROR: backup file is empty — the dump likely failed. Aborting." >&2
  rm -f "$DUMP_FILE"
  exit 1
fi
echo "[backup] Local backup written: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

if [ -n "$BACKUP_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[backup] Copying to off-site remote: $BACKUP_REMOTE"
    rclone copy "$DUMP_FILE" "$BACKUP_REMOTE"
  else
    echo "[backup] WARNING: BACKUP_REMOTE is set but 'rclone' is not installed — skipping off-site copy." >&2
  fi
fi

echo "[backup] Pruning local backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name "aurahr_${POSTGRES_DB}_*.sql.gz" -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] Done."
