# SPEC.md — WARDEN Technical Specification

Version 1.0 · Scope: v1 targets **TypeScript/Node projects only**. Module IDs (M1–M17) match `IDEA.md`. Priorities: P0 (demo spine), P1 (high wow), P2 (stretch).

---

## 1. System Overview

Warden is a VS Code extension plus a local Node service (`warden-core`) and an MCP server CLI (`warden`). Agents talk MCP; the extension talks JSON-RPC; both reach the same core, which owns the database, analyzers, rule engine, trust ledger, sandbox, and LLM provider.

### 1.1 Processes

| Process | Role | Rules |
|---|---|---|
| Extension Host | Commands, CodeLens, status bar, tree views, webview host, spawns/monitors core | Never parse, query graphs, call Docker or LLMs. Debounce editor events ≥ 300 ms |
| Webview (React) | Mission Control dashboard | Strict CSP, nonce scripts, no remote resources; talks only to Extension Host via `postMessage` |
| `warden-core` | Orchestrator: DB, AST index, modules, sandbox, LLM, scheduler | Single instance per workspace; lock file `.warden/core.lock`; restart on crash with backoff |
| `warden mcp` | Stdio MCP server launched by an agent; thin proxy to core socket | If core is down it starts it (or returns a clear `CORE_UNAVAILABLE` error) |
| Sandbox | Docker container(s) executing baseline/candidate code | No network, read-only source mount, CPU/mem/time limits |

### 1.2 IPC

- Extension ↔ core and MCP ↔ core: **JSON-RPC 2.0 over a local socket** (Unix domain socket on macOS/Linux at `.warden/core.sock`; named pipe `\\.\pipe\warden-<hash>` on Windows). Newline-delimited JSON framing.
- Core → clients: JSON-RPC *notifications* for live events (see §20.3).
- All params/results validated by Zod schemas in `packages/shared/src/ipc/*.ts`. Unknown methods → `-32601`. Validation failure → `-32602` with Zod issues.
- Every request carries `id` (uuid) and optional `meta.correlationId`; logs include it.

### 1.3 Error Codes (packages/shared/src/errors.ts)

| Code | Name | Meaning |
|---|---|---|
| 1001 | `CORE_UNAVAILABLE` | Core not running/reachable |
| 1002 | `CONSTITUTION_NOT_APPROVED` | Enforcement requested with no approved rules |
| 1003 | `LLM_DISABLED` | Feature needs LLM but offline mode is on |
| 1004 | `LLM_INVALID_OUTPUT` | LLM output failed schema validation after retry |
| 1005 | `SANDBOX_UNAVAILABLE` | Docker missing/failed; fallback may apply |
| 1006 | `POLICY_DENIED` | Action denied by autonomy policy |
| 1007 | `TERRITORY_CONFLICT` | Claim overlaps an active claim |
| 1008 | `ANALYSIS_TIMEOUT` | Analyzer exceeded budget |
| 1009 | `NOT_A_GIT_REPO` | Git-dependent feature without repo |
| 1010 | `DOC_PARSE_FAILED` | Source document unreadable |

---

## 2. Persistent Storage

SQLite at `.warden/warden.db` (WAL mode). Migrations are forward-only SQL files with a `schema_migrations` table. All timestamps are ISO-8601 UTC text. IDs are ULIDs unless noted.

### 2.1 Tables (columns abbreviated; add `created_at`, `updated_at` everywhere)

| Table | Key columns |
|---|---|
| `agents` | `id`, `name` (e.g. `claude-code`), `kind`, `model`, `first_seen`, `adapter` |
| `sessions` | `id`, `agent_id`, `prompt_text`, `prompt_hash`, `started_at`, `ended_at`, `task_class`, `branch`, `base_commit`, `status` |
| `events` | `id`, `session_id`, `seq`, `type` (§10.2), `payload_json`, `ts` |
| `docs` | `id`, `path`, `kind` (idea/spec/design/claude/other), `hash`, `ingested_at` |
| `assertions` | `id`, `doc_id`, `start_line`, `end_line`, `subject`, `predicate`, `value`, `quote`, `confidence` |
| `conflicts` | `id`, `assertion_a`, `assertion_b`, `kind`, `severity`, `status` (open/resolved/acknowledged), `resolution_note` |
| `rules` | `id` (`WR-###`), `version`, `json` (RuleSchema), `status`, `precision_hits`, `false_positives` |
| `constitution_versions` | `id`, `hash`, `rules_hash`, `created_at`, `amendment_note` |
| `checks` | `id`, `session_id?`, `trigger` (intent/diff/save/commit/manual), `target_json`, `decision`, `duration_ms` |
| `violations` | `id`, `check_id`, `rule_id`, `severity`, `file`, `start_line`, `end_line`, `evidence_json`, `status` (open/fixed/waived/false_positive) |
| `checkpoints` | `id`, `session_id`, `git_ref`, `stash_ref`, `files_json`, `created_at` |
| `attributions` | `id`, `file`, `start_line`, `end_line`, `session_id`, `event_id`, `author_kind` (agent/human), `content_hash`, `supersedes` |
| `trust_events` | `id`, `agent_id`, `task_class`, `area`, `outcome`, `weight`, `source_ref`, `ts` |
| `trust_state` | `agent_id`, `task_class`, `alpha`, `beta`, `score`, `level`, `locked_until`, `explain_json` |
| `policies` | `id`, `level`, `json` (PolicySchema) |
| `claims` | `id`, `agent_id`, `session_id`, `intent`, `paths_json`, `symbols_json`, `radius_json`, `status`, `expires_at` |
| `behavior_runs` | `id`, `baseline_ref`, `candidate_ref`, `status`, `report_json`, `isolation` (docker/local), `duration_ms` |
| `redteam_runs` | `id`, `target_json`, `attacks_json`, `survived`, `total` |
| `reviewers` | `id`, `login`, `source`, `consent_at`, `profile_json` |
| `review_comments` | `id`, `reviewer_id`, `pr_ref`, `file`, `body`, `diff_context`, `ts`, `embedding?` |
| `ghost_predictions` | `id`, `diff_hash`, `reviewer_id`, `predictions_json`, `agreement?` |
| `dna_patterns` | `id`, `kind`, `description`, `support`, `total`, `prevalence`, `examples_json`, `counter_json`, `proposed_rule_id?`, `status` |
| `ci_predictions` | `id`, `diff_hash`, `workflow`, `predictions_json` |
| `verdicts` | `id`, `target_json`, `decision`, `score`, `inputs_json`, `explain_json`, `created_at` |
| `recommendations` | `id`, `source_module`, `text`, `action_json`, `status` |
| `bench_runs` | `id`, `scenario`, `mode` (with/without), `metrics_json`, `run_label` |
| `security_findings` | `id`, `scanner`, `heuristic`, `rule_id`, `category`, `severity`, `file`, `start_line`, `end_line`, `fingerprint`, `baseline_state`, `attribution_json`, `run_id`, `status` |
| `scanner_runs` | `id`, `scanner`, `version`, `status` (ok/skipped/failed), `skip_reason`, `target_ref`, `duration_ms` |
| `sbom_components` | `id`, `snapshot_id`, `purl`, `name`, `version`, `scope`, `integrity`, `resolved_host`, `licenses_json`, `flags_json`, `provenance_json` |
| `sbom_snapshots` | `id`, `commit`, `format`, `hash`, `created_at` |
| `context_reads` | `id`, `session_id`, `agent_id`, `path`, `op`, `decision`, `redaction_count`, `source`, `ts` |
| `canaries` | `id`, `label`, `value_hash`, `location`, `installed_at`, `tripped_at?` |
| `evidence_packs` | `id`, `range_json`, `path`, `fingerprint`, `signed`, `verified_at?`, `created_at` |
| `settings` | key/value |

---

## 3. LLM Provider Layer (`packages/llm`)

```ts
interface LlmProvider {
  id: string;
  complete<T>(req: { promptId: string; version: number; system: string; user: string;
    schema: z.ZodType<T>; temperature?: number; maxTokens?: number; signal?: AbortSignal }): Promise<Result<T, LlmError>>;
}
```

- **Prompts** are versioned files in `packages/llm/prompts/<promptId>.v<N>.md` with front-matter (inputs, output schema name). Never inline long prompts in code.
- **Structured output:** request JSON, strip fences, parse, validate with Zod; on failure retry once with the validation errors appended; on second failure return `LLM_INVALID_OUTPUT`.
- **Redaction layer (mandatory before any send):** strips/masks secrets (AWS keys, GitHub/Slack tokens, `Bearer` tokens, private keys, high-entropy strings in env-like assignments), `.env` values, and any path matching `settings.llm.neverSendGlobs`. Returns a redaction report shown in the "What was sent" log.
- **Transparency:** every LLM call is logged (prompt id, bytes sent, redaction counts, provider, latency) and visible in a dashboard "Outbound LLM log" (no content stored beyond a hash unless `settings.llm.retainPrompts`).
- **Caching:** key = hash(promptId, version, redacted input, model). TTL 7 days.
- **Providers:** `AnthropicProvider` (default), `OpenAiCompatibleProvider` (base URL; supports local Ollama/llama.cpp), `MockProvider` (fixture-driven, for tests and offline demo). Offline mode: `LlmProvider` absent; callers must handle `LLM_DISABLED` gracefully.
- Model names come from settings; do not hardcode model IDs in logic.

