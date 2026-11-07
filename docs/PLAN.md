# Plan: DMS Proof of Delivery (POD) Visibility, Driver Details, and Delivery Analytics Click-Through

**Feature branch:** `feature/dms-pod-driver-analytics-integration` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Goal
Make DMS-uploaded Proof of Delivery (POD) files visible in STARS on matching tasks/orders with previews and authenticated downloads; display the driver/courier full name and employee number on task/order details and throughout Delivery Analytics; enable seamless click-through from Delivery Analytics records to task details with strict RBAC access enforcement.

## Out of scope
- Altering DMS core database schema or how DMS internally processes deliveries.
- Adding duplicate storage columns for driver names or running any bulk backfill of historical PODs without explicit user approval.
- Introducing database migrations (reusing existing `TaskAttachment`, `TaskDeliveryDetail`, `User`, and `DmsDeliveryPerformance` schemas).
- Modifying unrelated FOMS financial workflows or core task assignment algorithms.

---

## Investigation Findings

### 1. DMS POD Upload Flow, Storage, and Task/Order Linkage
- **Upload Flow**: In DMS, a courier uploads POD (photo of delivery/signed receipt) upon marking a delivery order completed.
- **Storage**: DMS stores POD images/files as URLs or storage paths referenced by the `podImage` property (and `potImage` for Proof of Transfer/Turnover), accessible via DMS endpoints such as `GET /api/delivery-orders/track?waybill={waybillNo}`.
- **Linkage**: In DMS, each delivery order links to STARS via:
  1. `starsTaskId` (GUID passed by STARS during Integration 1 order creation `POST /api/integration/stars/delivery-orders`).
  2. `waybillNo` (e.g. `WB-2026-449612` or `SPX-2026-0721`).
  3. `orderId` (DMS numeric primary key).

### 2. STARS <-> DMS Data Exchange & Why POD Does Not Show Up Today
- **Existing Integration Paths**:
  1. **Integration 1 (Outbound: STARS -> DMS)**: `DmsIntegrationService.CreateDeliveryOrderForTaskAsync` sends delivery details to `POST {BaseUrl}/api/integration/stars/delivery-orders` using outbound API key.
  2. **Integration 2 (Inbound Webhook & Outbound Polling/Sync)**:
     - Inbound: DMS posts status updates to STARS `POST /api/integration/dms/status` using inbound API key.
     - Outbound Sync: STARS triggers `POST /api/dms-integration/tasks/{taskId}/sync`, calling DMS `GET /api/integration/stars/delivery-orders/{taskId}`.
  3. **Integration 3 (Performance Batch & Summary)**: DMS posts scheduled batches to `POST /api/integration/dms/performance-batch`; STARS computes aggregated SLA compliance via `GET /api/integration/dms/performance-summary`.
- **Why POD Does Not Show Up Today**:
  - `DmsStatusWebhookDTO` and `TaskDeliveryDetailResponseDTO` lack POD fields (`podImage` / `podUrl` / `podUploadedAt`).
  - `DmsIntegrationService` does not extract or map `podImage` from webhook payloads or sync responses.
  - Neither `TaskView.tsx` nor `DmsDeliveryTab.tsx` contains any UI component, viewer, preview, or download button for POD files.
  - No secure proxy or authenticated endpoint exists in STARS to serve DMS-stored POD files to authorized users while enforcing task-level RBAC.

### 3. Driver/Courier Identity & Linkage to Tasks/Orders
- **Driver Source of Truth**: Driver identity lives in the STARS `Users` table (`User.cs`), where:
  - `EmployeeNumber` stores identifiers such as `DRV-001`, `EMP-1042`, etc.
  - Full name is composed from `FirstName` and `LastName`.
  - Active status is determined by `IsActive` and `!IsDeactivated`.
- **Task Linkage**:
  - Delivery details link to the driver via `TaskDeliveryDetail.CourierEmployeeId` (matching `User.EmployeeNumber`).
  - Tasks link to assigned users via `TaskAssignment.AssignedUserId` (`User.Id`).
  - Delivery performance records link via `DmsDeliveryPerformance.DriverId` (matching `User.EmployeeNumber`).
