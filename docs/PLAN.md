# Employee Dashboard from Org Structure Implementation Plan

**Target Feature Branch**: `feature/employee-dashboard-org-structure`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved per repository rules)

---

## 1. Summary of Codebase Findings

### Relevant Files & Architecture
- **Org Structure Component**:
  - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/OrgStructureTab.tsx` & `OrgStructureTab.css`:
    - Houses the organizational structure subtabs (`org-chart`, `hierarchy-mapping`, `departments`, `positions`, `transfers`).
    - `OrgChartView` renders a 3-tier hierarchy: Level 1 (Manager), Level 2 (Coordinator), and Level 3 (Execution Staff grouped by Department).
    - Personnel cards across all levels currently invoke `onOpenMap(e)` on click (lines 649, 680, 729), which navigates directly to the `hierarchy-mapping` tab.
- **Manager Host Shell & Routing**:
  - `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`:
    - Root dashboard component for the Manager role (protected by `ProtectedRoute allowedRoles={['Manager']}` in `frontend/src/main.tsx`).
    - Employs state-driven tab switching (`activeTab === 'org-structure'`).
- **Existing Visualization & UI Patterns**:
  - `frontend/src/components/TaskCharts/TaskCharts.tsx`: Implements Recharts (Pie/Donut for status, Bar for priority, Area for weekly activity) adhering to Speedex OneUI design tokens.
  - UI Primitives: `frontend/src/components/ui/` (`DataTable.tsx`, `Pagination.tsx`, `StatusBadge.tsx`, `StatusCard.tsx`) and `frontend/src/global.css`.
- **Backend Hierarchy & Task Architecture**:
  - `backend/Controllers/HierarchyController.cs` & `backend/Modules/OrganizationalStructure/HierarchyService.cs`: Provides hierarchy structure (`GET /api/Hierarchy/structure`) and employee hierarchy lookup (`GET /api/Hierarchy/employee/{id}`).
  - `backend/Controllers/TaskController.cs` & `backend/Modules/TaskManagement/TaskService.cs`: Provides paginated task retrieval (`GET /api/Task`) with filtering by `assignedToUserId`, `departmentId`, `status`, etc.
  - Data Entities (`backend/Models/`): `User.cs`, `Task.cs`, `TaskAssignment.cs`, `Department.cs`, `JobPosition.cs`, `Team.cs`, `TeamMember.cs`.

### Current Data Flow
1. On loading `OrgStructureTab`, parallel API calls fetch departments (`/api/Department`), job positions (`/api/job-positions`), employees (`/api/user`), and teams (`/api/Team`).
2. Personnel are filtered by role into Manager, Coordinator, and Staff member groups and displayed on the interactive tree.
3. Clicking a card currently forces a jump to the `hierarchy-mapping` subtab.

### Identified Gaps & Architectural Constraints
1. **Missing Task Creator Filter**:
   - `TaskController.GetAll` and `TaskService.GetAllAsync` support filtering by `assignedToUserId`, but **lack a `createdByUserId` parameter**. Fetching "tasks created by them" requires this backend filter to ensure server-side pagination, search, and security scoping.
2. **Missing Explicit `ReportsTo` Relationship in Database**:
   - `User.cs` has `DepartmentId` and `JobPositionId`, but no `ReportsToId` or `SupervisorId` foreign key.
   - Reporting relationships must be derived deterministically from the organizational hierarchy:
     - **Level 1 (Manager)**: Reports to Executive Board / None (Top Level).
     - **Level 2 (Coordinator)**: Reports to the Manager (active Manager account in system).
     - **Level 3 (Execution Staff)**: Reports to their Team Leader (Coordinator) if assigned to a team via `TeamMember`; if not in a team, reports to the Coordinator of their Department; if no Coordinator exists in their Department, reports to the Manager.
3. **Absence of Aggregated Employee Dashboard Metrics Endpoint**:
   - For employees with hundreds or thousands of tasks, fetching all raw task records on the frontend to compute graphs and status breakdowns client-side causes massive payload overhead and degraded performance.
   - An aggregated endpoint (`GET /api/Hierarchy/employee/{id}/dashboard`) allows EF Core to compute counts, status breakdowns, priority distributions, and completion trends via fast SQL aggregations, while task lists remain cleanly paginated via `GET /api/Task`.
4. **Access Control**:
   - Viewing an employee dashboard from the Org Structure page is scoped to Managers on the Manager Side (`SystemAdmin_Dashboard`), enforced via backend policy (`[Authorize(Policy = AuthorizationPolicies.ManagerOnly)]` or `CoordinatorAndAbove`).

---

## 2. Implementation Steps

### Phase 1: Backend Data Model & API Enhancements

- [x] Step 1: Add `createdByUserId` Filter to Task Management API
  - **Files to change**:
    - `backend/Modules/TaskManagement/ITaskService.cs`: Add `Guid? createdByUserId = null` parameter to `GetAllAsync`.
    - `backend/Modules/TaskManagement/TaskService.cs`: Implement filtering for `createdByUserId` in EF Core query (`if (createdByUserId.HasValue) query = query.Where(t => t.CreatedById == createdByUserId.Value);`).
    - `backend/Controllers/TaskController.cs`: Add `[FromQuery] Guid? createdByUserId = null` to `GetAll` action and pass it to `_taskService.GetAllAsync`.
  - **Verification**:
    - Add unit/integration test in `backend/Tests/TaskManagement/` verifying that querying tasks with `createdByUserId` filters only tasks created by that user and respects server pagination.
    - Run command: `dotnet test backend/Tests/Backend.Tests.csproj --filter "FullyQualifiedName~TaskService"` (must pass).

- [x] Step 2: Implement Employee Dashboard Summary & Reporting Hierarchy Endpoint
  - **Files to change**:
    - `backend/Models/DTOs/EmployeeDashboardDTOs.cs`:
      - Define `EmployeeDashboardDTO` containing:
        - Employee profile header (`EmployeeId`, `EmployeeNumber`, `FullName`, `Email`, `Role`, `DepartmentName`, `JobPositionName`, `AvailabilityStatus`, `PresenceStatus`).
        - Supervisor info (`EmployeeReportsToDTO`: `SupervisorName`, `SupervisorRole`, `SupervisorEmployeeNumber`, `ReportingRelation`).
        - KPI totals (`TotalAssignedTasks`, `TotalCreatedTasks`, `CompletedCount`, `InProgressCount`, `PendingCount`, `OverdueCount`).
        - Aggregated breakdown lists (`StatusBreakdown`, `PriorityDistribution`, `CompletionTrend` over recent months/weeks).
    - `backend/Modules/OrganizationalStructure/IHierarchyService.cs` & `backend/Modules/OrganizationalStructure/HierarchyService.cs`:
      - Add `GetEmployeeDashboardAsync(Guid employeeId, Guid requestUserId, UserRole requestUserRole)`.
      - Implement reporting hierarchy resolution logic (Team Leader -> Department Coordinator -> Manager -> Executive).
      - Compute SQL aggregate counts for status, priority, and completion trends for both assigned and created tasks.
    - `backend/Controllers/HierarchyController.cs`:
      - Add endpoint `[HttpGet("employee/{id:guid}/dashboard")]` protected with `[Authorize(Policy = AuthorizationPolicies.ManagerOnly)]`.
  - **Verification**:
    - Add unit/integration tests in `backend/Tests/OrganizationalStructure/HierarchyDashboardTests.cs` verifying:
      - Valid employee returns populated header, correct supervisor derivation across Level 1/2/3, and correct task counts.
      - Edge case: Non-existent employee ID returns 404 NotFound.
      - Edge case: Employee with 0 tasks returns 200 OK with zero counts and empty trend lists without throwing null reference exceptions.
    - Run command: `dotnet test backend/Tests/Backend.Tests.csproj --filter "FullyQualifiedName~Hierarchy"` (must pass).

### Phase 2: Frontend Data Services & Contracts

- [x] Step 3: Create Frontend Employee Dashboard Service and Types
  - **Files to change**:
    - `frontend/src/services/employeeDashboardService.ts`:
      - Define TypeScript interfaces: `EmployeeDashboardData`, `EmployeeReportsTo`, `TaskStatusBreakdownItem`, `TaskPriorityDistributionItem`, `TaskCompletionTrendItem`.
      - Implement API methods:
        - `getEmployeeDashboard(employeeId: string)`: Calls `GET /api/Hierarchy/employee/{id}/dashboard`.
        - `getEmployeeAssignedTasks(employeeId: string, page: number, pageSize: number, search?: string, status?: string)`: Calls `GET /api/Task?assignedToUserId={id}&pageNumber={page}&pageSize={pageSize}`.
        - `getEmployeeCreatedTasks(employeeId: string, page: number, pageSize: number, search?: string, status?: string)`: Calls `GET /api/Task?createdByUserId={id}&pageNumber={page}&pageSize={pageSize}`.
  - **Verification**:
    - Create unit tests in `frontend/src/test/employeeDashboardService.test.ts` mocking axios responses to verify API query string constructions and response mapping.
    - Run command: `npm --prefix frontend test employeeDashboardService` (must pass).

### Phase 3: Visual Analytics & Dashboard UI Components

- [x] Step 4: Create Reusable Visual Charts for Employee Dashboard
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeCharts.tsx` & `EmployeeCharts.css`:
      - Implement 4 visualizations using Recharts and Speedex OneUI color tokens (`--chart-success`, `--chart-warning`, `--chart-failed`, `--primary`, `--secondary`):
        1. **Task Status Breakdown**: Donut chart with legend and hover tooltips showing counts and percentages of Pending, In Progress, Completed, and Overdue tasks.
        2. **Created vs. Assigned Comparison**: Visual comparison card / bar chart contrasting total created vs assigned tasks.
        3. **Priority Distribution**: Horizontal/vertical bar chart showing Urgent, High, Medium, and Low tasks.
        4. **Completion Trend Over Time**: Area/Line chart illustrating task completion volume over recent timeframes.
      - Implement empty state fallback for each chart when no task activity exists.
  - **Verification**:
    - Create component unit test in `frontend/src/test/EmployeeCharts.test.tsx` testing rendering with sample metrics and verifying empty state messages when data points are 0.
    - Run command: `npm --prefix frontend test EmployeeCharts` (must pass).

