"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, Badge, SearchInput, Select, Skeleton } from "@/components/ui/atoms";
import { Download, CheckCircle, FileText, Send, IndianRupee } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface PayrollEmployee {
  id: string;
  email: string;
  profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
    hourly_rate?: number;
    base_salary?: number;
    department?: {
      name: string;
    };
  };
}

export default function PayrollAdminPage() {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("2026-08");

  const { data: employees = [], isLoading } = useQuery<PayrollEmployee[]>({
    queryKey: ["employeesPayroll"],
    queryFn: () => apiFetch<PayrollEmployee[]>("/employees/")
  });

  const filteredEmployees = employees.filter((emp: PayrollEmployee) => {
    const name = `${emp.profile?.first_name} ${emp.profile?.last_name}`.toLowerCase();
    const code = (emp.profile?.employee_id || "").toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || code.includes(query);
  });

  const totalMonthlyPayout = employees.reduce((sum: number, emp: PayrollEmployee) => sum + (emp.profile?.base_salary || 95000), 0);

  const handleExportPayslip = (empName: string) => {
    toast.success(`Generated Payslip PDF for ${empName}`);
  };

  const handleProcessPayroll = () => {
    toast.success("August 2026 Salary batch processed via Bank Transfer / NEFT!");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Payroll & Compensation (INR ₹)</h1>
            <Badge variant="primary">August 2026</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Indian workforce salaries, hourly rates, PF/ESI deductions, and generate employee payslips
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success("Exporting Payroll CSV Summary...")}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={handleProcessPayroll}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Process Payout
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Payroll Outflow</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <IndianRupee className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">₹{totalMonthlyPayout.toLocaleString("en-IN")}</div>
            <span className="text-[11px] text-slate-400 font-medium">Monthly committed CTC expense</span>
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
            <div className="text-xl sm:text-2xl font-bold text-slate-900">{employees.length} Staff Members</div>
            <span className="text-[11px] text-slate-400 font-medium">Direct Bank Deposit (NEFT/RTGS)</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Hourly Rate</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">₹650.00 / hr</div>
            <span className="text-[11px] text-slate-400 font-medium">Base rate across tech & ops teams</span>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full">
            <SearchInput
              placeholder="Search by employee name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              options={[
                { label: "August 2026", value: "2026-08" },
                { label: "July 2026", value: "2026-07" },
                { label: "June 2026", value: "2026-06" },
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
            <TableHead>Hourly Rate</TableHead>
            <TableHead>Monthly Base CTC</TableHead>
            <TableHead>Est. Net Salary</TableHead>
            <TableHead>Payout Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 8 }).map((_, cIdx) => (
                  <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : filteredEmployees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-slate-400 font-medium">
                No payroll profiles found.
              </TableCell>
            </TableRow>
          ) : (
            filteredEmployees.map((emp: PayrollEmployee) => {
              const baseSalary = emp.profile?.base_salary || 95000;
              const hourlyRate = emp.profile?.hourly_rate || 650;
              const netPay = baseSalary;
              return (
                <TableRow key={emp.id}>
                  <TableCell className="font-semibold text-slate-400">{emp.profile?.employee_id}</TableCell>
                  <TableCell className="font-semibold text-slate-900">
                    {emp.profile?.first_name} {emp.profile?.last_name}
                  </TableCell>
                  <TableCell className="text-slate-600">{emp.profile?.department?.name || "Operations"}</TableCell>
                  <TableCell className="font-medium text-slate-700">₹{hourlyRate.toFixed(2)} / hr</TableCell>
                  <TableCell className="font-medium text-slate-700">₹{baseSalary.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="font-bold text-indigo-600">₹{netPay.toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge variant="success">Ready for NEFT</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExportPayslip(`${emp.profile?.first_name} ${emp.profile?.last_name}`)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Payslip PDF
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
