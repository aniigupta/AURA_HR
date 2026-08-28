"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, Badge, Skeleton, Tabs } from "@/components/ui/atoms";
import { toast } from "@/components/ui/toast";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";

interface DepartmentShort {
  id: number;
  name: string;
}

interface EmployeeShort {
  id: string;
  profile?: {
    id: number;
    first_name: string;
    last_name: string;
    employee_id: string;
  };
}

export interface ReportLogRow {
  date: string;
  employee_id: string;
  name: string;
  department: string;
  clock_in: string;
  clock_out: string;
  working_hours: number;
  hourly_rate?: number;
  earned_salary?: number;
  status: string;
}

export interface PayrollSummaryRow {
  employee_id: string;
  name: string;
  department: string;
  hourly_rate?: number;
  present_days: number;
  wfh_days: number;
  leave_days: number;
  total_hours: number;
  overtime_hours: number;
  total_salary?: number;
}

export default function ReportsAdminPage() {
  const [activeTab, setActiveTab] = useState<string>("logs");
  // Month-to-date by default: the preview table renders every row it receives,
  // and /reports/summary is a capped preview - the export buttons below remain
  // the uncapped path to a full data set.
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  // Fetch departments
  const { data: departments = [] } = useQuery<DepartmentShort[]>({
    queryKey: ["departments"],
    queryFn: () => apiFetch<DepartmentShort[]>("/employees/departments")
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<EmployeeShort[]>({
    queryKey: ["employeesShort"],
    queryFn: () => apiFetch<EmployeeShort[]>("/employees/")
  });

  // Fetch report logs preview
  const { data: previewData = [], isLoading } = useQuery<ReportLogRow[]>({
    queryKey: ["reportsPreview", startDate, endDate, departmentId, statusFilter, employeeId],
    queryFn: () => apiFetch<ReportLogRow[]>("/reports/summary", {
      params: {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        department_id: departmentId ? parseInt(departmentId) : undefined,
        status_filter: statusFilter || undefined,
        employee_id: employeeId || undefined,
      }
    }),
    enabled: activeTab === "logs"
  });

  // Fetch payroll summary data
  const { data: payrollData = [], isLoading: isPayrollLoading } = useQuery<PayrollSummaryRow[]>({
    queryKey: ["payrollReport", startDate, endDate],
    queryFn: () => apiFetch<PayrollSummaryRow[]>("/reports/payroll", {
      params: {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }
    }),
    enabled: activeTab === "payroll"
  });

  const handleDownload = async (format: "csv" | "excel" | "pdf") => {
    try {
      const blob = await apiFetch<Blob>(`/reports/export/${format}`, {
        params: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          department_id: departmentId ? parseInt(departmentId) : undefined,
          status_filter: statusFilter || undefined,
          employee_id: employeeId || undefined,
        }
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const ext = format === "excel" ? "xlsx" : format;
      a.download = `workforce_attendance_report_${new Date().toISOString().substring(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${format.toUpperCase()} report exported successfully!`);
    } catch {
      toast.error("Failed to generate and download report.");
    }
  };

  const handleDownloadPayroll = async () => {
    try {
      const blob = await apiFetch<Blob>("/reports/export/payroll", {
        params: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_timesheet_report_${startDate || 'start'}_to_${endDate || 'end'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Payroll Excel report exported successfully!");
    } catch {
      toast.error("Failed to generate and download payroll report.");
    }
  };

  const handleDownloadPayrollPdf = async () => {
    try {
      const blob = await apiFetch<Blob>("/reports/export/payroll/pdf", {
        params: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_salary_report_${startDate || 'start'}_to_${endDate || 'end'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Payroll PDF report exported successfully!");
    } catch {
      toast.error("Failed to generate and download payroll PDF report.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Present":
        return <Badge variant="success">Present</Badge>;
      case "Work From Home":
        return <Badge variant="primary" className="font-bold">WFH</Badge>;
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Reports & Analytics Export</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Generate workforce attendance logs, payroll calculations, and export reports in PDF, Excel, or CSV formats (INR ₹)
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: "logs", label: "Attendance Summary Log" },
          { id: "payroll", label: "Payroll & Compensation Timesheets" },
        ]}
      />

      {/* Filter Parameters */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          
          {activeTab === "logs" && (
            <>
              <Select
                label="Department"
                options={[
                  { label: "All Departments", value: "" },
                  ...departments.map((d: DepartmentShort) => ({ label: d.name, value: d.id }))
                ]}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
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

              <Select
                label="Filter Employee"
                options={[
                  { label: "All Employees", value: "" },
                  ...employees.map((e: EmployeeShort) => ({ 
                    label: `${e.profile?.first_name} ${e.profile?.last_name} (${e.profile?.employee_id})`, 
                    value: e.profile?.id || ""
                  }))
                ]}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
            </>
          )}
        </div>
      </Card>

      {activeTab === "logs" ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Export Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4">
            <Card className="bg-white border-slate-200 p-4 flex items-center gap-3.5 card-shadow-hover">
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0">
                <FileText className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-900">PDF Report</h3>
                <p className="text-[11px] text-slate-500">Corporate document format</p>
                <Button onClick={() => handleDownload("pdf")} variant="link" size="sm" className="mt-1 font-semibold text-xs p-0 text-indigo-600">
                  Download PDF File
                </Button>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 p-4 flex items-center gap-3.5 card-shadow-hover">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-900">Excel Workbook</h3>
                <p className="text-[11px] text-slate-500">Formatted xlsx spreadsheet</p>
                <Button onClick={() => handleDownload("excel")} variant="link" size="sm" className="mt-1 font-semibold text-xs p-0 text-indigo-600">
                  Download Excel File
                </Button>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 p-4 flex items-center gap-3.5 card-shadow-hover">
              <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                <FileDown className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-900">CSV Datasheet</h3>
                <p className="text-[11px] text-slate-500">Plain text data structure</p>
                <Button onClick={() => handleDownload("csv")} variant="link" size="sm" className="mt-1 font-semibold text-xs p-0 text-indigo-600">
                  Download CSV File
                </Button>
              </div>
            </Card>
          </div>

          {/* Preview Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>ID Code</TableHead>
                <TableHead>Employee Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Net Hours</TableHead>
                <TableHead>Hourly Rate</TableHead>
                <TableHead>Earned Salary</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={idx}>
                    {Array.from({ length: 10 }).map((_, cIdx) => (
                      <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : previewData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-400 font-medium">
                    No log records found for the selected filter parameters.
                  </TableCell>
                </TableRow>
              ) : (
                previewData.map((row: ReportLogRow, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-semibold text-slate-500">{row.date}</TableCell>
                    <TableCell className="font-semibold text-slate-400">{row.employee_id}</TableCell>
                    <TableCell className="font-semibold text-slate-900">{row.name}</TableCell>
                    <TableCell className="text-slate-600">{row.department}</TableCell>
                    <TableCell className="font-medium text-emerald-700">{row.clock_in}</TableCell>
                    <TableCell className="font-medium text-rose-600">{row.clock_out}</TableCell>
                    <TableCell className="font-bold text-slate-800">{row.working_hours} hrs</TableCell>
                    <TableCell className="text-slate-600">₹{row.hourly_rate ? row.hourly_rate.toFixed(2) : "0.00"}</TableCell>
                    <TableCell className="font-bold text-emerald-700">₹{row.earned_salary ? row.earned_salary.toFixed(2) : "0.00"}</TableCell>
                    <TableCell>{getStatusBadge(row.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Payroll Tab view */
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            <Card className="bg-white border-slate-200 p-4 flex items-center gap-3.5 card-shadow-hover">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-900">PAYROLL EXCEL TIMESHEET</h3>
                <p className="text-[11px] text-slate-500">Includes rates, overtime calculation, and net payout totals</p>
                <Button onClick={handleDownloadPayroll} size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  Download Excel Sheet
                </Button>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 p-4 flex items-center gap-3.5 card-shadow-hover">
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0">
                <FileText className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-900">PAYROLL PDF REPORT</h3>
                <p className="text-[11px] text-slate-500">Corporate landscape report for accounting audit</p>
                <Button onClick={handleDownloadPayrollPdf} size="sm" className="mt-2 bg-rose-600 hover:bg-rose-700 text-white">
                  Download PDF Report
                </Button>
              </div>
            </Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Rate/hr</TableHead>
                <TableHead className="text-center">Present</TableHead>
                <TableHead className="text-center">WFH</TableHead>
                <TableHead className="text-center">Leave</TableHead>
                <TableHead className="text-center">Total Hours</TableHead>
                <TableHead className="text-center">Overtime</TableHead>
                <TableHead className="text-right">Total Salary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPayrollLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={idx}>
                    {Array.from({ length: 10 }).map((_, cIdx) => (
                      <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : payrollData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-400 font-medium">
                    No payroll timesheets found for selected dates.
                  </TableCell>
                </TableRow>
              ) : (
                payrollData.map((row: PayrollSummaryRow, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-semibold text-slate-400">{row.employee_id}</TableCell>
                    <TableCell className="font-semibold text-slate-900">{row.name}</TableCell>
                    <TableCell className="text-slate-600">{row.department}</TableCell>
                    <TableCell className="text-center text-slate-700">₹{row.hourly_rate?.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-medium text-emerald-700">{row.present_days} d</TableCell>
                    <TableCell className="text-center font-medium text-indigo-600">{row.wfh_days} d</TableCell>
                    <TableCell className="text-center font-medium text-sky-600">{row.leave_days} d</TableCell>
                    <TableCell className="text-center font-bold text-slate-900">{row.total_hours} hrs</TableCell>
                    <TableCell className="text-center font-bold text-indigo-600">{row.overtime_hours} hrs</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">₹{row.total_salary?.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
