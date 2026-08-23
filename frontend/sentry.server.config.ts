import * as Sentry from "@sentry/nextjs";

// Server-side error tracking (Node runtime). Points at the same
// Sentry-protocol DSN as the backend (see backend/app/main.py) — a
// self-hosted GlitchTip instance by default, see docker-compose.observability.yml.
// No-ops automatically if SENTRY_DSN isn't set, so this is safe in dev/test.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
