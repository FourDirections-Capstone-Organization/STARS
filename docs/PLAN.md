# Phase 1: Core Metric Calculation Engine & Database Foundation

## Findings so far
- ReportService and KPITrackingTests implement baseline SLA deadline comparisons.
- TaskWorkflowService clears PushBackComment on approval; rework events reside in AuditLogs.
- Task and TaskAttachment models lack an explicit document requirement checklist.
- AppDbContext currently lacks KpiConfiguration and KpiItem tables and AuditLog indexing.
- ReportController exposes legacy unweighted KPI reports.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, audit log rework transitions, and test baselines
  - Verify: Audit log entries, task completion fields, and existing 579 backend tests confirmed
  - Baseline findings:
    - Tests: 579 backend unit/integration tests and 125 frontend tests pass with zero failures.
    - Push-backs: Logged as StatusChange (OldValue="DonePendingReview", NewValue="InProgress") on Task entity; PushBackComment is cleared upon approval.
    - Deadlines & Completion: Measured by Status == Completed, effective completion time (UpdatedAt ?? CreatedAt), and effective deadline (RevisedDeadline ?? Deadline).
    - Attachments: TaskAttachment exists per task without a checklist schema (In-Full evaluated by presence of >= 1 attachment).
    - Indexing gap: AppDbContext indexes AuditLog only on Timestamp and UserId; composite index needed in Step 2.
- [x] Step 2: Create KpiConfiguration and KpiItem entities, seed defaults, and apply migration
  - Verify: Database migration applies cleanly with tables and indexes created in AppDbContext
- [ ] Step 3: Implement KpiCalculationEngine calculating the 4 default metrics for an employee
  - Verify: OTIF, Order Accuracy, Task Completion, and AHT calculations return correct numbers
- [ ] Step 4: Create Manager KPI controller endpoint with timeframe and employee parameters
  - Verify: Endpoint returns 200 OK with default KPI metric results for authorized Managers
- [ ] Step 5: Add comprehensive backend unit and integration tests for engine and controller
  - Verify: Backend test suite validates calculations, edge cases, zero tasks, and role checks
- [ ] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
