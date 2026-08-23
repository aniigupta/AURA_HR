# Backup & restore

## Nightly backups

`backup_db.sh` dumps the production Postgres database via `docker compose exec`
(no DB port needs to be published to the host to run it), gzips it into
`backups/` at the repo root, prunes anything older than `RETENTION_DAYS`
(default 14), and optionally pushes a copy off the VPS.

**One-time setup on the VPS:**

```bash
chmod +x backend/scripts/backup_db.sh
mkdir -p backups
```

**Cron entry** (nightly at 2am server time):

```cron
0 2 * * * REPO_ROOT=/opt/aurahr /opt/aurahr/backend/scripts/backup_db.sh >> /var/log/aurahr-backup.log 2>&1
```

Adjust `REPO_ROOT` to wherever the repo is checked out on the VPS.

## Off-site copy (do this — a same-VPS backup doesn't survive losing the VPS)

1. Create a free-tier bucket (e.g. Backblaze B2's free 10GB tier, or any
   S3-compatible provider you already use).
2. Install [rclone](https://rclone.org/) on the VPS and run `rclone config`
   once to set up the remote.
3. Set `BACKUP_REMOTE` (e.g. in the cron entry's environment, or exported in
   the script's environment) to `your-remote:bucket-name/aurahr`. The script
   picks it up automatically and pushes each dump there after the local copy
   succeeds.

## Restore drill

**Do this at least once before you need it for real** — an untested backup
is not a backup.

```bash
# 1. Decompress
gunzip -k backups/aurahr_<db>_<timestamp>.sql.gz

# 2. Restore into a scratch database first, never directly over production
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -c "CREATE DATABASE aurahr_restore_test;"
cat backups/aurahr_<db>_<timestamp>.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d aurahr_restore_test

# 3. Sanity-check row counts / spot-check a few tables against what you expect
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d aurahr_restore_test -c "SELECT count(*) FROM users;"

# 4. Clean up the scratch database
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -c "DROP DATABASE aurahr_restore_test;"
```

Only restore directly over the real `attendance_db` during an actual incident,
and only after stopping the `backend` service so nothing writes to the
database mid-restore.
