# Phase 5: Individual Scorecards, Export (PDF/Excel), & Biomarker AI Feed

## Findings so far
- KpiController is locked with ManagerOnly policy, preventing non-manager employees from accessing scorecards.
- OpEmployee_Dashboard has no scorecard tab, while OpAdmin_Dashboard renders drill-down without PDF/Excel export.
- ReportService and BiomarkerScanService already utilize QuestPDF and ClosedXML for PDF/Excel generation.
- BiomarkerScanService currently reads hardcoded thresholds from appsettings rather than active KpiConfiguration red zones.
- Baseline test suites pass cleanly with 783 backend tests and 156 frontend tests.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, authorization boundaries, and test baselines
  - Verify: 783 backend tests and 156 frontend tests pass and export/biomarker integration points confirmed
  - Confirmed: 783 backend tests and 156 frontend tests pass cleanly with zero failures.
  - Confirmed: KpiController class-level ManagerOnly policy blocks employee self-access; requires endpoint-level authorization scoping.
  - Confirmed: ClosedXML and QuestPDF are ready for scorecard and drill-down file export generation.
  - Confirmed: BiomarkerScanService integration will check active KpiConfiguration red-zone thresholds during scans.
- [x] Step 2: Implement employee scorecard endpoint and PDF/Excel export generation in backend
  - Verify: Backend tests verify employee self-scorecard authorization and valid PDF/Excel file downloads
  - Completed: KpiController authorization scoped with [Authorize] class-level and endpoint-level ManagerOnly controls; employee self-scorecard endpoints (GET /my-scorecard, GET /scorecard/{id}) added with 403 Forbidden enforcement for non-manager cross-employee access.
  - Completed: IKpiExportService and KpiExportService implemented with QuestPDF and ClosedXML, supporting individual scorecard PDF/Excel and hierarchical scope PDF/Excel exports.
  - Verified: 815 backend tests pass (32 new unit and controller tests) and 156 frontend tests pass.
- [x] Step 3: Feed configurable KPI red-zone alerts into BiomarkerScanService
  - Verify: Unit and integration tests confirm Biomarker Scan generates Critical alerts for red-zone KPI metrics
  - Completed: BiomarkerScanService integrated with IKpiCalculationEngine to evaluate prospective active KpiConfigurations at department and employee levels, generating Critical severity alerts when any KPI metric or overall score enters the red zone.
  - Verified: 823 backend tests pass (8 new Biomarker scan KPI red-zone tests) and 156 frontend tests pass.
- [x] Step 4: Build employee scorecard view and export controls in frontend dashboards
  - Verify: Component tests verify employee scorecard rendering, metrics breakdown, and export triggers
  - Completed: Employee scorecard view component created with overall score, traffic-light status, metric cards, timeframe selectors, and PDF/Excel export triggers.
  - Completed: Integrated "My Scorecard" tab into OpEmployee_Dashboard and added scope/employee PDF/Excel export controls to OpAdmin_Dashboard KpiDrillDown.
  - Verified: 165 frontend tests pass (9 new component & integration tests) and 823 backend tests pass.
- [x] Step 5: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
  - Completed: Verified all 823 backend tests (Backend.Tests.dll) and all 165 frontend tests (across 24 test files) pass cleanly with zero failures.
