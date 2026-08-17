# AuraHR (AuraWork) - Modern Enterprise HRMS & Workforce Management Portal

A modern, production-ready, secure, enterprise-grade **Human Resource Management System (HRMS)** and **Geofenced Workforce Portal** designed for small businesses, agencies, and enterprise teams.

Featuring a **clean, minimal, professional light-theme design system**, real-time workforce analytics, geofenced GPS clock-ins with selfie verification, leave planner, payroll batch processing, recruitment pipeline, performance appraisals, and multi-format document exports (PDF, Excel, CSV).

---

## 🌟 Core Features & Modules

### 🎨 Clean Light-Theme Design System
- **Enterprise Aesthetics**: Soft slate background (`#F8FAFC`), white panel cards (`#FFFFFF`) with 1px border (`#E2E8F0`), soft shadows, and indigo primary accent (`#4F46E5`).
- **High Readability**: Strong WCAG-compliant contrast with slate text (`#1E293B` primary, `#64748B` secondary).
- **Soft Status Badges**: Crisp color pills for status indicators (Emerald for Success, Amber for Warnings, Rose for Errors, Indigo for Info/WFH).

---

### 👤 1. System Admin (HR Owner & Management)
- **Workforce Management & Directory:** Full CRUD for employee profiles, role assignments, department allocation, salary structure, avatar uploads, and password resets.
- **Geofence GPS Controls:** Set office GPS coordinates (Latitude, Longitude) and allowed radius allowance in meters using the server-side Haversine formula.
- **Work From Home (WFH) Exclusions:** Configure range-based WFH exclusions for specific employees to bypass GPS verification.
- **Attendance Audit & Session Logs:** Inspect clock-in/out times, break durations, GPS variance markers, browser metadata, and captured verification selfie photos.
- **Leave Approvals Desk:** Unified queue to review, approve, or reject employee leave applications with automatic balance deduction.
- **Payroll & Compensation Management:** Monthly payroll budget calculation, salary breakdown tables, batch payout processing, and payslip PDF generation.
- **Departments & Teams:** Unit management, headcount analytics, manager assignments, and department creation.
- **Recruitment & Hiring Pipeline:** Job opening postings, applicant stage management (Applied, Screening, Interview, Offered), match score cards.
- **Performance & Appraisals:** Q3 review cycles, employee rating scores, goal completion %, and appraisal scheduling.
- **Visual Analytics Dashboard:** Real-time summary KPI cards, Action Center (needs attention), Active shift session list, Recharts turnout charts (7-day bar chart & 6-month area trend), and department distribution widgets.
- **Multi-Format Export Engine:** Download attendance and payroll reports in PDF, Excel (xlsx), and CSV formats.

---

### 👥 2. Employee Self-Service Portal
- **Shift Control Center:** Geofenced clock-in/out with webcam selfie capture verification.
- **Break Session Controls:** Pause and resume shift timers to audit net working hours accurately.
- **Attendance Correction Requests:** Submit requests for forgotten punches or off-site check-ins.
- **Leave Planner:** Request Casual, Sick, Paid, or Emergency leaves and inspect live remaining balances.
- **Personal Profile Management:** Update phone contacts and change sign-in credentials.

---

## ⚙️ Technology Stack

- **Frontend:** Next.js 15 (TypeScript, TailwindCSS, React Hook Form, TanStack Query, Recharts, Lucide Icons)
- **Backend:** FastAPI (Python, SQLAlchemy, Pydantic, SlowAPI rate limiting, PyJWT)
- **Database:** PostgreSQL 15 / PostgreSQL 18
- **Authentication:** JWT Access/Refresh Tokens locked in HTTP-Only SameSite Cookies
- **Deployment:** Docker & Docker Compose

---

