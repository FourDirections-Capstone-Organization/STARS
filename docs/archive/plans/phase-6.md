# Performance Evaluation with AI Recommendations – Implementation Plan

**Feature branch:** `feature/performance-evaluation` | **Step branches:** `step-N-<short-name>`

> [!IMPORTANT]
> Never push to `refactoring/bug-fix` directly. All steps land on `step-N-*`, then merge into `feature/performance-evaluation`.

---

## Findings so far
- **Groq/LLM:** `GroqSuitabilityService` + `GroqSettings` already exist; reuse HTTP client, key resolution, and chat models.
- **KPI callable per employee:** `IKpiCalculationEngine.CalculateEmployeeKpiAsync(employeeId, start, end)` exists and returns `OverallScore` (0–100) — usable as the KPI section score.
- **Charting:** Recharts `^3.8.1` already installed; reuse for all three charts.
- **Export:** `KpiExportService` uses ClosedXML (Excel/PDF). CSV export for this feature is plain text — no new library needed.
- **Roles:** `ManagerOnly` and `CoordinatorAndAbove` policies exist in `AuthorizationPolicies`. No `HR` role in `UserRole` enum.
- **AppDbContext + EF migrations pattern:** established; startup DDL pattern exists in `Program.cs`.

---

## Open Questions / Assumptions

| # | Question | Assumption |
|---|----------|------------|
| 1 | **LLM provider & data policy:** Is Groq the approved provider for de-identified performance data? | Assume yes — reuse `GroqSettings`; de-identified payload (role title, criterion names+scores, KPI codes+values, trimmed comments only). |
| 2 | **AI text in CSV:** Spec says "do not include AI text unless approved" but does not define the approved column format. | Omit AI columns from CSV in Step 7; add in a follow-up once product owner specifies column name/format. |
| 3 | **HR role:** `UserRole` has no `HR` value; spec mentions "HR review" stage. | `HrReview → Acknowledgment` transition is available to any `Manager`; flag for product owner — may need new `HrOfficer` value. |
| 4 | **Charting library:** Already confirmed — Recharts `^3.8.1`. | No new library needed. |
| 5 | **Template / band changes on open vs. finalized reviews:** Spec says scores are not stored on open reviews, so band changes apply immediately. | Open reviews: live re-compute on every load (no freeze). Finalized reviews: `FrozenScoresJson` snapshot is immutable; band changes have no effect. |

---

## Steps

- [x] Step 1: Domain models — templates, reviews, ratings, AI recommendation, development plan
  - Files: `backend/Models/EvaluationTemplate.cs`, `EvaluationSection.cs`, `EvaluationCriterion.cs`, `RatingBand.cs`, `PerformanceReview.cs`, `CriterionRating.cs`, `AiRecommendation.cs`, `DevelopmentPlanItem.cs`, `backend/Models/Enums/CriterionType.cs` (Standard, KpiLinked), `ReviewWorkflowStatus.cs` (Draft→SelfAssessment→ManagerReview→HrReview→Acknowledgment→Finalized), `ReviewScope.cs`, `AiRecommendationStatus.cs` (Pending, Approved, Rejected, ManualOverride)
  - Verify: `dotnet build backend/Backend.csproj` succeeded with 0 errors; full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 842 passed, 0 failed.

- [x] Step 2: EF Core config, DbSets, and migration
  - Files: `backend/Data/AppDbContext.cs` (DbSets + OnModelCreating: unique index on CriterionRating(ReviewId,EmployeeId,CriterionId), index on WorkflowStatus, FrozenScoresJson as `text`), `backend/Data/DatabaseStartupDdl.cs` (idempotent DDL + migration history entry), `backend/Program.cs` (startup DDL log)
  - Run: `dotnet ef migrations add AddPerformanceEvaluation --project backend` (generated `20261030052606_AddPerformanceEvaluation`)
  - Verify: PostgreSQL SQL generation verified (`dotnet ef migrations script`); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 848 passed, 0 failed.

