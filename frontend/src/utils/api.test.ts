import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, ApiError } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on a successful request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));
    vi.stubGlobal("fetch", mockFetch);

    const data = await apiFetch<{ hello: string }>("/test");

    expect(data.hello).toBe("world");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws an ApiError carrying the server's message on a non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ message: "Nope", detail: "Nope" }, 400));
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiFetch("/test")).rejects.toBeInstanceOf(ApiError);
  });

  it("on a 401, refreshes the session once and retries the original request", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/protected") {
        // First call fails; the retry after refresh succeeds.
        if (mockFetch.mock.calls.filter((c: unknown[]) => c[0] === "/api/protected").length === 1) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(jsonResponse({ data: "secret" }));
      }
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse({ message: "ok" }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await apiFetch<{ data: string }>("/protected");

    expect(result.data).toBe("secret");
    const refreshCalls = mockFetch.mock.calls.filter((c: unknown[]) => c[0] === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not attempt a refresh loop on /auth/login or /auth/refresh themselves", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ message: "Incorrect email or password" }, 400));
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiFetch("/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    // Only the one login call — no /auth/refresh dispatched for a 400 on login itself.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent 401s into a single refresh call", async () => {
    let protectedAttempts = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/protected") {
        protectedAttempts++;
        // The first attempt from each of the two concurrent callers fails;
        // every attempt after the refresh completes succeeds.
        if (protectedAttempts <= 2) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse({ message: "ok" }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const [r1, r2] = await Promise.all([
      apiFetch<{ ok: boolean }>("/protected"),
      apiFetch<{ ok: boolean }>("/protected"),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const refreshCalls = mockFetch.mock.calls.filter((c: unknown[]) => c[0] === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("rejects queued requests if the refresh itself fails", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/protected") {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      if (url === "/api/auth/refresh") {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiFetch("/protected")).rejects.toBeInstanceOf(ApiError);
  });
});
