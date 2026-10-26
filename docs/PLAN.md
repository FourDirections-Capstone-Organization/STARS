# Biomarker Scan Refactoring and Cleanup Plan

**Target Feature Branch**: `feature/biomarker-scan-refactoring`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved)

## Goal
Refactor Biomarker Scan to calculate real SLA and employee metrics from PostgreSQL and remove dead streaming code.

## Out of scope
Redesigning the Biomarker UI layout, modifying notification channels, and changing threshold values.

## Findings so far
- BiomarkerScanService runs nightly and via manual trigger, storing alerts in PostgreSQL and exporting QuestPDF.
- Alerts display on Manager SystemAdmin_Dashboard under the Biomarker Scan tab with charts and paginated table.
- SLA checks mistakenly check IsApproved instead of comparing completed date to effective deadline.
- StreamAnalyticsService, AnalyticsDashboardController, ChartDataService, and ksqlDB references are dead and uncalled.
- Existing BiomarkerScanTests test mock helper functions rather than the actual service or controller.

## Design notes
- SLA on-time rate evaluates (UpdatedAt ?? CreatedAt) <= (RevisedDeadline ?? Deadline) aligned with ReportService.
- EmployeeLateRate calculates late completed tasks over total completed tasks per active non-manager employee.
- Stored alerts retain existing BiomarkerAlert schema without modifying frontend contract DTOs.
- Orphaned streaming analytics files and unused controllers are removed from backend and DI registration.
- Targeted integration and unit tests validate alert generation against an in-memory database.

## Decisions to confirm
- Dead code: remove StreamAnalyticsService, AnalyticsDashboardController, and ChartDataService immediately (confirmed).
- SLA source: standard PostgreSQL timestamps with (RevisedDeadline ?? Deadline) across all metrics (confirmed).
- Existing alerts: purge historical false-positive alerts on migration to reset clean scan state (confirmed).

## Implementation Steps
- [x] Step 1: Map current behavior, data sources, dead code, and existing test coverage
  - Verify: Documented audit details all metrics, obsolete ksqlDB endpoints, and mock test limitations
  - Audit Notes:
    - SLA flaws: BiomarkerScanService (lines 74, 189, 240) checks `IsApproved` instead of `(UpdatedAt ?? CreatedAt) <= (RevisedDeadline ?? Deadline)`.
    - Dead streaming: StreamAnalyticsService (http://ksqldb:8088), ChartDataService, AnalyticsDashboardController, and AnalyticsTrendController are completely uncalled.
    - Dead DI: Program.cs lines 219-220 register unused IStreamAnalyticsService and ChartDataService.
    - Test gaps: BiomarkerScanTests & StreamAnalyticsTests test private in-file helpers rather than actual services; frontend has zero tests for useBiomarker/BiomarkerDashboard.
- [x] Step 2: Remove dead streaming analytics services, controllers, and unused DI registrations
  - Verify: Solution builds cleanly with StreamAnalytics and unused analytics controllers removed
- [ ] Step 3: Fix BiomarkerScanService SLA and on-time calculations using effective deadlines
  - Verify: Unit tests confirm OnTimeRate, EmployeeLateRate, and OverallSla use real deadline comparison
- [ ] Step 4: Add comprehensive backend service tests for BiomarkerScanService and controller
  - Verify: Backend test suite confirms alert creation, severity rules, threshold triggers, and pagination
- [ ] Step 5: Add frontend test suite for useBiomarker hook and BiomarkerDashboard integration
  - Verify: Vitest tests confirm status cards, filtering, alert mapping, and scan trigger handling
- [ ] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