- **Resolution Strategy**: Rather than duplicating driver names onto task records, the server resolves names from `Users` via batch lookup on `EmployeeNumber`. If a driver is inactive, the name is formatted with an `[Inactive]` badge. If unassigned, it outputs `"Unassigned"`.

### 4. Delivery Analytics Report Driver Resolution & Row Architecture
- **Server Aggregation (`GetPerformanceSummaryAsync`)**:
  - Combines `_db.DmsDeliveryPerformances` with delivered records from `_db.TaskDeliveryDetails`.
  - Currently populates only `DriverId` (e.g. `DRV-001`), without resolving the driver's full name from `Users`.
- **Two Report Table Structures**:
  1. **Table 1 ("Courier / Driver SLA Compliance Breakdown")**: Each row represents an **aggregate of multiple deliveries for a single driver** (`d.driverId`, total, on-time, late, on-time rate).
  2. **Table 2 ("DMS Batch Delivery Completion Records")**: Each row represents an **individual delivery / task** (`r.waybillNo`, `r.starsTaskId`, `r.driverId`, `r.completedAt`, `r.slaTargetAt`, `r.isOnTime`).
- **Click-Through Strategy**:
  - Clicking a row in **Table 2** (individual delivery) opens that specific task's details modal.
  - Clicking a row in **Table 1** (driver aggregate) filters Table 2 and the dashboard by that driver, revealing their task list for one-click access into task details.

---

## Planned Architecture & Technical Design

### A. Zero Database Migrations
- Utilize existing table `TaskAttachments` for storing POD file references (`Description = "Proof of Delivery (POD) from DMS"`, `FilePath = DMS URL / Key`, `FileType = .jpg/.png/.pdf`, `UploadedById = Driver/System User`).
- For on-the-fly resolution, `TaskDeliveryDetailResponseDTO` will also carry `PodUrl`, `PodFileName`, `PodUploadedAt`, `PodUploadedBy` populated directly during status sync.

### B. Secure Authenticated POD Proxy & Strict RBAC
- Sensitive customer data (signatures, delivery photos) are protected behind authenticated STARS endpoints:
  - `GET /api/dms-integration/tasks/{taskId}/pod` (retrieves POD metadata for authorized users).
  - `GET /api/dms-integration/tasks/{taskId}/pod/download` (proxies/downloads the POD file stream).
- Enforces the same RBAC check as `TaskService.GetByIdAsync`:
  - Manager and Coordinator: full access to operational tasks.
  - Execution roles (Dispatcher, Encoder, Courier, Accountant): only if assigned to the task, and denied if confidential.
  - Unauthenticated or non-permitted requests return 401/403. Public guessable URLs are never exposed.

### C. Real-Time POD Sync & No Stale Data
- Inbound webhook (`POST /api/integration/dms/status`) accepts `PodImage` / `PodUrl`.
- On task view (`GET /api/dms-integration/tasks/{taskId}/delivery-details` or `SyncDeliveryStatusForTaskAsync`), if the task is delivered and no local POD exists, STARS queries DMS in real time.
- Any POD uploaded after a task was opened will appear upon normal page load/modal open without manual database intervention.

### D. Unified Name Formatting & Batch Server Resolution
- Format everywhere: `"{FirstName} {LastName} ({EmployeeNumber})"` (e.g. `"Juan Dela Cruz (EMP-1042)"`), or `"{FirstName} {LastName} ({EmployeeNumber}) [Inactive]"` if deactivated.
- In `GetPerformanceSummaryAsync`, all distinct `DriverId`s are queried in a single SQL batch (`WHERE EmployeeNumber IN (...)`), preventing N+1 queries.

---

## Steps

