# Configurable KPI & Performance Evaluation Roadmap

**Status**: In progress
**Target Feature Branch**: `feature/configurable-kpi`

## Goal
Refactor existing KPI reporting into a configurable, weighted evaluation system for Managers, calculating standard and custom logistics KPIs from immutable task and audit data.

## Out of scope
Redesigning task execution workflows, modifying FOMS financial reports, or rewriting unrelated SystemAdmin settings.

## Existing KPI (current state)
- Exists: ReportService has fixed on-time/late task counts and department stats; OpAdmin has a basic KPI table and CSV export.
- Reusable: On-time SLA deadline logic (RevisedDeadline ?? Deadline), user/department role filters, and QuestPDF/ClosedXML export tools.
- Obsolete: Hardcoded KPI formulas, legacy KpiTrackingDTO/DepartmentKpiDTO, flawed IsApproved checks, and monolithic unweighted KPI tab.

## Data readiness
- OTIF: Partial. On-time exists via deadlines/UpdatedAt; In-Full is partial (TaskAttachments count exists, but no required doc checklist).
- Order Accuracy (Perfect Order): Partial. Task.PushBackComment is cleared on approval; zero push-backs must derive from AuditLog status changes.
- Task Completion Rate: Yes. Directly available via TaskAssignments and Task.Status == Completed.
- Average Handling Time: Yes. Available via Task.UpdatedAt - Task.CreatedAt for cycle time, or AuditLogs for in-progress duration.

## Design notes
- Architecture: New KpiConfiguration and KpiCalculationEngine modules in backend; dedicated manager config and employee scorecard in frontend.
- Storage: KpiConfiguration and KpiItem tables store weights, thresholds (Green/Amber/Red), target roles, and prospective validity dates.
- Data Stability: Prospective versioning applies new weights only to future periods; historical periods evaluate against their active config.
- Safe Formula Engine: Tokenized whitelist math parser (+, -, *, /, parentheses) over mapped variables; zero dynamic code execution or eval.
- Access Control: Role-based authorization restricts configuration endpoints to Managers/SystemAdmin; employees get read-only scorecards.

## Phases
- [x] Phase 1: Core metric calculation engine & database foundation for default KPIs
  - Done when: Manager API calculates the 4 default KPIs for an employee over a timeframe with verified backend test coverage.
  - Completed: KpiConfiguration and KpiItem entities created with composite indexing, KpiCalculationEngine implemented default metrics (OTIF, Accuracy, Completion, AHT), and Manager endpoint verified by 617 backend tests and 125 frontend tests.
- [x] Phase 2: Configuration & weighting system with traffic-light thresholds
  - Done when: Manager can save prospective weights (summing to 100%) and thresholds, producing a weighted Employee Performance Score.
  - Completed: Overall thresholds added to KpiConfiguration with migration, configuration CRUD and prospective validation implemented in backend, and Manager configuration UI built with 100% weight sum validation; verified by 657 backend tests and 134 frontend tests.
- [x] Phase 3: Safe custom formula builder & variable data mapping
  - Done when: Manager can construct and test a custom formula using mapped database fields via the safe math parser.
  - Completed: Tokenized recursive descent SafeFormulaParser and KpiVariableRegistry built with division-by-zero protection, custom formula evaluation integrated into KpiCalculationEngine, and Manager FormulaBuilderModal with dry-run testing deployed; verified by 744 backend tests and 140 frontend tests.
- [ ] Phase 4: Scope controls & hierarchical drill-down (Department -> Team -> Employee)
  - Done when: Manager can filter evaluations by timeframe, role (Courier vs Encoder), and drill down from department to employee.
- [ ] Phase 5: Individual scorecards, export (PDF/Excel), & Biomarker AI threshold feed
  - Done when: Employees can view their scorecard, export to PDF/Excel, and Biomarker Scan flags critical KPI red-zone alerts.

## Decisions to confirm
- In-Full criteria: Define whether In-Full requires >= 1 attachment or an explicit checklist (blocks Phase 1).
- Push-back audit query: Confirm using AuditLog rework transitions for accuracy rate vs adding a persistent pushback counter (blocks Phase 1).
- Historical evaluation storage: Confirm calculating dynamically via prospective config versions vs saving static scorecard snapshots (blocks Phase 2).
- Formula variable whitelist: Finalize the list of approved numeric fields exposed to custom formulas (blocks Phase 3).
- Biomarker threshold source: Confirm whether configurable KPI thresholds override or supplement appsettings BiomarkerThresholds (blocks Phase 5).

## Risks
- AuditLog query latency: Deriving pushbacks from AuditLogs across long timeframes may require a composite index on (EntityId, Action, CreatedAt).
- Division by zero: Custom formulas or zero completed tasks could cause NaN/divide-by-zero errors without strict engine validation.
- Prospective version drift: Ambiguity at timeframe boundaries could cause HR dispute without clear period-to-version mapping.
- Unenforced attachments: Without a required document schema on tasks, OTIF In-Full rate will rely on attachment presence heuristics.
