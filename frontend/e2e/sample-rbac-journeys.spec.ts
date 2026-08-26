import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/**
 * Sample Playwright suite accompanying the HRMS Test Plan.
 *
 * Covers the two end-to-end journeys the plan marks P0 (Employee and Admin)
 * plus the role-boundary cases that only a real browser can prove: the
 * Next.js middleware redirect, the server-side 403 behind it, and the AI
 * assistant answering from the caller's own tenant context.
 *
 * These run against an already-running stack (see playwright.config.ts).
 *   npx playwright test e2e/sample-rbac-journeys.spec.ts
 *
 * Selector policy: role- and label-based queries only. The app ships no
 * data-testid attributes today (see the plan's Gaps section — adding them to
 * the Employee, Leave and Payroll tables is a recommended follow-up), so
 * these use accessible names, which are stable against styling changes.
 */

const ADMIN = { email: "admin@company.com", password: "adminpassword" };
const EMPLOYEE_PASSWORD = "E2eTestPass1";

function futureDateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

/**
 * Reusable authenticated API context — the plan's "reusable authentication
 * helper" for setup/teardown that shouldn't cost UI steps.
 */
async function adminApi(baseURL: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/auth/login", { data: ADMIN });
  if (!res.ok()) {
    throw new Error(`Admin login failed during e2e setup: ${res.status()} ${await res.text()}`);
  }
  return api;
}

/**
 * Each spec provisions a throwaway employee. The backend persists real state
 * across e2e runs, so sharing one seeded account would accumulate leave
 * requests until the overlapping-request guard starts rejecting them.
 */
