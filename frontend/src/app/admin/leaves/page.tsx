"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, Input, Select, Badge, Skeleton } from "@/components/ui/atoms";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Check, X, Eye } from "lucide-react";

export interface AdminLeaveRecord {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  comment?: string;
  created_at: string;
  user?: {
    id: string;
    email: string;
    profile?: {
      first_name: string;
      last_name: string;
      employee_id: string;
      leave_balance_casual: number;
      leave_balance_sick: number;
      leave_balance_paid: number;
    };
  };
}

export default function LeaveApprovalsAdminPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [selectedLeave, setSelectedLeave] = useState<AdminLeaveRecord | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  // Fetch leave requests (Admin)
  const { data: leaves = [], isLoading } = useQuery<AdminLeaveRecord[]>({
    queryKey: ["adminLeaves", statusFilter],
    queryFn: () => apiFetch<AdminLeaveRecord[]>("/leaves", {
      params: { status_filter: statusFilter || undefined }
    })
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, comment }: { id: string, status: string, comment: string }) => 
      apiFetch(`/leaves/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminLeaves"] });
      toast.success("Leave request reviewed successfully.");
      setIsReviewOpen(false);
      setReviewComment("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to submit review.";
      toast.error(errorMsg);
    }
  });

  const handleReviewClick = (leave: AdminLeaveRecord) => {
    setSelectedLeave(leave);
    setIsReviewOpen(true);
  };

  const handleSubmitReview = (status: "Approved" | "Rejected") => {
    if (!selectedLeave) return;
    reviewMutation.mutate({
      id: selectedLeave.id,
      status,
      comment: reviewComment
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return <Badge variant="warning">Pending Review</Badge>;
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Leave Approvals Desk</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review submitted leave applications, verify employee leave balances, and process approvals
          </p>
        </div>
        <div className="w-full sm:w-48 shrink-0">
          <Select
            options={[
              { label: "Pending Reviews", value: "Pending" },
              { label: "Approved History", value: "Approved" },
              { label: "Rejected History", value: "Rejected" },
              { label: "All Requests", value: "" }
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requested On</TableHead>
            <TableHead>Employee Name</TableHead>
            <TableHead>Leave Type</TableHead>
            <TableHead>Duration Interval</TableHead>
            <TableHead>Total Days</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
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
                No leave requests match your search criteria.
              </TableCell>
            </TableRow>
          ) : (
            leaves.map((leave: AdminLeaveRecord) => (
              <TableRow key={leave.id}>
                <TableCell className="font-semibold text-slate-400">
                  {new Date(leave.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="font-semibold text-slate-900">
                  {leave.user?.profile?.first_name} {leave.user?.profile?.last_name}
                </TableCell>
                <TableCell>
                  <Badge variant="primary">{leave.leave_type}</Badge>
                </TableCell>
                <TableCell className="text-slate-600 font-medium">
                  {leave.start_date} to {leave.end_date}
                </TableCell>
                <TableCell className="font-bold text-slate-800">
                  {calculateDays(leave.start_date, leave.end_date)} days
                </TableCell>
                <TableCell className="max-w-xs truncate text-slate-500 font-normal" title={leave.reason}>
                  {leave.reason}
                </TableCell>
                <TableCell>{getStatusBadge(leave.status)}</TableCell>
                <TableCell className="text-right">
                  {leave.status === "Pending" ? (
                    <Button
                      size="sm"
                      onClick={() => handleReviewClick(leave)}
                    >
                      Review
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSelectedLeave(leave); setIsReviewOpen(true); }}
                      title="View review details"
                    >
                      <Eye className="h-4 w-4 text-indigo-600" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* REVIEW LEAVE DIALOG */}
      <Dialog isOpen={isReviewOpen} onClose={() => setIsReviewOpen(false)} title="Review Leave Application" size="md">
        {selectedLeave && (
          <div className="space-y-3.5 sm:space-y-4">
            <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 sm:space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">EMPLOYEE</span>
                  <span className="font-bold text-slate-900">
                    {selectedLeave.user?.profile?.first_name} {selectedLeave.user?.profile?.last_name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">LEAVE TYPE</span>
                  <span className="font-semibold text-indigo-600">{selectedLeave.leave_type} Leave</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs border-t border-slate-200 pt-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">DATE INTERVAL</span>
                  <span className="text-slate-700 font-medium">
                    {selectedLeave.start_date} to {selectedLeave.end_date}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">TOTAL DAYS</span>
                  <span className="font-bold text-emerald-700">
                    {calculateDays(selectedLeave.start_date, selectedLeave.end_date)} Days
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">REASON</span>
                <p className="text-xs text-slate-700 italic">&ldquo;{selectedLeave.reason}&rdquo;</p>
              </div>

              {/* Employee leave balances check */}
              {selectedLeave.status === "Pending" && (
                <div className="border-t border-slate-200 pt-3">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase mb-2">Available Leave Balances:</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold">Casual</span>
                      <span className="text-xs font-bold text-slate-900">{selectedLeave.user?.profile?.leave_balance_casual}</span>
                    </div>
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold">Sick</span>
                      <span className="text-xs font-bold text-slate-900">{selectedLeave.user?.profile?.leave_balance_sick}</span>
                    </div>
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold">Paid</span>
                      <span className="text-xs font-bold text-slate-900">{selectedLeave.user?.profile?.leave_balance_paid}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedLeave.status !== "Pending" ? (
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Review Record</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Status:</span>
                  <span>{getStatusBadge(selectedLeave.status)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Approver Comment:</span>
                  <p className="p-2 bg-white border border-slate-200 rounded text-slate-700 italic">
                    {selectedLeave.comment || "No comment provided."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  label="Review Comment (Optional)"
                  placeholder="e.g. Approved. Cover arrangements confirmed..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />

                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsReviewOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleSubmitReview("Rejected")}
                    className="flex gap-1 items-center"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject Leave
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSubmitReview("Approved")}
                    className="flex gap-1 items-center bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve Leave
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
