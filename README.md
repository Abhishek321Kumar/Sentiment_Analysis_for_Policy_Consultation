# PotentPolicy — Fullstack E-Consultation Platform

> **A structured, multi-tenant e-consultation and policy governance platform for private institutions.**  
> Enables universities, corporations, healthcare providers, and governance bodies to collect stakeholder feedback, maintain strict multi-tenant isolation, conduct consultations, and make transparent, data-informed policy decisions.

---

## Table of Contents

- [1. Overview & Current Capabilities](#1-overview--current-capabilities)
- [2. Technology Stack & Purpose Matrix](#2-technology-stack--purpose-matrix)
- [3. System Architecture & Multi-App Topology](#3-system-architecture--multi-app-topology)
- [4. Complete Changelog: All Additions & Changes](#4-complete-changelog-all-additions--changes)
- [5. Implemented Features Breakdown](#5-implemented-features-breakdown)
  - [5.1 Organisation & Administrator Module](#51-organisation--administrator-module)
  - [5.2 Campaign Manager Management & Onboarding](#52-campaign-manager-management--onboarding)
  - [5.3 Central Stakeholder Directory & Bulk Imports](#53-central-stakeholder-directory--bulk-imports)
  - [5.4 Consultation Campaigns & Draft Participant Picker](#54-consultation-campaigns--draft-participant-picker)
  - [5.5 Zero-Friction Stakeholder Participation](#55-zero-friction-stakeholder-participation)
  - [5.6 Enterprise Password Reset Security Flow](#56-enterprise-password-reset-security-flow)
  - [5.7 PotentMail: Corporate Webmail Simulator](#57-potentmail-corporate-webmail-simulator)
- [6. Role Governance & Permissions Matrix](#6-role-governance--permissions-matrix)
- [7. Steps to Run the Project](#7-steps-to-run-the-project)
- [8. Environment Variables](#8-environment-variables)
- [9. Database Architecture & Supabase Configuration](#9-database-architecture--supabase-configuration)
- [10. REST API Reference](#10-rest-api-reference)
- [11. Automated Testing Suite](#11-automated-testing-suite)
- [12. Key Design Decisions & Security Standards](#12-key-design-decisions--security-standards)
- [13. Roadmap & Stage 2 Enhancements](#13-roadmap--stage-2-enhancements)

---

## 1. Overview & Current Capabilities

**PotentPolicy** is designed for private institutional consultations where stakeholder anonymity, tenant isolation, and verifiable governance are paramount. 

### Core Platform Capabilities
1. **Multi-Tenant Organisation Onboarding**: Full institutional onboarding with 6-digit email OTP verification, informational profile completion, and cryptographic organisation code generation.
2. **Dual-Role Administrative Portals**: Dedicated workspaces for **Institutional Administrators** (tenant governance, directory enrollment, security) and **Campaign Managers** (consultation design, cohort scheduling, feedback inspection).
3. **Flexible Bulk Import (CSV & Excel)**: High-speed enrollment of both Campaign Managers and Stakeholders supporting `.xlsx`, `.xls`, and `.csv` files with heuristic multi-row header scoring and positional fallback.
4. **Zero-Friction Stakeholder Participation**: Direct consultation access via private campaign code and email—no application passwords required. Supports live character counting, comment limits, and snapshot cohort authorization.
5. **PotentMail Standalone Corporate Webmail**: A dedicated companion SPA simulating enterprise email communication, offering real-time inbox sync, clickable hyperlinks, and quick-action navigation cards.
6. **Enterprise Password Reset Workflow**: Cryptographically hashed, time-bound (60 min) single-use reset links with live 5-point password security verification, updating database records directly.
7. **Strict Multi-Tenant Isolation**: Every database operation, query, and session stream is partitioned by `organisation_id` to guarantee zero cross-tenant leakage.

---

## 2. Technology Stack & Purpose Matrix

The platform is built using modern fullstack JavaScript/Node.js architecture. The table below details every technology used and its specific purpose within the solution:

| Layer / Technology | Tool / Library | Version | Purpose in Project |
|---|---|:---:|---|
| **Frontend Framework** | **React.js** | `^19.0.0` | Powers the reactive user interface, modular component hierarchy, custom hooks, and state management (`useState`, `useEffect`, `useMemo`, `useContext`). |
| **Frontend Bundler** | **Vite** | `^8.3.1` | Ultra-fast development server with Hot Module Replacement (HMR) and optimized Rollup production bundling for both client apps. |
| **Client Routing** | **React Router DOM** | `^6.28.0` | Client-side declarative routing, URL query parameter extraction, deep-linking, and protected route wrappers (`ProtectedRoute`, role guards). |
| **Spreadsheet Engine** | **SheetJS (xlsx)** | `^0.18.5` | Client-side parsing and generation of Excel (`.xlsx`, `.xls`) and CSV files for bulk stakeholder and manager roster imports. |
| **Iconography** | **Lucide React** | `^0.468.0` | Comprehensive, consistent, accessible SVG icon library utilized throughout UI headers, tables, badges, and modals. |
| **Styling & Theming** | **Custom CSS3 Variables** | CSS3 | Native design system tokens (`--brand-primary: #23272A`, `--brand-accent: #C2410C`), responsive layout styling, and persistent Dark/Light mode theme switching. |
| **Backend Runtime** | **Node.js** | `>=18.0.0` | Asynchronous event-driven JavaScript server environment executing the REST API layer and background workers. |
| **Backend Framework** | **Express.js** | `^4.21.2` | Robust routing framework providing REST endpoints, middleware pipelines, CORS handling, body parsing, and central error catching. |
| **Database Pooler** | **PostgreSQL (`pg`)** | `^8.13.1` | Production client connecting to cloud-hosted PostgreSQL (Supabase pooler) with SSL encryption, pooling, and connection retry resilience. |
| **In-Memory Fallback** | **pg-mem** | `^3.0.4` | In-memory PostgreSQL instance for zero-dependency local fallback when external database connectivity is absent. |
| **Password Security** | **bcryptjs** | `^2.4.3` | One-way cryptographic salting and hashing (10 salt rounds) for institutional administrator and campaign manager passwords. |
| **Session Authentication**| **jsonwebtoken (JWT)**| `^9.0.2` | Issues signed, stateless tokens containing user IDs, organisation IDs, and role scopes for route authorization and participation sessions. |
| **Random Generation** | **Node.js `crypto`** | Built-in | Cryptographically secure pseudo-random generation of 6-digit OTPs, 10-char Organisation Codes, and single-use password reset hashes. |
| **Standalone Simulator** | **PotentMail App** | `1.0.0` | Dedicated React/Vite web application running on port `5174` simulating corporate email delivery with live inbox polling and smart action parsing. |
| **Cloud Database** | **Supabase** | Cloud | Managed PostgreSQL relational database providing persistent storage, indexes, relational integrity, and cross-session durability. |

---

## 3. System Architecture & Multi-App Topology

The project is structured into three distinct, cooperating software systems:

```mermaid
flowchart LR
    subgraph Client Apps
        A["PotentPolicy Web App\n(Port 5173)\nReact 19 + Vite"]
        B["PotentMail Webmail\n(Port 5174)\nReact 19 + Vite"]
    end

    subgraph Backend Layer
        C["PotentPolicy REST API\n(Port 5000)\nNode.js + Express"]
    end

    subgraph Data Tier
        D[("Cloud PostgreSQL\nSupabase Pooler\nPort 5432")]
        E[("Fallback In-Memory\npg-mem Engine")]
    end

    A -->|"API Requests (JWT Auth)"| C
    B -->|"Polls Outbox & Actions"| C
    C -->|"Primary Connection (SSL)"| D
    C -.->|"Fallback if Offline"| E
```

1. **System A — PotentPolicy Web Application** (`http://localhost:5173`):
   - Institutional Landing page, Administrator registration wizard, Role-based Sign In.
   - Dedicated Administrator Governance Dashboard and Campaign Manager Workbench.
   - Stakeholder consultation participation portal (`/participate`) and Security Password Reset (`/reset-password`).
2. **System B — PotentMail Corporate Webmail Client** (`http://localhost:5174`):
   - Simulates a real-world company webmail system (e.g., Google Workspace, Outlook).
   - Inboxes for Administrators, Campaign Managers, and Enrolled Stakeholders.
   - Real-time rotating sync animation, clickable email links, and smart action buttons ("Onboard as Manager", "Reset Password", "Participate").
3. **Backend REST API Server** (`http://localhost:5000`):
   - Stateless Express server exposing 25+ REST endpoints under `/api`.
   - Manages tenant isolation, password resets, bulk roster parsing, and email capture.

---

## 4. Complete Changelog: All Additions & Changes

Below is a detailed log of all enhancements, features, bug fixes, and refinements implemented:

| Date / Milestone | Module | Type | Description of Additions & Changes |
|---|---|:---:|---|
| **Latest** | **User Governance** | 🛡️ Security & Rules | **Delete vs Deactivate Rules**: Admin can hard-delete Campaign Managers and Stakeholders if their status is `NOT REGISTERED` or if they have not participated in any campaigns (`0 campaigns / 0 comments`). If they have participated, deletion is restricted and accounts can only be deactivated to safeguard audit integrity. |
| **Latest** | **Stakeholder Directory** | 🔒 Access Control | **Enforce Verification Rule**: Admin can only activate a stakeholder when they are `INACTIVE`. For `NOT REGISTERED` stakeholders, the `Activate` button is disabled with tooltip guidance until the stakeholder verifies enrollment via their verification link and Organisation Code. |
| **Latest** | **Bulk Upload UI** | 🎨 UI Overhaul | **Decluttered Bulk Upload Modals**: Streamlined both Stakeholder and Campaign Manager bulk modals. Replaced cluttered multi-line header descriptions and redundant sample buttons with a clean dropzone, sample download buttons (`.xlsx` and `.csv`), and a clean direct paste area with a subtle `Fill sample rows` helper. |
| **Latest** | **Template Exports** | 📄 Data Standards | **Official Roster Templates**: Updated sample CSV and Excel `.xlsx` downloads with official institutional templates (8-row Stakeholder roster with categories; 2-row Campaign Manager roster). |
| **Recent** | **Admin Registration** | 🎨 UI Polish | Generalized all form placeholders in [`RegisterPage.jsx`](file:///src/pages/RegisterPage.jsx) (`Enter organisation name`, `Enter full name`, `Enter designation`, `user@domain.in`, `Enter 10-digit phone number`). |
| **Latest** | **Bulk Import Engine** | 🐛 Bug Fix | Resolved disabled button issue when uploading Excel sheets with custom or missing headers. Added multi-row header scoring and positional fallback to auto-detect email, name, and phone columns. |
| **Latest** | **Bulk Import Confirmation**| ✨ Feature | Added loaded file name badges in both Stakeholder and Manager bulk import dialogs confirming file loading and row count. |
| **Latest** | **Password Reset Styling** | 🎨 Theme | Re-styled [`ResetPasswordPage.jsx`](file:///src/pages/ResetPasswordPage.jsx) using `--brand-primary` (`#23272A`), `--brand-accent` (`#C2410C`), official SVG brand mark, and dark security deco panel. |
| **Latest** | **PotentMail Navigation** | 🎨 UI Polish | Changed sidebar heading in [`potentmail/src/App.jsx`](file:///potentmail/src/App.jsx) from `Stakeholder Accounts` to `Accounts` to accurately reflect Admin and Manager inboxes. |
| **Latest** | **Form Placeholders** | 🛡️ Security | Removed real user names, emails, and phone numbers from placeholders across `DashboardPage`, `LoginPage`, `RegisterManagerPage`, and `ResetPasswordPage`. |
| **Recent** | **Password Reset Flow** | ✨ Feature | Implemented full forgot-password architecture: `password_reset_tokens` DB table, 3 API endpoints, email template, PotentMail smart card, and `/reset-password` UI. |
| **Recent** | **Database Resilience** | ⚙️ Architecture | Added retry loop with 15-second timeout in `server/db.js` to prevent transient network spikes from triggering premature `pg-mem` fallback. |
| **Recent** | **Manager Onboarding** | 🚀 Overhaul | Overhauled [`RegisterManagerPage.jsx`](file:///src/pages/RegisterManagerPage.jsx) with dual verification (Email + Org Code OR Activation Token), personal detail editing, and password creation. |
| **Recent** | **Invitation Management** | ✨ Feature | Enabled resending invitations with updated 7-day expiry and revoking pending invitations directly from the Campaign Manager management table. |
| **Recent** | **Domain Validation** | 🛡️ Validation | Enforces institutional email domain matching for organisation members while permitting standard public email domains (`gmail.com`, `yahoo.com`, etc.). |
| **Recent** | **External Stakeholders** | ✨ Feature | Made Department and Designation optional for external stakeholder categories (Customer, Supplier, Partner) with adaptive placeholders. |
| **Recent** | **Excel Roster Import** | ✨ Feature | Added client-side spreadsheet support using SheetJS (`xlsx`) for both Campaign Managers and Stakeholders, with sample `.xlsx` downloads. |
| **Recent** | **PotentMail Live Sync** | 🎨 UI Polish | Added rotating CSS animation on refresh, automatic clickable hyperlink parsing in email content, and auto-generated action cards. |
| **Earlier** | **Admin 4-Step Onboarding** | ✨ Feature | Interactive setup wizard with 6-digit OTP verification, institutional profiling, and secret Organisation Code generation. |
| **Earlier** | **Role Separation** | 🛡️ Governance | Strict dashboard partitioning between Institutional Administrator (`ADMIN`) and Campaign Manager (`CAMPAIGN_MANAGER`). |
| **Earlier** | **Campaign Management** | ✨ Feature | Dynamic question builder (1–10 questions), cohort selector, status transitions (`DRAFT` → `OPEN` → `CLOSED`), and soft-deletion protection. |
| **Earlier** | **Zero-Friction Feedback** | ✨ Feature | `/participate` consultation interface using Campaign Code + Email without account creation or login friction. |

---

## 5. Implemented Features Breakdown

### 5.1 Organisation & Administrator Module
- **4-Step Registration Wizard**:
  1. *Account Credentials*: Full name, work email, phone, and password validated against 5 security criteria.
  2. *OTP Verification*: 6-digit verification code with 60-second resend cooldown timer.
  3. *Institutional Profile*: Legal name, display name, organization type, industry, website, location, size, and department roster.
  4. *Security Provisioning*: Secret 10-character alphanumeric Organisation Code (e.g., `IBMC2026`) generated and transmitted securely.
- **Administrator Dashboard**:
  - Central overview of all institutional campaigns, participant statistics, and activity timeline.
  - Organization Profile Editor with live monogram branding and department management.

### 5.2 Campaign Manager Management & Onboarding
- **Manager Invitations & Governance**:
  - Administrator invites managers individually or in bulk with assigned departments and designations.
  - Dispatches unique activation links and secret tokens to the manager's inbox in PotentMail.
  - Resend invitation capability: updates invitation timestamp and issues a fresh 7-day expiration window.
  - Revocation capability: allows administrators to invalidate pending invitations with confirmation.
  - **Delete vs Deactivate Rule**: If an invited manager is still in `PENDING` activation (not registered) or has created `0` campaigns, the administrator can permanently **Delete** the account. If the manager has created campaigns, the Delete option is disabled and the account can only be **Deactivated** to preserve consultation audit history.
- **Dedicated Manager Onboarding Portal** (`/register/manager`):
  - Allows invited managers to claim their account using either **Email + Org Code** or their **Activation Token**.
  - Fetches pre-assigned profile data and allows managers to review, complete, and customize their personal profile.
  - Enforces secure password creation before granting access to the Campaign Manager Workbench.

### 5.3 Central Stakeholder Directory & Bulk Imports
- **Stakeholder Registry & Activation Rules**:
  - Directory of institutional participants maintained with active/inactive/not_registered status, employee IDs, and cohort categories.
  - **Strict Activation Workflow**: Administrators can only manually **Activate** a stakeholder if their status is currently `INACTIVE`. For stakeholders with status `NOT_REGISTERED`, the "Activate" button is disabled; they must first verify their enrollment by clicking the link in their invitation email and entering the secret Organisation Code.
  - **Delete vs Deactivate Rule**: If a stakeholder has status `NOT_REGISTERED` or has never participated in any campaigns (`campaign_count === 0 && comment_count === 0`), the administrator can permanently **Delete** them. Once a stakeholder has participated in consultations, they can only be **Deactivated** to preserve feedback integrity.
  - Adaptive forms: Department and Designation fields automatically become optional when enrolling external stakeholders (Customers, Suppliers, External Partners).
  - Domain validation: Ensures company email addresses align with the institution's official domain name.
- **Bulk Import Engine (CSV & Excel)**:
  - Streamlined, decluttered modal interface with direct file chooser and sample downloads (`.xlsx` and `.csv`).
  - Supports uploading `.xlsx`, `.xls`, and `.csv` files or pasting raw tabular data directly with a "Fill sample rows" helper link.
  - Pre-loaded with official institutional sample templates:
    - *Stakeholder Template (8 Rows)*: Covers Employee, Student, Faculty, Supplier, and Department Head categories with phone numbers and employee IDs.
    - *Campaign Manager Template (2 Rows)*: Standard 5-column format (`Full Name`, `Phone Number`, `Official Email`, `Department`, `Designation`).
  - Heuristic parser analyzes file structure, auto-detects header lines even when preceded by title metadata, and matches column aliases.
  - Positional fallback automatically identifies email columns using regular expressions and maps adjacent name, phone, and department cells.
  - Displays loaded file confirmation badges with verified row counts before committing to the database.

### 5.4 Consultation Campaigns & Draft Participant Picker
- **Campaign Authoring**:
  - Exclusive to Campaign Managers; administrators receive a strict 403 Forbidden if attempting to create consultations.
  - 1 to 10 structured qualitative questions per campaign.
  - Participant cohort selector with search, category filtering, and one-click bulk selection.
- **Lifecycle Governance**:
  - `DRAFT`: Questions, parameters, and assigned participant cohorts can be freely modified.
  - `OPEN`: Consultation is active; stakeholders receive notification emails containing campaign access codes.
  - `CLOSED`: Submissions are locked; results are available for review.
  - **Deletion Protection**: Campaign Managers can only delete drafts or campaigns with 0 responses; campaigns with submitted responses require administrator override (returns HTTP 409 Conflict).

### 5.5 Zero-Friction Stakeholder Participation
- **Direct Portal Entry** (`/participate`):
  - Stakeholders participate using **Campaign Code + Official Email**.
  - No account registration or password required, maximizing participation rates while preserving cohort verification.
  - Validates that the participant was enrolled in the campaign's cohort prior to opening.
- **Feedback Submission**:
  - Live character countdown (5 to 2,000 characters per answer).
  - Maximum response cap of 20 comments per stakeholder.
  - Masked response viewer displaying anonymized author identifiers (`Stakeholder 1`, `Stakeholder 2`) to protect participant confidentiality.

### 5.6 Enterprise Password Reset Security Flow
- **Self-Service Password Recovery**:
  - "Forgot password?" modal integrated into the login page for both Administrators and Campaign Managers.
  - Backend verifies account existence and dispatches a single-use cryptographic token expiring in 60 minutes.
- **Brand-Aligned Reset Screen** (`/reset-password`):
  - Real-time token verification on page mount.
  - Interactive password requirement checklist: minimum 8 characters, uppercase, lowercase, numeric, and special character.
  - Live match verification between password and confirmation fields.
  - Updates password hash directly in the PostgreSQL database and immediately invalidates the reset token.

### 5.7 PotentMail: Corporate Webmail Simulator
- Standalone webmail application running on port `5174`.
- **Key Features**:
  - **Categorized Inboxes**: Sidebar filtering by individual recipient accounts and unified view (`All Inboxes`).
  - **Live Sync**: Rotating refresh animation on demand with automatic polling for newly dispatched emails.
  - **Clickable Links**: All URLs, registration links, and reset links within email text are converted into secure hyperlinks (`target="_blank" rel="noopener noreferrer"`).
  - **Smart Action Banners**: Context-aware action cards dynamically render at the top of messages ("Onboard as Manager", "Reset Password", "Participate in Consultation") for seamless end-to-end testing.

---

## 6. Role Governance & Permissions Matrix

| Capability | Administrator (`ADMIN`) | Campaign Manager (`CAMPAIGN_MANAGER`) | Stakeholder (`STAKEHOLDER`) |
|---|:---:|:---:|:---:|
| **Register Institutional Tenant** | ✅ Full self-service | ❌ No | ❌ No |
| **Manage Organisation Profile** | ✅ Edit details & domain | ❌ Read-only | ❌ No |
| **Invite & Manage Managers** | ✅ Invite, resend, revoke | ❌ No | ❌ No |
| **Add / Import Stakeholders** | ✅ Single & bulk CSV/Excel | ❌ No | ❌ No |
| **Activate Stakeholder** | ✅ Only if status is `INACTIVE` (Disabled if `NOT_REGISTERED`) | ❌ No | ❌ Self-verify via link + Org Code |
| **Delete Manager / Stakeholder** | ✅ Permitted if `NOT_REGISTERED` or `0` participation (Deactivate only if participated) | ❌ No | ❌ No |
| **Create & Edit Campaigns** | ❌ Forbidden (HTTP 403) | ✅ Yes (Own campaigns) | ❌ No |
| **Select Cohort Participants** | ❌ Forbidden | ✅ Yes (Enrolled directory) | ❌ No |
| **Open & Close Campaigns** | ❌ Forbidden | ✅ Yes (Own campaigns) | ❌ No |
| **Delete Empty / Draft Campaign**| ✅ Yes | ✅ Yes (Own campaigns) | ❌ No |
| **Delete Campaign With Responses**| ✅ Direct override | ❌ Blocked (HTTP 409) | ❌ No |
| **Submit Consultation Responses**| ❌ No | ❌ No | ✅ Yes (Code + Email) |
| **Inspect Consultation Feedback**| ✅ All org campaigns | ✅ Own campaigns | ❌ No |
| **Reset Account Password** | ✅ Self-service via email | ✅ Self-service via email | ❌ No password |

---

## 7. Steps to Run the Project

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20.20.2 verified)
- **npm**: v9.0.0 or higher
- Modern web browser (Chrome, Firefox, Edge, Safari)

---

### Step 1: Install Dependencies
Open your terminal in the root `potentpolicy` repository:

```bash
# 1. Install root frontend dependencies
npm install

# 2. Install backend dependencies
cd server && npm install && cd ..

# 3. Install PotentMail webmail dependencies
cd potentmail && npm install --legacy-peer-deps && cd ..
```

---

### Step 2: Start All Three Services

Run each component in a separate terminal window:

#### Terminal 1 — Backend REST API Server (Port 5000):
```bash
npm run server
```
*Expected Output:*
```
Attempting connection to PostgreSQL database at: aws-1-eu-west-3.pooler.supabase.com:5432
✅ Connected to real PostgreSQL database
🚀 PotentPolicy Backend Server listening on port 5000
   API URL: http://localhost:5000/api
   Database: PostgreSQL
   Email Mode: capture
```

#### Terminal 2 — PotentPolicy Main Web Application (Port 5173):
```bash
npm run dev
```
*Expected Output:* `VITE ready ➜ Local: http://localhost:5173/`

#### Terminal 3 — PotentMail Corporate Webmail Client (Port 5174):
```bash
npm run mail
```
*Expected Output:* `VITE ready ➜ Local: http://localhost:5174/`

---

### Step 3: Application Access URLs

| System / Route | URL | Purpose |
|---|---|---|
| **PotentPolicy Platform** | [http://localhost:5173](http://localhost:5173) | Main consultation and governance interface |
| **Role-Based Sign In** | [http://localhost:5173/login](http://localhost:5173/login) | Administrator and Manager authentication |
| **Organisation Registration** | [http://localhost:5173/register](http://localhost:5173/register) | 4-step institutional onboarding wizard |
| **Manager Onboarding** | [http://localhost:5173/register/manager](http://localhost:5173/register/manager) | Claim invited manager account via code/token |
| **Stakeholder Portal** | [http://localhost:5173/participate](http://localhost:5173/participate) | Zero-friction consultation feedback entry |
| **Password Reset** | [http://localhost:5173/reset-password](http://localhost:5173/reset-password) | Self-service secure password reset page |
| **PotentMail Webmail Client** | [http://localhost:5174](http://localhost:5174) | Inboxes for OTPs, invitations, and alerts |
| **Backend REST API Health** | [http://localhost:5000/api/health](http://localhost:5000/api/health) | Live health check endpoint |

---

### Demo Accounts & Credentials

| Role | Email Address | Password | Organisation Code | Access Purpose |
|---|---|---|---|---|
| **Administrator** | `radhika@ibm.in` | `ibmRadhika@123` | `IBMC2026` | Live Supabase institutional administrator |
| **Administrator (Demo)**| `admin@demo.org` | `Demo@1234` | `DEMOORG2026` | Standard demo administrator |
| **Campaign Manager** | `manager@demo.org` | `Demo@1234` | — | Demo campaign manager |
| **Stakeholder** | `stakeholder@demo.org` | *(No password)* | Campaign: `CAMP2026` | Stakeholder consultation feedback |

---

## 8. Environment Variables

### Backend Configuration (`server/.env`):
```env
PORT=5000

# Cloud PostgreSQL (Supabase pooler)
DATABASE_URL=postgresql://postgres.mvvh699q_7fuymw:YOUR_SUPABASE_PASSWORD@aws-1-eu-west-3.pooler.supabase.com:5432/postgres

# Cryptographic Keys
JWT_SECRET=potentpolicy_super_secret_jwt_key_2026
PARTICIPATION_SECRET=potentpolicy_participation_token_key_2026

# Email Mode: 'capture' routes all email into the dev_emails table
EMAIL_MODE=capture

# Governance Flags
ALLOW_PUBLIC_EMAIL_DOMAINS=true
SHOW_COMMENTER_IDENTITY=false
NODE_ENV=development
```

### Frontend Configuration (`.env` in root):
```env
VITE_SHOW_DEMO=true
```

---

## 9. Database Architecture & Supabase Configuration

The application database schema is defined in [`server/migrations/schema.sql`](file:///server/migrations/schema.sql) and runs on PostgreSQL:

```
├── organisations           # Institutional tenants (code, domain, profile metadata)
├── users                   # Administrators and activated Campaign Managers (bcrypt hashes)
├── organisation_otps       # 6-digit verification codes for tenant registration
├── manager_invitations     # Pending & accepted manager invitations with expiry
├── stakeholders            # Institutional directory roster with category & status
├── campaigns               # Policy consultations (title, status, window, manager_id)
├── campaign_questions      # 1–10 qualitative consultation questions per campaign
├── campaign_participants   # Snapshot of eligible stakeholders per campaign
├── comments                # Qualitative feedback submissions from stakeholders
├── password_reset_tokens   # Single-use 60-min password reset hashes
└── dev_emails              # Simulated email outbox parsed by PotentMail
```

### Automatic Connection Retry
In `server/db.js`, the database pool includes a 15-second connection timeout and automatic retry logic. This prevents momentary network latency to Supabase from causing premature fallback to in-memory mode.

---

## 10. REST API Reference

### Authentication & Tenant Governance
- `POST /api/auth/register-admin` — Registers institution and dispatches 6-digit OTP.
- `POST /api/auth/verify-otp` — Validates OTP, activates admin user, and returns JWT.
- `POST /api/auth/resend-otp` — Issues a fresh OTP (enforces 60s cooldown).
- `POST /api/auth/login` — Authenticates credentials and returns user payload and JWT.
- `POST /api/auth/forgot-password` — Generates a 60-minute password reset token and emails it.
- `GET /api/auth/verify-reset-token/:token` — Validates reset token authenticity and returns account role.
- `POST /api/auth/reset-password` — Hashes new password, updates database, and invalidates token.
- `POST /api/auth/register-manager` — Completes invited manager registration using Org Code or Token.
- `GET /api/auth/me` — Fetches current session identity, permissions, and tenant details.
- `PUT /api/organisation/profile` — Updates institutional profile (`ADMIN` only).

### Member Governance (`ADMIN` only)
- `GET /api/members` — Retrieves managers, pending invitations, and stakeholder directory.
- `POST /api/members/managers` — Invites a new Campaign Manager.
- `POST /api/members/managers/resend` — Refreshes and resends manager invitation email.
- `DELETE /api/members/managers/:id` — Revokes and deletes a pending manager invitation.
- `POST /api/members/bulk-managers` — Enrolls multiple Campaign Managers via parsed CSV/Excel roster.
- `POST /api/members/stakeholders` — Adds an individual stakeholder record.
- `POST /api/members/bulk-stakeholders` — Enrolls multiple stakeholders via parsed CSV/Excel roster.
- `DELETE /api/members/stakeholders/:id` — Soft-deactivates stakeholder (`is_active = false`).

### Consultation Campaigns
- `POST /api/campaigns` — Creates a new campaign in `DRAFT` status (`CAMPAIGN_MANAGER` only).
- `GET /api/campaigns` — Lists consultations (Admins see all tenant campaigns; Managers see own).
- `GET /api/campaigns/:id` — Retrieves campaign questions, dates, and participant status.
- `PUT /api/campaigns/:id` — Updates campaign parameters based on lifecycle status.
- `POST /api/campaigns/:id/open` — Launches consultation to `OPEN` and dispatches notification emails.
- `POST /api/campaigns/:id/close` — Closes consultation to `CLOSED` status.
- `DELETE /api/campaigns/:id` — Soft delete (Enforces 409 Conflict if comments exist and user is not admin).
- `GET /api/campaigns/:id/responses` — Fetches paginated, anonymized stakeholder responses.

### Stakeholder Participation
- `POST /api/participate/enter` — Validates Campaign Code + Email and returns a 2-hour participation JWT.
- `POST /api/participate/comments` — Commits stakeholder answers (5–2,000 chars per answer).

### Development & Webmail APIs
- `GET /api/dev/emails` — Fetches captured email messages for PotentMail.
- `POST /api/dev/reset-data` — Wipes and re-seeds clean demo data.

---

## 11. Automated Testing Suite

PotentPolicy includes an automated test suite verifying all core security, governance, and business rules:

```bash
npm run test:api
```

### Verified Test Cases:
1. **Single-Use Manager Invitations**: Verified that accepted invitations cannot be reused.
2. **Admin Campaign Creation Guard**: Verified that administrators receive HTTP 403 Forbidden when attempting to create campaigns.
3. **Manager Ownership Isolation**: Verified that managers cannot edit, open, or delete campaigns belonging to other managers.
4. **Stakeholder Eligibility Verification**: Verified that unlisted stakeholders or stakeholders attempting access outside the date window are rejected.
5. **Multi-Tenant Data Isolation**: Verified that cross-tenant queries return no data leaks.
6. **Deletion Conflict Guard**: Verified that managers receive HTTP 409 Conflict when attempting to delete campaigns with existing responses.

---

## 12. Key Design Decisions & Security Standards

1. **Deterministic Stakeholder Anonymisation**:
   - Comments store internal foreign keys for administrative auditability, but responses presented in the user interface mask identities into `"Stakeholder 1"`, `"Stakeholder 2"` deterministically per campaign.
2. **Cryptographic Salt Rounds & Timing**:
   - All passwords are encrypted with bcrypt using 10 salt rounds. Reset tokens and OTP codes are stored in dedicated tables with automated expiration checks.
3. **Additive, Forward-Compatible Schema**:
   - The `campaigns` table schema includes `deletion_requested_by`, `deletion_requested_at`, and `previous_status` columns, ensuring future deletion-approval workflows require zero disruptive database migrations.
4. **Non-Blocking Background Delivery**:
   - All email dispatches execute asynchronously via `setImmediate`. Mail simulation never blocks or delays the primary HTTP request/response cycle.

---

## 13. Roadmap & Stage 2 Enhancements

The following enhancements are planned for the upcoming Stage 2 delivery:
- **Production SMTP Integration**: Upgrading simulated email delivery to authenticated production SMTP/SES with SPF and DKIM verification.
- **NLP Sentiment Classification Microservice**: Integration with a Python/FastAPI natural language processing pipeline for automated sentiment scoring and aspect analysis.
- **Visual Sentiment Analytics**: Interactive charts (sentiment distribution by department, trend over time) on the campaign insights dashboard.
- **Two-Factor Authentication (2FA)**: Time-based One-Time Password (TOTP) support for institutional administrators.
- **Clause-Level Document Highlighting**: Interactive PDF / document viewer allowing stakeholders to attach feedback directly to specific policy clauses.

---

<div align="center">

**PotentPolicy** · Structured E-Consultation Platform  
*Built with React 19, Node.js, Express, and PostgreSQL.*

</div>


## 🛑 Copyright Notice & Restrictions

Copyright © 2026 Abhishek Anil Kumar. All rights reserved.

This is a public repository for viewing purposes only. **No permission** is granted 
for anyone to copy, modify, distribute, sub-license, or use this software and code 
in any project, commercial or non-commercial. Unauthorized use or claiming ownership 
of this work constitutes copyright infringement.
