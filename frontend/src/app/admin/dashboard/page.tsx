"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton, Badge, Button } from "@/components/ui/atoms";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { 
  Users, UserCheck, UserX, Clock, 
  Briefcase, CalendarX, Home, Hourglass,
  AlertCircle, ArrowRight, Play, CheckCircle,
  Cake, Building2, UserPlus, FileSpreadsheet
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, CartesianGrid, AreaChart, Area, Legend 
} from "recharts";

interface NeedsAttentionItem {
  id: string;
  employee_name: string;
  employee_id: string;
  issue: string;
  type: string;
  details: string;
  action: string;
}

interface ActiveWorker {
  employee_name: string;
  employee_id: string;
  in_time: string;
  duration: string;
}

interface AdminDashboardData {
  cards?: {
    total_employees?: number;
    present_today?: number;
    absent_today?: number;
    late_today?: number;
    working_today?: number;
    on_leave_today?: number;
    wfh_today?: number;
    avg_working_hours?: number;
    attendance_percentage?: number;
  };
  graphs?: {
    daily?: { date: string; day: string; present: number; late: number; wfh: number }[];
    monthly?: { month: string; present: number }[];
  };
  needs_attention?: NeedsAttentionItem[];
  currently_working?: ActiveWorker[];
}

function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function AdminDashboard() {
  const mounted = useMounted();
  const router = useRouter();

  const { data, isLoading, error } = useQuery<AdminDashboardData>({
    queryKey: ["adminDashboard"],
    queryFn: () => apiFetch<AdminDashboardData>("/dashboard/admin"),
  });

  if (error) {
    return (
      <div className="p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h3 className="font-semibold text-sm">Error Loading Dashboard Analytics</h3>
        <p className="text-xs text-rose-600 mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  const cardsInfo = [
    { name: "Total Employees", value: data?.cards?.total_employees, icon: Users, variant: "primary", subtitle: "Active headcount" },
    { name: "Present Today", value: data?.cards?.present_today, icon: UserCheck, variant: "success", subtitle: "Clocked in shifts" },
    { name: "Absent Today", value: data?.cards?.absent_today, icon: UserX, variant: "destructive", subtitle: "Unexcused absents" },
    { name: "Late Arrivals", value: data?.cards?.late_today, icon: Clock, variant: "warning", subtitle: "After shift start" },
    { name: "Currently Active", value: data?.cards?.working_today, icon: Briefcase, variant: "info", subtitle: "On active shift" },
    { name: "On Leave", value: data?.cards?.on_leave_today, icon: CalendarX, variant: "warning", subtitle: "Approved leaves" },
    { name: "Work From Home", value: data?.cards?.wfh_today, icon: Home, variant: "primary", subtitle: "Remote shift" },
    { name: "Avg Work Hours", value: `${data?.cards?.avg_working_hours || 0} hrs`, icon: Hourglass, variant: "neutral", subtitle: "Daily average" },
  ];

  const dummyBirthdays = [
    { name: "Sarah Jenkins", dept: "Engineering", date: "Aug 16 (In 2 days)", avatar: "S" },
    { name: "Michael Chen", dept: "Product Design", date: "Aug 19 (In 5 days)", avatar: "M" },
    { name: "David Miller", dept: "Operations", date: "Aug 22 (In 8 days)", avatar: "D" },
  ];

  const departmentStats = [
    { name: "Engineering & Tech", count: 14, percent: 40 },
    { name: "Operations & HR", count: 8, percent: 25 },
    { name: "Product & Design", count: 6, percent: 20 },
    { name: "Sales & Marketing", count: 5, percent: 15 },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Quick Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">HR Dashboard Overview</h1>
            <Badge variant="primary">Real-Time</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Summary for {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/reports")}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Export HR Report
          </Button>
          <Button variant="primary" size="sm" onClick={() => router.push("/admin/employees")}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, idx) => (
              <Card key={idx} className="bg-white border-slate-200 p-4">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </CardHeader>
                <CardContent className="p-0 pt-2">
                  <Skeleton className="h-7 w-16 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))
          : cardsInfo.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.name} className="bg-white border-slate-200 card-shadow-hover p-4">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 p-0 border-b-0">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {card.name}
                    </span>
                    <div className={`p-2 rounded-lg ${
                      card.variant === 'primary' ? 'bg-indigo-50 text-indigo-600' :
                      card.variant === 'success' ? 'bg-emerald-50 text-emerald-600' :
                      card.variant === 'warning' ? 'bg-amber-50 text-amber-600' :
                      card.variant === 'destructive' ? 'bg-rose-50 text-rose-600' :
                      card.variant === 'info' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 pt-2">
                    <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      {card.value !== undefined ? card.value : 0}
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
                      {card.subtitle}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ACTION CENTER & CURRENTLY WORKING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Action Center Table */}
        <Card className="lg:col-span-2 bg-white border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between p-4 sm:p-5 border-b border-slate-100">
            <div>
              <CardTitle className="flex items-center gap-2 text-rose-600 text-sm sm:text-base">
                <AlertCircle className="h-4 w-4" />
                Needs Attention / Pending Approvals
              </CardTitle>
              <CardDescription className="text-xs">Items requiring HR action or review</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin/leaves")} className="shrink-0">
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !data?.needs_attention || data.needs_attention.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-10 flex flex-col items-center justify-center gap-2">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
                <span className="font-semibold text-slate-700">All Clear!</span>
                <span>No pending issues or requests require your attention today.</span>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[500px] text-xs text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Details</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.needs_attention.map((item: NeedsAttentionItem) => (
                      <tr key={item.id + item.type} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                          <div>
                            {item.employee_name}
                            <span className="text-[10px] text-slate-400 block font-normal">{item.employee_id}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge variant={
                            item.type === 'late' ? 'warning' :
                            item.type === 'no_clock_out' ? 'destructive' :
                            item.type === 'leave_pending' ? 'primary' : 'info'
                          }>
                            {item.issue}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{item.details}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="soft"
                            size="sm"
                            onClick={() => {
                              if (item.type === 'leave_pending') {
                                router.push("/admin/leaves");
                              } else if (item.type === 'correction_pending' || item.type === 'no_clock_out' || item.type === 'late') {
                                router.push("/admin/attendance");
                              } else {
                                toast.success("Notification reminder sent.");
                              }
                            }}
                          >
                            {item.action}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Currently Working Active List */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between p-4 sm:p-5 border-b border-slate-100">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-600 text-sm sm:text-base">
                <Play className="h-3.5 w-3.5 fill-current" />
                Active Shift Sessions
              </CardTitle>
              <CardDescription className="text-xs">Clocked in right now</CardDescription>
            </div>
            <Badge variant="success">Live</Badge>
          </CardHeader>
          <CardContent className="p-4">
            <div className="max-h-[280px] overflow-y-auto space-y-2.5 pr-1 text-xs">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !data?.currently_working || data.currently_working.length === 0 ? (
                <div className="text-xs text-slate-400 italic text-center py-12">
                  No active clocked-in employees at the moment.
                </div>
              ) : (
                data.currently_working.map((worker: ActiveWorker) => (
                  <div key={worker.employee_id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{worker.employee_name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Punched in at {worker.in_time}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 text-xs">
                        {worker.duration}
                      </span>
                      <span className="text-[9px] text-slate-400 block">elapsed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Graphs Grid */}
      {mounted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Daily Attendance Graph */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Daily Attendance Trend (Last 7 Days)
              </CardTitle>
              <CardDescription className="text-xs">Breakdown of present, late, and remote shifts</CardDescription>
            </CardHeader>
            <CardContent className="h-64 sm:h-72 p-2 sm:p-4">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.graphs?.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} 
                      labelStyle={{ color: "#1e293b", fontWeight: "bold", fontSize: 12 }} 
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="present" name="Present" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="late" name="Late Arrivals" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="wfh" name="Work From Home" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Monthly Present Rate Graph */}
          <Card className="bg-white border-slate-200">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
              <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Monthly Workforce Turnout (Last 6 Months)
              </CardTitle>
              <CardDescription className="text-xs">Aggregate monthly employee turnout volume</CardDescription>
            </CardHeader>
            <CardContent className="h-64 sm:h-72 p-2 sm:p-4">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.graphs?.monthly}>
                    <defs>
                      <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} 
                      labelStyle={{ color: "#1e293b", fontWeight: "bold", fontSize: 12 }} 
                    />
                    <Area type="monotone" dataKey="present" name="Turnout Count" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorPresent)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Department Distribution & Upcoming Celebrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Department Stats */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Department Headcounts
            </CardTitle>
            <CardDescription className="text-xs">Distribution of staff across company teams</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-3">
            {departmentStats.map((dept) => (
              <div key={dept.name} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-800">{dept.name}</span>
                  <span className="text-slate-500">{dept.count} members ({dept.percent}%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${dept.percent}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Birthdays & Events */}
        <Card className="bg-white border-slate-200">
          <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Cake className="h-4 w-4 text-amber-600" />
              Upcoming Celebrations
            </CardTitle>
            <CardDescription className="text-xs">Birthdays & work anniversaries this week</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 divide-y divide-slate-100">
            {dummyBirthdays.map((b) => (
              <div key={b.name} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0 gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center border border-indigo-100 shrink-0">
                    {b.avatar}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">{b.name}</div>
                    <div className="text-[10px] text-slate-400">{b.dept}</div>
                  </div>
                </div>
                <Badge variant="warning">{b.date}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