---

## 4. Analyzers (`packages/analyzers`)

### 4.1 AST Index (TS/JS)

- Built with `ts-morph` over `tsconfig.json` projects (supports multiple tsconfigs / project references).
- Extracts per file: imports (resolved module → file), exports, declarations (functions, classes, methods, exported consts), call sites with resolved targets where the type checker resolves them, decorators, JSX components, route registrations (Express/Fastify/Hono/Next route handlers patterns via AST matchers).
- Output graph tables kept in memory + persisted cache in `.warden/index/*.json` keyed by file hash.
- **Incremental:** on file change, re-parse only the changed file and its direct dependents' resolution edges. Budget: ≤ 150 ms for one file.
- **Graph API:** `importsOf(file)`, `importersOf(file)`, `callersOf(symbol)`, `calleesOf(symbol)`, `reach(files, depth)`, `layerOf(file)` (via configured layers), `routesIn(file)`.

### 4.2 Diff Model

`DiffTarget = { kind: 'working-tree' | 'staged' | 'range'; base?: string; head?: string; paths?: string[] }`. Core normalizes to a list of `{ file, status, hunks[], addedSymbols[], removedSymbols[] }` using git + the AST index (symbols touched by hunk line ranges).

### 4.3 Hunk Line Tracking

Used by Flight Recorder: map old line ranges to new line ranges across subsequent edits with a line-based diff (Myers via `diff` package), preserving attribution for unchanged lines and splitting/shrinking attributions for modified ones.

---

## 5. M1 — Constitution Forge (P0)

### 5.1 Inputs

Documents: `IDEA.md`, `SPEC.md`, `DESIGN.md`, `CLAUDE.md` (any may be missing; also accepts `AGENTS.md`, `README.md`, and a Spec Kit `memory/constitution.md` or `.specify/memory/constitution.md` as optional sources) plus a **free-text user prompt** describing emphasis ("strict on layering; relaxed on naming"). Command: `Warden: Forge Constitution`.

### 5.2 Pipeline

1. **Ingest**: read docs, hash, split into sections by Markdown headings (use a Markdown AST parser, e.g. `remark`; not regex). Record line ranges.
2. **Assertion extraction (LLM, schema-validated)**: for each section produce `Assertion { subject, predicate, value, modality (must|must_not|should|may|fact), quote (≤ 280 chars, verbatim), startLine, endLine, confidence }`. Example: `{ subject: "database", predicate: "is", value: "PostgreSQL", modality: "fact" }`. Verify every `quote` actually occurs in the source lines; drop assertions whose quote can't be found (anti-hallucination).
3. **Conflict detection**: normalize subjects (lowercase, synonym table + LLM canonicalization), then group assertions by `(subject, predicate)`; two assertions conflict when values are incompatible. Types: `value_mismatch` (Postgres vs MongoDB), `modality_clash` (must vs must_not), `scope_clash`, `stale_reference` (doc mentions a path/module that doesn't exist in the repo, checked deterministically against the AST index). Each conflict: `{ a, b, kind, severity, explanation, suggestedResolution }`. LLM is used only to canonicalize subjects and write explanations; detection of `stale_reference` is fully deterministic.
4. **Resolution UI**: the user resolves each conflict (choose A, choose B, custom) or acknowledges it. Rules derived from unresolved conflicting assertions stay `proposed` and cannot be approved.
5. **Rule synthesis**: map assertions to rules using the **checker catalog** (§5.4). Prefer deterministic checkers; fall back to `semantic` only if no deterministic mapping exists. LLM proposes `{checker.type, params, scope}` strictly from the catalog (schema-enforced); the engine validates params against the checker's Zod param schema and *dry-runs* the rule on the current repo to report "N existing violations" (a sanity check against over/under-broad rules).
6. **Prompt-weighting**: the user prompt adjusts severity and adds extra rules (e.g., "strict on layering" → layering rules `error`).
7. **Render**: write `CONSTITUTION.md` (human) and `.warden/constitution.rules.json` (machine). The JSON includes the SHA-256 of `CONSTITUTION.md` and every source doc hash.
8. **Approval**: rules start `proposed`; user approves individually or in bulk. Only `approved` rules are enforced. Approval creates a new `constitution_versions` row.

### 5.3 Rule Schema (`packages/shared/src/rules.ts`)

```ts
export const CheckerType = z.enum([
  'import-boundary', 'forbidden-call', 'forbidden-dependency', 'dependency-allowlist',
  'required-wrapper', 'file-placement', 'naming', 'test-required', 'size-limit',
  'api-surface-stable', 'no-secrets', 'route-requires-middleware',
  'license-policy', 'install-scripts', 'semantic-llm'
]);

export const RuleSchema = z.object({
  id: z.string().regex(/^WR-\d{3,}$/),
  title: z.string().max(120),
  description: z.string(),
  article: z.string(),                       // grouping heading in CONSTITUTION.md
  source: z.object({
    kind: z.enum(['doc', 'dna', 'user', 'conflict-resolution']),
    file: z.string().optional(), startLine: z.number().int().optional(),
    endLine: z.number().int().optional(), quote: z.string().max(280).optional(),
    dnaPatternId: z.string().optional(),
  }),
  severity: z.enum(['info', 'warn', 'error', 'critical']),
  mode: z.enum(['deterministic', 'semantic', 'hybrid']),
  checker: z.object({ type: CheckerType, params: z.record(z.unknown()) }),
  scope: z.object({ include: z.array(z.string()), exclude: z.array(z.string()).default([]) }),
  rationale: z.string(),
  remediation: z.string(),                    // what a compliant change looks like (shown to agents)
  confidence: z.number().min(0).max(1),
  status: z.enum(['proposed', 'approved', 'disabled', 'deprecated']),
  version: z.number().int().min(1),
});
```

### 5.4 Checker Catalog (P0 = ★)

| Checker | Params | Detection method |
|---|---|---|
| ★ `import-boundary` | `from: glob[]`, `cannotImport: glob[]\|package[]` | AST import graph |
| ★ `forbidden-call` | `callee: {module?, symbol, member?}`, `inScope` | Resolved call sites via ts-morph (e.g. `pg.Pool.query` outside `repositories/`) |
| ★ `forbidden-dependency` | `packages: string[]` | `package.json` diff + imports |
| ★ `dependency-allowlist` | `allowed: string[]`, `allowDevDeps?` | New dependencies vs list |
| ★ `file-placement` | `declarationKind`, `mustLiveIn: glob[]` | AST declarations (e.g. React components in `src/ui/`) |
| ★ `required-wrapper` | `target: symbolPattern`, `mustBeWrappedBy` | Call/ decorator/ HOF analysis |
| ★ `route-requires-middleware` | `routes: glob/pattern`, `middleware: name[]` | Route registration AST matchers |
| ★ `test-required` | `srcGlob`, `testGlobs`, `minChangedLines` | Diff: changed source without a changed/added test |
| ★ `no-secrets` | `allowlistPaths` | Pattern + entropy detection (regex allowed here) |
| `naming` | `kind`, `pattern` | Identifier regex on AST names |
| `size-limit` | `maxLinesPerFile`, `maxFunctionLines`, `maxCyclomatic` | AST metrics |
| `api-surface-stable` | `entrypoints` | Exported surface diff |
| `semantic-llm` | `rubric`, `examples?` | LLM judge with cited lines; only `warn` by default |
| `license-policy` | `allow: spdx[]`, `deny: spdx[]` | Package manifests/SBOM licenses vs policy (§14B) |
| `install-scripts` | `allowPackages: string[]` | New dependencies with install lifecycle scripts (§14B) |

Checker interface: `check(ctx: CheckContext, rule: Rule): Violation[]` where `ctx` exposes the AST index, diff model, file contents, and (for semantic) an optional LLM handle. Checkers are pure, timeout-bounded, and unit-tested with fixtures.

### 5.5 `CONSTITUTION.md` Format

```
# Constitution — <Project>            (generated by Warden, version N, <date>)
Sources: IDEA.md@<hash>, SPEC.md@<hash>, …     Conflicts: 2 resolved, 0 open
## Article I — Architecture
### WR-001 (error, deterministic) Controllers must not access the database directly
Rule: …   Why: …   Compliant change: …
Source: DESIGN.md:88–90 > "<quote>"
…
## Amendments
- v3 (date): approved WR-014; resolved conflict C-2 (Postgres chosen over MongoDB)
```

Amendments are proposals created by the Recommendations engine (§19); the user approves; Warden never edits the constitution silently.

### 5.6 Compliance Score

`ComplianceScore(scope) = 100 × (1 − Σ(w_s × open_violations_s) / max(1, Σ(w_s × applicable_checks_s)))` with `w`: info 0.1, warn 0.5, error 1, critical 3. "Applicable checks" counts rule × target pairs evaluated. Reported per file, module (directory), agent, and overall, plus a time series (daily snapshots in `bench`/dashboard).

---

## 6. M2 — Gatekeeper (P0)

### 6.1 Guard Modes

| Mode | Label | Mechanism | Applies to |
|---|---|---|---|
| Intent gate | **Preventive** | MCP tool `warden_check_intent` called *before* writing; autonomy policy consulted | Agents configured with Warden MCP + instructions |
| Hook gate | **Preventive** | Agent hooks (e.g. Claude Code `PreToolUse` on Edit/Write/Bash → `warden hook pre-write`) | Agents that support hooks (verify against current agent docs when implementing) |
| Save gate | **Detective** | VS Code `onDidSaveTextDocument` / file watcher → check → on `error+` violation: warn, offer **Revert to checkpoint** | Any editor/agent |
| Commit gate | **Detective** | Git `pre-commit` hook (`warden hook pre-commit`) | Any |
| CI gate | **Detective** | Optional GitHub Action stub that runs `warden check --range` and posts the Verdict | PRs |

### 6.2 Decision Algorithm (`warden_check_intent` and `check_diff`)

1. Load approved rules (if none → `CONSTITUTION_NOT_APPROVED` with guidance).
2. Resolve agent identity and trust level (§11) → policy (allowed paths, max diff size, allowed commands, network).
3. **Policy checks first** (path allowlist, diff-size cap, forbidden commands). Violations → `deny` (`POLICY_DENIED`).
4. Evaluate deterministic rules on the *planned/actual* change. For intents (no code yet), evaluate what is knowable: target paths vs `file-placement`/`import-boundary` scopes, planned dependencies vs allowlist, planned symbols; return `unknown` for rules needing code.
5. Territory check (§12) for planned paths.
6. Combine: any `critical` → `deny`; any `error` → `deny` unless level ≥ L3 *and* rule is waivable; `warn` → `allow_with_notes`; level L0/L1 → `needs_approval` regardless (per policy).
7. Response includes `decision`, `violations[]` (rule id, title, evidence, `remediation`), `notes`, `autonomy`, `checkpointId`, `next_steps` (agent-readable instructions to comply).
8. Every call is a `checks` row and a Flight Recorder event.

### 6.3 Checkpoints

Before an agent session's first write, and before any approved risky operation, create a checkpoint: `git stash create`-style snapshot ref (`refs/warden/checkpoints/<id>`) of the working tree (no change to the user's stash list). `Warden: Revert to Checkpoint` restores selected files from the ref, showing a diff first.

