# TASKS.md — WARDEN Build Plan

Conventions: `P0` = demo spine, `P1` = high wow, `P2` = stretch. `Deps` lists prerequisite task IDs. Every task ends with its **Acceptance** criteria; a task is done only when they pass and the gate commands in `CLAUDE.md §9` are green. Tick boxes as you go. At each **PHASE GATE**, stop and print a status report (done / failing / deferred / decisions) before continuing.

Suggested order if time is short: Phases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 (P0 spine), then 11 → 12 → 13 → 14 → 15 and 15A → 15D (P1, including the DevSecOps pack), then 16 (P2). **If the judging angle is DevSecOps, pull Phases 15A (Security Signal Hub) and 15C (Context Guard) forward to right after Phase 8**; they are small and demo well.

---

## Phase 0 — Scaffolding & Contracts (P0)

- [ ] **T0.1 Monorepo bootstrap** — pnpm workspaces, Turbo (optional), TS strict base config, ESLint, Prettier, Vitest, Husky/lint-staged (optional), CI workflow running gate commands. Packages and apps per `CLAUDE.md §5` with placeholder `index.ts`.
  *Acceptance:* `pnpm install && pnpm -r typecheck lint test` passes on an empty skeleton.
- [ ] **T0.2 Shared contracts** — `packages/shared`: error codes (SPEC §1.3), Zod schemas for IPC envelope, rules (SPEC §5.3), policies, events, verdict, behavior report, claims, trust. Export inferred types. *Deps:* T0.1.
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
- [ ] **T3.8 Review & approval UI** — rules table with approve/edit/disable/bulk approve, conflict resolution UI (choose A/B/custom/ack), blocked-rule indicators. *Deps:* T3.7, T0.7.
  *Acceptance:* Playwright E2E for resolving both seeded conflicts then approving rules; unresolved-conflict rules cannot be approved.
- [ ] **T3.9 Compliance scoring** — SPEC §5.6 with per-file/module/agent/overall and time series. *Deps:* T3.4.
  *Acceptance:* unit tests with hand-computed expected scores.

**PHASE GATE 3:** demo repo → conflicts caught → constitution approved → compliance score computed.

---

## Phase 4 — M2 Gatekeeper + MCP (P0)

- [ ] **T4.1 Policy engine** — policy schema/loader (`.warden/policies.yml` + defaults per level), path/diff-size/command checks. *Deps:* T0.2.
  *Acceptance:* table-driven tests for each level.
- [ ] **T4.2 Decision algorithm** — SPEC §6.2 for intent and diff targets; returns agent-readable `next_steps` and `remediation`. *Deps:* T3.4, T4.1.
  *Acceptance:* S2 (direct DB call) → deny citing WR rule + source line; ≤ 500 ms p95 without LLM.
- [ ] **T4.3 Checkpoints & revert** — `refs/warden/checkpoints/*` snapshots without touching user stash; `Revert to Checkpoint` with diff preview. *Deps:* T1.3.
  *Acceptance:* snapshot/restore leaves unrelated files and git state intact (integration test).
- [ ] **T4.4 Waivers** — create/expire/list; mark-as-agent-error option. *Deps:* T4.2.
  *Acceptance:* expired waivers re-open violations.
- [ ] **T4.5 MCP server + `warden` CLI** — all tools in SPEC §17 with Zod schemas and agent-oriented descriptions (stubs allowed for later-phase tools, returning `not_available` with reason); `init`, `check`, `hook`, `doctor`, `verdict`. *Deps:* T4.2, T0.5.
  *Acceptance:* in-process MCP client test drives the intent→write→diff flow on the demo repo.
- [ ] **T4.6 Editor integration** — diagnostics with rule IDs, "Why?" quick-fix opening source doc line, save-gate (detective) with Revert/Waive actions, status bar score+level. *Deps:* T4.2, T4.3.
  *Acceptance:* extension test: saving a violating file shows diagnostics and the Revert action.
- [ ] **T4.7 Agent integration installer** — `Warden: Install Agent Integration` writes the instruction block + MCP registration + hooks (with user approval and preview diff); prints manual steps for unsupported agents. **Verify config syntax against current agent docs.** *Deps:* T4.5.
  *Acceptance:* dry-run mode prints exact file changes; idempotent re-run; never overwrites unrelated content.
