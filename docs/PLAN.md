# Fix KPI Endpoints 500 Errors Plan

Target Feature Branch: fix/kpi-deployed-500-errors

## Findings so far
- backend/Program.cs: raw DDL creates KpiConfigurations without overall threshold columns and omits migration history entries.
- backend/Migrations/20261029111153_AddOverallThresholdsToKpiConfiguration.cs: migration adding OverallGreen, Amber, and Red thresholds.
- backend/Data/KpiDefaultSeeder.cs: default seed fails inserting into KpiConfigurations when threshold columns are missing.
- backend/Controllers/KpiController.cs: scope and configurations endpoints catch EF Core exceptions and return generic 500 errors.
- backend/Modules/Analytics/KpiCalculationEngine.cs: resolves configuration from KpiConfigurations table during hierarchical scope evaluation.

## Decisions to confirm
- Confirm whether to update deployed Azure database schema automatically via Program.cs startup DDL or manual SQL script.
- Confirm whether to enhance 500 error handling in KpiController to log detailed exception messages and return them in development.

## Implementation Steps
- [x] Step 1: Reproduce locally and trace failure points for both endpoints against local and deployed environments
  - Findings: GET /api/kpi/configurations fails at KpiController.cs line 668 (_db.KpiConfigurations.ToListAsync) when EF Core selects OverallGreen/Amber/RedThreshold.
  - Findings: GET /api/kpi/scope fails at KpiCalculationEngine.cs line 850 (ResolveConfigurationForScopeAsync) querying KpiConfigurations for scope evaluation.
  - Findings: Startup DDL in Program.cs created KpiConfigurations without threshold columns and omitted __EFMigrationsHistory entries, causing MigrateAsync to fail on table conflict and skipping KpiDefaultSeeder.
- [x] Step 2: Confirm both endpoints share the root cause of missing threshold columns and unapplied migrations
  - Findings: Startup DDL in Program.cs created KpiConfigurations without OverallGreenThreshold, OverallAmberThreshold, and OverallRedThreshold, and omitted 20261029101146_AddKpiConfigurationAndItems from __EFMigrationsHistory.
  - Findings: On startup, MigrateAsync attempts 20261029101146_AddKpiConfigurationAndItems, fails with PostgreSQL 42P07 (relation exists), and aborts before 20261029111153_AddOverallThresholdsToKpiConfiguration runs.
  - Findings: KpiDefaultSeeder crashes when inserting default config with missing threshold columns (PostgreSQL 42703), leaving the table unseeded.
  - Findings: Both GET /api/kpi/configurations (KpiController:668) and GET /api/kpi/scope (KpiCalculationEngine:850) query EF Core KpiConfigurations, failing on missing threshold columns and triggering 500 responses.
  - Verify: Inspection confirms both endpoints fail at EF Core queries to KpiConfigurations due to missing threshold columns
- [ ] Step 3: Fix startup DDL, record migrations in history, ensure seed execution, and add regression tests
  - Verify: Regression test fails without threshold columns and passes once DDL and seeder execute cleanly
- [ ] Step 4: Run full backend and frontend test suites
  - Verify: dotnet test passes all backend tests and npm test passes all frontend tests
