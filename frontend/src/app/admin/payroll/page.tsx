"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, Badge, SearchInput, Select, Skeleton } from "@/components/ui/atoms";
import { Download, CheckCircle, Send, IndianRupee, FileDown, Clock } from "lucide-react";
import { toast } from "@/components/ui/toast";

export interface PayrollReportItem {
  user_id: string;
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  hourly_rate: number;
  base_salary: number;
  present_days: number;
  wfh_days: number;
  leave_days: number;
  absent_days: number;
  half_days: number;
  late_days: number;
  total_hours: number;
  overtime_hours: number;
  working_salary: number;
  overtime_pay: number;
  total_salary: number;
  total_days_in_period: number;
}

export default function PayrollAdminPage() {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("2026-08");
  const [downloadingUserId, setDownloadingUserId] = useState<string | null>(null);

  // Compute start and end dates from month filter
  const [yearStr, monthStr] = monthFilter.split("-");
  const year = parseInt(yearStr || "2026", 10);
  const month = parseInt(monthStr || "08", 10);
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${monthFilter}-01`;
  const endDate = `${monthFilter}-${String(lastDay).padStart(2, "0")}`;

  const { data: payrollData = [], isLoading } = useQuery<PayrollReportItem[]>({
    queryKey: ["payrollReport", startDate, endDate],
    queryFn: () => apiFetch<PayrollReportItem[]>("/reports/payroll", {
      params: { start_date: startDate, end_date: endDate }
    })
  });

  const filteredData = payrollData.filter((emp: PayrollReportItem) => {
    const name = emp.name.toLowerCase();
    const code = emp.employee_id.toLowerCase();
    const dept = emp.department.toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || code.includes(query) || dept.includes(query);
  });

  const totalMonthlyPayout = payrollData.reduce((sum: number, emp: PayrollReportItem) => sum + (emp.total_salary || emp.base_salary || 0), 0);
  const totalHoursLogged = payrollData.reduce((sum: number, emp: PayrollReportItem) => sum + (emp.total_hours || 0), 0);
  const avgHourlyRate = payrollData.length > 0
    ? payrollData.reduce((sum: number, emp: PayrollReportItem) => sum + (emp.hourly_rate || 0), 0) / payrollData.length
    : 0;

  const handleExportPayslip = async (emp: PayrollReportItem) => {
    setDownloadingUserId(emp.user_id);
    try {
      const blob = await apiFetch<Blob>(`/reports/payslip/${emp.user_id}/pdf`, {
        params: { start_date: startDate, end_date: endDate }
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip_${emp.employee_id}_${monthFilter}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Downloaded Payslip PDF for ${emp.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate payslip PDF.";
      toast.error(msg);
    } finally {
      setDownloadingUserId(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const blob = await apiFetch<Blob>("/reports/export/payroll", {
        params: { start_date: startDate, end_date: endDate }
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_report_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Exported Payroll Excel summary!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export Excel report.";
      toast.error(msg);
    }
  };

  const handleExportPDF = async () => {
    try {
      const blob = await apiFetch<Blob>("/reports/export/payroll/pdf", {
        params: { start_date: startDate, end_date: endDate }
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_statement_${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Exported Payroll PDF Statement!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export PDF statement.";
      toast.error(msg);
    }
  };

  const handleProcessPayroll = () => {
    toast.success(`Processed ₹${totalMonthlyPayout.toLocaleString("en-IN")} payout batch via Bank Transfer / NEFT!`);
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Payroll & Compensation (INR ₹)</h1>
            <Badge variant="primary">{monthLabel}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time salary calculation driven by employee attendance, hours worked, overtime, and individual payslip generation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5 font-semibold text-xs text-slate-700">
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 font-semibold text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50">
            <FileDown className="h-3.5 w-3.5" />
            PDF Statement
          </Button>
          <Button variant="primary" size="sm" onClick={handleProcessPayroll} className="gap-1.5 font-semibold text-xs">
            <Send className="h-3.5 w-3.5" />
            Process Payout
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Net Payout</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <IndianRupee className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">₹{totalMonthlyPayout.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <span className="text-[11px] text-slate-400 font-medium">Calculated from verified attendance</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Salaried Staff</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">{payrollData.length} Staff Members</div>
            <span className="text-[11px] text-slate-400 font-medium">Direct Bank Deposit (NEFT/RTGS)</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Hours Logged</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">{totalHoursLogged.toFixed(1)} hrs</div>
            <span className="text-[11px] text-slate-400 font-medium">Avg rate: ₹{avgHourlyRate.toFixed(2)} / hr</span>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full">
            <SearchInput
              placeholder="Search by employee name, ID code, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              options={[
                { label: "August 2026", value: "2026-08" },
                { label: "July 2026", value: "2026-07" },
                { label: "June 2026", value: "2026-06" },
                { label: "May 2026", value: "2026-05" },
                { label: "April 2026", value: "2026-04" },
              ]}
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Payroll Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee ID</TableHead>
            <TableHead>Employee Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Attendance Summary</TableHead>
            <TableHead>Hours Logged</TableHead>
            <TableHead>Hourly Rate</TableHead>
            <TableHead>Earned Gross Pay</TableHead>
            <TableHead>Payout Status</TableHead>
            <TableHead className="text-right">Salary Slip</TableHead>
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
          ) : filteredData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-10 text-slate-400 font-medium">
                No payroll profiles or attendance records found for this period.
              </TableCell>
            </TableRow>
          ) : (
            filteredData.map((emp: PayrollReportItem) => {
              const grossPay = emp.total_salary || (emp.working_salary + emp.overtime_pay) || emp.base_salary;
              const isDownloading = downloadingUserId === emp.user_id;

              return (
                <TableRow key={emp.user_id}>
                  <TableCell className="font-semibold text-slate-400">{emp.employee_id}</TableCell>
                  <TableCell className="font-semibold text-slate-900">
                    {emp.name}
                    <span className="text-[10px] text-slate-400 block font-normal">{emp.designation}</span>
                  </TableCell>
                  <TableCell className="text-slate-600">{emp.department || "Operations"}</TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <span className="font-bold text-emerald-700">{emp.present_days} present</span>
                      {emp.wfh_days > 0 && <span className="text-indigo-600 text-[11px]"> ({emp.wfh_days} WFH)</span>}
                      {emp.leave_days > 0 && <span className="text-amber-700 text-[11px]"> • {emp.leave_days} leaves</span>}
                      {emp.absent_days > 0 && <span className="text-rose-600 text-[11px]"> • {emp.absent_days} absent</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-slate-800">
                    {emp.total_hours.toFixed(1)} hrs
                    {emp.overtime_hours > 0 && (
                      <span className="text-[10px] text-indigo-600 font-bold block">+{emp.overtime_hours.toFixed(1)}h OT</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-slate-700">₹{emp.hourly_rate.toFixed(2)} / hr</TableCell>
                  <TableCell className="font-bold text-indigo-600">
                    ₹{grossPay.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">Ready for NEFT</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isDownloading}
                      onClick={() => handleExportPayslip(emp)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isDownloading ? "Generating..." : "Payslip PDF"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