### 6.4 Waivers

A user may waive a violation with a reason; waivers are stored, expire (default 14 days), count against the agent's trust only if the user marks them "agent error", and appear in the Verdict.

### 6.5 Editor UX

Diagnostics (squiggles) with rule IDs and "Why?" quick-fix opening the source doc line; status bar item `Warden · Score 87 · L2`; notification actions: *Show Verdict*, *Revert*, *Waive*.

---

## 7. M3 — Shadow Run / Behavior Diff (P0)

### 7.1 Purpose & Honest Scope

Compare the *observable behavior* of baseline vs candidate under a deterministic workload. It reports measured differences; it does **not** prove absence of other behavior. Reports state coverage ("workload exercised 14 of 22 routes").

### 7.2 Configuration (`.warden/shadow.yml`)

```yaml
install: pnpm install --frozen-lockfile
build: pnpm build            # optional
start: node dist/server.js
ready: { http: "http://localhost:3000/health", timeoutSec: 30 }
env: { NODE_ENV: test, DATABASE_URL: "sqlite::memory:" }   # sandbox-safe values only
workload:
  - { name: list orders, http: { method: GET, path: /orders }, expect: { status: 200 } }
  - { name: create order, http: { method: POST, path: /orders, body: { sku: "A1", qty: 2 } } }
tests: pnpm test
screenshots: []              # optional Playwright steps
egressAllowlist: []          # hosts considered expected
```

A wizard (`Warden: Configure Shadow Run`) infers a starter config from `package.json` and route extraction.

### 7.3 Pipeline

1. **Snapshots:** baseline = `git worktree add` of base ref; candidate = working tree copy (excluding `.git`, `node_modules`).
2. **Image:** Docker base image `node:<LTS>-slim` with dependency cache volumes; build once per lockfile hash.
3. **Instrumentation:** inject `@warden/probe` via `NODE_OPTIONS=--require /probe/index.js`. The probe patches and logs (JSONL to a mounted volume): `http/https/net/dns` outbound attempts (host, port, method, path, count), `fs` writes/unlinks/mkdir (path, bytes), `child_process` spawns (command, args hash), `process.env` reads of keys not in baseline set (key names only, never values), `eval`/`new Function` usage, `worker_threads`, and timers count. Probe overhead target < 15%.
4. **Network policy:** run containers with `--network none`; *attempts* are still recorded by the probe and reported as "attempted egress" (more informative than allowed egress). Optional `--network` to an internal recording proxy only if the user enables it.
5. **Workload execution:** start app, wait ready, run workload requests sequentially with fixed seeds; record status, headers (selected), body *shape* (JSON schema inferred via structural hashing), latency p50/p95 over N=5 repeats; run `tests` and record pass/fail counts and failing names.
6. **Static supplements (no sandbox needed):** route table diff, exported API surface diff (ts-morph), dependency diff (lockfile), config/env var usage diff (AST: `process.env.X` accesses), size diff.
7. **Compare** baseline vs candidate → `BehaviorDelta`.

### 7.4 Report Schema (abbreviated)

```ts
BehaviorReport = {
  runId, baselineRef, candidateRef, isolation: 'docker' | 'local-reduced', coverage: { routesExercised, routesTotal },
  egress: { added: Endpoint[], removed: Endpoint[], unexpected: Endpoint[] },
  filesystem: { newWritePaths: string[], deletions: string[], outsideWorkspace: string[] },
  processes: { newSpawns: Spawn[] },
  env: { newReads: string[] },            // key names only
  routes: { added: Route[], removed: Route[], changedAuth: Route[] },
  apiSurface: { added: Sym[], removed: Sym[], changed: Sym[] },
  responses: { changed: { workload: string; before: Shape; after: Shape; statusBefore: number; statusAfter: number }[] },
  performance: { p50DeltaPct: number; p95DeltaPct: number },
  dependencies: { added: Dep[], removed: Dep[], majorBumps: Dep[] },
  tests: { before: Counts; after: Counts; newlyFailing: string[] },
  riskFindings: Finding[],               // each: category, severity, evidence, plainEnglish
  riskScore: number                       // 0–100, see §7.5
}
```

### 7.5 Risk Scoring & Plain-English Narrative

Deterministic weights (configurable): unexpected egress attempt 35, new env read of a key matching `/(SECRET|TOKEN|KEY|PASSWORD)/i` 25, write outside workspace 30, new process spawn 20, route added without auth where constitution requires auth 25, removed route / changed status 15, API surface break 15, new dependency 10 (+15 if slopsquat suspect from M8), tests newly failing 30, p95 regression > 30% 10. `riskScore = min(100, Σ weights)`. The "plain-English" summary is generated by a template from findings (LLM optional for fluency but must not add claims; it receives only the structured findings).

### 7.6 Fallback

If Docker is unavailable: run in a local child process with the probe and a temp working dir, `isolation: 'local-reduced'`, UI shows a warning and disables the "attempted egress" guarantee (egress may actually occur).

### 7.7 UX

Behavior Diff panel: side-by-side cards (Network, Files, Env, Routes, Responses, Tests, Deps), red/amber/green with icons+text, "Show evidence" (raw events), "Add to expected" (writes to `shadow.yml`), and a "Replay" button for the last run. Feeds Verdict and Trust.

---

## 8. M8 — Red Team Twin (P1)

### 8.1 Attack Catalog (each attack: `{id, category, applicable, run(), result: survived|failed|skipped, evidence}`)

