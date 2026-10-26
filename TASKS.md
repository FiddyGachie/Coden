# TASKS.md — WARDEN Build Plan

Conventions: `P0` = demo spine, `P1` = high wow, `P2` = stretch. `Deps` lists prerequisite task IDs. Every task ends with its **Acceptance** criteria; a task is done only when they pass and the gate commands in `CLAUDE.md §9` are green. Tick boxes as you go. At each **PHASE GATE**, stop and print a status report (done / failing / deferred / decisions) before continuing.

## Verified POC milestones

- [x] **POC-1 Core-backed VS Code Mission Control** — the Vite dashboard is built into `apps/extension/media`, runs in a CSP-restricted VS Code webview, sends an explicit `postMessage` scan request to the extension host, and receives the result from the local Coden core's JSON-RPC handler. This milestone is deliberately separate from T0.5–T0.7: it does not yet meet their local-socket, full-schema-validation, Playwright, or `@vscode/test-electron` acceptance criteria.

This POC build horizon ends with Phase 3. Later roadmap phases are intentionally out of scope for this repository iteration.

---

## Phase 0 — Scaffolding & Contracts (P0)

- [x] **T0.1 Monorepo bootstrap** — pnpm workspaces, Turbo (optional), TS strict base config, ESLint, Prettier, Vitest, Husky/lint-staged (optional), CI workflow running gate commands. Packages and apps per `CLAUDE.md §5` with placeholder `index.ts`.
  *Acceptance:* `pnpm install && pnpm -r typecheck lint test` passes on an empty skeleton.
- [x] **T0.2 Shared contracts** — `packages/shared`: error codes (SPEC §1.3), Zod schemas for IPC envelope, rules (SPEC §5.3), policies, events, verdict, behavior report, claims, trust. Export inferred types. *Deps:* T0.1.
  *Acceptance:* schemas have unit tests for valid/invalid samples; no `any`.
- [ ] **T0.3 Database layer** — `better-sqlite3`, migration runner, initial migration for all tables in SPEC §2.1, typed repositories. *Deps:* T0.2.
  *Acceptance:* migration is idempotent; repository tests with in-memory DB; WAL enabled.
- [ ] **T0.4 Logging & redaction utilities** — `pino` setup with correlation IDs; shared secret redactor (AWS keys, GH/Slack tokens, Bearer, private keys, high-entropy env values) with tests. *Deps:* T0.2.
  *Acceptance:* redactor catches all seeded secret fixtures; no false redaction of normal identifiers in a sample set.
- [ ] **T0.5 JSON-RPC over local socket** — core server + client library (framing, timeouts, cancellation, notifications), Windows named pipe support, `ping`/`getStatus` methods. *Deps:* T0.2.
  *Acceptance:* integration test round-trips requests/notifications; malformed input yields `-32600/-32602`.
- [ ] **T0.6 Extension skeleton** — activation, core launcher (spawn, health-check, restart with backoff, lock file), status bar item, `Warden: Restart Core`, `Warden: Open Mission Control` (empty webview with CSP+nonce). *Deps:* T0.5.
  *Acceptance:* `@vscode/test-electron` smoke: extension activates, core starts, status bar shows connected.
- [ ] **T0.7 Dashboard skeleton** — Vite React app, Tailwind, Zustand store, `postMessage` bridge with Zod validation, panel shell with loading/empty/error/stale states, theme tokens (dark + light), reduced-motion support. *Deps:* T0.6.
  *Acceptance:* Playwright test renders each shell state with mock data.

**PHASE GATE 0:** skeleton builds, extension↔core round-trip works, CI green.

---

## Phase 1 — Analyzers & Demo Repo (P0)

- [ ] **T1.1 Demo repository** — `fixtures/demo-repo` "Acme Orders API" (Express+TS+Zod+SQLite repos), baseline tests, seeded docs (IDEA/SPEC/DESIGN/CLAUDE.md) with two contradictions + one stale reference, CI workflow with a missing secret, `shadow.yml`. Mark all fixture metadata `fixture: true`. *Deps:* T0.1.
  *Acceptance:* `pnpm test` inside the demo passes; docs contain the seeded issues documented in a `fixtures/demo-repo/SEEDED.md` (for tests only).
- [ ] **T1.2 AST index** — ts-morph project loader (multi-tsconfig), extract imports/exports/declarations/calls/decorators/routes, persisted cache by file hash, incremental update, Graph API (SPEC §4.1). *Deps:* T0.2, T1.1.
  *Acceptance:* correct graphs on the demo repo (snapshot tests); single-file re-index ≤ 150 ms; route extraction finds all Express routes.
- [ ] **T1.3 Diff model** — working-tree/staged/range diffs via `simple-git`; hunks → symbols touched. *Deps:* T1.2.
  *Acceptance:* diff fixtures map to correct symbols; handles renames, deletions, binary files.
