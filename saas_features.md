# AuraHR / AuraWork - SaaS Feature Inventory

AuraHR is a modern, enterprise-ready workforce management and HRMS SaaS platform. Below is a comprehensive list of all features available in the system, mapped directly to their corresponding source code components.

---

## 🎨 Clean Light-Theme Design System & UI/UX

- **Design System Tokens:** Soft slate main background (`#F8FAFC`), white card panels (`#FFFFFF`), slate typography (`#1E293B` primary, `#64748B` secondary), 1px border dividers (`#E2E8F0`), and indigo primary accent (`#4F46E5`). Refer to [globals.css](file:///f:/log/frontend/src/app/globals.css).
- **Core Components System:**
  - **`atoms.tsx`**: Buttons (Primary Indigo, Soft, Outline, Danger, Ghost), Inputs, SearchInput, Selects, Badges, Tabs, Pagination, Empty State, and Skeleton loaders. Refer to [atoms.tsx](file:///f:/log/frontend/src/components/ui/atoms.tsx).
  - **`card.tsx`**: White container cards with `#E2E8F0` border and soft shadow utilities. Refer to [card.tsx](file:///f:/log/frontend/src/components/ui/card.tsx).
  - **`table.tsx`**: Modern data tables with header dividers (`bg-slate-50/80`), row dividers (`border-b border-slate-100`), and subtle hover states. Refer to [table.tsx](file:///f:/log/frontend/src/components/ui/table.tsx).
  - **`dialog.tsx`**: Light backdrop (`bg-slate-900/30 backdrop-blur-xs`) and white card modal containers. Refer to [dialog.tsx](file:///f:/log/frontend/src/components/ui/dialog.tsx).
- **Top Header & Search:** Integrated global Search bar, Notifications popover with unread count indicator, and User Profile avatar pill. Refer to [admin/layout.tsx](file:///f:/log/frontend/src/app/admin/layout.tsx).

---

## 🔒 Security & Session Management

- **JWT Cookie Authentication:** Authentication is managed using JWT access and refresh tokens stored in secure, `HTTP-Only`, same-site cookies to protect against Cross-Site Scripting (XSS) and token theft. Refer to [auth.py](file:///f:/log/backend/app/routers/auth.py).
- **Role-Based Guards (RBAC):** Restricts interface paths on the frontend (Next.js middleware/guards) and verifies scopes on the backend (FastAPI security utilities).
- **Password Policies & Changing:** Employees can update their passwords via their profiles; admins can trigger force password resets.
- **Brute Force Rate Limiting:** Crucial authentication endpoints are decorator-protected using `slowapi` to prevent dictionary/brute-force attacks.
- **SQL Injection Safeguards:** Database queries compile through parameterized SQLAlchemy ORM structures, neutralizing SQL Injection (SQLi) vectors.
- **Structural Audit Trails:** Every user-initiated action (logins, clock operations, settings updates) writes detailed action metadata to the database for compliance. Refer to the `AuditLog` model in [models.py](file:///f:/log/backend/app/models/models.py).

---

## 👥 Access Control & User Roles

### 1. Admin Role (System Owner & HR Admin)
- **HRMS Dashboard Overview:** Real-time KPI summary cards, Action Center (needs attention queue), Currently Active shift session list, Recharts turnout charts (7-day bar chart & 6-month area trend), Department headcounts, and Celebrations widget. Refer to [admin/dashboard/page.tsx](file:///f:/log/frontend/src/app/admin/dashboard/page.tsx).
- **Workforce Directory:** Add, edit, delete, activate, deactivate, or reset employee passwords, configure hourly rates and base salaries. Refer to [admin/employees/page.tsx](file:///f:/log/frontend/src/app/admin/employees/page.tsx).
- **Attendance Audit Logs:** Review shift punches, inspect webcam verification photos, audit GPS geofencing parameters, and process attendance correction requests. Refer to [admin/attendance/page.tsx](file:///f:/log/frontend/src/app/admin/attendance/page.tsx).
- **Leave Approvals Manager:** Table queue to review, approve, or reject employee leave applications with automated balance deduction. Refer to [admin/leaves/page.tsx](file:///f:/log/frontend/src/app/admin/leaves/page.tsx).
- **Payroll & Compensation:** Monthly payroll budget calculation, salary breakdown table, batch payout action, and payslip PDF export. Refer to [admin/payroll/page.tsx](file:///f:/log/frontend/src/app/admin/payroll/page.tsx).
- **Departments & Teams:** Unit cards grid, team headcount counts, manager leads, and department creation. Refer to [admin/departments/page.tsx](file:///f:/log/frontend/src/app/admin/departments/page.tsx).
- **Recruitment Pipeline:** Active job postings, candidate stage pipeline (Applied, Screening, Interview, Offered), and match score cards. Refer to [admin/recruitment/page.tsx](file:///f:/log/frontend/src/app/admin/recruitment/page.tsx).
- **Performance & Appraisals:** Q3 review cycle status, evaluation rating scores, goal completion %, and appraisal scheduling. Refer to [admin/performance/page.tsx](file:///f:/log/frontend/src/app/admin/performance/page.tsx).
- **Reports & Analytics Export:** Multi-filter queries and download files (PDF, CSV, Excel). Refer to [admin/reports/page.tsx](file:///f:/log/frontend/src/app/admin/reports/page.tsx).
- **Portal Settings:** Geofence office GPS coordinates, shift hours, lunch duration, and public holidays table. Refer to [admin/settings/page.tsx](file:///f:/log/frontend/src/app/admin/settings/page.tsx).

### 2. Employee Role
- **Shift Control Center:** Geofence-verified clock-in and clock-out with webcam selfie capture verification. Refer to [employee/dashboard/page.tsx](file:///f:/log/frontend/src/app/employee/dashboard/page.tsx).
- **Break Session Controls:** Pause and resume shift timers to track net working hours.
- **Attendance Correction Requests:** Submit requests for forgotten punches or off-site check-ins.
- **Leave Planner:** Apply for Casual, Sick, Paid, or Emergency leaves, and inspect remaining balances. Refer to [employee/leaves/page.tsx](file:///f:/log/frontend/src/app/employee/leaves/page.tsx).
- **Profile Customizer:** Edit contact phone and change sign-in credentials. Refer to [employee/profile/page.tsx](file:///f:/log/frontend/src/app/employee/profile/page.tsx).

---

## 📍 Geofenced Attendance Logs & Selfie Verification

- **HTML5 Geolocation Integration:** Captures browser GPS coordinates at clock-in.
- **Haversine Distance Verification:** Compares employee coordinates with office settings to verify location validity. Refer to [attendance.py](file:///f:/log/backend/app/routers/attendance.py).
- **Webcam Selfie Photo Verification:** Captures camera snapshot frame at clock-in for identity auditing.
- **Work From Home (WFH) Bypass:** Grants range-based exclusions to bypass coordinate check.
- **Late Arrival & Overtime Calculation:** Detects delay against office start time and computes overtime minutes relative to required shift hours.
- **Break Session Timers:** Pause and resume breaks. Automatically closes open break sessions on clock-out.
- **Attendance Correction Requests:** Workflow allowing employees to request punch corrections for admin review.

---

## 📅 Leave Management System

- **Leave Types Support:** Supports Casual, Sick, Paid, Unpaid, and Emergency leaves. Refer to `LeaveRequest` in [models.py](file:///f:/log/backend/app/models/models.py).
- **Calculated Balance Validation:** Checks remaining balances during submission and blocks requests with insufficient balances.
- **Overlapping Request Validation:** Validates application dates to prevent duplicates.
- **Unified Review Workflow:** Queue showing pending requests. Admins can approve or reject leaves with comments. Refer to [leaves/page.tsx](file:///f:/log/frontend/src/app/admin/leaves/page.tsx).
- **Automated Balance Deductions:** Approving leaves automatically deducts calculated calendar days from employee profiles. Refer to [leaves.py](file:///f:/log/backend/app/routers/leaves.py).

---

## ⚙️ Settings & Holiday Configuration

- **Geofence Boundary Parameters:** Configure office Latitude, Longitude, and Allowed Radius in meters.
- **Shift Parameters:** Customize shift starts, shift ends, required daily hours, and default lunch periods.
- **Weekend Configuration:** Multi-select weekends to mark attendance records.
- **Public Holiday Calendar Manager:** Create, view, or delete holidays. Refer to [settings/page.tsx](file:///f:/log/frontend/src/app/admin/settings/page.tsx).

---

## 📑 Reports & Document Exports

- **Multi-Filter Queries:** Filter records by date range, department, status, or specific employee. Refer to [reports/page.tsx](file:///f:/log/frontend/src/app/admin/reports/page.tsx).
- **Summary Data Grid:** Interactive table of clock records, break sessions, and calculations.
- **CSV Data Stream:** Generates custom-named CSV exports.
- **Excel Spreadsheet Export:** Uses `openpyxl` with custom styling. Refer to [reports.py](file:///f:/log/backend/app/routers/reports.py).
- **Printable PDF Export:** Uses `ReportLab` to structure clean table flows.

---

## 📂 Source Code Component Map

### 🖥️ Frontend (Next.js App Router Pages)
*   **Sign-in Portal:** [login/page.tsx](file:///f:/log/frontend/src/app/login/page.tsx)
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
*   **Employee Clock-in Desk:** [employee/dashboard/page.tsx](file:///f:/log/frontend/src/app/employee/dashboard/page.tsx)
*   **Employee Leave Applications:** [employee/leaves/page.tsx](file:///f:/log/frontend/src/app/employee/leaves/page.tsx)
*   **Employee Personal Settings:** [employee/profile/page.tsx](file:///f:/log/frontend/src/app/employee/profile/page.tsx)

### ⚙️ Backend (FastAPI Routers & Models)
*   **SQLAlchemy DB Schema:** [models/models.py](file:///f:/log/backend/app/models/models.py)
*   **Authentication & JWT:** [routers/auth.py](file:///f:/log/backend/app/routers/auth.py)
*   **Employee Profile Handling:** [routers/employees.py](file:///f:/log/backend/app/routers/employees.py)
*   **Geofence Punch Verification:** [routers/attendance.py](file:///f:/log/backend/app/routers/attendance.py)
*   **Leave Balance & Deduction Engine:** [routers/leaves.py](file:///f:/log/backend/app/routers/leaves.py)
*   **Office & Holiday Configurations:** [routers/settings.py](file:///f:/log/backend/app/routers/settings.py)
*   **FastAPI Analytic Aggregators:** [routers/dashboard.py](file:///f:/log/backend/app/routers/dashboard.py)
*   **PDF/Excel/CSV Document Generation:** [routers/reports.py](file:///f:/log/backend/app/routers/reports.py)
