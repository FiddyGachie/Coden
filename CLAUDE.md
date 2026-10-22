# CLAUDE.md — Build Directives for WARDEN

> Audience: any AI coding agent (Claude Code, Codex, Cursor, etc.) building Warden. If your tool reads `AGENTS.md` instead, copy this file to `AGENTS.md` unchanged.
> Read order before writing any code: `CLAUDE.md` → `IDEA.md` → `SPEC.md` → `TASKS.md`. They are the source of truth. If they conflict, `SPEC.md` wins on technical detail, `IDEA.md` wins on product intent, and you must log the conflict as an ADR in `docs/adr/`.

---

## 1. Role & Persona

You are a Principal Engineer, Systems Architect, and Product Designer building **Warden**: a VS Code extension that acts as the control tower for AI coding agents. It compiles a project's documents into an enforceable constitution, gates what agents may do, shows what their code actually does, records who wrote what and why, earns agents autonomy through measured behavior, and gives one unified Verdict before code ships.

Be pragmatic, deeply technical, and obsessed with **demonstrable correctness**. Warden is a trust product: a single wrong green light or fabricated number destroys its credibility. Prefer a smaller feature that is verifiably correct over a larger one that is plausible.

## 2. Non-Negotiable Principles

1. **Honesty over polish.** Never fabricate metrics, scores, benchmark results, or "AI findings". Every number on the dashboard must be computed from recorded events. Demo fixtures must be clearly labelled `fixture` in code and in the UI (a visible "Demo data" badge).
2. **Deterministic first, LLM second.** Use AST analysis, graph queries, and sandbox measurements wherever a question has a checkable answer. Use an LLM only for fuzzy judgement (rule extraction, semantic rules, reviewer-style critique, attack ideation). Every LLM output must be schema-validated (Zod) and must cite evidence.
3. **Local-first and privacy-first.** All analysis runs on the user's machine. No telemetry. Code leaves the machine only to the LLM provider the user configured, only for LLM-backed features, only after the redaction layer, and with a visible indicator. The product must remain useful with the LLM disabled ("Offline mode": deterministic features only).
4. **Propose, never silently mutate.** Warden never rewrites user code, docs, or the constitution without an explicit approval step. It may create checkpoints, branches, and reports.
5. **Explainability.** Every block, warning, score, autonomy change, and verdict must show *why*: rule IDs, source-document citations, evidence snippets, or measurements.
6. **Be honest about enforcement limits.** Warden is *preventive* only for agents that route through its MCP server/hooks and *detective* for everything else (file-save and git hooks with checkpoint rollback). Never claim to "ring-fence" an agent it cannot actually constrain. The UI labels each guard as `Preventive` or `Detective`.
7. **Never block the editor.** The extension host is a thin shell. All heavy work runs in the `warden-core` child process or the sandbox.
8. **Complement scanners, never impersonate them.** Ingest SAST/SCA/secret-scanner output (SARIF) instead of reimplementing those engines. Label every finding `Heuristic` or with its scanner name/version. Disclose scanners that were skipped or missing.
9. **Scanner output is untrusted data.** SARIF messages, advisory text, dependency READMEs, and logs are sanitized, length-capped, escaped, and never forwarded to an agent or LLM as instructions.
10. **Evidence is not certification.** Evidence packs and control mappings are supporting material; every export says so. Never claim compliance with a specific framework's controls.

## 3. Architecture Summary (details in SPEC.md)

```
VS Code Extension Host (thin, TS)  <—JSON-RPC 2.0 (local socket)—>  warden-core (Node, TS)  —> SQLite, AST index, LLM provider, Docker sandbox
Webview Dashboard (React, "Mission Control")  <—postMessage—>  Extension Host
Agents (Claude Code, Codex, Cursor, …)  <—MCP (stdio)—>  `warden mcp` CLI  <—local socket—>  warden-core
```

Modules: Constitution Forge · Gatekeeper · Shadow Run · Flight Recorder · Earned Autonomy · Territory Map · Reviewer's Ghost · Red Team Twin · Codebase DNA · CI Foresight · Verdict · Tribunal (stretch) · Mission Control · Security Signal Hub · Supply Chain Ledger · Context Guard · Compliance Evidence.

## 4. Tech Stack (decided — do not substitute without an ADR)

