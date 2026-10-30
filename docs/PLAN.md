# Phase 4: Scope Controls & Hierarchical Drill-Down

## Findings so far
- KpiCalculationEngine evaluates single employees; batch scope aggregation for Department and Team is missing.
- KpiController lacks hierarchical scope query endpoints accepting departmentId, teamId, role, and timeframe.
- Backend Department and Team models link via DepartmentId and TeamMember with User roles (Courier, Encoder).
- OpAdmin_Dashboard still contains legacy unweighted kpi-tracking tab instead of configurable drill-down.
- Baseline test suites pass: 744 backend tests and 140 frontend tests.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, organizational models, and test baselines
  - Verify: 744 backend tests and 140 frontend tests pass and scope models confirmed
  - Confirmed: Department (Users, JobPositions), Team (DepartmentId, Members), and User (DepartmentId, Role) organizational hierarchy and baselines verified (744 backend, 140 frontend).
- [x] Step 2: Implement hierarchical scope aggregation in KpiCalculationEngine and scope DTOs
  - Verify: Engine unit tests verify Department, Team, and role-filtered metric calculations
  - Confirmed: Hierarchical scope DTOs and aggregation methods (Department, Team, Company scope, and role filtering) implemented and verified by 13 unit tests; 757 backend and 140 frontend tests passing.
- [x] Step 3: Add hierarchical evaluation endpoints in KpiController with scope filters
  - Verify: Controller integration tests confirm Department, Team, role, and timeframe filtering
  - Confirmed: Hierarchical evaluation endpoints (`/api/kpi/scope`, `/api/kpi/department/{id}`, `/api/kpi/team/{id}`) implemented with role, timeframe, and scope filters; verified by 26 controller integration and unit tests (783 backend and 140 frontend tests passing).
- [x] Step 4: Build hierarchical drill-down UI with scope controls and breadcrumb navigation
  - Verify: Component tests verify Department to Team to Employee drill-down and role filtering
  - Confirmed: Hierarchical drill-down UI (KpiDrillDownView, KpiBreadcrumbs, KpiScopeControls, KpiMetricCards, KpiDrillDownTable) built with role filtering and breadcrumb navigation; verified by 12 component tests (783 backend and 152 frontend tests passing).

- [x] Step 5: Integrate hierarchical drill-down view into Manager dashboard KPI tracking
  - Verify: Dashboard renders drill-down view, connects scope filters, and updates evaluations
  - Confirmed: Hierarchical drill-down view (`KpiDrillDownView`) integrated into Manager dashboard KPI tracking tab as primary view with view-mode toggle (Drill-Down vs Legacy SLA) and direct navigation to KPI Configuration; verified by 16 drill-down & dashboard integration tests (783 backend and 156 frontend tests passing).
- [ ] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