- [x] Step 5: Create Employee Header and Supervisor "Reports To" Card
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeHeader.tsx` & `EmployeeHeader.css`:
      - Top navigation bar with "← Back to Org Structure" button and quick actions.
      - Profile hero section displaying avatar initials, full name, employee number badge, role badge, department, job position, and online presence badge.
      - Dedicated "Reports To" supervisor card displaying supervisor name, position, employee number, and reporting relationship (e.g., "Team Leader", "Department Coordinator", "Executive Management").
      - KPI summary status cards displaying Total Workload, Completed, In Progress, and Overdue counts.
  - **Verification**:
    - Create component unit test in `frontend/src/test/EmployeeHeader.test.tsx` verifying supervisor card rendering, fallback text for top-level managers, and KPI card numbers.
    - Run command: `npm --prefix frontend test EmployeeHeader` (must pass).

- [ ] Step 6: Create Tabbed Task Lists Component ("Created by Them" & "Assigned to Them")
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeTaskLists.tsx` & `EmployeeTaskLists.css`:
      - Tab switch between "Tasks Assigned to Them" and "Tasks Created by Them".
      - Sub-filter bar: Search input for title/description and status dropdown (All, In Progress, Completed, Overdue, On Hold).
      - Reusable `DataTable`, `StatusBadge`, and `Pagination` component integration.
      - Columns for Assigned Tasks: Task Number, Title, Priority, Status, Deadline/Due Date, and Assignee Progress %.
      - Columns for Created Tasks: Task Number, Title, Assignee/Scope, Priority, Status, Deadline, Created At.
      - Edge case handling: Specific empty state messages for "No tasks assigned to this employee" and "No tasks created by this employee (Staff members typically execute assigned tasks)".
  - **Verification**:
    - Create component unit test in `frontend/src/test/EmployeeTaskLists.test.tsx` verifying tab switching, search filter triggers, pagination interactions, and empty states.
    - Run command: `npm --prefix frontend test EmployeeTaskLists` (must pass).

