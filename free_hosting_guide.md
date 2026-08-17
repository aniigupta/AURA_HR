# AuraWork - Free Hosting Guide

> [!NOTE]
> **Status:** To be configured by the user at a later date. This document serves as the guide for setting up free-tier production hosting.

This document outlines the step-by-step procedure to deploy the AuraWork Employee Attendance portal using permanently free-tier cloud services.

---

## 🏗️ Architecture Mapping

*   **Database:** Supabase (PostgreSQL 15)
*   **Backend API:** Render.com (FastAPI Web Service via Docker)
*   **Frontend Client:** Vercel (Next.js Application)
*   **Object Storage (Avatars):** Cloudflare R2 (S3-compatible)
*   **SMTP Emails:** Resend (Transactional SMTP)

---

## 📋 Step-by-Step Setup Instructions

### 1. Database (Supabase)
1. Sign up on [supabase.com](https://supabase.com).
2. Create a new project named `AuraWork`.
3. Navigate to **Project Settings > Database > Connection string** and select the **URI** format.
4. Save this URI for backend configuration (`DATABASE_URL`). It will look like:
   `postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres`

### 2. File Storage (Cloudflare R2)
1. Sign up on [cloudflare.com](https://cloudflare.com).
2. Go to **R2 Object Storage** and create a bucket named `aurawork-uploads`.
3. Create API credentials with **Read & Write** access.
4. Save the S3 parameters for backend configuration:
   *   `S3_BUCKET`: `aurawork-uploads`
   *   `S3_ACCESS_KEY`: `<R2 Access Key>`
   *   `S3_SECRET_KEY`: `<R2 Secret Key>`
   *   `S3_ENDPOINT`: `https://<account_id>.r2.cloudflarestorage.com`
   *   `S3_REGION`: `auto`

### 3. Transactional Emails (Resend)
1. Sign up on [resend.com](https://resend.com).
2. Go to the **SMTP** settings tab and generate an API key.
3. Save the SMTP credentials for backend configuration:
   *   `SMTP_HOST`: `smtp.resend.com`
   *   `SMTP_PORT`: `587`
   *   `SMTP_USERNAME`: `resend`
   *   `SMTP_PASSWORD`: `<Resend API Key>`
   *   `SMTP_FROM`: `onboarding@resend.dev` *(Or your verified domain)*

### 4. Backend API Deployment (Render.com)
1. Sign up on [render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Link your Git repository.
4. In the settings, configure:
   *   **Root Directory:** `backend`
   *   **Runtime:** `Docker` *(It will automatically parse the Dockerfile)*
   *   **Instance Type:** `Free`
5. Under **Environment Variables**, add:
   *   `DATABASE_URL` = *(Your Supabase connection string)*
   *   `SECRET_KEY` = *(Generate a secure random secret)*
   *   `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_REGION` = *(R2 credentials from Step 2)*
   *   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` = *(Resend credentials from Step 3)*
   *   `ALLOWED_ORIGINS` = `https://your-frontend.vercel.app` *(Copy this from Vercel once Step 5 is done)*
6. Deploy the service and copy the provided Render URL (e.g. `https://aurawork-backend.onrender.com`).

### 5. Frontend Portal Deployment (Vercel)
1. Sign up on [vercel.com](https://vercel.com).
2. Click **Add New** and choose **Project**.
3. Import your Git repository.
4. Configure the project:
   *   **Root Directory:** `frontend`
   *   **Framework Preset:** `Next.js`
5. Under **Environment Variables**, add:
   *   `BACKEND_URL` = `https://your-backend.onrender.com` *(Your Render backend URL from Step 4)*
6. Deploy! Copy the Vercel URL and add it to the `ALLOWED_ORIGINS` environment variable in your Render backend settings.
