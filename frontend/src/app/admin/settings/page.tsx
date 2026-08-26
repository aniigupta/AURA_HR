"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, Input, Skeleton, Badge } from "@/components/ui/atoms";
import { toast } from "@/components/ui/toast";
import { 
  MapPin, CalendarDays, Plus, Trash2, ShieldAlert, ShieldCheck, Camera,
  BookOpen, Edit3, Sparkles, CheckCircle2, FileText,
  UploadCloud, Loader2, AlertCircle
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
  require_selfie: boolean;
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

// What the create/update endpoints accept — CompanyPolicyData minus the
// server-owned fields. Mirrors CompanyPolicyCreate in backend/app/schemas.
export type CompanyPolicyPayload = Omit<CompanyPolicyData, "id" | "updated_at">;

export interface DocumentExtractResponse {
  title: string;
  suggested_category: string;
  content: string;
  filename: string;
  character_count: number;
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
  const [requireSelfie, setRequireSelfie] = useState(initialData.require_selfie);

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
      weekends: weekendsStr,
      require_selfie: requireSelfie
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

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            id="requireSelfie"
            checked={requireSelfie}
            onChange={(e) => setRequireSelfie(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="min-w-0">
            <label htmlFor="requireSelfie" className="text-xs font-medium text-slate-700 cursor-pointer flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-slate-400" />
              Require a selfie photo at clock-in
            </label>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              {requireSelfie
                ? "Employees must capture a photo to punch in. Photos are stored against the attendance record."
                : "Employees punch in with GPS location only — no photo is captured or stored. Existing photos are unaffected."}
            </p>
          </div>
        </div>
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompanyPolicyData | null>(null);
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  // Document upload & extraction state
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [extractedMeta, setExtractedMeta] = useState<{ filename: string; charCount: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: policies = [], isLoading } = useQuery<CompanyPolicyData[]>({
    queryKey: ["companyPolicies"],
    queryFn: () => apiFetch<CompanyPolicyData[]>("/assistant/policies"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: CompanyPolicyPayload) => {
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

  const handleDocumentExtract = async (file: File) => {
    const validExtensions = [".pdf", ".docx", ".txt", ".md", ".markdown"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (!validExtensions.includes(ext)) {
      const errorMsg = `Unsupported format "${ext}". Please upload a PDF (.pdf), Word (.docx), or Text (.txt, .md) file.`;
      setUploadError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = "Document exceeds maximum allowed size of 10 MB.";
      setUploadError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsExtractingDoc(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiFetch<DocumentExtractResponse>("/assistant/policies/extract-document", {
        method: "POST",
        body: formData
      });

      setTitle(res.title);
      setCategory(res.suggested_category);
      setContent(res.content);
      setExtractedMeta({
        filename: res.filename,
        charCount: res.character_count
      });
      toast.success(`Parsed "${res.filename}" (${res.character_count.toLocaleString()} characters extracted). Review below!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to extract text from document.";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setIsExtractingDoc(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleOpenCreate = () => {
    setEditingPolicy(null);
    setTitle("");
    setCategory("General");
    setContent("");
    setIsPublished(true);
    setExtractedMeta(null);
    setUploadError(null);
    setIsDialogOpen(true);
  };

  const handleOpenUpload = () => {
    handleOpenCreate();
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 150);
  };

  const handleOpenEdit = (policy: CompanyPolicyData) => {
    setEditingPolicy(policy);
    setTitle(policy.title);
    setCategory(policy.category);
    setContent(policy.content);
    setIsPublished(policy.is_published);
    setExtractedMeta(null);
    setUploadError(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPolicy(null);
    setExtractedMeta(null);
    setUploadError(null);
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
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-0 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">COMPANY POLICIES & AI KNOWLEDGE BASE</CardTitle>
              <Badge variant="primary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                RAG Knowledge Base
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Manage workplace handbooks, benefits, and guidelines. Upload PDF/DOCX files to augment the AI assistant.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleOpenUpload} className="gap-1.5 font-semibold text-indigo-600 border-indigo-200 hover:bg-indigo-50">
            <UploadCloud className="h-3.5 w-3.5" />
            Upload Document
          </Button>
          <Button size="sm" onClick={handleOpenCreate} className="gap-1 font-semibold">
            <Plus className="h-3.5 w-3.5" />
            Add Policy
          </Button>
        </div>
      </CardHeader>

      <div className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <BookOpen className="h-9 w-9 mx-auto mb-2.5 text-indigo-400 opacity-60" />
            <p className="text-xs font-bold text-slate-700">No policy documents in Knowledge Base yet.</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              Upload employee handbooks (.pdf, .docx) or create company guidelines to empower the AI Assistant.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={handleOpenUpload} className="gap-1.5 text-xs font-semibold text-indigo-600">
                <UploadCloud className="h-3.5 w-3.5" /> Upload File
              </Button>
              <Button size="sm" onClick={handleOpenCreate} className="gap-1.5 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" /> Create Policy
              </Button>
            </div>
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
                      {p.is_published ? "Active (AI Indexed)" : "Draft"}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {p.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-3 leading-relaxed whitespace-pre-line">
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

      {/* Add / Edit / Upload Policy Dialog */}
      <Dialog 
        isOpen={isDialogOpen} 
        onClose={handleCloseDialog} 
        title={editingPolicy ? "Edit Company Policy" : "Add Policy to AI Knowledge Base"} 
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Document Ingestion Drag-and-Drop Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                {editingPolicy ? "Re-upload / Replace Document (Optional)" : "Upload Handbook or Policy Document"}
              </label>
              <span className="text-[10px] text-slate-400">PDF, DOCX, TXT, MD (Max 10MB)</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleDocumentExtract(file);
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleDocumentExtract(file);
              }}
              onClick={() => !isExtractingDoc && fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer ${
                isDragging 
                  ? "border-indigo-500 bg-indigo-50/70" 
                  : isExtractingDoc
                  ? "border-slate-300 bg-slate-50 cursor-wait"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 bg-slate-50/50"
              }`}
            >
              {isExtractingDoc ? (
                <div className="flex items-center justify-center gap-2.5 py-2">
                  <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-800">Extracting document text & structure...</p>
                    <p className="text-[10px] text-slate-500">Parsing pages and identifying key policy categories</p>
                  </div>
                </div>
              ) : extractedMeta ? (
                <div className="flex items-center justify-between gap-3 text-left p-1">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 truncate max-w-[280px]">
                        {extractedMeta.filename}
                      </p>
                      <p className="text-[10px] text-emerald-700 font-medium">
                        Extracted {extractedMeta.charCount.toLocaleString()} characters. Ready to review below.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="h-7 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                  >
                    Change File
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-1.5">
                  <UploadCloud className="h-6 w-6 text-indigo-500 mb-1" />
                  <p className="text-xs font-semibold text-slate-700">
                    Drag and drop your file here, or <span className="text-indigo-600 underline">browse</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Auto-populates title, category, and markdown content
                  </p>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3.5">
            <Input
              label="Policy Title *"
              placeholder="e.g. Travel & Expense Reimbursement Policy"
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
                className="w-full text-xs font-mono p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800 leading-relaxed"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                AuraHR AI answers employee questions directly from this knowledge base content.
              </p>
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
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending || isExtractingDoc}>
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
