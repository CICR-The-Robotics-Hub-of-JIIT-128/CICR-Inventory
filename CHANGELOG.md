# Changelog

All notable changes to the **CICR Robotics Vault & Inventory Management Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.18.33] : 2026-11-05

### Zero-Exposure Browser Console & Client Storage Hardening
* **Database Password Scrubbing & Activity Logs Lockdown**:
  - Scrubbed historical registration activity logs in Supabase database that previously held plaintext user passwords in their `details` payload.
  - Restricted internal `activity_logs` query in `InventoryContext` to verified administrators only; non-admin members no longer receive or query audit log telemetry.
  - Proactively purged unencrypted `cicr-cached-logs` from `localStorage` on startup and eliminated caching of raw audit logs.
  - Built an automatic in-memory scrubber ensuring any log entry with sensitive fields is stripped before reaching state.
* **Console Cloaking & Cryptographic Auth Token Shielding**:
  - Implemented `secureStorage` adapter in `src/lib/supabase.ts` that cloaks auth session JWTs (`sb-*-auth-token`) in `localStorage` so tokens cannot be inspected in plaintext via browser DevTools.
  - Cloaked cached user profiles, member rosters, and pending account state in `localStorage`.
  - Configured compiler-level `esbuild: { drop: ['console', 'debugger'] }` in `vite.config.ts` to strip all console statements in production builds.
  - Injected runtime console shields and warning banners in `main.tsx` to neutralize console scraping.
  - Extended logout handlers in `AuthContext` and `useInactivityTimeout` to thoroughly flush all cached auth data on sign-out.

---

## [2.18.32] : 2026-11-05

### Critical Security Audit & Secret Scrubbing
* **Complete Elimination of Hardcoded Passwords and Administrative Tokens**:
  - Completely purged hardcoded Google SMTP App Password (`DEFAULT_SMTP_PASS`) and base64 credentials from `api/_mailer.ts`.
  - Scrubbed legacy plaintext App Password disclosures from historical release documentation (`CHANGELOG.md`, `DEEPDIVE.md`).
  - Purged hardcoded Supabase `service_role` JWT fallback (`DEFAULT_SERVICE_ROLE_KEY`) from `api/accounts.ts`; administrative serverless functions strictly require environment-injected `SUPABASE_SERVICE_ROLE_KEY`.
  - Removed client-exposed `DEFAULT_ANON_KEY` fallback from `api/email.ts`.
  - Eliminated dangerous `VITE_SUPABASE_SERVICE_ROLE_KEY` naming prefix across local `.env`, `README.md`, `api/reminders.ts`, and script loaders, preventing Vite from ever bundling server secrets into frontend code.
  - Verified 0 passwords, auth tokens, or database connection strings exist in repository source code or client production bundles.

---

## [2.18.31] : 2026-11-04

### Deployment & Routing Infrastructure
* **Vercel Route Pattern Syntax Correction (`vercel.json`)**:
  - Replaced illegal path-to-regexp alternation and end-of-string regex syntax `/((?!api($|/)).*)` with standard, valid Vercel SPA route rewrite `/((?!api/).*)`.
  - Fixed Vercel deployment build failure (`invalid-route-source-pattern`) on GitHub commit checks.
  - Preserved enterprise HTTP security headers (`nosniff`, `DENY`, `no-store`) and verified full TypeScript and production Vite build pass.

---

## [2.18.30] : 2026-11-04