- [x] Step 3: Scoring service — single server-side source of truth (security: server-side-only, frozen bypass)
  - Files: `backend/Modules/PerformanceEvaluation/IPerformanceReviewScoringService.cs`, `PerformanceReviewScoringService.cs`, `backend/Models/DTOs/PerformanceEvaluationDTOs.cs` (CriterionScoreDTO, SectionScoreDTO, EmployeeReviewScoreDTO, ReviewResultDTO)
  - Rules: non-KPI section score = Σ(managerScore×weight)/Σ(weight) normalized to 0–100; KPI section = `IKpiCalculationEngine.CalculateEmployeeKpiAsync().OverallScore`; weighted final = Σ(sectionScore×sectionWeight)/Σ(sectionWeight); rating label from RatingBand; outlier flag when |self−manager| ≥ 2; if Finalized deserialize FrozenScoresJson. Extensibility: new CriterionType = 1 enum value (Step 1) + 1 scorer `case`.
  - Verify: xUnit tests in `backend/Tests/Analytics/PerformanceReviewScoringTests.cs` (19 test invocations across 10 scenarios including standard, KPI passthrough, outlier, band boundary, frozen bypass, zero-weight, missing ratings, multi-employee, KPI-linked metric extraction, and DB freeze persistence); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 867 passed, 0 failed.

- [x] Step 4: Workflow + template services and DI registration (security: server-side state enforcement, ManagerOnly)
  - Files: `backend/Modules/PerformanceEvaluation/ReviewWorkflowService.cs` + interface (illegal transitions return 422; Finalize freezes scores via scoring service), `EvaluationTemplateService.cs` + interface (CRUD; validate section weights sum 100±0.5%, criterion weights per section sum 100±0.5%, ≤1 IsKpiSection, non-overlapping RatingBands; block update when template in use by non-Draft review), `backend/Program.cs` (register all PE scoped services)
  - Verify: unit tests in `backend/Tests/Analytics/ReviewWorkflowServiceTests.cs` and `EvaluationTemplateServiceTests.cs` (illegal transitions like Draft→Finalized return 422; Finalize triggers scoring service freeze writing non-null JSON snapshot; weight tolerances 100±0.5%, ≤1 KPI section, non-overlapping rating bands, and in-use review guards verified); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 912 passed, 0 failed.

- [x] Step 5: Performance Evaluation controller — templates, reviews, scoring, workflow (security: ManagerOnly policy, CanAccessEmployeeData guard mirrors KpiController)
  - Files: `backend/Controllers/PerformanceEvaluationController.cs` — `GET/POST/PUT/DELETE /api/performance/templates`, `POST /api/performance/reviews`, `GET /api/performance/reviews` (filter by status/scope/date), `GET /api/performance/reviews/{id}` (returns ReviewResultDTO), `PUT /api/performance/reviews/{id}/ratings` (self-score in SelfAssessment; manager-score in ManagerReview), `POST /api/performance/reviews/{id}/transition`, `GET /api/performance/reviews/{id}/score`
  - Verify: integration tests in `backend/Tests/Analytics/PerformanceEvaluationControllerTests.cs` (26 test scenarios: CRUD round-trip for templates and reviews, 403 on cross-employee review, score, ratings, and transition access, workflow stage enforcement for Draft, SelfAssessment, ManagerReview, and Finalized stages, ratings boundary checks); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 938 passed, 0 failed.