| Category | Method | Deterministic? |
|---|---|---|
| Hallucinated / slopsquatted packages | For each new dependency or import: exists in lockfile? registry lookup (if enabled) for existence, age, download count, name similarity to popular packages (edit distance); flag brand-new/low-download/near-miss names | Yes (registry optional) |
| Secrets | `no-secrets` checker over diff and new files, including fixtures/docs | Yes |
| Injection | Taint-lite AST analysis: request-derived values reaching SQL string concatenation, `child_process`, `eval`, path joins (`../`) | Yes (heuristic, labelled) |
| Authz gaps | Routes lacking required middleware; endpoints mutating state with no auth | Yes |
| Input fuzzing | `fast-check` arbitraries derived from TS types / Zod schemas of changed exported functions and route handlers; run in sandbox; failure = uncaught exception, hang, 5xx | Yes (execution in sandbox) |
| Unsafe constructs | `eval`, `new Function`, dynamic `require` of variable, `child_process` with shell:true, disabled TLS verification | Yes |
| Context poisoning | Scan repo text files (README, docs, comments, fixtures, `node_modules` READMEs of new deps) for agent-directed instructions ("ignore previous", "run this command", hidden Unicode/zero-width text) | Yes |
| LLM-proposed attacks (optional) | LLM proposes extra test inputs for changed handlers from the diff; executed in sandbox; never trusted without execution evidence | Hybrid |

### 8.2 Output

`RedTeamReport { survived, total, failures[], skipped[], details[] }` → "Survived 14 of 17". Skipped attacks are listed (never counted as survived). Each failure has evidence and a suggested fix. Results feed Verdict and trust events (`redteam_fail` weight by severity).

---

## 9. M9 — Codebase DNA (P1)

### 9.1 Miners (run over the AST index and git history)

| Miner | Detects | Example pattern |
|---|---|---|
| Layering | Import direction statistics between top-level dirs | "`controllers` → `services` → `repositories`; reverse imports: 0 of 212" |
| Naming | Casing/suffix conventions per declaration kind | "100% of repositories end in `Repository`" |
| Error handling | Idioms: `Result<T,E>`, throw typed errors, try/catch placement | "94% of handlers wrap in `asyncHandler`" |
| Logging | Logger used vs `console.*` | "`console.log` appears 0 times in `src/`" |
| Testing | Test colocation & naming, framework, fixtures | "Every service has `*.test.ts` alongside" |
| Dependencies | Preferred libs for tasks (HTTP client, date lib) | "dates: `date-fns` in 31 files, `moment` 0" |
| Validation | Boundary validation library usage | "All route bodies validated by Zod" |
| Structure | File size distribution, function length percentiles | "p95 file = 240 lines" |

### 9.2 Pattern Record & Rule Proposal

`DnaPattern { id, kind, description, support, total, prevalence, examples[≤3], counterExamples[≤3], proposedRule? }`. Thresholds: prevalence ≥ 85% and support ≥ 10 → propose a deterministic rule (`status: proposed`, `source.kind: 'dna'`); 70–85% → informational "soft convention" shown with counterexamples. Mining is incremental on changed files; full re-mine nightly or on demand (`Warden: Mine Codebase DNA`).

### 9.3 DNA Drift

For each generated change, report "DNA deviation" (new code deviating from an approved/informational pattern) with the pattern and its prevalence as evidence. Counts toward compliance score at the rule's severity once approved.

---

## 10. M4 — Flight Recorder / AI Blame (P0)

### 10.1 Capture Sources

| Source | Data | Notes |
|---|---|---|
| MCP interactions | Every Warden tool call/response (intent, claims, checks) | Always on |
| Agent hooks/adapters | Prompt text, tool calls (file edits, shell commands), model name | Adapters in `packages/mcp-server/src/adapters/` (Claude Code hooks first; generic "report_event" MCP tool for others) |
| VS Code listeners | Document changes, saves, terminal command start/end (where API allows) | Attributed to `human` unless matched to an active agent session within a time window + hunk match |
| Git | Commits, branches, base commits | Associates sessions with commits |

### 10.2 Event Types

`session_started`, `prompt`, `plan`, `intent_check`, `tool_call`, `file_write` (diff hunks), `command_run`, `check_result`, `alternative_rejected` (agent-reported or inferred from reverted hunks), `violation`, `waiver`, `checkpoint`, `behavior_run`, `redteam_run`, `verdict`, `human_edit`, `session_ended`.

### 10.3 Attribution Algorithm

On each `file_write`: compute hunks vs previous content; for added/changed lines create `attributions` rows `{file, range, session, event, author_kind: agent}`. On later edits (agent or human) re-map ranges with the hunk line tracker (§4.3); lines changed by a human become `author_kind: human` with `supersedes` pointing to the replaced attribution. A `content_hash` per attributed block detects drift due to external edits (falls back to "unknown (external)"). Squash/rebase breaks mapping → fall back to commit-level attribution and mark confidence `low`.

### 10.4 Rejected Alternatives

Record (a) alternatives an agent explicitly reports (`alternative_rejected` via MCP tool), and (b) inferred ones: hunks written then reverted within the same session, with the intent check or violation that triggered the revert. UI labels explicit vs inferred.

### 10.5 UX

- **CodeLens** above functions/blocks: `🤖 claude-code · session 7 · "add payments endpoint" · 3 checks · L2`.
- **Hover:** prompt excerpt, rules checked, violations resolved, rejected alternatives count.
- **Provenance panel:** timeline (scrub with slider; replays diffs frame by frame), filters by agent/session, "Why does this exist?" answer assembled from prompt + plan + checks.
- **Export:** `warden export-session <id>` → `.warden/sessions/<id>.jsonl` (redacted) for sharing; optional git notes on commit (`refs/notes/warden`).
- **Retention:** configurable (default 90 days of events; attributions kept while code exists).

---

## 11. M5 — Earned Autonomy (P0)

### 11.1 Autonomy Ladder

| Level | Name | Permissions (default policy, editable in `.warden/policies.yml`) |
|---|---|---|
| L0 | Observer | Read-only; may propose diffs as suggestions; no writes |
| L1 | Supervised | May write only after human approval per change set; diff cap 80 lines; no shell except allowlist (tests, lint) |
| L2 | Trusted Local | Auto-apply within non-sensitive paths; diff cap 300 lines; sensitive paths (`auth/`, `migrations/`, `.github/`, infra) need approval |
| L3 | Autonomous | Auto-apply and auto-commit to a feature branch; sensitive paths need approval; diff cap 800 lines |
| L4 | Delegated | Auto-PR allowed; may touch sensitive paths with post-hoc review; never direct pushes to protected branches |

Policy fields (`PolicySchema`): `level`, `allowedPaths`, `approvalPaths`, `maxDiffLines`, `allowedCommands`, `networkAllowed`, `canCommit`, `canOpenPr`. Default for unknown agents: **L1**.

### 11.2 Trust Model

Per `(agent, task_class)`; `task_class` ∈ {`feature`, `bugfix`, `refactor`, `test`, `docs`, `deps`, `infra`, `other`} inferred from prompt (LLM optional; rule-based fallback via keywords) and editable.

Each outcome updates a Beta(α, β) posterior, initialized α=β=1:

| Outcome | Effect |
|---|---|
| Clean verdict SHIP (no violations) | α += 1.0 |
| Verdict REVIEW accepted by human without changes | α += 0.5 |
| `warn` violation | β += 0.25 |
| `error` violation | β += 1.0 |
| `critical` violation | β += 3.0 and **hard cap**: level ≤ L1 for 24 h |
| Behavior Diff finding high-risk (unexpected egress, env secret read) | β += 2.0 |
| Red Team failure | β += 0.5 × severity weight |
| New scanner finding attributed to the agent (M14) | `warn` β += 0.25; `error` β += 1.0; `critical` β += 3.0 and hard cap (half weight if attribution confidence is low; none if author unknown) |
| Context Guard: denied read of a protected path (M16) | β += 1.0 per distinct path per session (cap 3.0); confirmed secret leak in output or canary tripped: `critical` |
| Supply chain flag introduced by the agent (M15) | install script / non-registry source: β += 1.0; integrity change without version change: `critical` |
| Human revert of agent change | β += 1.5 |
| Reviewer's Ghost agreement (predicted flags that real reviewer also made) | informational weight to β only (never rewards) |

**Time decay:** multiply α, β by `0.5^(Δdays/14)` toward the prior at each update. **Score** = 100 × (lower bound of the 80% credible interval of Beta(α,β)) — conservative by design. **Mapping:** score < 20 → L0/L1 per config; 20–40 L1; 40–60 L2; 60–80 L3 (requires ≥ 10 evaluated changes); ≥ 80 L4 (requires ≥ 20 changes and zero criticals in 14 days). Promotions apply after a **cool-down** (≥ 3 consecutive clean outcomes since last demotion); demotions apply immediately.

### 11.3 Explainability

`trust_state.explain_json` lists the last N contributing events with weights, the posterior, and "what would raise the level" ("3 more clean features in `src/orders` → L3"). The dial UI shows level, score, trend sparkline, and the last demotion reason.

### 11.4 Enforcement & Overrides

The policy for the current level is enforced by Gatekeeper (§6). Manual override (`Warden: Set Autonomy Level`) is allowed with a required note, is logged, expires in 24 h, and never exceeds a user-configured ceiling.

---