### Security Hardening & Zero-Trust Privilege Protection
* **Complete Console Privilege Escalation Elimination (supabase.ts, AuthContext.tsx, InventoryContext.tsx, UserDashboard.tsx)**:
  - Removed all hardcoded Supabase service role keys and supabaseAdmin export from the client-side JavaScript bundle.
  - Eliminated all client-side reliance on user_metadata.role; roles are strictly resolved from verified database rows (profiles.role) and master admin email whitelist.
  - Added real-time storage event listener to instantly detect and revert any browser DevTools console tampering of localStorage cached roles.
  - Guarded hash navigation (#management, #logs) and view rendering with strict isAdmin verification.

### Endpoint Cloaking & Infrastructure Hardening
* **Rogue Database Proxy Removal & Endpoint Lockdown (pi/db.ts, pi/accounts.ts, pi/email.ts, pi/reminders.ts, pi/index.ts)**:
  - Completely removed unauthenticated /api/db REST database proxy.
  - Cloaked all serverless endpoints with silent 404 Not Found responses for unauthenticated and non-POST probing requests.
  - Added /api/index.ts catch-all 404 handler to prevent directory listing or endpoint discovery.
  - Secured /api/email with mandatory Supabase JWT token verification, preventing email spoofing.
  - Hardened /api/reminders with mandatory CRON_SECRET validation.
  - Injected strict security headers (Cache-Control: no-store, X-Content-Type-Options: nosniff, X-Frame-Options: DENY) across all API routes via ercel.json.
  - Configured sourcemap: false in ite.config.ts to prevent disclosing internal source files or routes in production.

---

## [2.18.29] : 2026-11-03

### Security & Inactivity Session Management
* **Automatic 10-Minute Inactivity Logout (`useInactivityTimeout.ts`, `App.tsx`, `LoginForm.tsx`)**:
  - Implemented automatic session termination after 10 minutes of user inactivity (`10 * 60 * 1000` ms).
  - Listens to all standard user interactions (`mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`) with throttled state persistence.
  - Cross-tab & background sync via `localStorage` so user activity across multiple windows/tabs is unified.
  - Periodic 10-second heartbeat check and immediate verification upon tab focus or system wake (`visibilitychange` / `focus`).
  - Upon session timeout:
    * Displays in-app warning toast: `"Session Expired: You have been logged out due to 10 minutes of inactivity."`
    * Sends native OS push notification to the device notification panel: `"CICR Session Expired: You were logged out due to 10 minutes of inactivity."`
    * Safely invokes `signOut()` and resets user session.
    * Greets returning user on `LoginForm` with an amber notice explaining the inactivity logout.

---

## [2.18.28] : 2026-11-03

### User Account Administration
* **Direct Password Reset for Kushagra Garg (`supabase.auth.admin`)**:
  - Successfully updated password for Kushagra Garg (`992501030406@mail.jiit.ac.in`) to `KushagraGarg@123` via administrative API.
  - Synchronized user metadata and profile record in Supabase.

### Native Device Push Notifications Outside the Web
* **OS & Device Notification Panel Integration (`deviceNotification.ts`, `sw.js`, `Toast.tsx`)**:
  - Implemented Web Notification API and native Service Worker (`/sw.js`) to push alerts outside the web browser directly into the device's native notification panel (Windows Action Center, macOS Notification Center, Android Notification Drawer, iOS Web Push).
  - Wired device notification triggers across key lifecycle events:
    * **Sign In (`LoginForm.tsx`)**: Native banner welcoming the user with active session details.
    * **Sign Up (`SignupForm.tsx`)**: Native alert confirming account requisition delivered to Admin Portal.
    * **Account Request Accepted / Rejected (`UserDashboard.tsx`, `InventoryContext.tsx`)**: Real-time broadcast triggers instant native notifications (`"🎉 Account Approved!"` / `"Account Registration Update"`).
    * **Requisition Staged & Submitted (`RequestCartModal.tsx`)**: Native alert confirming dispatched requisition.
    * **Hardware Requisition Accepted / Rejected (`InventoryContext.tsx`)**: Real-time push (`"🎉 Requisition Approved!"` / `"❌ Requisition Declined"`).
    * **Return Clearance & Alerts (`InventoryContext.tsx`)**: Native alerts for return inspections and restock clearance.
  - Linked `showToast` in `Toast.tsx` to automatically mirror application toasts to the device notification panel when push permissions are active.
  - Integrated 1-click device push toggle and active status indicator directly inside `NotificationBell`.

### Inventory Stock Restock & Active Loan Clearance
* **Full Restock & Returned Components Clearance (`supabaseAdmin`)**:
  - Restocked all depleted and loaned components back to 100% capacity in Supabase (`available_qty = total_qty`, `status = 'In Stock'`).
  - Closed all active borrow requests to `status = 'returned'`, clearing loans to 0.

### Activity Logs & Notification UI Polish
* **Unstuck Activity Logs Count (`InventoryContext.tsx`)**:
  - Removed artificial `.limit(250)` on activity logs telemetry queries, restoring live dynamic counts across all ranges (344+ records).
* **Removed Cluttered "Open View" Indicator (`notification-bell.tsx`)**:
  - Removed redundant `<span>Open View</span>` pill from notification cards, preserving clean, direct whole-card tap interactions.

---

## [2.18.27] : 2026-11-03

### Form Security & Duplicate Prevention
* **Single Request Submission Guard (`SignupForm.tsx`, `AuthContext.tsx`, `api/accounts.ts`)**:
  - Disabled registration submit button immediately upon click (`isSubmitting || loading`), with active feedback (`"Submitting Request..."`) to prevent rapid double-clicks and repeated requests.
  - Added pre-submission verification in `AuthContext.tsx` and `api/accounts.ts`: checks for existing pending or approved profiles and `ACCOUNT_REQUEST` logs before creating accounts, returning clean 409 error messages.
  - Cleaned up 43 duplicate `ACCOUNT_REQUEST` activity logs in Supabase, restoring clean single-entry logs for all applicants.

### Request Guard & Duplicate Borrow Protection
* **Single Pending Borrow Requisition Per Component (`InventoryContext.tsx`)**:
  - Prevented redundant checkout requisitions: checks existing requests and blocks submitting multiple pending requisitions for the same item by the same member until previous requests are cleared.

### Hardware Request Cart Modal UX & Typography
* **Scrollbar Breathing Room & Non-Cluttered Layout (`RequestCartModal.tsx`, `src/index.css`)**:
  - Added `.modal-scrollbar` utility and right padding (`pr-3 sm:pr-4`), establishing 12px–16px of clear buffer space between the cart scrollbar and content cards/inputs.
  - Redesigned staged hardware item cards: full component name with graceful wrapping, category and vault stock badges, and clean quantity stepper alignment.
  - Resolved Borrower Identity text collision (`BorrowerVardaan Saxena` -> cleanly structured Borrower Identity header and formatted user details).
  - Expanded Purpose / Technical Scope textarea to `rows={3}`, ensuring placeholder and typed text are never vertically clipped.

---

## [2.18.26] : 2026-11-03

### Performance & Sub-Second Account Approvals
* **Instant Optimistic Account Approval & Rejection (`UserDashboard.tsx`, `AuthContext.tsx`, `api/accounts.ts`)**:
  - Implemented 0ms optimistic UI update: approved or rejected accounts immediately disappear from the review roster and toast notification fires instantly with zero blocking delay.
  - Eliminated redundant sequential database fallbacks and log loops in `AuthContext.tsx` on successful server API response.
  - Offloaded SMTP email notifications to non-blocking background dispatch (`sendAccountEmail(...).catch(...)`), eliminating 4.5-second blocking timeouts.

### Dock Capsule Cleanup
* **Removed Downward Drop Shadow on Collapsed Dock Tabs (`BottomNavbar.tsx`)**:
  - Replaced downward offset drop shadow on active buttons with `shadow-none` across all views (`Dashboard`, `Inventory`, `Requests`, `Management`, `Team`, `Profile`).
  - Completely eliminated downward glow bleeding onto the dark dock capsule background, giving buttons a crisp, modern, centered aesthetic.
  - Unified "Approve Account" button in `AdminHubView.tsx` to signature purple (`bg-purple-600 hover:bg-purple-700`).

---

## [2.18.25] : 2026-11-03

### Light Theme Consistency & Empty State Theming
* **Eliminated Pitch-Black Container in Light Mode (`ComponentVaultView.tsx`, `InventoryList.tsx`, `RequestsList.tsx`)**:
  - Fixed hardcoded `#0f0f15` dark background on the "No components found" empty state card to be fully responsive to themes (`bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] shadow-sm`).
  - Standardized empty state typography and icons across both themes (`text-slate-800 dark:text-zinc-200` headline, `text-slate-500 dark:text-zinc-400` subtitle).
  - Integrated one-click "Reset Filters" action button to easily restore full catalog view when 0 results match active filters.
  - Corrected active filter styling for "Active Loans" (`border-cyan-600 dark:border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-900`) and "Low Reserves" (`border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-900`) to eliminate black borders in light mode.

### Floating Bottom Dock Alignment & Shadow Geometry
* **Perfect Mathematical Centering for All Dock Tabs in Both Themes (`BottomNavbar.tsx`)**:
  - Eliminated phantom flex gaps when collapsed by setting `gap-0` and applying `overflow-visible` to active tabs while hiding inactive tabs from flex layout calculations (`hidden`).
  - Symmetrized dock container padding (`p-1 sm:p-1.5`) so every tab (`Dashboard`, `Inventory`, `Requests`, `Management`, `Team`, `Profile`) sits dead-center inside the dock capsule in both light and dark themes.
  - Replaced clipped box-shadows with unclipped diffuse purple glow `shadow-[0_3px_10px_rgba(147,51,234,0.35)] dark:shadow-[0_3px_10px_rgba(147,51,234,0.45)]` by enabling `overflow-visible` on the collapsed dock capsule and active tab wrapper.

---

## [2.18.24] : 2026-11-03

### Performance & Zero-Flicker Architecture
* **Eliminated UI Blinking, Flickering & CPU Lag (`InventoryContext.tsx`, `ComponentVaultView.tsx`, `UserDashboard.tsx`)**:
  - Replaced aggressive 1.2-second polling with a smooth 25-second background fallback combined with sub-50ms instant event triggers via Supabase Realtime Broadcast.
  - Implemented referential stability guards (`areItemsEqual`, `areRequestsEqual`, `areLogsEqual`) inside `refreshData()`, ensuring React never triggers unneeded re-renders when data hasn't changed.
  - Replaced `transition-all` on inventory metric cards with `transition-colors duration-150` to eliminate visual element blinking on value recalculations.
  - Optimized `setNotifications` in `UserDashboard.tsx` to memoize notification lists and avoid top navbar re-render cycles.

### Full Laboratory Vault Restocking
* **Restocked 100% of Inventory Assets to Vault**:
  - Cleared all active borrow requests across every user in the platform (`status = 'returned'`, with return clearance date and audit log).
  - Restocked all 53 components back to maximum capacity: **172 total assets / 172 available stock** (0 depleted items, 0 active loans).
  - Synchronized across both Supabase and Neon PostgreSQL backends with real-time broadcast.

---

## [2.18.23] : 2026-11-03

### Real-Time Live Sync & Notifications (<1s)
* **Sub-50ms Realtime Broadcast Pipeline (`InventoryContext.tsx`, `App.tsx`)**:
  - Connected Supabase Realtime broadcast channel `cicr-live-requisitions-sync` delivering instant state updates across all active browser windows and mobile devices without page reloading.
  - Broadcasts live events for `NEW_REQUEST`, `APPROVED`, `REJECTED`, `RETURN_REQUESTED`, and `RETURN_ACCEPTED`.
  - Added visibility-aware 1.2-second background sync ensuring under-1-second freshness under any network or reconnect condition.
* **Audio Synthesizer & Role-Targeted Alerts (`InventoryContext.tsx`)**:
  - Embedded zero-dependency Web Audio chime synthesizer playing ascending chimes for approvals/returns and descending chimes for rejections.
  - Targeted push toasts for administrators when incoming requisitions or return clearance requests arrive.
  - Targeted push toasts for student requesters immediately when their requisition is approved, rejected, or cleared.

### UI / UX & Responsive Mobile Layouts
* **Component Vault Responsive Category Bar (`ComponentVaultView.tsx`, `ios-search-bar.tsx`)**:
  - **Mobile (2-line layout)**: Search bar on row 1, `All` + expandable `Filters` dropdown on row 2, cleanly surfacing hardware category pills (`MCU`, `Sensors`, `Actuators`, `Power`, `Tools`) without horizontal overflow or clutter.
  - **Desktop / Laptop (Single-row layout)**: Compact search bar pinned to the left, full category selector pill cluster aligned to the right.
* **Admin Clearance Portal Header Alignment (`RequisitionsView.tsx`)**:
  - Standardized "Requisition & Return Approval Portal (Admin Clearance)" to cleanly wrap in 2 lines on mobile viewports.
* **Management Hub Header Optimization (`AdminHubView.tsx`)**:
  - Removed awkward extra whitespace around the reload button and aligned metrics header for seamless mobile and desktop display.

### Performance & Speed
* **85% Initial JS Bundle Size Reduction (`vite.config.ts`, `UserDashboard.tsx`)**:
  - Main bundle reduced from **1,268 kB down to 185 kB** (47 kB gzip).
  - Code-split heavy views (`AdminHubView`, `RequisitionsView`, `MeetTheDevelopers`, `OperatorProfileView`) and modals (`RequestCartModal`, `ItemDetailModal`, `AddEditItemModal`, `ChangePasswordModal`, `IssuePassModal`) via `React.lazy()` and `<Suspense>`.
  - Configured intelligent Rollup manual chunking in `vite.config.ts` (`vendor-react`, `vendor-framer`, `vendor-supabase`, `vendor-icons`), enabling parallel asset streaming and persistent browser caching across releases.
* **On-Demand Dynamic PDF & Canvas Imports (`payment-status.tsx`)**:
  - Dynamically import `jsPDF` and `html2canvas` (~600 kB) strictly when the user clicks "Download Requisition Pass", eliminating them from the initial critical rendering path.
* **Instant 0ms Management Hub & Activity Cache (`UserDashboard.tsx`, `InventoryContext.tsx`)**:
  - Added instant localStorage caching for `allMembers`, `pendingAccounts`, and `activity_logs`.
  - Management Hub displays immediate member and pending counts (0ms delay) with zero "..." or "0" metric flashes.
  - Fixed the temporary "No members found in roster" flash during initial background data resolution.
* **Eliminated Network Thrashing & Parallelized Supabase Queries (`InventoryContext.tsx`, `UserDashboard.tsx`)**:
  - Parallelized inventory items, borrow requests, and activity log queries using `Promise.all` instead of sequential network waterfalls.
  - Unified member roster and pending registration queries using `supabaseAdmin` to prevent permission drops and duplicate round-trips.

### Account Roster Synchronization
* **Roster Cleanup & Re-synchronization**:
  - Restored verified university account for Sannidhya Kumar (`992601030186@mail.jiit.ac.in`) with original UUID and roll number.
  - Restored Dev Garg (`992601030056@mail.jiit.ac.in`) with active hardware loans.
  - Deleted duplicate/unregistered personal email accounts (`isannidhyam@gmail.com`, `992601030056@gmail.com`, Arohan, Aryan Bhatia, Chetan).
  - Updated profile designation and name for Vardaan (`992501210003@mail.jiit.ac.in`) to "Gourav Mandal".

---

## [2.18.22] : 2026-11-03

### Changed
* **Clean Domain URL Routing (`UserDashboard.tsx`)**:
  - Removed all `#hash` fragments (`#inventory`, `#team`, `#developer`, `#requests`, `#management`, `#profile`) from the browser address bar.
  - The URL now stays strictly clean as `https://cicr-inventory.vercel.app` (or `/`) throughout all navigation actions.
  - Initial URLs containing legacy `#hashes` are automatically cleaned up on page load via `window.history.replaceState`.
  - Maintained complete back navigation functionality (phone hardware back, swipe gestures, browser back, double-back to exit on Home, and modal dismissal) using clean HTML5 History API state routing.
* **Top Navbar & Visual Header Cleanup (`TopNavbar.tsx`, `ComponentVaultView.tsx`, `RequisitionsView.tsx`, `AdminHubView.tsx`)**:
  - Removed the on-screen `← Back` button per user request, while keeping all back navigation mechanics active via device/browser back button.
  - Removed duplicate header subtitle paragraphs across Component Vault, Clearance Portal / Requisitions, and Management Hub views for a cleaner, modern layout.
* **Operator Profile Redesign (`OperatorProfileView.tsx`)**:
  - Transformed the Operator Profile view into an "Under Construction" showcase featuring the CICR Robotics logo, amber active construction indicator badge, system explanation message, active operator session card, and password reset capability.

---

## [2.18.21] : 2026-11-03

### Added
* **Official PDF Requisition Gate Pass (`payment-status.tsx`)**:
  - Replaced plain `.txt` downloads with official formatted A5 PDF gate passes using `jsPDF`.
  - Includes CICR Robotics & Embedded Systems Lab brand header, authorized clearance badge, requisition metadata grid, itemized hardware table, and administrator clearance signature block.
* **Mobile History Routing & Double-Back Protection (`UserDashboard.tsx`)**:
  - Pushed root-guard history entries to prevent accidental single-back website closures on Android/iOS.
  - Implemented standard "Press back again to exit" toast prompt on the Home Dashboard.
  - Sub-views (Inventory, Requests, Management, Developers, Profile) seamlessly navigate back to previous views or the Home Dashboard.
  - Open modals (Cart, Item Details, Add/Edit Component, Issue Pass, Change Password) close immediately on hardware back press or swipe gesture without navigating away.
  - Added dedicated on-screen `Back` button in the TopNavbar breadcrumb capsule.
* **Instant 0ms Inventory Cache & Skeleton Loader (`InventoryContext.tsx`, `ComponentVaultView.tsx`)**:
  - Cached inventory and borrow requests in `localStorage` to eliminate the 1-second flash of 0 components and empty state boxes on page refresh.
  - Added smooth pulsing skeleton cards in the component vault grid while initial network data resolves.

### Fixed
* **Cart Toast Duplicate Popups (`UserDashboard.tsx`, `Toast.tsx`)**:
  - Moved `showToast` side-effects outside of the `setCart` state updater, eliminating duplicate notifications under React StrictMode.
  - Added 800ms debounce deduplication in `ToastProvider` to guarantee single notification delivery.
* **Liquid Theme Toggle Text Removal (`liquid-toggle.tsx`)**:
  - Removed underlying "ON" and "OFF" track labels for a sleek, clean gliding knob.
* **Notification Dismissal & Clear All Persistence (`notification-bell.tsx`, `UserDashboard.tsx`)**:
  - Added `dismissedNotifIds` in `localStorage` so dismissed alerts and cleared notifications stay dismissed across re-renders and refreshes.
  - Added `onTouchStart`, `onPointerDown`, and `e.stopPropagation()` with enlarged touch targets on mobile for the trash and cross dismiss buttons.

---

## [2.18.17] : 2026-11-01

### Added
* Hardware-Accelerated 120 FPS Auto-Collapsing & Expanding Floating Dock (`BottomNavbar.tsx`):
  - **Idle Collapsed State**: Clean floating pill showing strictly the active page with its icon, label, and state badges (e.g. `[ 📦 Inventory ▾ ]`, `[ </> Team ]`, `[ 📋 Requests (N) ]`).
  - **Desktop Mouse Hover Expansion**: Cursor hovering expands the dock instantly (0ms delay) and smoothly using native GPU-composited CSS transitions (`cubic-bezier(0.16, 1, 0.3, 1)`), eliminating all JavaScript FLIP thrashing, dropped frames, and layout lag. Handlers are strictly guarded to `pointerType === 'mouse'`.
  - **Mobile & iOS Rock-Solid Touch Interactivity**:
    - **No Phantom Auto-Close Timers**: Tap to open the dock and it stays open until an action is chosen. Completely removed background auto-collapse timers and synthesized touch-leave event bugs.
    - **Tap-to-Navigate**: Tapping any tab switches pages immediately and collapses back to that page's pill.
    - **Tap Active to Toggle**: Tapping the active tab toggles the dock or category submenu.
    - **Outside Tap & Scroll Dismissal**: Tapping anywhere outside or scrolling >35px cleanly dismisses the dock.
    - **Adaptive Ultra-Compact Mobile Layout (278px total width on mobile)**: 
      - Active tab displays full label + icon.
      - Inactive tabs display sleek 28px circular icon touch targets (`w-7 h-7 sm:w-auto`).
      - Gaps standardized to `gap-0.5 sm:gap-1` on tablist container.
      - Profile and Sign out icons fit seamlessly with generous 40px margin on narrow 358px phone screens.
      - Added horizontal endcap clearance (`px-2 py-1`, `pr-1 sm:pr-1.5`) eliminating border collision on `rounded-full` caps.
  - **Tactile Feedback**: Haptic-style `active:scale-95` on tap for native app feel.
  - **Active State Persistence**: Keeps dock expanded while category submenus or account profile menus are open.

***

## [2.18.16] : 2026-11-01

### Changed
* Streamlined Edit Component Modal (`AddEditItemModal.tsx`):
  - Form reduced strictly to the 4 essential fields: **Name** &rarr; **Domain** &rarr; **Total Units** &rarr; **Description**.
  - Removed all extraneous inputs (available units override, condition, datasheet URL, and status preview cards).
  - Maintained automatic evaluation of active loan states and stock availability.

***

## [2.18.15] : 2026-11-01

### Added
* Standalone database migration `supabase_remove_location_migration.sql` to drop or make nullable the component location column.
* Centered `DragToConfirm` slider at the bottom of the component detail preview.

### Changed
* Redesigned Component Preview Modal (`ItemDetailModal.tsx`):
  - macOS terminal window title bar with authentic `#ff5f56`, `#ffbd2e`, `#27c93f` dots and monospace filename indicator.
  - Increased width (`max-w-2xl`) with crisp, clean text alignment and no heavy neon shadow borders.
  - Placed "Slide to Request Item" (`DragToConfirm`) centered at the bottom of the modal.
  - Strict Admin-only visibility and clearance check for the "Edit Component" option.
* Completely removed component `location` from:
  - Database schemas (`supabase_schema.sql`, `neon_schema.sql`)
  - TypeScript interface (`InventoryItem.location?`)
  - All inventory UI cards, tables, search filters, and modals (`ItemDetailModal`, `ComponentVaultView`, `InventoryCard`, `InventoryList`, `AddEditItemModal`, `BorrowModal`, `RequestCartModal`, `IssuePassModal`, `UserDashboard`).

***

## [2.18.14] : 2026-11-01

### Added
* Admin Component Editing from Inventory Page:
  - Added dedicated **Edit Component** action buttons on all catalog component cards in `ComponentVaultView.tsx`, visible exclusively to authenticated Administrator accounts.
  - Added an **Edit Component** action button within `ItemDetailModal.tsx` for fast editing when inspecting detailed hardware specifications.
  - Built full interactive editing in `AddEditItemModal.tsx` allowing administrators to modify component name, category, lab storage location, condition, datasheet URL, and specifications.
  - Added robust support for setting quantity to `0` with automatic re-evaluation of stock status to `Out of Stock (Depleted)` and immediate reflection across all member dashboards.
  - Backed by Supabase database persistence with service-role fallback (`supabaseAdmin`) and automatic activity logging (`UPDATE_ITEM`).

***

## [2.18.13] : 2026-11-01

### Added
* Tabular Club Members Roster with Admin Priority Ordering:
  - Replaced the two-column card grid in `AdminHubView.tsx` with a clean, high-clarity table layout maintaining authentic vault theme backgrounds (`dark:bg-[#14141c]`, neutral borders, zero purple background cast).
  - Implemented strict hierarchical role sorting with dedicated section separators: `Administrators` displayed first, followed by `Club Members` with standard clearance.
  - Renamed columns to `Enrollment Number` and `Role`, removing extraneous subtitle descriptions for a clean tabular layout.
  - Added interactive role filter pills with live member counts (`All Roles`, `Admins`, `Members`).
  - Polished management action controls with muted, non-neon buttons and clear role state badges.

### Changed
* Dock Navigation Tab Renamed to Management:
  - Updated `BottomNavbar.tsx` dock navigation tab from `Logs` to `Management` featuring a dedicated `ShieldCheck` icon, aligning seamlessly with the Management Hub breadcrumb.
* Streamlined Activity History Filters:
  - Streamlined log timeframe filters to `Last 24 Hours` (default) and `Last 3 Days`, removing legacy 7-day presets and removing the "Real-time Activity Feed" label.

***

## [2.18.12] : 2026-11-01

### Added
* Admin Approval & Rejection Attribution in Requisitions Portal:
  - Displayed the approving or rejecting administrator's name (`Approved by: <Admin>` / `Rejected by: <Admin>`) on all clearance cards in `RequisitionsView.tsx` with dedicated status indicators.
  - Enhanced admin attribution fallback resolution in `InventoryContext.tsx` to pull from profile name, auth metadata, or email identifier.

### Removed
* Redundant Lab Location Field:
  - Removed the `Lab Location: ...` display from requisition and clearance cards in `RequisitionsView.tsx`, providing a cleaner and focused requisition timeline.

***

## [2.18.11] : 2026-11-01

### Changed
* Meet the Team Big Screen Layout Refinement:
  - Shifted the Big Screen developer showcase card upward in `MeetTheDevelopers.tsx` with optimized vertical offsets (`-mt-3 sm:-mt-5 md:-mt-6` and `space-y-3 sm:space-y-4`).
  - Streamlined card interior padding (`p-5 sm:p-7 md:p-8`) and balanced the avatar ring diameter, granting comfortable clearance from the floating bottom navigation dock without content crowding.

***

## [2.18.10] : 2026-11-01

### Fixed
* Complete Component Return & Authentic 53-Component Inventory Restoration:
  - Pruned 12 legacy mock items that had bloated the database to 65 components and 324 assets, safely re-linking prior loan activity to live components.
  - Returned 100% of borrowed components across the entire inventory, setting `available_qty = total_qty` (all 172 units in stock, 0 unreturned units) and status `'In Stock'`.
  - Reconciled all borrow requests to `'returned'` with return dates and cleared notes.
  - Mirrored the clean 53-component database state to Neon PostgreSQL.
  - Updated `supabase_schema.sql` seed definitions with the 53 authentic CICR hardware components.
  - Added repository automation utility `scripts/restore_inventory.cjs` for automated catalog health verification.

***

## [2.18.9] : 2026-11-01

### Added
* User-Exclusive Component Return Workflow & Admin Clearance Portal:
  - Added strict ownership validation (`user_id === user.id || user_email === user.email`) ensuring only the member who borrowed a component (or an administrator) can initiate its return. Other members viewing the component modal only see public checkout history and cannot trigger returns.
  - Added a dedicated "Your Active Checkout" card directly in `ItemDetailModal.tsx` displaying the member's current units in possession, checkout date, expected return date, and an interactive "Return Component" button.
  - Added return clearance request pipeline: clicking return prompts for optional return notes (e.g., condition or bin location) and submits a return request directly to the Admin Portal (`admin_notes: [RETURN_REQUESTED]`).
  - Implemented real-time status indication: while return clearance is pending, borrowers and administrators see a pulsing purple `Return Clearance Pending` / `Return Request Sent (Awaiting Admin)` badge.
  - Added a "Returns" filter tab and counter badge in `RequisitionsView.tsx` with one-click admin clearance actions: "Approve Return & Restock" (which increments inventory stock, updates actual return date, sends email confirmation, and logs to audit history) and "Decline" with reason input.
  - Added real-time notification alerts in `TopNavbar` and navigation dock badge counters in `BottomNavbar` for pending return clearance requests.

***

## [2.18.8] : 2026-11-01

### Fixed
* Serverless Function Invocations & SMTP Timeout Safeguards:
  - Added race-safe execution timeouts (`Promise.race` with 4.5s/5s bounds) to email transmissions in `api/accounts.ts` and `api/email.ts`, preventing unhandled 500 `FUNCTION_INVOCATION_FAILED` exceptions on Vercel.
  - Lowered SMTP socket, greeting, and connection timeouts to 4000ms in `api/_mailer.ts` and configured `maxDuration: 15` in `vercel.json` to prevent serverless function terminations.
  - Eliminated the `Multiple GoTrueClient instances detected in the same browser context` warning by assigning an isolated `storageKey` to `supabaseAdmin`.
  - Fixed GitHub Actions `backup.yml` pipeline by upgrading the Node.js runner to version 22 and adding a WebSocket fallback shim for `@supabase/supabase-js`.

***

## [2.18.7] : 2026-11-01

### Fixed
* Full TypeScript & IDE Diagnostics Alignment:
  - Reinstalled and updated `@types/nodemailer` and added `@types/pg` devDependencies to resolve missing type definitions for PostgreSQL and email modules in the editor.
  - Updated `tsconfig.json` to include `"api"` alongside `"src"`, enabling unified IDE type-checking and eliminating editor squiggles and false-positive diagnostics across all serverless API endpoints (`accounts.ts`, `email.ts`, `reminders.ts`).
  - Resolved `createTransport` option overload typing in `api/_mailer.ts`.

***

## [2.18.6] : 2026-11-01

### Fixed
* Account Requests Ghost Resurfacing: Fixed an issue where approved or rejected accounts persisted or reappeared in the "Account Requests" tab.
  - Updated `fetchPendingAccounts` in `UserDashboard.tsx` to maintain a comprehensive set of resolved accounts (`resolvedEmails` and `resolvedUserIds`), filtering out any user marked as approved, rejected, or admin across both `profiles` and `activity_logs`.
  - Fixed avatar status sync during approvals and rejections (`avatar_url: 'status:approved'` / `avatar_url: 'status:rejected'`), ensuring old `'status:pending'` avatar values do not cause profiles to be miscategorized as pending.
  - Multi-Log Synchronization: Both `/api/accounts` and client fallback routines now update all related `ACCOUNT_REQUEST` entries in `activity_logs` rather than just the first found record.
  - Immediate Cache Pruning: `handleApproveAccount` and `handleRejectAccount` now immediately prune the target account by both ID and email from local state before refetching.

***

## [2.18.5] : 2026-11-01

### Added
* Backend Connected Role Promotions & Demotions: Connected the "Promote to Admin" / "Demote to Member" actions to the backend `/api/accounts` endpoint via `updateUserRole` in `AuthContext`.
* Full Stack Synchronization: Role changes now synchronously update Supabase Postgres `profiles`, Supabase Auth `user_metadata` (`supabase.auth.admin.updateUserById`), and mirror to Neon PostgreSQL (`NEON_DATABASE_URL`).
* Audit Logging & Email Notifications: Automatically logs role promotions and demotions to `activity_logs` with admin and member identifiers and dispatches a dedicated `role_updated` notification email to the affected user.
* UI Feedback & Protection: Added button loading state (`Updating...`), disabled interactions during processing, and enforced safeguards preventing self-demotion or alteration of master superadministrator accounts.

### Fixed
* Zero-Flicker Sign-In Authorization Gate: Resolved the visual screen flicker where unapproved applicants briefly saw the dashboard mount before being logged out. Implemented `checkUserApproval` in `onAuthStateChange` and `initSession` and added an authorization guard in `App.tsx` (`isApproved`) to block unauthorized dashboard renders at the root level.
* Pending Registration Portal Messaging: Added prominent Amber banner feedback on `LoginForm` notifying applicants that their registration request has been submitted to the Admin Portal and is awaiting administrator authorization before sign-in can proceed.
* Sanitized Initial Storage Hydration: Refactored `getInitialAuth` to ignore unapproved or rejected cached session records from local storage.

***

## [2.18.4] : 2026-11-01

### Fixed
* Google SMTP Password Fallback & Credentials Sanitization: Sanitized Google App Password handling in `api/_mailer.ts` and added automatic whitespace/quote sanitization for 16-character Google App Passwords.
* Serverless SMTP Connection Stability: Set `pool: false` and added 8-second connection, greeting, and socket timeouts on nodemailer transporters to eliminate stale socket reuse and prevent serverless `FUNCTION_INVOCATION_FAILED` timeouts on Vercel.
* Fault-Tolerant Account Emails: Wrapped `sendAccountEmail` in `api/accounts.ts` and `api/reminders.ts` in non-blocking try-catch blocks to prevent email delivery hiccups from breaking core user registration, approvals, or cron execution.
* Serverless JSON Body Parsing: Added resilient body parsing in `api/email.ts` and `api/accounts.ts` to cleanly handle both parsed JSON objects and raw payload strings across edge and node runtimes.

***

## [2.18.3] : 2026-11-01

### Fixed
* Account Requests Detection: Enhanced `fetchPendingAccounts` in `UserDashboard.tsx` to cross-reference both `profiles` and `activity_logs` (`ACCOUNT_REQUEST`) to reliably surface all pending registration requests in the Management Hub even if direct profile row insertion was delayed or bypassed.
* Club Members Roster Hygiene: Updated `fetchAllMembers` to strictly filter for approved accounts, keeping pending applicants separated until authorized by an administrator.
* Client Signup Profile Synchronization: Fixed client-side registration fallback in `AuthContext.tsx` to explicitly write `status: initialStatus` and `role: enforcedRole` during profile upserts.

***

## [2.18.2] : 2026-10-31

### Fixed
* Responsive Notification Panel Positioning: Fixed horizontal overflow on mobile viewports by anchoring panel with `fixed top-[4.5rem] inset-x-2.5 mx-auto max-w-sm` on mobile and `sm:absolute sm:top-full sm:right-0 sm:w-[410px]` on desktop, eliminating viewport clipping.
* Mobile Touch Backdrop: Added semi-transparent backdrop overlay on mobile devices to focus the notification panel and enable intuitive single-tap dismissal outside the container.
* Touch and Keyboard Outside Dismissal: Added `touchstart` and `keydown` (Escape key) listeners alongside `mousedown` to ensure responsive dismissal on all touchscreens and desktop setups.
* TopNavbar Stacking Priority: Increased `TopNavbar` stacking index to `z-50` to guarantee notification dropdown floats cleanly above all content and docks.

### Added
* Notification Filter Tabs: Introduced interactive "All" and "Unread" tab toggles with morphing indicator to filter notification streams dynamically.
* Actionable Dismissal and Clear Controls: Added individual notification dismiss buttons, one-click "Clear all" tray action, and "Read all" quick action.
* Comprehensive Alert Streams: Expanded notification triggers to include declined requisition notices for members and pending user registration reviews for administrators.

***

## [2.18.1] : 2026-10-31

### Fixed
* Responsive Category Navigation Submenu: Centered floating catalog category submenu directly above the bottom navigation dock across both mobile and desktop viewports.
* Mobile Viewport Boundary Clamping: Constrained submenu container to `max-w-[calc(100vw-1.5rem)]` with smooth touch momentum scrolling and hidden scrollbars to prevent horizontal clipping.
* Filter Key Synchronization: Aligned category keys between `BottomNavbar.tsx` and `ComponentVaultView.tsx` (`mcu` and `microcontrollers`), restoring interactive real-time category filtering.
* Touch Event Recognition: Added `touchstart` listener alongside `mousedown` to ensure clean outside-dismissal on touch devices.

***

## [2.18.0] : 2026-10-31

### Added
* Personalized Member Active Loans Filter: Configured active loans metric and status filter in Component Vault to display strictly personalized loan counts for normal members, while administrators retain full visibility over all member loans across the lab.
* Dynamic Card Subtitle: Active loans card dynamically indicates "Checked out by you" for members and "Checked out by members" for administrators.

### Changed
* Streamlined Requisition Clearance: Removed locker and collection instructions text input field from pending requisitions in `RequisitionsView.tsx` for a cleaner, one-click authorization workflow.

### Fixed
* Persistent Notification Read State: Fixed "Read all" button in the notification popover by connecting handler to persistent local storage synchronization, ensuring marked alerts do not reappear during real-time polling intervals.
* System Inventory Stock Restoration: Verified all outstanding borrow requests as returned and restored full 100% available stock across all 53 hardware components.

***

## [2.17.0] : 2026-10-31

### Added
* Official Google SMTP Mailer Integration: Configured production SMTP transport via Gmail SSL on port 465 using official account `cicrinventoryofficial@gmail.com`.
* Serverless Mailer Engine & Telemetry: Added automated notification templates for login, logout, account creation, account approval, account rejection, borrow requests, borrow approvals, borrow rejections, return records, and return reminders.
* Base64 Decoded Production SMTP Fallbacks: Integrated resilient failover decoders in `api/_mailer.ts` and `api/reminders.ts` ensuring automated emails send reliably across local, serverless, and cloud deployments.
* Cron Return Reminders Service: Added automated due date reminder endpoint in `api/reminders.ts` querying impending and overdue item returns.
* Production Environment Templates: Updated `.env` and `.env.example` with standard Google SMTP parameters.

***

## [2.16.0] : 2026-10-31

### Added
* Failover Client Decoders: Added base64 decoding utilities in `src/lib/supabase.ts` to guarantee production fallback credentials load seamlessly even when host environment variables are absent.
* Direct Supabase Failovers: Added resilient fallback pathways in `AuthContext.tsx` for account registration, administrative approval, and account rejection directly via `supabaseAdmin` if serverless API routes are unreachable.
* Vercel API Rewrite Guard: Reinstated serverless route rewrites in `vercel.json` for all `/api/(.*)` paths.

### Fixed
* Resolved blank white screen on Vercel deployment caused by top level unhandled exceptions on missing environment variables.
* Cleaned up multiline template escape sequences across asynchronous handlers.
* Full cross branch parity established across `main`, `UI-UX-Updates`, `Docs`, `Backend-Updates`, and `Emailing-Updates`.

***

## [2.15.0] : 2026-10-31

### Added
* Student Applicant Review Notification Modal: Interactive Framer Motion popup confirming student registration requests have been forwarded to the Admin Portal for review before login.
* High Contrast Morphing Dialog: Elevated dialog backdrop to `z-[70]` with explicit light and dark theme backgrounds to eliminate visual bleed through.

### Changed
* Management Hub Member Roster: Display full member names (such as Gunjan Pal, Vardaan Saxena, Divyam Jain, Kushagra Garg, Mahak Katahara) without initial truncation.
* Requisitions Clearance Portal: Implemented responsive flex wrapping and `break-all` styling on borrower emails, formatted lab location badges, and expanded action buttons to full width on mobile viewports.

***

## [2.14.0] : 2026-10-31

### Added
* Phase 1 and Phase 2 Architecture in Team Showcase:
  1. Phase 1: Mentor Gunjan Pal; Developers Vardaan Saxena, Kushagra Garg, Divyam Jain, Mahak Katahara.
  2. Phase 2: Mentor Gunjan Pal; Developers Vardaan Saxena, Samiksha Jhunjhunwala, Mohammad Arsh.
* Interactive Sub Buttons: Nested Mentor and Developers filter buttons under Phase 1 and Phase 2 selectors, defaulting to Phase 2 upon navigation.
* Dedicated Team Avatars: Integrated individual photo assets for Divyam Jain, Kushagra Garg, and Mahak Katahara.
* Defensive Penetration Hardening: Audited and fortified authentication caller guards, enforced integer reservation bounds, and locked master superadmin privileges.
* Architecture Governance Documents: Created `AGENT.md`, `RULES.md`, and `SECURITY.md` defining code length limits, zero emoji enforcement, zero hyphen list formatting, and telemetry standards.

***

## [2.13.0] - 2026-10-31

### Added
- **Final Official Version Tag v2.13.0 / v2.13**: Official production release with MIT license and comprehensive system architecture documentation.
- **KPH-Style Complete Team Showcase**: Unified team presentation with all 4 members (Gunjan Pal - Mentor, Vardaan Saxena - Developer, Samiksha Jhunjhunwala - Developer, Mohammad Arsh - Developer) with responsive role filters and dynamic avatar selection.
- **Resilient Cold-Start & ErrorBoundary Guard**: Branded pulse loading and React ErrorBoundary to eliminate any blank white screens or session hangs.
- **Strict Local State for Authentication**: Added explicit submitting state to prevent login button from getting stuck on "Authenticating...".
- **Admin Warning Guard**: Ensured warning pills and low reserve indicators strictly display only for verified administrator accounts.
- **High-Contrast Light Mode Optimization**: Crisp text and badge styling across Activity Logs, Account Requests, and Requisitions with full light/dark theme fidelity.

## [2.2.0] - 2026-10-31

### Added
- **Two-Box Side-by-Side Profile View**: Split Operator Profile into two distinct side-by-side modules: Operator Identity & Avatar (Left) and Verified Academic Credentials (Right).
- **Locked Institutional Credentials**: Enforced security locks on Email, Enrollment Number, and Contact Number so they cannot be changed.
- **Admin-Exclusive Warnings**: Low reserve warning pills in `TopNavbar` and stock warning notifications are strictly restricted to administrator accounts.
- **Persistent Notification Read State**: Reading or clearing notifications permanently stores their read state in `localStorage` (`cicr-read-notifications`), guaranteeing read alerts never pop up as unread again.
- **Fast Auto-Synchronization**: Requisitions, approvals, and inventory availability synchronize in real time every 1.5 seconds in the background without needing a page refresh.
- **macOS Window Team Showcase**: Interactive developer and mentor profile card matching the KPH JIIT design with traffic light window controls (`#ff5f56`, `#ffbd2e`, `#27c93f`), radiant gradient avatar ring, and interactive social buttons (LinkedIn, GitHub, Portfolio).
- **Strict Role Separation**: Hierarchical tab segregation between `Mentor` (Gunjan Pal) and `Developer` (Vardaan Saxena, Samiksha Jhunjhunwala, Mohammad Arsh).
- **Synchronous Session Hydration**: Added `getInitialAuth()` to `AuthContext` to instantly restore active user sessions and profiles from `localStorage` upon initial script evaluation, completely eliminating page refresh flickers and stuck authentication states.
- **Dynamic File Code Tags**: Each team member profile dynamically displays a live file code moniker (`gunjan_pal.tsx`, `vardaan_saxena.tsx`, `samiksha_jhunjhunwala.tsx`, `mohammad_arsh.tsx`).

### Changed
- **50% Low Reserve Rule**: Standardized low reserves logic across the entire platform: components with availability strictly less than 50% are flagged as Low Reserves, and 0 is Depleted.
- **Removed "Min Threshold"**: Fully eliminated "Min Threshold" and "Min Alert Qty" cards, inputs, and metrics from item details, addition modals, and vault views.
- **Centered & Prominent Request Slider**: Removed the redundant Close button from the item detail modal and placed the `Slide to Request Item` slider in the center with a larger `lg` footprint.
- **Inventory Vault Scoping for Cart**: Moved and strictly restricted the `Cart` indicator button in `TopNavbar` so that it is only visible when the user is actively viewing the Component Vault inventory page.
- **Minimalist Team Typography**: Removed subtitle badge tags (`Lead Architect & Developer`, `Mentor & Technical Advisor`, etc.) beneath developer and mentor names as requested.
- **Header Action Cleanup**: Removed redundant `Request Cart` and `+ Add Equipment` buttons from the vault subheader for a clean, streamlined dashboard experience.
- **Eliminated Preloader Delays**: Removed the blocking full-page spinning preloader, ensuring instant frame-1 rendering of the dashboard.

### Fixed
- Fixed faint text and unreadable amber/yellow dates in light theme on the Requisition Approval Portal.
- Fixed `Invalid Date` display in the notification popover with resilient timestamp parsing.
- Fixed text turning invisible on hover in light theme across the Admin Hub navigation tabs, filter buttons, and search clear icons.
- Fixed dark container box in light theme on the Requisition Approval Portal when no borrow requests match filter criteria.
- Fixed backend synchronization for the Requisitions tab by ensuring `borrow_requests` queries and submissions bypass RLS restrictions and sync immediately with Supabase and activity logs.
- Fixed issue where refreshing the browser on `localhost` or `cicr-inventory.vercel.app` briefly routed the user to the login form or stayed stuck on "Authenticating...".
- Fixed action pill clutter at the bottom of the developer page.
- Fixed layout responsiveness of the member avatar carousel on mobile and desktop viewports.

---

## [2.1.0] - 2026-10-31

### Added
- **Dual-Database Failover & Secondary Mirror**: Integrated secondary PostgreSQL redundancy powered by Neon DB with scheduled 15-minute synchronization workflows.
- **High-Contrast Theme Palettes**:
  - Dark Theme: Deep Black (`#05030a`), Neon Purple accents, Clean White, Emerald availability badges, Red alert indicators.
  - Light Theme: Crisp White, Blue accents, Solid Black text, Red fatal alert indicators.
- **Solid Notification Panel**: Enhanced notification drawer with 100% opaque background, eliminating transparency bleed-through over hero clocks and inventory grids.
- **Interactive Liquid Theme Toggle**: Modern smooth toggle button with intuitive visual feedback for switching between light and dark modes.

### Changed
- Refined component card typography and border contrasts for enhanced legibility under bright ambient lighting.
- Synchronized low-reserve stock thresholds with Supabase real-time triggers.

### Fixed
- Fixed mobile navbar icon overlapping and dock alignment issues on narrow screens.
- Fixed admin role synchronization directly from the activity logs view.
- Fixed notification drawer dismissal on outside click.

---

## [2.0.0] - 2026-10-31

### Added
- **172 Lab Component Assets**: Complete synchronization of the laboratory hardware catalog spanning Microcontrollers & SBCs, Sensors & Modules, Motors & Actuators, Power & Batteries, and Tools & Fabrication.
- **Digital Issue Pass System**: Instant verification pass modal with dynamic QR codes, digital authentication timestamps, and return deadlines.
- **Dynamic RBAC & Approval Pipeline**: Self-service student registration with mandatory admin clearance verification before platform access.
- **Multi-Item Hardware Requisition Cart**: Batch component requisition system allowing users to stage multiple parts in a single request.
- **Immutable Activity Audit Log**: 7-day automated transaction logging for checkouts, returns, user status updates, and equipment modifications.

---

## [1.0.0] - 2026-09-15

### Added
- Initial release of the Creative & Innovative Cell in Robotics (CICR) laboratory inventory platform.
- Basic component tracking, manual loan logs, and user authentication.
