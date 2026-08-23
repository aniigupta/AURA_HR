"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button, Input } from "@/components/ui/atoms";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { apiFetch, ApiError } from "@/utils/api";

export default function LoginPage() {
  const { login, verifyMfa } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        setIsLoading(false);
        return;
      }
      toast.success("Successfully logged in!");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to sign in. Please verify your credentials.";
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || mfaCode.length !== 6) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setIsLoading(true);
    try {
      await verifyMfa(mfaToken, mfaCode);
      toast.success("Successfully logged in!");
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : "Invalid authentication code.";
      toast.error(errorMsg);
      setMfaCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      toast.success(data.message);
      setIsForgot(false);
      setForgotEmail("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred. Please try again.";
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen p-3.5 sm:p-4 bg-slate-50">
      <div className="w-full max-w-md">
        
        {/* Portal Branding */}
        <div className="flex flex-col items-center mb-5 sm:mb-6">
          <div className="p-2.5 sm:p-3 rounded-2xl bg-indigo-600 text-white mb-2.5 sm:mb-3 shadow-md">
            <Sparkles className="h-5 sm:h-6 w-5 sm:w-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Aura<span className="text-indigo-600">HR</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 sm:mt-1 text-center">
            Enterprise Workforce & Attendance Portal
          </p>
        </div>

        {/* Card Component */}
        <Card className="bg-white border border-slate-200 card-shadow p-2 sm:p-3">
          {mfaToken ? (
            <>
              <CardHeader className="space-y-1 pb-3 sm:pb-4">
                <CardTitle className="text-base sm:text-lg text-slate-900 font-bold text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  Two-Factor Verification
                </CardTitle>
                <CardDescription className="text-center text-xs text-slate-500">
                  Enter the 6-digit code from your authenticator app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleMfaVerify} className="space-y-3.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="Authentication Code"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={isLoading}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    maxLength={6}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full flex justify-center font-semibold"
                      disabled={isLoading || mfaCode.length !== 6}
                    >
                      {isLoading ? (
                        <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                      ) : (
                        "Verify"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMfaToken(null);
                        setMfaCode("");
                        setPassword("");
                      }}
                      className="w-full text-slate-500"
                      disabled={isLoading}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          ) : !isForgot ? (
            <>
              <CardHeader className="space-y-1 pb-3 sm:pb-4">
                <CardTitle className="text-base sm:text-lg text-slate-900 font-bold text-center">Sign In to Your Account</CardTitle>
                <CardDescription className="text-center text-xs text-slate-500">
                  Enter your corporate credentials to access the portal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <Input
                    type="email"
                    label="Corporate Email Address"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    icon={<Mail className="h-4 w-4" />}
                  />

                  <Input
                    type="password"
                    label="Account Password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    icon={<Lock className="h-4 w-4" />}
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsForgot(true)}
                      className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                      disabled={isLoading}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full flex justify-center font-semibold"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-3 sm:pb-4">
                <CardTitle className="text-base sm:text-lg text-slate-900 font-bold text-center">Reset Password</CardTitle>
                <CardDescription className="text-center text-xs text-slate-500">
                  Enter your email address to receive reset instructions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleForgotPassword} className="space-y-3.5">
                  <Input
                    type="email"
                    label="Corporate Email"
                    placeholder="you@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    disabled={isLoading}
                    icon={<Mail className="h-4 w-4" />}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full flex justify-center font-semibold"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                      ) : (
                        "Send Instructions"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsForgot(false)}
                      className="w-full text-slate-500"
                      disabled={isLoading}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
