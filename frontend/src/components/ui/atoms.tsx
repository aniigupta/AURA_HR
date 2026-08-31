import React, { InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, useState, useRef, useEffect } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Search, ChevronDown, Check, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";

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

// Custom Modern DatePicker Component
export interface DatePickerProps {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
  name?: string;
  id?: string;
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  disabled,
  error,
  placeholder = "Select date",
  className,
  name,
  id,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const strVal = typeof value === "string" ? value : (typeof defaultValue === "string" ? defaultValue : "");

  const selectedDate = strVal ? new Date(strVal + "T00:00:00") : null;
  const isValidDate = selectedDate && !isNaN(selectedDate.getTime());

  const initialViewDate = isValidDate ? selectedDate : new Date();
  const [viewYear, setViewYear] = useState(initialViewDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialViewDate.getMonth());

  useEffect(() => {
    if (isValidDate && selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
  }, [strVal]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    const formattedDate = `${viewYear}-${formattedMonth}-${formattedDay}`;

    if (onChange) {
      onChange({
        target: {
          value: formattedDate,
          name: name,
        },
      });
    }
    setIsOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const formattedMonth = String(today.getMonth() + 1).padStart(2, "0");
    const formattedDay = String(today.getDate()).padStart(2, "0");
    const formattedDate = `${today.getFullYear()}-${formattedMonth}-${formattedDay}`;

    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());

    if (onChange) {
      onChange({
        target: {
          value: formattedDate,
          name: name,
        },
      });
    }
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) {
      onChange({
        target: {
          value: "",
          name: name,
        },
      });
    }
    setIsOpen(false);
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getDate() === day &&
    today.getMonth() === viewMonth &&
    today.getFullYear() === viewYear;

  const isSelected = (day: number) =>
    isValidDate &&
    selectedDate !== null &&
    selectedDate.getDate() === day &&
    selectedDate.getMonth() === viewMonth &&
    selectedDate.getFullYear() === viewYear;

  const displayText = isValidDate && selectedDate
    ? selectedDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          className={cn(
            "flex items-center justify-between w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-150 shadow-xs cursor-pointer min-h-[38px]",
            isOpen ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm" : "hover:border-slate-300 hover:bg-slate-50/50",
            disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "",
            error ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500" : "",
            className
          )}
        >
          <span className={cn("truncate font-medium", !displayText && "text-slate-400 font-normal")}>
            {displayText || placeholder}
          </span>
          <Calendar className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-[9999] w-[280px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl shadow-slate-900/15 animate-in fade-in-0 zoom-in-95 duration-150 focus:outline-none select-none"
        >
          {/* Header Month / Year & Prev/Next Buttons */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-slate-900">
                {months[viewMonth]} {viewYear}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {daysOfWeek.map((day) => (
              <span key={day} className="text-[10px] font-semibold text-slate-400 py-1">
                {day}
              </span>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="h-7 w-7 mx-auto flex items-center justify-center text-[11px] text-slate-300 pointer-events-none"
              >
                {prevMonthDays - firstDayIndex + i + 1}
              </div>
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const currentDay = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    "h-7 w-7 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-100 cursor-pointer",
                    selected
                      ? "bg-indigo-600 text-white font-bold shadow-xs scale-105"
                      : currentDay
                      ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-200"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Action Buttons */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 text-[11px]">
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-rose-600 font-medium transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
            >
              Today
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Input Component
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, error, icon, value, defaultValue, onChange, placeholder, ...props }, ref) => {
    if (type === "date") {
      return (
        <div className="w-full flex flex-col gap-1">
          {label && (
            <label className="text-[11px] sm:text-xs font-semibold text-slate-700 tracking-tight">
              {label}
            </label>
          )}
          <DatePicker
            value={value}
            defaultValue={defaultValue}
            onChange={onChange as any}
            disabled={props.disabled}
            error={error}
            placeholder={placeholder}
            className={className}
            name={props.name}
            id={props.id}
          />
          {error && <span className="text-[11px] text-rose-600 font-normal">{error}</span>}
        </div>
      );
    }

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
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
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
export interface SelectOption {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  label?: string;
  options: (SelectOption | { label: string; value: string | number })[];
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  error?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, value: controlledValue, defaultValue, placeholder = "Select an option", error, disabled, onChange, name, id, ...props }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalValue, setInternalValue] = useState<string | number>(
      controlledValue !== undefined ? controlledValue : (defaultValue !== undefined ? defaultValue : (options[0]?.value ?? ""))
    );
    const hiddenSelectRef = useRef<HTMLSelectElement>(null);

    const isControlled = controlledValue !== undefined;
    const currentValue = isControlled ? controlledValue : internalValue;

    const selectedOption = options.find((opt) => String(opt.value) === String(currentValue));

    const handleSelect = (optionValue: string | number) => {
      if (disabled) return;
      if (!isControlled) {
        setInternalValue(optionValue);
      }
      setIsOpen(false);

      if (onChange) {
        onChange({
          target: {
            value: String(optionValue),
            name: name,
          },
        });
      }
    };

    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label className="text-[11px] sm:text-xs font-semibold text-slate-700 tracking-tight">
            {label}
          </label>
        )}

        {/* Hidden select for form integrity & ref forwarding */}
        <select
          ref={ref || hiddenSelectRef}
          name={name}
          id={id}
          value={currentValue}
          disabled={disabled}
          onChange={(e) => handleSelect(e.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
          <Popover.Trigger asChild disabled={disabled}>
            <button
              type="button"
              className={cn(
                "flex items-center justify-between w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-150 shadow-xs cursor-pointer min-h-[38px]",
                isOpen ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm" : "hover:border-slate-300 hover:bg-slate-50/50",
                disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "",
                error ? "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500" : "",
                className
              )}
            >
              <span className={cn("truncate font-medium text-left", !selectedOption && "text-slate-400")}>
                {selectedOption ? selectedOption.label : placeholder}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2",
                  isOpen && "transform rotate-180 text-indigo-600"
                )}
              />
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              sideOffset={5}
              align="start"
              className="z-[9999] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15 animate-in fade-in-0 zoom-in-95 duration-150 focus:outline-none"
            >
              <div className="space-y-0.5" role="listbox">
                {options.map((opt) => {
                  const isSelected = String(opt.value) === String(currentValue);
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(opt.value)}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors duration-100 select-none",
                        isSelected
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-normal"
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

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
