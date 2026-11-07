# Fix: Task Priority Inconsistency on Assignment & Response Mapping – Plan

**Feature branch:** `fix/task-priority-assignment-sync` | **Step branches:** `step-N-<short-name>`
Never push directly to `refactoring/bug-fix`. Commit each step on a step branch and merge to feature branch.

## Goal
Eliminate priority mutation/defaulting to Medium across task lifecycle: ensure explicit priorities (Low, Medium, High, Urgent) remain consistent from creation, assignment, reassignment, editing, to operational employee views (lists, cards, details, and filters), with Medium applied as default only when priority is truly omitted.

## Out of scope
Adding new priority levels not in the system, altering SLA hours/logic for non-urgent tasks, modifying database schema/migrations, or changing unrelated operational workflows.

## Root Cause Investigation Findings

1. **Exact Point Where Low Becomes Medium**:
   - **Backend Serializer**: In `Program.cs`, ASP.NET Core registers `JsonStringEnumConverter()`. As a result, C# `PriorityLevel` (enum `Low = 0, Medium = 1, High = 2, Urgent = 3`) is serialized to JSON as a string (e.g. `"priorityLevel": "Low"`), NOT a number. Furthermore, `TaskResponseDTO` and `TeamTaskDTO` only expose `PriorityLevel` (`"priorityLevel"` in JSON), not a separate `priority` property.
   - **Operational Employee Dashboard Mapping (`OpEmployee_Dashboard.tsx:190-192`)**:
     ```typescript
     const priorityStr = typeof dto.priorityLevel === 'number'
         ? (PRIORITY_LABELS[dto.priorityLevel] ?? 'Medium')
         : (dto.priority || 'Medium');
     ```
     Because `dto.priorityLevel` is `"Low"` (string), `typeof dto.priorityLevel === 'number'` evaluates to `false`. The code then evaluates `dto.priority || 'Medium'`. Since `dto.priority` does not exist on the backend DTO (`undefined`), it falls back to `'Medium'`. Then `priorityMap['Medium'] ?? 'medium'` assigns `'medium'`. Thus, Low (as well as High and Urgent) becomes Medium every time on the employee side.
   - **Coordinator Side (`OpAdmin_Dashboard.tsx:9895-9897, 10267, 10302`)**:
     The exact same broken pattern exists:
     `typeof t.priorityLevel === 'number' ? (PRIORITY_LABELS[t.priorityLevel] || 'Medium') : (t.priority || 'Medium')`.
     Coordinator views saw Low only because at creation time `createdTaskSuccess` mapped from local form submission state (`data.priorityLevel` as numeric 0). Once fetched from `/api/Task`, any task with string `"Low"` fell back to `'Medium'`.
   - **Secondary Mutation during Edit/Reassignment**:
     When a coordinator clicked "Edit" to assign or reassign a task, `TaskModal` loaded `initial.priority` from the pre-fetched task list (which had already defaulted to `'Medium'`). When saving, `prioMap['Medium']` (1) was sent in `UpdateTaskDTO`, causing `TaskService.UpdateAsync` to overwrite the database record from Low to Medium!

2. **Suspects Evaluation**:
   - *Assignment creates a new task copy without priority?* **False**. Tasks and assignments are separate tables (`Tasks` and `TaskAssignments`). Assignment adds rows to `TaskAssignments` (`TaskId`, `AssignedUserId`); it does not duplicate the task.
   - *Database/model defaults priority to Medium?* **False**. In PostgreSQL, `Tasks.PriorityLevel` is an `integer` column without a default constraint. In C#, `enum PriorityLevel` defaults to `0` (`Low`).
   - *Query/Serializer/DTO omits priority, or frontend falls back when undefined?* **True**. DTO serializes string enum `"priorityLevel"`; frontend only checked `typeof === 'number'`, looked for non-existent `dto.priority`, and defaulted to `'Medium'`.
   - *Mismatch in priority values/casing?* **True**. The backend returns PascalCase strings (`"Low"`, `"Medium"`, `"High"`, `"Urgent"`), whereas frontend UI components expect either PascalCase or lowercase (`'low'`, `'medium'`, `'high'`, `'urgent'`).
   - *Create form not sending priority?* **Partial**. The create form sends numeric `priorityLevel: 0`, which correctly reaches the database as `PriorityLevel.Low`. However, if `CreateTaskDTO.PriorityLevel` is missing, C# defaults non-nullable enum to 0 (`Low`) rather than `Medium`.

