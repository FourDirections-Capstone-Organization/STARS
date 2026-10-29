# STARS Project Rules & Engineering Guidelines

## 1. Project Overview & Architecture

**STARS** (Speedex Task Allocation and Recommendation System) is a multi-system enterprise application providing task management, suitability recommendations, CDC data streaming, and external integrations (DMS, FOMS).

### Tech Stack & Components
- **Backend**: ASP.NET Core 9 (`net9.0`) Web API, C#.
  - Persistence: Entity Framework Core 9 (`Npgsql.EntityFrameworkCore.PostgreSQL`).
  - Graph Engine: Neo4j (via `Neo4j.Driver`) for graph-based employee recommendation and suitability scoring.
  - Document & Export: QuestPDF, ClosedXML.
  - Real-time: SignalR Hubs (`/hubs`).
  - Auth: JWT Bearer authentication, role-based access control (RBAC), multi-system credentials.
- **Frontend**: React 18, TypeScript 5.6, Vite 8.
  - UI Frameworks: Material UI (`@mui/material`), Tabler Icons (`@tabler/icons-webfont`), Lucide React.
  - Visualization: Recharts.
  - HTTP & Routing: Axios, React Router v7.
  - Testing: Vitest, React Testing Library, happy-dom / jsdom.
- **CDC Pipeline**:
  - PostgreSQL 16 logical replication (WAL `stars_cdc`) → Debezium Kafka Connect.
  - Message Broker: Apache Kafka (KRaft mode).
  - CDC Processor: .NET 9 Worker Service (`cdc-processor/`) consuming Kafka events and populating Neo4j graph nodes & relationships.
- **Containerization**: Docker Compose (`db`, `backend`, `frontend`, `neo4j`, `kafka`, `debezium`, `kafka-ui`, `cdc-processor`, `pgadmin`).

---

## 2. Standard Build & Test Commands

Always verify commands in their designated directory or pass appropriate paths:

### 2.1 Backend Commands
- **Restore**:
  ```powershell
  dotnet restore backend/Backend.csproj
  ```
- **Build**:
  ```powershell
  dotnet build backend/Backend.csproj --configuration Release
  ```
- **Run Unit & Integration Tests**:
  ```powershell
  dotnet test backend/Tests/Backend.Tests.csproj --configuration Release
  ```
  *(Baseline: 506 tests passing)*

### 2.2 Frontend Commands
- **Install Dependencies**:
  ```powershell
  npm --prefix frontend ci
  ```
- **Build**:
  ```powershell
  npm --prefix frontend run build
  ```
- **Run Tests**:
  ```powershell
  npm --prefix frontend test
  ```
  *(Baseline: 52 tests passing across 10 test suites)*

### 2.3 Docker & Services
- **Start All Services**:
  ```powershell
  docker compose up -d
  ```
- **Trigger CDC Sync**:
  ```powershell
  docker compose restart cdc-processor
  ```

---

## 3. Mandatory Repository Rules

### Rule 1: NEVER Push Directly to `refactoring/bug-fix`
- **Reason**: The GitHub workflow `.github/workflows/refactoring-bug-fix_stars.yml` triggers on any push to `refactoring/bug-fix` and **immediately deploys the backend to Azure Web App 'STARS' (Production Slot)**.
- **Constraint**: Pushing incomplete, untested, or intermediate step code to `refactoring/bug-fix` will break production.
- **Enforcement**: Direct pushes to `refactoring/bug-fix` are strictly prohibited. All changes must be completed, verified, and staged on dedicated branches first.

### Rule 2: One Branch per Step (`step-N-<short-name>`)
- For multi-step tasks or plans in `docs/PLAN.md`:
  1. Create or identify the parent feature/working branch (e.g., `feature/<name>` or `fix/<name>`).
  2. For each individual step, checkout a dedicated step branch:
     ```powershell
     git checkout -b step-N-<short-name>
     ```
  3. Implement **only** that step's exact scope. Do not touch or modify files intended for subsequent steps.
  4. Once tests pass, merge the step branch into the parent feature branch.

### Rule 3: Run Tests Before Every Commit
- **Zero Broken Tests**: No commit may be created that causes test failures.
- **Context-Aware Testing Scope**:
  - If backend code was modified (`backend/**`): Run `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`.
  - If frontend code was modified (`frontend/**`): Run `npm --prefix frontend test`.
  - If both were modified: Run both test suites.
- **Automated Issue Prevention**: `ci.yml` runs on every branch and will automatically open public GitHub bug issues on test failure. Pre-commit test runs ensure our CI remains clean.

### Rule 4: 3-Attempt Failure Limit
- If tests fail after an implementation change:
  - Analyze the error log and make an informed fix.
  - Re-run the relevant test suite.
  - If tests fail after **3 consecutive fix attempts**, **STOP IMMEDIATELY**.
  - Document the failure reason, keep the current diff intact, and ask the user for guidance before making any further edits.

### Rule 5: Keep `docs/PLAN.md` Synchronized
- Every plan step must be checked off (`- [x] Step N: ...`) only after tests pass and changes are committed.
- After completing a step, provide a concise summary of:
  - Files modified, created, or deleted.
  - Tests executed and pass status.
  - The next pending step in `docs/PLAN.md`.

### Rule 6: Gated Promotion to `refactoring/bug-fix`
- Merging to `refactoring/bug-fix` is permitted **only** when:
  1. All steps in `docs/PLAN.md` are marked complete (`- [x]`).
  2. Full backend tests pass (`dotnet test`).
  3. Full frontend tests pass (`npm test`).
  4. The user has explicitly approved promoting the finished feature branch to `refactoring/bug-fix`.

---

## 4. Planning Documents
- `docs/ROADMAP.md` exists only while a large feature is in progress. It holds the goal, design notes, decisions, and phases, not detailed steps.
- `docs/PLAN.md` holds the steps for the current phase or task only, never for later phases.
- Never plan or implement a later phase unless the user asks.
- When a phase finishes: tick the phase in `docs/ROADMAP.md`, add a summary of at most 3 lines under it, and move the finished plan to `docs/archive/plans/phase-N.md`.
- When all phases finish: set "Status: Complete" in `docs/ROADMAP.md` and ask the user before archiving it to `docs/archive/`.
- No secrets or credentials in any docs file.
