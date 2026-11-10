# CICR Inventory Hub — Agent Engineering Guidelines

**Creative & Innovative Cell in Robotics — System Architecture & AI Coding Protocol**

This operational document specifies the architectural conventions, domain rules, security guards, and engineering constraints for autonomous coding agents operating on the CICR Inventory Hub repository.

---

## 1. Project Mission & Institutional Context

CICR Inventory Hub is the official digital hardware vault for the **Creative & Innovative Cell in Robotics (CICR)** at **Jaypee Institute of Information Technology (JIIT), Sector 128, Noida**.

The platform is designed to:
- Monitor and allocate 172+ physical robotics laboratory assets across five distinct bays.
- Enforce strict administrative clearance before hardware components can be issued or collected.
- Maintain real-time inventory tracking, active loan audits, and 7-day telemetry logs.
- Provide high-contrast, dual-theme accessibility (Cyber Dark and Clean Light) on both mobile and desktop viewports.

---

## 2. Technology Stack & Core Dependencies

| Component | Technology | Version | Purpose |
|:---|:---|:---|:---|
| **Frontend Framework** | React | `^18.3.1` | Component-based reactive UI |
| **Language** | TypeScript | `^5.7.3` | Type safety and domain modeling |
| **Bundler & Dev Server** | Vite | `^6.2.0` | Ultra-fast HMR and production building |
| **Styling & CSS** | Tailwind CSS | `^3.4.17` | Utility-first styling with cyber tokens |
| **Icons & VFX** | Lucide React | `^0.477.0` | SVG icons and visual telemetry indicators |
| **Animation Engine** | Framer Motion | `^14.9.0` | Fluid state transitions |
| **Primary Cloud Database** | Supabase | `@supabase/supabase-js ^2.49.1` | PostgreSQL 15, Auth, and Realtime Engine |
| **Secondary Backup Mirror** | Neon PostgreSQL | Serverless | Secondary failover database |
| **Production Hosting** | Vercel | Edge Network | SPA client hosting and API proxy |

---

## 3. Directory Blueprint & Module Ownership

```text
src/
├── components/
│   ├── auth/               # Authentication modals, LoginForm, SignupForm
│   ├── common/             # CicrLogo, Toast, Badge
│   ├── dashboard/          # TopNavbar, DashboardOverview, ComponentVaultView,
│   │                       # RequisitionsView, AdminHubView, MeetTheDevelopers,
│   │                       # OperatorProfileView, CategoryDistribution, StatsOverview
│   ├── inventory/          # AddEditItemModal, ItemDetailModal, RequestCartModal
│   ├── layout/             # BottomNavbar, AppSidebar, SchemaNoticeModal
│   ├── profile/            # ChangePasswordModal, UserProfile
│   ├── requests/           # Requisition queues and clearance cards
│   └── ui/                 # airport-matrix-clock, liquid-toggle, notification-bell
├── context/
│   ├── AuthContext.tsx     # Institutional auth, DB RBAC verification, session hydration
│   └── InventoryContext.tsx# Realtime broadcast sync, 172-item CRUD, borrow & return dispatches
├── lib/
│   ├── supabase.ts         # Environment driven Supabase client initialization
│   ├── sampleData.ts       # 172 authentic robotics hardware components
│   └── theme/              # useTheme hook (dark / light persistence)
├── types/
│   └── inventory.ts        # TypeScript domain definitions
├── App.tsx                 # Root router, ErrorBoundary, branded pulse loader
├── index.css               # Tailwind directives & theme variables
└── main.tsx                # React DOM mounting
```

---

## 4. Security & Role-Based Access Control (RBAC)

### Database Verified Administrator Governance
Administrative privileges are governed strictly by `public.profiles` (`role = 'admin'` and `status = 'approved'`):
* Zero hardcoded admin or auto approval email lists may exist anywhere in frontend code, serverless APIs, utility scripts, or database triggers.
* Legacy `lead` roles do not grant administrative privileges; only existing DB approved administrators (`role = 'admin'` and `status = 'approved'`) can approve accounts, promote/demote roles, mutate `inventory_items`, or approve, reject, mark returned, decline returns, or delete `borrow_requests` (enforced via `/api/inventory`, `/api/accounts`, RLS policies, and `SECURITY INVOKER` PostgreSQL triggers).
* Self role promotion, self demotion, and demoting the last remaining approved administrator are strictly prohibited by API guards and database triggers.

