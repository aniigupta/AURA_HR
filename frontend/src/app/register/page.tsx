"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button, Input } from "@/components/ui/atoms";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { 
  Building2, Mail, Lock, User, Phone, MapPin, Sparkles, 
  CheckCircle2, ArrowRight, Shield, Globe, Compass, ChevronLeft
} from "lucide-react";

// The three tiers the backend accepts — Organization.plan is constrained to
// exactly these by the ^(Starter|Growth|Enterprise)$ pattern on OrganizationCreate.
// Declared `as const` so p.name stays a literal union and the selector needs no cast.
type PlanName = "Starter" | "Growth" | "Enterprise";

const PLAN_TIERS: ReadonlyArray<{
  name: PlanName;
  limit: string;
  price: string;
  badge: string;
}> = [
  { name: "Starter", limit: "Up to 25 staff", price: "₹1,499/mo", badge: "Trial" },
  { name: "Growth", limit: "Up to 75 staff", price: "₹3,999/mo", badge: "Popular" },
  { name: "Enterprise", limit: "Unlimited staff", price: "₹7,999/mo", badge: "Full Suite" },
] as const;

export default function RegisterCompanyPage() {
  const { registerCompany } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Form Fields
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [plan, setPlan] = useState<PlanName>("Starter");

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [designation, setDesignation] = useState("Founder / CEO");

  const [latitude, setLatitude] = useState<number>(28.6139);
  const [longitude, setLongitude] = useState<number>(77.2090);
  const [allowedRadius, setAllowedRadius] = useState<number>(150);

  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setCompanyName(name);
    // Auto-generate slug from name
    const generatedSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setCompanySlug(generatedSlug);
  };

  const handleAutoDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(parseFloat(position.coords.latitude.toFixed(6)));
        setLongitude(parseFloat(position.coords.longitude.toFixed(6)));
        setIsLocating(false);
        toast.success("Office coordinates auto-detected from current GPS location!");
      },
      (err) => {
        setIsLocating(false);
        toast.error(`Could not detect location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Please provide your company name");
      return;
    }
    if (!companySlug.trim()) {
      toast.error("Please provide a valid workspace slug");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      toast.error("Please fill in all administrator account fields");
      return;
    }
    if (adminPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      await registerCompany({
        company_name: companyName.trim(),
        company_slug: companySlug.trim().toLowerCase(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
        admin_phone: adminPhone.trim() || undefined,
        designation: designation.trim() || undefined,
        latitude,
        longitude,
        allowed_radius: allowedRadius,
        plan
      });
      toast.success("Welcome to AuraHR! Your enterprise tenant is live.");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to register company. Please try again.";
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-xl">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 rounded-2xl bg-indigo-600 text-white mb-3 shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-slate-900">
            Aura<span className="text-indigo-600 font-semibold">HR</span> Multi-Tenant Cloud
          </h1>
          <p className="text-sm text-slate-500 mt-1 text-center font-normal">
            Launch your dedicated company HRMS & Attendance workspace in 60 seconds
          </p>
        </div>

        {/* Multi-Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${step === 1 ? "bg-indigo-600 text-white shadow-sm" : "bg-emerald-100 text-emerald-700"}`}>
            {step > 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
            1. Company & Plan
          </div>
          <div className="w-6 h-0.5 bg-slate-200" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${step === 2 ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-500"}`}>
            <Shield className="h-3.5 w-3.5" />
            2. Admin & Geofence
          </div>
        </div>

        {/* Card Component */}
        <Card className="bg-white border border-slate-200 card-shadow p-4 sm:p-6">
          {step === 1 ? (
            <form onSubmit={handleNext} className="space-y-4">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-lg text-slate-900 font-medium">Step 1: Your Organization Details</CardTitle>
                <CardDescription className="text-xs text-slate-500 font-normal">
                  Enter your company branding and choose a subscription tier.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                <Input
                  type="text"
                  label="Registered Company / Organization Name"
                  placeholder="e.g. Acme Technologies India Pvt Ltd"
                  value={companyName}
                  onChange={handleCompanyNameChange}
                  required
                  icon={<Building2 className="h-4 w-4" />}
                />

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Dedicated Workspace URL
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 overflow-hidden bg-slate-50">
                    <span className="px-3 text-xs text-slate-400 font-normal">https://</span>
                    <input
                      type="text"
                      placeholder="acme-tech"
                      value={companySlug}
                      onChange={(e) => setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      className="flex-1 py-2 text-xs font-medium text-slate-800 bg-transparent focus:outline-none"
                      required
                    />
                    <span className="px-3 text-xs text-indigo-600 font-medium bg-indigo-50/50 py-2 border-l border-slate-200">
                      .aurahr.in
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-normal">Unique tenant identifier used for secure isolated database scoping.</p>
                </div>

                {/* Plan Selection */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">
                    Choose Subscription Tier (14-Day Free Trial)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {PLAN_TIERS.map((p) => (
                      <div
                        key={p.name}
                        onClick={() => setPlan(p.name)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          plan === p.name
                            ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-900">{p.name}</span>
                          <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                            {p.badge}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">{p.price}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{p.limit}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" size="lg" className="w-full flex items-center justify-center gap-2 font-medium">
                    Continue to Admin Setup <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900 font-medium">Step 2: Administrator & Geofencing</CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-normal">
                    Create the primary system owner account and configure office location.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-500 hover:text-slate-900 gap-1 font-normal"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
              </CardHeader>
              <CardContent className="p-0 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    type="text"
                    label="Administrator Full Name"
                    placeholder="Rajesh Sharma"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    icon={<User className="h-4 w-4" />}
                  />
                  <Input
                    type="text"
                    label="Designation / Title"
                    placeholder="Chief Operating Officer"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    icon={<Globe className="h-4 w-4" />}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    type="email"
                    label="Primary Admin Email"
                    placeholder="admin@company.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    icon={<Mail className="h-4 w-4" />}
                  />
                  <Input
                    type="tel"
                    label="Contact Phone (Optional)"
                    placeholder="+91 98765 43210"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    icon={<Phone className="h-4 w-4" />}
                  />
                </div>

                <Input
                  type="password"
                  label="Admin Account Password"
                  placeholder="Minimum 8 characters"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  icon={<Lock className="h-4 w-4" />}
                />

                {/* Office Geofencing Setup */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-indigo-600" />
                      <span className="text-xs font-medium text-slate-800">Primary Office Geofence (IST)</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAutoDetectLocation}
                      disabled={isLocating}
                      className="text-[11px] h-7 gap-1 font-medium text-indigo-600 bg-white"
                    >
                      <Compass className={`h-3 w-3 ${isLocating ? "animate-spin" : ""}`} />
                      {isLocating ? "Detecting GPS..." : "Auto-Detect My GPS"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs font-normal border border-slate-200 rounded-lg p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs font-normal border border-slate-200 rounded-lg p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500">Radius (Meters)</label>
                      <input
                        type="number"
                        value={allowedRadius}
                        onChange={(e) => setAllowedRadius(parseInt(e.target.value) || 100)}
                        className="w-full text-xs font-normal border border-slate-200 rounded-lg p-1.5 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full flex items-center justify-center font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                    ) : (
                      `Complete Registration & Launch ${companyName || "Workspace"}`
                    )}
                  </Button>
                </div>
              </CardContent>
            </form>
          )}

          {/* Footer Back Link */}
          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 font-normal">
              Already have an existing organization workspace?{" "}
              <Link href="/login" className="text-indigo-600 font-medium hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
