LifeOS API Codex rules

Follow repository principles from parent AGENTS and enforce memory protocol below.

Memory protocol (mandatory each session):
1) Before coding, read `docs/CODEX_MEMORY.md` and the latest section in `docs/CODEX_HANDOFF_LOG.md`.
2) During work, keep changes aligned with architecture and open risks recorded in memory docs.
3) Before finishing, append a new dated entry to `docs/CODEX_HANDOFF_LOG.md` with:
- What changed
- Why
- Commands/tests run
- Known issues/risks
- Exact next steps
4) If behavior/contracts changed, update `docs/CODEX_MEMORY.md` in the same PR/commit.

Do not skip step 3, even for small changes.
