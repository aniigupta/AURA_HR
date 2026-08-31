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
  organization_id?: string;
  organization_name?: string;
  organization_slug?: string;
  logo_url?: string | null;
  plan?: string;
  is_active: boolean;
  mfa_enabled: boolean;
  first_name?: string;
  last_name?: string;
  profile?: UserProfile;
  organization?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    logo_url?: string | null;
  };
}

const normalizeUser = (data: any): User => {
  if (!data) return data;
  const orgName = data?.organization?.name || data?.organization_name || "AuraHR";
  const orgSlug = data?.organization?.slug || data?.organization_slug || "default";
  const orgPlan = data?.organization?.plan || data?.plan || "Starter";
  const orgLogo = data?.organization?.logo_url || data?.logo_url || null;
  const firstName = data?.profile?.first_name || data?.first_name || "";
  const lastName = data?.profile?.last_name || data?.last_name || "";
  
  return {
    ...data,
    first_name: firstName,
    last_name: lastName,
    organization_name: orgName,
    organization_slug: orgSlug,
    logo_url: orgLogo,
    plan: orgPlan,
    profile: data?.profile || {
      first_name: firstName,
      last_name: lastName,
      employee_id: data?.employee_id || "EMP000",
      leave_balance_casual: 12,
      leave_balance_sick: 10,
      leave_balance_paid: 15,
      wfh_enabled: false,
    },
  };
};

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

interface CompanyRegisterPayload {
  company_name: string;
  company_slug: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  admin_phone?: string;
  designation?: string;
  latitude?: number;
  longitude?: number;
  allowed_radius?: number;
  plan?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  registerCompany: (payload: CompanyRegisterPayload) => Promise<void>;
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
      setUser(normalizeUser(data));
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
          setUser(normalizeUser(data));
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

    const publicPaths = ["/login", "/forgot-password", "/register"];

    if (!user) {
      if (!publicPaths.includes(pathname)) {
        router.push("/login");
      }
    } else {
      if (publicPaths.includes(pathname) || pathname === "/") {
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
        setIsLoading(false);
        return { mfaRequired: true, mfaToken: data.mfa_token };
      }

      const { user: loggedInUser } = data as LoginResponse;
      setUser(normalizeUser(loggedInUser));

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

  const registerCompany = async (payload: CompanyRegisterPayload): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/auth/register-company", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUser(normalizeUser(data.user));
      router.push("/admin/dashboard");
    } catch (err) {
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
      setUser(normalizeUser(data.user));
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
    <AuthContext.Provider value={{ user, isLoading, login, registerCompany, verifyMfa, logout, refreshUser }}>
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
export type { User, UserProfile, CompanyRegisterPayload };
