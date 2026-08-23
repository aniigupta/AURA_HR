import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware.ts) error tracking. See sentry.server.config.ts
// for the Node-runtime equivalent.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
