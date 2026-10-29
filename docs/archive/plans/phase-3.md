# Phase 3: Safe Custom Formula Builder & Variable Data Mapping

## Findings so far
- backend/Models/KpiItem.cs and DTOs contain IsCustomFormula and CustomFormula fields.
- backend/Modules/Analytics/KpiCalculationEngine.cs only evaluates hardcoded standard metric codes.
- backend/Modules/Analytics/SafeFormulaParser.cs and KpiVariableRegistry.cs need to be implemented.
- backend/Controllers/KpiController.cs lacks formula dry-run testing and variable catalog endpoints.
- frontend/src/Pages/OpAdmin_Dashboard/KpiConfiguration/ lacks custom formula builder and tester UI.
- Baseline verification confirmed: 657 backend tests and 134 frontend tests passing with zero failures.
- Baseline models and DTOs confirmed ready for formula parser integration.
- SafeFormulaParser implemented: tokenized recursive descent parser supporting (+, -, *, /, parentheses), whitelisted variables, zero dynamic code execution, and division-by-zero protection (returning safe default 0.0 or throwing when configured). Verified by 47 unit tests (704 backend tests passing).
- KpiVariableRegistry implemented with metadata, whitelist validation, default sample values, and task stats mapping. DTO validation added for custom formula syntax and whitelisted tokens. Dry-run formula test endpoint (api/kpi/formula/test) and variable catalog endpoint (api/kpi/formula/variables) implemented. Verified by 737 backend tests (33 new unit/controller tests) and 134 frontend tests.
- Custom formula evaluation integrated into KpiCalculationEngine metric loop via SafeFormulaParser and KpiVariableRegistry with zero-division and invalid syntax safeguards. Verified by 744 backend tests (7 new calculation and integration tests) and 134 frontend tests.
- Manager custom formula builder UI (FormulaBuilderModal), variable chips palette with category filters, operator toolbar, quick templates, dry-run test execution (api/kpi/formula/test), formula preview, and item validation integrated into KpiConfigurationEditor and KpiConfigurationTab. Verified by 140 frontend tests (6 new tests) and 744 backend tests.
- Full test verification completed: 744 backend tests and 140 frontend tests pass with zero failures.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, formula fields, and test baselines
  - Verify: 657 backend tests and 134 frontend tests pass and baseline models confirmed
- [x] Step 2: Implement safe tokenized arithmetic formula parser with division-by-zero safety
  - Verify: Parser unit tests verify operators (+, -, *, /), parentheses, whitelisted tokens, and zero-division
- [x] Step 3: Add formula variable registry, DTO validation, and formula test endpoint
  - Verify: Unit and controller tests confirm variable resolution and dry-run formula testing endpoint
- [x] Step 4: Integrate custom formula evaluation into KpiCalculationEngine metric loop
  - Verify: Engine tests confirm custom formula metrics calculate correctly from employee task datasets
- [x] Step 5: Build Manager formula builder UI with variable chips and dry-run testing
  - Verify: Editor component validates formula syntax, inserts variables, and displays test results
- [x] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
