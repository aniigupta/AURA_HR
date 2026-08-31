"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { 
  CalendarDays, ClipboardCheck, Sparkles, 
  UserCircle, LogOut, Menu, X, Bell
} from "lucide-react";
import { Button } from "@/components/ui/atoms";
import { getBackendUrl } from "@/utils/api";
import HRAssistantChatbot from "@/components/HRAssistantChatbot";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { name: "My Dashboard", href: "/employee/dashboard", icon: ClipboardCheck },
    { name: "Apply & View Leaves", href: "/employee/leaves", icon: CalendarDays },
    { name: "My Account Profile", href: "/employee/profile", icon: UserCircle },
  ];

  const empFirstName = user?.profile?.first_name || (user as any)?.first_name || user?.email?.split("@")[0] || "Employee";
  const empLastName = user?.profile?.last_name || (user as any)?.last_name || "";
  const empDisplayName = `${empFirstName} ${empLastName}`.trim();
  const empInitial = (empFirstName.charAt(0) || "E").toUpperCase();
  const empDesignation = user?.profile?.designation || "Staff Member";

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      
      {/* Mobile sidebar backdrop overlay */}
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
          {/* Brand Header */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100 shrink-0">
            <Link href="/employee/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={() => setIsSidebarOpen(false)}>
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm tracking-tight text-slate-900 leading-tight truncate" title={user?.organization_name || "AuraHR"}>
                  {user?.organization_name || "AuraHR"}
                </span>
                <span className="text-[10px] text-slate-400 font-normal truncate">
                  Employee Self-Service
                </span>
              </div>
            </Link>
            
            <button 
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-slate-400 hover:text-slate-600 shrink-0"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="px-3 pb-2 text-[10px] font-medium tracking-wider text-slate-400 uppercase">
              Main Menu
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/employee/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 text-xs font-normal rounded-lg transition-colors duration-150 ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer Logout */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="w-full flex justify-start gap-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium text-xs"
            >
              <LogOut className="h-4 w-4" />
              Sign Out Session
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 lg:pl-64 min-h-screen w-full overflow-x-hidden">
        {/* Top Navbar Header */}
        <header className="flex items-center justify-between px-3.5 sm:px-6 h-16 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-30 card-shadow">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden cursor-pointer text-slate-600 shrink-0"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-xs font-normal text-slate-500 hidden sm:block">
              Welcome, <span className="font-medium text-slate-800">{empFirstName}</span> 👋
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Profile Avatar Widget */}
            <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-200 pl-2 sm:pl-3">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-medium text-slate-900 leading-tight">
                  {empDisplayName}
                </span>
                <span className="text-[10px] text-slate-500 font-normal uppercase tracking-wide">
                  {empDesignation}
                </span>
              </div>
              
              {user?.profile?.profile_image_url ? (
                <div className="relative h-8 w-8 rounded-full overflow-hidden border border-slate-200 card-shadow shrink-0">
                  <Image 
                    src={`${getBackendUrl()}${user.profile.profile_image_url}`} 
                    alt="profile pic" 
                    fill
                    sizes="32px"
                    unoptimized
                    className="object-cover" 
                  />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-600 text-white font-medium text-xs flex items-center justify-center border border-indigo-200 card-shadow shrink-0">
                  {empInitial}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard Main View Area */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating AI HR Policy Assistant Chatbot */}
      <HRAssistantChatbot />
    </div>
  );
}

