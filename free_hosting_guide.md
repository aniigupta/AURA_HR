# AuraWork / AuraHR - 100% Free Cloud Hosting Guide

> [!TIP]
> **Zero Cost Setup:** This guide details how to deploy the full **AuraWork HRMS SaaS platform** permanently on free-tier cloud infrastructure with zero credit card charges required for basic usage.

---

## 🏗️ Architecture & Free Tier Stack

```
                        ┌────────────────────────────────────────┐
                        │      Cloudflare DNS / Free SSL         │
                        └───────────────────┬────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
         ┌────────────────────────┐                   ┌────────────────────────┐
         │   Vercel (Frontend)    │  (Rewrites /api)  │  Render.com (Backend)  │
         │   Next.js 14 App       │ ────────────────► │  FastAPI Web Service   │
         │   (Permanently Free)   │                   │  (Docker Free Plan)    │
         └────────────────────────┘                   └───────────┬────────────┘
                                                                  │
                       ┌───────────────────┬──────────────────────┴──────────────────────┐
                       ▼                   ▼                                             ▼
            ┌───────────────────┐ ┌─────────────────┐                          ┌──────────────────┐
            │ Supabase / Neon   │ │ Upstash (Opt.)  │                          │  Cloudflare R2   │
            │ PostgreSQL (Free) │ │ Redis (Free)    │                          │  S3 (10GB Free)  │
            └───────────────────┘ └─────────────────┘                          └──────────────────┘
```