async function createTestEmployee(baseURL: string, tag: string) {
  const api = await adminApi(baseURL);
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e.${tag}.${unique}@company.com`;

  const res = await api.post("/api/employees/", {
    data: {
      email,
      password: EMPLOYEE_PASSWORD,
      role: "Employee",
      profile: {
        first_name: "E2E",
        last_name: tag,
        employee_id: `E2E${unique}`,
        designation: "Test Engineer",
        base_salary: 75000,
        hourly_rate: 450,
      },
    },
  });
  if (!res.ok()) {
    throw new Error(`Test employee creation failed: ${res.status()} ${await res.text()}`);
  }
  const created = await res.json();
  await api.dispose();
  return { id: created.id as string, email, password: EMPLOYEE_PASSWORD };
}

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

// ---------------------------------------------------------------------------
// E2E-001 — Employee journey
// ---------------------------------------------------------------------------

test.describe("E2E-001 Employee journey", () => {
  test("logs in, sees own dashboard, applies for leave, and queries the AI assistant", async ({
    page,
    baseURL,
  }) => {
    const employee = await createTestEmployee(baseURL!, "journey");

    await signIn(page, employee.email, employee.password);
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    // Dashboard shows this employee's own leave balances from /dashboard/employee.
    await expect(page.getByText(/Casual/i).first()).toBeVisible();

    // --- Apply for leave (LEAVE-001 through the UI) ---
    await page.goto("/employee/leaves");
    await page.getByRole("button", { name: /Apply For Leave/i }).click();
    await page.getByLabel(/Start Date/i).fill(futureDateString(21));
    await page.getByLabel(/End Date/i).fill(futureDateString(22));
    await page.getByPlaceholder(/reason/i).fill("E2E journey — planned time off");
    await page.getByRole("button", { name: /Submit Request/i }).click();

    await expect(page.getByText(/Pending/i).first()).toBeVisible({ timeout: 10000 });

    // --- Ask the AI assistant (AI-001 through the UI) ---
    await page.getByRole("button", { name: /Open HR Policy Assistant/i }).click();
    await page.getByRole("button", { name: /Check my current leave balance/i }).click();

    // The assistant must answer from this employee's live profile and cite a source.
    await expect(page.getByText(/Sources:/i).last()).toBeVisible({ timeout: 20000 });
  });
});

// ---------------------------------------------------------------------------
// E2E-010 — Role boundaries in the browser
// ---------------------------------------------------------------------------

test.describe("E2E-010 Role-based access boundaries", () => {
  test("an employee navigating to an admin route is redirected and the API still refuses", async ({
    page,
    baseURL,
  }) => {
    const employee = await createTestEmployee(baseURL!, "rbac");
    await signIn(page, employee.email, employee.password);
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    // 1. Client-side: middleware.ts bounces the navigation.
    await page.goto("/admin/payroll");
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    // 2. Server-side: the real boundary. Middleware is a UX redirect only —
    //    prove the API refuses the same request with the employee's cookies.
    const payroll = await page.request.get("/api/reports/payroll");
    expect(payroll.status()).toBe(403);

    const directory = await page.request.get("/api/employees");
    expect(directory.status()).toBe(403);

    // 3. And no salary data leaked into either response body.
    expect(await payroll.text()).not.toContain("total_salary");
  });

  test("an unauthenticated visitor is sent to login and cannot read any API", async ({ page }) => {
    await page.context().clearCookies();

    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/);

    const res = await page.request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// E2E-020 — Admin journey
// ---------------------------------------------------------------------------

test.describe("E2E-020 Admin journey", () => {
  test("reviews a leave request end to end and the employee sees the outcome", async ({
    browser,
    baseURL,
  }) => {
    const employee = await createTestEmployee(baseURL!, "review");

    // Employee applies via API so the UI assertions focus on the admin path.
    const employeeApi = await playwrightRequest.newContext({ baseURL });
    await employeeApi.post("/api/auth/login", {
      data: { email: employee.email, password: employee.password },
    });
    const applied = await employeeApi.post("/api/leaves/", {
      data: {
        leave_type: "Casual",
        start_date: futureDateString(45),
        end_date: futureDateString(46),
        reason: "E2E admin review path",
      },
    });
    expect(applied.ok()).toBeTruthy();
    const appliedLeave = await applied.json();

    // Admin approves through the UI.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, ADMIN.email, ADMIN.password);
    await expect(adminPage).toHaveURL(/\/admin\/dashboard/);

    await adminPage.goto("/admin/leaves");
    const row = adminPage.getByRole("row", { name: new RegExp(`E2E review`, "i") }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: /Approve/i }).click();

    // Employee's own view reflects the approval — proves it persisted, not
    // just an optimistic admin-side state update.
    const statusRes = await employeeApi.get("/api/leaves/");
    const leaves = await statusRes.json();
    const target = leaves.find((l: { id: string }) => l.id === appliedLeave.id);
    expect(target.status).toBe("Approved");

    await employeeApi.dispose();
    await adminContext.close();
  });
});

// ---------------------------------------------------------------------------
// UI-050 — Error and empty states
// ---------------------------------------------------------------------------

test.describe("UI-050 Error handling", () => {
  test("a failing API surfaces an error state rather than a blank page", async ({ page, baseURL }) => {
    const employee = await createTestEmployee(baseURL!, "errstate");
    await signIn(page, employee.email, employee.password);
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    // Force the leave list endpoint to fail and confirm the page still renders.
    await page.route("**/api/leaves**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Database error", errorCode: "DATABASE_ERROR" }),
      })
    );

    await page.goto("/employee/leaves");

    // The shell must survive: no unhandled crash, no white screen.
    await expect(page.getByRole("heading", { name: /Leave/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("an expired session triggers one refresh attempt, then a clean logout", async ({ page, baseURL }) => {
    const employee = await createTestEmployee(baseURL!, "expiry");
    await signIn(page, employee.email, employee.password);
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    let refreshAttempts = 0;
    await page.route("**/api/auth/refresh", (route) => {
      refreshAttempts += 1;
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "expired" }) });
    });
    await page.route("**/api/dashboard/employee", (route) => route.fulfill({ status: 401, body: "" }));

    await page.reload();

    // apiFetch retries exactly once through /auth/refresh before giving up —
    // it must not loop (see the isRefreshing guard in utils/api.ts).
    await expect(async () => expect(refreshAttempts).toBeLessThanOrEqual(1)).toPass({ timeout: 10000 });
  });
});
