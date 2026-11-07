# Organizational Structure Employee Dashboard – Filters, Cancelled Status, & Role-Based Tabs (RBAC)

**Feature branch:** `fix/employee-dashboard-filters-and-rbac` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to the working feature branch.

> [!IMPORTANT]
> **Scope Confirmation**: This fix applies **strictly and exclusively** to the Employee Dashboard accessed within the **Organizational Structure tab** (`OrgStructureTab.tsx` $\rightarrow$ `EmployeeDashboard/`), which appears when clicking an employee node in the hierarchy tree. It does NOT touch the personal operational employee portal (`OpEmployee_Dashboard.tsx`) or other dashboards.

## 1. Root Cause Analysis (Broken Dropdown Filter)

Prior to implementing changes, the codebase was investigated across the UI (`EmployeeTaskLists.tsx`), the request query builder (`employeeDashboardService.ts`), and the server (`TaskController.cs`, `TaskService.cs`).

### Findings:
1. **Server-Side Enum Parsing Failure (`backend/Controllers/TaskController.cs`)**:
   - `TaskController.GetAll` receives `[FromQuery] string? status`.
   - It parses via `Enum.TryParse<Models.Enums.TaskStatus>(firstStatus, true, out var sEnum)`.
   - In C#, `Enum.TryParse` strictly requires enum identifier names without spaces (e.g., `InProgress`, `OnHold`, `NotStarted`).
   - The UI `<select>` sends human-readable strings with spaces or aliases:
     - `"In Progress"`: `Enum.TryParse` fails because the enum identifier is `InProgress`.
     - `"On Hold"`: `Enum.TryParse` fails because the enum identifier is `OnHold`.
     - `"Pending"`: `Enum.TryParse` fails because `Pending` does not exist in `TaskStatus` (canonical value is `NotStarted`).
   - **Result**: `parsedStatus` remains `null`. The backend executes `_taskService.GetAllAsync` with `status = null`, returning ALL tasks completely unfiltered.
2. **Client-Side Filter Mismatch (`EmployeeTaskLists.tsx`)**:
   - In `displayItems` (used in static/controlled mode or when filtering client-side), the filter compared `formatStatus(item.status).toLowerCase()` against `statusFilter.toLowerCase()`.
   - For `status = 0`, `formatStatus` produces `"Not Started"`. Selecting `"Pending"` resulted in `"not started" === "pending"` (false), hiding all tasks.
3. **Missing "Cancelled" Status**:
   - The dropdown lacked `<option value="Cancelled">Cancelled</option>` entirely, despite `TaskStatus.Cancelled = 5` existing in the domain model.
4. **Shared Tab Filter State**:
   - `EmployeeTaskLists.tsx` maintained a single shared `statusFilter`, `searchQuery`, and `page` across both tabs, causing filters on the Assigned tab to inadvertently mutate the Created tab context.
5. **Lack of Server-Side Enforcement for Created Tasks (`TaskService.cs`)**:
   - `TaskService.GetAllAsync` filtered solely by `query.Where(t => t.CreatedById == createdByUserId.Value)` without verifying whether the queried user has task creation privileges under RBAC.

---

## 2. Out of Scope
- Personal operational employee portal (`OpEmployee_Dashboard.tsx`) and general task board tabs in `OpAdmin_Dashboard.tsx` or `TaskManager.tsx`.
- Modifying database migrations (all enum values `NotStarted = 0`, `InProgress = 1`, `DonePendingReview = 2`, `Completed = 3`, `OnHold = 4`, `Cancelled = 5` already exist).
- Changing role hierarchy levels or updating user account permissions outside the task filtering scope.

---

## 3. Implementation Steps

- [x] Step 1: Backend status parsing normalization and RBAC helper
  - Files: `backend/Controllers/TaskController.cs`, `backend/Modules/RoleBasedAccessControl/RoleService.cs`
  - Normalize `status` in `TaskController.GetAll` (strip spaces, map `"Pending"` -> `NotStarted`, `"Done"` -> `Completed`, `"Cancelled"`/`"Canceled"` -> `Cancelled`, handle integer codes `"0"`-`"5"` and `"Overdue"`).
  - Expose `RoleService.CanCreateTasks(UserRole role) => GetPermissionsForRole(role).Contains("CreateTasks")` leveraging existing `"CreateTasks"` permission.
  - Verify: `dotnet build backend/Backend.csproj` succeeds.

