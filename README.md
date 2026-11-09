<div align="center">

<img src="./logo.png" width="90" alt="CICR Logo" />

# CICR Inventory Hub

**Creative & Innovative Cell in Robotics — Hardware Allocation & Laboratory Vault System**

Track, reserve, and deploy microcontrollers, sensors, actuators, and power electronics from JIIT's robotics laboratory vault with a modern full-stack web platform: **React 18 + TypeScript + Vite**, **Tailwind CSS**, **Supabase (PostgreSQL)** real-time engine, **Neon PostgreSQL** secondary backup failover, **Dual Superadmin Security**, and **Real-Time Requisition Telemetry**.

[![Live Portal](https://img.shields.io/badge/LIVE-inventory.cicr.in-00f0ff?style=for-the-badge&logo=vercel&logoColor=white)](https://inventory.cicr.in/)
[![GitHub Repo](https://img.shields.io/badge/GITHUB-cicr__inventory_-bd00ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/simplyvardaan/cicr_inventory_)
[![Database](https://img.shields.io/badge/DATABASE-Supabase%20PostgreSQL-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Secondary Mirror](https://img.shields.io/badge/SECONDARY-Neon%20PostgreSQL-00e599?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech)

</div>

---

## Table of Contents

- [System Overview](#system-overview)
- [System Architecture](#system-architecture)
- [Core Features & Platform Capabilities](#core-features--platform-capabilities)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Getting Started & Local Setup](#getting-started--local-setup)
- [Environment Variables](#environment-variables)
- [Production Deployment](#production-deployment)
- [Documentation & Deep Dive Specifications](#documentation--deep-dive-specifications)
- [Mentors & Core Team](#mentors--core-team)

---

## System Overview

CICR Inventory Hub is the official digital hardware vault for the Creative & Innovative Cell in Robotics (CICR) at Jaypee Institute of Information Technology (JIIT), Sector 128, Noida. The platform manages the entire lifecycle of laboratory equipment, including inventory tracking, student hardware loan requisitions, administrative clearance verification, return logging, and activity audits across 172+ physical assets.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Vite + React 18 SPA)"]
        UI["Modern UI / UX Engine"]
        TopNav["Floating Top Navbar & Theme Toggle"]
        Vault["Component Vault & Request Cart"]
        Clearance["Requisition Clearance Portal"]
        AdminHub["Admin Control Center & 7-Day Audit"]
        TeamShowcase["macOS Window Team Showcase"]
        ClockHUD["Airport Matrix Live 24h Clock"]
    end

    subgraph State["Reactive Context Layer"]
        AuthCtx["AuthContext (Dual Superadmin Guard)"]
        InvCtx["InventoryContext (Auto-Sync 1.5s)"]
        ThemeCtx["ThemeContext (Dark #07070a / Light #f8fafc)"]
        ToastCtx["ToastContext (Real-Time Feedback)"]
    end

    subgraph Cloud["Primary Cloud Database (Supabase)"]
        AuthService["Supabase Auth Service"]
        ProfilesTable["profiles (Role & Identity)"]
        InventoryTable["inventory_items (172+ Lab Assets)"]
        BorrowTable["borrow_requests (Requisition Flow)"]
        LogsTable["activity_logs (7-Day Telemetry)"]
    end

    subgraph Secondary["Secondary Database Redundancy (Neon)"]
        NeonDB["Neon PostgreSQL (Automated 15-min Mirror)"]
        BackupScripts["Backup & Sync Workflows"]
    end

    subgraph CDN["Production Edge Hosting"]
        Vercel["Vercel Edge Network (SPA Routing & Proxy)"]
    end

    Client --> State
    State --> Cloud
    Cloud -.-> BackupScripts -.-> Secondary
    Client --> Vercel
```

---

## Core Features & Platform Capabilities

### 1. Dual Superadmin & Institutional Authentication Guard
- **Master Admin Whitelist**: Master administrative privileges are strictly locked to verified institutional superadmins:
  - `vardaansaxena096@gmail.com`
  - `cicrinventory@gmail.com`
- **Institutional Email Validation**: Student self-registration requires valid institutional email accounts (`@mail.jiit.ac.in`).
- **Account Clearance Gate**: New member accounts enter `pending` verification status; members cannot request hardware until an administrator authorizes their profile.
- **Cold-Start Resilient Session Hydration**: Synchronous session hydration from `localStorage` eliminates page-refresh authentication blinks.
- **Zero Stuck Authentication**: Dedicated local form submission state prevents login buttons from hanging on "Authenticating...".

### 2. Multi-Tier Requisition Clearance Portal
- **Admin Clearance Gate**: Members stage hardware requisitions; components cannot be issued or collected without verified administrative approval.
- **Interactive Action Presets**: Administrators can approve requisitions with collection instructions (locker bay, rack location) or reject with explanatory feedback.
- **Hardware Return Workflow**: Borrowers return issued items; returned hardware is physically inspected and verified by administrators before inventory capacity is restored.
- **Optimistic 1.5-Second Auto-Sync**: Background polling ensures newly approved or returned hardware reflects across all active devices in 1-2 seconds without manual page refreshes.

### 3. Component Vault (172+ Robotics Hardware Assets)
- **Comprehensive Laboratory Inventory**: 172 real robotics components categorized across five hardware bays:
  - **Microcontrollers & SBCs**: Arduino Uno/Mega/Nano, ESP32, ESP8266, Raspberry Pi 4/Zero, STM32 Nucleo, Teensy 4.1.
  - **Sensors & Modules**: Ultrasonic HC-SR04, PIR Motion, MPU-6050 Gyro, LiDAR TF-Luna, GPS NEO-6M, Color TCS3200, Load Cells.
  - **Actuators & Motors**: NEMA 17 Steppers, MG996R Servos, 12V High-Torque DC Motors, TB6600 Drivers, L298N Modules.
  - **Power & Energy**: 3S LiPo 2200mAh, Step-Down Buck Converters (LM2596), 18650 Battery Shields, 12V 5A Industrial Adapters.
  - **Tools & Equipment**: Digital Multimeters, TS100 Soldering Kits, Logic Analyzers, Jumper Bundles, Breadboard Workbenches.
- **Standardized Reserve Logic**:
  - **In Stock**: Available quantity greater than or equal to 50% of total allocation.
  - **Low Reserves**: Available quantity strictly less than 50% and greater than 0 (triggers warning indicator exclusively for administrators).
  - **Depleted**: Available quantity equals 0.
- **Removed "Min Threshold"**: Eliminated ambiguous threshold metrics; stock health is directly and transparently computed from live physical counts.

### 4. Scoped Request Cart
- **Inventory-Only Visibility**: The Request Cart button in the top navbar is strictly and exclusively rendered when viewing the Component Vault inventory page.
- **Real-Time Badge Telemetry**: Displays the current staging count with live badge updates.
- **Multi-Item Loan Requests**: Stage multiple hardware items and dispatch a unified loan request with project title, purpose, and return timeline.

### 5. macOS Window Team Showcase
- **macOS Window Frame**: Window title bar with colored traffic light controls (`#ff5f56`, `#ffbd2e`, `#27c93f`), file moniker (`~/[filename]`), and role tag.
- **Role Hierarchy**:
  - **Mentor**: **Gunjan Pal** — Project Mentor & Technical Advisor
  - **Developers**: **Vardaan Saxena**, **Samiksha Jhunjhunwala**, **Mohammad Arsh**
- **Dynamic Role Filter Tabs**: Switch seamlessly between `All Members (4)`, `Mentor (1)`, and `Developers (3)`.
- **Radiant Gradient Glow Ring**: Highlights the active member with amber (Mentor) or purple/blue (Developer) glows.
- **Verified Social Badges**: Touch-friendly, high-contrast action pills for LinkedIn, GitHub, and personal portfolio.

### 6. Live Airport Matrix Clock HUD
- **Real-Time 24h Departures Cockpit**: Mechanical split-flap matrix clock displaying New Delhi (IST) local time with live seconds update.
- **Ambient Greeting**: Dynamic greeting ("Good morning", "Good afternoon", "Good evening") customized to the operator's verified name.

### 7. Dual Theme Engine (LiquidToggle)
- **Deep Cyber Dark Mode**: `#07070a` deep obsidian background, neon purple accents, emerald stock badges, and crisp white typography.
- **Crisp Light Mode**: `#f8fafc` soft slate background, royal blue accents, high-contrast black headers, and dark emerald indicators.
- **Zero Transparency Bleed**: Solid notification panels, modals, and tables eliminating visual clipping.

---

## Tech Stack

| Layer | Technologies |
|:---|:---|
| **Frontend Framework** | React 18, TypeScript, Vite 6 |
| **Styling & Design** | Tailwind CSS 3, Custom Cyberpunk CSS Tokens, Lucide React Icons |
| **Animation & VFX** | Framer Motion, CSS Keyframe Animations |
| **Primary Database & Auth** | Supabase (PostgreSQL 15), Supabase Auth, Row-Level Security (RLS) |
| **Secondary Backup Mirror** | Neon Serverless PostgreSQL (Automated 15-min failover scripts) |
| **Session & State Management** | React Context (Auth, Inventory, Theme, Toast), Synchronous LocalStorage Hydration |
| **Deployment & Hosting** | Vercel (Edge SPA Routing, API Rewrites, SSL) |

---

## Repository Structure

```text
cicr_inventory_/
├── public/                     # Static production assets
│   ├── cicr-logo.jpg           # Official CICR crest
│   ├── logo.png                # Transparent GitHub logo
│   └── images/team/            # Roster photographs (gunjan, vardaan, samiksha, arsh)
├── src/
│   ├── assets/                 # Component assets & icons
│   ├── components/
│   │   ├── auth/               # LoginForm, SignupForm, AuthModal
│   │   ├── common/             # CicrLogo, Toast, Badge
│   │   ├── dashboard/          # TopNavbar, DashboardOverview, ComponentVaultView,
│   │   │                       # RequisitionsView, AdminHubView, MeetTheDevelopers,
│   │   │                       # CategoryDistribution, StatsOverview
│   │   ├── inventory/          # AddEditItemModal, ItemDetailModal, RequestCartModal
│   │   ├── layout/             # BottomNavbar, AppSidebar, SchemaNoticeModal
│   │   ├── profile/            # ChangePasswordModal, UserProfile
│   │   ├── requests/           # RequestsList (Requisition queues)
│   │   └── ui/                 # airport-matrix-clock, liquid-toggle, notification-bell
│   ├── context/
│   │   ├── AuthContext.tsx     # Institutional auth, superadmin whitelist, session hydration
│   │   └── InventoryContext.tsx# 1.5s auto-sync, 172-item CRUD, borrow & return dispatches
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client + admin service-role key fallbacks
│   │   ├── sampleData.ts       # 172 authentic robotics hardware components
│   │   └── theme/              # useTheme hook (dark / light persistence)
│   ├── types/
│   │   └── inventory.ts        # TypeScript interfaces (InventoryItem, BorrowRequest, etc.)
│   ├── App.tsx                 # Root router, ErrorBoundary, branded pulse loader
│   ├── index.css               # Tailwind directives & theme variables
│   └── main.tsx                # React DOM mounting
├── scripts/
│   ├── backup_to_neon.cjs      # Scheduled secondary PostgreSQL backup mirror
│   └── initialize_neon.cjs     # Neon DB schema initialization
├── AGENT.md                    # AI agent guidelines, constraints & system protocols
├── CHANGELOG.md                # Official Semantic Versioning release notes
├── DEEPDIVE.md                 # Technical deep dive, telemetry logs & version registry
├── LICENSE                     # MIT License (Copyright 2026 CICR)
├── package.json                # Project dependencies & npm scripts (v2.18.4)
├── README.md                   # System documentation & architectural reference
├── SECURITY.md                 # Security assessment & penetration test report
├── tailwind.config.js          # Tailwind custom palette & animations
├── tsconfig.json               # TypeScript compiler configuration
├── vercel.json                 # Vercel SPA routing & API proxy rules
└── vite.config.ts              # Vite bundle configuration
```

---

## Getting Started & Local Setup

### Prerequisites
- Node.js: `>= 18.0.0`
- npm or pnpm
- Git

### Installation
```bash
# 1. Clone repository
git clone https://github.com/simplyvardaan/cicr_inventory_.git
cd cicr_inventory_

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Start local development server
npm run dev
```

Visit `http://localhost:3000` (or `http://localhost:5173`) in your browser.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Supabase Configuration
SUPABASE_URL=https://nmwkljtaymujqnmzgyxn.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEON_DATABASE_URL=postgresql://user:password@ep-example.neon.tech/neondb?sslmode=require
```

`NEON_DATABASE_URL`, `SUPABASE_DB_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are
server-side only. They must not be included in frontend deployment variables.
`SUPABASE_DB_URL` is the direct Supabase Postgres connection string used to copy
the existing `auth.users.encrypted_password` hashes without exposing them.

The browser always sends database requests through `/api/db`. The gateway tries
Supabase first and automatically uses the mirrored Neon tables when Supabase
times out or returns a server error. Use the deployed Vercel app (or `vercel dev`)
to run the gateway; plain `npm run dev` only serves the frontend and cannot run
the server-side Neon fallback.

### 4. Configure the Neon backup

Create a Neon PostgreSQL database and run [`neon_backup_schema.sql`](./neon_backup_schema.sql)
once in the Neon SQL editor. Then run the backup from a trusted server, CI job, or
scheduled worker:

```bash
npm run neon:init
npm run backup:neon
```

The GitHub Actions workflow at
[`.github/workflows/backup.yml`](./.github/workflows/backup.yml) runs this mirror
automatically every 15 minutes. Add `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `NEON_DATABASE_URL` as repository secrets under
**Settings → Secrets and variables → Actions**. You can also run it immediately
from the repository's **Actions** tab.

`neon:init` creates the operational Neon tables from
[`neon_schema.sql`](./neon_schema.sql). Run [`supabase_schema.sql`](./supabase_schema.sql)
in the Supabase SQL Editor to create the matching Supabase tables. The schema is
safe to rerun because existing RLS policies are replaced. The Supabase
REST API cannot execute schema DDL using an anon or service-role key.
If an existing Supabase project reports that `profiles.status` is missing, rerun
[`supabase_schema.sql`](./supabase_schema.sql) in the SQL Editor and refresh the
PostgREST schema cache; account approval workflows require this column.

The command performs a one-way Supabase-to-Neon mirror for profiles, inventoryitems, borrow requests, activity logs, and authentication metadata.
It replaces each mirrored table's backup snapshot atomically and records each run
in `backup_runs`. Plaintext passwords, access tokens, and session data are never copied.
The mirror reads `auth.users.encrypted_password` through `SUPABASE_DB_URL` and
stores it as `password_hash`, allowing the same password to be verified during
failover. Without `SUPABASE_DB_URL`, the Supabase API cannot provide password
hashes and users are marked `password_reset_required`.

### Database failover gateway

Browser database requests now pass through `/api/db`. The Vercel function tries
Supabase first and routes database reads and writes to Neon when Supabase has a
network or server failure. Configure `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEON_DATABASE_URL` as
Vercel environment variables. Supabase Auth remains primary, so login and signup are
not available if Supabase Auth itself is down.

### Email notifications

Configure Google SMTP with a Gmail App Password using `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. The server endpoints
send notifications for login, logout, account registration and decisions, borrow
requests, approvals, rejections, returns, and return reminders.

`/api/reminders` is available for an external scheduler or manual invocation.
Vercel cron is intentionally not configured.


### Deployment URL & Multi Origin OAuth Redirects

Forked or mirror deployments (such as `https://inventory.cicr.in`) can connect directly to the same shared Supabase and Neon database while authenticating users back to their own domain:

1. Keep the shared database credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEON_DATABASE_URL`) identical across deployments.
2. Configure deployment URL variables in Vercel or `.env`:
   * `APP_URL`: Canonical origin used in outbound email notification buttons, Legal pages, and fallback links (defaults to `https://inventory.cicr.in`).
   * `AUTH_REDIRECT_URL`: Optional hard override for Supabase OAuth `redirectTo` and signup `emailRedirectTo`. Leave empty to normalize non local traffic onto `https://inventory.cicr.in` automatically.
   * `ALLOWED_ORIGINS`: Optional comma separated allowlist of valid custom CICR origins (for example `https://inventory.cicr.in`). Legacy `*.vercel.app` deployments automatically redirect to `https://inventory.cicr.in`.
3. In the shared **Supabase Dashboard**, open **Authentication -> URL Configuration -> Redirect URLs** and **Site URL**, set Site URL to `https://inventory.cicr.in`, and ensure `https://inventory.cicr.in`, `https://inventory.cicr.in/**`, `https://www.inventory.cicr.in`, and `https://www.inventory.cicr.in/**` are permitted.

### 5. Run Development Server
```bash
npm run dev
```
Run `npm run dev` for the full local app. It serves the Vite frontend and `/api/*` endpoints natively on `http://localhost:3000`; Vercel is not required for local development.

### 6. Production Build
```bash
npm run build
npm run preview
```

---

## Production Deployment

The platform is optimized for **zero-configuration Vercel deployment**:

1. Push your changes to the `main` branch.
2. Connect your repository to **Vercel**.
3. Vercel automatically detects the Vite configuration:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) in the Vercel project settings.
5. Production portal runs on `https://inventory.cicr.in` (and any `*.vercel.app` alias automatically redirects there).

---

## Documentation & Deep Dive Specifications

For comprehensive technical documentation, refer to the following repository guides:

- [Technical Deep Dive & System Logs](./DEEPDIVE.md) — Complete version release logs from `v1.0.0` to `v2.18.4`, Git tag registry, full PostgreSQL table schemas, 7-day audit telemetry engine, and BOTE capacity analysis.
- [AI Agent Engineering Guidelines](./AGENT.md) — Operational blueprint, design system invariants, role guards, and protocol instructions for AI coding agents.
- [Security Assessment & Penetration Test Report](./SECURITY.md) — Threat model, vulnerability audit findings, defensive patches, and responsible disclosure policy.
- [Codebase Engineering Rules & Architecture Standards](./RULES.md) — Modular architecture rules (no single-file bloat), rich explanatory comments, zero-emoji enforcement, zero-hyphen formatting, debuggability protocol, and MAJOR.MINOR.BUGS semver specification.

---

## Mentors & Core Team

### Project Mentor & Technical Advisor
* **Gunjan Pal** : Project Mentor

### Core Engineering Team
* **Vardaan Saxena**
* **Samiksha Jhunjhunwala**
* **Mohammad Arsh**

---

<div align="center">

**Copyright 2026 CICR Inventory Hub : Creative & Innovative Cell in Robotics, JIIT Noida**

[![Visit Live Platform](https://img.shields.io/badge/VISIT-VAULT-00f0ff?style=for-the-badge)](https://inventory.cicr.in/)

</div>