- [ ] **T1.4 Hunk line tracker** — Myers-diff-based range remapping with fuzz tests. *Deps:* T0.2.
  *Acceptance:* property tests: unchanged lines keep identity; modified lines split correctly; no negative/overlapping ranges.
- [ ] **T1.5 File watcher & scheduler** — debounced (≥ 300 ms) change feed in the extension → core; core queues re-index and incremental checks with cancellation. *Deps:* T1.2, T0.6.
  *Acceptance:* editing a file triggers re-index within budget without blocking the host (measured).

**PHASE GATE 1:** analyzers produce verified graphs on the demo repo.

---

## Phase 2 — LLM Layer (P0)

- [ ] **T2.1 Provider interface + MockProvider + Anthropic provider + OpenAI-compatible provider** with schema-validated JSON output, retry-with-errors, cancellation. *Deps:* T0.2.
  *Acceptance:* tests for success, invalid JSON, schema failure then repair, second failure → `LLM_INVALID_OUTPUT`.
- [ ] **T2.2 Redaction + outbound log + cache** — wire T0.4 redactor into every call; log metadata (never content by default); 7-day cache; `neverSendGlobs`. *Deps:* T2.1, T0.4.
  *Acceptance:* test proves a seeded secret never appears in the provider's received payload; log entries visible via RPC.
- [ ] **T2.3 Prompt registry** — versioned prompt files + loader; prompts for assertion extraction, subject canonicalization, rule synthesis, task classification, semantic-rule judge. *Deps:* T2.1.
  *Acceptance:* each prompt has an input/output schema and a recorded mock fixture test.
- [ ] **T2.4 Offline mode** — global switch and `LLM_DISABLED` handling convention; deterministic paths unaffected. *Deps:* T2.1.
  *Acceptance:* a test run with offline mode executes all deterministic features successfully.

---

## Phase 3 — M1 Constitution Forge (P0)

- [ ] **T3.1 Doc ingestion** — Markdown AST sectioning with line ranges; hashing; support IDEA/SPEC/DESIGN/CLAUDE/AGENTS/README and Spec Kit constitution. *Deps:* T0.3.
  *Acceptance:* section/line ranges exact on fixtures; missing docs tolerated.
- [ ] **T3.2 Assertion extraction + quote verification** — LLM extraction, then deterministic check that each quote occurs verbatim in the cited lines; drop failures. *Deps:* T2.3, T3.1.
  *Acceptance:* test injects a hallucinated quote via MockProvider → it is dropped and counted.
- [ ] **T3.3 Conflict detector** — subject normalization (synonym table + LLM canonicalization), value/modality/scope conflicts, deterministic `stale_reference` check against the AST index. *Deps:* T3.2, T1.2.
  *Acceptance:* demo repo yields exactly the 2 seeded conflicts + 1 stale reference; zero conflicts on a clean docs fixture.
- [ ] **T3.4 Checker framework + ★ checkers** — interface, timeouts, param schemas, and implementations: `import-boundary`, `forbidden-call`, `forbidden-dependency`, `dependency-allowlist`, `file-placement`, `required-wrapper`, `route-requires-middleware`, `test-required`, `no-secrets`. *Deps:* T1.2, T1.3.
  *Acceptance:* each has ≥ 3 positive and ≥ 3 negative fixtures; single-file check ≤ 300 ms p95 (timed test).
- [ ] **T3.5 Remaining checkers** — `naming`, `size-limit`, `api-surface-stable`, `semantic-llm` (cited lines, default `warn`). *Deps:* T3.4, T2.3.
  *Acceptance:* same fixture standard; semantic checker rejects outputs lacking line citations.
- [ ] **T3.6 Rule synthesis + dry-run** — LLM proposes checker+params strictly from the catalog; engine validates and dry-runs on the repo (reports existing violation count); user-prompt weighting. *Deps:* T3.4, T3.3.
  *Acceptance:* invalid checker types/params are rejected; dry-run counts match fixtures.
- [ ] **T3.7 Render & persist** — `CONSTITUTION.md` renderer (SPEC §5.5), `.warden/constitution.rules.json` with hashes, `constitution_versions`, amendments log. *Deps:* T3.6.
  *Acceptance:* round-trip: render → parse JSON → hashes verify; golden-file test for demo repo.
- [x] **T3.8 Review & approval UI** — rules table with approve/edit/disable/bulk approve, conflict resolution UI (choose A/B/custom/ack), blocked-rule indicators. *Deps:* T3.7, T0.7.
  *Acceptance:* Playwright E2E for resolving both seeded conflicts then approving rules; unresolved-conflict rules cannot be approved.
- [x] **T3.9 Compliance scoring** — SPEC §5.6 with per-file/module/agent/overall and time series. *Deps:* T3.4.
  *Acceptance:* unit tests with hand-computed expected scores.

**PHASE GATE 3:** demo repo → conflicts caught → constitution approved → compliance score computed.
