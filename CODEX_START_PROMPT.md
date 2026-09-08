# Codex Start Prompt

Copy the text below into Codex after opening this repository.

---

You are implementing AI Quest World v0.1.

First read `AGENTS.md` and every document it marks as required. Treat those repository documents as the current product and engineering specification.

Do not start by building the pixel UI.

1. Inspect the repository and report existing structure/stack.
2. Identify any conflicts between the current repository and the v0.1 specification.
3. Produce a concise implementation plan that follows `docs/IMPLEMENTATION_PLAN.md` without expanding scope.
4. Then implement `docs/PHASE_1_TASK.md` only.
5. Run the required tests/typecheck/lint and fix failures before claiming Phase 1 complete.
6. Do not implement future systems merely because extension points are mentioned.

Hard requirements:

- v0.1 is local-first and read-only.
- no additional AI API is required.
- Game Core must remain harness-agnostic and UI-agnostic.
- UARP contains factual runtime data only.
- Token/tool/file-read volume must never directly become XP.
- Run is not Quest.
- default collection is metadata-first and content-optional.
- no hidden chain-of-thought dependency.
- no free movement, Gold, shop, NPC AI, multiplayer, cloud account, Surface SDK, or Game→Harness control in v0.1.

After Phase 1 is green, stop and summarize exactly what was implemented, tests run, remaining known issues, and the next milestone. Do not silently proceed into unrelated future work.