## 12. M6 — Territory Map (P1)

### 12.1 Claims

`Claim { id, agentId, sessionId, intent, paths[], symbols[], radius: { direct[], dependents[] }, status: active|queued|released|expired, expiresAt }`.

- Agents call `warden_claim_territory({intent, paths?, symbols?})`. If omitted, the core infers a claim from the first N edits and the intent text (paths from the AST index by symbol/name search; optional LLM mapping of intent → modules).
- **Impact radius:** direct = claimed files; dependents = `importersOf` to depth 1 (configurable) + callers of changed exported symbols.
- Claims auto-expire after inactivity (default 20 min) and are released on session end or `warden_release_territory`.

### 12.2 Conflict Types

| Type | Condition | Response to claiming agent |
|---|---|---|
| Hard | Overlapping files in `direct` | `blocked` + queue position + holder info |
| Soft | One agent's `direct` intersects another's `dependents` | `proceed_with_caution` + the list of exported symbols not to change signature of |
| Semantic (optional, LLM/embedding) | High intent similarity on adjacent areas | `proceed_with_caution` + note |

### 12.3 Queueing & Merge Order

Queued claims start automatically when the blocker releases (notification to the agent on the next MCP call, and via `warden_list_territories`). Suggested merge order = topological by dependency among claims, then by start time.

### 12.4 UX

Treemap of the repo (d3-hierarchy by directory size), tiles shaded by agent (distinct hues + pattern + label), pulsing border for conflicts, tooltip with intent/holder/ETA, timeline of claims, and "Resolve" actions (reassign, force-release with note). Live updates ≤ 1 s.

---

## 13. M7 — Reviewer's Ghost (P1)

### 13.1 Consent & Framing

Profiles are built only for reviewers the user explicitly adds (`Warden: Add Reviewer`), data stays local, and the UI states: *"A model of review patterns learned from past comments, not the person."* Predictions are labelled "Predicted" and must cite real past comments.

### 13.2 Ingestion

- GitHub: via `gh api` (user's own auth) for PR review comments by `login`, with diff hunks; paginate; cache. Optional GitLab later.
- Local import: JSON/CSV/Markdown of comments (also used for demo fixtures).
- Store in `review_comments`; optional embeddings computed via the provider or a local model.

### 13.3 Profile Construction

Cluster comments into **Concern** categories (LLM clustering, schema-validated; categories like "missing tests", "error handling", "naming", "n+1 queries", "overengineering"). For each concern: frequency, typical phrasing (short paraphrase), file-glob affinities, severity tendency, ≤ 3 exemplar comment IDs. Persist `profile_json`.

### 13.4 Pre-Review

For each diff hunk: retrieve top-k similar past comments (BM25 on diff context + optional embedding similarity), then the LLM drafts predicted comments **grounded only in retrieved comments**. Output schema requires `evidenceCommentIds[]` (≥ 1). Predictions with missing/invalid evidence are discarded. Each prediction: `{file, line, concern, text, confidence, evidence[]}`; UI shows quotes of the evidence comments with PR links.

### 13.5 Calibration

When a real review arrives (GitHub fetch) or the user marks predictions as *hit/miss/unhelpful*, compute precision/recall per concern; display in profile; low-precision concerns are down-weighted. Aggregate agreement feeds informational trust data and the Verdict's "predicted review friction".

---

## 14. M10 — CI Foresight (P1; heal loop P2)

### 14.1 Workflow Model

Parse `.github/workflows/*.yml` (and later `.gitlab-ci.yml`) with the `yaml` package → typed DAG: `workflow → jobs (needs) → steps (uses/run) → env/secrets references`. Resolve `uses: ./local-action` and (if enabled) fetch remote reusable workflows by pinned ref. Expand `matrix` to count variants.

### 14.2 Predictions for a Diff

| Check | Method |
|---|---|
| Which workflows/jobs trigger | Evaluate `on.push/pull_request` `branches`/`paths`/`paths-ignore` against the diff and target branch |
| Missing secrets/vars | Collect `${{ secrets.X }}`/`vars.X`/`env` references; compare with names available (via `gh api` secret names if the user enables it, else a `.warden/ci-secrets.json` list); report missing as high-confidence failures |
| Untested changes | Map changed source files to test jobs via test globs/coverage mapping (if a coverage report exists) or heuristics (colocated tests, naming); changed code with no covering test → medium risk |
| Config breakage | Changes to files referenced by workflow steps (Dockerfile, scripts, lockfile) without updating dependents |
| New toolchain needs | New dependency requiring a Node/OS version outside the workflow's setup |
| Flaky/historical | If run history is available via `gh run list`, jobs failing > X% on similar paths are flagged |

Output `CiPrediction { workflow, job, likelihood: low|med|high, reasons[], evidence[] }` — **no numeric probabilities** unless calibrated by bench data. Run via `warden_predict_ci` and as a Verdict input.

### 14.3 Heal Loop (P2, optional, off by default)

On a failed CI run (user-triggered): fetch logs (`gh run view --log-failed`), deterministic parse of error/stack/test names, correlate to diff files, hand a structured failure to the agent via MCP, **cap 3 iterations**, each verified by local replay (`act` or generated docker-compose when available) before suggesting a push. Never pushes without approval.

---

## 14A. M14 — Security Signal Hub (P1; quick win)

### 14A.1 Purpose & Honest Scope

Bring real scanner results into Warden and answer the question scanners can't: **which agent, session, and prompt introduced this finding?** Warden does **not** bundle or reimplement SAST/SCA engines. Findings from Warden's own heuristics (M8) are labelled `Heuristic`; scanner findings carry `scanner` name and version.

### 14A.2 Inputs

1. **SARIF 2.1.0 files**: `warden sarif import <file>`, `Warden: Import SARIF`, or auto-watch `.warden/sarif/*.sarif`.
2. **Scanner runner** (`.warden/scanners.yml`): commands for scanners the user has installed (examples: Semgrep, CodeQL CLI, Gitleaks, Trivy, OSV-Scanner, `npm audit --json` via adapter). Each entry: `name`, `command`, `outputFormat` (`sarif` | `npm-audit-json` | `osv-json`), `timeoutSec`, `categories`, `required: boolean`. If a scanner is missing, report `skipped: not installed` (never silently pass); a `required` scanner that didn't run makes the Verdict disclose incomplete checks.

### 14A.3 Normalized Model

```ts
export const SecurityFinding = z.object({
  id: z.string(),                         // ULID
  scanner: z.object({ name: z.string(), version: z.string().optional() }),
  heuristic: z.boolean().default(false),
  ruleId: z.string(),
  category: z.enum(['sast', 'sca', 'secret', 'iac', 'container', 'other']),
  severity: z.enum(['info', 'warn', 'error', 'critical']),
  cwe: z.array(z.string()).default([]),
  advisoryIds: z.array(z.string()).default([]),   // CVE/GHSA/OSV for SCA
  file: z.string().optional(), startLine: z.number().int().optional(), endLine: z.number().int().optional(),
  message: z.string(),                    // sanitized plain text, length-capped
  fingerprint: z.string(),                // SARIF partialFingerprints if present, else hash(ruleId, file, normalized snippet)
  baselineState: z.enum(['new', 'existing', 'fixed', 'unknown']),
  attribution: z.object({ authorKind: z.enum(['agent', 'human', 'unknown']),
    agentId: z.string().optional(), sessionId: z.string().optional(), eventId: z.string().optional(),
    promptExcerpt: z.string().max(200).optional(), confidence: z.enum(['high', 'medium', 'low']) }).optional(),
});
```

**Severity mapping:** SARIF `properties.security-severity` (numeric): ≥ 9.0 → `critical`, 7.0–8.9 → `error`, 4.0–6.9 → `warn`, < 4.0 → `info`. Without it, use SARIF `level`: `error` → `error`, `warning` → `warn`, `note` → `info`. Scanner-specific overrides are configurable in `scanners.yml`.

### 14A.4 Baseline Diff & Attribution

1. Run each configured scanner on the **baseline** (git worktree at base ref) and the **candidate** (working tree), or use SARIF `baselineState`/fingerprints when provided. A finding is `new` if its fingerprint is absent in baseline.
2. **Attribution:** map each new finding's `file:line` to Flight Recorder attributions (§10.3). If the line is agent-attributed, attach agent/session/prompt excerpt (confidence `high`); if attribution is commit-level only (rebase fallback), confidence `low`. Existing findings are **never** attributed to an agent.
3. **Dedupe with heuristics:** if a scanner finding overlaps a Red Team heuristic at the same location/CWE, keep the scanner finding and mark the heuristic `corroborated`.

### 14A.5 Integration

- **Verdict:** see §15.2 additions.
- **Trust events:** new `critical` finding attributed to agent: β += 3.0 and the §11.2 hard cap; new `error`: β += 1.0; new `warn`: β += 0.25. Findings with `low` attribution confidence apply at half weight; `unknown` authors apply no trust effect.
- **MCP:** `warden_get_security_findings` (§17) so agents can read and fix findings *before* finishing; descriptions returned to agents contain only sanitized fields.
- **Untrusted data:** SARIF/scanner text is **data, never instructions**. It is sanitized (strip control/zero-width characters, cap length, escape Markdown) before display, storage in `message`, LLM use, or return to an agent.

### 14A.6 UX

Security Signals panel: filters by scanner/category/severity/new-vs-existing; each finding shows file link, rule, CWE, and an **Introduced by** chip (agent · session · prompt excerpt · confidence); actions: *Open*, *Create waiver (with reason)*, *Mark false positive* (feeds scanner rule precision), *Send to agent* (via MCP queue, sanitized). Empty state explains how to configure scanners.

---

## 14B. M15 — Supply Chain Ledger (P1)

### 14B.1 SBOM Generation

- Parse lockfiles with real parsers (pnpm-lock.yaml via `yaml`, `package-lock.json` JSON, `yarn.lock` via a maintained parser); never regex.
- Output **CycloneDX 1.5 JSON** (validated against the vendored official JSON schema in tests). Components: `name`, `version`, `purl`, `integrity` hashes, `resolved` registry host, `scope` (prod/dev), `licenses` (from package manifests when available), dependency graph.
- Command: `warden sbom --format cyclonedx [--with-attribution]`.

### 14B.2 Attribution

For every component, `addedBy | changedBy | removedBy = { authorKind, agentId?, sessionId?, eventId?, commit?, verdictId?, ts }`, derived by diffing `package.json` and lockfiles across Flight Recorder `file_write`/`command_run` events (e.g., `pnpm add`) and git history. Attribution is exported as CycloneDX `properties` under the `warden:` namespace (e.g., `warden:addedBy:agent`, `warden:addedBy:session`, `warden:verdict`). Components added outside observed sessions are `authorKind: unknown`.

### 14B.3 Delta Report & Risk Flags (per change)

| Flag | Source | Severity |
|---|---|---|
| New direct dependency | lockfile diff | info (warn if not allowlisted) |
| New transitive count above threshold | graph diff | info |
| Install scripts (`preinstall`/`install`/`postinstall`) | package manifest | warn (error if new and unexpected) |
| License policy violation | manifest + `license-policy` checker | warn/error per policy |
| Registry host change / non-registry source (git URL, tarball) | lockfile `resolved` | error |
| Integrity hash changed without version change | lockfile | critical |
| Major version bump | semver compare | info |
| Suspected slopsquat (nonexistent, very new, low downloads, name similarity) | M8 checks (registry lookups opt-in) | error |
| Known advisories | M14 SCA findings (OSV/npm audit/Trivy) | per advisory severity |

New checker types (added to the catalog in §5.4): `license-policy` (`allow: spdx[]`, `deny: spdx[]`) and `install-scripts` (`allowPackages: string[]`).

### 14B.4 UX & Integration

Dependency table with provenance badges (agent/human/unknown), risk flags, and advisory links; "Introduced by" drill-down to the session. Verdict inputs per §15.2. CLI/MCP: `warden sbom`, `warden_get_sbom_delta`.

---

## 14C. M16 — Context Guard (P1; canaries P2)

### 14C.1 Purpose & Honest Scope

Reduce the chance that agents ingest secrets into model context or leak them into code, commits, logs, or the network, and keep a log of what each agent read. **Preventive only for agents that route reads through Warden hooks/MCP**; otherwise detective (output scanning, canaries). The UI labels each control accordingly.

### 14C.2 Configuration (`.warden/context-guard.yml`)

```yaml
mode: block            # block | redact | log
protected:
  - "**/.env*"
  - "**/*.pem"
  - "**/*.key"
  - "**/id_rsa*"
  - "**/.npmrc"
  - "**/.aws/**"
  - "**/credentials*"
allow: ["**/.env.example"]
agentOverrides: {}      # per-agent mode
scanOutputs: true       # scan diffs, commits, command output, CI logs
canaries: { enabled: false }
```

### 14C.3 Mechanisms

| Mechanism | Type | How |
|---|---|---|
| Pre-read hook | **Preventive** | `warden hook pre-read` registered as the agent's pre-tool-use hook for file read/search/shell tools (verify against each agent's current docs); decision `deny`, `redact`, or `allow` |
| MCP `warden_check_context_access` / `warden_read_file_redacted` | **Preventive (cooperative)** | Agents are instructed to read protected paths only through the redacted tool, which returns content with secret values masked (keys preserved for structure) |
| Shell command analysis | **Preventive/Detective** | Parse shell commands with a real shell parser (pick via ADR, e.g. `mvdan-sh` or `bash-parser`), not regex, to flag reads of protected paths, environment dumps (`env`, `printenv`), `git config` credential reads, and exfil shapes (e.g., piping protected files to network tools). Labelled heuristic |
| Output scanning | **Detective** | Run `no-secrets` detectors over agent diffs, commit messages, recorded command output, test logs, and CI logs; a hit creates a `leak` finding with the introducing session |
| Canary tokens (P2) | **Detective** | `warden canary install` writes decoy credentials into a protected decoy file with unique values; any appearance of a canary value in agent output, diffs, commits, logs, or Shadow Run egress attempts proves a leak path |