3. **Database Records State & Recoverability**:
   - Tasks created with Low that were assigned at creation (or whose priority was never edited via the dashboard modal) have `PriorityLevel = 0` (Low) intact in PostgreSQL. They were solely displayed incorrectly.
   - Tasks where a coordinator reopened the Edit modal to assign an employee and clicked Save were inadvertently updated in the database to `PriorityLevel = 1` (Medium).
   - In `TaskService.cs:522-538`, every update generates an `AuditLog` entry storing `oldValue` and `newValue` JSON containing the original `Priority` (e.g. `{"Priority":"Low"}`). Thus, historical mutations are fully auditable and recoverable from `AuditLogs`. No manual data modifications will be made without explicit user approval.

## Steps

- [ ] Step 1: Investigation Documentation & Test Fixtures Setup
  - Files: docs/PLAN.md, backend/Tests/TaskManagement/TaskPrioritySyncTests.cs, frontend/src/test/TaskPrioritySync.test.tsx
  - Description: Document root cause findings in docs/PLAN.md and add regression test suites reproducing priority loss on creation, assignment, update, and employee view mapping.

- [ ] Step 2: Backend Priority Binding, DTO Harmonization, and Strict Null Defaults
  - Files: backend/Models/DTOs/CreateTaskDTO.cs, backend/Models/DTOs/UpdateTaskDTO.cs, backend/Models/DTOs/TaskResponseDTO.cs, backend/Models/DTOs/TeamTaskDTO.cs, backend/Modules/TaskManagement/TaskService.cs
  - Description: Make `CreateTaskDTO.PriorityLevel` nullable (`PriorityLevel?`) with fallback to `PriorityLevel.Medium` ONLY when null. Add `Priority` string property alias to `TaskResponseDTO` and `TeamTaskDTO` (`Priority => PriorityLevel.ToString()`). Support both `PriorityLevel` and `Priority` aliases in create/update payloads.

- [ ] Step 3: Frontend Priority Normalizer & OpEmployee_Dashboard Fix
  - Files: frontend/src/Pages/OpEmployee_Dashboard/OpEmployee_Dashboard.tsx, frontend/src/Pages/OpEmployee_Dashboard/OpEmployee_Dashboard.css
  - Description: Add robust priority normalization helper handling PascalCase strings ("Low", "Medium", "High", "Urgent"), lowercase strings, and enum numbers. Update `dtoToTask` to accurately map `dto.priorityLevel` and `dto.priority`. Expand `Priority` union to include `'urgent'`, update `priorityMeta`, add Urgent filter option, and ensure filters/sorting respect actual priority.

- [ ] Step 4: Coordinator & Admin Dashboards Priority Normalization (`OpAdmin` & `SystemAdmin`)
  - Files: frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx, frontend/src/Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard.tsx
  - Description: Replace fragile `typeof priorityLevel === 'number'` checks in `fetchTasks`, `fetchAwaitingReview`, `mapTaskDetailToTaskView`, `fetchDuplicateDetails`, and SystemAdmin list views with the robust priority normalizer. Prevent edit modals from loading false 'Medium' defaults on existing tasks.

- [ ] Step 5: Regression & Verification Testing
  - Files: backend/Tests/TaskManagement/TaskPrioritySyncTests.cs, frontend/src/test/TaskPrioritySync.test.tsx
  - Description: Run full backend and frontend test suites (`dotnet test` and `npm test`). Verify that tasks with Low, Medium, High, and Urgent maintain their set priority across create, assign, reassign, edit, lists, filters, and detail views.

## Open questions / assumptions
- Existing Database Records: We assume existing tasks in the database should NOT be automatically bulk-updated now. We will present the audit query to the user and request explicit confirmation before running any data remediation script.
- Urgent Casing in Employee Dashboard: Operational employee dashboard previously collapsed 'Urgent' into 'high'; we assume 'urgent' should be displayed and filtered as its own distinct priority level alongside High, Medium, and Low, matching coordinator views and backend definitions.
