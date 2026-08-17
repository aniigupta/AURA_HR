"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, Badge, Skeleton, Input } from "@/components/ui/atoms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/context/AuthContext";
import { 
  Clock, LogIn, LogOut, Coffee, Play, CheckCircle2, 
  MapPin, CalendarDays, Hourglass, Percent, AlertCircle 
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

interface EmployeeDashboardData {
  today?: {
    status: string;
    clock_in?: string | null;
    clock_out?: string | null;
    is_on_break?: boolean;
  };
  stats?: {
    attendance_percentage?: number;
    avg_working_hours?: number;
    leave_balances?: {
      casual: number;
      sick: number;
      paid: number;
    };
  };
}

interface AttendanceLogItem {
  id: string;
  date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  break_duration: number;
  working_hours: number;
  status: string;
}

interface CorrectionItem {
  id: string;
  date: string;
  reason: string;
  status: string;
}

interface ClockInResponse {
  clock_in: string;
  status: string;
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState("");
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Webcam & Clock-in states
  const [showSelfieModal, setShowSelfieModal] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Correction Form states
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrDate, setCorrDate] = useState("");
  const [corrIn, setCorrIn] = useState("");
  const [corrOut, setCorrOut] = useState("");
  const [corrReason, setCorrReason] = useState("");

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-IN'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stop camera stream utility
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Start camera stream utility
  const startCamera = async () => {
    setCameraError(null);
    setCapturedSelfie(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: unknown) {
      console.error("Camera access failed", err);
      setCameraError("Camera permission blocked or unavailable. Please check device camera settings.");
    }
  };

  // Capture video frame to canvas
  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedSelfie(dataUrl);
        stopCamera();
      }
    }
  };

  // Queries
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery<EmployeeDashboardData>({
    queryKey: ["employeeDashboard"],
    queryFn: () => apiFetch<EmployeeDashboardData>("/dashboard/employee"),
  });

  const { data: logs = [], isLoading: isLogsLoading } = useQuery<AttendanceLogItem[]>({
    queryKey: ["employeeAttendanceLogs"],
    queryFn: () => apiFetch<AttendanceLogItem[]>("/attendance/history"),
  });

  const { data: corrections = [], isLoading: isCorrectionsLoading } = useQuery<CorrectionItem[]>({
    queryKey: ["employeeCorrections"],
    queryFn: () => apiFetch<CorrectionItem[]>("/attendance/corrections"),
  });

  // Mutations
  const clockInMutation = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<ClockInResponse>("/attendance/clock-in", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employeeDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["employeeAttendanceLogs"] });
      toast.success(`Clocked In successfully at ${new Date(data.clock_in).toLocaleTimeString('en-IN')}! Status: ${data.status}`);
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to clock in. Geofence violation or duplicate session.";
      toast.error(errorMsg);
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: () => apiFetch("/attendance/clock-out", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["employeeAttendanceLogs"] });
      toast.success("Clocked Out successfully. Have a great evening!");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to clock out.";
      toast.error(errorMsg);
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: () => apiFetch("/attendance/break/start", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeDashboard"] });
      toast.success("Break session started.");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to start break.";
      toast.error(errorMsg);
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: () => apiFetch("/attendance/break/end", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeDashboard"] });
      toast.success("Break session ended. Resuming work timer.");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to end break.";
      toast.error(errorMsg);
    },
  });

  const createCorrectionMutation = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch("/attendance/corrections", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeCorrections"] });
      toast.success("Correction request submitted successfully!");
      setShowCorrectionModal(false);
      setCorrDate("");
      setCorrIn("");
      setCorrOut("");
      setCorrReason("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to submit correction request.";
      toast.error(errorMsg);
    },
  });

  const handleClockIn = () => {
    setIsGpsLoading(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsGpsLoading(false);
          setPendingCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setShowSelfieModal(true);
          setTimeout(() => {
            startCamera();
          }, 200);
        },
        () => {
          setIsGpsLoading(false);
          toast.error("Browser GPS access is required to clock in. Please enable location permissions.");
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setIsGpsLoading(false);
      toast.error("Geolocation is not supported by this browser.");
    }
  };

  const handleFinalClockIn = () => {
    if (!pendingCoords || !capturedSelfie) {
      toast.error("Coordinates and selfie are required.");
      return;
    }

    clockInMutation.mutate(
      {
        latitude: pendingCoords.latitude,
        longitude: pendingCoords.longitude,
        gps_accuracy: pendingCoords.accuracy,
        selfie_base64: capturedSelfie,
        device_info: navigator.userAgent,
      },
      {
        onSuccess: () => {
          setShowSelfieModal(false);
          setCapturedSelfie(null);
          setPendingCoords(null);
        },
      }
    );
  };

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrDate || !corrReason) {
      toast.error("Please fill in the date and reason.");
      return;
    }

    const proposed_in = corrIn ? new Date(`${corrDate}T${corrIn}:00`).toISOString() : null;
    const proposed_out = corrOut ? new Date(`${corrDate}T${corrOut}:00`).toISOString() : null;

    createCorrectionMutation.mutate({
      date: corrDate,
      proposed_clock_in: proposed_in,
      proposed_clock_out: proposed_out,
      reason: corrReason,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Present":
        return <Badge variant="success">Present</Badge>;
      case "Work From Home":
        return <Badge variant="primary">Work From Home</Badge>;
      case "Late":
        return <Badge variant="warning">Late</Badge>;
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

  const todayStatus = dashboardData?.today?.status || "Absent";
  const clockedIn = !!dashboardData?.today?.clock_in;
  const clockedOut = !!dashboardData?.today?.clock_out;
  const isOnBreak = !!dashboardData?.today?.is_on_break;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Welcome back, {user?.profile?.first_name || "Employee"} 👋
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log shift attendance, manage breaks, check leave balances, and request corrections
          </p>
        </div>

        {/* Real-time Clock */}
        <div className="flex items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-indigo-50 border border-indigo-100 shrink-0 self-start sm:self-auto">
          <Clock className="h-4 w-4 text-indigo-600 animate-pulse" />
          <span className="text-sm sm:text-base font-bold text-indigo-900 font-mono">
            {currentTime || "00:00:00 AM"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* PUNCH CARD CONTROLLER */}
        <Card className="bg-white border-slate-200 relative card-shadow p-4 sm:p-5">
          <CardHeader className="p-0 pb-3 sm:pb-4 border-b border-slate-100">
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">SHIFT CONTROL CENTER</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-0 pt-4 sm:pt-5 text-center">
            {/* Status indicator */}
            <div className="mb-4 sm:mb-5 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Today&apos;s Status</span>
              {getStatusBadge(todayStatus)}

              {clockedIn && !clockedOut && !isOnBreak && (
                <span className="text-[10px] text-emerald-700 font-semibold mt-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping"></span>
                  SHIFT TIMER RUNNING
                </span>
              )}
              {isOnBreak && (
                <span className="text-[10px] text-amber-800 font-semibold mt-2 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  ON BREAK
                </span>
              )}
            </div>

            {/* Current punch stats */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xs border-y border-slate-100 py-3 sm:py-3.5 mb-4 sm:mb-5">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">PUNCH IN</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {dashboardData?.today?.clock_in
                    ? new Date(dashboardData.today.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "--:--"}
                </span>
              </div>
              <div className="border-l border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">PUNCH OUT</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {dashboardData?.today?.clock_out
                    ? new Date(dashboardData.today.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "--:--"}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5 w-full max-w-xs">
              {!clockedIn && (
                <Button
                  onClick={handleClockIn}
                  disabled={clockInMutation.isPending || isGpsLoading}
                  size="lg"
                  className="w-full flex gap-2 justify-center"
                >
                  <LogIn className="h-4 w-4" />
                  {isGpsLoading ? "Querying GPS..." : "PUNCH IN SHIFT"}
                </Button>
              )}

              {clockedIn && !clockedOut && (
                <>
                  {!isOnBreak ? (
                    <Button
                      onClick={() => startBreakMutation.mutate()}
                      disabled={startBreakMutation.isPending}
                      variant="outline"
                      className="w-full flex gap-2 justify-center text-amber-700 border-amber-200 hover:bg-amber-50"
                    >
                      <Coffee className="h-4 w-4" />
                      START BREAK TIME
                    </Button>
                  ) : (
                    <Button
                      onClick={() => endBreakMutation.mutate()}
                      disabled={endBreakMutation.isPending}
                      className="w-full flex gap-2 justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Play className="h-4 w-4" />
                      RESUME WORKING
                    </Button>
                  )}

                  <Button
                    onClick={() => {
                      if (confirm("Are you sure you want to clock out and end your shift today?")) {
                        clockOutMutation.mutate();
                      }
                    }}
                    disabled={clockOutMutation.isPending || isOnBreak}
                    variant="destructive"
                    className="w-full flex gap-2 justify-center"
                  >
                    <LogOut className="h-4 w-4" />
                    PUNCH OUT SHIFT
                  </Button>
                </>
              )}

              {clockedIn && clockedOut && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2 justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  Shift completed for today. Great job!
                </div>
              )}
            </div>

            {/* Geofence notice */}
            <div className="mt-3.5 flex items-center gap-1.5 justify-center text-[10px] sm:text-[11px] text-slate-500 font-medium">
              <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              Geofence GPS Verification Active
            </div>
          </CardContent>
        </Card>

        {/* STATS & METRICS */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="bg-white border-slate-200 p-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">Monthly Attendance</span>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Percent className="h-4 w-4" />
                </div>
                <span className="text-lg sm:text-xl font-bold text-slate-900">
                  {isDashboardLoading ? <Skeleton className="h-6 w-12" /> : `${dashboardData?.stats?.attendance_percentage || 0}%`}
                </span>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 p-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">Avg Working Hours</span>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
                  <Hourglass className="h-4 w-4" />
                </div>
                <span className="text-lg sm:text-xl font-bold text-slate-900">
                  {isDashboardLoading ? <Skeleton className="h-6 w-12" /> : `${dashboardData?.stats?.avg_working_hours || 0} hrs`}
                </span>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 p-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">WFH Privilege</span>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-800">
                  {user?.profile?.wfh_enabled ? "WFH Active" : "GPS Required"}
                </span>
              </div>
            </Card>
          </div>

          {/* Leave balance card */}
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center gap-2.5 p-0 pb-3 border-b border-slate-100">
              <CalendarDays className="h-4.5 w-4.5 text-indigo-600" />
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">MY LEAVE BALANCES</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
                <div className="p-2.5 sm:p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                  <span className="text-[10px] text-indigo-700 font-bold block mb-0.5 uppercase tracking-wider">Casual</span>
                  <span className="text-lg sm:text-xl font-bold text-indigo-900">
                    {isDashboardLoading ? <Skeleton className="h-7 w-8 mx-auto" /> : dashboardData?.stats?.leave_balances?.casual}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3 bg-rose-50/50 border border-rose-100 rounded-lg">
                  <span className="text-[10px] text-rose-700 font-bold block mb-0.5 uppercase tracking-wider">Sick</span>
                  <span className="text-lg sm:text-xl font-bold text-rose-900">
                    {isDashboardLoading ? <Skeleton className="h-7 w-8 mx-auto" /> : dashboardData?.stats?.leave_balances?.sick}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                  <span className="text-[10px] text-emerald-700 font-bold block mb-0.5 uppercase tracking-wider">Paid</span>
                  <span className="text-lg sm:text-xl font-bold text-emerald-900">
                    {isDashboardLoading ? <Skeleton className="h-7 w-8 mx-auto" /> : dashboardData?.stats?.leave_balances?.paid}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Correction requests history card */}
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center justify-between p-0 pb-3 border-b border-slate-100">
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Punch Correction Requests
              </CardTitle>
              <Button
                onClick={() => setShowCorrectionModal(true)}
                size="sm"
                variant="outline"
              >
                Request Correction
              </Button>
            </CardHeader>
            <CardContent className="p-0 pt-3">
              <div className="max-h-[160px] overflow-y-auto space-y-2 text-xs">
                {isCorrectionsLoading ? (
                  <div className="text-xs text-slate-400 italic text-center py-4">Loading requests...</div>
                ) : corrections.length === 0 ? (
                  <div className="text-xs text-slate-400 italic text-center py-6">
                    No correction requests submitted yet.
                  </div>
                ) : (
                  corrections.map((req: CorrectionItem) => (
                    <div key={req.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{req.date}</div>
                        <p className="text-slate-500 text-[11px] truncate max-w-xs">{req.reason}</p>
                      </div>
                      <div>
                        {req.status === "Pending" && <Badge variant="warning">Pending</Badge>}
                        {req.status === "Approved" && <Badge variant="success">Approved</Badge>}
                        {req.status === "Rejected" && <Badge variant="destructive">Rejected</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* RECENT ATTENDANCE HISTORY LIST */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Clock In</TableHead>
            <TableHead>Clock Out</TableHead>
            <TableHead>Total Breaks</TableHead>
            <TableHead>Net Hours</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLogsLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 6 }).map((_, cIdx) => (
                  <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6 text-slate-400 font-medium">
                No attendance history recorded yet.
              </TableCell>
            </TableRow>
          ) : (
            logs.slice(0, 5).map((log: AttendanceLogItem) => (
              <TableRow key={log.id}>
                <TableCell className="font-semibold text-slate-500">{log.date}</TableCell>
                <TableCell className="font-semibold text-emerald-700">
                  {log.clock_in ? new Date(log.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                </TableCell>
                <TableCell className="font-semibold text-rose-600">
                  {log.clock_out ? new Date(log.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                </TableCell>
                <TableCell className="text-slate-600">{log.break_duration.toFixed(2)} hrs</TableCell>
                <TableCell className="font-bold text-slate-900">{log.working_hours.toFixed(2)} hrs</TableCell>
                <TableCell>{getStatusBadge(log.status)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* SELFIE CAPTURE MODAL */}
      <Dialog isOpen={showSelfieModal} onClose={() => { stopCamera(); setShowSelfieModal(false); }} title="Clock-In Selfie Verification" size="md">
        <div className="space-y-3.5 sm:space-y-4">
          <p className="text-xs text-slate-500">A quick selfie verification photo is required to complete shift punch-in.</p>

          <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center max-w-full">
            {!capturedSelfie ? (
              <>
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-xs text-rose-300">
                    <AlertCircle className="h-6 w-6 mb-1" />
                    {cameraError}
                  </div>
                )}
              </>
            ) : (
              <Image src={capturedSelfie} alt="Captured selfie" fill unoptimized className="object-cover transform -scale-x-100" />
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-100">
            {!capturedSelfie ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => { stopCamera(); setShowSelfieModal(false); }}>Cancel</Button>
                <Button size="sm" onClick={capturePhoto} disabled={!!cameraError}>Capture Photo</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setCapturedSelfie(null); startCamera(); }}>Retake</Button>
                <Button size="sm" onClick={handleFinalClockIn} disabled={clockInMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {clockInMutation.isPending ? "Punching..." : "Confirm & Punch In"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>

      {/* CORRECTION REQUEST MODAL */}
      <Dialog isOpen={showCorrectionModal} onClose={() => setShowCorrectionModal(false)} title="Request Attendance Correction" size="md">
        <form onSubmit={handleCorrectionSubmit} className="space-y-3">
          <Input label="Target Date *" type="date" required value={corrDate} onChange={(e) => setCorrDate(e.target.value)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Proposed Clock-In" type="time" value={corrIn} onChange={(e) => setCorrIn(e.target.value)} />
            <Input label="Proposed Clock-Out" type="time" value={corrOut} onChange={(e) => setCorrOut(e.target.value)} />
          </div>
          <Input label="Reason for Correction *" placeholder="e.g. System glitch, off-site client visit..." value={corrReason} onChange={(e) => setCorrReason(e.target.value)} required />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCorrectionModal(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createCorrectionMutation.isPending}>
              {createCorrectionMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
