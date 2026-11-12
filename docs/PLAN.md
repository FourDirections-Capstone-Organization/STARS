# Plan: Fix Completed Tab Status Display & Delivery Analytics Report Fallback

**Feature branch:** `fix/delivery-analytics-and-completed-status` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Findings & Root Cause Analysis

### 1. Completed Tab Status Incorrectly Displayed as "Pending Review"
- **Root Cause**: In `frontend/src/utils/statusUtils.ts`, the centralized mapping dictionary `TASK_STATUS_MAP` erroneously mapped `'done': 'Pending Review'`.
- **Impact**: In `OpAdmin_Dashboard.tsx` and `SystemAdmin_Dashboard.tsx`, tasks in the "Completed" tab (backend status 3 / `Completed`) were mapped to `TMTask['status'] = 'Done'`. When `<StatusBadge status={t.status} size="sm" />` formatted `'Done'`, `formatStatus('Done')` evaluated `TASK_STATUS_MAP['done']` to `'Pending Review'`, rendering a purple "Pending Review" badge on completed tasks inside the Completed tab.
- **Frontend-only Fix**:
  - In `frontend/src/utils/statusUtils.ts`: Removed `'done': 'Pending Review'` and mapped `'done': 'Completed'`, updating `STATUS_BADGE_CLASSES['Done']` to `'badge badge-green'`.
  - In `frontend/src/components/TaskManager/TaskManager.tsx`: Added `'Completed'` to `TMTask['status']` union and ensured both `'Done'` and `'Completed'` tasks are treated as completed and display the green `Completed` badge.
  - In `OpAdmin_Dashboard.tsx` and `SystemAdmin_Dashboard.tsx`: Mapped backend `Completed` / `Done` statuses to `'Completed'`.

### 2. Delivery Analytics on Report Tab Empty Data
- **Root Cause**: In `ReportsTab` (`OpAdmin_Dashboard.tsx`), `fetchDmsPerfData` solely called `/api/integration/dms/performance-summary`. That endpoint:
  1. Only allows `Manager` or `Coordinator` roles (returning `401 Unauthorized` for SystemAdmin, Admin, or sessions without those explicit roles).
  2. Queries `DmsDeliveryPerformances` and `TaskDeliveryDetails` where `d.DmsStatus == "Delivered" || (d.Task != null && d.Task.Status == Completed)`. If tasks or DMS orders exist but haven't recorded a completed delivery row, it returns `records: []`.
  3. `ReportsTab` lacked any fallback mechanism, so when `records` was empty or the endpoint failed with 401, all stat cards showed 0, charts and driver breakdown tables were hidden, and Table 2 showed "No DMS Delivery Records Found".
- **Frontend-only Fix**:
  - In `ReportsTab` (`OpAdmin_Dashboard.tsx`), added a robust client-side fallback in `fetchDmsPerfData`: if `/api/integration/dms/performance-summary` returns empty records or throws 401/error, it automatically queries `/api/dms-integration/deliveries`, pending orders, and candidate tasks, synthesizing the performance metrics, SLA compliance ratio, top couriers breakdown, and completion records.
  - Added optional `tasks?: Task[]` prop to `<ReportsTab>` and passed `tasks={tasks}` from `OpAdmin_Dashboard.tsx` and `SystemAdmin_Dashboard.tsx`.

## Steps

- [x] Step 1: Frontend: Correct status label mapping for completed tasks and add Delivery Analytics fallback
  - Files: `frontend/src/utils/statusUtils.ts`, `frontend/src/components/TaskManager/TaskManager.tsx`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`, `frontend/src/test/statusUtils.test.tsx`, `frontend/src/test/DeliveryAnalyticsAndCompletedStatusFix.test.tsx`
  - Verify: Run `npm --prefix frontend test -- src/test/DeliveryAnalyticsAndCompletedStatusFix.test.tsx src/test/statusUtils.test.tsx`

- [ ] Step 2: Verification & Test Suite Regression Check
  - Verify: Run full frontend test suite `npm --prefix frontend test` and build `npm --prefix frontend run build`