- [ ] **T4.8 Git pre-commit hook** — `warden hook pre-commit` (detective) with bypass logging. *Deps:* T4.2.
  *Acceptance:* committing a violating staged change fails with explanation; bypass is recorded.

**PHASE GATE 4:** scripted agent is blocked on S2, self-corrects, and passes; labels show Preventive vs Detective.

---

## Phase 5 — M4 Flight Recorder (P0)

- [ ] **T5.1 Event pipeline** — session/event ingestion from MCP calls, `warden_report_event`, hooks adapter (Claude Code first), VS Code listeners; ordering by `seq`. *Deps:* T4.5, T0.3.
  *Acceptance:* replaying a recorded session fixture reproduces the same event sequence.
- [ ] **T5.2 Attribution engine** — SPEC §10.3 using the hunk tracker; human vs agent; confidence levels; rebase fallback. *Deps:* T1.4, T5.1.
  *Acceptance:* scenario tests: agent write → human edit → agent edit produce correct per-line authorship.
- [ ] **T5.3 Rejected alternatives** — explicit tool + inferred from reverted hunks, labelled. *Deps:* T5.1.
  *Acceptance:* revert in same session creates an inferred record with trigger reference.
- [ ] **T5.4 CodeLens + hover + "Why does this exist?"** — assembled from prompt, plan, checks. *Deps:* T5.2.
  *Acceptance:* CodeLens appears on agent-written functions; hover shows prompt excerpt and checks.
- [ ] **T5.5 Provenance timeline & replay UI** — scrub slider, diff playback, filters. *Deps:* T5.1, T0.7.
  *Acceptance:* Playwright E2E scrubs a fixture session and renders correct diffs per frame.
- [ ] **T5.6 Export/retention** — redacted JSONL export, optional git notes, retention job. *Deps:* T5.1.
  *Acceptance:* exports contain no seeded secrets; retention deletes only expired events.

---

## Phase 6 — M5 Earned Autonomy (P0)

- [ ] **T6.1 Trust ledger & Beta model** — outcomes → events → posterior updates with time decay, credible-interval score, level mapping, cool-down, min-sample gates, critical hard cap. *Deps:* T0.3.
  *Acceptance:* property tests (monotonicity, decay → prior, cap behavior); golden transitions for S6 and S8.
- [ ] **T6.2 Task-class inference** — keyword rules + optional LLM; editable. *Deps:* T2.3.
  *Acceptance:* labelled sample set ≥ 90% agreement for the rule-based path.
- [ ] **T6.3 Outcome plumbing** — emit trust events from checks, verdicts, behavior runs, red-team, reverts. *Deps:* T6.1, T4.2.
  *Acceptance:* each source produces the correct weight per SPEC §11.2 (table-driven test).
- [ ] **T6.4 Policy enforcement by level** — Gatekeeper reads live level; overrides with note + 24 h expiry + ceiling. *Deps:* T6.1, T4.1.
  *Acceptance:* an agent promoted to L2 can auto-apply in non-sensitive paths but needs approval for `auth/`.
- [ ] **T6.5 Autonomy dial UI** — gauge, sparkline, explain ("what raises it"), last demotion reason, manual override dialog. *Deps:* T6.1, T0.7.
  *Acceptance:* Playwright: dial animates (respecting reduced motion) and shows explain text for S6/S8 fixtures.

---

## Phase 7 — M3 Shadow Run (P0)

- [ ] **T7.1 `@warden/probe`** — zero-dependency Node preload logging http/https/net/dns attempts, fs writes, child_process spawns, env reads (keys only), eval/Function, worker threads to JSONL. *Deps:* T0.1.
  *Acceptance:* unit tests with a tiny sample app produce expected events; overhead < 15% on benchmark app.
- [ ] **T7.2 Snapshot manager** — git worktree baseline + candidate working-tree copy; cleanup. *Deps:* T1.3.
  *Acceptance:* no leftover worktrees after success/failure/cancel.