- [x] Step 2: Server-side RBAC enforcement for `createdByUserId`
  - Files: `backend/Modules/TaskManagement/TaskService.cs`, `backend/Modules/OrganizationalStructure/HierarchyService.cs`
  - In `TaskService.GetAllAsync`, when `createdByUserId.HasValue`, inspect the creator's role; if not permitted to create tasks (`!RoleService.CanCreateTasks`), return an empty result (`Items` empty, `TotalCount = 0`).
  - In `HierarchyService.GetEmployeeDashboardAsync`, set `totalCreatedTasks = 0` for non-creator operational roles.
  - Verify: Backend unit tests in `TaskServiceCreatedByFilterTests.cs` and `HierarchyDashboardTests.cs` pass.

- [ ] Step 3: Tab renaming across UI, charts, empty states, and tests
  - Files: `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeTaskLists.tsx`, `EmployeeDashboard.tsx`, `EmployeeCharts.tsx`, test files
  - Rename tab buttons: "Tasks assigned to them" -> "Assigned Tasks", "Tasks created by them" -> "Tasks Created".
  - Rename chart workload breakdown labels and legends: "Assigned Tasks" and "Tasks Created".
  - Clean up created tab empty message to neutral "No tasks created by this employee".
  - Verify: Updated label assertions pass in `EmployeeCharts.test.tsx` and `EmployeeDashboard.test.tsx`.

- [ ] Step 4: Dropdown filter fix, Cancelled status, independent tab filter states, and RBAC tab hiding
  - Files: `frontend/src/components/Auth/authRedirect.ts`, `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeTaskLists.tsx`, `EmployeeDashboard.tsx`
  - Implement `canRoleCreateTasks(role)` helper in `authRedirect.ts`.
  - Add "Cancelled" option to `<select id="task-status-filter">` on both tabs.
  - Separate filter states per tab (`assignedFilterState` vs `createdFilterState` for search, status, and page).
  - Changing filter resets page to 1.
  - For operational roles (Dispatcher, Encoder, Courier, Accountant), completely hide/omit the "Tasks Created" tab button and force `activeTab = 'assigned'`.
  - Verify: Vitest tests in `EmployeeTaskLists.test.tsx` pass.

- [ ] Step 5: Full verification & automated test coverage
  - Files: `backend/Tests/TaskManagement/TaskServiceCreatedByFilterTests.cs`, `frontend/src/test/EmployeeTaskLists.test.tsx`, `frontend/src/test/EmployeeDashboard.test.tsx`, `frontend/src/test/EmployeeDashboardEdgeCases.test.tsx`
  - Add backend tests for operational role `createdByUserId` returning 0 tasks, and status filter variations ("Cancelled", "In Progress", "On Hold", "All").
  - Add frontend tests for tab visibility (Manager, Coordinator vs Operational roles), Cancelled status filter, and independent filter states.
  - Run full backend and frontend test suites (`dotnet test`, `npm test`).

---

## 4. Open Questions / Assumptions
1. **"All Statuses" inclusion of Cancelled tasks**:
   - *Finding*: `TaskService.GetAllAsync` does NOT exclude cancelled tasks unless `excludeStatus` or `excludeStatuses` is explicitly provided.
   - *Decision*: In the Employee Dashboard, "All Statuses" includes all tasks (including Cancelled) to preserve a complete historical audit trail for managers viewing personnel records. Selecting "Cancelled" filters specifically to cancelled tasks.
2. **Server-side response for operational user on `createdByUserId`**:
   - *Decision*: Follows the existing API convention by returning `ApiResponseDTO<TaskListResponseDTO>.Success` with an empty collection (`Items = []`, `TotalCount = 0`). This safely prevents data leaks without causing unexpected client-side network error crashes.
3. **Role determination**:
   - *Decision*: Strictly evaluated based on the role of the employee being inspected (`data.role`), not the session role of the viewing administrator.
