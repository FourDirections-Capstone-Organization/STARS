# Defects Plan: KPI Configuration and Performance Reviews

Target Feature Branch: fix/kpi-and-performance-review-defects

## Findings so far
- Files: SystemAdmin_Dashboard.tsx, PerformanceReviewTab.tsx, CriterionComparisonChart.tsx.
- Defect #49: SystemAdmin_Dashboard renders ReportsTab without onNavigateToTab, leaving handleConfigClick a no-op.
- 51a: Evaluation template UI exists at EvaluationTemplateTab.tsx but lacks a link from Performance Reviews.
- 51b/c: Backend supports ReviewScope.Team; modal needs Team option and employee dropdown replacing GUID input.
- 51d meaning: Compares self vs supervisor ratings per criterion to reveal perception gaps (|gap| >= 2.0 outlier).
- 51d chart empty: Unrated criteria have 0.0 scores, which correctly map to 0-49% Unsatisfactory rating band.

## Decisions confirmed
- Confirmed Self vs Manager subtitle explaining alignment and outlier threshold (|gap| >= 2.0).
- Confirmed template discoverability via "Manage Templates" button navigating to evaluation_templates tab.
- Confirmed team scope blocks creation with validation warning if selected team has 0 members.
- Confirmed employee dropdown in Individual scope filters by selected department/team with Name (Role).
- Confirmed target feature branch fix/kpi-and-performance-review-defects and plan archiving to docs/archive/plans/.

## Implementation Steps
- [x] Step 1: Reproduce "Configure KPI" button no-op in SystemAdmin_Dashboard and confirm missing navigation prop (Defect #49)
  - Verify: Test verifies clicking Configure KPIs fails to trigger tab change when onNavigateToTab is omitted
- [x] Step 2: Pass onNavigateToTab to ReportsTab in SystemAdmin_Dashboard and add passing regression test (Defect #49)
  - Verify: Regression test confirms clicking Configure KPIs switches activeTab to kpi_configuration
- [x] Step 3: Add "Manage Templates" navigation action to Performance Reviews header to make template UI discoverable (Defect #51a)
  - Verify: Manage Templates button renders in Performance Reviews and navigates to evaluation_templates tab
- [x] Step 4: Add Team scope option and team dropdown selector to Create Performance Review Cycle modal (Defect #51b)
  - Verify: Scope dropdown includes Team option, reveals team selector, and submits valid team review payload
- [x] Step 5: Replace Employee GUID text input with permission-scoped employee dropdown in review creation modal (Defect #51c)
  - Verify: Individual scope renders employee dropdown showing accessible staff with name and role instead of GUID text field
- [x] Step 6: Add in-UI explanatory subtitle and tooltip to Self vs. Manager criterion comparison chart (Defect #51d)
  - Verify: Criterion comparison chart renders alignment explanation and outlier guidance in UI subtitle and tooltip
- [ ] Step 7: Run full backend and frontend test suites and archive plan to docs/archive/plans/ (Defect #49 & #51)
  - Verify: dotnet test and npm test both pass with 0 failures; PLAN.md is archived to docs/archive/plans/