- [ ] **T7.3 Docker runner** — cached image per lockfile hash, `--network none`, read-only mounts, limits, timeouts; local-reduced fallback with confirmation. *Deps:* T7.1, T7.2.
  *Acceptance:* S3 candidate's outbound attempt is recorded under `--network none`; fallback labelled in report.
- [ ] **T7.4 Workload runner & shape inference** — start/ready, requests, structural shape hashing, p50/p95 latency over N=5, tests execution. *Deps:* T7.3.
  *Acceptance:* deterministic output across 3 runs on the demo app.
- [ ] **T7.5 Static supplements** — route table, API surface, lockfile dependency, env-usage diffs. *Deps:* T1.2.
  *Acceptance:* correct deltas on S3/S4 fixtures.
- [ ] **T7.6 Compare + scoring + narrative** — `BehaviorDelta` → `BehaviorReport`, SPEC §7.5 weights, template narrative. *Deps:* T7.4, T7.5.
  *Acceptance:* S3 yields egress + env-secret findings, riskScore ≥ 60; clean S6 yields < 15.
- [ ] **T7.7 Config wizard** — infer `shadow.yml` from `package.json` + routes. *Deps:* T7.5.
  *Acceptance:* generates a runnable config for the demo repo without edits.
- [ ] **T7.8 Behavior Diff UI** — cards, evidence drill-down, "Add to expected", replay. *Deps:* T7.6, T0.7.
  *Acceptance:* Playwright E2E over a stored report fixture; every card has loading/empty/error states.

**PHASE GATE 7:** S3 shows "attempted egress to unknown host" with evidence, from a real sandbox run.

---

## Phase 8 — M11 Verdict + Recommendations (P0)

- [ ] **T8.1 Verdict engine** — SPEC §15 rules; skipped-check disclosure; stored inputs/explain. *Deps:* T4.2, T7.6 (others optional/pluggable).
  *Acceptance:* truth-table tests for every BLOCK/REVIEW/SHIP path; verdict is stable for identical inputs.
- [ ] **T8.2 Surfaces** — dashboard hero card, status badge, `warden_get_verdict`, `warden verdict --format md|json` (+exit code), Copy-as-Markdown. *Deps:* T8.1.
  *Acceptance:* markdown golden file; CLI exit code nonzero on BLOCK.
- [ ] **T8.3 Recommendations engine** — SPEC §19 generators + ranking + action execution on click only. *Deps:* T3.9, T7.6.
  *Acceptance:* seeded repeated violations produce the expected ranked recommendations; actions require confirmation.

---

## Phase 9 — M13 Mission Control (P0)

- [ ] **T9.1 Real-time state** — snapshot + notification patching for all panels (SPEC §20.3). *Deps:* phases 3–8.
  *Acceptance:* UI updates ≤ 1 s from core event; reconnect after core restart rehydrates.
- [ ] **T9.2 Panels** — header strip, Verdict hero, rules/hit-miss/recommendations, autonomy dials, behavior, provenance, outbound LLM drawer, diagnostics. *Deps:* T9.1.
  *Acceptance:* Playwright covers all states; keyboard navigation and ARIA checked with axe.
- [ ] **T9.3 Demo mode** — `Warden: Load Demo Data` importing recorded sessions through real ingestion; persistent "Demo data" badge. *Deps:* T1.1, T5.1.
  *Acceptance:* demo data cannot be mistaken for live data (badge test).

---

## Phase 10 — Benchmark Harness (P0)

- [ ] **T10.1 Scenario framework** — scripted deterministic agent that applies seeded patches and obeys Gatekeeper feedback; scenarios S1–S8 (SPEC §21). *Deps:* T4.5, T1.1.
  *Acceptance:* each scenario runs headless and asserts expected outcomes.
- [ ] **T10.2 With/without runner & metrics** — SPEC §22 metrics stored in `bench_runs`; JSON + Markdown output. *Deps:* T10.1, T7.6, T6.1.
  *Acceptance:* `pnpm bench` outputs computed numbers; no constants in report code; README states benchmark limits.
