# Pre-Delivery Bug Reproduction & Analysis Report (Step 1)

**Date**: 2026-10-26  
**Branch**: `step-1-reproduce-pre-delivery-bug`  
**Target Feature Branch**: `fix/pre-delivery-task-creation`  
**Defect Reference**: Defect 22 (Pre-Delivery Operational Task Creation & Validation)

---

## 1. Reproduction Overview

This report documents the reproduction and categorization of pre-delivery task creation failures identified when initiating task creation from the Pre-Delivery Validation tab (`PreDeliveryTab.tsx`) via `OpAdmin_Dashboard.tsx` and `TaskModal`.

Orders were evaluated across differing DMS payload shapes, date constraints, courier assignments, and existing STARS task similarity.

---

## 2. Test Cases & Reproduction Matrix

| Order ID | Waybill Number | Test Scenario | Observed Symptom | Failure Category | Outcome |
|---|---|---|---|---|---|
| **ORD-DMS-201** | `WB-2026-000201` | Order similar to existing STARS task (triggers similarity >= 60%) | `showNew` remains `true` while `DuplicateWarningModal` renders. Both `.modal-overlay` backdrops mount concurrently, darkening screen twice (opaque). Clicking "Continue" closes modal before task creation resolves. | **Symptom 1**: Modal Stacking & Backdrop Darkening | **FAIL** |
| **ORD-DMS-202** | `WB-2026-000202` | Order with missing / null `expectedDelivery` | `TaskModal` requires `dueAt` (`validateField('dueAt', '')`). However, `dueAt` is `disabled={isPreDelivery}` and `readOnly={isPreDelivery}`, and quick-pick buttons are hidden (`!isPreDelivery`). Clicking Save triggers validation error on an uneditable field. | **Symptom 2**: Client Validation & Locked Input | **FAIL** |
| **ORD-DMS-203** | `WB-2026-000203` | Order with unmapped courier ID (`driverEmployeeId: "DMS-UNMAPPED-999"`) | Courier is not found in STARS eligible employee list. `assignedTo` defaults to empty string. Form validation fails with "Please select an employee" without clear guidance or auto-assignment fallback. | **Symptom 2**: Unmapped Courier Assignment | **FAIL** |
| **ORD-DMS-204** | `WB-2026-000204` | Order with historical / past delivery deadline (`expectedDelivery: "2026-10-15T08:00:00Z"`) | Frontend skips past-date check (`if (!isPreDelivery)`), but locks input from user editing. Backend `TaskService.cs` line 61 rejects `deadline <= now` with `400 Bad Request: "Deadline must be a future date/time"`. Modal closes, task not created. | **Symptom 4**: Backend API Rejection / Past Deadline | **FAIL** |
| **ORD-DMS-205** | `WB-2026-000205` | Valid standard order (future expectedDelivery, mapped courier, unique details) | Fields pre-fill correctly, duplicate check passes, task is created via `POST /api/Task`, delivery details attached via `PUT /api/dms-integration/tasks/{id}/delivery-details`, success modal displays. | Baseline: Valid Pre-Delivery Workflow | **PASS** |

---

## 3. Detailed Symptom Analysis

### Case 1: Modal Stacking & Backdrop Darkening (Symptom 1)
- **Order Tested**: `ORD-DMS-201` (`WB-2026-000201`)
- **Location**: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 9617-9624 & 10544-10630.
- **Mechanism**:
  - `handleNewTask` initiates duplicate checking:
    ```typescript
    const checkRes = await api.post('/api/Duplicate/check', { title: data.title, description: data.description });
    if (checkJson?.isSuccess && checkJson?.data?.hasDuplicates && checkJson.data.matches?.length > 0) {
        setDuplicateWarnings(checkJson.data.matches);
        setPendingTaskData(data);
        return;
    }
    ```
  - When duplicates are found, `showNew` remains `true` so `<TaskModal>` stays mounted with `.modal-overlay`.
  - In addition, `<DuplicateWarningModal>` mounts with its own `.modal-overlay`.
  - **Symptom**: Two opaque/semi-transparent layers stack, causing extreme backdrop darkening and confusing UI state.
  - Furthermore, clicking "Continue" executes:
    ```typescript
    setShowNew(false);
    handleNewTask(task, true);
    ```
    This abruptly unmounts the modal prior to backend response.

---

### Case 2: Client-Side Validation Lockout on Missing Dates (Symptom 2)
- **Order Tested**: `ORD-DMS-2022` (`WB-2026-000202`)
- **Location**: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 8891-8900 & 1350-1365.
- **Mechanism**:
  - If a DMS order lacks `expectedDelivery`, `handleCreateTaskFromPreDeliveryOrder` passes `dueAt: ''`.
  - Inside `TaskModal`:
    ```tsx
    <input
        type="datetime-local"
        value={form.dueAt}
        readOnly={slaLocked || isPreDelivery}
        disabled={isPreDelivery}
        ...
    />
    ```
  - `validateField('dueAt', '')` fails with `'Due date is required.'`.
  - Because `disabled={isPreDelivery}` and quick-pick buttons are suppressed for `isPreDelivery`, the coordinator cannot provide a date.
  - **Symptom**: User is locked out of saving the task and cannot modify the invalid field.

---

### Case 3: Courier Unmapped & Empty Assignment (Symptom 2)
- **Order Tested**: `ORD-DMS-203` (`WB-2026-000203`)
- **Location**: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx` lines 997-1005.
- **Mechanism**:
  - When `driverEmployeeId` from DMS does not match any STARS employee:
    ```typescript
    const matched = mapped.find(e =>
        e.accountId.toLowerCase() === deliveryForm.courierEmployeeId.toLowerCase() ||
        (e as any).employeeNumber?.toLowerCase() === deliveryForm.courierEmployeeId.toLowerCase()
    );
    ```
  - `matched` is `undefined`, so `form.assignedTo` remains `""`.
  - `validateField('assignedTo', form.assignedTo)` triggers `'Please select an employee.'`.
  - **Symptom**: Order cannot be saved without manual intervention in the assignment tab, without an alert or fallback recommendation.

---

### Case 4: Backend API Rejection on Historical Deadlines (Symptom 4)
- **Order Tested**: `ORD-DMS-204` (`WB-2026-000204`)
- **Location**: `backend/Modules/TaskManagement/TaskService.cs` lines 61-62.
- **Mechanism**:
  - When a pre-delivery order in DMS has an expected delivery date from earlier in the day or a prior day, frontend passes it through without validation error (`if (!isPreDelivery)` bypasses the frontend past-date check).
  - The payload sent to `POST /api/Task` contains:
    ```json
    { "deadline": "2026-10-15T08:00:00Z" }
    ```
  - In `backend/Modules/TaskManagement/TaskService.cs`:
    ```csharp
    if (deadline.Value <= now)
        return ApiResponseDTO<TaskResponseDTO>.Failure("Deadline must be a future date/time");
    ```
  - **Symptom**: Backend returns `400 Bad Request`. `OpAdmin_Dashboard` displays error toast `'Deadline must be a future date/time'` and resets modal state, losing coordinator work.

---

## 4. Conclusion & Hand-off to Subsequent Steps
- **Step 1 Completion**: Reproduction confirmed across all 5 test order permutations, isolating Symptoms 1, 2, and 4 into distinct failure modes.
- **Next Planned Step (Step 2)**: Identify root causes by comparing data shapes, save handler execution, network traffic, and backdrop stacking.
