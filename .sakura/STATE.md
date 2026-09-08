# State

- Current milestone: v0.1 trusted real-work loop — open
- Current item: EXPERIENCE-01
- Exact next action: Add deterministic display-only difficulty and scoped local artifact viewing, then implement the read-only JSONL collector entry and real task acceptance.
- Blockers: None for implementation. Real harness and browser acceptance remain unverified.
- Integration owner: main conversation; supporting branches may commit within assigned scope, never merge themselves.
- Contexts: `01a080a0-2c28-7d00-a530-ea967bafab49` — CLOSED after return and successful native cleanup. Result: lineage must resolve before projection, old derived rows must be atomically replaced, and late evidence cannot be incrementally added atop old rewards. TRUST-02 will implement one bounded settlement per lineage; explicit recovery may update that settlement, never append a second completion reward. No edits from this support context.
- `01a080a7-85d8-7b50-983b-ae05943116a1` — CLOSED after independent TRUST-01 review, native cleanup succeeded. Findings preserved as TRUST-F02 and targeted regressions.
- `01a080a8-8964-7691-acfd-09612c43e170` — CLOSED after return and successful native cleanup. Atomic projection store/schema4/seven tests preserved in isolated `codex/projection-repair` worktree and integrated with apply_patch. Original store SHA256 `a1a66f063f0f0c256633f124030951a1893751c821f5934abca8095d1eade728`; parent owns runtime integration and current verification.
- `01a080b1-7569-7771-9d29-a369bd138c7d` — CLOSED after return and successful native cleanup. Review findings: unknown resume ancestors could reward; public incremental engines lost lineage history; conflicting direct edges could converge and be accepted. All three now have regression tests. Late preterminal evidence is handled as a deterministic correction of the same bounded settlement, not a new completion; arrival-order independence takes priority over freezing incomplete first-arrival evidence.
- `01a080d1-a2a8-74e1-a554-97d3100d4969` — CLOSED after return and successful native cleanup. 63 scoped checks passed; two reproduced findings retained as TRUST-F04/LIVE-F02. Parent repaired semantic snapshot replacement/retraction (unsafe late scalar inputs now reject before mutation) and separated factual artifact visibility from settled loot. Three added regressions and full 97-test suite pass. No child edits.