### 14C.4 Context Access Log

Events `context_read { path, op, decision (allow|deny|redact), redactionCount, agentId, sessionId, source (hook|mcp|inferred) }` stored in `context_reads` and in Flight Recorder. The dashboard answers "what did the agent see?" per session. Only paths and counts are logged, never secret values.

### 14C.5 Integration

- **Trust:** attempted read of a protected path by an agent (denied): β += 1.0 per distinct path per session (cap 3.0); confirmed secret in agent output: treated as `critical` (β += 3.0 + hard cap); human-approved reads are exempt.
- **Verdict:** per §15.2 additions.
- **Recommendations:** "Agent X attempted `.env` reads 4 times; add scaffold/env guidance to CLAUDE.md or provide `.env.example`".

---

## 14D. M17 — Compliance Evidence (P1)

### 14D.1 Purpose & Honest Scope

Package the evidence Warden already collects into a reviewable, tamper-evident bundle. **This is supporting material for auditors, not a certification or legal advice.** Tamper-evidence holds only if the pack (or its manifest hash) is anchored somewhere the author can't silently rewrite (protected branch, WORM storage, external ticket). Every export says this.

### 14D.2 Evidence Pack Contents (`.warden/evidence/<id>/`)

| File | Content |
|---|---|
| `summary.md` | Scope (date/commit range), headline stats, completeness report, limits |
| `verdicts.jsonl` | Every Verdict with inputs and explanations |
| `provenance.jsonl` | Redacted session/event/attribution records |
| `approvals.jsonl` | Human approvals, waivers (with reasons, expiry), autonomy overrides |
| `autonomy-history.json` | Trust/level transitions with causes |
| `policy-snapshot/` | Constitution (version/hash), rules JSON, policies, context-guard config |
| `sbom.cdx.json` | CycloneDX SBOM with `warden:` attribution properties |
| `security-findings.sarif` | Normalized findings with attribution |
| `context-access.jsonl` | Context Guard log |
| `behavior-reports/` | Shadow Run reports in scope |
| `control-mapping.md` | Generic control-theme mapping (see §14D.4) |
| `manifest.json` | SHA-256 per file, a hash chain over the ordered file list, Warden version, timestamp, optional detached signature |

### 14D.3 Completeness Report

Computed, not asserted: % of agent-attributed changes with complete provenance (prompt, checks, verdict); % of commits with a Verdict; sessions with missing events; scanners required-but-not-run; periods when core was down; unattributed (`unknown`) changes. Gaps are listed and never hidden.

### 14D.4 Control-Theme Mapping

A user-editable `compliance/mappings/default.yml` links evidence types to **generic control themes** (change management and approval, access/least privilege, secure development, supply chain integrity, logging and traceability, secret handling). Users may add their own framework identifiers; Warden ships **no** claims about satisfying any specific framework's numbered controls. Output is labelled "informational mapping".

### 14D.5 Integrity & Verification

- `manifest.json` lists `{path, sha256, bytes}` and `chainHash[i] = sha256(chainHash[i-1] || path || sha256)`; the final chain hash is the pack fingerprint.
- Optional detached **Ed25519 signature** using a user-supplied key (`warden.evidence.signingKeyPath`); keys never leave the machine and are never stored in `.warden/`.
- `warden evidence verify <dir>` recomputes hashes and the chain, validates the signature if present, and exits nonzero on any mismatch, extra, or missing file.

### 14D.6 UX

`Warden: Export Evidence Pack` wizard (range, redaction level, include/exclude sections) → progress → open `summary.md`; Evidence panel lists packs with verification status and fingerprint; "Copy fingerprint" for external anchoring. Redaction: reuse the shared redactor; paths can be pseudonymized on request.