- [ ] Step 7: Assemble Full Employee Dashboard Page Component
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeDashboard.tsx` & `EmployeeDashboard.css`:
      - Integrates `EmployeeHeader`, `EmployeeCharts`, and `EmployeeTaskLists`.
      - Handles loading skeletons (`Loader2`), error banner with retry button, and not-found states (e.g. invalid employee ID).
      - Coordinates state between KPI counts, chart updates, and task table pagination.
  - **Verification**:
    - Create integration test in `frontend/src/test/EmployeeDashboard.test.tsx` asserting complete lifecycle: loading state, successful data rendering, tab switching, and error handling.
    - Run command: `npm --prefix frontend test EmployeeDashboard` (must pass).

### Phase 4: Org Structure Navigation & Deep Linking Integration

- [ ] Step 8: Wire Employee Card Clicks in Org Structure to Employee Dashboard
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/OrgStructureTab.tsx`:
      - Add state `selectedEmployeeId: string | null` (synchronized with URL query parameter `?tab=org-structure&employeeId=...`).
      - Update `OrgChartView`:
        - In Manager row (line 649), Coordinator row (line 680), and Execution Staff row (line 729), change `onClick` to trigger `handleNavigateToEmployeeDashboard(emp.id)`.
        - Update node `title` attribute to "Click to view employee dashboard".
        - Preserve the "Map Hierarchy" action via the existing header button and banner so hierarchy mapping functionality remains fully intact.
      - Render condition: When `selectedEmployeeId` is set, render `<EmployeeDashboard employeeId={selectedEmployeeId} onBack={() => handleBackToOrgChart()} />` in place of the chart.
    - Update `SystemAdmin_Dashboard.tsx` (if needed for parent tab sync or deep-linking).
  - **Verification**:
    - Create integration test in `frontend/src/test/OrgStructureNavigation.test.tsx` verifying that clicking an employee node in `OrgChartView` renders `EmployeeDashboard` with that employee's ID, and clicking "← Back to Org Structure" unmounts the dashboard and returns to the org chart.
    - Run command: `npm --prefix frontend test OrgStructureNavigation` (must pass).

