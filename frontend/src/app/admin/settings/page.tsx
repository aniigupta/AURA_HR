"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, Input, Skeleton, Badge } from "@/components/ui/atoms";
import { toast } from "@/components/ui/toast";
import { 
  MapPin, Clock, CalendarDays, Plus, Trash2, ShieldAlert, ShieldCheck, 
  BookOpen, Edit3, Sparkles, CheckCircle2, FileText, ChevronRight
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

export interface OfficeSettingsData {
  id?: number;
  latitude: number;
  longitude: number;
  allowed_radius: number;
  office_start_time: string;
  office_end_time: string;
  lunch_break_hours: number;
  required_working_hours: number;
  weekends: string;
}

export interface HolidayData {
  id: number;
  name: string;
  date: string;
  description?: string;
}

export interface CompanyPolicyData {
  id: string;
  title: string;
  category: string;
  content: string;
  is_published: boolean;
  updated_at?: string;
}

function OfficeSettingsForm({ initialData }: { initialData: OfficeSettingsData }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = useState(initialData.latitude.toString());
  const [lng, setLng] = useState(initialData.longitude.toString());
  const [radius, setRadius] = useState(initialData.allowed_radius.toString());
  const [startTime, setStartTime] = useState(initialData.office_start_time.substring(0, 5));
  const [endTime, setEndTime] = useState(initialData.office_end_time.substring(0, 5));
  const [lunchHrs, setLunchHrs] = useState(initialData.lunch_break_hours.toString());
  const [reqHrs, setReqHrs] = useState(initialData.required_working_hours.toString());
  const [weekendsStr, setWeekendsStr] = useState(initialData.weekends);

  const updateOfficeMutation = useMutation({
    mutationFn: (payload: unknown) => apiFetch("/settings/office", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["officeSettings"] });
      toast.success("Office configurations updated successfully.");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to update office settings.";
      toast.error(errorMsg);
    }
  });

  const handleOfficeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lat || !lng || !radius || !startTime || !endTime) {
      toast.error("Please provide all required parameters");
      return;
    }

    updateOfficeMutation.mutate({
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      allowed_radius: parseFloat(radius),
      office_start_time: startTime + ":00",
      office_end_time: endTime + ":00",
      lunch_break_hours: parseFloat(lunchHrs),
      required_working_hours: parseFloat(reqHrs),
      weekends: weekendsStr
    });
  };

  const fetchCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toString());
          setLng(pos.coords.longitude.toString());
          toast.success("Current GPS coordinates loaded!");
        },
        () => {
          toast.error("Failed to access Browser GPS. Please check permissions.");
        }
      );
    } else {
      toast.error("Geolocation is not supported by this browser.");
    }
  };

  return (
    <form onSubmit={handleOfficeSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
        <Input label="Office Latitude *" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} required />
        <Input label="Office Longitude *" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} required />
      </div>

      <div className="flex justify-start">
        <Button type="button" variant="outline" size="sm" onClick={fetchCurrentLocation} className="text-xs text-indigo-600 font-semibold bg-indigo-50 border-indigo-200">
          <MapPin className="h-3.5 w-3.5 mr-1" />
          Auto-Detect Current GPS Coordinates
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5">
        <Input label="Allowed Radius (Meters) *" type="number" min="10" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} required />
        <Input label="Office Shift Start *" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        <Input label="Office Shift End *" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5">
        <Input label="Lunch Break Duration (Hours) *" type="number" step="0.25" min="0" max="3" value={lunchHrs} onChange={(e) => setLunchHrs(e.target.value)} required />
        <Input label="Mandatory Working Hours *" type="number" step="0.5" min="1" max="16" value={reqHrs} onChange={(e) => setReqHrs(e.target.value)} required />
        <Input label="Designated Weekends *" value={weekendsStr} onChange={(e) => setWeekendsStr(e.target.value)} required placeholder="Saturday,Sunday" />
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <Button type="submit" size="sm" disabled={updateOfficeMutation.isPending}>
          {updateOfficeMutation.isPending ? "Saving..." : "Save Office Settings"}
        </Button>
      </div>
    </form>
  );
}