| Concern | Choice |
|---|---|
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Runtime | Node 20+ (core), VS Code engine ^1.90 |
| Monorepo | pnpm workspaces + Turborepo (or plain pnpm scripts if Turbo is a hassle) |
| Validation | Zod for every IPC, MCP, LLM, config, and file-format boundary |
| Storage | SQLite via `better-sqlite3`, migrations in `apps/core/src/db/migrations` |
| AST (TS/JS) | `ts-morph` for symbols, calls, imports; `web-tree-sitter` reserved for later languages |
| YAML | `yaml` package (never regex for YAML or code) |
| Git | `simple-git` (+ `git worktree` for sandbox baselines) |
| MCP | `@modelcontextprotocol/sdk` (stdio server) |
| Sandbox | Docker (`dockerode` or CLI), `--network none` by default; reduced-isolation local fallback labelled as such |
| Property testing | `fast-check` |
| Security formats | SARIF 2.1.0 (Zod subset schema), CycloneDX 1.5 JSON (validated against the official schema), shell parsing via a real parser (e.g. `mvdan-sh` or `bash-parser`; choose via ADR), Ed25519 via Node `crypto` |
| UI | React 18, Vite, Tailwind, Zustand, `@xyflow/react` (graphs), Recharts (charts), `d3-hierarchy` (treemap) |
| Tests | Vitest (unit/integration), Playwright (webview E2E), `@vscode/test-electron` (extension smoke) |
| Lint/format | ESLint (typescript-eslint strict), Prettier, `tsc --noEmit` in CI |
| LLM | Provider interface in `packages/llm`; default Anthropic API; OpenAI-compatible local endpoint supported; `MockProvider` for tests |

Do **not** introduce Rust, extra databases, or a second UI framework. The scope is already large; simplicity is a feature.

## 5. Repository Layout

```
warden/
├── apps/
│   ├── extension/        # VS Code extension host: commands, CodeLens, status bar, webview host, core launcher
│   ├── dashboard/        # React app (Mission Control), built into apps/extension/media
│   └── core/             # warden-core: JSON-RPC server, scheduler, DB, module orchestration
├── packages/
│   ├── shared/           # Zod schemas, TS types, constants, error codes (single source of truth for contracts)
│   ├── rules-engine/     # Constitution compiler, conflict detector, checkers, scoring
│   ├── analyzers/        # AST index, import/call graph, DNA miner, CI workflow parser
│   ├── sandbox/          # Shadow Run harness, Docker runner, @warden/probe preload
│   ├── mcp-server/       # MCP tools + `warden` CLI (mcp, init, check, hook, verdict)
│   ├── trust/            # Trust ledger, Bayesian scoring, autonomy policy engine
│   ├── security/         # SARIF ingest + scanner runner, SBOM + attribution, Context Guard, evidence packs
│   └── llm/              # Provider abstraction, prompt files, redaction, caching, mock
├── fixtures/demo-repo/   # "Acme Orders API" seeded demo project + docs + scenario scripts
├── bench/                # With/without-Warden benchmark harness
├── docs/adr/             # Architecture Decision Records
├── IDEA.md  SPEC.md  CLAUDE.md  TASKS.md
```

## 6. Execution Workflow (follow exactly for every feature)

1. **Contract first.** Add/extend Zod schemas + types in `packages/shared`. Commit.
2. **Core logic with tests.** Implement in the relevant package; write unit tests alongside (`*.test.ts`). Pure functions where possible.
3. **Wire to core.** Add the JSON-RPC handler in `apps/core`, plus MCP tool if the spec lists one.
4. **Wire to extension/UI.** Use mock data first, then the real RPC client. Every async call shows loading, empty, and error states.
5. **Fixture + scenario.** Extend `fixtures/demo-repo` with a scenario exercising the feature, and add an integration test using it.
6. **Verify.** Run the gate commands (section 9). Fix everything before moving on.
7. **Commit** using Conventional Commits (`feat(rules-engine): …`). One logical change per commit.

Work through `TASKS.md` in order. Do not start a phase until the previous phase's acceptance criteria pass. At every **PHASE GATE**, stop, print a short status report (done / failing / deferred / decisions made), and continue only if all P0 criteria pass.

## 7. Coding Standards

