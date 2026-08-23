/**
 * Basic pre-release load test for AuraHR — login, dashboard, and clock-in
 * under concurrent load. NOT run in CI; run manually against a staging
 * copy before a release. See README.md in this directory.
 *
 * Requires k6 (https://k6.io/docs/get-started/installation/).
 *
 * Usage:
 *   k6 run -e BASE_URL=https://staging.example.com -e ADMIN_EMAIL=admin@company.com -e ADMIN_PASSWORD=... load-tests/k6-basic.js
 *
 * Design note: this app rate-limits and can lock out repeated logins against
 * the same account (see backend/app/core/limiter.py and the account-lockout
 * logic in backend/app/core/utils.py) — that's intentional brute-force
 * protection, not something to route around. A load test that just hammers
 * one seeded account with concurrent logins would immediately trip that
 * protection and produce meaningless results (measuring the rate limiter,
 * not the app). So this script creates one throwaway employee account per
 * virtual user in setup(), logs each VU in exactly once, and reuses that
 * session for the rest of the run — matching how a real user's session
 * actually behaves.
 */

import http from "k6/http";
import { check, sleep, fail } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3010";
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || "admin@company.com";
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || "adminpassword";
const TARGET_VUS = parseInt(__ENV.VUS || "20", 10);

// Office coordinates the test accounts will "clock in" from — override if
// your staging office_settings differ (see backend/app/seed.py or your
// admin-configured office_settings for the actual coordinates in use).
const OFFICE_LAT = parseFloat(__ENV.OFFICE_LAT || "28.613939");
const OFFICE_LNG = parseFloat(__ENV.OFFICE_LNG || "77.209021");

const TINY_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const options = {
  stages: [
    { duration: "30s", target: TARGET_VUS }, // ramp up
    { duration: "2m", target: TARGET_VUS }, // hold
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"], // 95% of requests under 800ms
    http_req_failed: ["rate<0.01"], // less than 1% hard failures
    checks: ["rate>0.99"], // less than 1% failed assertions
  },
};

export function setup() {
  const adminJar = http.cookieJar();
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (loginRes.status !== 200) {
    fail(`Admin login failed during setup: ${loginRes.status} ${loginRes.body}`);
  }

  const accounts = [];
  for (let i = 0; i < TARGET_VUS; i++) {
    const unique = `${Date.now()}_${i}`;
    const email = `loadtest.${unique}@company.com`;
    const password = "LoadTestPass1";
    const createRes = http.post(
      `${BASE_URL}/api/employees`,
      JSON.stringify({
        email,
        password,
        role: "Employee",
        profile: { first_name: "Load", last_name: `Test${i}`, employee_id: `LOAD${unique}` },
      }),
      { headers: { "Content-Type": "application/json" }, jar: adminJar }
    );
    if (createRes.status !== 200) {
      fail(`Failed to create load-test account ${i}: ${createRes.status} ${createRes.body}`);
    }
    accounts.push({ email, password });
  }

  return { accounts };
}

export default function (data) {
  const jar = http.cookieJar();
  const account = data.accounts[(__VU - 1) % data.accounts.length];

  if (__ITER === 0) {
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: account.email, password: account.password }),
      { headers: { "Content-Type": "application/json" }, jar }
    );
    check(loginRes, { "login succeeded": (r) => r.status === 200 });

    const clockInRes = http.post(
      `${BASE_URL}/api/attendance/clock-in`,
      JSON.stringify({
        latitude: OFFICE_LAT,
        longitude: OFFICE_LNG,
        selfie_base64: TINY_PNG_BASE64,
        gps_accuracy: 10.0,
      }),
      { headers: { "Content-Type": "application/json" }, jar }
    );
    check(clockInRes, { "clock-in succeeded": (r) => r.status === 200 });
  }

  const dashboardRes = http.get(`${BASE_URL}/api/dashboard/employee`, { jar });
  check(dashboardRes, { "dashboard loaded": (r) => r.status === 200 });

  const historyRes = http.get(`${BASE_URL}/api/attendance/history`, { jar });
  check(historyRes, { "attendance history loaded": (r) => r.status === 200 });

  sleep(1); // roughly one "check the app" cycle per second per VU
}
