/**
 * Covers the employee side of the per-organization selfie requirement.
 *
 * The backend enforces the rule (see backend/tests/test_selfie_requirement_toggle.py);
 * what these assert is that the UI reads the tenant's setting and does not open
 * the camera when HR has switched photo verification off. Asking for a camera
 * permission the organization has opted out of is the specific failure worth
 * guarding against.
 *
 * Run: npx vitest run src/app/employee/dashboard/clock-in-selfie-policy.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeDashboard from "./page";
import { apiFetch } from "@/utils/api";

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<typeof import("@/utils/api")>("@/utils/api");
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "test_employee@company.com",
      role: "Employee" as const,
      is_active: true,
      mfa_enabled: false,
      profile: { first_name: "Asha", last_name: "Employee" },
    },
    isLoading: false,
  }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const DASHBOARD = {
  today: { clock_in: null, clock_out: null, status: "Absent", working_hours: 0, break_duration: 0, is_on_break: false },
  stats: { attendance_percentage: 100, avg_working_hours: 0, leave_balances: { casual: 12, sick: 10, paid: 15 } },
};

let getUserMedia: ReturnType<typeof vi.fn>;

/** Routes each endpoint the dashboard calls; `requireSelfie` drives the setting under test. */
function stubApi(requireSelfie: boolean) {
  mockedApiFetch.mockImplementation((endpoint: string) => {
    if (endpoint === "/dashboard/employee") return Promise.resolve(DASHBOARD);
    if (endpoint === "/attendance/history") return Promise.resolve([]);
    if (endpoint === "/attendance/corrections") return Promise.resolve([]);
    if (endpoint === "/settings/office") return Promise.resolve({ require_selfie: requireSelfie });
    if (endpoint === "/attendance/clock-in") {
      return Promise.resolve({ clock_in: new Date().toISOString(), status: "Present" });
    }
    return Promise.resolve({});
  });
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmployeeDashboard />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  Element.prototype.scrollIntoView = vi.fn();

  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: 28.3971956, longitude: 77.3131177, accuracy: 12 },
        } as GeolocationPosition),
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ATT-UI — clock-in selfie policy", () => {
  it("ATT-UI-004a: opens the camera when the organization requires a selfie", async () => {
    stubApi(true);
    renderDashboard();

    // The button stays disabled until the office policy resolves (ATT-UI-004c).
    const punchIn = await screen.findByRole("button", { name: /Punch In/i });
    await waitFor(() => expect(punchIn).toBeEnabled());
    fireEvent.click(punchIn);

    // The verification dialog appears and the camera is started.
    expect(await screen.findByText(/selfie verification photo is required/i)).toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    // Nothing is submitted until a photo is captured and confirmed.
    expect(mockedApiFetch).not.toHaveBeenCalledWith("/attendance/clock-in", expect.anything());
  });

  it("ATT-UI-004b: punches in from GPS alone when HR has disabled photo verification", async () => {
    stubApi(false);
    renderDashboard();

    // The button stays disabled until the office policy resolves (ATT-UI-004c).
    const punchIn = await screen.findByRole("button", { name: /Punch In/i });
    await waitFor(() => expect(punchIn).toBeEnabled());
    fireEvent.click(punchIn);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/attendance/clock-in",
        expect.objectContaining({ method: "POST" })
      )
    );

    const body = JSON.parse(
      mockedApiFetch.mock.calls.find((c) => c[0] === "/attendance/clock-in")![1]!.body as string
    );
    expect(body.latitude).toBeCloseTo(28.3971956);
    expect(body.selfie_base64).toBeUndefined();

    // The camera is never touched and the dialog never opens.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByText(/selfie verification photo is required/i)).not.toBeInTheDocument();
  });

  it("ATT-UI-004c: punch-in is held until the office policy is known", async () => {
    // Acting on an unloaded setting picks a branch at random: too early and an
    // opted-out organization still gets a camera prompt. Holding the button
    // for the length of one local query removes the ambiguity entirely.
    mockedApiFetch.mockImplementation((endpoint: string) => {
      if (endpoint === "/dashboard/employee") return Promise.resolve(DASHBOARD);
      if (endpoint === "/attendance/history") return Promise.resolve([]);
      if (endpoint === "/attendance/corrections") return Promise.resolve([]);
      if (endpoint === "/settings/office") return new Promise(() => {}); // never resolves
      return Promise.resolve({});
    });
    renderDashboard();

    const punchIn = await screen.findByRole("button", { name: /Punch In/i });
    expect(punchIn).toBeDisabled();

    fireEvent.click(punchIn);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mockedApiFetch).not.toHaveBeenCalledWith("/attendance/clock-in", expect.anything());
  });
});
