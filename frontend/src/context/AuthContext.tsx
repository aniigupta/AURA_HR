"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/utils/api";

interface UserProfile {
  first_name: string;
  last_name: string;
  employee_id: string;
  phone?: string;
  designation?: string;
  department_id?: number;
  profile_image_url?: string;
  leave_balance_casual: number;
  leave_balance_sick: number;
  leave_balance_paid: number;
  wfh_enabled: boolean;
  wfh_start_date?: string;
  wfh_end_date?: string;
  wfh_reason?: string;
  join_date?: string;
  department?: { id: number; name: string; description?: string };
}

interface User {
  id: string;
  email: string;
  role: "Admin" | "Employee";
  is_active: boolean;
  mfa_enabled: boolean;
  profile?: UserProfile;
}

interface LoginResponse {
  user: User;
  message: string;
}

interface MfaChallengeResponse {
  mfa_required: true;
  mfa_token: string;
  message: string;
}

interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<User>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const data = await apiFetch<User>("/auth/me");
        if (isMounted) {
          setUser(data);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Protect client routing
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      if (pathname !== "/login" && pathname !== "/forgot-password") {
        router.push("/login");
      }
    } else {
      if (pathname === "/login" || pathname === "/") {
        if (user.role === "Admin") {
          router.push("/admin/dashboard");
        } else {
          router.push("/employee/dashboard");
        }
      } else if (pathname.startsWith("/admin") && user.role !== "Admin") {
        router.push("/employee/dashboard");
      } else if (pathname.startsWith("/employee") && user.role !== "Employee") {
        router.push("/admin/dashboard");
      }
    }
  }, [user, isLoading, pathname, router]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LoginResponse | MfaChallengeResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if ("mfa_required" in data && data.mfa_required) {
        // Password verified, but this Admin account has MFA enabled — no
        // session yet. The caller (login page) collects a TOTP code and
        // calls verifyMfa() to actually complete the login.
        setIsLoading(false);
        return { mfaRequired: true, mfaToken: data.mfa_token };
      }

      const { user: loggedInUser } = data as LoginResponse;
      setUser(loggedInUser);

      if (loggedInUser.role === "Admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/employee/dashboard");
      }
      return { mfaRequired: false };
    } catch (err) {
      setUser(null);
      setIsLoading(false);
      throw err;
    }
  };

  const verifyMfa = async (mfaToken: string, code: string) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ mfa_token: mfaToken, code }),
      });
      setUser(data.user);
      // MFA only ever applies to Admin accounts (see backend/app/routers/auth.py)
      router.push("/admin/dashboard");
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setIsLoading(false);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyMfa, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
export type { User, UserProfile };

