# AuraHR - Enterprise HRMS SaaS Feature Inventory

AuraHR is a modern, production-ready workforce management and HRMS SaaS platform built with **FastAPI** (Python 3.11+) and **Next.js 16 / React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui**.

---

## 🎨 1. Modern Light-Theme Design System & Refined Typography

- **Curated Color Palette:** Soft Slate surface background (`#F8FAFC`), crisp white panel cards (`#FFFFFF`), neutral slate typography (`#1E293B` primary, `#64748B` secondary), 1px border dividers (`#E2E8F0`), and an Indigo primary accent (`#4F46E5`). Refer to [globals.css](file:///f:/log/frontend/src/app/globals.css).
- **Refined Lighter Typography:** Google Font **Inter** (`300`, `400`, `500`, `600`) with sleek `font-weight: 500` headings, sub-pixel antialiasing (`-webkit-font-smoothing: antialiased`), and softened badge/button weights.
- **shadcn/ui & Radix UI Component Suite:**
  - **`components.json`**: Official shadcn/ui configuration with `@/components`, `@/lib/utils`, and `@/components/ui` path aliases.
  - **`src/lib/utils.ts`**: Standard `cn()` class merging utility combining `clsx` and `tailwind-merge`.
  - **`atoms.tsx`**: Buttons (Primary Indigo, Soft, Outline, Danger, Ghost), Form Inputs, SearchInput, Selects, Badges, Tabs, Pagination, Empty State, and Skeleton loaders. Refer to [atoms.tsx](file:///f:/log/frontend/src/components/ui/atoms.tsx).
  - **`card.tsx`**: Clean white container cards with 1px borders and subtle shadow utilities (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`). Refer to [card.tsx](file:///f:/log/frontend/src/components/ui/card.tsx).
  - **`table.tsx`**: Dense, high-information data tables with header dividers (`bg-slate-50/80`), row dividers (`border-b border-slate-100`), and hover transitions. Refer to [table.tsx](file:///f:/log/frontend/src/components/ui/table.tsx).
  - **`dialog.tsx`**: Modal containers with backdrop blur (`backdrop-blur-xs`) and smooth zoom-in entrance animations. Refer to [dialog.tsx](file:///f:/log/frontend/src/components/ui/dialog.tsx).
  - **`toast.tsx`**: Event-driven toast notifications (`toast.success`, `toast.error`, `toast.info`, `toast.warning`). Refer to [toast.tsx](file:///f:/log/frontend/src/components/ui/toast.tsx).

---

## 🔒 2. Multi-Tenant Security & Session Architecture

- **Multi-Tenant Workspaces:** Isolated tenant contexts with custom organization names, workspace codes, and subscription tiers (*Starter, Growth, Enterprise*). Refer to [auth.py](file:///f:/log/backend/app/routers/auth.py).
- **JWT HTTP-Only Cookies:** Secure session management using access and refresh tokens stored in `HTTP-Only`, `SameSite=Lax` cookies to prevent XSS vulnerabilities.
- **Role-Based Access Control (RBAC):** Strict interface guards (`ADMIN` vs. `EMPLOYEE`) enforced via Next.js client router guards and FastAPI backend dependency scopes.
- **Brute-Force Attack Prevention:** Authentication endpoints protected with `slowapi` rate limiting and in-memory fallback defense against credential stuffing.
- **Interactive Sign-in Portal:** Includes 1-click demo credential badges (`Admin`, `Employee`, `Finance`, `Sales`) and a show/hide password toggle. Refer to [login/page.tsx](file:///f:/log/frontend/src/app/login/page.tsx).
- **Comprehensive Audit Trail:** Logs user operations (logins, punch operations, status changes, settings updates) in the `AuditLog` table. Refer to [models.py](file:///f:/log/backend/app/models/models.py).

---

## 📊 3. Executive HR Admin Dashboard

- **Real-Time KPI Summary Cards:** Live counters for Total Employees, Present Today, Absent, Late Arrivals, Currently Active Shifts, and Approved Leaves. Refer to [admin/dashboard/page.tsx](file:///f:/log/frontend/src/app/admin/dashboard/page.tsx).
- **Interactive Data Charts (Recharts):**
  - **7-Day Turnout Chart:** Bar chart comparing daily present, late, and WFH headcounts.
  - **6-Month Attendance Trend:** Gradient area chart showing historical workforce engagement.
- **"Needs Attention" Action Center:** Real-time alert feed flagging pending leave requests, GPS geofence breaches, and punch correction submissions.
- **Active Workers Monitor:** Live table showing currently clocked-in employees with exact punch timestamps and elapsed session durations.

---

## 📍 4. Smart Geofenced Attendance & Shift Control

- **HTML5 GPS Geofence Verification:** Captures high-accuracy browser coordinates and calculates proximity against configured office coordinates using the **Haversine formula**. Refer to [attendance.py](file:///f:/log/backend/app/routers/attendance.py).
- **Webcam Selfie Photo Verification:** Captures live webcam snapshots at clock-in for identity auditing and buddy-punch prevention.
- **Break Session Controls:** Pause and resume shift timers to track meal and short break durations separately from net active working hours.
- **Late Arrival & Overtime Engine:** Detects shift delays against scheduled office hours and calculates overtime minutes automatically.
- **Punch Correction Workflow:** Employees can submit correction requests for missed or off-site punches for admin review.
- **Admin Attendance Audit Desk:** Review full shift history, inspect selfie audit images, audit GPS variance meters, and approve punch corrections. Refer to [admin/attendance/page.tsx](file:///f:/log/frontend/src/app/admin/attendance/page.tsx).

---

## 👥 5. Workforce Directory & Lifecycle Management

- **Employee Roster Grid:** Search by name, email, or employee ID; filter by department and active/inactive status. Refer to [admin/employees/page.tsx](file:///f:/log/frontend/src/app/admin/employees/page.tsx).
- **Add / Edit Employee Dialog:** Modal form with instant validation for name, email, department, role, joining date, and base salary.
- **Lifecycle Actions:** 1-click activate/deactivate status toggle, force password reset, and profile details modal.
- **Employee Self-Service Profile:** Edit contact phone, upload profile avatar image, and update account password. Refer to [employee/profile/page.tsx](file:///f:/log/frontend/src/app/employee/profile/page.tsx).

---

## 📅 6. Leave Management & Approval Desk

- **Leave Types Supported:** Casual Leave, Sick Leave, Paid/Earned Leave, Unpaid Leave, and Emergency Leave. Refer to [leaves.py](file:///f:/log/backend/app/routers/leaves.py).
- **Live Balance Tracking:** Automatic quota calculation that validates remaining balance before submission and prevents overlapping date requests.
- **One-Click Approval Desk:** Admins can review pending leave applications with reason notes, view employee history, and approve or reject with comments. Refer to [admin/leaves/page.tsx](file:///f:/log/frontend/src/app/admin/leaves/page.tsx).
- **Automated Balance Deduction:** Approving leaves automatically deducts calculated calendar days from the employee's profile balance.
- **Employee Leave Center:** Submit leave applications with date pickers, reason inputs, and visual remaining balance cards. Refer to [employee/leaves/page.tsx](file:///f:/log/frontend/src/app/employee/leaves/page.tsx).

---

## 💰 7. Payroll & Compensation Management

- **Monthly Salary Calculation:** Automatically calculates Gross Salary, Allowances (HRA, Special Allowance), Deductions (Provident Fund, Professional Tax, TDS), and Net Payout. Refer to [admin/payroll/page.tsx](file:///f:/log/frontend/src/app/admin/payroll/page.tsx).
- **Batch Payout Processing:** 1-click batch payout action for the entire workforce or specific departments.
- **Status Tracking:** Real-time visibility into Paid vs. Pending salary rosters.
- **Digital Payslip Generation:** Detailed salary slip breakdown with downloadable and printable format options.

---

## 📑 8. Multi-Format Reports & Analytics Export

- **Flexible Multi-Filter Queries:** Filter attendance and payroll records by date range, department, attendance status, or individual employee. Refer to [admin/reports/page.tsx](file:///f:/log/frontend/src/app/admin/reports/page.tsx).
- **Export Engines:**
  - 📊 **Excel Spreadsheet (`.xlsx`)**: Formatted data exports generated with `openpyxl`. Refer to [reports.py](file:///f:/log/backend/app/routers/reports.py).
  - 📄 **Printable PDF Document (`.pdf`)**: Structured document reports generated via `ReportLab`.
  - 📝 **Raw CSV Stream (`.csv`)**: Clean CSV data stream for external payroll and ERP integration.

---

## 🏢 9. Departments, Recruitment & Performance

- **Department & Teams Hub:** Department card grid, team headcount counters, manager lead assignments, and department creation. Refer to [admin/departments/page.tsx](file:///f:/log/frontend/src/app/admin/departments/page.tsx).
- **Recruitment Pipeline:** Active job vacancy listings, multi-stage candidate applicant tracking (*Applied → Screening → Interview → Offered*), and candidate match score cards. Refer to [admin/recruitment/page.tsx](file:///f:/log/frontend/src/app/admin/recruitment/page.tsx).
- **Performance & Appraisals:** Performance evaluation review cycles, goal completion percentages, rating scorecards, and review scheduling. Refer to [admin/performance/page.tsx](file:///f:/log/frontend/src/app/admin/performance/page.tsx).

---

## 🤖 10. Integrated AI HR Policy Assistant

- **Floating AI Chatbot Widget:** Interactive conversational assistant accessible from both employee and admin portals. Refer to [HRAssistantChatbot.tsx](file:///f:/log/frontend/src/components/HRAssistantChatbot.tsx).
- **Instant Policy Q&A:** Answers questions regarding company leave rules, office hours, WFH eligibility, and holiday schedules. Refer to [assistant.py](file:///f:/log/backend/app/routers/assistant.py).
- **Live Context Integration:** Pulls verified company policies and user-specific leave balances directly into the conversation.

---

## ⚙️ 11. Portal Settings & Holiday Configuration

- **Geofence Parameters:** Configure office Latitude, Longitude, and Allowed Geofence Radius (in meters). Refer to [admin/settings/page.tsx](file:///f:/log/frontend/src/app/admin/settings/page.tsx).
- **Shift & Working Hours:** Set office start/end times, required daily hours, and default lunch break periods.
- **Public Holiday Calendar Manager:** Add, view, or remove company public holidays.

---

## 📂 Source Code Component Map

### 🖥️ Frontend (Next.js App Router & Components)
*   **Sign-in Portal:** [login/page.tsx](file:///f:/log/frontend/src/app/login/page.tsx)
*   **Workspace Registration:** [register/page.tsx](file:///f:/log/frontend/src/app/register/page.tsx)
*   **Admin Layout & Top Nav:** [admin/layout.tsx](file:///f:/log/frontend/src/app/admin/layout.tsx)
*   **Admin Dashboard:** [admin/dashboard/page.tsx](file:///f:/log/frontend/src/app/admin/dashboard/page.tsx)
*   **Workforce Directory:** [admin/employees/page.tsx](file:///f:/log/frontend/src/app/admin/employees/page.tsx)
*   **Attendance Tracking Logs:** [admin/attendance/page.tsx](file:///f:/log/frontend/src/app/admin/attendance/page.tsx)
*   **Leaves Approval Desk:** [admin/leaves/page.tsx](file:///f:/log/frontend/src/app/admin/leaves/page.tsx)
*   **Payroll & Compensation:** [admin/payroll/page.tsx](file:///f:/log/frontend/src/app/admin/payroll/page.tsx)
*   **Departments & Teams:** [admin/departments/page.tsx](file:///f:/log/frontend/src/app/admin/departments/page.tsx)
*   **Recruitment Pipeline:** [admin/recruitment/page.tsx](file:///f:/log/frontend/src/app/admin/recruitment/page.tsx)
*   **Performance Reviews:** [admin/performance/page.tsx](file:///f:/log/frontend/src/app/admin/performance/page.tsx)
*   **Reports & Export Interface:** [admin/reports/page.tsx](file:///f:/log/frontend/src/app/admin/reports/page.tsx)
*   **Office Rules & Holidays Settings:** [admin/settings/page.tsx](file:///f:/log/frontend/src/app/admin/settings/page.tsx)
*   **Employee Layout:** [employee/layout.tsx](file:///f:/log/frontend/src/app/employee/layout.tsx)
*   **Employee Shift Desk:** [employee/dashboard/page.tsx](file:///f:/log/frontend/src/app/employee/dashboard/page.tsx)
*   **Employee Leave Applications:** [employee/leaves/page.tsx](file:///f:/log/frontend/src/app/employee/leaves/page.tsx)
*   **Employee Profile:** [employee/profile/page.tsx](file:///f:/log/frontend/src/app/employee/profile/page.tsx)
*   **AI HR Chatbot:** [HRAssistantChatbot.tsx](file:///f:/log/frontend/src/components/HRAssistantChatbot.tsx)
*   **Core UI Atoms:** [atoms.tsx](file:///f:/log/frontend/src/components/ui/atoms.tsx)
*   **Card Components:** [card.tsx](file:///f:/log/frontend/src/components/ui/card.tsx)
*   **Table Components:** [table.tsx](file:///f:/log/frontend/src/components/ui/table.tsx)
*   **Dialog Components:** [dialog.tsx](file:///f:/log/frontend/src/components/ui/dialog.tsx)
*   **Toast Notifications:** [toast.tsx](file:///f:/log/frontend/src/components/ui/toast.tsx)

### ⚙️ Backend (FastAPI Routers & Models)
*   **SQLAlchemy DB Models:** [models/models.py](file:///f:/log/backend/app/models/models.py)
*   **Authentication & JWT:** [routers/auth.py](file:///f:/log/backend/app/routers/auth.py)
*   **Employee Profile Handling:** [routers/employees.py](file:///f:/log/backend/app/routers/employees.py)
*   **Geofence Punch Verification:** [routers/attendance.py](file:///f:/log/backend/app/routers/attendance.py)
*   **Leave Balance & Deduction Engine:** [routers/leaves.py](file:///f:/log/backend/app/routers/leaves.py)
*   **FastAPI Analytic Aggregators:** [routers/dashboard.py](file:///f:/log/backend/app/routers/dashboard.py)
*   **PDF/Excel/CSV Document Generation:** [routers/reports.py](file:///f:/log/backend/app/routers/reports.py)
*   **Office & Holiday Configurations:** [routers/settings.py](file:///f:/log/backend/app/routers/settings.py)
*   **AI Policy Assistant Router:** [routers/assistant.py](file:///f:/log/backend/app/routers/assistant.py)
