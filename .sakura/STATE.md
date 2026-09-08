# State

- Current milestone: v0.1 trusted real-work loop — open
- Current item: TRUST-02
- Exact next action: Implement shared explicit lineage and bounded recovery settlement; integrate the isolated atomic projection store, then validate migration/replay.
- Blockers: None for implementation. Real harness and browser acceptance remain unverified.
- Integration owner: main conversation; supporting branches may commit within assigned scope, never merge themselves.
- Contexts: `01a080a0-2c28-7d00-a530-ea967bafab49` — CLOSED after return and successful native cleanup. Result: lineage must resolve before projection, old derived rows must be atomically replaced, and late evidence cannot be incrementally added atop old rewards. TRUST-02 will implement one bounded settlement per lineage; explicit recovery may update that settlement, never append a second completion reward. No edits from this support context.
- `01a080a7-85d8-7b50-983b-ae05943116a1` — CLOSED after independent TRUST-01 review, native cleanup succeeded. Findings preserved as TRUST-F02 and targeted regressions.
- `01a080a8-8964-7691-acfd-09612c43e170` — RUNNING, TRUST-02 atomic projection store in isolated `codex/projection-repair` worktree. Exclusive schema/new store/new tests; parent integrates and commits.