## 📂 Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── core/           # Security, config, database connection, and math utils
│   │   ├── models/         # SQLAlchemy database models
│   │   ├── schemas/        # Pydantic schemas validation
│   │   ├── routers/        # FastAPI endpoints (Auth, Employee, Leaves, Attendance, Settings, Dashboard, Reports)
│   │   ├── seed.py         # Initial database seeding script
│   │   └── main.py         # FastAPI app configuration & CORS setup
│   ├── requirements.txt    # Python package dependencies
│   └── Dockerfile          # Backend Docker container setup
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router (Layouts & Feature Pages)
│   │   │   ├── admin/      # Admin HRMS (Dashboard, Employees, Attendance, Leaves, Payroll, Departments, Recruitment, Performance, Reports, Settings)
│   │   │   ├── employee/   # Employee Portal (Dashboard, Leaves, Profile)
│   │   │   ├── login/      # Sign-in page
│   │   │   └── globals.css # Design system tokens & utility classes
│   │   ├── components/ui/  # Reusable core components (atoms, card, table, dialog, toast)
│   │   ├── context/        # Auth Context session controller
│   │   └── utils/          # apiFetch client wrapper
│   ├── next.config.ts      # Next.js config & backend rewrites
│   ├── package.json        # Frontend node packages
│   └── Dockerfile          # Frontend Docker container setup
└── docker-compose.yml      # Multi-container orchestrator
```

---

## 🚀 Getting Started & Local Running

### Option 1: Native Local Server (Recommended for Windows)

1. **Start Backend FastAPI Server:**
   ```bash
   cd backend
   python -m uvicorn app.main:app --port 8000
   ```
   *The backend will automatically connect to PostgreSQL on `localhost:5432` and seed the database on startup.*

2. **Start Frontend Next.js Server:**
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser:
   - **Frontend Portal:** [http://localhost:3000](http://localhost:3000)
   - **FastAPI Backend:** [http://localhost:8000](http://localhost:8000)
   - **Interactive API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option 2: Docker Compose Deployment

```bash
docker-compose up --build -d
```

- **PostgreSQL Container:** `port 5432`
- **Backend Container:** `http://localhost:8000`
- **Frontend Container:** `http://localhost:3000`

---

## 🔐 Seed Accounts & Test Credentials

On system startup, the database is automatically populated with departments, holidays, office geofence rules, and default test profiles:

| Account Type | Email Address | Password | Employee ID | Role |
| :--- | :--- | :--- | :--- | :--- |
| **System Admin** | `admin@company.com` | `adminpassword` | `EMP000` | Admin (Owner) |
| **Employee** | `employee@company.com` | `employeepassword` | `EMP001` | Employee |

*Testing preset buttons are available on the `/login` screen to autofill these credentials instantly.*

---

## 📡 Primary API Endpoints

- **`/api/auth`**
  - `POST /login` - Sign in and receive HTTP-only cookie tokens
  - `POST /refresh` - Cycle expired access tokens using refresh session cookies
  - `POST /logout` - Clear cookies and terminate session
  - `GET /me` - Get profile metadata
  - `POST /change-password` - Update current credentials
- **`/api/employees`**
  - `GET /` - List employee profiles (Admin)
  - `POST /` - Register new employee profile & user (Admin)
  - `PUT /{id}` - Update employee profile details
  - `PATCH /{id}/toggle-status` - Activate/deactivate accounts
  - `POST /{id}/reset-password` - Admin reset key
  - `POST /{id}/upload-avatar` - Upload profile image
- **`/api/attendance`**
  - `POST /clock-in` - Punch shift start (requires Geolocation latitude/longitude payload)
  - `POST /clock-out` - Punch shift end and compute working hours/breaks
  - `POST /break/start` - Initiate break session
  - `POST /break/end` - Resume shift
  - `GET /history` - List attendance records (Filtered)
  - `GET /corrections` - List correction requests
  - `PATCH /corrections/{id}/review` - Approve or reject attendance corrections
- **`/api/leaves`**
  - `POST /` - Apply for leave (performs balance checks and overlap validation)
  - `GET /` - List leaves (Filtered)
  - `PATCH /{id}/review` - Approve or reject leave requests (Admin)
- **`/api/settings`**
  - `GET /office` - Read geolocation and shift settings
  - `PUT /office` - Update coordinates, radius, weekends, and work hours
  - `GET /holidays` - List holidays
  - `POST /holidays` - Register public holiday
  - `DELETE /holidays/{id}` - Remove holiday
- **`/api/dashboard`**
  - `GET /admin` - Summary cards, turnout rates, Action Center, daily & monthly charts
  - `GET /employee` - Today's clock parameters, break status, leave balances
- **`/api/reports`**
  - `GET /summary` - Summary data grid
  - `GET /export/csv` - Export CSV stream
  - `GET /export/excel` - Export Excel file
  - `GET /export/pdf` - Export PDF document

---

## 🛡️ Security Implementation

- **JWT Cookie Auth:** JWT tokens are strictly isolated in HTTP-Only, Lax SameSite cookies.
- **Role-Based Access Control (RBAC):** Route verification in FastAPI endpoints and page-level guards in Next.js.
- **Geofenced Verification:** Shift starts are checked using the **Haversine great-circle formula** on the server.
- **Security Headers:** Custom middlewares inject `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and CSP policy directives.
- **Rate Limiting:** Restricted endpoint limits managed via `slowapi` decorators.
- **SQL Injection Safeguards:** SQLAlchemy ORM compiles parameterized query formats to prevent database injections.
- **Audit Trails:** Session actions write detailed audit records in the database.
