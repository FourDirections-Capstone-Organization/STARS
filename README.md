# STARS — Speedex Task Allocation and Recommendation System

[![.NET 9](https://img.shields.io/badge/.NET-9.0-blue.svg)](https://dotnet.microsoft.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646cff.svg)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ed.svg)](https://www.docker.com/)
[![Azure](https://img.shields.io/badge/Azure-Cloud_Ready-0078d4.svg)](https://azure.microsoft.com/)
[![OWASP](https://img.shields.io/badge/OWASP-Hardened-success.svg)](https://owasp.org/)
[![Security Audit](https://img.shields.io/badge/Security%20Audit-21%2F21%20Passed-success.svg)](docs/STARS_Security_Audit_Report.pdf)
[![Tests](https://img.shields.io/badge/Tests-1%2C693%20Passed-success.svg)](https://github.com/)

**STARS (Speedex Task Allocation and Recommendation System)** is an enterprise-grade workload management, task orchestration, and operational dispatch platform engineered for logistics, supply chain, and cross-departmental operations.

The platform pairs a high-performance **ASP.NET Core 9 Web API** with an interactive **React 18 / TypeScript SPA**, incorporating an **AI-assisted employee suitability engine** powered by **Groq API / LLaMA 3.3 70B Versatile**, automated **Delivery Management System (DMS)** courier operations, **Financial Operations Management System (FOMS)** accounts receivable workflows, and **Speedex Central Single Sign-On (SSO)** multi-system provisioning.

---

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Technology Stack](#technology-stack)
3. [Key Modules & Capabilities](#key-modules--capabilities)
   - [Task Lifecycle & Workload Management](#task-lifecycle--workload-management)
   - [AI Suitability & Recommendation Engine (Groq LLM + Heuristics)](#ai-suitability--recommendation-engine-groq-llm--heuristics)
   - [Delivery Management System (DMS) Integration](#delivery-management-system-dms-integration)
   - [Financial Operations Management System (FOMS) Integration](#financial-operations-management-system-foms-integration)
   - [Performance Evaluations & 360 Scorecards](#performance-evaluations--360-scorecards)
   - [Configurable KPI Calculation Engine](#configurable-kpi-calculation-engine)
   - [Organizational Structure & User Administration](#organizational-structure--user-administration)
   - [Speedex Central Single Sign-On (SSO)](#speedex-central-single-sign-on-sso)
4. [Enterprise Security & OWASP Hardening](#enterprise-security--owasp-hardening)
5. [Cloud Infrastructure & Performance Optimizations](#cloud-infrastructure--performance-optimizations)
6. [Getting Started & Local Setup](#getting-started--local-setup)
   - [Prerequisites](#prerequisites)
   - [Docker Compose Quickstart](#docker-compose-quickstart)
   - [Web Interfaces & Port Map](#web-interfaces--port-map)
   - [Default Accounts & Role Access](#default-accounts--role-access)
7. [Automated Testing & Quality Assurance](#automated-testing--quality-assurance)
8. [Project Team & Credits](#project-team--credits)

---

## Architectural Overview

STARS is architected as an event-driven, secure, and decoupled enterprise system separating presentation, business logic, data persistence, and external machine-to-machine integrations:

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                     STARS FRONTEND                     │
                                    │     React 18 + TypeScript + Vite 8 SPA (Nginx)         │
                                    │   - Tailwind CSS / Recharts     - React Router 7       │
                                    │   - Token Interceptor & Refresh - Inactivity Watcher   │
                                    └───────────────────────────┬────────────────────────────┘
                                                                │ HTTPS (REST API)
                                                                ▼
                                    ┌────────────────────────────────────────────────────────┐
                                    │                      STARS BACKEND                     │
                                    │        ASP.NET Core 9 Web API (Kestrel 64-bit)         │
                                    │   - Claims-based JWT RBAC      - RateLimiter Shield    │
                                    │   - SecurityHeaders Middleware - IMemoryCache Probes   │
                                    │   - DbContext Pooling (80)     - Response Compression  │
                                    │   - Session Timeout Guard      - Global Error Handler  │
                                    └───────┬───────────────────┬───────────────────┬────────┘
                                            │                   │                   │
                        ┌───────────────────┘                   │                   └───────────────────┐
                        │ EF Core 9 / Npgsql                    │ HTTPS API                             │ HTTPS / M2M
                        ▼                                       ▼                                       ▼
            ┌───────────────────────┐               ┌───────────────────────┐               ┌─────────────────────────┐
            │     PostgreSQL 16     │               │   Groq AI Cloud API   │               │  External Integrations  │
            │   (Relational OLTP)   │               │ (LLaMA 3.3 70B Model) │               │ - Speedex Central SSO   │
            │  - Composite B-Trees  │               │ - Suitability Rationale│               │ - DMS API & Webhooks    │
            │  - Pooled Connections │               │ - SLA Risk Prediction │               │ - FOMS AR & Ledger Sync │
            └───────────────────────┘               └───────────────────────┘               └─────────────────────────┘
```

---

## Technology Stack

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Backend Framework** | ASP.NET Core 9 (`net9.0`) | High-throughput, cross-platform C# Web API |
| **Frontend Framework** | React 18.3 & TypeScript 5.6 | Single Page Application bundled with Vite 8.0 & React SWC |
| **Operational Database** | PostgreSQL 16 | Relational storage with composite B-Tree indexes and pooling |
| **Data Access / ORM** | EF Core 9 (Npgsql) | High-concurrency pooled DbContext (`AddDbContextPool`, size 80) |
| **AI / LLM Integration** | Groq API (`llama-3.3-70b-versatile`) | Contextual suitability justification and SLA risk rationale |
| **AI Fallback Engine** | Algorithmic Fallback Generator | Zero-downtime deterministic heuristic recommendation scoring |
| **Document Engine** | QuestPDF | High-performance server-side PDF generation for reports |
| **Client Export Engine** | jsPDF & html2canvas | In-browser client-side PDF and scorecard compilation |
| **UI & Styling** | Tailwind CSS & Tabler / Lucide Icons | Responsive design system, accessible modals, and status badges |
| **UI Components** | Emotion & Material-UI Pickers | Customized interactive date/time pickers and styled components |
| **Data Visualization** | Recharts | Interactive KPI charts, SLA risk graphs, and rating distributions |
| **API Documentation** | OpenAPI 3.0 & Scalar | Interactive API exploration and contract testing at `/scalar/v1` |
| **Reverse Proxy** | Nginx Alpine | Production static asset hosting and reverse proxying |
| **Containerization** | Docker & Docker Compose | Multi-container local orchestration (`docker compose up`) |
| **Cloud Runtime** | Microsoft Azure | App Service (Linux 64-bit container) + PostgreSQL Flexible Server |

---

## Key Modules & Capabilities

### Task Lifecycle & Workload Management
- **Finite State Machine (FSM):** Enforces strict state transitions:
  $$\text{Pending} \longrightarrow \text{In Progress} \longrightarrow \text{In Review} \longrightarrow \text{Completed} \quad (\text{or } \text{Cancelled})$$
- **Push-Back & Approval Workflow:** Coordinators and Managers can approve completed reviews or push back tasks with mandatory revision remarks.
- **Interactive Multi-View Workspace:**
  - **Kanban Board:** Drag-and-drop workflow lanes with real-time status card movement.
  - **List View:** Sortable, multi-column filterable grid supporting search, status filters, and priority tags.
  - **Deadline Calendar:** Visual task scheduling with date-only and time-sensitive milestones.
- **Rich Task Metadata:** Subtask checklist tracking, binary magic-byte inspected attachments, threaded comments with author-protected soft deletion (`IsDeleted`), and comprehensive audit history.
- **Task Templates & Duplicate Prevention:** Department-scoped task blueprints and Levenshtein token similarity detection (`IDuplicateDetectionService`) preventing redundant task creation.

### AI Suitability & Recommendation Engine (Groq LLM + Heuristics)
- **Multi-Factor Suitability Scoring:** Evaluates candidate suitability across three core pillars:
  $$\text{Suitability Score} = (0.35 \times \text{Workload Factor}) + (0.25 \times \text{Experience Factor}) + (0.40 \times \text{Recommendation Score})$$
  - **Workload Factor:** Inversely proportional to active assignments (`Pending`, `InProgress`, `InReview`).
  - **Experience Factor:** Weighted historical completions matching task classification (Routine vs. Special).
  - **Recommendation Score:** Normalized composite of historical evaluation ratings (Timeliness, Quality, Communication).
- **Groq Cloud LLM Reasoning:** Integrates with Groq API utilizing LLaMA 3.3 70B Versatile to produce natural-language justifications explaining candidate rankings.
- **Deterministic Algorithmic Fallback:** Guarantees 100% operational availability via `SuitabilityFallbackGenerator` if the external AI service is unconfigured, unreachable, or rate-limited.
- **Biomarker Scan & SLA Risk Prediction:** Background service (`BiomarkerScanService`) continuously evaluates open tasks against configurable thresholds (`BiomarkerThresholds`), emitting automated early-warning alerts for tasks approaching SLA expiration.

### Delivery Management System (DMS) Integration
- **Outbound Dispatch:** STARS initiates M2M outbound delivery orders to DMS over HTTPS, returning auto-generated waybills (`WB-YYYY-XXXXXX`).
- **Live Status Webhook:** Inbound M2M status webhook (`POST /api/integration/dms/status`) processes courier status transitions, recipient sign-off details, driver assignments, and delivery timestamps with synchronous 200 OK contract compliance.
- **Automated Failure Follow-up:** Delivery failures (`FailedDelivery`) and pickup failures (`FailedPickup`) automatically spawn dedicated coordinator follow-up tasks in STARS with intelligent deduplication.
- **Order Cancellation Sync:** Cancellation webhooks preserve task FSM integrity, append cancellation audit remarks, and alert department coordinators.
- **Proof of Delivery (POD):** Secure byte-stream retrieval and download of scanned or photographed POD files.
- **Paired Driver Tracking:** Real-time visibility into paired delivery drivers, employee IDs, and delivery performance metrics.

### Financial Operations Management System (FOMS) Integration
- **Accounts Receivable Ledger Sync:** Direct synchronization of client ledger records, invoice amounts, billing dates, due dates, and payment states.
- **Physical Invoice Endorsement:** Incoming physical invoice endorsements transition into STARS collection tasks assigned to designated account coordinators.
- **Liquidation Corrections:** In-app submission, verification, and audit tracking for cash and voucher liquidation adjustments.
- **Financial Dashboards & Aging Analytics:** Visual tracking of overdue accounts, collection performance, aging brackets (30/60/90+ days), and liquidation reconciliation.

### Performance Evaluations & 360 Scorecards
- **Evaluation Cycles:** Structured review periods for departments, teams, or individual employees.
- **Customizable Evaluation Templates:** Configurable evaluation criteria across Timeliness, Work Quality, and Communication with defined rating bands.
- **AI-Powered Development Plans:** Automated generation of personalized employee growth plans and action items.
- **Interactive Scorecards & PDF Export:** Visual scorecards, radar charts, rating distributions, and server-side PDF exports powered by QuestPDF.

### Configurable KPI Calculation Engine
- **Safe Mathematical Formula Parser:** `SafeFormulaParser` dynamically parses and evaluates mathematical expressions (e.g., `(TasksCompleted / TasksAssigned) * 100`) without code injection vulnerabilities.
- **Predefined System Variables:** `KpiVariableRegistry` provides system metrics including completed tasks, overdue counts, average turnaround times, and rating averages.
- **Department & Role Customization:** Tailored KPI metrics, custom weightings, and visual formula builder modals with live syntax validation.

### Organizational Structure & User Administration
- **Hierarchical Department Tree:** Interactive organizational hierarchy linking departments, job positions, and team rosters.
- **Digital 201 File Management:** Comprehensive employee profiles, employment statuses, and cross-department transfer requests.
- **Multi-System User Provisioning:** Unified account creation across STARS, DMS, and FOMS with granular system-scoped permissions (`AllowedSystems`).
- **Account Archiving & Deactivation:** Safe account archiving preserving task history and audit trail integrity without hard deletions.

### Speedex Central Single Sign-On (SSO)
- **Centralized Identity Management:** Seamless integration with the Speedex Central Portal.
- **Auth Bootstrap & Handshake:** Inbound authentication bootstrapping (`bootstrapIncomingAuth`) seamlessly exchanges SSO tokens on portal transitions.
- **Session Revocation & Synchronization:** Cross-tab authentication synchronization (`AuthSyncWatcher`) and coordinated logout across systems.

---

## Enterprise Security & OWASP Hardening

STARS is rigorously hardened against the **OWASP Top 10 (2021/2025)**, **OWASP API Security Top 10 (2023)**, and **CWE** standards. The system has completed both automated scanning (SAST, SCA, OWASP ZAP) and manual API penetration testing across all 31 controllers and 12 modules, achieving **100% compliance across 21 evaluated security domains** (see [docs/STARS_Security_Audit_Report.pdf](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/docs/STARS_Security_Audit_Report.pdf) and [docs/SECURITY_AUDIT_REPORT.md](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/docs/SECURITY_AUDIT_REPORT.md)):

| Vulnerability Domain | CWE Reference | STARS Architectural Defense | Status |
| :--- | :--- | :--- | :---: |
| **Mass Assignment Protection** | CWE-269, CWE-915 | `UserService.cs` explicitly strips administrative fields (`Role`, `DepartmentId`, `AllowedSystems`, etc.) when non-managers update profiles. | Verified |
| **HTTP Security Headers & HSTS** | CWE-693, CWE-1021 | `SecurityHeadersMiddleware.cs` enforces `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, and production `Strict-Transport-Security`. | Verified |
| **Strict CORS Lockdown** | CWE-942 | `CorsPolicyHelper.cs` replaces wildcards with an immutable canonical whitelist for trusted localhost and Azure domains with credentials isolation. | Verified |
| **Host Header Link Sanitization** | CWE-601, CWE-644 | `EmailVerificationController.cs` validates `Origin` and `Referer` headers against the approved CORS whitelist before constructing verification URLs. | Verified |
| **BOLA / IDOR Attachment Guard** | CWE-639 | `AttachmentService.cs` verifies requester ownership, task assignment, or department coordinator membership before streaming files. | Verified |
| **Cryptographic Token Hashing** | CWE-312, CWE-916 | `TokenHasher.cs` hashes refresh tokens, password reset tokens, and email verification tokens with SHA-256 prior to database persistence. | Verified |
| **Secrets Hygiene & Externalization** | CWE-798 | All API keys, connection strings, and JWT secrets are blanked in source control and bound at runtime via environment variables. | Verified |
| **Session Invalidation & Timeout** | CWE-613 | `SessionTimeoutMiddleware.cs` enforces inactivity expiration and returns HTTP 401 `SESSION_TERMINATED` on logged-out sessions, preventing token revival. | Verified |
| **Anti-Enumeration Responses** | CWE-204, CWE-200 | Authentication and password recovery endpoints return standardized, uniform success responses to prevent user account discovery. | Verified |
| **Magic Byte File Inspection** | CWE-434 | `FileSignatureValidator.cs` inspects binary headers for PDF (`%PDF-`), PNG, JPEG, and Office Open XML formats, rejecting disguised executables. | Verified |
| **Software Composition (SCA)** | CWE-1395 | Frontend `npm audit` reports **0 vulnerabilities**; backend NuGet dependencies pinned to secure patches. | Verified |
| **Information Disclosure Sanitization** | CWE-209 | Custom exception handler middleware masks stack traces and raw SQL exceptions in production mode. | Verified |
| **Docker Production Runtime** | CWE-1188 | Production multi-stage `Dockerfile` drops root privileges to run as unprivileged `appuser`. | Verified |
| **HttpOnly Cookie Architecture** | CWE-922 | Secure HttpOnly and SameSite cookie specification designed for browser token lifecycle isolation. | Verified |
| **Comment Attachment BOLA Guard** | CWE-639, API1 | `TaskCommentController.cs` verifies user assignment, department membership, or manager role before streaming comment files. | Verified |
| **Comment Magic Byte Validation** | CWE-434 | `TaskCommentService.cs` inspects binary stream magic bytes via `FileSignatureValidator`, rejecting disguised binaries (.exe renamed to .pdf). | Verified |
| **Password Change/Reset Revocation** | CWE-613 | `AuthService.cs` immediately revokes active refresh tokens, expiry, and session timestamps upon password change or reset. | Verified |
| **Temporary Password Log Redaction** | CWE-532 | `UserService.cs` sanitizes temporary credentials in structured log templates to `[REDACTED_TEMP_PASSWORD]`. | Verified |
| **Email Verification Rate Limiting** | CWE-770, API4 | `EmailVerificationController.cs` decorated with `[EnableRateLimiting("AuthRateLimit")]` (30 req/min sliding window) to prevent SMTP flooding. | Verified |
| **Deactivation Session Termination** | CWE-613 | `UserService.DeactivateAsync` clears active refresh tokens and session timestamps immediately upon account deactivation. | Verified |
| **Modern Browser Isolation Headers** | CWE-693 | Injected `X-Permitted-Cross-Domain-Policies: none` and `Cross-Origin-Opener-Policy: same-origin` to isolate client execution contexts. | Verified |

---

## Cloud Infrastructure & Performance Optimizations

STARS is optimized for high-concurrency cloud execution on **Microsoft Azure** (Azure App Service + Azure Database for PostgreSQL Flexible Server):

- **AlwaysOn Enabled:** Prevents idle container recycling, eliminating cold-start latency spikes.
- **64-bit Kestrel Runtime:** Expands CLR address space and unlocks full multi-core threadpools for cryptography and data processing.
- **HTTP/2.0 Multiplexing:** Enables concurrent bidirectional request streaming over single persistent TCP connections.
- **Database Connection Pooling:** Implements `AddDbContextPool<AppDbContext>(poolSize: 80)` with tuned connection builder properties:
  ```csharp
  csb.MaxPoolSize = 75;
  csb.MinPoolSize = 10;
  csb.ConnectionLifetime = 300;
  csb.Timeout = 15;
  csb.CommandTimeout = 30;
  ```
- **PostgreSQL Capacity Tuning:** Tuned for Azure PostgreSQL Flexible Server with composite B-Tree indexes on `(Status, AssignedDepartmentId, Deadline)`, `CreatedAt`, and `DmsWaybillNo`.
- **Health Check Decoupling:**
  - `/api/health/live`: Fast, zero-DB probe for Azure liveness probes.
  - `/api/health`: Readiness probe with `IMemoryCache` (10s TTL) shielding the database pool during traffic surges.
- **Authentication Rate Limiting:** Sliding-window rate limiter on `POST /api/auth/login` (30 requests/minute per IP, queue limit 10) mitigating brute-force attacks with fast HTTP 429 responses.
- **Response Compression:** Gzip and Brotli compression (`CompressionLevel.Fastest`) applied to all JSON, plain text, and problem-detail responses.
- **Query Optimization:** Elimination of N+1 queries across task views via eager `.Include(...)`, `.AsNoTracking()`, and consolidated status count queries.

---

## Getting Started & Local Setup

### Prerequisites
- **Docker Desktop** (Engine 24+, Compose v2+)
- **System Memory:** 8 GB RAM minimum
- *(Optional for bare-metal development)*: [.NET 9 SDK](https://dotnet.microsoft.com/download), [Node.js 20+ LTS](https://nodejs.org/)

### Docker Compose Quickstart

Clone the repository and spin up the complete multi-service stack:

```powershell
# Clone the repository
git clone https://github.com/FourDirections-Capstone-Organization/STARS.git
cd STARS

# Build and start all containers in detached mode
docker compose up -d

# Verify all containers are healthy
docker compose ps
```

To view application logs:
```powershell
docker compose logs -f backend
docker compose logs -f frontend
```

### Web Interfaces & Port Map

| Service | Local URL | Default Credentials | Description |
| :--- | :--- | :--- | :--- |
| **STARS Web App** | `http://localhost` | — | React 18 SPA served via Nginx |
| **STARS API (Scalar Docs)** | `http://localhost:5100/scalar/v1` | — | Interactive OpenAPI documentation |
| **PostgreSQL Database** | `localhost:5433` | `postgres` / `postgres` | Relational database (mapped from container 5432) |
| **PostgreSQL (pgAdmin)** | `http://localhost:5050` | `stars@admin.com` / `change_in_production` | Relational database administration |

### Default Accounts & Role Access

Default accounts are seeded automatically for development and evaluation:

| Role | Email | Password | Primary Scope |
| :--- | :--- | :--- | :--- |
| **System Manager** | `manager@stars.com` | `Manager@2024!Temp` | Full administrative control, user provisioning, global KPIs |
| **Coordinator (CS)** | `coordinator1@stars.com` | `Test@2024!Pass` | Customer service dispatch, task allocation, reviews |
| **Coordinator (Dispatch)**| `coordinator2@stars.com` | `Test@2024!Pass` | Operational dispatch, driver pairing, delivery monitoring |
| **Dispatcher** | `dispatcher1@stars.com` | `Test@2024!Pass` | Route dispatching, courier task management |
| **Encoder** | `encoder1@stars.com` | `Test@2024!Pass` | Waybill data entry, airway bill consignment |
| **Courier** | `courier1@stars.com` | `Test@2024!Pass` | Parcel deliveries, recipient sign-off, POD submission |

*(See [DEFAULT_MANAGER.md](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/DEFAULT_MANAGER.md) for full account listings and password specifications.)*

---

## Automated Testing & Quality Assurance

STARS enforces strict automated test suites across both backend and frontend layers:

### Running Backend Unit & Integration Tests
```powershell
dotnet test backend/Tests/Backend.Tests.csproj
```
- **Backend Test Suite:** **1,120 tests passing (0 failures)** covering authentication, authorization, role stripping, task FSM, attachment security, DMS webhooks, FOMS ledger syncing, and all 21 security hardening domains.

### Running Frontend Vitest Suite
```powershell
npm --prefix frontend test -- --run
```
- **Frontend Test Suite:** **573 tests passing (0 failures)** across 57 test files covering components, modals, deep linking, role-based navigation, and analytics charts.

### Total Automated Test Coverage
$$\text{Total Test Suite} = 1,120\text{ (Backend)} + 573\text{ (Frontend)} = \mathbf{1,693\text{ Tests Passing (100\% Pass Rate)}}$$

---

## Project Team & Credits

| Role | Name | Responsibilities |
| :--- | :--- | :--- |
| **Project Manager** | Vanessa Reuteras | Project governance, milestone tracking, and stakeholder communication |
| **Scrum Master** | Vanessa Reuteras | Sprint planning, agile ceremony facilitation, and impediment removal |
| **Business Analyst** | Kenneth Yulip | Requirements engineering, domain analysis, and functional specifications |
| **Quality Assurance (QA)** | Kenneth Yulip | Test strategy, test case authoring, and verification validation |
| **Frontend Developer** | Hermione Benitez | React SPA architecture, UI/UX implementation, component engineering |
| **Backend Developer** | John Angelo Mikhail Reveche | ASP.NET Core API, EF Core data layer, security controls, and optimization |
| **System Integrator** | Hermione Benitez & John Angelo Mikhail Reveche | Cross-system integration (DMS & FOMS), cloud deployment, and infrastructure |

---

*Speedex Task Allocation and Recommendation System (STARS) &copy; 2026. All rights reserved.*
