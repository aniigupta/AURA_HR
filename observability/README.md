# Observability stack

Self-hosted, free, no external accounts required: error tracking (GlitchTip),
metrics (Prometheus + Grafana), log aggregation (Loki + Promtail), and uptime
monitoring with alerting (Uptime Kuma).

Every service is bound to `127.0.0.1` only — none of this is reachable from
the public internet, even though it runs on the same VPS as the app. Reach it
over an SSH tunnel instead.

**Resource note:** this stack (mainly GlitchTip's Django+Celery web/worker
pair) wants roughly 2GB of extra RAM beyond the main app stack. If your VPS
is small, consider using hosted Sentry's free tier instead of self-hosting
GlitchTip — you'd skip the `glitchtip-*` services below and just set
`SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` to the hosted DSN.

## 1. One-time setup

1. Copy `.env.example` (repo root) to `.env` and fill in real values —
   `GLITCHTIP_SECRET_KEY` and `GRAFANA_ADMIN_PASSWORD` are required by this
   stack specifically.
2. Create the GlitchTip database on the existing Postgres instance (it
   reuses your app's `db` service rather than running a second Postgres):
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U "$POSTGRES_USER" -c "CREATE DATABASE glitchtip;"
   ```
3. Start everything:
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.observability.yml up -d
   ```
   `glitchtip-migrate` runs once and exits (that's expected) before
   `glitchtip-web`/`glitchtip-worker` start.

## 2. Open an SSH tunnel from your machine

```bash
ssh -L 3000:localhost:3000 -L 8080:localhost:8080 -L 3001:localhost:3001 you@your-vps
```

Then, on your own machine:

- **Grafana**: http://localhost:3000 — log in as `admin` / your
  `GRAFANA_ADMIN_PASSWORD`. The Prometheus and Loki datasources are already
  provisioned automatically (`observability/grafana-datasources.yml`) — build
  a dashboard from there, or import a community FastAPI/Starlette dashboard
  ID from Grafana's dashboard gallery as a starting point.
- **GlitchTip**: http://localhost:8080 — first visit prompts you to create
  an admin account (this is a fresh install, first user becomes the owner
  since `ENABLE_OPEN_USER_REGISTRATION=false` locks out anyone else). Create
  an organization, then a project for "aurahr-backend" and one for
  "aurahr-frontend" — each gives you a DSN. Put the backend one in
  `backend/.env.production`'s `SENTRY_DSN`, and the frontend one in
  `frontend/.env.production`'s `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, then
  restart those two services for it to take effect.
- **Uptime Kuma**: http://localhost:3001 — first visit prompts you to create
  an admin account. Add a monitor of type HTTP(s) pointed at your real public
  URL's `/health` endpoint (not the SSH-tunneled address — you want it
  checking the same path a real user would hit), then add a notification
  channel (email, Telegram, Discord, or a generic webhook all work and are
  free) and attach it to the monitor.

## 3. Verify it's actually working

- Trigger a deliberate error (e.g. temporarily raise an exception in a test
  route, or just watch for the next real one) and confirm it shows up in
  GlitchTip within a few seconds.
- Hit the app a few times and confirm Grafana's Prometheus datasource shows
  non-zero `http_requests_total` (exposed at `backend:8000/metrics`,
  internal-only — never proxied publicly, see `nginx/nginx.conf`).
- Stop the `backend` container (`docker compose -f docker-compose.prod.yml stop backend`)
  and confirm Uptime Kuma fires an alert within its check interval, then
  start it back up.
