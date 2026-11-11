# Plan: Pre-Delivery Helper Text Removal and DMS Courier Name Presentation

**Feature branch:** `fix/dms-courier-name-and-pre-delivery-helper-text` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Findings so far
- Task form: `SystemAdmin_Dashboard.tsx` and `OpAdmin_Dashboard.tsx` render the "(Date-only: ...)" helper text below locked DMS deadlines.
- DMS sync handler: `DmsIntegrationService.cs` drops driver names from DMS payloads when employee numbers are unmapped in STARS `_db.Users`.
- Waybill model & DTOs: `TaskDeliveryDetail.cs`, `DmsIntegrationDTOs.cs`, and `UpsertTaskDeliveryDetailDTO` lack a dedicated `CourierFullName` field.
- Task details view: `TaskView.tsx` renders courier info using `formatDriverDisplay`, but receives employee ID alone if the name is not persisted.
- Courier label: `frontend/src/utils/driverUtils.ts` already provides the standard `EMP-008 · Ricardo Bautista` formatter with clean ID-only fallback.

## Steps

- [ ] Step 1: Add CourierFullName to delivery detail model and integration DTOs to support courier name persistence
  - Files: `backend/Models/TaskDeliveryDetail.cs`, `backend/Models/DTOs/DmsIntegrationDTOs.cs`
  - Verify: Run `dotnet build backend/Backend.csproj --configuration Release` to confirm model and DTO schema compilation.

- [ ] Step 2: Update DMS sync handlers to capture, persist, and resolve courier names from DMS payloads and STARS user records
  - Files: `backend/Modules/DmsIntegration/DmsIntegrationService.cs`, `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --filter FullyQualifiedName~DmsIntegrationTests` to verify ID and name mapping.

- [ ] Step 3: Remove "(Date-only: ...)" helper text and present paired courier labels in task modals and task details
  - Files: `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/components/TaskView/TaskView.tsx`
  - Verify: Run `npm --prefix frontend test -- -t "DmsDeadlineDriverUI|PreDelivery"` to confirm clean layout and paired driver display.

- [ ] Step 4: Run full backend and frontend regression suites and perform manual end-to-end verification
  - Files: `frontend/src/test/DmsDeadlineDriverUI.test.tsx`, `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj && npm --prefix frontend test`, then verify helper text removal and waybill courier name in UI.

## Open questions / assumptions
- DMS courier payload: Assumes DMS sends courier name under `driverName` or `courierName`; STARS preserves it or resolves from `_db.Users`.
- STARS employee lookup: If DMS sends ID only, STARS looks up `_db.Users` by `EmployeeNumber`; if unmapped in both, ID alone is displayed.
- Existing waybills: Existing waybills without a name display the ID alone cleanly ("EMP-008") with no data backfill or schema break required.
- Date-only text locations: "(Date-only)" appeared in `SystemAdmin_Dashboard.tsx` helper text and `OpAdmin_Dashboard.tsx` deadline badge.
- Proposed courier layout: Middle dot convention `EMP-008 · Ricardo Bautista` via `formatDriverDisplay` with clean fallback to `EMP-008`.