### Phase 5: Edge Cases, Responsiveness & Verification

- [ ] Step 9: Edge Cases, Mobile Responsiveness, and Access Guards
  - **Files to change**:
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeDashboard.css`:
      - Add responsive CSS breakpoints: stack charts on mobile/tablet screens (< 768px, < 1024px), make data tables horizontally scrollable.
    - `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeDashboard.tsx`:
      - Handle edge cases:
        - Employee with 0 tasks (assigned or created): cleanly show zero metrics and empty state charts without crashes.
        - High task volume (thousands of tasks): verify smooth server-side pagination with 10/25/50 items per page.
        - Deactivated or deleted employee: display account status pill ("Deactivated") and appropriate notice.
        - Unauthorized or invalid GUID in URL: display user-friendly error message with button to return to Org Structure.
  - **Verification**:
    - Test edge cases in `frontend/src/test/EmployeeDashboardEdgeCases.test.tsx`.
    - Run command: `npm --prefix frontend test EmployeeDashboardEdgeCases` (must pass).

- [ ] Step 10: Run Full Backend and Frontend Regression Test Suites
  - **Files to change**:
    - None (validation step).
  - **Verification**:
    - Run backend tests: `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release` (must pass with 0 failures).
    - Run frontend tests: `npm --prefix frontend test` (must pass).

---

## 3. Edge Cases & Handling Strategy

1. **Employee with No Tasks**:
   - Newly hired personnel or roles without active tasks must not break charts.
   - Charts display an empty state banner ("No task activity recorded yet"). KPI counts show 0. Task lists display "No tasks assigned yet".
2. **Roles that Never Create Tasks**:
   - Field execution staff (Encoders, Couriers) typically execute tasks rather than create them.
   - On the "Tasks Created by Them" tab, display an informative note: "Employees in this role typically execute tasks rather than create them."
3. **Large Task Counts (Scalability)**:
   - Aggregated metrics are computed on the database server using EF Core `CountAsync` and `GroupBy` rather than transferring thousands of records over HTTP.
   - Task lists are paginated server-side (default 10 per page) with server search and status filtering.
4. **Invalid or Deactivated Employee IDs**:
   - If an invalid GUID or nonexistent user ID is accessed via URL, the backend returns a 404 ApiResponse.
   - The UI catches this and renders an `AlertCircle` error state with a "Back to Org Structure" button.
5. **Mobile & Responsive Layout**:
   - Layout switches from multi-column grid to stacked flex layout on screens below 1024px and 768px.
   - Recharts components wrap inside `ResponsiveContainer` to fluidly adapt to container width.
6. **Hierarchy Mapping Continuity**:
   - Previously, clicking a card navigated to hierarchy mapping. While clicking cards now opens the Employee Dashboard, mapping remains readily available via the top-level "Map Hierarchy" button, the flow banner, and the "Hierarchy Mapping" subtab.

---

## 4. Open Questions / Assumptions

1. **Direct Supervisor Model vs. Hierarchical Derivation**:
   - *Finding*: There is currently no `ReportsToUserId` or `SupervisorId` column on the `User` table.
   - *Current Implementation Decision*: The supervisor is derived via the system hierarchy: Execution Staff -> Team Leader (or Department Coordinator) -> Manager -> Executive Board.
   - *Question for User*: Is this hierarchical derivation sufficient, or should an explicit `ReportsToUserId` foreign key column be added to the `User` entity in the database?
2. **Access Control & Permissions**:
   - *Assumption*: Since the Org Structure page is currently housed within `SystemAdmin_Dashboard` (accessible only to Managers), the employee dashboard is planned as a Manager-accessible feature.
   - *Question for User*: Should Coordinators in `OpAdmin_Dashboard` also be granted access to view their team members' employee dashboards in the future?
3. **URL Routing Preference**:
   - *Assumption*: We plan to support both seamless in-tab SPA navigation (preserving the Manager dashboard sidebar and header) with URL search param synchronization (`/SystemAdmin_Dashboard?tab=org-structure&employeeId=<id>`) and a direct route (`/employee-dashboard/:employeeId`).
   - *Question for User*: Do you prefer keeping the Manager shell (sidebar & header) visible during dashboard viewing, or should it be a completely standalone page route?
4. **Completion Trend Timeframe**:
   - *Assumption*: Completion trend over time will aggregate completed tasks by week over the last 8 weeks (or by month over the last 6 months).
   - *Question for User*: Do you prefer a weekly (last 8 weeks) or monthly (last 6 months) grouping for the completion trend chart?
