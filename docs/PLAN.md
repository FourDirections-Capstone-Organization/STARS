# Pre-Delivery Task Creation Plan

**Target Feature Branch**: `fix/pre-delivery-task-creation`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved)

## Findings so far
- frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx: TaskModal, handleNewTask, DuplicateWarningModal
- frontend/src/components/PreDeliveryTab/PreDeliveryTab.tsx: PreDeliveryTab table and task creation trigger
- backend/Modules/TaskManagement/TaskService.cs: Task creation, assignment, and deadline validation
- backend/Modules/Utilities/DuplicateDetectionService.cs: Duplicate check logic triggering duplicate warnings

## Root causes (from Step 2)
Full report: [docs/pre-delivery-root-cause-analysis.md](pre-delivery-root-cause-analysis.md)
- **Modal Stacking (Symptom 1)**: `TaskModal` stays mounted alongside `DuplicateWarningModal`, stacking overlays; `setShowNew(false)` closes prematurely before async save.
- **Validation Lockout (Symptom 2)**: Missing `expectedDelivery` locks `dueAt` as empty, failing client validation with 0 requests; unmapped courier leaves `assignedTo` empty.
- **Past Deadlines (Symptom 4)**: `isPreDelivery` skips frontend past-date check, sending past dates rejected by backend with 400 (`Deadline must be a future date/time`).

## Decisions to confirm before Steps 4 and 5
- **Missing delivery date**: Unlock `dueAt` for manual / quick-pick selection, or auto-default to +24h/+48h based on priority?
- **Past delivery date**: Prompt coordinator to select a future date, auto-shift deadline to future SLA, or allow override?
- **Unmapped courier**: Require coordinator manual selection from dropdown, or auto-assign to default dispatcher/pool?

## Implementation Steps

- [x] Step 1: Reproduce the bug across different pre-delivery orders and record failing vs. succeeding cases
  - Verify: Document reproduction results with specific order IDs, symptoms observed, and failure categories

- [x] Step 2: Identify root causes by comparing data shapes, save handler execution, network traffic, and backdrop stacking
  - Verify: Confirm whether handler runs, network requests fire, and multiple backdrops mount without guessing

- [x] Step 3: Hide TaskModal overlay while DuplicateWarningModal is active and keep modal open until async save completes
  - Verify: Single backdrop mounts when duplicate warnings trigger, and modal displays loading state until save resolves

- [ ] Step 4: Unlock due date for orders missing expectedDelivery and allow coordinator courier selection when unmapped
  - Verify: Missing dates allow manual/quick-pick entry without validation lock, and unmapped couriers can be selected and saved

- [ ] Step 5: Detect past delivery deadlines on pre-delivery orders and adjust to a valid future SLA deadline before submission
  - Verify: Orders with historical expectedDelivery dates produce valid future deadlines and succeed without backend 400 rejection

- [ ] Step 6: Run backend and frontend test suites to ensure zero regressions
  - Verify: All dotnet test and npm test suites pass cleanly
