# STARS — Speedex Task Allocation and Recommendation System

[![.NET 9](https://img.shields.io/badge/.NET-9.0-blue.svg)](https://dotnet.microsoft.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646cff.svg)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Neo4j](https://img.shields.io/badge/Neo4j-5.x-008cc1.svg)](https://neo4j.com/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ed.svg)](https://www.docker.com/)
[![Azure](https://img.shields.io/badge/Azure-Cloud_Ready-0078d4.svg)](https://azure.microsoft.com/)
[![Tests](https://img.shields.io/badge/Tests-1%2C683%20Passed-success.svg)](https://github.com/)

**STARS (Speedex Task Allocation and Recommendation System)** is an enterprise-grade workload management, task orchestration, and operational dispatch platform engineered for logistics, supply chain, and cross-departmental coordination. 

The system pairs a high-performance **ASP.NET Core 9 Web API** with an interactive **React 18 / TypeScript SPA**, integrating real-time **Change Data Capture (CDC)** pipelines to populate a **Neo4j graph database** for AI-assisted employee suitability recommendations, automated **Delivery Management System (DMS)** courier operations, and **Financial Operations Management System (FOMS)** accounts receivable workflows.

---

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Technology Stack](#technology-stack)
3. [Key Modules & Capabilities](#key-modules--capabilities)
   - [Task Lifecycle & Workload Management](#task-lifecycle--workload-management)
   - [AI & Graph Suitability Engine (CDC + Neo4j + LLM)](#ai--graph-suitability-engine-cdc--neo4j--llm)
   - [Delivery Management System (DMS) Integration](#delivery-management-system-dms-integration)
   - [Financial Operations Management System (FOMS) Integration](#financial-operations-management-system-foms-integration)
   - [Performance Evaluations & 360 Scorecards](#performance-evaluations--360-scorecards)
   - [Organizational Structure & User Administration](#organizational-structure--user-administration)
4. [Enterprise Security & OWASP Hardening](#enterprise-security--owasp-hardening)
5. [Cloud Infrastructure & Performance Optimizations](#cloud-infrastructure--performance-optimizations)
6. [Change Data Capture (CDC) Architecture](#change-data-capture-cdc-architecture)
7. [Getting Started & Local Setup](#getting-started--local-setup)
   - [Prerequisites](#prerequisites)
   - [Docker Compose Quickstart](#docker-compose-quickstart)
   - [Web Interfaces & Port Map](#web-interfaces--port-map)
   - [Default Accounts & Role Access](#default-accounts--role-access)
8. [Automated Testing & Quality Assurance](#automated-testing--quality-assurance)
9. [Project Team & Credits](#project-team--credits)

---

## Architectural Overview

STARS is architected as an event-driven, decoupled system separating high-speed OLTP operational workflows from compute-intensive graph analytics:

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                     STARS FRONTEND                     │
                                    │     React 18 + TypeScript + Vite 8 SPA (Nginx)         │
                                    └───────────────────────────┬────────────────────────────┘
                                                                │ HTTPS / WSS (SignalR)
                                                                ▼
                                    ┌────────────────────────────────────────────────────────┐
                                    │                      STARS BACKEND                     │
                                    │        ASP.NET Core 9 Web API (Kestrel 64-bit)         │
                                    │   - Claims-based JWT RBAC      - RateLimiter Shield    │
                                    │   - SecurityHeaders Middleware - IMemoryCache Probes   │
                                    │   - DbContext Pooling (80)     - Response Compression  │
                                    └──────────────┬────────────────────────────┬────────────┘
                                                   │                            │
                     ┌─────────────────────────────┼────────────────────────┐   │
                     │ PostgreSQL (OLTP)           │ Neo4j Bolt             │   │ External M2M
                     ▼                             ▼                        │   │ HTTPS
         ┌───────────────────────┐    ┌───────────────────────────┐         │   ▼
         │   PostgreSQL 16       │    │     Neo4j Graph Database  │         │ ┌─────────────────────────┐
         │ (WAL Logical Logging) │    │  - Suitability Traversal  │         │ │ DMS API (Waybills, POD, │
         └───────────┬───────────┘    │  - Workload & Rec. Scores │         │ │ Courier Status Webhook) │
                     │                └─────────────▲─────────────┘         │ └─────────────────────────┘
                     │ WAL                          │ Derived Insights      │
                     ▼                              │                       │ ┌─────────────────────────┐
         ┌───────────────────────┐    ┌─────────────┴─────────────┐         │ │ FOMS API (Accounts,     │
         │   Debezium Connector  │───>│ .NET 9 CDC Worker Service │         └>│ Ledger Sync, Invoices)  │
         │   (Logical Slot CDC)  │    │  (Consumes JSON Kafka)    │           └─────────────────────────┘
         └───────────┬───────────┘    └─────────────▲─────────────┘
                     │                              │
                     │ Topic Streams                │ Subscriptions
                     ▼                              │
         ┌──────────────────────────────────────────┴─────────────┐
         │                Apache Kafka (KRaft Mode)               │
         └────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Backend Framework** | ASP.NET Core 9 (`net9.0`) | High-throughput, cross-platform C# Web API |
| **Frontend Framework** | React 18.3 & TypeScript 5.5 | Single Page Application bundled with Vite 8.0 |
| **Operational Database** | PostgreSQL 16 | Relational storage with logical replication (`wal_level=logical`) |
| **Graph Database** | Neo4j 5.x | Graph database for employee-task suitability analysis |
| **Data Access / ORM** | EF Core 9 (Npgsql) | High-concurrency pooled DbContext (`AddDbContextPool`) |
| **Real-Time Engine** | ASP.NET Core SignalR | Bidirectional WebSockets for notifications and live board sync |
| **CDC Messaging** | Apache Kafka (KRaft) | Fault-tolerant event streaming buffer |
| **CDC Connector** | Debezium 2.x | Real-time PostgreSQL WAL change capture |
| **CDC Processor** | .NET 9 Worker Service | Background event consumer and Neo4j Cypher synchronizer |
| **AI / LLM Integration** | Groq API / Llama 3 | Natural language suitability rationale and SLA risk prediction |
| **UI & Styling** | Tailwind CSS & Tabler / Lucide | Modern design system, accessible modals, responsive dashboards |
| **Data Visualization** | Recharts | Performance scorecards, KPI drilldowns, delivery charts |
| **API Documentation** | OpenAPI 3.0 & Scalar | Interactive API exploration at `/scalar/v1` |
| **Reverse Proxy** | Nginx Alpine | Static asset hosting and reverse proxying |
| **Containerization** | Docker & Docker Compose | Multi-container local orchestration |
| **Cloud Runtime** | Microsoft Azure | App Service (Linux 64-bit container) + PostgreSQL Flexible Server |

---

## Key Modules & Capabilities

### Task Lifecycle & Workload Management
- **Finite State Machine (FSM):** Structured transitions: `Pending` &rarr; `In Progress` &rarr; `In Review` &rarr; `Completed` (or `Cancelled`).
- **Interactive Views:** Kanban Board with drag-and-drop workflow lanes, tabular sortable List View, and Deadline Calendar.
- **Priority Synchronization:** Automated task priority alignment across database rows and notification alerts.
- **Rich Task Metadata:** Subtasks, custom attachments with binary validation, audit logs, comments with soft deletion, and reusable task templates.

### AI & Graph Suitability Engine (CDC + Neo4j + LLM)
- **Why Graph Database?** Traditional relational queries requiring 6-table joins (`Tasks`, `TaskAssignments`, `Users`, `Departments`, `Recommendations`) degrade as data scales. Neo4j stores connections as physical pointers, transforming slow multi-table scans into instantaneous pointer traversals.
- **Weighted Suitability Formula:**
  $$\text{Suitability Score} = (0.35 \times \text{Workload Factor}) + (0.25 \times \text{Experience Factor}) + (0.40 \times \text{Recommendation Score})$$
- **Groq AI Rationale:** Pairs graph analytical scores with an LLM reasoning engine to output conversational justifications for employee task assignment.
- **Biomarker & SLA Risk Forecasting:** Automated early-warning indicators identifying tasks at risk of breach before deadline expiration.

### Delivery Management System (DMS) Integration
- **Outbound Dispatch:** STARS initiates M2M outbound delivery orders to DMS over HTTPS, returning auto-generated waybills (`WB-YYYY-XXXXXX`).
- **Live Courier Tracking Webhook:** Inbound M2M status webhook (`POST /api/integration/dms/status`) synchronously updates parcel coordinates, recipient verification details, driver pairing, and tracking milestones.
- **Automated Failure Follow-up:** Failed delivery and failed pickup webhooks automatically spawn coordinator follow-up tasks in STARS with intelligent deduplication and remark appending.
- **Order Cancellation Sync:** Cancellation triggers preserve task FSM integrity, append cancellation audit remarks, and alert department coordinators.
- **Proof of Delivery (POD):** Secure byte-stream retrieval of scanned or photographed POD files.

### Financial Operations Management System (FOMS) Integration
- **Accounts Receivable Ledger Sync:** Direct synchronization of client ledger records, invoice amounts, due dates, and billing states.
- **Endorsement & Dispute Resolution:** Seamless escalation of disputed invoices into STARS collection tasks assigned to designated account coordinators.
- **Liquidation Corrections:** In-app submission and tracking of liquidation adjustments with audit records.
- **Live Financial Dashboards:** Aggregated overdue accounts, liquidation summaries, and collection performance metrics.

### Performance Evaluations & 360 Scorecards
- **Evaluation Cycles:** Formal review periods for departments, teams, or individual staff members.
- **Customized Evaluation Templates:** Dynamic scoring criteria across Timeliness, Work Quality, and Communication.
- **Interactive Scorecards & KPI Drilldowns:** Visual breakdown of employee metrics, rating distributions, and historical progression.

### Organizational Structure & User Administration
- **Multi-System User Onboarding:** Unified creation of accounts provisioned across STARS, DMS, and FOMS with system-scoped permissions.
- **Hierarchical Department & Team Management:** Department trees, job position linkages, and coordinator oversight.
- **Account Archiving & Deactivation:** Safe account archiving preserving task history and audit trail integrity without hard deletions.

---

## Enterprise Security & OWASP Hardening

STARS is audited against the **OWASP Top 10 (2021/2025)** and **CWE** standards, maintaining a 100% remediation posture:

| Vulnerability Domain | CWE Reference | STARS Architectural Defense |
| :--- | :--- | :--- |
| **Mass Assignment Protection** | CWE-269, CWE-915 | `UserService.cs` strips administrative fields (`Role`, `DepartmentId`, `AllowedSystems`, etc.) when self-updating non-manager profiles. |
| **HTTP Security Headers & HSTS** | CWE-693, CWE-1021 | Centralized `SecurityHeadersMiddleware.cs` enforces `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, and production `Strict-Transport-Security`. |
| **Strict CORS Lockdown** | CWE-942 | `CorsPolicyHelper.cs` replaces wildcards with an immutable canonical whitelist for trusted domains with credentials isolation. |
| **Host Header Link Sanitization** | CWE-601, CWE-644 | `EmailVerificationController.cs` validates `Origin` and `Referer` headers against the approved CORS whitelist before building verification links. |
| **BOLA / IDOR Attachment Guard** | CWE-639 | `AttachmentService.cs` verifies requester ownership, assignment, or department membership before streaming files. |
| **Cryptographic Token Hashing** | CWE-312, CWE-916 | `TokenHasher.cs` hashes refresh tokens, password reset tokens, and email verification tokens with SHA-256 prior to PostgreSQL persistence. |
| **Secrets Hygiene** | CWE-798 | All API keys and secrets in `appsettings.json` are blanked out in source control and bound at runtime via environment variables. |
| **Session Invalidation & Timeout** | CWE-613 | `SessionTimeoutMiddleware.cs` enforces inactivity expiration and returns HTTP 401 `SESSION_TERMINATED` on logged-out sessions, preventing revival. |
| **Anti-Enumeration Responses** | CWE-204, CWE-200 | Authentication and password recovery endpoints return standardized, uniform success responses to prevent account discovery. |
| **Magic Byte File Inspection** | CWE-434 | `FileSignatureValidator.cs` inspects binary headers for PDF (`%PDF-`), PNG, JPEG, and Office Open XML formats. |
| **Software Composition (SCA)** | CWE-1395 | Frontend `npm audit` reports **0 vulnerabilities**; backend NuGet dependencies pinned to secure patches (`System.Security.Cryptography.Pkcs 8.0.2`). |

---

## Cloud Infrastructure & Performance Optimizations

STARS is optimized for **Microsoft Azure** cloud deployments (Azure App Service + Azure Database for PostgreSQL Flexible Server):

- **AlwaysOn Enabled:** Prevents idle container recycling, eliminating cold-start latency spikes.
- **64-bit Kestrel Runtime:** Expands CLR address space and unlocks full multi-core threadpools for heavy PBKDF2 cryptography.
- **HTTP/2.0 Multiplexing:** Enables concurrent bidirectional request streaming over single persistent TCP connections.
- **Database Connection Pooling:** Implements `AddDbContextPool<AppDbContext>(poolSize: 80)` with tuned connection builder properties (`MaxPoolSize = 75`, `MinPoolSize = 10`, `ConnectionLifetime = 300`).
- **PostgreSQL Capacity:** Configured `max_connections = 100` on PostgreSQL Flexible Server.
- **Health Check Decoupling:** Employs `IMemoryCache` (10s TTL) on `/api/health` and provides a zero-DB probe at `/api/health/live`, eliminating pool starvation under Azure health probes.
- **Authentication Shielding:** Sliding-window rate limiting on `POST /api/auth/login` (30 req/min per IP, queue limit 10) rejecting brute-force floods with fast `HTTP 429` responses.
- **Query Optimization:** Eliminates N+1 queries in task listings via eager `.Include(...)`, `.AsNoTracking()`, and consolidated status count queries; composite B-tree indexes on `(Status, AssignedDepartmentId, Deadline)`, `CreatedAt`, and `DmsWaybillNo`.

---

## Change Data Capture (CDC) Architecture

The CDC pipeline continuously replicates operational data into Neo4j without adding query overhead or latency to the primary API:

```
PostgreSQL (Source OLTP)
   │
   │  1. Row-level transaction committed to Write-Ahead Log (WAL)
   ▼
Debezium Connector (Kafka Connect)
   │
   │  2. Reads logical replication slot ('stars_cdc_slot') via 'pgoutput'
   │  3. Formats change events into JSON envelopes (before/after/source)
   ▼
Apache Kafka (Event Buffer)
   │
   │  4. Buffered in partition topics: 'stars.public.Users', 'stars.public.Tasks', etc.
   ▼
.NET 9 CDC Processor (Worker Service)
   │
   │  5. Background consumer polls topics and calculates derived aggregates:
   │     - Workload = Active assignment count (Status: Pending / InProgress / InReview)
   │     - Experience = Completed task count by classification
   │     - Recommendation = Average timeliness, quality, communication scores
   ▼
Neo4j Graph Database
   │
   │  6. Executes idempotent Cypher MERGE queries to maintain live graph topology
   ▼
Suitability Service
      7. Traverses direct graph pointers for instant top-5 candidate recommendations
```

---

## Getting Started & Local Setup

### Prerequisites
- **Docker Desktop** (Engine 24+, Compose v2+)
- **System Memory:** 8 GB RAM minimum (16 GB recommended for full Kafka + Neo4j stack)
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

To trigger an immediate synchronization in the CDC pipeline after modifying database records:
```powershell
docker compose restart cdc-processor
```

### Web Interfaces & Port Map

| Service | Local URL | Default Credentials | Description |
| :--- | :--- | :--- | :--- |
| **STARS Web App** | `http://localhost` | — | React 18 SPA served via Nginx |
| **STARS API (Scalar Docs)** | `http://localhost:5100/scalar/v1` | — | Interactive OpenAPI documentation |
| **PostgreSQL (pgAdmin)** | `http://localhost:5050` | `stars@admin.com` / `starslab!` | Relational database administration |
| **Neo4j Browser** | `http://localhost:7474` | `neo4j` / `starslab!` | Cypher query console and graph viewer |
| **Kafka UI** | `http://localhost:8081` | — | Topic browser, consumer lag, and event inspector |

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

STARS enforces strict pre-commit test validation across both backend and frontend layers:

### Running Backend Unit & Integration Tests
```powershell
dotnet test backend/Tests/Backend.Tests.csproj
```
- **Backend Test Suite:** **1,110 tests passing (0 failures)** covering authentication, authorization, role stripping, task FSM, attachment security, DMS webhooks, and FOMS ledger syncing.

### Running Frontend Vitest Suite
```powershell
npm --prefix frontend test -- --run
```
- **Frontend Test Suite:** **573 tests passing (0 failures)** across 57 test files covering components, modals, deep linking, role-based navigation, and analytics charts.

### Total Automated Test Coverage
$$\text{Total Test Suite} = 1,110\text{ (Backend)} + 573\text{ (Frontend)} = \mathbf{1,683\text{ Tests Passing (100\% Pass Rate)}}$$

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
| **System Integrator** | Hermione Benitez & John Angelo Mikhail Reveche | Cross-system integration (DMS & FOMS), CDC pipelines, and deployments |

---

*Speedex Task Allocation and Recommendation System (STARS) &copy; 2026. All rights reserved.*
