"use client";

import React from "react";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        {/* Loading Spinner */}
        <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
        <h1 className="text-xl font-medium tracking-wide text-slate-300">
          Loading AuraWork...
        </h1>
        <p className="text-sm text-slate-500">Checking authorization status</p>
      </div>
    </div>
  );
}