---

## 15. M11 — Verdict (P0)

### 15.1 Inputs

Compliance violations (M2/M1/M9), Behavior risk (M3), Red Team results (M8), Territory state (M6), Ghost predictions (M7), CI predictions (M10), agent trust level and policy (M5), provenance completeness (M4: any unattributed agent-like changes), security findings (M14, new and attributed), supply chain flags (M15), context guard events and output-leak scans (M16).

### 15.2 Decision Logic (deterministic, explainable)

1. **BLOCK** if: any open `critical` violation; any `error` violation not waived; behavior risk ≥ 70; red-team failure of severity ≥ high; territory hard conflict; policy denial; a **new** scanner finding mapped to `critical` or `error` introduced by the change and not waived; a confirmed secret in the diff, commit message, or recorded agent output; a tripped canary; an SBOM integrity-changed or non-registry-source dependency.
2. **REVIEW** if: any `warn`; behavior risk 30–69; any red-team failure of lower severity; CI prediction `high`; Ghost predicts ≥ 1 high-confidence flag; agent level ≤ L1 for the touched area; incomplete checks (module skipped/unavailable, including a `required` scanner that did not run — always disclosed); a new `warn`-level scanner finding; a new dependency with install scripts or a license-policy violation; Context Guard denied-read attempts in the session.
3. **SHIP** otherwise.

`VerdictScore` (0–100) is a display convenience: 100 − weighted penalties; the **decision comes from the rules above**, not the score. Each Verdict stores `inputs_json` (module outputs + versions) and `explain_json` (ordered reasons with links to evidence). The card shows *"Checks run: 7 of 9; skipped: CI Foresight (no workflows), Ghost (no reviewer)"*.

### 15.3 Surfaces

Dashboard card, status bar badge, MCP tool `warden_get_verdict`, markdown export (PR comment) via `Warden: Copy Verdict as Markdown`, `warden verdict --range <r> --format md|json` CLI, and CI exit code (nonzero on BLOCK).

---

## 16. M12 — Tribunal (P2)

For REVIEW/BLOCK changes the user can open **Tribunal**: three panes assembled from existing data (no new analysis): **Prosecution** (violations, behavior findings, red-team failures, Ghost predictions with evidence), **Defense** (passing checks, agent trust history, waived items, mitigations), **Judge** (the Verdict logic walkthrough showing which rule triggered the decision and what would flip it). Optional LLM narration is strictly derived from structured data and labelled "Narrated". Provide "What would make this SHIP?" with a concrete checklist.

---

## 17. MCP Server (`warden mcp`)

Stdio server using the official MCP SDK. Tools (all inputs/outputs Zod-defined; descriptions written for agents so they know *when* to call them):

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `warden_get_constitution` | `{ scope?: paths[] }` | rules (id, title, remediation, severity) applicable to scope | Agent reads the rules before planning |
| `warden_get_autonomy` | `{}` | level, policy, what needs approval | Agent self-regulates |
| `warden_check_intent` | `{ task, plannedPaths[], plannedChanges?, plannedDeps? }` | decision, violations, notes, checkpointId, next_steps | Gate before writing |
| `warden_check_diff` | `{ diff? , paths? }` | decision, violations, DNA deviations | Gate after writing, before finishing |
| `warden_claim_territory` / `warden_release_territory` / `warden_list_territories` | per §12 | claim status, conflicts | Coordination |
| `warden_report_event` | `{ type, payload }` | ack | Flight Recorder for agents without hooks |
| `warden_report_alternative` | `{ description, reason }` | ack | Rejected alternatives |
| `warden_shadow_run` | `{ baseRef?, candidate? }` | runId + BehaviorReport summary | Behavior diff |
| `warden_red_team` | `{ paths? }` | report summary | Adversarial pass |
| `warden_predict_ci` | `{ diff? }` | CiPrediction[] | CI foresight |
| `warden_request_approval` | `{ summary, risk }` | pending approval id (human responds in VS Code) | Human-in-the-loop |
| `warden_get_verdict` | `{ target? }` | Verdict | Final check before declaring done |
| `warden_get_security_findings` | `{ scope?: paths[], onlyNew?: boolean }` | sanitized findings with severity, rule, location, remediation hint | Agent fixes scanner findings before finishing |
| `warden_get_sbom_delta` | `{ target? }` | added/changed/removed components with risk flags and attribution | Agent reviews dependency impact |
| `warden_check_context_access` | `{ paths[], op: 'read'|'search'|'exec' }` | per-path decision (`allow`/`deny`/`redact`), reason | Gate before reading sensitive files |
| `warden_read_file_redacted` | `{ path }` | file content with secret values masked, redaction count | Safe way to read config/env structure |

**Agent instruction block** (written to `AGENTS.md`/`CLAUDE.md` section on `Warden: Install Agent Integration`, with user approval): "Before planning, call `warden_get_constitution` and `warden_get_autonomy`. Before writing, call `warden_claim_territory` and `warden_check_intent`. After writing, call `warden_check_diff`, then `warden_get_verdict`. Never read `.env`, key, or credential files directly; use `warden_check_context_access` and `warden_read_file_redacted`. Before finishing, call `warden_get_security_findings` and `warden_get_sbom_delta` and address new findings. Never finish with an unresolved BLOCK." The installer also writes MCP registration for supported agents and hook config (Claude Code `.claude/settings.json` hooks); **verify current config syntax against each agent's official docs while implementing**, and print copy-paste instructions for agents it cannot configure automatically.

---

## 18. CLI (`warden`)

`warden init` (create `.warden/`, ignore files), `warden forge`, `warden check [--range|--staged]`, `warden hook <pre-write|pre-commit>`, `warden mcp`, `warden verdict`, `warden shadow`, `warden bench`, `warden export-session`, `warden sarif import|run`, `warden sbom`, `warden evidence export|verify`, `warden guard check`, `warden canary install|status`, `warden doctor` (checks Node, Docker, git, gh, LLM config). All commands support `--json`.

---

## 19. Recommendations Engine

Generates actionable, evidence-backed suggestions stored in `recommendations`, e.g.: "WR-006 was violated 7 times by agent X in `src/orders`; add a scaffold hint to CLAUDE.md?" (proposes text), "Rule WR-014 has 4 false positives; narrow scope?", "DNA pattern `asyncHandler` 94% — approve as rule?", "Docs conflict C-3 unresolved; 3 rules blocked", "Add `telemetry.unknown.io` to expected egress or remove the call". Each has an action (`approve_rule`, `edit_rule`, `amend_doc` (opens diff), `set_expected_egress`, `change_policy`) executed only on user click. Ranked by impact (violation frequency × severity).

---

## 20. VS Code Extension & Mission Control

### 20.1 Commands (`warden.*`)

`forgeConstitution`, `reviewRules`, `openMissionControl`, `showVerdict`, `runShadow`, `runRedTeam`, `predictCi`, `mineDna`, `addReviewer`, `preReview`, `revertToCheckpoint`, `waiveViolation`, `setAutonomyLevel`, `installAgentIntegration`, `configureShadow`, `copyVerdictMarkdown`, `restartCore`, `showOutboundLlmLog`, `loadDemoData`, `importSarif`, `runScanners`, `generateSbom`, `editContextGuard`, `installCanaries`, `exportEvidencePack`, `verifyEvidencePack`.

### 20.2 Settings (`warden.*`)

`llm.provider`, `llm.model`, `llm.baseUrl`, `llm.offlineMode`, `llm.neverSendGlobs`, `llm.retainPrompts`, `enforcement.saveGate` (off/warn/revert-offer), `enforcement.severityThreshold`, `trust.ceilingLevel`, `trust.defaultLevelUnknownAgent`, `shadow.useDocker`, `ci.enableGhSecretNames`, `ghost.enabled`, `redteam.registryLookups`, `retention.days`, `ui.demoBadge`, `security.scanners`, `security.failOnSeverity`, `sbom.registryLookups`, `contextGuard.mode`, `evidence.signingKeyPath`, `evidence.redactionLevel`. API keys use `SecretStorage` commands, never settings.

### 20.3 Core → UI Notifications

`state/constitution`, `state/score`, `event/violation`, `event/verdict`, `state/autonomy`, `state/territory`, `progress/shadow`, `state/provenance`, `state/ci`, `state/ghost`, `state/redteam`, `state/recommendations`, `state/security`, `state/sbom`, `event/context-guard`, `state/evidence`, `log/llm`. Payloads are Zod-typed; the dashboard keeps a Zustand store hydrated by `getSnapshot()` then patched by notifications.

### 20.4 Mission Control Layout (single page, responsive grid)

