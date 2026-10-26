# Employee Suitability Evaluation Improvement Plan

**Target Feature Branch**: `feature/groq-employee-suitability`  
**Production Deployment Branch**: `refactoring/bug-fix` (Only merge after all steps are completed and approved)

## Goal
Provide user-friendly AI rationales from Groq and unique global rankings (1..N) without duplicate ranks or vague templates.

## Out of scope
Redesigning the assignment UI layout, altering underlying metric collection queries, and changing task CRUD workflows.

## Findings so far
- "Heuristic evaluation..." originates in `SuitabilityService.cs:224` when `_groqService.IsConfigured` is false or `EvaluateSuitabilityAsync` throws.
- `GroqSettings.cs:40-54` only checks `ApiKey` and `GROQ_API_KEY` env var; it misses Azure's `Groq__ApiKey` and local `.env`.
- Multi-#1 badges occur in `AIAssignmentView.tsx:442-460` where company-wide evaluation merges separate per-department preview calls.
- `AIAssignmentView.tsx:2082` marks any employee with `ai.rank === 1` as `isBestPick`, displaying multiple `#1` and `Best` badges.
- `OpAdmin_Dashboard.tsx:1982` similarly flags `recInfo?.rank === 1` as recommended without global de-duplication.

## Design notes
- Groq returns employeeId, rank, score, factors (workload, experience, ratings), and a plain-language rationale.
- Groq response is validated against candidate IDs, clamped [0, 1], and normalized to strict sequential ranks 1..N.
- Fallback rationales use transparent, metric-grounded explanations; global ranking is recalculated across all shown candidates.
- Company-wide evaluation supports unified candidate querying or client-side global re-ranking by score with tie-breaking.
- API key resolves from Azure app settings (Groq__ApiKey / GroqSettings), process env, and local .env fallback.

## Decisions to confirm
- Tie-breaking order: higher score, then lower active workload, then higher experience, then average ratings.
- Rationale length: maximum 1-2 concise lines displayed under employee meta.
- Numeric score inclusion: omit numeric score from rationale text since score badge is already displayed.

## Implementation Steps
- [x] Step 1: Map current behavior tracing fallback rationale origin and multi-#1 cause across backend and frontend
  - Verify: Step trace proves SuitabilityService fallback string and AIAssignmentView per-dept rank merging
- [x] Step 2: Support Azure (Groq__ApiKey) and local (.env) key resolution with live Groq test
  - Verify: Tests confirm key resolution from Azure env, Groq__ApiKey, and local .env with verified connectivity
- [x] Step 3: Update Groq prompt and schema to output structured factors and plain-language fit justifications
  - Verify: Groq service tests validate structured JSON schema, metric grounding, and response parsing
- [x] Step 4: Implement fallback rationale generator using actual candidate metrics and enforce unique sequential ranks
  - Verify: Unit tests confirm descriptive fallback text and strictly sequential 1..N ranking without duplicates
- [ ] Step 5: Add company-wide preview support and global re-ranking in backend and frontend assignment views
  - Verify: Company-wide evaluation assigns single #1 rank and unique positions across all departments
- [ ] Step 6: Update frontend suitability display to render plain-language rationales and single best-pick badge
  - Verify: UI component tests confirm only top candidate receives BEST badge and rationales render clearly
- [ ] Step 7: Run full backend and frontend test suites
  - Verify: All dotnet test and npm test suites pass with zero failures
