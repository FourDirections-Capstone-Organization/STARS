# Antigravity Workspace Guidelines

This repository uses Antigravity agent customizations:
- **Project Rules**: Located at [.agents/rules/project-rules.md](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/.agents/rules/project-rules.md).
- **Step Implementation Skill**: Located at [.agents/skills/implement-step/SKILL.md](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/.agents/skills/implement-step/SKILL.md).
- **Master Implementation Plan**: Located at [docs/PLAN.md](file:///e:/Capstone%20Project/CAPSTONE-2/STARS/docs/PLAN.md).

## Critical Guidelines
1. **Never push directly to `refactoring/bug-fix`** (production deployment branch).
2. **One branch per step**: Branch from the active feature branch using `step-N-<short-name>`.
3. **Pre-commit testing**: Run relevant backend (`dotnet test`) or frontend (`npm test`) tests before creating any commit.
4. **Follow 3-failure escalation**: If tests fail after 3 consecutive attempts, pause and consult the user.