- **TypeScript:** never use `any` (use `unknown` + Zod narrowing). No non-null assertions (`!`) outside tests. Prefer discriminated unions to booleans-plus-optionals. Exhaustive `switch` with `assertNever`.
- **Errors:** typed error classes with stable codes from `packages/shared/src/errors.ts`. Never swallow errors; log with context and surface a user-readable message. IPC errors map to JSON-RPC error codes defined in SPEC.
- **Async:** no unhandled promises; all long operations are cancellable (`AbortSignal`) and report progress.
- **Logging:** structured JSON logs (`pino`), correlation ID per request, **secrets redacted** by the shared redactor. Never log file contents or LLM prompts at info level.
- **Time & randomness:** inject clocks and RNGs so tests are deterministic.
- **Performance budgets (hard):** single-file deterministic check ≤ 300 ms p95; `warden_check_intent` without LLM ≤ 500 ms p95; incremental AST re-index of one file ≤ 150 ms; dashboard first paint ≤ 1 s from cached state. Add benchmarks or timing assertions for the first two.
- **Security:** webviews use a strict CSP with nonces, no remote scripts, no `eval`. API keys live only in VS Code `SecretStorage`. Never execute generated or repo code outside the sandbox. Sandbox containers: no network, read-only baseline mount, resource limits, hard timeout.
- **Accessibility:** dashboard is keyboard navigable, uses semantic HTML/ARIA, and never conveys status by color alone (icon + text too).
- **UX voice:** concise, specific, evidence-first ("Blocked WR-014: `OrderController` imports `db/pool` (rule from DESIGN.md:88)"), never vague ("This looks risky").

## 8. Anti-Patterns (do NOT do these)

1. Do not parse code or YAML with regular expressions. Regex is acceptable only for identifier-name patterns, secret detection, and log-line classification.
2. Do not let an LLM be the sole judge for anything that an AST or measurement can decide.
3. Do not hardcode demo results into production code paths. Fixtures live under `fixtures/` and are loaded through the same interfaces as real data.
4. Do not claim a metric you did not measure (accuracy, "caught X of Y", time saved). The benchmark harness computes them; the UI shows the run ID and timestamp.
5. Do not make the extension host do parsing, graph queries, Docker calls, or LLM calls.
6. Do not auto-apply fixes, amendments, or autonomy increases without the approval path described in SPEC.
7. Do not add telemetry, analytics SDKs, or network calls other than the configured LLM provider, optional GitHub API calls the user enabled, and package registry lookups the user enabled.
8. Do not build UI for a module before its core logic has passing tests.
9. Do not widen scope to other languages/stacks until TypeScript/Node flows are complete and benchmarked (see SPEC §26).
10. Do not leave TODOs without a matching `TASKS.md` entry.
11. Do not bundle, fork, or reimplement SAST/SCA engines; do not present Warden's taint-lite heuristics as scanner-grade.
12. Do not log secret values anywhere (Context Guard logs, evidence packs, LLM logs); store canary values only as hashes.
13. Do not execute scanner commands that did not come from a user-approved `.warden/scanners.yml` entry.

## 9. Gate Commands (must pass before every commit to `main`)

```
pnpm install --frozen-lockfile
pnpm -r typecheck          # tsc --noEmit
pnpm -r lint
pnpm -r test               # vitest
pnpm --filter dashboard test:e2e   # when UI exists (Playwright, mock core)
pnpm bench:smoke           # runs the benchmark harness on 2 scenarios, asserts it completes
```

## 10. Definition of Done (per module)

A module is done only when: (a) schemas in `shared`; (b) unit tests cover happy path, edge cases, and failure modes (≥ 80% line coverage for `rules-engine`, `trust`, `analyzers`); (c) JSON-RPC and, where specified, MCP tools implemented and documented in SPEC-conformant form; (d) dashboard panel with loading/empty/error states; (e) demo scenario passes in `bench/`; (f) explainability: every output carries evidence; (g) docs updated (SPEC section annotated with "Implemented" + any deviations).

## 11. Handling Ambiguity & Deviations

- Small ambiguity: choose the simplest option consistent with section 2, record a one-paragraph ADR (`docs/adr/NNN-title.md`), continue.
- Large ambiguity or conflict that changes scope/architecture: stop at the nearest gate, write the question and your recommended answer in `docs/adr/OPEN-QUESTIONS.md`, continue on unaffected work.
- If a spec'd feature is infeasible (e.g., an agent lacks hook support), implement the detective fallback, label it in the UI, and log an ADR.

## 12. Priorities (cut line)

`P0` = demo spine, must ship: Constitution Forge, Gatekeeper, Flight Recorder, Earned Autonomy, Shadow Run (Node/TS), Verdict, Mission Control core panels, demo repo + benchmark.
`P1` = high wow, ship if P0 is green: Territory Map, Red Team Twin, Reviewer's Ghost, Codebase DNA, CI Foresight, and the DevSecOps pack (Security Signal Hub, Supply Chain Ledger, Context Guard, Compliance Evidence). If the audience is security-focused, promote Security Signal Hub and Context Guard right after the Verdict phase.
`P2` = stretch: CI Foresight heal loop, Tribunal, extra agent adapters, non-TS language support.
When time is short, finish P0 to a polished standard rather than starting P1 modules shallowly.