- [ ] **T10.3 Benchmark panel** — run label/time, per-scenario table, with/without chart. *Deps:* T10.2, T9.2.
  *Acceptance:* panel shows only stored runs; empty state if none.

**PHASE GATE 10 (P0 COMPLETE):** the hero demo steps 1–3, 6, 8, 9 (IDEA §9) run end-to-end from a clean checkout.

---

## Phase 11 — M6 Territory Map (P1)

- [ ] **T11.1 Claims engine** — claim/release/expire, impact radius via graph, inference from edits+intent, conflict types, queueing, merge-order suggestion. *Deps:* T1.2, T4.5.
  *Acceptance:* S5 yields hard conflict + queued second agent; start-on-release notification delivered on next MCP call.
- [ ] **T11.2 Territory UI** — d3 treemap, agent patterns+colors+labels, conflict pulses, claims timeline, resolve actions. *Deps:* T11.1, T0.7.
  *Acceptance:* Playwright with 5 simulated agents; live update ≤ 1 s.
- [ ] **T11.3 Gatekeeper integration** — territory check in decisions; Verdict hard-conflict BLOCK. *Deps:* T11.1, T8.1.
  *Acceptance:* decision includes holder and queue info.

---

## Phase 12 — M8 Red Team Twin (P1)

- [ ] **T12.1 Deterministic attacks** — slopsquat checks (lockfile, optional registry, similarity), secrets, unsafe constructs, authz gaps, taint-lite injection. *Deps:* T3.4, T1.2.
  *Acceptance:* S4 yields hallucinated-package and unauthenticated-route failures; clean S6 yields none.
- [ ] **T12.2 Fuzzing** — fast-check arbitraries from TS/Zod types, run in sandbox, failure classification. *Deps:* T7.3.
  *Acceptance:* planted crashing handler is caught; deterministic seed reproducible.
- [ ] **T12.3 Context-poisoning scan** — agent-directed instruction and hidden-Unicode detection across repo text and new deps' READMEs. *Deps:* T1.2.
  *Acceptance:* seeded poisoned README is flagged with evidence.
- [ ] **T12.4 LLM-proposed attacks (optional)** — proposals executed in sandbox only. *Deps:* T2.3, T12.2.
  *Acceptance:* proposals without execution evidence are never reported as findings.
- [ ] **T12.5 Report + UI + Verdict/Trust wiring** — "Survived X of Y", skipped list. *Deps:* T12.1, T8.1, T6.3.
  *Acceptance:* skipped attacks never counted as survived (test).

---

## Phase 13 — M7 Reviewer's Ghost (P1)

- [ ] **T13.1 Ingestion** — `gh api` fetch with pagination/cache + local JSON/CSV import; consent record; delete-data command. *Deps:* T0.3.
  *Acceptance:* fixture import creates the reviewer; delete removes all rows and files.
- [ ] **T13.2 Profile builder** — clustering into concerns with frequency, globs, exemplars. *Deps:* T13.1, T2.3.
  *Acceptance:* demo fixture yields expected concerns; schema-validated.
- [ ] **T13.3 Pre-review** — retrieval (BM25 + optional embeddings) → grounded predictions with evidence IDs; discard ungrounded. *Deps:* T13.2.
  *Acceptance:* 100% of surfaced predictions cite existing comment IDs (assertion test); seeded ungrounded output is dropped.
- [ ] **T13.4 Calibration & UI** — hit/miss feedback, per-concern precision, predicted-comment panel with cited quotes, Verdict friction input. *Deps:* T13.3, T8.1.
  *Acceptance:* held-out fixture comments yield a computed agreement metric shown in the panel.

---

## Phase 14 — M9 Codebase DNA (P1)

- [ ] **T14.1 Miners** — layering, naming, error handling, logging, testing, dependencies, validation, structure (SPEC §9.1). *Deps:* T1.2.
  *Acceptance:* demo repo yields the expected patterns with correct support/total.
- [ ] **T14.2 Proposal & drift** — thresholds, proposed deterministic rules (`source.kind: dna`), drift reports for changes, counterexamples. *Deps:* T14.1, T3.4.
  *Acceptance:* S6 (clean) has zero deviations; a seeded deviation is flagged with prevalence evidence.
