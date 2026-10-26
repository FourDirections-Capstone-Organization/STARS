---
name: implement-step
description: Implements exactly one step from docs/PLAN.md, runs the appropriate tests, commits to a step branch, and merges into the active feature branch. Use when asked to do the next plan step.
---

# Implement Plan Step

This skill executes a single, disciplined step from [docs/PLAN.md](docs/PLAN.md) following the STARS project engineering guidelines.

> [!WARNING]
> **NEVER push directly to `refactoring/bug-fix`.**
> `refactoring/bug-fix` is the automated deployment branch connected to Azure Web App production (`.github/workflows/refactoring-bug-fix_stars.yml`). Individual steps must be committed to step branches and merged into the active feature branch only.

---

## Workflow Procedure

### Step 1: Find the Next Unchecked Step
1. Read docs/PLAN.md fully, including every context section above the steps (for example Goal, Out of scope, Findings, Root causes, Design notes, Decisions to confirm) and any notes under completed steps. If the current step links to a report in docs/, read the relevant section.
2. Identify the active feature branch name specified at the top of `docs/PLAN.md` (or identify the current feature branch from `git status`).
3. Locate the very first unchecked step item:
   ```markdown
   - [ ] Step N: <Step title and description>
   ```
4. If no unchecked steps remain, stop and notify the user that all plan steps are completed.

### Step 2: Create or Switch to the Step Branch
- **If a step makes no code changes (investigation or test-only)**:
  Skip creating a branch and merging; just update the plan, report the results, and stop.
  - For investigation steps, put findings directly in `docs/PLAN.md` in at most 8 lines. Only write a separate report file if the user explicitly asks for one.
- **If a step involves code changes**:
  1. Ensure the parent feature branch is clean and active.
  2. Create and checkout a dedicated step branch:
     ```powershell
     git checkout -b step-N-<short-name>
     ```
     *(Example: `git checkout -b step-1-task-stepper-validation`)*

### Step 3: Implement Strictly That Step
1. Make only the changes required for **Step N**.
2. **Do not touch or modify later steps.** Keep changes atomic and isolated.
3. Adhere to the coding standards documented in [.agents/rules/project-rules.md](.agents/rules/project-rules.md).

### Step 4: Run Context-Aware Tests
Execute the test suites corresponding to the files modified:

- **Backend changes** (`backend/**`):
  ```powershell
  dotnet test backend/Tests/Backend.Tests.csproj --configuration Release
  ```
- **Frontend changes** (`frontend/**`):
  ```powershell
  npm --prefix frontend test
  ```
- **Both backend and frontend modified**: Run both test commands.

#### Failure Escalation Policy
- If tests fail, diagnose the failure, inspect error logs, and attempt a fix.
- Re-run the tests.
- **Maximum 2 attempts:** If tests still fail after 2 consecutive fix attempts, **STOP**.
- Preserve the current working tree and ask the user for assistance, describing:
  1. What step was being implemented.
  2. The exact error or failing test assertion.
  3. The fixes attempted so far.

### Step 5: Update `docs/PLAN.md`, Commit, and Merge
1. **Update `docs/PLAN.md` first**: Check off the completed step before committing so it is part of the step commit and the working tree stays clean:
   ```markdown
   - [x] Step N: <Step title and description>
   ```
2. Stage modified files and commit with a clear, conventional commit message:
   ```powershell
   git add <files> docs/PLAN.md
   git commit -m "feat(scope): [Step N] <short descriptive message>"
   ```
3. Switch back to the parent feature branch:
   ```powershell
   git checkout <parent-feature-branch>
   ```
4. Merge the step branch into the feature branch:
   ```powershell
   git merge --no-ff step-N-<short-name> -m "Merge branch 'step-N-<short-name>' into <parent-feature-branch>"
   ```
5. Push the feature branch:
   ```powershell
   git push origin <parent-feature-branch>
   ```
   > [!WARNING]
   > Never push `refactoring/bug-fix`. Push only the active feature branch.
6. (Optional) Delete the local step branch:
   ```powershell
   git branch -d step-N-<short-name>
   ```

### Step 6: Report Progress and Wait for Review
1. Provide a concise summary of changes made, tests passed, and current plan status.
2. Check if all steps in `docs/PLAN.md` are now checked off (`- [x]`):
   - **If all steps are now complete (Milestone Reached)**:
     - Run the full verification suite (`dotnet test` and `npm test`).
     - Alert the user that all plan steps are complete.
     - Ask the user if they would like to open a Pull Request or merge the completed feature branch into `refactoring/bug-fix` for production deployment.
3. **STOP and wait for user review.** Do not start the next step.
