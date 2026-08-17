import React, { useEffect } from "react";
import { cn } from "./atoms";
import { X } from "lucide-react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: DialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />
      
      {/* Dialog container */}
      <div
        className={cn(
          "relative z-10 w-full rounded-xl border border-slate-200 bg-white text-slate-800 p-4 sm:p-6 shadow-xl animate-in fade-in-50 zoom-in-95 duration-150 my-auto",
          {
            "max-w-sm": size === "sm",
            "max-w-md": size === "md",
            "max-w-lg": size === "lg",
            "max-w-2xl": size === "xl",
          }
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Content body */}
        <div className="max-h-[75vh] sm:max-h-[80vh] overflow-y-auto pr-1 text-xs">{children}</div>
      </div>
    </div>
  );
}
export default Dialog;