- [ ] **T14.3 DNA UI** — prevalence bars, examples/counterexamples, approve-as-rule flow. *Deps:* T14.2, T3.8.
  *Acceptance:* approving creates a rule that Gatekeeper enforces on the next check.

---

## Phase 15 — M10 CI Foresight (P1; heal loop P2)

- [ ] **T15.1 Workflow DAG parser** — GitHub Actions via `yaml`, local action resolution, matrix expansion, trigger evaluation (branches/paths). *Deps:* T0.1.
  *Acceptance:* demo workflow DAG correct; trigger evaluation matches fixtures.
- [ ] **T15.2 Predictions** — missing secrets/vars, untested changes, config breakage, toolchain needs, optional run-history flakiness. *Deps:* T15.1, T1.3.
  *Acceptance:* S7 predicts the deploy job failing on the missing secret with evidence; no numeric probabilities displayed.
- [ ] **T15.3 UI + MCP + Verdict wiring** — React Flow DAG with risk nodes; `warden_predict_ci`. *Deps:* T15.2, T8.1.
  *Acceptance:* Playwright E2E over a stored prediction fixture.
- [ ] **T15.4 (P2) Heal loop** — log fetch, deterministic parse, structured failure to agent via MCP, ≤ 3 iterations, local replay verification, never auto-push. *Deps:* T15.2, T7.3.
  *Acceptance:* iteration cap enforced; each iteration requires replay result before suggesting a push.

---

## Phase 15A — M14 Security Signal Hub (P1; quick win, promote if DevSecOps is the angle)

- [ ] **T15A.1 SARIF + normalization** — Zod schema for SARIF 2.1.0 subset, parser, `SecurityFinding` model (SPEC §14A.3), severity mapping, fingerprints, sanitizer for untrusted text (strip control/zero-width chars, cap length, escape Markdown). *Deps:* T0.2.
  *Acceptance:* hand-authored, **labelled-fixture** SARIF files shaped like Semgrep/CodeQL/Gitleaks/Trivy output parse correctly; malformed files rejected with clear errors; a SARIF message containing prompt-injection text is stored sanitized and never reaches an LLM/agent unescaped (test).
- [ ] **T15A.2 Scanner runner** — `.warden/scanners.yml`, first-run confirmation, timeouts, adapters for SARIF output, `npm audit --json`, OSV JSON; run in baseline worktree and candidate; `skipped: not installed` and `required` handling. No scanners bundled. *Deps:* T15A.1, T7.2.
  *Acceptance:* missing scanner → reported as skipped (never as pass); required-but-missing scanner appears in Verdict "incomplete checks".
- [ ] **T15A.3 Baseline diff & attribution** — new vs existing by fingerprint; map to Flight Recorder attributions with confidence; heuristic dedupe. *Deps:* T15A.2, T5.2.
  *Acceptance (S9):* new finding on an agent-written line is attributed to the session/prompt; pre-existing finding is never attributed to an agent; low-confidence attribution when only commit-level data exists.
- [ ] **T15A.4 Wiring** — Verdict inputs (SPEC §15.2), trust events (§14A.5), MCP `warden_get_security_findings`, waivers/false-positive feedback. *Deps:* T15A.3, T8.1, T6.3.
  *Acceptance:* truth-table tests for new BLOCK/REVIEW conditions; trust weights per table.
- [ ] **T15A.5 UI + command** — Security Signals panel, `Warden: Import SARIF`, scanner status, "Introduced by" chips, send-to-agent (sanitized). *Deps:* T15A.3, T0.7.
  *Acceptance:* Playwright E2E over fixtures; all panel states present.

---

## Phase 15B — M15 Supply Chain Ledger (P1)

- [ ] **T15B.1 Lockfile parsers** — pnpm, npm, yarn via real parsers; components with purl, integrity, resolved host, scope. *Deps:* T0.1.
  *Acceptance:* demo repo lockfile yields correct component counts and graph (snapshot test).
- [ ] **T15B.2 CycloneDX generator** — CycloneDX 1.5 JSON with `warden:` properties; schema validation in tests (vendored official schema). *Deps:* T15B.1.
  *Acceptance:* output validates; `warden sbom --format cyclonedx` works offline.
