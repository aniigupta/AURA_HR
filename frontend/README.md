# AuraHR / AuraWork - Next.js 15 Frontend Portal

This is the Next.js 15 frontend web application for the **AuraHR / AuraWork Human Resource Management System (HRMS)**. It features a clean, minimal, enterprise-grade light-theme design system.

---

## 🎨 Design System Tokens

- **Background**: `#F8FAFC`
- **Cards & Panels**: `#FFFFFF` with `#E2E8F0` border and soft shadow
- **Primary Text**: `#1E293B`
- **Secondary Text**: `#64748B`
- **Primary Accent**: `#4F46E5` (Indigo)

---

## 📂 Page Directory & App Routes

```text
src/app/
├── admin/
│   ├── dashboard/       # HR Analytics, KPI grid, Action center, Recharts
│   ├── employees/       # Employee Directory, CRUD forms, Avatar upload
│   ├── attendance/      # Daily punch history & session selfie audit
│   ├── leaves/          # Leave approvals queue & balance inspector
│   ├── payroll/         # Monthly payroll budgets & payslip generation
│   ├── departments/     # Unit management & headcount analytics
│   ├── recruitment/     # Job opening postings & applicant pipeline
│   ├── performance/     # Appraisal score reviews & goal tracking
│   ├── reports/         # Attendance & Payroll report exports (PDF, Excel, CSV)
│   └── settings/        # Office GPS coordinates, geofence, & public holidays
├── employee/
│   ├── dashboard/       # Shift punch controller, break session, live clock
│   ├── leaves/          # Leave planner & application form
│   └── profile/         # Contact info & password change form
└── login/               # Sign-in portal with testing presets
```

---

## 🚀 Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to explore the portal.

### Production Build

```bash
npm run build
```