- [x] Step 6: AI recommendation service (security: de-identified payload, validated JSON, no score/workflow mutation)
  - Files: `backend/Modules/PerformanceEvaluation/AiRecommendationGenerationService.cs` + interface + `AiRecommendationModels.cs` (PerformanceAiPayload: roleTitle, criterionScores, kpiSnapshot, trimmedComments ≤500 chars — NO name/ID; PerformanceAiResponse: summary, strengths[], improvementAreas[], actionItems[{description,successMeasure,timeframe}], trainingTopics[])
  - Reuse: `GroqSettings`, `GroqChatRequest/Response/Message`, HTTP client factory. Override MaxTokens=2048. System prompt enforces `json_object` response_format, rejects injection, forbids score/workflow change. Server validates all required fields; persist with Status=Pending; Status=ManualOverride on Groq failure. Extensibility: new AI output section = 1 new field in PerformanceAiResponse + 1 new line in system prompt. Endpoints in controller: `POST /api/performance/reviews/{reviewId}/ai-recommend/{employeeId}` (Manager only), `PUT` same path (approve/reject/edit).
  - Verify: unit tests in `backend/Tests/Analytics/AiRecommendationServiceTests.cs` (13 scenarios: mock Groq HTTP with MaxTokens=2048 verification, JSON schema validation, PII exclusion assertions, 500-char comment trimming, fallback on HTTP 500 / network failure / unconfigured API key to ManualOverride, 422 on disabled template, non-mutation of review score and workflow status, controller authorization and endpoints); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 956 passed, 0 failed.

- [x] Step 7: Development plan endpoints + CSV export service (security: ManagerOnly plan creation; employee for completion; CSV injection guard; permission-scoped export)
  - Files: controller extensions (`GET/POST /api/performance/reviews/{reviewId}/development-plan/{employeeId}`, `PUT /api/performance/development-plan/{itemId}`, `GET /api/performance/employees/{employeeId}/development-plan`); `backend/Modules/PerformanceEvaluation/PerformanceReviewCsvExportService.cs` + interface — calls scoring service (no duplicated logic); columns: Employee,EmployeeNumber,Department,JobPosition,Section,Criterion,SelfScore,ManagerScore,Gap,IsOutlier,ManagerComment,WeightedFinalScore,RatingLabel; CSV injection guard (prefix `=+-@` cells with `'`); RFC 4180 quoting; AI text excluded; `GET /api/performance/reviews/{id}/export/csv`
  - Verify: unit tests in `backend/Tests/Analytics/PerformanceReviewCsvExportAndDevelopmentPlanTests.cs` (35 test scenarios: injection guard `=SUM(1,2)` -> `'=SUM(1,2)'`, RFC-4180 quoting and escaping, live vs. frozen historical values, 403 on cross-employee review export / dev plan access / update, plan creation blocked with 422 when AI recommendation is Pending, employee completes own items only); full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed.

- [x] Step 8: Frontend types, service, and template management UI (Settings sub-tab)
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/types.ts`, `frontend/src/services/performanceEvaluationService.ts` (all API functions: templates, reviews, ratings, transitions, AI, plan, CSV export), `EvaluationTemplateTab.tsx`, `EvaluationTemplateEditor.tsx` (section accordion, criterion rows, weight-sum banners, AI toggle, KPI-section radio, rating band table), `PerformanceEvaluation.css`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` (add Evaluation Templates Settings sub-tab), `frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/index.ts`
  - Verify: vitest suite in `frontend/src/test/EvaluationTemplates.test.tsx` (10 scenarios: list rendering, badges, filters, New Template mode, Edit mode, populated initial data, dynamic weight calculation banner, adding/removing criteria, toggling AI recommendations, mutually exclusive KPI-section radio, Save form submission, validation error summaries) and `frontend/src/test/performanceEvaluationService.test.ts` (19 scenarios covering all API functions); full frontend test suite (`npm --prefix frontend test`) verified with 33 files and 292 tests passed, 0 failed; production build (`npm --prefix frontend run build`) verified clean with 0 errors; full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed.

