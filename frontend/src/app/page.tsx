"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (user.role === "Admin") {
        router.replace("/admin/dashboard");
      } else {
        router.replace("/employee/dashboard");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900">
      <div className="flex flex-col items-center gap-4">
        {/* Loading Spinner */}
        <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-800">
          Loading AuraWork...
        </h1>
        <p className="text-xs text-slate-500">Checking authorization status</p>
      </div>
    </div>
  );
}

