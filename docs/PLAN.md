# Phase 2: Configuration & Weighting System with Traffic-Light Thresholds

## Findings so far
- backend/Models/KpiConfiguration.cs and KpiItem.cs define configuration schemas.
- backend/Modules/Analytics/KpiCalculationEngine.cs calculates weighted scores and ratings.
- backend/Controllers/KpiController.cs exposes evaluation but lacks configuration CRUD.
- backend/Models/DTOs/EmployeeKpiEvaluationDTOs.cs lacks configuration request DTOs.
- frontend/src/Pages/OpAdmin_Dashboard/OpAdmin_Dashboard.tsx lacks KPI configuration controls.
- Baseline verification confirmed: 617 backend tests and 125 frontend tests passing.
- Baseline entities confirmed ready for Phase 2 threshold additions.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, Phase 1 KPI models and test baselines
  - Verify: 617 backend tests and 125 frontend tests pass and baseline entities confirmed
- [ ] Step 2: Add customizable overall thresholds to KpiConfiguration and apply migration
  - Verify: Migration adds overall threshold fields and database migration applies cleanly
- [ ] Step 3: Implement configuration DTOs and validation for prospective weights and thresholds
  - Verify: Unit tests confirm 100% weight sum, threshold validation, and prospective dates
- [ ] Step 4: Implement Manager CRUD endpoints in KpiController and update rating engine
  - Verify: Controller persists prospective configs and engine uses custom overall thresholds
- [ ] Step 5: Build Manager KPI configuration UI with weight and threshold controls
  - Verify: UI component validates 100% weight sum and submits prospective configurations
- [ ] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
