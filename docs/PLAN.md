# Plan: UI-Only Polish — Palette, Sidebar, Status Casing, Tables, and Buttons

**Feature branch:** `feature/ui-polish-tokens-styling` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Findings so far
- Design tokens & variables live in `frontend/src/global.css`, with `--sidebar-bg` overridden in `OpAdmin_Dashboard.css` and `OpEmployee_Dashboard.css`.
- Sidebar styles reside in `components/Sidebar/Sidebar.css`, using `--sidebar-bg` (#0B1437) with readable high-contrast text and active states.
- Statuses are rendered in `StatusBadge.tsx`, `TaskView.tsx`, `TaskManager.tsx`, `OpAdmin_Dashboard.tsx`, `OpEmployee_Dashboard.tsx`, and `EmployeeTaskLists.tsx`.
- Tables are styled in `DataTable.css`, `OpAdmin_Dashboard.css`, `PerformanceEvaluation.css`, and various page CSS files, with isolated inline th styles.
- Form and modal buttons use `components/FormModal/FormModal.css`, `ConfirmationModal.css`, `ConfirmModal.css`, `TaskView.css`, and global `.btn` classes.

## Steps

- [x] Step 1: Update global palette, button radius, table header tokens, and remove sidebar bg overrides
  - Files: `frontend/src/global.css`, `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.css`, `frontend/src/Pages/OpEmployee_Dashboard/OpEmployee_Dashboard.css`
  - Verify: Build frontend with `npm run build` and inspect CSS variables in root.

- [x] Step 2: Create centralized status label mapping and update StatusBadge
  - Files: `frontend/src/utils/statusUtils.ts`, `frontend/src/components/ui/StatusBadge.tsx`
  - Verify: Unit test verifying Title Case display outputs ("To Do", "In Progress", "On Hold", "Pending Review", "Completed") for all raw inputs.

- [x] Step 3: Define shared table header style and standardize form/modal button radius
  - Files: `frontend/src/global.css`, `frontend/src/components/ui/DataTable.css`, `frontend/src/components/FormModal/FormModal.css`, `frontend/src/components/ConfirmationModal/ConfirmationModal.css`, `frontend/src/components/ConfirmModal/ConfirmModal.css`, `frontend/src/components/TaskView/TaskView.css`
  - Verify: Visual and DOM inspection verifying uppercase 0.75rem #64748B headers and 8px border-radius on modal buttons.

- [ ] Step 4: Replace hard-coded old teal instances with tokens across components and stylesheets
  - Files: `frontend/src/components/Sidebar/Sidebar.css`, `frontend/src/components/GlobalHeader/GlobalHeader.css`, `frontend/src/components/TaskView/TaskView.css`, `frontend/src/components/TaskComments/TaskComments.css`, `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeCharts.tsx`, `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeCharts.css`, `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.css`, `frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx`
  - Verify: Run `git grep -i "008b8b" frontend/src/` to confirm zero hard-coded old teal references.

- [ ] Step 5: Apply Title Case status mapping to tables, badges, dropdowns, filters, modals, and empty states
  - Files: `frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx`, `frontend/src/Pages/OpEmployee_Dashboard/OpEmployee_Dashboard.tsx`, `frontend/src/components/TaskManager/TaskManager.tsx`, `frontend/src/components/TaskView/TaskView.tsx`, `frontend/src/Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeTaskLists.tsx`, `frontend/src/Pages/EmergingTechAI/AIAssignmentView.tsx`
  - Verify: Manual and test verification that all task statuses display in Title Case while underlying values and API calls remain untouched.

- [ ] Step 6: Grep audit for UI integrity
  - Files: `frontend/src/**`
  - Verify: Run grep checks ensuring zero old teal values (`#008b8b`), zero conflicting inline th styles (`style={{ ...color... }}`), and zero raw status display strings.

- [ ] Step 7: Run full verification test suites and visual inspection pass
  - Files: `frontend/src/**`, `backend/**`
  - Verify: Run `npm --prefix frontend test` and `dotnet test backend/Tests/Backend.Tests.csproj --configuration Release`, followed by visual review of main views.

## Open questions / assumptions
- Status storage vs display: Task statuses are stored in diverse formats (ints 0-5, 'NotStarted', 'in-progress', 'DonePendingReview'); assumption is all map to display Title Case without altering payload values.
- Empty states & filters: Assumption is only user-facing status labels change (e.g. dropdown options and empty text); query parameters and filter keys remain unchanged.
- Hardcoded teal in SVGs/charts: Recharts and SVG icons with #008B8B will be migrated to `var(--teal)` or #00A99D without altering chart datasets.
- Accessibility contrast: #00A99D on white yields ~2.94:1 contrast (below WCAG AA 4.5:1 for body text); assumption is this is acceptable for brand accents, large buttons, and badges, while table headers (#64748B on white, 4.58:1) pass WCAG AA.