- [ ] **T15B.3 Attribution engine** — diff `package.json`/lockfiles across Flight Recorder events and git history into `addedBy/changedBy/removedBy`. *Deps:* T15B.1, T5.2.
  *Acceptance (S11):* the dependency the scripted agent added is attributed to its session and verdict; unobserved additions marked `unknown`.
- [ ] **T15B.4 Delta, flags, checkers** — install scripts, license policy, registry/source changes, integrity-without-version-change, major bumps, transitive count; new `license-policy` and `install-scripts` checkers; optional registry lookups (shared with T12.1). *Deps:* T15B.3, T3.4.
  *Acceptance:* each flag has positive and negative fixtures; S11 flags install script and slopsquat suspicion.
- [ ] **T15B.5 UI + MCP + Verdict wiring** — dependency table with provenance badges, `warden_get_sbom_delta`, Verdict inputs, trust events. *Deps:* T15B.4, T8.1.
  *Acceptance:* Playwright E2E; Verdict BLOCK on integrity/non-registry source.

---

## Phase 15C — M16 Context Guard (P1; canaries P2)

- [ ] **T15C.1 Config + matcher + shell analysis** — `.warden/context-guard.yml`, protected-path glob matcher with allow overrides, real shell-command parser (choose via ADR) detecting protected reads, env dumps, credential-config reads, exfil shapes (labelled heuristic). *Deps:* T0.2.
  *Acceptance:* table-driven tests of ≥ 30 commands (benign and risky); no regex-based shell parsing.
