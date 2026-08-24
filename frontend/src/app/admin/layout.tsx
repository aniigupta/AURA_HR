"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { 
  Users, CalendarDays, ClipboardCheck, Sparkles, 
  Settings, BarChart3, LogOut, Menu, X, Bell,
  Briefcase, Award, Building2, IndianRupee, CheckCircle2, AlertCircle
} from "lucide-react";
import { Button, SearchInput } from "@/components/ui/atoms";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: BarChart3 },
    { name: "Employees", href: "/admin/employees", icon: Users },
    { name: "Attendance Logs", href: "/admin/attendance", icon: ClipboardCheck },
    { name: "Leave Approvals", href: "/admin/leaves", icon: CalendarDays },
    { name: "Payroll & Salary", href: "/admin/payroll", icon: IndianRupee },
    { name: "Departments & Teams", href: "/admin/departments", icon: Building2 },
    { name: "Recruitment", href: "/admin/recruitment", icon: Briefcase },
    { name: "Performance", href: "/admin/performance", icon: Award },
    { name: "Reports & Analytics", href: "/admin/reports", icon: BarChart3 },
    { name: "Portal Settings", href: "/admin/settings", icon: Settings },
  ];

  const dummyNotifications = [
    { id: 1, title: "Leave Request", desc: "Priya Patel requested 2 days Casual leave", time: "10m ago", icon: CalendarDays, type: "info" },
    { id: 2, title: "Clock-in Alert", desc: "Staff clocked in outside geofence radius", time: "1h ago", icon: AlertCircle, type: "warning" },
    { id: 3, title: "Monthly Payroll", desc: "August salary draft ready for NEFT review", time: "3h ago", icon: CheckCircle2, type: "success" },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      
      {/* Mobile/Tablet sidebar backdrop overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header Brand & Tenant Info */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100 shrink-0">
            <Link href="/admin/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={() => setIsSidebarOpen(false)}>
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-tight text-slate-900 leading-tight truncate" title={user?.organization_name || "AuraHR"}>
                  {user?.organization_name || "AuraHR"}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-wider">
                    {user?.plan || "Enterprise"}
                  </span>
                </div>
              </div>
            </Link>
            
            {/* Mobile close toggle */}
            <button 
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-slate-400 hover:text-slate-600 shrink-0"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Main Menu
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer (Logout Session) */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="w-full flex justify-start gap-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold text-xs"
            >
              <LogOut className="h-4 w-4" />
              Sign Out Session
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Container Layout */}
      <div className="flex flex-col flex-1 lg:pl-64 min-h-screen w-full overflow-x-hidden">
        {/* Top Navbar Header */}
        <header className="flex items-center justify-between px-3.5 sm:px-6 h-16 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-30 card-shadow">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 max-w-md">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden cursor-pointer text-slate-600 shrink-0"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="w-full hidden sm:block">
              <SearchInput placeholder="Search employees, logs, requests..." className="w-full" />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Organization / Workspace Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/60 border border-indigo-100 text-indigo-700">
              <Building2 className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-xs font-semibold max-w-[140px] truncate" title={user?.organization_name || "AuraHR"}>
                {user?.organization_name || "AuraHR"}
              </span>
            </div>

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-2 ring-white" />
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl border border-slate-200 card-shadow z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <span className="text-xs font-semibold text-slate-900">Notifications</span>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">3 New</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {dummyNotifications.map((n) => {
                      const NIcon = n.icon;
                      return (
                        <div key={n.id} className="p-3 hover:bg-slate-50/80 transition-colors flex items-start gap-3 cursor-pointer">
                          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
                            <NIcon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800">{n.title}</span>
                              <span className="text-[10px] text-slate-400">{n.time}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{n.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-2 text-center border-t border-slate-100 bg-slate-50">
                    <button onClick={() => setShowNotifications(false)} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                      Mark all as read
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar Widget */}
            <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-200 pl-2 sm:pl-3">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {user?.profile?.first_name || "Rajesh"} {user?.profile?.last_name || "Sharma"}
                </span>
                <span className="text-[10px] text-slate-500 font-medium tracking-wide">
                  SYSTEM ADMIN
                </span>
              </div>
              <div className="h-8 w-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-200 card-shadow shrink-0">
                {user?.profile?.first_name?.charAt(0) || "R"}
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Main View Area */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
