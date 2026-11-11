# Plan: Delivery Summary Data Presentation and Courier Name Form Field

**Feature branch:** `fix/delivery-summary-data-and-courier-name-field` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Findings & Root Cause Analysis
1. **Delivery Summary Tab Empty Data**:
   - In `DmsDeliveryTab.tsx`, `fetchDeliveries` calls `api.get('/api/dms-integration/deliveries')`. If the backend returns an empty array `[]` (because `TaskDeliveryDetails` has 0 rows or hasn't linked DMS shipments yet), the frontend immediately sets `deliveries = []` and returns without evaluating candidate tasks or pending DMS shipments.
   - In `DmsIntegrationService.cs`, `GetAllDeliveriesAsync()` only queries `_db.TaskDeliveryDetails`. If no STARS task has an attached `TaskDeliveryDetail` row yet, it returns an empty list, completely ignoring active DMS shipments and pre-delivery orders awaiting validation. Additionally, `driverUsers.ToDictionary` could throw if duplicate employee numbers exist.
   - When pending DMS orders are retrieved or pre-delivery tasks exist in `Tasks`, they should be unified into `GetAllDeliveriesAsync()` so all shipments, metrics, and KPI charts are fully populated.
2. **Missing Courier Name Field in Pre-Delivery Modal**:
   - In `SystemAdmin_Dashboard.tsx` and `OpAdmin_Dashboard.tsx`, when creating a task from pre-delivery validation ("Create Pre-Delivery Operational Task"), the modal displays input fields for Recipient, Contact, Address, Area, Sender, Package Description, and `Courier Employee ID (Optional)`, but has **no input field for Courier Name / Full Name**.
   - Although `courierFullName` exists in DTOs and state, operators cannot see, edit, or enter the courier's name directly in the form.

## Steps

- [x] Step 1: Backend: Enhance `GetAllDeliveriesAsync` to safely resolve driver mappings and merge unlinked DMS shipments
  - Files: `backend/Modules/DmsIntegration/DmsIntegrationService.cs`, `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --filter FullyQualifiedName~DmsIntegrationTests`

- [x] Step 2: Frontend: Update `DmsDeliveryTab.tsx` fallback logic and row keys to guarantee delivery data presentation
  - Files: `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`, `frontend/src/test/DeliveryAnalyticsDriverNames.test.tsx`
  - Verify: Run `npm --prefix frontend test -- -t "DmsDeliveryTab|DeliveryAnalytics"`

- [x] Step 3: Frontend: Add dedicated Courier Name input field in Create Pre-Delivery Operational Task modals
  - Files: `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`
  - Verify: Run `npm --prefix frontend test -- -t "PreDelivery"`

- [x] Step 4: Regression tests & full suite verification
  - Files: `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`, `frontend/src/test/PreDeliveryTab.test.tsx`, `frontend/src/test/DmsDeadlineDriverUI.test.tsx`
  - Verify: Run `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release` and `npm --prefix frontend test`

## Open questions / assumptions
- Driver field layout: In the delivery details section, `Courier Employee ID` and `Courier Name` sit side-by-side in a responsive 2-column grid (`1fr 1fr`), consistent with Recipient / Contact and Area / Sender rows.
- Unlinked DMS shipments: In `DmsDeliveryTab`, shipments not yet attached to a STARS task display "[DMS Pre-Delivery] <Recipient>" as title and "Pending Creation" for Waybill / Task Link.
- Auto-fill driver name: If the operator enters a valid STARS courier employee number (e.g. `EMP-008`), the Courier Name field automatically populates with the employee's name if currently blank.
