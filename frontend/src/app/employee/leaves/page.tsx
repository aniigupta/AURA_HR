"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, Badge, Skeleton } from "@/components/ui/atoms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Plus, Calendar } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

export interface LeaveRecord {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  comment?: string;
  created_at: string;
}

interface EmployeeDashboardData {
  stats?: {
    leave_balances?: {
      casual: number;
      sick: number;
      paid: number;
    };
  };
}

export default function EmployeeLeavesPage() {
  const queryClient = useQueryClient();
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("Casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // Queries
  const { data: leaves = [], isLoading: isLeavesLoading } = useQuery<LeaveRecord[]>({
    queryKey: ["employeeLeaves"],
    queryFn: () => apiFetch<LeaveRecord[]>("/leaves")
  });

  const { data: dashboardData } = useQuery<EmployeeDashboardData>({
    queryKey: ["employeeDashboard"],
    queryFn: () => apiFetch<EmployeeDashboardData>("/dashboard/employee"),
  });

  // Apply Leave Mutation
  const applyLeaveMutation = useMutation({
    mutationFn: (newLeave: { leave_type: string; start_date: string; end_date: string; reason: string }) => 
      apiFetch("/leaves", {
        method: "POST",
        body: JSON.stringify(newLeave)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeLeaves"] });
      queryClient.invalidateQueries({ queryKey: ["employeeDashboard"] });
      toast.success("Leave request submitted successfully. Awaiting manager approval.");
      setIsApplyOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to submit leave request.";
      toast.error(errorMsg);
    }
  });

  const resetForm = () => {
    setLeaveType("Casual");
    setStartDate("");
    setEndDate("");
    setReason("");
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) {
      toast.error("Please fill in all mandatory fields.");
      return;
    }
    applyLeaveMutation.mutate({
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return <Badge variant="warning">Awaiting Approval</Badge>;
      case "Approved":
        return <Badge variant="success">Approved</Badge>;
      case "Rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const calculateDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const balances = dashboardData?.stats?.leave_balances || { casual: 0, sick: 0, paid: 0 };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Leave Planner & Applications</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Apply for Casual, Sick or Paid leaves, inspect balance deductions, and track approval status
          </p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setIsApplyOpen(true); }} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-1.5" />
          Apply For Leave
        </Button>
      </div>

      {/* Leave Balances Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white border-slate-200 p-4">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">Casual Leave Balance</span>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-slate-900">{balances.casual} Days</span>
          </div>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">Sick Leave Balance</span>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-slate-900">{balances.sick} Days</span>
          </div>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">Paid Leave Balance</span>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-slate-900">{balances.paid} Days</span>
          </div>
        </Card>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requested On</TableHead>
            <TableHead>Leave Type</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Total Days</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approver Comment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLeavesLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 8 }).map((_, cIdx) => (
                  <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : leaves.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-slate-400 font-medium">
                No leave requests submitted yet.
              </TableCell>
            </TableRow>
          ) : (
            leaves.map((leave: LeaveRecord) => (
              <TableRow key={leave.id}>
                <TableCell className="font-semibold text-slate-400">
                  {new Date(leave.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant="primary">{leave.leave_type}</Badge>
                </TableCell>
                <TableCell className="font-semibold text-slate-800">{leave.start_date}</TableCell>
                <TableCell className="font-semibold text-slate-800">{leave.end_date}</TableCell>
                <TableCell className="font-bold text-slate-900">
                  {calculateDays(leave.start_date, leave.end_date)} days
                </TableCell>
                <TableCell className="max-w-xs truncate text-slate-600 font-normal" title={leave.reason}>
                  {leave.reason}
                </TableCell>
                <TableCell>{getStatusBadge(leave.status)}</TableCell>
                <TableCell className="max-w-xs truncate text-slate-400 italic" title={leave.comment}>
                  {leave.comment || "N/A"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* APPLY LEAVE DIALOG */}
      <Dialog isOpen={isApplyOpen} onClose={() => setIsApplyOpen(false)} title="Apply For Leave" size="md">
        <form onSubmit={handleApplySubmit} className="space-y-3">
          <Select
            label="Leave Type *"
            options={[
              { label: "Casual Leave", value: "Casual" },
              { label: "Sick Leave", value: "Sick" },
              { label: "Paid Leave", value: "Paid" },
              { label: "Unpaid Leave", value: "Unpaid" },
              { label: "Emergency Leave", value: "Emergency" }
            ]}
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start Date *"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date *"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <Input
            label="Reason for Leave *"
            placeholder="e.g. Family function, personal obligation..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsApplyOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={applyLeaveMutation.isPending}>
              {applyLeaveMutation.isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