- [ ] **T15C.2 Preventive paths** — `warden hook pre-read`, MCP `warden_check_context_access` and `warden_read_file_redacted`, redaction preserving keys but masking values, per-agent overrides; hook registration through the T4.7 installer (**verify each agent's current hook syntax**). *Deps:* T15C.1, T4.5, T4.7.
  *Acceptance (S10):* scripted agent's `.env` read is denied; redacted read returns masked values with count; allow-list (`.env.example`) honored.
- [ ] **T15C.3 Detective output scanning + access log** — `no-secrets` over diffs, commit messages, recorded command output, test/CI logs; `context_read` events into Flight Recorder; per-session log UI. *Deps:* T15C.2, T5.1.
  *Acceptance (S10):* a secret in recorded command output creates a `critical` leak finding tied to the session; logs contain no secret values (test).
- [ ] **T15C.4 Trust/Verdict/recommendations wiring** — SPEC §14C.5. *Deps:* T15C.3, T8.1, T6.3, T8.3.
  *Acceptance:* denied-read penalties capped per session; human-approved reads exempt.
- [ ] **T15C.5 (P2) Canary tokens** — `warden canary install|status`, hashed storage, detection in outputs, diffs, commits, logs, and Shadow Run egress attempts. *Deps:* T15C.3, T7.6.
  *Acceptance:* a seeded canary appearing in a diff or egress attempt trips and is reported as a proven leak path.
- [ ] **T15C.6 Context Guard UI** — panel with per-session "what the agent saw", blocked attempts, Preventive/Detective labels, config editor. *Deps:* T15C.3, T0.7.
  *Acceptance:* Playwright E2E; states complete.

---

## Phase 15D — M17 Compliance Evidence (P1)

- [ ] **T15D.1 Evidence pack builder** — contents per SPEC §14D.2, redaction via shared redactor, scope by commit/date range. *Deps:* T8.1, T5.6, T15A.3, T15B.2, T15C.3.
  *Acceptance:* pack for the demo repo contains every listed file; no seeded secrets present.
- [ ] **T15D.2 Manifest, hash chain, optional signature** — SHA-256 per file, chain hash, optional Ed25519 detached signature with user key (never persisted). *Deps:* T15D.1.
  *Acceptance:* unit tests for chain computation; signature verifies with the matching public key only.
- [ ] **T15D.3 Verify command** — `warden evidence verify <dir>`; nonzero exit on modified, missing, or extra files or bad signature. *Deps:* T15D.2.
  *Acceptance (S12):* passes on untampered pack; fails after modifying one byte of any file.
- [ ] **T15D.4 Completeness report + control-theme mapping** — computed coverage metrics and gaps list; `compliance/mappings/default.yml` generic themes; "informational, not certification" disclaimer in every export. *Deps:* T15D.1.
  *Acceptance:* completeness numbers match hand-computed fixture values; disclaimer present in `summary.md` and `control-mapping.md`.
- [ ] **T15D.5 UI + commands** — export wizard, packs list with verification status and fingerprint copy. *Deps:* T15D.3, T0.7.
  *Acceptance:* Playwright E2E of export → verify.

**PHASE GATE 15A–D:** S9–S12 pass; the DevSecOps demo step (IDEA §9 step 4b and 10) runs end-to-end; scanner findings are labelled by scanner vs `Heuristic`.

---

## Phase 16 — M12 Tribunal & Polish (P2)

- [ ] **T16.1 Tribunal view** — prosecution/defense/judge panes from stored data; "What would make this SHIP?" checklist; optional labelled narration. *Deps:* T8.1, T12.5, T13.4.
  *Acceptance:* every statement links to evidence; flipping a seeded input changes the Judge pane correctly.
- [ ] **T16.2 Additional adapters** — Codex/Cursor/Gemini CLI MCP registration helpers; generic hook docs. *Deps:* T4.7.
  *Acceptance:* dry-run output reviewed against each tool's current docs (record sources in ADR).
- [ ] **T16.3 Packaging** — `.vsix` build (bundle core/MCP/dashboard), per-platform considerations (better-sqlite3 prebuilds), README, quick-start, license, marketplace metadata. *Deps:* all P0.
  *Acceptance:* installing the `.vsix` into a clean VS Code and opening the demo repo works end-to-end.
- [ ] **T16.4 Docs** — README with honest scope/limits (Preventive vs Detective, sandbox coverage, benchmark meaning), ADRs complete, demo script (`docs/DEMO.md`) mapping each step to scenario IDs.
  *Acceptance:* a new contributor can run the demo from README alone.

---

## Cross-Cutting Checklist (verify at every gate)

- [ ] No `any`, no unhandled promises, no regex used to parse code/YAML.
- [ ] All IPC/MCP/LLM/file boundaries validated by Zod.
- [ ] Every UI panel has loading/empty/error/stale states and is keyboard accessible.
- [ ] Demo/fixture data always labelled; benchmarks computed, never hardcoded.
- [ ] Offline mode keeps all deterministic features working.
- [ ] Secrets redacted in logs, exports, and LLM payloads (tests exist).
- [ ] Performance budgets from `CLAUDE.md §7` asserted in tests.
- [ ] Each deviation from SPEC recorded as an ADR.
- [ ] Scanner/SARIF/advisory text and dependency READMEs treated as untrusted data (sanitized, never forwarded as instructions).
- [ ] Heuristic findings labelled `Heuristic`; scanner findings labelled with scanner name/version; skipped or missing scanners disclosed in the Verdict.
- [ ] Context Guard and evidence logs never contain secret values; every evidence export carries the "not a certification" disclaimer.

## Fixed Time-Box Suggestion (48-hour hackathon cut)

| Block | Scope |
|---|---|
| Hours 0–6 | Phases 0–1 (skeleton, demo repo, AST index) |
| 6–14 | Phases 2–3 (LLM layer, Forge, checkers, approval UI) |
| 14–22 | Phase 4 (Gatekeeper, MCP, editor integration) |
| 22–28 | Phases 5–6 (Flight Recorder, Earned Autonomy) |
| 28–36 | Phase 7 (Shadow Run) |
| 36–42 | Phases 8–10 (Verdict, Mission Control, benchmarks) |
| 42–46 | Phase 11 or 12 (Territory or Red Team — whichever demos better) |
| 46–48 | Demo rehearsal, fallback recordings (clearly labelled "replay"), README |

If DevSecOps is the angle, replace hours 42–46 with Phases 15A (SARIF + attribution) and 15C (Context Guard preventive path), and show the evidence-verify tamper test only if 15D is finished.
