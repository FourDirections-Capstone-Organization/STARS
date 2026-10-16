# Implementation Plan: STARS ↔ FOMS Backend API Integration (per `STARS-TO-FOMS.pdf`)

## 1. Executive Summary & Integration Architecture

This implementation plan details the backend-only integration between **STARS** (Smart Task Assignment & Routing System) and **FOMS** (Finance Operations Management System) strictly following the functional specifications outlined in `STARS-TO-FOMS.pdf`. 

As with the preceding **STARS-TO-DMS Integration**, this integration is implemented:
- **Backend-Only**: Zero frontend modifications until explicitly requested later.
- **Machine-to-Machine Secure**: Pre-shared 256-bit cryptographic API keys passed via `X-Api-Key` headers (independent of user JWT session lifecycles).
- **Decoupled & Non-Blocking**: External API calls are wrapped in non-blocking try-catch blocks and background workers; an outage or timeout in one system will never block core operations in the other.
- **Idempotent**: All incoming webhook endpoints check for existing identifiers (e.g., `InvoiceNumber` or `TaskId`) to prevent duplicate task or record creation upon network retries.
- **Headless Test Driven**: Verified through an automated headless Node.js end-to-end test suite (`test-stars-foms-e2e.mjs`) before and after Azure deployment.

---

## 2. Scope Matrix from `STARS-TO-FOMS.pdf`

| # | Integration Feature | Direction | Trigger in Source System | Target System Action | Key Data Transmitted |
|---|---|---|---|---|---|
| **1** | **Invoice Endorsement → Client Acknowledgment Task** | **FOMS → STARS → FOMS** (Bi-directional Cycle) | Head Accountant verifies & finalizes invoice in FOMS (FR-019, FR-020). | 1. STARS auto-creates an Endorsement Delivery Task & routes it.<br>2. When client signs and STARS Manager approves (Completed), STARS sends completion callback to FOMS.<br>3. FOMS calculates standard 30-day due date (FR-028) & updates AR. | Invoice No, Client details, Amount, Due Date, Doc URL, STARS Task ID, Assignee, Signed Copy URL, Actual Received Date, Completion Timestamp. |
| **2** | **FOMS Payment Status → STARS Dashboard Visibility** | **FOMS → STARS** (Asynchronous Webhook) | Real-time invoice/payment status change in FOMS billing module (FR-021, FR-022: Draft, Approved, Sent, Overdue, Paid). | STARS updates internal client financial cache and exposes real-time dashboard metrics (FR-038) for Coordinators and Managers. | Client Account ID, Invoice No, Current Status, Total Amount, Outstanding Balance, Next Due Date, Timestamp. |
| **3** | **Overdue Accounts Collection Routing** | **FOMS → STARS** (Automated Alert Webhook) | FOMS aging logic detects account as overdue or due soon (FR-024, FR-025, FR-026, FR-059). | STARS intercepts alert, auto-creates a "Collection Follow-up" task, and uses the **Graph Routing Engine** to assign to optimal Coordinator. | Invoice No, Due Date, Amount Due, Aging Bucket (1-30, 31-60, etc.), Days Overdue, Client Contact & Address. |

---

## 3. Azure App Service Environment Variables

Two cryptographically random 256-bit hex keys are provisioned for cross-service authentication:
- **`STARS_TO_FOMS_KEY`**: `cfeb22557344061f853cee23cef70f2a2508fcbb36658ccc79fec8c7d5049ff4`
- **`FOMS_TO_STARS_KEY`**: `fdc188d939e6bdb7841d7629ff29dc99a8ef9e2363accafc016929167da8e890`

### A. STARS Azure App Service (`STARS`)
Configure under **Azure Portal → STARS App Service → Configuration → Application settings**:

| Setting Name | Recommended Production Value | Description |
|---|---|---|
| `FomsIntegration__BaseUrl` | `https://<your-foms-app>.azurewebsites.net` | Base URL of the deployed FOMS Azure Web App API. |
| `FomsIntegration__OutboundApiKey` | `cfeb22557344061f853cee23cef70f2a2508fcbb36658ccc79fec8c7d5049ff4` | Secret key STARS presents in `X-Api-Key` when sending completion callbacks to FOMS. |
| `FomsIntegration__InboundApiKey` | `fdc188d939e6bdb7841d7629ff29dc99a8ef9e2363accafc016929167da8e890` | Secret key expected from FOMS in `X-Api-Key` when receiving endorsement, status, or overdue webhooks. |

### B. FOMS Azure App Service (`FOMS`)
Configure under **Azure Portal → FOMS App Service → Configuration → Application settings**:

| Setting Name | Recommended Production Value | Description |
|---|---|---|
| `StarsIntegration__StarsBaseUrl` | `https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net` | Base URL of the deployed STARS Azure Web App API. |
| `StarsIntegration__InboundApiKey` | `cfeb22557344061f853cee23cef70f2a2508fcbb36658ccc79fec8c7d5049ff4` | Secret key expected from STARS in `X-Api-Key` when receiving invoice endorsement completion callbacks. |
| `StarsIntegration__OutboundApiKey` | `fdc188d939e6bdb7841d7629ff29dc99a8ef9e2363accafc016929167da8e890` | Secret key FOMS presents in `X-Api-Key` when pushing endorsement requests, payment status updates, or overdue alerts to STARS. |

---

## 4. Detailed Component Design

### 4.1 STARS Backend Architecture (`STARS/backend`)

#### 1. Additive Database Models & Migration (PostgreSQL via EF Core)
- **`Models/TaskFomsInvoiceDetail.cs`** (1:1 with `Task`):
  - `TaskId` (Guid, PK/FK)
  - `InvoiceNumber` (string, Indexed)
  - `ClientName`, `ClientAddress`, `ClientContactPerson`, `ClientContactNumber`, `ClientEmail`
  - `InvoiceAmount` (decimal), `BillingDate`, `DueDate`
  - `InvoiceDocumentUrl` (string?)
  - `SignedReceivingCopyUrl` (string?)
  - `ActualReceivedDate` (DateTime?)
  - `DeliveryRemarks` (string?)
  - `EndorsementStatus` (string: "PendingEndorsement", "Delivered", "Endorsed", "Completed")
  - `FomsSyncStatus` (string: "Pending", "Synced", "Failed")
  - `LastSyncedAt` (DateTime?), `CreatedAt` (DateTime), `UpdatedAt` (DateTime)
- **`Models/FomsClientFinancialStatus.cs`**:
  - `Id` (Guid, PK)
  - `ClientAccountId` (string, Indexed)
  - `ClientName` (string)
  - `InvoiceNumber` (string, Unique Index)
  - `CurrentStatus` (string: Draft, Approved, Sent, Overdue, Paid)
  - `TotalAmount`, `AmountPaid`, `OutstandingBalance`
  - `NextDueDate`, `LastPaymentDate`, `LastUpdatedFromFoms`
- **`Models/TaskFomsCollectionDetail.cs`** (1:1 with `Task`):
  - `TaskId` (Guid, PK/FK)
  - `InvoiceNumber` (string, Indexed)
  - `ClientAccountId`, `ClientName`, `AmountDue`
  - `DaysOverdue` (int), `AgingStatus` (string: "1-30", "31-60", "61-90", "90+")
  - `DueDate` (DateTime?), `CreatedAt` (DateTime)
- **EF Core Migration**: `AddFomsIntegrationModels` generated and registered in `AppDbContext`. Auto-applies on startup via `Database.Migrate()`.