| Component | Free Provider | Free Tier Allowance | Purpose |
| :--- | :--- | :--- | :--- |
| **Database** | [Supabase](https://supabase.com) | 500 MB Postgres 15, automated backups | Primary relational database |
| **Backend API** | [Render](https://render.com) | 512 MB RAM Web Service (Docker) | FastAPI REST API engine |
| **Frontend Portal** | [Vercel](https://vercel.com) | 100 GB Bandwidth, automated SSL | Next.js 14 Web Application |
| **Object Storage** | [Cloudflare R2](https://cloudflare.com) | 10 GB storage, $0 egress fees | Webcam selfies, employee avatars |
| **Transactional Email** | [Resend](https://resend.com) | 3,000 emails / month | Password resets, leave notifications |
| **Rate Limit / Cache** | In-Memory / [Upstash](https://upstash.com) | 10,000 commands / day | Login protection and rate limiting |

---

## 📋 Step-by-Step Deployment Instructions

### Step 1: Set Up Free PostgreSQL Database (Supabase)

1. Sign up on [supabase.com](https://supabase.com) and click **New Project**.
2. Set the project name: `AuraWork`, choose a secure Database Password, and select the region closest to you.
3. Once the database is provisioned, click the **Connect** button (or go to **Project Settings > Database**).
4. Under **Connection String**, select **URI** (choose **Session Pooler** on port `5432` or **Direct**).
5. Copy the connection string. It will look like:
   ```text
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```
   *(Replace `[YOUR-PASSWORD]` with your actual Supabase database password).*

---

### Step 2: Set Up Free Object Storage (Cloudflare R2)

1. Sign up on [cloudflare.com](https://cloudflare.com) and navigate to **R2 Object Storage**.
2. Click **Create Bucket** and name it `aurawork-uploads`.
3. In the R2 Dashboard, click **Manage R2 API Tokens** > **Create API Token**.
4. Set permissions to **Object Read & Write**, then click **Create API Token**.
5. Save the generated credentials:
   * **S3_BUCKET:** `aurawork-uploads`
   * **S3_ACCESS_KEY:** `<Access Key ID>`
   * **S3_SECRET_KEY:** `<Secret Access Key>`
   * **S3_ENDPOINT:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   * **S3_REGION:** `auto`

*(Note: If you skip S3 credentials, the app safely falls back to local storage automatically).*

---

### Step 3: Set Up Free Email Service (Resend)

1. Sign up on [resend.com](https://resend.com).
2. Navigate to **API Keys** > **Create API Key** (Full Access).
3. Save the SMTP credentials:
   * **SMTP_HOST:** `smtp.resend.com`
   * **SMTP_PORT:** `587`
   * **SMTP_USERNAME:** `resend`
   * **SMTP_PASSWORD:** `<Your Resend API Key>`
   * **SMTP_FROM:** `onboarding@resend.dev` *(or your verified custom domain)*

---

### Step 4: Deploy FastAPI Backend (Render.com)

You can deploy using Render's Blueprint or manually:

#### Option A: Quick Blueprint Deploy (Recommended)
The repository includes a [render.yaml](file:///f:/log/render.yaml) file at the root.
1. Sign up on [render.com](https://render.com) and connect your GitHub/GitLab repository.
2. Click **New +** > **Blueprint**.
3. Select your `AURA_HR` repository.
4. Render will parse [render.yaml](file:///f:/log/render.yaml) and prompt you for the environment variables:
   * `DATABASE_URL`: *(Your Supabase connection string from Step 1)*
   * `ALLOWED_ORIGINS`: `*` *(or your Vercel URL once Step 5 is created)*
   * `AUTO_SEED`: `true` *(automatically creates default Admin account and office settings on first boot)*
   * `S3_*` & `SMTP_*`: *(Values from Steps 2 and 3)*
5. Click **Apply**.

#### Option B: Manual Web Service Setup
1. On Render, click **New +** > **Web Service**.
2. Select your repository.
3. Configure settings:
   * **Name:** `aurawork-backend`
   * **Root Directory:** `backend`
   * **Runtime:** `Docker`
   * **Instance Type:** `Free`
   * **Health Check Path:** `/health`
4. Under **Environment Variables**, add:
   * `ENVIRONMENT` = `production`
   * `DATABASE_URL` = `postgresql://postgres...` *(from Step 1)*
   * `SECRET_KEY` = *(Click Generate or enter a 64-character random string)*
   * `ALLOWED_ORIGINS` = `https://your-frontend.vercel.app`
   * `AUTO_SEED` = `true`
   * `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_REGION`
   * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`
5. Click **Create Web Service**.
6. Copy your backend URL (e.g., `https://aurawork-backend.onrender.com`).

---

### Step 5: Deploy Frontend Portal (Vercel)

1. Sign up on [vercel.com](https://vercel.com).
2. Click **Add New...** > **Project** and import your Git repository.
3. In the project configuration screen:
   * **Root Directory:** Click **Edit** and choose `frontend`.
   * **Framework Preset:** `Next.js` (detected automatically).
4. Under **Environment Variables**, add:
   * `BACKEND_URL` = `https://aurawork-backend.onrender.com` *(Your Render URL from Step 4)*
5. Click **Deploy**.
6. Copy your production Vercel URL (e.g., `https://aurawork-portal.vercel.app`).
7. **Important:** Go back to Render > **Environment Variables** and update `ALLOWED_ORIGINS` to match your Vercel URL (e.g. `https://aurawork-portal.vercel.app`).

---

## 🔑 Initial Admin Login & Verification

Because `AUTO_SEED=true` was set, the initial database will be seeded with default credentials on first startup:

| Account Role | Email | Default Password |
| :--- | :--- | :--- |
| **System Admin** | `admin@company.com` | `adminpassword` |
| **Employee (Demo 1)** | `employee@company.com` | `employeepassword` |
| **Employee (Demo 2)** | `amit.verma@company.com` | `employeepassword` |

> [!IMPORTANT]
> Immediately upon your first login, navigate to **Admin > Workforce Directory** or **Profile** to update the default passwords and set `AUTO_SEED=false` in your Render environment variables.

---

## 💡 Keeping the Free Backend Active (Preventing Spin-Down)

Render's free tier spins down inactive web services after 15 minutes of inactivity (causing a 30–50s cold start on the next request).

**How to keep it 100% active for free:**
1. Sign up for a free account at [uptimerobot.com](https://uptimerobot.com) or [cron-job.org](https://cron-job.org).
2. Add a new **HTTP(s) Monitor**:
   * **URL:** `https://aurawork-backend.onrender.com/health`
   * **Interval:** Every 10 or 14 minutes.
3. This periodically pings the lightweight `/health` endpoint, keeping your free backend warm and eliminating cold start delays for users!