- [x] Step 1: Backend DTO Harmonization, Driver Lookup & Authenticated POD Proxy
  - Files: `backend/Models/DTOs/DmsIntegrationDTOs.cs`, `backend/Modules/DmsIntegration/IDmsIntegrationService.cs`, `backend/Modules/DmsIntegration/DmsIntegrationService.cs`, `backend/Controllers/DmsIntegrationController.cs`, `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`
  - Description: Add `PodUrl`, `CourierFullName`, and `CourierIsActive` to DTOs. Implement batch driver name resolution in `GetPerformanceSummaryAsync` and `GetDeliveryDetailAsync`. Implement authenticated POD retrieval and proxy download endpoint with task RBAC enforcement. Add unit and integration tests.

- [ ] Step 2: Task Details Dedicated POD Viewer & Driver Name Display
  - Files: `frontend/src/components/TaskView/TaskView.tsx`, `frontend/src/components/TaskView/TaskView.css`, `frontend/src/test/TaskViewDmsPod.test.tsx`
  - Description: Update `TaskView` to render the assigned driver's full name and employee number with inactive handling. Add a dedicated "Proof of Delivery (POD)" section supporting image thumbnails, interactive preview modal, PDF viewing, download link, metadata (upload date/time, courier name), empty state, and graceful error handling for broken/unsupported files.

- [ ] Step 3: Delivery Analytics Driver Names, Search/Filter, Charts & CSV Export
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/components/DmsDeliveryTab/DeliveryAnalyticsCharts.tsx`, `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`, `frontend/src/test/DeliveryAnalyticsDriverNames.test.tsx`
  - Description: Display driver full names alongside employee numbers in Table 1 (Driver Breakdown) and Table 2 (Completion Records), driver filter dropdown, and charts. Update table search to support searching by driver full name as well as employee number and waybill. Update CSV export headers and rows to include driver name.

- [ ] Step 4: Click-Through Navigation & Deep Linking with RBAC Access Enforcement
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/components/DmsDeliveryTab/DmsDeliveryTab.tsx`, `frontend/src/test/DeliveryAnalyticsClickThrough.test.tsx`
  - Description: Enable row click-through on Table 2 records to open task details modal (`handleOpenTaskById`) with keyboard focus (Enter key), cursor pointer, and real anchor link supporting right-click/middle-click open in new tab (`/OpAdmin_Dashboard?taskId=...`). Table 1 rows filter by driver. Handle URL deep-linking on mount and display clear permission error toast if an unauthorized user attempts access.

- [ ] Step 5: Regression & Verification Testing
  - Files: `backend/Tests/DmsIntegration/DmsIntegrationTests.cs`, `frontend/src/test/DeliveryAnalyticsClickThrough.test.tsx`, `frontend/src/test/TaskViewDmsPod.test.tsx`
  - Description: Run full backend and frontend test suites (`dotnet test` and `npm test`). Verify POD preview/download, unassigned and inactive driver handling, name search/filtering, and permission checks.

---

## Open questions / assumptions
1. **Existing Historical PODs Backfill**:
   - *Assumption*: Existing PODs already uploaded in DMS will appear **automatically on-demand** whenever a user views that task/order in STARS, because the backend queries DMS if not yet cached.
   - *Question for User*: Would you like an automated background batch backfill script to pre-populate historical PODs across all completed deliveries in the database, or should we keep it strictly on-demand to avoid unnecessary external API traffic? (We will not run a bulk backfill without your approval).
2. **Row Click Behavior in Delivery Analytics**:
   - *Table 2 (Individual Delivery Record)*: Opens that specific task's details modal and supports new-tab navigation.
   - *Table 1 (Aggregated Driver Summary)*: Filters the records table and charts to that driver's tasks.
   - *Question for User*: Does this dual behavior meet your workflow expectations, or would you prefer Table 1 to navigate to a separate view?
3. **Database Migration Policy**:
   - We have confirmed that **no database migration is required**. We will store and proxy POD references using existing `TaskAttachment` and `TaskDeliveryDetail` schemas, preventing schema divergence or deployment risks.