### Institutional Email Format
Student self registration requires valid institutional emails:
* Pattern: `*@mail.jiit.ac.in`
* If a user inputs an enrollment number without `@`, the system automatically appends `@mail.jiit.ac.in`.

### Registration Clearance Pipeline
1. All newly registered accounts unconditionally receive `status: 'pending'` and `role: 'member'`.
2. Pending accounts **cannot sign in or request hardware** until an existing DB approved administrator explicitly authorizes their registration in the Admin Control Center (`AdminHubView`).
3. New administrators are appointed solely through post approval role promotion by an existing approved administrator.

---

## 5. Hardware Vault Business Rules

### Catalog & Categories
The inventory tracks 172 authentic components organized into five categories:
1. `Microcontrollers` (Arduino, ESP32, ESP8266, Raspberry Pi, STM32, Teensy)
2. `Sensors` (Ultrasonic, Gyro, LiDAR, PIR, Color, Load Cells, GPS)
3. `Actuators` (NEMA Steppers, Servos, DC Motors, Motor Drivers)
4. `Power` (LiPo Batteries, Buck Converters, Adapters, Charging Shields)
5. `Tools` (Multimeters, Soldering Kits, Logic Analyzers, Probes)

### Stock Reserve Computation
- **In Stock**: `available_qty >= (total_qty * 0.5)`
- **Low Reserves**: `available_qty < (total_qty * 0.5) && available_qty > 0`
  - Triggers pulse warning pill in `TopNavbar` and card badges **exclusively for administrators**.
- **Depleted**: `available_qty === 0`
- **Legacy Threshold Rule**: "Min Threshold" and "Min Alert Qty" have been completely removed. Do not re-introduce threshold metrics.

### Requisition Clearance Workflow
1. **Submit**: Member selects item, specifies quantity (must be positive integer $\ge 1$), project name, purpose, and expected return date.
2. **Clearance Gate**: Item status is set to `pending`. Available stock is reserved, but the component **cannot be physically issued** without administrator approval.
3. **Approval**: Admin reviews requisition, specifies locker/rack collection instructions, and grants clearance (`status: 'approved'`).
4. **Return**: Borrower dispatches a return request. Admin physically inspects the returned hardware and marks the request as `returned`, restoring stock to physical inventory.

---

## 6. UI/UX & Theme Fidelity Rules

### Dual Themes
- **Cyber Dark**: Background `#07070a`, surface `#0f0f16`, border `#20202c`, accent purple/blue, text `#ffffff`.
- **Clean Light**: Background `#f8fafc`, surface `#ffffff`, border `#e2e8f0`, accent blue `#2563eb`, text `#0f172a`.

### Design System Invariants
- **No Text Hover Disappearance**: Text color transitions must never match or fade into their container background.
- **Solid Overlays**: Notifications, modal dialogs, and table dropdowns must use solid backgrounds (e.g. `bg-white dark:bg-[#0c0918]`) to prevent transparency bleed-through.
- **Top Navbar Cart**: The `Request Cart` button in `TopNavbar` is strictly rendered **only** when `activeView === 'inventory'`.
- **2-Box Locked Profile**: Operator Profile must display two side-by-side modules:
  - Left Box: Avatar, full name, role badge, bio.
  - Right Box: Locked, immutable fields for Email, Enrollment Number, and Contact Number.
- **Zero White Screens**: `AppContent` must always be wrapped in `ErrorBoundary`, and cold starts must display the branded pulse loader rather than an empty blank viewport.

---

## 7. Roster & Guidance Credits

The platform officially recognizes four team members:
- **Gunjan Pal** — Project Mentor & Technical Advisor
- **Vardaan Saxena** — Lead Full-Stack Developer & System Architect
- **Samiksha Jhunjhunwala** — Frontend & UI Specialist
- **Mohammad Arsh** — Hardware Systems & Robotics Developer

**Agent Rule**: Do not modify, remove, or substitute these four members in any showcase, team carousel, or documentation file.

---

## 8. Verification & Build Protocol

Before submitting any code changes or releasing new version tags:

1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
2. **Vite Production Build**:
   ```bash
   npm run build
   ```
   Ensure build completes with zero errors and outputs to `dist/`.
3. **No Unhandled Promises**: Ensure all Supabase calls contain appropriate try/catch blocks and user-friendly toast alerts.
4. **Git Synchronization**: Ensure `main` and `UI-UX-Updates` remain fast-forward merged and synchronized with remote repository tags.

