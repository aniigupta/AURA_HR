import * as Sentry from "@sentry/nextjs";

// Browser-side error tracking. Uses NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN)
// since this code ships to the browser — same DSN value, just the
// build-time-inlined public variant Next.js requires for client code.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
