# Performance Evaluation & Employee AI Improvement Recommendations – Plan

**Feature branch:** `feature/employee-performance-ai` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Out of scope
Redesigning unrelated employee dashboard tabs, modifying FOMS reports, or altering task execution workflows.

## Findings so far
- Models, DbSets, scoring, workflow, Groq LLM, & CSV export exist in backend/Modules/PerformanceEvaluation & Controllers.
- Configurable KPI engine IKpiCalculationEngine.CalculateEmployeeKpiAsync(employeeId, start, end) is callable per employee/period.
- Existing Groq LLM integration (GroqSuitabilityService, GroqSettings) is reusable; no new tables or fields needed.
- Recharts ^3.8.1 installed; ClosedXML & plain-text CSV export exist with formula-injection guard.
- Employee tab exists as "My Scorecard" in OpEmployee_Dashboard.tsx & EmployeeScorecardView.tsx; needs rename & AI advice.

## Steps

- [ ] Step 1: Verify and configure evaluation domain models, relationships, and EF Core migration
  - Files: backend/Models/EvaluationTemplate.cs, PerformanceReview.cs, CriterionRating.cs, AiRecommendation.cs, DevelopmentPlanItem.cs, backend/Data/AppDbContext.cs
  - Verify: dotnet build backend/Backend.csproj succeeds and EF schema matches existing startup DDL migrations

- [ ] Step 2: Implement review scoring engine with KPI linkage, bands, and outlier detection (extensibility: new criterion type is one enum value plus one scorer case)
  - Files: backend/Modules/PerformanceEvaluation/IPerformanceReviewScoringService.cs, PerformanceReviewScoringService.cs, backend/Models/DTOs/PerformanceEvaluationDTOs.cs
  - Verify: Unit tests in backend/Tests/Analytics/PerformanceReviewScoringTests.cs pass (normalized scores, KPI passthrough, outlier flag, frozen bypass)

- [ ] Step 3: Implement review workflow and controller endpoints (security: server-side workflow enforcement, manager permission limits on review and export)
  - Files: backend/Modules/PerformanceEvaluation/ReviewWorkflowService.cs, EvaluationTemplateService.cs, backend/Controllers/PerformanceEvaluationController.cs
  - Verify: Unit tests in backend/Tests/Analytics/ReviewWorkflowServiceTests.cs and integration tests in PerformanceEvaluationControllerTests.cs pass

- [ ] Step 4: Implement AI recommendation service using Groq LLM (security: de-identified AI payload, validated LLM JSON; extensibility: new AI output section is one response field plus one prompt line)
  - Files: backend/Modules/PerformanceEvaluation/AiRecommendationGenerationService.cs, AiRecommendationModels.cs, backend/Controllers/PerformanceEvaluationController.cs
  - Verify: Unit tests in backend/Tests/Analytics/AiRecommendationServiceTests.cs pass (PII exclusion, 500-char comment trim, JSON validation, fallback handling)

- [ ] Step 5: Implement development plan endpoints and CSV export (security: manager permission limits on review and export, CSV formula-injection protection)
  - Files: backend/Modules/PerformanceEvaluation/PerformanceReviewCsvExportService.cs, backend/Controllers/PerformanceEvaluationController.cs
  - Verify: Unit tests in backend/Tests/Analytics/PerformanceReviewCsvExportAndDevelopmentPlanTests.cs pass (=+-@ prefix escaping, RFC 4180 quoting)

- [ ] Step 6: Build manager template editor, review cycle manager, and criteria rating grid
  - Files: frontend/src/services/performanceEvaluationService.ts, frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/EvaluationTemplateEditor.tsx, RatingGrid.tsx, PerformanceReviewTab.tsx
  - Verify: Vitest suites in frontend/src/test/EvaluationTemplates.test.tsx and frontend/src/test/PerformanceReviews.test.tsx pass

- [ ] Step 7: Build manager AI recommendation review panel and development plan assignment interface
  - Files: frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/AiRecommendationPanel.tsx, DevelopmentPlanPanel.tsx, ReviewDetailView.tsx
  - Verify: Vitest suite in frontend/src/test/AiRecommendationAndDevPlan.test.tsx passes (approval flow, manual overrides, plan item creation)

- [ ] Step 8: Rename MyScoreBoard tab to "My Performance" and display employee evaluation overview with self-assessment submission
  - Files: frontend/src/Pages/OpEmployee_Dashboard/OpEmployee_Dashboard.tsx, frontend/src/components/EmployeeScorecard/EmployeeScorecardView.tsx, EmployeeScorecardView.css
  - Verify: Vitest tests for employee dashboard navigation and self-assessment rating submission in SelfAssessment workflow stage pass

- [ ] Step 9: Add employee AI improvement recommendation card, development checklist, and Recharts performance comparison
  - Files: frontend/src/components/EmployeeScorecard/EmployeeScorecardView.tsx, frontend/src/Pages/OpAdmin_Dashboard/PerformanceEvaluation/charts/CriterionComparisonChart.tsx
  - Verify: Vitest tests for employee viewing approved improvement aspects, action items, training topics, toggling checklist, and Recharts rendering pass

- [ ] Step 10: Run full backend and frontend test suites and production build verification
  - Files: backend/Tests/Backend.Tests.csproj, frontend/package.json
  - Verify: dotnet test backend/Tests/Backend.Tests.csproj --configuration Release and npm --prefix frontend test pass with 0 failures

## Open questions / assumptions
- LLM provider & data policy: Groq llama-3.3-70b-versatile with de-identified payload (roles, scores, comments; no names/IDs).
- Approved AI text in CSV: Omit AI columns from CSV export by default; include only if product owner specifies format.
- Charting library: Recharts ^3.8.1 is already installed and utilized; no new charting library needed.
- Template/band changes on open vs finalized: Open reviews re-compute live; finalized reviews freeze immutable scores.
- Employee AI recommendation visibility: Employees view AI improvement recommendations only after manager approval.
- Role access: ManagerOnly policy enforces admin actions; non-manager employees access only their own records.
- Self-assessment workflow: Employees can submit self-ratings only while review status is SelfAssessment.
