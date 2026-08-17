"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "./atoms";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

// Global emitter event helper
export const toast = {
  success: (msg: string) => dispatchToast(msg, "success"),
  error: (msg: string) => dispatchToast(msg, "error"),
  warning: (msg: string) => dispatchToast(msg, "warning"),
  info: (msg: string) => dispatchToast(msg, "info"),
};

function dispatchToast(message: string, type: ToastType) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent("aura-toast", {
      detail: { message, type, id: Math.random().toString(36).substring(2, 9) },
    });
    window.dispatchEvent(event);
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      const toastItem = customEvent.detail;
      setToasts((prev) => [...prev, toastItem]);

      // Auto remove after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastItem.id));
      }, 4000);
    };

    window.addEventListener("aura-toast", handleToastEvent);
    return () => {
      window.removeEventListener("aura-toast", handleToastEvent);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-in slide-in-from-bottom-5 duration-200 bg-card text-card-foreground pointer-events-auto",
            {
              "border-emerald-200 dark:border-emerald-950/40 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300": t.type === "success",
              "border-rose-200 dark:border-rose-950/40 bg-rose-500/5 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400": t.type === "error",
              "border-amber-200 dark:border-amber-950/40 bg-amber-500/5 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300": t.type === "warning",
              "border-blue-200 dark:border-blue-950/40 bg-blue-500/5 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300": t.type === "info",
            }
          )}
        >
          {/* Icon */}
          <div className="shrink-0 mt-0.5">
            {t.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            {t.type === "error" && <XCircle className="h-5 w-5 text-rose-500" />}
            {t.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {t.type === "info" && <Info className="h-5 w-5 text-blue-500" />}
          </div>

          {/* Text Message */}
          <div className="flex-1 text-sm font-medium leading-relaxed">{t.message}</div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="shrink-0 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

