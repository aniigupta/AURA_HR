export function getBackendUrl(): string {
  return typeof window !== "undefined"
    ? "" // Route through relative Next.js API rewrite proxy in browser
    : (process.env.BACKEND_URL || "http://backend:8000");
}

const API_BASE = `${getBackendUrl()}/api`;

export interface ApiErrorDetail {
  message?: string;
  detail?: string | { msg: string; loc?: string[] }[];
  errorCode?: string;
  success?: boolean;
}

export class ApiError extends Error {
  status: number;
  info: ApiErrorDetail | null;

  constructor(message: string, status: number, info: ApiErrorDetail | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.info = info;
  }
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export async function apiFetch<T = unknown>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, headers, ...rest } = options;

  let url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  // Append Query parameters
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const defaultHeaders: Record<string, string> = {
    "Accept": "application/json",
  };

  if (!(rest.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    ...rest,
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    credentials: "include", // Essential for HTTP-only cookies
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 401 && !endpoint.includes("/auth/login") && !endpoint.includes("/auth/refresh")) {
      // Attempt token refresh
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            isRefreshing = false;
            onRefreshed(data.access_token);
          } else {
            isRefreshing = false;
            throw new ApiError("Session expired", 401);
          }
        } catch (refreshErr) {
          isRefreshing = false;
          throw refreshErr;
        }
      }

      // Queue original requests until token is refreshed
      return new Promise<T>((resolve) => {
        subscribeTokenRefresh(() => {
          resolve(apiFetch<T>(endpoint, options));
        });
      });
    }

    if (!response.ok) {
      let errInfo: ApiErrorDetail | null = null;
      try {
        errInfo = (await response.json()) as ApiErrorDetail;
      } catch {
        // Non-JSON response
      }
      const errorMessage = typeof errInfo?.detail === "string" 
        ? errInfo.detail 
        : (errInfo?.message || `Request failed with status ${response.status}`);
      throw new ApiError(errorMessage, response.status, errInfo);
    }

    // Handle file downloads
    const contentType = response.headers.get("content-type");
    if (contentType && (contentType.includes("octet-stream") || contentType.includes("sheet") || contentType.includes("pdf") || contentType.includes("csv"))) {
      return (await response.blob()) as unknown as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : "Network error", 500);
  }
}

