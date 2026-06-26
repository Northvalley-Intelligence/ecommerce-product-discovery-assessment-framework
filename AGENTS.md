# Agent Instructions

## Mission-Driven Engineering

At session start, read:

1. `MISSION.md`
2. `MISSION_UPDATES.md`
3. `.mde/state.json`
4. `.mde/validation-strategy.json`
5. `.mde/failing-bdds.json`
6. Latest `.mde/validation-runs/` records
7. Latest `.mde/generations/` records
8. `.mde/generation-summary.md`
9. `.mde/findings.json`
10. `.mde/validator-effectiveness.json`
11. `deploy/release-checks.json` when deployment is involved

This project uses Mission-Driven Engineering. Keep human, agent, and deploy artifacts separate. Before implementation, confirm the current phase goal, use the project-specific validation strategy, refresh Functional Validation scenarios from the mission, classify findings as Critical/High/Medium/Low, and update MDE artifacts before ending a meaningful session.

Phase exit requires two independent Validation Gate passes with no implementation changes between clean passes.
