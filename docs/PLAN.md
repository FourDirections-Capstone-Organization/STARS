# Phase 3: Safe Custom Formula Builder & Variable Data Mapping

## Findings so far
- backend/Models/KpiItem.cs and DTOs contain IsCustomFormula and CustomFormula fields.
- backend/Modules/Analytics/KpiCalculationEngine.cs only evaluates hardcoded standard metric codes.
- backend/Modules/Analytics/SafeFormulaParser.cs and KpiVariableRegistry.cs need to be implemented.
- backend/Controllers/KpiController.cs lacks formula dry-run testing and variable catalog endpoints.
- frontend/src/Pages/OpAdmin_Dashboard/KpiConfiguration/ lacks custom formula builder and tester UI.
- Baseline verification confirmed: 657 backend tests and 134 frontend tests passing with zero failures.
- Baseline models and DTOs confirmed ready for formula parser integration.

## Implementation Steps
- [x] Step 1: Confirm starting codebase state, formula fields, and test baselines
  - Verify: 657 backend tests and 134 frontend tests pass and baseline models confirmed
- [ ] Step 2: Implement safe tokenized arithmetic formula parser with division-by-zero safety
  - Verify: Parser unit tests verify operators (+, -, *, /), parentheses, whitelisted tokens, and zero-division
- [ ] Step 3: Add formula variable registry, DTO validation, and formula test endpoint
  - Verify: Unit and controller tests confirm variable resolution and dry-run formula testing endpoint
- [ ] Step 4: Integrate custom formula evaluation into KpiCalculationEngine metric loop
  - Verify: Engine tests confirm custom formula metrics calculate correctly from employee task datasets
- [ ] Step 5: Build Manager formula builder UI with variable chips and dry-run testing
  - Verify: Editor component validates formula syntax, inserts variables, and displays test results
- [ ] Step 6: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