#### 2. Service Layer: `Modules/FomsIntegration/`
- **`FomsIntegrationSettings.cs`**: Strongly-typed configuration options mapped to `FomsIntegration` section.
- **`IFomsIntegrationService.cs` & `FomsIntegrationService.cs`**:
  - `CreateEndorsementTaskAsync(FomsEndorsementRequestDTO dto)`: Validates idempotency, creates STARS task with random 8-character `TaskNumber`, saves `TaskFomsInvoiceDetail`, notifies coordinators.
  - `SendInvoiceEndorsementCompletionAsync(Guid taskId, Guid reviewerId)`: Triggered on task approval; sends HTTP POST callback to FOMS with signed copy URL and received date.
  - `ProcessPaymentStatusWebhookAsync(FomsPaymentStatusDTO dto)`: Upserts client financial status cache.
  - `ProcessOverdueAlertWebhookAsync(FomsOverdueAlertDTO dto)`: Creates collection follow-up task, queries `SuitabilityService` (Graph Routing Engine) to assign to optimal Coordinator.
  - `GetDashboardFinancialSummaryAsync()`: Merged KPI summary for STARS dashboard (FR-038).

#### 3. Controller Layer: `Controllers/FomsIntegrationController.cs`
- **Machine-to-Machine Endpoints (`AllowAnonymous`, Guarded by `X-Api-Key`):**
  - `POST /api/integration/foms/endorsement-request` (Integration 1: Initial request)
  - `POST /api/integration/foms/payment-status` (Integration 2: Real-time status update)
  - `POST /api/integration/foms/overdue-alert` (Integration 3: Overdue collection routing)
  - `POST /api/integration/foms/dispatch-completion` (M2M trigger for headless test verification)
  - `GET  /api/integration/foms/dashboard-summary` (Merged financial summary for dashboard)
- **Internal User Endpoints (`Authorize`):**
  - `GET /api/foms-integration/tasks/{taskId:guid}/endorsement-details` (Retrieve endorsement info)
  - `PUT /api/foms-integration/tasks/{taskId:guid}/sign-endorsement` (Submit signed receiving copy & actual received date)

#### 4. Workflow Hook in `TaskWorkflowService.cs`
- In `ReviewTaskAsync` (lines ~197-210 alongside DMS trigger):
  - If task has a linked `TaskFomsInvoiceDetail` in `PendingEndorsement`, fire `SendInvoiceEndorsementCompletionAsync` in a non-blocking try-catch block.

---

### 4.2 FOMS Backend Architecture (`FOMS-System-Repository/foms-backend`)

#### 1. Configuration & Options
- `FOMS.Application/Configuration/StarsIntegrationOptions.cs`:
  - `StarsBaseUrl`, `InboundApiKey`, `OutboundApiKey`.

#### 2. Models & Database Persistence
- `FOMS.Domain/Entities/StarsInvoiceEndorsementLink.cs` (or EF model mapped to `dbo.StarsInvoiceEndorsementLinks`):
  - `Id` (int, PK)
  - `InvoiceNumber` (string, Unique)
  - `StarsTaskId` (string), `StarsTaskNumber` (string)
  - `Status` ("Requested", "Received", "Endorsed")
  - `ActualReceivedDate` (DateTime?), `SignedCopyUrl` (string?), `DeliveryRemarks` (string?)
  - `CreatedAt`, `UpdatedAt`
- SQL script: `scripts/AddStarsInvoiceEndorsementLinks.sql` (for direct database update).

#### 3. Service Layer (`FOMS.Application/Services/StarsIntegrationService.cs`)
- `RequestInvoiceEndorsementAsync(string invoiceNo, string? remarks)`: Pushes finalized invoice to STARS `POST /api/integration/foms/endorsement-request`.
- `ProcessEndorsementCompletionAsync(StarsEndorsementCompletionDto dto)`:
  - Validates `X-Api-Key`.
  - Updates invoice status to `Received` / `Endorsed`.
  - Calculates 30-day payment term due date per **FR-028**: `invoice.DueDate = dto.ActualReceivedDate.AddDays(30)`.
  - Updates Accounts Receivable record (FR-023, FR-024).
  - Writes audit trail log to `dbo.AuditLogs` (FR-074 to FR-076).