- [x] Step 9: Review list, creation, detail, and rating grid UI
  - Files: `PerformanceReviewTab.tsx` (date-range picker, scope selector, template selector, status badges, pagination), `ReviewDetailView.tsx` (workflow status bar, Advance Stage button), `RatingGrid.tsx` (employee×criterion rows: self-score 1–5 dropdown, manager-score 1–5 dropdown, computed gap, outlier badge when |self−manager|≥2, comment textarea; KPI section row read-only with live KPI score and metrics tooltip), `OpAdmin_Dashboard.tsx` (add Performance Reviews tab)
  - Verify: vitest suite in `frontend/src/test/PerformanceReviews.test.tsx` (8 scenarios: list rendering, badges, status & query filters, create review cycle modal submission, workflow progression stepper, stage advance confirmation, rating grid rendering, live gap and outlier computation on score dropdown change, read-only KPI metrics section, and ratings save submission); full frontend test suite (`npm --prefix frontend test`) verified with 34 files and 300 tests passed, 0 failed; production build (`npm --prefix frontend run build`) verified clean with 0 errors; full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed.

- [x] Step 10: AI recommendation panel and development plan panel UI
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/AiRecommendationPanel.tsx` (Generate button disabled if isAiEnabled=false; spinner; structured result: summary, strengths, improvement areas, action items table, training topics; inline edit + Approve/Reject; ManualOverride textarea; employee sees panel only when status=Approved), `DevelopmentPlanPanel.tsx` (manager: Create Plan button after approval with AI action item import; employee: checklist with Mark Complete; prior-cycle open items carryover banner), `ReviewDetailView.tsx` (sub-tab bar for Ratings / AI Recommendations / Development Plan), `PerformanceEvaluation.css`, `index.ts`
  - Verify: vitest suite in `frontend/src/test/AiRecommendationAndDevPlan.test.tsx` (11 scenarios: structured AI result rendering, disabled Generate button when isAiEnabled=false, AI generation trigger, inline editing and approval workflow, employee view restriction to Approved recommendations, plan checklist rendering, carryover banner for open items from prior cycles, toggle complete checkbox, manager plan builder with AI action items import, Pending AI guard blocking plan creation, and ReviewDetailView sub-tab navigation); full frontend test suite (`npm --prefix frontend test`) verified with 35 files and 311 tests passed, 0 failed; production build (`npm --prefix frontend run build`) verified clean with 0 errors; full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed.

- [x] Step 11: CSV export button and three charts (Recharts; same scored data as review screen, no extra API calls)
  - Files: `ReviewExportBar.tsx` (Export CSV, blob download pattern from kpiService.ts), `charts/CriterionComparisonChart.tsx` (BarChart grouped: self vs. manager per criterion; employee dropdown in team scope), `charts/RatingDistributionChart.tsx` (PieChart rating-label counts; team scope only, else placeholder), `charts/SectionBreakdownChart.tsx` (BarChart per employee; KPI section highlighted with distinct color); wired all three charts into `ReviewDetailView.tsx` Charts & Analytics tab with reactive date and scope filtering; exported all components in `index.ts`.
  - Verify: vitest suite in `frontend/src/test/PerformanceEvaluationCharts.test.tsx` (14 scenarios: date/scope filter updates, CSV export blob download, criterion comparison grouped bars with outlier alert, rating distribution pie chart in team scope with individual placeholder, section breakdown with highlighted KPI section, snapshot tests for all 3 charts and review detail tab integration); full frontend test suite (`npm --prefix frontend test`) verified with 36 files and 325 tests passed, 0 failed; production build (`npm --prefix frontend run build`) verified clean with 0 errors; full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed.

- [x] Step 12: Full backend and frontend test suites
  - Run: `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release` and `npm --prefix frontend test`
  - Fix any regressions from new DI registrations, context changes, or controller additions.
  - Verify: full backend test suite (`dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`) verified with 991 passed, 0 failed; full frontend test suite (`npm --prefix frontend test`) verified with 36 test files and 325 tests passed, 0 failed; production build (`npm --prefix frontend run build`) verified clean with 0 errors.
