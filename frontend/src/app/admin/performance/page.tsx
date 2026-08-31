"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, Badge, Skeleton } from "@/components/ui/atoms";
import { Award, Star, TrendingUp, Target } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface PerformanceEmployee {
  id: string;
  email: string;
  profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
    designation?: string;
    department?: {
      name: string;
    };
  };
}

export default function PerformanceAdminPage() {
  const { data: employees = [], isLoading } = useQuery<PerformanceEmployee[]>({
    queryKey: ["employeesPerformance"],
    queryFn: () => apiFetch<PerformanceEmployee[]>("/employees/")
  });

  const totalEmployees = employees.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Performance & Appraisals</h1>
            <Badge variant="primary">Q3 Review Cycle</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate staff performance scores, track quarterly goals, and schedule appraisal meetings
          </p>
        </div>
        <Button size="sm" onClick={() => toast.success("New review cycle launched for your workforce!")} className="shrink-0 self-start sm:self-auto">
          <Target className="h-4 w-4 mr-1.5" />
          Initiate Review Cycle
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Score</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Star className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">
              {totalEmployees > 0 ? "4.8 / 5.0" : "— / 5.0"}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {totalEmployees > 0 ? "Overall workforce rating" : "No evaluations recorded"}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Evaluations Completed</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Award className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">
              {totalEmployees > 0 ? `0 / ${totalEmployees}` : "0 / 0"}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {totalEmployees > 0 ? `${totalEmployees} staff pending evaluation` : "No employees in directory"}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 p-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Workforce Target OKRs</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-xl sm:text-2xl font-bold text-slate-900">
              {totalEmployees > 0 ? "100%" : "—"}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {totalEmployees > 0 ? "Review cycle active" : "Add staff to assign goals"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Ratings Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee ID</TableHead>
            <TableHead>Employee Name</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Rating Score</TableHead>
            <TableHead>Evaluation Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 7 }).map((_, cIdx) => (
                  <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                No employee performance evaluations recorded yet. Add employees in the Workforce Directory to begin reviewing staff performance.
              </TableCell>
            </TableRow>
          ) : (
            employees.map((emp: PerformanceEmployee) => (
              <TableRow key={emp.id}>
                <TableCell className="font-semibold text-slate-400">{emp.profile?.employee_id || "EMP"}</TableCell>
                <TableCell className="font-semibold text-slate-900">
                  {emp.profile?.first_name} {emp.profile?.last_name}
                </TableCell>
                <TableCell className="text-slate-600">{emp.profile?.designation || "Staff"}</TableCell>
                <TableCell className="text-slate-600">{emp.profile?.department?.name || "General"}</TableCell>
                <TableCell className="font-bold text-amber-600">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> 4.8 / 5.0
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="success">Completed</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => toast.info(`Opening review card for ${emp.profile?.first_name}`)}>
                    View Appraisal
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
