import React, { InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Search } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Button Component
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "soft";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none active:scale-[0.98]",
          {
            "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs": variant === "primary",
            "bg-slate-100 hover:bg-slate-200 text-slate-800": variant === "secondary",
            "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium": variant === "soft",
            "bg-rose-600 hover:bg-rose-700 text-white shadow-xs": variant === "destructive",
            "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs": variant === "outline",
            "hover:bg-slate-100 text-slate-600 hover:text-slate-900": variant === "ghost",
            "text-indigo-600 hover:underline bg-transparent p-0 h-auto font-medium": variant === "link",
            
            "h-8 sm:h-8.5 px-3 text-xs": size === "sm",
            "h-9 sm:h-9.5 px-4 text-xs font-medium": size === "md",
            "h-10 sm:h-11 px-5 sm:px-6 text-xs sm:text-sm font-medium": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// Input Component
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label className="text-[11px] sm:text-xs font-medium text-slate-600">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              "flex w-full rounded-lg border border-slate-200 bg-white py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors duration-150 disabled:opacity-50 disabled:bg-slate-50 min-h-[36px] sm:min-h-[38px]",
              icon ? "pl-9 pr-3.5" : "px-3 sm:px-3.5",
              error ? "border-rose-500 focus:ring-rose-500/20" : "",
              className
            )}
            {...props}
          />
        </div>
        {error && <span className="text-[11px] text-rose-600 font-normal">{error}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";

// SearchInput Component
export const SearchInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => <Input ref={ref} icon={<Search className="h-4 w-4" />} placeholder="Search..." {...props} />
);
SearchInput.displayName = "SearchInput";

// Select Component
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { label: string; value: string | number }[];
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, error, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label className="text-[11px] sm:text-xs font-medium text-slate-600">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            "flex w-full rounded-lg border border-slate-200 bg-white px-3 sm:px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors duration-150 disabled:opacity-50 cursor-pointer min-h-[36px] sm:min-h-[38px]",
            error ? "border-rose-500 focus:ring-rose-500/20" : "",
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-[11px] text-rose-600 font-normal">{error}</span>}
      </div>
    );
  }
);
Select.displayName = "Select";

// Badge Component
export function Badge({
  className,
  variant = "neutral",
  children,
}: {
  className?: string;
  variant?: "success" | "warning" | "destructive" | "info" | "neutral" | "primary";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium border transition-colors whitespace-nowrap",
        {
          "bg-emerald-50 text-emerald-700 border-emerald-200/80": variant === "success",
          "bg-amber-50 text-amber-800 border-amber-200/80": variant === "warning",
          "bg-rose-50 text-rose-700 border-rose-200/80": variant === "destructive",
          "bg-sky-50 text-sky-700 border-sky-200/80": variant === "info",
          "bg-indigo-50 text-indigo-700 border-indigo-200/80": variant === "primary",
          "bg-slate-100 text-slate-700 border-slate-200": variant === "neutral",
        },
        className
      )}
    >
      {children}
    </span>
  );
}

// Tabs Component
export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-slate-200 w-full overflow-x-auto no-scrollbar", className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-normal transition-all duration-150 border-b-2 -mb-px whitespace-nowrap cursor-pointer",
              isActive
                ? "border-indigo-600 text-indigo-600 font-medium bg-indigo-50/40"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-medium",
                  isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Pagination Component
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
      <div className="text-xs text-slate-500">
        Page <span className="font-medium text-slate-700">{currentPage}</span> of{" "}
        <span className="font-medium text-slate-700">{totalPages}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// Empty State Component
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 my-4">
      {icon && <div className="p-3 rounded-full bg-indigo-50 text-indigo-600 mb-3">{icon}</div>}
      <h4 className="text-sm font-medium text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed font-normal">{description}</p>
      {action}
    </div>
  );
}

// Skeleton Loader
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-slate-100", className)}
      {...props}
    />
  );
}
