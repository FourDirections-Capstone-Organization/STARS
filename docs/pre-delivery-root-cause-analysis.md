# Pre-Delivery Task Creation Root Cause Analysis Report (Step 2)

**Date**: 2026-10-26  
**Branch**: `step-2-root-cause-analysis`  
**Target Feature Branch**: `fix/pre-delivery-task-creation`  
**Automated Test Suite**: `frontend/src/test/PreDeliveryRootCauseAnalysis.test.tsx` (7/7 tests passing)  
**Defect Reference**: Defect 22 (Pre-Delivery Operational Task Creation & Validation)

---

## 1. Executive Summary

In Step 2 of the implementation plan, we empirically investigated and verified the exact root causes of pre-delivery task creation defects across four core dimensions:
1. **Data Shapes**: Differences and schema transformations between DMS payloads (`DmsPendingOrder`), `TaskModal` component state, and Backend API DTOs (`CreateTaskDTO`, `DmsDeliveryDetailsDTO`).
2. **Save Handler Execution**: Tracing the code execution path of `handleSave` and `handleNewTask` to identify where submissions abort or proceed.
3. **Network Traffic**: Measuring the exact HTTP calls triggered under each scenario, proving when zero requests fire versus when rejection payloads are transmitted.
4. **Backdrop Stacking & DOM Mounting**: Proving that multiple backdrop overlays (`.modal-overlay` and `.fm-overlay`) mount concurrently, producing dark stacked overlays, and verifying premature modal destruction on user continuation.

All findings are backed by automated tests in `frontend/src/test/PreDeliveryRootCauseAnalysis.test.tsx`.

---

## 2. Empirical Root Cause Breakdown

### 2.1 Symptom 1: Modal Stacking & Backdrop Darkening

#### Empirical Evidence & DOM Trace
- **Test Assertion**: `container.querySelectorAll('.modal-overlay, .fm-overlay').length === 2` (PASSED).
- **Locations**:
  - `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 9617-9624, 10544-10555, and 10605-10630.
  - `frontend/src/components/FormModal/FormModal.tsx` line 169.
- **Root Cause Mechanism**:
  1. When duplicate candidates exist (similarity >= 60%), `handleNewTask` executes:
     ```typescript
     setDuplicateWarnings(checkJson.data.matches);
     setPendingTaskData(data);
     fetchDuplicateDetails(checkJson.data.matches);
     return;
     ```
  2. Notice that `showNew` remains `true`.
  3. Consequently, React simultaneously renders:
     - `<TaskModal ... />` (which renders `<div className="modal-overlay">`)
     - `<DuplicateWarningModal ... />` (which renders `<FormModal>` -> `<div className="fm-overlay">`)
  4. Both `.modal-overlay` and `.fm-overlay` apply semi-transparent dark backdrop backgrounds (`rgba(0, 0, 0, 0.5)` + `rgba(0, 0, 0, 0.6)`), stacking directly on top of each other. The UI becomes extremely dark and obscured.
  5. Furthermore, when the coordinator clicks "Continue Anyway" on `DuplicateWarningModal`:
     ```typescript
     onContinue={async () => {
         const task = pendingTaskData;
         await recordDuplicateDecision('continue');
         setShowNew(false);
         setDuplicateWarnings([]);
         setDuplicateDetails([]);
         setPendingTaskData(null);
         handleNewTask(task, true);
     }}
     ```
     `setShowNew(false)` is invoked synchronously before `handleNewTask(task, true)` even initiates the asynchronous HTTP `POST /api/Task`. If the backend API call fails or encounters latency, the user has already lost their modal view and state.

---

### 2.2 Symptom 2: Client-Side Validation Lockout & Unmapped Courier

#### Empirical Evidence & Execution Trace
- **Test Assertion 1 (Missing Date)**: `onSaveMock` not called, `api.post` called 0 times, `Due date is required.` displayed, input `disabled` and `readOnly` (PASSED).
- **Test Assertion 2 (Unmapped Courier)**: `onSaveMock` not called, `api.post` called 0 times, `Please select an employee.` displayed (PASSED).
- **Locations**:
  - `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 997-1005, 1110-1124, 1144, 1159-1164, 1345-1353, and 1365.
- **Root Cause Mechanism**:
  1. **Locked Date Input**:
     - When a DMS order has an empty or null `expectedDelivery`, `handleCreateTaskFromPreDeliveryOrder` passes `dueAt: ''`.
     - In `TaskModal`:
       ```tsx
       <input
           type="datetime-local"
           value={form.dueAt}
           onChange={(slaLocked || isPreDelivery) ? undefined : set('dueAt')}
           readOnly={slaLocked || isPreDelivery}
           disabled={isPreDelivery}
       />
       ```
     - Quick-pick buttons are suppressed for `isPreDelivery`:
       ```tsx
       {quickPicks.length > 0 && !slaLocked && !isPreDelivery && ( ... )}
       ```
     - When the coordinator clicks "Save Changes":
       ```typescript
       const handleSave = async () => {
           if (!validateAll()) {
               setFormError('Please resolve the highlighted validation errors before saving.');
               return;
           }
       ```
     - `validateField('dueAt', '')` returns `'Due date is required.'`.
     - The coordinator cannot edit the field, cannot pick a date, cannot click quick-picks, and cannot save.
  2. **Unmapped Courier**:
     - If `driverEmployeeId` from DMS does not match any STARS `accountId` or `employeeNumber`:
       ```typescript
       const matched = mapped.find(e =>
           e.accountId.toLowerCase() === deliveryForm.courierEmployeeId.toLowerCase() ||
           (e as any).employeeNumber?.toLowerCase() === deliveryForm.courierEmployeeId.toLowerCase()
       );
       if (matched) {
           setForm(prev => ({ ...prev, assignedTo: matched.accountId }));
       }
       ```
     - `matched` is `undefined`, leaving `form.assignedTo` empty (`""`).
     - `validateField('assignedTo', form.assignedTo)` triggers `'Please select an employee.'`.
  3. **Network Traffic Result**:
     - In both Cases 202 and 203, **ZERO network requests** fire. `api.post('/api/Task')` and `api.post('/api/Duplicate/check')` are never contacted because the execution terminates synchronously at client validation.

