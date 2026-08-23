# Load testing

`k6-basic.js` is a pre-release sanity check, not a CI gate — run it manually
against a staging copy before a release to confirm the VPS holds under
expected concurrent load. It is **not** wired into CI (see the main
`.github/workflows/ci.yml`) — a load test belongs in a deliberate,
observed run against a disposable environment, not an automated pipeline
step that runs on every push.

**Not yet run for real:** k6 isn't installed in the environment this script
was written in, so this has been reviewed carefully against k6's documented
API but not actually executed. Treat the first real run as a shakedown of
the script itself, not just the app.

## Setup

1. Install k6: https://k6.io/docs/get-started/installation/
2. Have a staging deployment with a real admin account you're comfortable
   creating throwaway employee accounts against (the script creates one
   employee per virtual user — do not point this at production).

## Running it

```bash
k6 run \
  -e BASE_URL=https://staging.yourdomain.com \
  -e ADMIN_EMAIL=admin@company.com \
  -e ADMIN_PASSWORD=your_staging_admin_password \
  -e VUS=20 \
  load-tests/k6-basic.js
```

`VUS` controls both the number of concurrent virtual users and the number of
throwaway employee accounts created in `setup()` — each VU gets its own
account and logs in exactly once, then repeatedly hits the dashboard and
attendance-history endpoints for the test's duration. This mirrors real
usage (one login, many reads) rather than hammering login itself, which
would immediately trip the rate limiter / account lockout from Phase 1 of
the production-readiness work and measure the wrong thing.

## Reading results

k6 prints a summary at the end. The thresholds already configured in the
script (`p(95)<800ms`, `<1%` failed requests, `>99%` passed checks) will
make the run exit non-zero if violated — treat that as "investigate before
shipping," not an automatic blocker.

If you need to adjust the office coordinates the synthetic clock-ins use
(`OFFICE_LAT`/`OFFICE_LNG` env vars), match whatever `office_settings` your
staging environment is actually configured with — see the "Portal &
Geofence Settings" admin page.