- `NotifyPaymentStatusChangeAsync(string invoiceNo)`: Emits status webhook to STARS `POST /api/integration/foms/payment-status`.
- `SendOverdueAlertAsync(string invoiceNo)`: Emits alert webhook to STARS `POST /api/integration/foms/overdue-alert`.

#### 4. Controller Layer (`FOMS.Api/Controllers/IntegrationController.cs`)
- `POST /api/integration/stars/invoice-endorsed` (Guarded by `X-Api-Key`): Receives signed copy callback from STARS.
- `POST /api/integration/stars/trigger-endorsement/{invoiceNo}` (Guarded by `X-Api-Key` or Admin): Dispatches endorsement to STARS.
- `POST /api/integration/stars/trigger-status-sync/{invoiceNo}`: Test trigger for payment status sync.
- `POST /api/integration/stars/trigger-overdue-alert/{invoiceNo}`: Test trigger for overdue collection routing.

---

## 5. Git Branching, Backup & Release Workflow

To ensure zero risk of data or code loss, the following strict workflow will be adhered to:

### Phase 1: Git Branch Creation
1. **STARS Repository**:
   - Ensure working tree is clean.
   - Switch to `refactoring/bug-fix`: `git checkout refactoring/bug-fix && git pull origin refactoring/bug-fix`
   - Create local feature branch: `git checkout -b integration/stars-foms-api`
2. **FOMS Repository**:
   - Ensure working tree is clean.
   - Switch to `develop`: `git checkout develop && git pull origin develop`
   - Create local feature branch: `git checkout -b integration/stars-foms-api`

### Phase 2: Feature Development & Local Compilation
- Implement backend services, DTOs, controllers, and tests on `integration/stars-foms-api` in both repositories.
- Validate local build:
  - `STARS`: `dotnet build backend/Backend.csproj` (must compile with 0 errors).
  - `FOMS`: `dotnet build FOMS.Api/FOMS.Api.csproj` (must compile with 0 errors).

### Phase 3: Automated Headless Testing Gate
Create and execute `api-integration-tests/test-stars-foms-e2e.mjs`:
- Test 1: Security rejection on both APIs when `X-Api-Key` is missing or invalid (expects 401/503).
- Test 2: Integration 1 Endorsement Request (FOMS → STARS) creates Task with random 8-character Task ID.
- Test 3: Integration 1 Completion Callback (STARS → FOMS) sends signed copy and calculates 30-day due date in FOMS.
- Test 4: Integration 2 Payment Status Webhook (FOMS → STARS) populates dashboard metrics in STARS.
- Test 5: Integration 3 Overdue Alert (FOMS → STARS) creates and routes Collection Follow-up task using Graph Routing Engine.
- **Rule**: No merging occurs unless all automated headless tests pass 100%.

### Phase 4: Backup Branches & Merge
1. **STARS**:
   - Create safety backup branch: `git branch backup/refactoring-bug-fix-before-foms-integration refactoring/bug-fix`
   - Switch to `refactoring/bug-fix`: `git checkout refactoring/bug-fix`
   - Merge: `git merge integration/stars-foms-api --no-ff -m "feat(integration): implement STARS-FOMS backend API integrations 1, 2, and 3"`
   - Push to remote: `git push origin refactoring/bug-fix` (triggers Azure backend deployment via GitHub Actions).
2. **FOMS**:
   - Create safety backup branch: `git branch backup/develop-before-stars-integration develop`
   - Switch to `develop`: `git checkout develop`
   - Merge: `git merge integration/stars-foms-api --no-ff -m "feat(integration): implement STARS-FOMS backend API integrations 1, 2, and 3"`
   - Push to remote: `git push origin develop`.

### Phase 5: Post-Deployment Live Verification
- Execute `test-stars-foms-e2e.mjs` against the live Azure endpoints to confirm all 3 integrations operate seamlessly across the internet with zero UI intervention.