---

### 2.3 Symptom 4: Past Delivery Deadlines & Backend Rejection

#### Empirical Evidence & Network Trace
- **Test Assertion**: `onSaveMock` called with historical ISO deadline, `api.post` sends historical deadline to backend (PASSED).
- **Locations**:
  - `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 1113-1123.
  - `backend/Modules/TaskManagement/TaskService.cs` lines 61-62.
- **Root Cause Mechanism**:
  1. In `TaskModal.tsx`:
     ```typescript
     if (!isPreDelivery) {
         const now = new Date();
         if (d < now) return 'Due date cannot be in the past.';
     }
     ```
     Because `isPreDelivery` is `true`, the frontend explicitly **bypasses** the past-date validation check.
  2. The input is locked from user editing, so the historical date from DMS is retained.
  3. Clicking "Save Changes" passes client validation and sends `POST /api/Task` with:
     ```json
     { "deadline": "2026-10-12T18:00:00.000Z" }
     ```
  4. In `backend/Modules/TaskManagement/TaskService.cs`:
     ```csharp
     if (deadline.Value <= now)
         return ApiResponseDTO<TaskResponseDTO>.Failure("Deadline must be a future date/time");
     ```
  5. The backend returns `400 Bad Request`. The frontend catch block catches the error and toasts `'Deadline must be a future date/time'` and resets modal state, losing the user's progress.

---

## 3. Data Shapes Comparison Matrix

| Field | DMS Pending Order (`DmsPendingOrder`) | `TaskModal` Internal Form (`form` / `deliveryForm`) | Backend Task API (`CreateTaskDTO`) | Backend Delivery Details (`DmsDeliveryDetailsDTO`) | Discrepancy & Conversion Required |
|---|---|---|---|---|---|
| **Title** | N/A (Derived) | `[Pre-Delivery] Delivery to {recipientName} - Waybill {waybillNo}` | `Title` (string, max 150) | N/A | Formatted string constructed on modal open. Can trigger duplicate detection if title matches previous deliveries. |
| **Deadline** | `expectedDelivery` (ISO string, e.g. `"2026-10-28T18:00:00Z"` or `""`) | `dueAt` (datetime-local format: `"YYYY-MM-DDTHH:mm"`) | `Deadline` (`DateTime?`, UTC) | N/A | Must be converted between ISO 8601 and input format. Must be strictly future date (`> DateTime.UtcNow`). |
| **Priority** | `priority` (`"Urgent" \| "High" \| "Medium" \| "Low"`) | `priority` (`Priority`) | `PriorityLevel` (`int`: 0=Low, 1=Medium, 2=High, 3=Urgent) | N/A | String to integer enum mapping in frontend `prioMap`. |
| **Assignee** | `driverEmployeeId` (e.g. `"EMP-001"` or `"DMS-UNMAPPED-999"`) | `assignedTo` (`string`, STARS account ID) | `AssignedUserIds` (`List<Guid>`) | `CourierEmployeeId` (`string`) | Requires matching DMS driver string to STARS active User GUID. Role must be Courier/Dispatcher/Encoder/Accountant. |
| **Order ID** | `orderId` (`number`, e.g. `201`) | `deliveryDetails.dmsOrderId` | N/A | `DmsOrderId` (`int`) | Stored in separate delivery details entity linked by `taskId`. |
| **Waybill** | `waybillNo` (`string`, e.g. `"WB-2026-000201"`) | `deliveryDetails.dmsWaybillNo` | N/A | `DmsWaybillNo` (`string`) | Stored in separate delivery details entity. |
| **Delivery Address** | `recipientAddress` + `area` | `deliveryForm.deliveryAddress`, `area` | N/A | `DeliveryAddress`, `Area` | Preserved in delivery details attachment payload. |

---

## 4. Architectural Solutions Planned for Subsequent Steps

1. **For Step 3 (Symptom 1 - Modal Stacking & Backdrop Darkening)**:
   - When `duplicateWarnings.length > 0`, conditionally hide or suspend the `TaskModal` overlay so that only a single active `.fm-overlay` backdrop exists in the DOM.
   - Refactor `onContinue` so that `showNew` remains open with a loading spinner while the asynchronous creation request resolves. Only close upon confirmed success.
2. **For Step 4 (Symptom 2 - Client Validation & Locked Inputs)**:
   - When a pre-delivery order lacks `expectedDelivery` or has an unparseable date, unlock `dueAt` and allow user manual entry / quick-pick selection, or auto-default to +24h/+48h based on priority.
   - When courier is unmapped, provide an auto-assignment recommendation prompt or allow immediate coordinator selection without blocking error dialogs.
3. **For Step 5 (Symptom 4 - Historical Deadlines & Backend Rejection)**:
   - When an order's `expectedDelivery` is already in the past, detect the condition in frontend and offer an adjusted future deadline (e.g. Today + remaining SLA hours) or handle past delivery archiving appropriately.

---

## 5. Verification Status
- Frontend root cause suite (`src/test/PreDeliveryRootCauseAnalysis.test.tsx`): **7/7 PASSED**.
- Full frontend test suite (14 test files, 72 tests): **72/72 PASSED**.
- Backend test suite (`Backend.Tests.dll`): **507/507 PASSED**.
- Working tree clean, ready to commit and merge Step 2.