function MfaSecurityCard() {
  const { user, refreshUser } = useAuth();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  const setupMutation = useMutation({
    mutationFn: () => apiFetch<{ secret: string; qr_code_base64: string }>("/auth/mfa/setup", { method: "POST" }),
    onSuccess: (data) => {
      setSecret(data.secret);
      setQrCode(data.qr_code_base64);
      setIsSetupOpen(true);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to start 2FA setup";
      toast.error(msg);
    }
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => apiFetch<{ message: string }>("/auth/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
    onSuccess: async () => {
      toast.success("Two-Factor Authentication is now enabled.");
      setIsSetupOpen(false);
      setEnableCode("");
      setQrCode(null);
      setSecret(null);
      await refreshUser();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Invalid code. Please try again.";
      toast.error(msg);
    }
  });

  const disableMutation = useMutation({
    mutationFn: (password: string) => apiFetch<{ message: string }>("/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
    onSuccess: async () => {
      toast.success("Two-Factor Authentication has been disabled.");
      setIsDisableOpen(false);
      setDisablePassword("");
      await refreshUser();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to disable 2FA";
      toast.error(msg);
    }
  });

  const handleEnableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enableCode.length !== 6) {
      toast.error("Please enter the 6-digit code from your authenticator app");
      return;
    }
    enableMutation.mutate(enableCode);
  };

  const handleDisableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error("Password is required to disable 2FA");
      return;
    }
    disableMutation.mutate(disablePassword);
  };

  const mfaEnabled = !!user?.mfa_enabled;

  return (
    <Card className="bg-white border-slate-200 p-4 sm:p-5">
      <CardHeader className="flex flex-row items-center justify-between p-0 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${mfaEnabled ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            {mfaEnabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">TWO-FACTOR AUTHENTICATION (2FA)</CardTitle>
              <Badge variant={mfaEnabled ? "success" : "warning"} className="text-[10px]">
                {mfaEnabled ? "ENABLED" : "DISABLED"}
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Protect your Admin account with an authenticator app (Google Authenticator, Microsoft Authenticator)
            </p>
          </div>
        </div>
        <div>
          {mfaEnabled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDisableOpen(true)}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              Disable 2FA
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? "Generating..." : "Enable 2FA"}
            </Button>
          )}
        </div>
      </CardHeader>

      <Dialog isOpen={isSetupOpen} onClose={() => setIsSetupOpen(false)} title="Set Up Two-Factor Authentication" size="sm">
        <div className="space-y-3.5">
          <p className="text-xs text-slate-600">
            Scan this QR code with your authenticator app, then enter the 6-digit verification code below.
          </p>
          {qrCode && (
            <div className="flex justify-center p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
            </div>
          )}
          {secret && (
            <p className="text-[11px] text-slate-500 text-center break-all">
              Can&apos;t scan? Enter manually: <span className="font-mono font-semibold text-slate-700">{secret}</span>
            </p>
          )}
          <form onSubmit={handleEnableSubmit} className="space-y-3 pt-2 border-t border-slate-100">
            <Input
              label="6-Digit Code"
              inputMode="numeric"
              placeholder="123456"
              value={enableCode}
              onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsSetupOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={enableMutation.isPending || enableCode.length !== 6}>
                {enableMutation.isPending ? "Verifying..." : "Confirm & Enable"}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      <Dialog isOpen={isDisableOpen} onClose={() => setIsDisableOpen(false)} title="Disable Two-Factor Authentication" size="sm">
        <form onSubmit={handleDisableSubmit} className="space-y-3">
          <p className="text-xs text-slate-600">Enter your password to confirm disabling MFA on your account.</p>
          <Input
            label="Password"
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsDisableOpen(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" size="sm" disabled={disableMutation.isPending}>
              {disableMutation.isPending ? "Disabling..." : "Disable MFA"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

function CompanyPolicyCard() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompanyPolicyData | null>(null);
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  const { data: policies = [], isLoading } = useQuery<CompanyPolicyData[]>({
    queryKey: ["companyPolicies"],
    queryFn: () => apiFetch<CompanyPolicyData[]>("/assistant/policies"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingPolicy) {
        return apiFetch(`/assistant/policies/${editingPolicy.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      }
      return apiFetch("/assistant/policies", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companyPolicies"] });
      toast.success(editingPolicy ? "Policy updated successfully." : "New policy added to AI Knowledge Base.");
      handleCloseDialog();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save policy.";
      toast.error(msg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/assistant/policies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companyPolicies"] });
      toast.success("Policy removed from Knowledge Base.");
    }
  });

  const handleOpenCreate = () => {
    setEditingPolicy(null);
    setTitle("");
    setCategory("General");
    setContent("");
    setIsPublished(true);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (policy: CompanyPolicyData) => {
    setEditingPolicy(policy);
    setTitle(policy.title);
    setCategory(policy.category);
    setContent(policy.content);
    setIsPublished(policy.is_published);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPolicy(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Title and Content are required.");
      return;
    }
    saveMutation.mutate({
      title: title.trim(),
      category: category.trim(),
      content: content.trim(),
      is_published: isPublished
    });
  };

  return (
    <Card className="bg-white border-slate-200 p-4 sm:p-5">
      <CardHeader className="flex flex-row items-center justify-between p-0 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">COMPANY POLICIES & AI KNOWLEDGE BASE</CardTitle>
              <Badge variant="primary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                AI Powered
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Manage workplace handbooks and policy rules. AuraHR AI Assistant answers employee queries directly from these documents.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleOpenCreate} className="shrink-0 gap-1 font-semibold">
          <Plus className="h-3.5 w-3.5" />
          Add Policy
        </Button>
      </CardHeader>

      <div className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold">No custom policies configured yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;Add Policy&quot; above to create your first company guideline.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {policies.map((p) => (
              <div key={p.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {p.category}
                    </span>
                    <span className={`text-[10px] font-semibold ${p.is_published ? "text-emerald-600" : "text-amber-600"}`}>
                      {p.is_published ? "Active" : "Draft"}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-2">{p.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-3 leading-relaxed whitespace-pre-line">
                    {p.content}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-slate-200/60">
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(p)} className="h-7 text-xs text-slate-600 hover:text-slate-900 gap-1">
                    <Edit3 className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete policy: "${p.title}"?`)) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                    className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Policy Dialog */}
      <Dialog isOpen={isDialogOpen} onClose={handleCloseDialog} title={editingPolicy ? "Edit Company Policy" : "Add Policy to AI Knowledge Base"} size="md">
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Policy Title *"
            placeholder="e.g. Travel & Daily Food Expense Policy"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs font-medium border border-slate-200 rounded-lg p-2 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Leaves">Leaves & Time-Off</option>
              <option value="Attendance">Working Hours & Attendance</option>
              <option value="Code of Conduct">Code of Conduct & Ethics</option>
              <option value="Benefits">Reimbursements & Perks</option>
              <option value="General">General / Operations</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Policy Content / Rules (Markdown Supported) *
            </label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste policy handbook text, eligibility criteria, FAQs, or reimbursement caps..."
              className="w-full text-xs font-mono p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">AuraHR AI uses this text to answer employee questions.</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isPub"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isPub" className="text-xs font-medium text-slate-700 cursor-pointer">
              Publish to Employee AI Assistant immediately
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : (editingPolicy ? "Update Policy" : "Save to Knowledge Base")}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

export default function OfficeSettingsPage() {
  const queryClient = useQueryClient();
  
  // Holidays Add Dialog State
  const [isHolidayOpen, setIsHolidayOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDesc, setHolidayDesc] = useState("");

  // Fetch Office settings
  const { data: officeSettings, isLoading: isOfficeLoading } = useQuery<OfficeSettingsData>({
    queryKey: ["officeSettings"],
    queryFn: () => apiFetch<OfficeSettingsData>("/settings/office"),
  });

  // Fetch Holidays
  const { data: holidays = [], isLoading: isHolidaysLoading } = useQuery<HolidayData[]>({
    queryKey: ["holidays"],
    queryFn: () => apiFetch<HolidayData[]>("/settings/holidays"),
  });

  const addHolidayMutation = useMutation({
    mutationFn: (newHoliday: unknown) => apiFetch("/settings/holidays", {
      method: "POST",
      body: JSON.stringify(newHoliday)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday added to system calendar.");
      setIsHolidayOpen(false);
      setHolidayName("");
      setHolidayDate("");
      setHolidayDesc("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to register holiday.";
      toast.error(errorMsg);
    }
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/settings/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday removed successfully.");
    }
  });

  const handleHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName || !holidayDate) {
      toast.error("Holiday Name and Date are required.");
      return;
    }
    addHolidayMutation.mutate({
      name: holidayName,
      date: holidayDate,
      description: holidayDesc || undefined
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Portal & Geofence Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure office GPS coordinates, geofenced radius limits, company AI policies, shift rules, and public holidays (India - IST)
        </p>
      </div>

      {/* AI Policies Knowledge Base Card */}
      <CompanyPolicyCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Office & GPS Settings Form */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center gap-3 p-0 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">GEOFENCING & GPS LOCATION</CardTitle>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Determine office location boundary limits for attendance clock-ins</p>
              </div>
            </CardHeader>

            {isOfficeLoading || !officeSettings ? (
              <div className="space-y-3 pt-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <OfficeSettingsForm initialData={officeSettings} />
            )}
          </Card>
        </div>

        {/* Holidays List Card */}
        <div>
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center justify-between p-0 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">PUBLIC HOLIDAYS</CardTitle>
                  <p className="text-[10px] sm:text-[11px] text-slate-500">Dates bypassing GPS geofencing</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setIsHolidayOpen(true)} className="shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </CardHeader>
            <div className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Holiday Name</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isHolidaysLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ) : holidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-slate-400 font-medium">
                        No holidays registered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    holidays.map((h: HolidayData) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-semibold text-slate-500">{h.date}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{h.name}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Remove holiday: ${h.name}?`)) {
                                deleteHolidayMutation.mutate(h.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      <MfaSecurityCard />

      {/* ADD HOLIDAY DIALOG */}
      <Dialog isOpen={isHolidayOpen} onClose={() => setIsHolidayOpen(false)} title="Configure New Public Holiday" size="sm">
        <form onSubmit={handleHolidaySubmit} className="space-y-3">
          <Input label="Holiday Name *" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} required placeholder="e.g. Independence Day" />
          <Input label="Holiday Date *" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required />
          <Input label="Description" value={holidayDesc} onChange={(e) => setHolidayDesc(e.target.value)} placeholder="e.g. National holiday" />
          
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsHolidayOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addHolidayMutation.isPending}>
              {addHolidayMutation.isPending ? "Adding..." : "Register Holiday"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
