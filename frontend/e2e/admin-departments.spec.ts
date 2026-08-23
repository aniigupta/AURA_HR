import { test, expect } from "@playwright/test";

// Regression test for a real bug found during Phase 4 e2e work: the "Add
// Department" dialog previously just showed a fake success toast without
// ever calling the API (see git history for admin/departments/page.tsx) —
// the department was never actually created. This proves the fix.
test.describe("Admin department management", () => {
  test("creating a department actually persists it, not just a toast", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill("admin@company.com");
    await page.getByPlaceholder("••••••••").fill("adminpassword");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    await page.goto("/admin/departments");

    const deptName = `E2E Test Dept ${Date.now()}`;
    await page.getByRole("button", { name: /Add Department/i }).click();
    await page.getByPlaceholder(/Quality Assurance/i).fill(deptName);
    await page.getByRole("button", { name: "Create Unit" }).click();

    await expect(page.getByText(`Department '${deptName}' created successfully!`)).toBeVisible();

    // The real proof: reload from the server and confirm it's actually there,
    // not just optimistically shown from client state.
    await page.reload();
    await expect(page.getByText(deptName)).toBeVisible({ timeout: 10000 });
  });
});
