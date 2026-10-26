# Pre-Delivery Task Creation Plan

**Target Feature Branch**: `fix/pre-delivery-task-creation`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved)

## Findings so far
- frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx: TaskModal, handleNewTask, DuplicateWarningModal
- frontend/src/components/PreDeliveryTab/PreDeliveryTab.tsx: PreDeliveryTab table and task creation trigger
- backend/Modules/TaskManagement/TaskService.cs: Task creation, assignment, and deadline validation
- backend/Modules/Utilities/DuplicateDetectionService.cs: Duplicate check logic triggering duplicate warnings

## Implementation Steps

- [x] Step 1: Reproduce the bug across different pre-delivery orders and record failing vs. succeeding cases
  - Verify: Document reproduction results with specific order IDs, symptoms observed, and failure categories

- [ ] Step 2: Identify root causes by comparing data shapes, save handler execution, network traffic, and backdrop stacking
  - Verify: Confirm whether handler runs, network requests fire, and multiple backdrops mount without guessing

- [ ] Step 3: Resolve modal stacking and backdrop darkening caused by duplicate warning triggers (Symptom 1)
  - Verify: Saving pre-delivery order with duplicate warning does not stack backdrops and saves task properly

- [ ] Step 4: Resolve silent save failures caused by client-side validation and locked inputs (Symptom 2)
  - Verify: Orders with missing dates, unmapped couriers, or unassigned fields display clear validation feedback

- [ ] Step 5: Resolve submission and API rejection errors such as past deadlines or role mismatches (Symptom 4)
  - Verify: Orders with historical or edge-case payloads create valid tasks without unexpected API errors

- [ ] Step 6: Run backend and frontend test suites to ensure zero regressions
  - Verify: All dotnet test and npm test suites pass cleanly
