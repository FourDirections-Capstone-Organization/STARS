# Groq Refactoring Plan: Employee Suitability

**Target Feature Branch**: `feature/groq-employee-suitability`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved)

## Findings (Step 1)
- **Workload**: Count of active tasks (`Status` in Pending, Assigned, InProgress, OnHold; not Completed/Cancelled) in `TaskAssignments` + `Tasks`.
- **Routine/Special XP**: Count of Completed tasks in `TaskAssignments` + `Tasks` partitioned by `Classification` (0=RoutineDailyTask, 1=SpecialTask).
- **3 Rating Scores**: Average scores from `Recommendations` table (`Category`: 0=Timeliness, 1=WorkQuality, 2=Communication) divided by total recommendations.
- **5 Endpoints**: `GET /api/tasks/{id}/suitability`, `GET /api/tasks/{id}/suitability/{empId}/explain`, `GET /api/suitability/preview`, `GET /api/admin/expert-system/config`, `PUT /api/admin/expert-system/config`.
- **FOMS Graph Routing**: In `FomsIntegrationService.cs:444`, routes overdue collection tasks using direct PostgreSQL EF Core query by lowest active coordinator workload.
- **5 Test Suites**: `ExpertSystemConfigAdminTests` (10 tests), `ExpertSystemWeightTests` (7 tests), `SuitabilityExplanationTests` (4 tests), `SlaRiskPredictionTests` (8 tests), `MlRetrainTests` (6 tests).

## Goal
Replace ML suitability evaluation with Groq Cloud API, then remove legacy CDC, Kafka, and Neo4j infrastructure.

## Out of scope
Core task CRUD, RBAC, authentication, DMS/FOMS operational business logic, and document export services.

## Design notes
- Groq calls run in backend GroqSuitabilityService; API key stored in appsettings.json / GROQ_API_KEY env var.
- Candidate metrics query PostgreSQL via EF Core directly, replacing Neo4j and CDC data pipelines.
- Structured JSON schema response (employeeId, rank, score, rationale) validated via System.Text.Json.
- Server-side SHA-256 cache (task attributes + candidate IDs) prevents redundant Groq calls on repeat clicks.
- System prompt strictly restricts inputs to verified system metrics and enforces refusal of off-topic queries.

## Decisions to confirm
- Legacy engine: completely remove ML.NET & Neo4j code or keep behind a temporary feature switch?
- Failure handling: fallback to PostgreSQL heuristic score vs. user-facing graceful alert on Groq rate limits?
- Privacy & payload: confirm sending anonymized candidate IDs, roles, workload, and ratings without PII.

## Implementation Steps

- [x] Step 1: Map starting indicators from Neo4j, CDC, and Graph Routing, with call sites and test suites
  - Verify: Workload, routine/special XP, 3 rating scores, 5 endpoints, and 5 test suites confirmed without guesswork

- [x] Step 2: Implement backend Groq service with config key binding, JSON schema validation, and cache
  - Verify: Unit tests confirm prompt construction, API key isolation, JSON parsing, and cache hits without remote calls

- [x] Step 3: Implement direct PostgreSQL metric queries and replace Neo4j suitability service with Groq
  - Verify: Controller integration tests confirm suitability evaluation from PostgreSQL data without Neo4j calls

- [x] Step 4: Add Employee Suitability trigger button with anti-spam caching in TaskModal and AIAssignmentView
  - Verify: Button triggers evaluation on demand; repeat clicks reuse cached recommendations without refetching

- [ ] Step 5: Update suitability display UI to show Groq recommendations, ranks, and bias-free explanations
  - Verify: Recommended employees render with AI rationale matching only system metrics in frontend components

- [ ] Step 6: Remove ML.NET FastTree SLA risk model files, training service, and obsolete ML test suites
  - Verify: Backend compiles cleanly without Microsoft.ML dependencies while retaining updated test assertions

- [ ] Step 7: Delete CDC Processor project, Debezium, Kafka, and Neo4j configurations from docker-compose
  - Verify: Solution builds without cdc-processor and Neo4j references; docker-compose config validates cleanly

- [ ] Step 8: Run full backend and frontend test suites to ensure zero regressions
  - Verify: All dotnet test (Release) and npm test suites pass with zero failures
