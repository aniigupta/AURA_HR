"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getBackendUrl } from "@/utils/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, Badge, Skeleton, Tabs, SearchInput } from "@/components/ui/atoms";
import { 
  Clock, MapPin, Eye, UserX, Check, X, AlertTriangle, 
  UploadCloud, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle 
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

export interface AttendanceImportResponse {
  total_rows: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  errors: string[];
}

export interface AttendanceRecordItem {
  id: string;
  user_id: string;
  date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  working_hours: number;
  break_duration: number;
  late_minutes: number;
  status: string;
  is_wfh: boolean;
  is_suspicious: boolean;
  modified_by_admin: boolean;
  latitude?: number | null;
  longitude?: number | null;
  selfie_url?: string | null;
  employee?: AttendanceUserItem;
}

export interface AttendanceCorrectionItem {
  id: string;
  user_id: string;
  date: string;
  proposed_clock_in?: string | null;
  proposed_clock_out?: string | null;
  reason: string;
  status: string;
  created_at: string;
}

export interface AttendanceUserItem {
  id: string;
  email: string;
  profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
  };
}

export default function AttendanceAdminPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<string>("logs");
  const [search, setSearch] = useState("");
  // Default to the current month rather than an open-ended range. The date
  // inputs show this range, so the table's contents always match a window the
  // admin can see and change - an unfiltered request used to pull every
  // attendance row the organization had ever recorded.
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecordItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Bulk Attendance Import State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<AttendanceImportResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch all attendance logs (Admin)
  const { data: records = [], isLoading } = useQuery<AttendanceRecordItem[]>({
    queryKey: ["adminAttendanceLogs", startDate, endDate, statusFilter],
    queryFn: () => apiFetch<AttendanceRecordItem[]>("/attendance/history", {
      params: {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        status_filter: statusFilter || undefined,
      }
    })
  });

  // Fetch all correction requests (Admin)
  const { data: corrections = [], isLoading: isCorrectionsLoading } = useQuery<AttendanceCorrectionItem[]>({
    queryKey: ["adminCorrections"],
    queryFn: () => apiFetch<AttendanceCorrectionItem[]>("/attendance/corrections")
  });

  const { data: employees = [] } = useQuery<AttendanceUserItem[]>({
    queryKey: ["employeesShort"],
    queryFn: () => apiFetch<AttendanceUserItem[]>("/employees/")
  });

  // Review Correction request mutation
  const reviewCorrectionMutation = useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      apiFetch(`/attendance/corrections/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminCorrections"] });
      queryClient.invalidateQueries({ queryKey: ["adminAttendanceLogs"] });
      queryClient.invalidateQueries({ queryKey: ["adminDashboard"] });
      toast.success("Correction request reviewed successfully!");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to review correction request.";
      toast.error(errorMsg);
    }
  });

  const handleFileUpload = async (file: File) => {
    const validExtensions = [".xlsx", ".xls", ".csv", ".pdf", ".txt"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(ext)) {
      const errorMsg = `Unsupported format "${ext}". Please upload an Excel (.xlsx), CSV (.csv), or PDF file.`;
      setUploadError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = "File exceeds maximum size of 10 MB.";
      setUploadError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsImporting(true);
    setUploadError(null);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiFetch<AttendanceImportResponse>("/attendance/import", {
        method: "POST",
        body: formData,
      });

      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ["adminAttendanceLogs"] });
      queryClient.invalidateQueries({ queryKey: ["adminDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["payrollReport"] });

      if (res.imported_count > 0 || res.updated_count > 0) {
        toast.success(`Import complete! ${res.imported_count} imported, ${res.updated_count} updated.`);
      } else {
        toast.error("No records could be imported. Check the errors list.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import attendance file.";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiFetch<Blob>("/attendance/template");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attendance_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Downloaded Excel import template!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download template.";
      toast.error(msg);
    }
  };

  const filteredRecords = records.filter((rec: AttendanceRecordItem) => {
    const emp = employees.find((e: AttendanceUserItem) => e.id === rec.user_id);
    if (!emp) return true;
    const name = `${emp.profile?.first_name} ${emp.profile?.last_name}`.toLowerCase();
    const code = (emp.profile?.employee_id || "").toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || code.includes(query);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Present":
        return <Badge variant="success">Present</Badge>;
      case "Work From Home":
        return <Badge variant="primary">Work From Home</Badge>;
      case "Late":
        return <Badge variant="warning">Late Arrival</Badge>;
      case "Half Day":
        return <Badge variant="warning">Half Day</Badge>;
      case "Leave":
        return <Badge variant="info">Leave</Badge>;
      case "Absent":
        return <Badge variant="destructive">Absent</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const handleViewDetails = (rec: AttendanceRecordItem) => {
    const emp = employees.find((e: AttendanceUserItem) => e.id === rec.user_id);
    setSelectedRecord({ ...rec, employee: emp });
    setIsDetailOpen(true);
  };

  const handleApproveCorrection = (id: string) => {
    if (confirm("Are you sure you want to APPROVE this attendance correction request?")) {
      reviewCorrectionMutation.mutate({ id, status: "Approved" });
    }
  };

  const handleRejectCorrection = (id: string) => {
    const comment = prompt("Provide an optional comment for rejection:");
    if (comment !== null) {
      reviewCorrectionMutation.mutate({ id, status: "Rejected", comment: comment || "Rejected by admin." });
    }
  };

  const pendingCorrectionCount = corrections.filter((c: AttendanceCorrectionItem) => c.status === "Pending").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Attendance Audit & Logs</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review employee shift punches, import attendance from Excel/CSV/PDF, and audit GPS geofencing parameters
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => {
              setImportResult(null);
              setUploadError(null);
              setIsImportOpen(true);
            }}
            className="gap-1.5 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <UploadCloud className="h-4 w-4" />
            Import Attendance
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: "logs", label: "Attendance Logs History", count: filteredRecords.length },
          { id: "corrections", label: "Correction Requests", count: pendingCorrectionCount },
        ]}
      />

      {activeTab === "logs" ? (
        <>
          {/* Filters Card */}
          <Card className="bg-white border-slate-200 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <SearchInput
                label="Search Employee"
                placeholder="Search name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />

              <Input
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />

              <Select
                label="Attendance Status"
                options={[
                  { label: "All Statuses", value: "" },
                  { label: "Present", value: "Present" },
                  { label: "Work From Home", value: "Work From Home" },
                  { label: "Late", value: "Late" },
                  { label: "Half Day", value: "Half Day" },
                  { label: "Absent", value: "Absent" },
                  { label: "Leave", value: "Leave" }
                ]}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
            </div>
          </Card>

          {/* Logs Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>ID Code</TableHead>
                <TableHead>Employee Name</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Net Working Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Audit Flags</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={idx}>
                    {Array.from({ length: 9 }).map((_, cIdx) => (
                      <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-slate-400 font-medium">
                    No attendance records match your search filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((rec: AttendanceRecordItem) => {
                  const emp = employees.find((e: AttendanceUserItem) => e.id === rec.user_id);
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-semibold text-slate-500">{rec.date}</TableCell>
                      <TableCell className="font-semibold text-slate-400">{emp?.profile?.employee_id || "N/A"}</TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {emp ? `${emp.profile?.first_name} ${emp.profile?.last_name}` : "N/A"}
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-700">
                        {rec.clock_in ? new Date(rec.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
                      </TableCell>
                      <TableCell className="font-semibold text-rose-600">
                        {rec.clock_out ? new Date(rec.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
                      </TableCell>
                      <TableCell className="font-bold text-slate-800">{rec.working_hours.toFixed(2)} hrs</TableCell>
                      <TableCell>
                        {getStatusBadge(rec.status)}
                        {rec.modified_by_admin && (
                          <span className="text-[10px] text-amber-700 font-bold block mt-0.5">
                            ✍️ Corrected
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {rec.is_wfh ? (
                            <Badge variant="primary">WFH Bypass</Badge>
                          ) : (
                            <Badge variant="neutral">GPS Verified</Badge>
                          )}
                          {rec.is_suspicious && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="h-3 w-3 text-amber-600" /> High Margin
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDetails(rec)}
                          title="View session details & photo"
                        >
                          <Eye className="h-4 w-4 text-indigo-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        /* Correction requests panel */
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Target Date</TableHead>
              <TableHead>Proposed Punch-In</TableHead>
              <TableHead>Proposed Punch-Out</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action Desk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isCorrectionsLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <TableRow key={idx}>
                  {Array.from({ length: 8 }).map((_, cIdx) => (
                    <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : corrections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-400 font-medium">
                  No attendance correction requests submitted.
                </TableCell>
              </TableRow>
            ) : (
              corrections.map((corr: AttendanceCorrectionItem) => {
                const emp = employees.find((e: AttendanceUserItem) => e.id === corr.user_id);
                return (
                  <TableRow key={corr.id}>
                    <TableCell className="text-slate-500">
                      {new Date(corr.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {emp ? `${emp.profile?.first_name} ${emp.profile?.last_name}` : "N/A"}
                      <span className="text-[10px] text-slate-400 block font-normal">{emp?.profile?.employee_id}</span>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-800">{corr.date}</TableCell>
                    <TableCell className="font-medium text-emerald-700">
                      {corr.proposed_clock_in ? new Date(corr.proposed_clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
                    </TableCell>
                    <TableCell className="font-medium text-rose-600">
                      {corr.proposed_clock_out ? new Date(corr.proposed_clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-slate-600 font-medium" title={corr.reason}>
                      {corr.reason}
                    </TableCell>
                    <TableCell>
                      {corr.status === "Pending" && <Badge variant="warning">Pending Review</Badge>}
                      {corr.status === "Approved" && <Badge variant="success">Approved</Badge>}
                      {corr.status === "Rejected" && <Badge variant="destructive">Rejected</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {corr.status === "Pending" ? (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleApproveCorrection(corr.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-7 w-7 p-0 rounded-lg"
                            title="Approve request"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectCorrection(corr.id)}
                            className="h-7 w-7 p-0 rounded-lg"
                            title="Reject request"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Processed</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {/* DETAIL DIALOG */}
      <Dialog isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Attendance Session Audit" size="md">
        {selectedRecord && (
          <div className="space-y-3.5 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-3.5 border-b border-slate-100">
              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Employee</span>
                  <p className="font-bold text-slate-900">
                    {selectedRecord.employee?.profile?.first_name} {selectedRecord.employee?.profile?.last_name}
                  </p>
                  <p className="text-xs text-slate-500">ID Code: {selectedRecord.employee?.profile?.employee_id}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Session Date</span>
                  <p className="font-semibold text-slate-800">{selectedRecord.date}</p>
                </div>
                
                {selectedRecord.latitude && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">GPS Verification</span>
                    <p className="text-xs text-slate-700 font-mono mt-0.5">
                      {selectedRecord.latitude.toFixed(5)}, {selectedRecord.longitude?.toFixed(5)}
                    </p>
                    <a 
                      href={`https://www.google.com/maps?q=${selectedRecord.latitude},${selectedRecord.longitude}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-indigo-600 hover:underline flex items-center gap-1 mt-1 text-[11px] font-semibold"
                    >
                      <MapPin className="h-3 w-3" /> View in Google Maps
                    </a>
                  </div>
                )}
              </div>

              {/* Selfie Frame */}
              <div className="flex flex-col items-center justify-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Clock-In Photo</span>
                {selectedRecord.selfie_url ? (
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-200 bg-white">
                    <Image 
                      src={`${getBackendUrl()}${selectedRecord.selfie_url}`} 
                      alt="Clock in selfie" 
                      fill
                      unoptimized
                      className="object-cover transform -scale-x-100" 
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    <UserX className="h-8 w-8 mb-1 text-slate-300" />
                    <span className="text-[11px] text-slate-400">No photo captured.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="flex gap-2 items-center">
                <Clock className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Clock In</span>
                  <p className="text-xs font-bold text-slate-900">
                    {selectedRecord.clock_in ? new Date(selectedRecord.clock_in).toLocaleTimeString() : "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <Clock className="h-4 w-4 text-rose-600 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Clock Out</span>
                  <p className="text-xs font-bold text-slate-900">
                    {selectedRecord.clock_out ? new Date(selectedRecord.clock_out).toLocaleTimeString() : "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">NET HOURS</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">{selectedRecord.working_hours.toFixed(2)}</span>
              </div>
              <div className="border-x border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block">BREAK TIME</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">{selectedRecord.break_duration.toFixed(2)} hrs</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">LATE MARGIN</span>
                <span className="text-xs sm:text-sm font-bold text-amber-700">{selectedRecord.late_minutes} min</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button size="sm" onClick={() => setIsDetailOpen(false)}>Close Audit</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* IMPORT ATTENDANCE DIALOG */}
      <Dialog 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        title="Bulk Import Employee Attendance" 
        size="md"
      >
        <div className="space-y-4">
          {/* Template Info Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl">
            <div className="flex items-start gap-2.5">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-indigo-950">Need the standard import format?</p>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  Download our pre-styled template with example rows for employee IDs, shift times, and statuses.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadTemplate}
              className="shrink-0 gap-1.5 font-semibold text-xs text-indigo-700 bg-white border-indigo-200 hover:bg-indigo-100/50"
            >
              <Download className="h-3.5 w-3.5" />
              Template (.xlsx)
            </Button>
          </div>

          {/* Drag & Drop Dropzone */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Upload Attendance Spreadsheet or Document
              </label>
              <span className="text-[10px] text-slate-400">Excel (.xlsx), CSV (.csv), PDF (Max 10MB)</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
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
                if (file) handleFileUpload(file);
              }}
              onClick={() => !isImporting && fileInputRef.current?.click()}
              className={`p-6 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer ${
                isDragging 
                  ? "border-indigo-500 bg-indigo-50/70" 
                  : isImporting
                  ? "border-slate-300 bg-slate-50 cursor-wait"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 bg-slate-50/50"
              }`}
            >
              {isImporting ? (
                <div className="flex flex-col items-center justify-center py-2">
                  <Loader2 className="h-7 w-7 text-indigo-600 animate-spin mb-2" />
                  <p className="text-xs font-bold text-slate-800">Processing and Importing Attendance...</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Matching employee IDs and recording daily shift hours</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <UploadCloud className="h-8 w-8 text-indigo-500 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-800">
                    Drag and drop your attendance file here, or <span className="text-indigo-600 underline">browse</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Auto-matches employee codes/emails and syncs with payroll
                  </p>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mt-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Import Results Summary Card */}
          {importResult && (
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">Import Completed Successfully</h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-800 mt-1">
                    <span><b>{importResult.imported_count}</b> new records added</span>
                    <span>•</span>
                    <span><b>{importResult.updated_count}</b> existing records updated</span>
                    {importResult.skipped_count > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-700 font-semibold">{importResult.skipped_count} skipped</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-amber-900 block">Notes & Skipped Rows:</span>
                  <ul className="text-[10px] text-amber-800 space-y-0.5 list-disc list-inside max-h-28 overflow-y-auto">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              size="sm"
              variant={importResult ? "primary" : "ghost"}
              onClick={() => {
                setIsImportOpen(false);
                setImportResult(null);
              }}
            >
              {importResult ? "Done & View Logs" : "Cancel"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
