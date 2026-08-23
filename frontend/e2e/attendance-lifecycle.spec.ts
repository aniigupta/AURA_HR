import { test, expect, request as playwrightRequest, Page } from "@playwright/test";

// Matches the seeded office location (backend/app/seed.py DEFAULT_OFFICE_SETTING)
const OFFICE_LAT = 28.613939;
const OFFICE_LNG = 77.209021;

// Creates a fresh, single-use employee via the admin API rather than reusing
// a seeded account through the UI — the backend persists real state across
// e2e runs (unlike the pytest suite's per-test SQLite reset), so any test
// reusing a shared account would collide with "already clocked in today"
// the second time it's ever run. A throwaway account makes each test
// self-contained and safe to rerun indefinitely.
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
  const createRes = await api.post("/api/employees", {
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

// Opens the selfie modal (assumes "PUNCH IN SHIFT" was just clicked) and
// captures a photo. Waits for the fake camera device to have an actual
// decoded frame (readyState >= 2) before capturing — clicking too early
// was observed to leave capturedSelfie unset (the confirm button never
// appears), presumably because capturePhoto()'s drawImage has nothing to
// draw from yet.
async function captureSelfie(page: Page) {
  await expect(page.getByText("Clock-In Selfie Verification")).toBeVisible();
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector("video");
    return !!el && el.readyState >= 2;
  });
  await page.getByRole("button", { name: "Capture Photo" }).click();
  await expect(page.getByRole("button", { name: /Confirm & Punch In/i })).toBeVisible();
}

test.describe("Employee attendance lifecycle", () => {
  test("login, clock in with GPS + selfie, take a break, clock out", async ({ page, context, baseURL }) => {
    const employee = await createTestEmployee(baseURL!, "lifecycle");

    await context.grantPermissions(["geolocation", "camera"]);
    await context.setGeolocation({ latitude: OFFICE_LAT, longitude: OFFICE_LNG });

    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill(employee.email);
    await page.getByPlaceholder("••••••••").fill(employee.password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/employee\/dashboard/);

    await page.getByRole("button", { name: /PUNCH IN SHIFT/i }).click();
    await captureSelfie(page);
    await page.getByRole("button", { name: /Confirm & Punch In/i }).click();

    await expect(page.getByText(/SHIFT TIMER RUNNING/i)).toBeVisible({ timeout: 15000 });

    // Break lifecycle
    await page.getByRole("button", { name: /START BREAK TIME/i }).click();
    await expect(page.getByText("ON BREAK")).toBeVisible();
    await page.getByRole("button", { name: /RESUME WORKING/i }).click();
    await expect(page.getByText(/SHIFT TIMER RUNNING/i)).toBeVisible();

    // Clock out (confirm() browser dialog)
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /PUNCH OUT SHIFT/i }).click();
    await expect(page.getByText(/Shift completed for today/i)).toBeVisible({ timeout: 15000 });
  });

  test("clock-in is rejected when outside the office geofence", async ({ page, context, baseURL }) => {
    const employee = await createTestEmployee(baseURL!, "geofence");

    await context.grantPermissions(["geolocation", "camera"]);
    // Bengaluru — far outside the seeded office's 150m radius in New Delhi.
    await context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 });

    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill(employee.email);
    await page.getByPlaceholder("••••••••").fill(employee.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/employee\/dashboard/);

    await page.getByRole("button", { name: /PUNCH IN SHIFT/i }).click();
    await captureSelfie(page);
    await page.getByRole("button", { name: /Confirm & Punch In/i }).click();

    await expect(page.getByText(/outside office location/i)).toBeVisible({ timeout: 15000 });
  });
});
