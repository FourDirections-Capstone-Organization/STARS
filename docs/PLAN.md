# Plan: Fix STARS/DMS Deadline and Driver Identification Integration Defects

**Feature branch:** `fix/dms-integration-deadline-driver` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Findings so far
- Deadline field & date formatting: `OpAdmin_Dashboard.tsx`, `SystemAdmin_Dashboard.tsx`, and `dateUtils.ts` parse ISO dates with `new Date()`, causing UTC midnight (`00:00Z`) to shift to `08:00 am` in UTC+8 inside `datetime-local` inputs.
- DMS sync & mapping: `DmsIntegrationService.cs` and `DmsIntegrationDTOs.cs` receive `ExpectedDelivery` as `DateTime` and sync `CourierEmployeeId` as the primary key.
- Driver display: `TaskView.tsx`, `DmsDeliveryTab.tsx`, `PreDeliveryTab.tsx`, and `DeliveryReportExport.ts` format drivers inconsistently, showing name first or ID only.
- Tables & modals: `TaskModal` in dashboards locks DMS deadlines with `input[type="datetime-local"]` rather than a date-only display.
- Existing driver resolution: `DmsIntegrationService.cs` resolves driver full names from `_db.Users` via `EmployeeNumber`.

## Steps

- [x] Step 1: Align backend DMS DTOs, sync payload, and driver mapping to use employee ID as key and normalize date-only deadlines
  - Files: `backend/Models/DTOs/DmsIntegrationDTOs.cs`, `backend/Modules/DmsIntegration/DmsIntegrationService.cs`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --filter FullyQualifiedName~DmsIntegrationTests` to confirm driver ID matching and date parsing.

- [x] Step 2: Implement shared date-only and driver-label formatters with regression guards for midnight dates and missing names
  - Files: `frontend/src/utils/dateUtils.ts`, `frontend/src/utils/driverUtils.ts`, `frontend/src/components/TaskView/TaskView.tsx`
  - Verify: Vitest tests for `formatDateOnly` near midnight and `formatDriverDisplay` returning `EMP-008 · Ricardo Bautista` or ID fallback.

- [ ] Step 3: Update task modals, detail views, tables, and exports to render date-only DMS deadlines and paired driver labels
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`, `frontend/src/components/PreDeliveryTab/PreDeliveryTab.tsx`, `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`, `frontend/src/components/DmsDeliveryTab/DeliveryReportExport.ts`
  - Verify: Component tests and UI check verifying read-only date-only deadline with locked badge, plus driver label format in tables and forms.

- [ ] Step 4: Run full backend and frontend test suites and verify DMS sync against both QA defect scenarios
  - Files: `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`, `frontend/src/test/PreDeliveryDueDateAndCourierFix.test.tsx`, `frontend/src/test/DeliveryAnalyticsDriverNames.test.tsx`
  - Verify: Execute `dotnet test` and `npm --prefix frontend test`, confirming zero regressions across all backend and frontend tests.

## Open questions / assumptions
- Time origin: DMS has no time component; "08:00 am" is an artifact of UTC midnight converted to UTC+8 browser local time in `<input type="datetime-local">`.
- Driver payload from DMS: We assume DMS sends `DriverEmployeeId` (or `driverId`); if DMS sends full name only, DMS will need a backend update to transmit ID.
- DMS change for ID: Proposed pairing `EMP-008 · Ricardo Bautista` should be mirrored in DMS UI; STARS handles its side independently without DMS breakage.
- Existing deadlines: Existing stored task deadlines with timestamp components will display formatted as date-only (`DD/MM/YYYY`) with no DB migration required.
- Existing drivers: Existing tasks without driver show "Unassigned"; tasks with ID but no matching user name gracefully display the employee ID alone.
- Date format: All user-facing views, detail modals, tables, and exports will use standard `DD/MM/YYYY` (e.g. `13/11/2026`) for DMS delivery deadlines.
- Separator convention: Proposing middle dot ` · ` (`EMP-008 · Ricardo Bautista`) as standard layout across forms, cards, tables, and exports.

If there's some modification needed for the DMS, list me the details that needs to be improved there.