1. **Header strip:** project, constitution version, global Compliance Score, current Verdict badge, offline/LLM indicator, "Demo data" badge when applicable, `Preventive/Detective` guard indicators.
2. **Verdict card (hero):** decision, top 3 reasons, "What would make this SHIP", Copy-as-PR-comment.
3. **Rules panel:** hits/misses table (rule, severity, status, open count, precision), filters, recommendations list with action buttons, conflicts list.
4. **Autonomy dials:** one per agent (level gauge, score, sparkline, last demotion reason, what raises it).
5. **Behavior Diff panel** (cards) with evidence drill-down.
6. **Territory Map** (treemap) + claims timeline.
7. **Provenance/Flight Recorder** timeline with scrub-and-replay.
8. **Red Team** survival meter and attack table.
9. **Ghost** predicted comments with cited evidence.
10. **CI Foresight** DAG (React Flow) with predicted-risk nodes.
11. **DNA** patterns with prevalence bars and counterexamples.
12. **Benchmark** panel: with/without results, run ID/time, scenario list.
13. **Security Signals** (M14): findings table with "Introduced by" chips, scanner status (ran/skipped/failed).
14. **Supply Chain** (M15): dependency table with provenance badges, risk flags, SBOM export.
15. **Context Guard** (M16): per-session "what the agent saw" log, blocked attempts, leak scans, canary status.
16. **Evidence** (M17): packs list, completeness report, verify status, fingerprint copy.
17. **Outbound LLM log** drawer.

Design: dark "mission control" theme with a light-theme equivalent; status = icon + text + color; animations only to convey change (pulse on new violation, dial tween) and respect `prefers-reduced-motion`. Every panel implements `loading`, `empty` (with a call-to-action), `error`, and `stale` states.

---

## 21. Demo Repository & Fixtures (`fixtures/demo-repo`)

"Acme Orders API": Express + TypeScript + Zod + a repository layer on SQLite, with `IDEA.md`, `SPEC.md`, `DESIGN.md`, `CLAUDE.md` seeded with **two deliberate contradictions** (database: Postgres vs MongoDB; auth: session cookies vs JWT) and one stale reference. Includes a `.github/workflows/ci.yml` referencing a secret not present, a baseline test suite, a Reviewer fixture (60 synthetic-but-labelled review comments in `fixtures/reviewer-priya.json`), and scripted **scenarios** (`bench/scenarios/*.ts`, each with seeded agent actions applied as patches):

| ID | Scenario | Expected Warden outcome |
|---|---|---|
| S1 | Docs contradiction | 2 conflicts flagged; rules blocked until resolved |
| S2 | Controller calls DB directly | BLOCK WR-006 (intent or diff) |
| S3 | Change adds outbound call + reads `STRIPE_SECRET` | Rules pass; Shadow Run flags egress + env → REVIEW/BLOCK |
| S4 | Adds hallucinated package + unauthenticated route | Red Team failures |
| S5 | Two agents claim `src/orders` | Hard conflict, second queued |
| S6 | Clean feature following DNA | SHIP; trust increases |
| S7 | Change touching workflow-needed file; missing secret | CI Foresight high-likelihood failure |
| S8 | Critical violation after clean streak | Immediate demotion, 24 h cap |
| S9 | Agent-written line triggers a (fixture) Semgrep-style SARIF injection finding; a pre-existing finding sits elsewhere | New finding attributed to session+prompt; existing finding unattributed; Verdict BLOCK/REVIEW per severity |
| S10 | Agent attempts to read `.env`, then uses the redacted read; separately a secret appears in a command output | Preventive deny + redacted read logged; output leak flagged as critical |
| S11 | Agent adds a dependency with an install script and a name resembling a popular package | SBOM delta attributes it to the agent; flags install script + slopsquat suspicion |
| S12 | Evidence export over S1–S11, then tamper with one file | `warden evidence verify` passes before and fails after tampering |

All fixtures are marked `fixture: true` in metadata; "Load Demo Data" imports recorded sessions through the *same* ingestion paths as live data.

---

## 22. Benchmark Harness (`bench/`)

`pnpm bench` runs each scenario in two modes: **without Warden** (agent actions applied directly; checkers run in *measurement-only* mode to count what would have been violations) and **with Warden** (agent adapter obeys Gatekeeper decisions via a scripted "compliant-on-feedback" agent policy). Agents are **simulated deterministic scripts** by default (so results are reproducible) and optionally real agents via a `--live` adapter.

Metrics (all computed, stored in `bench_runs`): seeded-violation catch rate, false-positive rate on clean scenarios, behavior-diff detection rate, time-to-verdict, violations reaching the final tree (with vs without), autonomy transitions correctness, Ghost citation validity (must be 100%) and agreement on held-out comments, security-finding attribution accuracy, protected-read block rate, output-leak detection rate, SBOM attribution coverage, and evidence-verification pass/fail on seeded tamper tests. Scanner fixtures (SARIF files) are labelled fixtures; benchmarks never claim any real scanner's accuracy. Output: JSON + Markdown report + dashboard panel with run label/time. The README must state that scripted-agent benchmarks measure *Warden's detection and gating*, not any real model's behavior.

---

## 23. Security & Privacy

1. No telemetry or hidden network calls. Allowed outbound: configured LLM provider, optional GitHub (`gh`), optional registry lookups — each toggleable and logged.
2. Redaction before every LLM call; local path and `neverSendGlobs` exclusions; `.env*` never read into prompts.
3. Sandbox isolation per §7; never run repo code on the host except in explicitly labelled `local-reduced` mode with a confirmation dialog.
4. Webview CSP: `default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'`; no `eval`; messages validated with Zod on both sides.
5. `.warden/warden.db`, `.warden/reviewers/`, sessions export are git-ignored by default; exports are redacted.
6. Reviewer data is local, deletable (`Warden: Delete Reviewer Data`), and never leaves the machine except as redacted snippets to the configured LLM when the user runs pre-review.
7. Dependency hygiene: pin versions, `pnpm audit` in CI, minimal dependencies in `probe` (zero runtime deps).
8. Scanner output, SARIF messages, advisory text, and dependency READMEs are **untrusted data**: sanitized, length-capped, escaped, and never passed to an agent or LLM as instructions.
9. Context Guard logs record paths and counts only, never secret values; canary values are stored hashed; evidence signing keys are user-supplied, read at export time only, and never persisted by Warden.
10. Scanner commands run only from `.warden/scanners.yml` entries the user approved (shown with a confirmation on first run), with timeouts, and never with repo-supplied command strings from untrusted PRs.

---

## 24. Observability

`pino` JSON logs to `.warden/logs/` (rotating) with correlation IDs; an in-app "Diagnostics" view shows core health, index stats (files, nodes, edges), last check durations, queue depths. Optional `warden doctor` report. No external metrics endpoints.

---

## 25. Testing Strategy

- **Unit:** every checker with positive/negative fixtures; trust model with property tests (monotonicity: more β never raises score; decay converges to prior); hunk line tracker with fuzzed edits; Verdict logic truth table.
- **Integration:** forge → approve → gate on the demo repo; Shadow Run on baseline/candidate fixtures (Docker-gated tests skipped with a clear message if Docker is absent); MCP tools via an in-process MCP client; territory conflicts with simulated concurrent claims.
- **E2E:** Playwright against the dashboard with a mock core (all panel states); `@vscode/test-electron` smoke for activation, core spawn, command registration, CodeLens.
- **LLM tests:** `MockProvider` with recorded responses; schema-failure and repair-path tests; a "no hallucinated quote" test for assertion extraction.
- **Performance tests:** timing assertions for §CLAUDE.md budgets.
- **Coverage:** ≥ 80% lines for `rules-engine`, `trust`, `analyzers`.

---

## 26. Extensibility & Future (not in v1)

Language adapters (Python via tree-sitter), GitLab CI, additional agent adapters (Cursor, Copilot agent, Gemini CLI, Aider), team sync (opt-in, self-hosted), policy packs, constitution marketplace, PR bot, richer sandbox (eBPF syscall tracing), calibrated CI probabilities from run history.

---

## 27. Spec Conformance Checklist (agent builders: tick before declaring done)

- [ ] Every P0 module implemented with tests and dashboard panels in all states.
- [ ] Every MCP tool in §17 exists with Zod schemas and agent-oriented descriptions.
- [ ] Every rule in the demo constitution cites a real source line; quotes verified.
- [ ] Guards are labelled Preventive/Detective correctly.
- [ ] Verdict lists skipped/unavailable checks.
- [ ] Benchmarks are computed, labelled, and reproducible; no hardcoded results.
- [ ] Offline mode works for all deterministic features.
- [ ] Security & privacy requirements in §23 verified.
- [ ] DevSecOps pack (§14A–14D): scanner findings labelled by scanner vs `Heuristic`; skipped/missing scanners disclosed; attribution never applied to pre-existing findings; SBOM validates against the CycloneDX schema; Context Guard labels Preventive vs Detective; evidence packs verify and fail on tampering; every export carries the "not a certification" disclaimer.
- [ ] Deviations recorded as ADRs.
