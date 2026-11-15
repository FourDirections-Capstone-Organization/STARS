# Plan: Integrate `refactoring/defects` into `refactoring/bug-fix`

**Feature branch:** `feature/integrate-defects-into-bugfix` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Background & Scope Analysis
- **Authoritative Base (`refactoring/bug-fix`)**:
  - Contains database schema migration `20261114031305_AddDeliveryLogisticsAndCourierFullName.cs` and startup DDL.
  - Full logistics metadata in `TaskDeliveryDetail` and `DmsIntegrationDTOs`.
  - Non-blocking task approval with warning propagation in `TaskWorkflowService`.
  - Zero N+1 driver resolution and case-insensitive delivery status in `DmsIntegrationService` (Defect 59).
  - Relocated Proof of Delivery (POD) viewer in `DmsDeliveryTab` with 8-second polling and complete CSS (Defect 58).
  - Dedicated Courier Full Name form inputs in Create Pre-Delivery Task modals.
  - **All of the above MUST be 100% retained.**
- **Feature Influx (`refactoring/defects`)**:
  - Backend KPI Department & Role requirements + role-specific metrics (`KpiDepartmentRoleHelper`, `KpiController`, validator, tests).
  - Frontend KPI Configuration tab and editor components.
  - Standardized "Completed" task status badge in `statusUtils.ts` and `TaskManager.tsx`.
  - Pre-delivery synchronization & lifecycle segregation (`dmsSyncUtils.ts`, 3 sub-tabs in `PreDeliveryTab.tsx`).
  - Delivery Analytics report fallback calculation in `OpAdmin_Dashboard.tsx`.
  - Retention of delivered orders in `DmsDeliveryTab.tsx` (`deliveredOrdersRef`).
- **Conflict Hotspots (7 frontend files)**:
  - `frontend/src/utils/driverUtils.ts`
  - `frontend/src/components/TaskView/TaskView.tsx`
  - `frontend/src/test/TaskViewDmsPod.test.tsx`
  - `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`
  - `frontend/src/components/PreDeliveryTab/PreDeliveryTab.tsx`
  - `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`
  - `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`

## Steps

- [x] Step 1: Backend KPI Department/Role Requirement Integration
  - Files: `backend/Controllers/KpiController.cs`, `backend/Models/DTOs/KpiConfigurationDTOs.cs`, `backend/Modules/Analytics/KpiConfigurationValidator.cs`, `backend/Modules/Analytics/KpiDepartmentRoleHelper.cs`, `backend/Tests/Analytics/KpiConfigurationValidationTests.cs`, `backend/Tests/Analytics/KpiControllerTests.cs`
  - Branch: `step-1-backend-kpi`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --filter FullyQualifiedName~Analytics --configuration Release` and `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`

- [x] Step 2: Frontend Utilities & KPI Configuration Components
  - Files: `frontend/src/utils/dmsSyncUtils.ts`, `frontend/src/utils/statusUtils.ts`, `frontend/src/test/statusUtils.test.tsx`, `frontend/src/utils/driverUtils.ts`, `frontend/src/components/TaskManager/TaskManager.tsx`, `frontend/src/Pages/OpAdmin_Dashboard/KpiConfiguration/*`, `frontend/src/test/KpiConfiguration.test.tsx`
  - Branch: `step-2-frontend-kpi-utils`
  - Verify: Run `npm --prefix frontend test -- src/test/statusUtils.test.tsx src/test/KpiConfiguration.test.tsx`

- [x] Step 3: Harmonize DMS Delivery Tab & TaskView
  - Files: `frontend/src/components/TaskView/TaskView.tsx`, `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`, `frontend/src/test/TaskViewDmsPod.test.tsx`, `frontend/src/test/DeliveryAnalyticsAndCompletedStatusFix.test.tsx`
  - Branch: `step-3-dms-delivery-taskview`
  - Verify: Run `npm --prefix frontend test -- src/test/TaskViewDmsPod.test.tsx src/test/DmsDeadlineDriverUI.test.tsx src/test/DeliveryAnalyticsAndCompletedStatusFix.test.tsx`

- [ ] Step 4: Harmonize PreDeliveryTab and Dashboards
  - Files: `frontend/src/components/PreDeliveryTab/PreDeliveryTab.tsx`, `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/test/PreDeliveryTab.test.tsx`, `frontend/src/test/PreDeliveryDefectResolution.test.tsx`
  - Branch: `step-4-predelivery-dashboards`
  - Verify: Run `npm --prefix frontend test -- src/test/PreDeliveryTab.test.tsx src/test/PreDeliveryDefectResolution.test.tsx`

- [ ] Step 5: Full Regression Testing & Gate Check
  - Files: N/A (Full suite validation)
  - Branch: `step-5-full-regression`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`, `npm --prefix frontend test -- --run`, and `npm --prefix frontend run build`

## Open Questions / Assumptions
- **Pre-Delivery Refresh Compatibility**: In `PreDeliveryTab.tsx`, support both `onRefreshPending` / `refreshPendingTrigger` props (from `bug-fix`) and `dmsSyncUtils` / custom event triggers (`stars:dms-task-created`, `stars:dms-task-updated` from `defects`) so neither dashboard nor tab contract is broken.
- **Tracker Navigation Contract**: In `TaskView.tsx`, support both `onNavigateToDmsTracker` and `onNavigateToDeliveryTracker` props with identical routing/event dispatch semantics (`stars:navigate-dms-tracker`).
- **Initial Waybill Prop**: In `DmsDeliveryTab.tsx`, accept both `initialWaybillNo` and `initialWaybill`.
- **Preserve Backend Schema**: Under no circumstances should EF migration `20261114031305_AddDeliveryLogisticsAndCourierFullName.cs` or `DatabaseStartupDdl.cs` be altered or reverted; the backend database schema in `refactoring/bug-fix` is authoritative.
