import { test, expect, request as playwrightRequest } from "@playwright/test";

function futureDateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

// See attendance-lifecycle.spec.ts for why this uses a throwaway account
// instead of a shared seeded one: the backend persists real state across
// e2e runs, so a shared account would accumulate leave requests across every
// run and eventually collide with the "overlapping leave request" check.
async function createTestEmployee(baseURL: string, tag: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const loginRes = await api.post("/api/auth/login", {
    data: { email: "admin@company.com", password: "adminpassword" },
  });
  if (!loginRes.ok()) {
    throw new Error(`Admin login failed during e2e setup: ${loginRes.status()} ${await loginRes.text()}`);
  }

  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e.${tag}.${unique}@company.com`;
  const createRes = await api.post("/api/employees/", {
    data: {
      email,
      password: "E2eTestPass1",
      role: "Employee",
      profile: {
        first_name: "E2E",
        last_name: tag,
        employee_id: `E2E${unique}`,
      },
    },
  });
  if (!createRes.ok()) {
    throw new Error(`Test employee creation failed: ${createRes.status()} ${await createRes.text()}`);
  }
  await api.dispose();
  return { email, password: "E2eTestPass1" };
}

test.describe("Leave application and approval", () => {
  test("employee applies for leave, admin reviews and approves it", async ({ browser, baseURL }) => {
    const employee = await createTestEmployee(baseURL!, "leave");

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();

    await employeePage.goto("/login");
    await employeePage.getByPlaceholder("you@company.com").fill(employee.email);
    await employeePage.getByPlaceholder("••••••••").fill(employee.password);
    await employeePage.getByRole("button", { name: "Sign In" }).click();
    await expect(employeePage).toHaveURL(/\/employee\/dashboard/);

    await employeePage.goto("/employee/leaves");
    await employeePage.getByRole("button", { name: /Apply For Leave/i }).click();

    const startDate = futureDateString(10);
    const endDate = futureDateString(11);
    const reason = `E2E test leave request ${Date.now()}`;

    const dateInputs = employeePage.locator('input[type="date"]');
    await dateInputs.nth(0).fill(startDate);
    await dateInputs.nth(1).fill(endDate);
    await employeePage.getByPlaceholder(/Family function/i).fill(reason);
    await employeePage.getByRole("button", { name: "Submit Application" }).click();

    await expect(employeePage.getByText(reason)).toBeVisible({ timeout: 10000 });
    await expect(employeePage.getByText("Awaiting Approval")).toBeVisible();

    await employeeContext.close();

    // Separate browser context for the admin — this is a genuinely different
    // authenticated session, not just a different page.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/login");
    await adminPage.getByPlaceholder("you@company.com").fill("admin@company.com");
    await adminPage.getByPlaceholder("••••••••").fill("adminpassword");
    await adminPage.getByRole("button", { name: "Sign In" }).click();
    await expect(adminPage).toHaveURL(/\/admin\/dashboard/);

    await adminPage.goto("/admin/leaves");
    const targetRow = adminPage.getByRole("row").filter({ hasText: reason });
    await expect(targetRow).toBeVisible({ timeout: 10000 });
    await targetRow.getByRole("button", { name: "Review" }).click();

    await expect(adminPage.getByText("Review Leave Application")).toBeVisible();
    await adminPage.getByRole("button", { name: /Approve Leave/i }).click();

    await expect(adminPage.getByText("Leave request reviewed successfully.")).toBeVisible({ timeout: 10000 });

    // Refresh the pending-review filter and confirm it's no longer listed there
    await adminPage.reload();
    await expect(adminPage.getByRole("row").filter({ hasText: reason })).toHaveCount(0);

    await adminContext.close();
  });
});
