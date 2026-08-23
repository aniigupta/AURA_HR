import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/login",
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderAuth() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>,
  });
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    pushMock.mockClear();
    replaceMock.mockClear();
  });

  it("login() returns an MFA challenge without setting the user or redirecting", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(new Response(null, { status: 401 }));
      if (url === "/api/auth/login") {
        return Promise.resolve(
          jsonResponse({ mfa_required: true, mfa_token: "challenge-token-abc", message: "MFA verification required" })
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login("admin@company.com", "pass");
    });

    expect(loginResult).toEqual({ mfaRequired: true, mfaToken: "challenge-token-abc" });
    expect(result.current.user).toBeNull();
    expect(pushMock).not.toHaveBeenCalledWith("/admin/dashboard");
  });

  it("verifyMfa() sets the user and redirects to the admin dashboard on success", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(new Response(null, { status: 401 }));
      if (url === "/api/auth/mfa/verify") {
        return Promise.resolve(
          jsonResponse({
            message: "Login successful",
            user: { id: "u1", email: "admin@company.com", role: "Admin", is_active: true, mfa_enabled: true },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.verifyMfa("challenge-token-abc", "123456");
    });

    expect(result.current.user?.email).toBe("admin@company.com");
    expect(pushMock).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("verifyMfa() rejects and leaves the user unset on an invalid code", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(new Response(null, { status: 401 }));
      if (url === "/api/auth/mfa/verify") {
        return Promise.resolve(jsonResponse({ message: "Invalid authentication code" }, 400));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.verifyMfa("challenge-token-abc", "000000");
      })
    ).rejects.toThrow();

    expect(result.current.user).toBeNull();
  });

  it("login() sets the user directly and redirects for a non-MFA account", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(new Response(null, { status: 401 }));
      if (url === "/api/auth/login") {
        return Promise.resolve(
          jsonResponse({
            message: "Login successful",
            user: { id: "u2", email: "employee@company.com", role: "Employee", is_active: true, mfa_enabled: false },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login("employee@company.com", "pass");
    });

    expect(loginResult).toEqual({ mfaRequired: false });
    expect(result.current.user?.role).toBe("Employee");
    expect(pushMock).toHaveBeenCalledWith("/employee/dashboard");
  });

  it("login() rejects and clears the user on invalid credentials", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(new Response(null, { status: 401 }));
      if (url === "/api/auth/login") {
        return Promise.resolve(jsonResponse({ message: "Incorrect email or password" }, 400));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login("employee@company.com", "wrong");
      })
    ).rejects.toThrow();

    expect(result.current.user).toBeNull();
  });
});
