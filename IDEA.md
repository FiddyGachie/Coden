# IDEA.md — WARDEN: Mission Control for AI Coding Agents

> Working name: **Warden**. The name has **not** been checked for trademark or marketplace collisions; verify before publishing. Alternatives: Bulwark, Overwatch, Tether.

## 1. One-Line Pitch

**"Give AI agents freedom in proportion to proven behavior."**
Warden turns your project docs into a constitution your agents can't ignore, shows what their code *actually does* before you merge it, records who wrote every line and why, and lets agents earn autonomy through measured track record.

**For security teams:** *the DevSecOps control plane for AI-written code*: governance, provenance, and behavioral evidence that your scanners can't see, plus a tamper-evident evidence pack for auditors. Warden complements SAST/SCA/secret scanners (it ingests their output); it does not replace them.

## 2. The Problem

AI coding agents (Claude Code, Codex, Cursor, Copilot agent, etc.) now write most of the code in vibe-coded and AI-assisted projects. Four problems follow, and no single tool addresses all of them:

1. **Drift.** Agents ignore or reinterpret IDEA/SPEC/DESIGN/CLAUDE docs. The docs are advisory; nothing enforces them.
2. **Opacity.** A code diff tells a vibe coder almost nothing about what the change *does*: new network calls, files written, env vars read, routes added, behavior changed.
3. **No provenance.** Once code lands, nobody knows which prompt produced it, which agent wrote it, what alternatives were rejected, or whether it was ever checked.
4. **Binary trust.** Teams either trust agents fully (dangerous) or approve every edit (exhausting). There is no *earned*, measured middle ground. With several agents running in parallel, they also collide.

## 3. The Vision

A single VS Code extension that is the **control tower** for every agent touching your repo. Not another code generator: a governance, observability, and trust layer. The developer (or vibe coder) sees one dashboard, one Verdict per change (**SHIP / REVIEW / BLOCK**), and one autonomy dial per agent that moves based on evidence.

## 4. The Module Map (all modules are in scope; priority in parentheses)

| # | Module | What it does | Wow moment | Priority |
|---|---|---|---|---|
| M1 | **Constitution Forge** | Ingests IDEA/SPEC/DESIGN/CLAUDE.md + a prompt; detects contradictions *between* docs; compiles a human-readable `CONSTITUTION.md` and a machine-checkable rule set where every rule cites its source line | "Your docs contradict each other on the database, caught before a line of code was written" | P0 |
| M2 | **Gatekeeper** | Real-time enforcement: agents ask permission *before* writing (MCP/hooks); detective fallback on save/commit with checkpoint rollback | Agent tries a forbidden direct DB call, is blocked with the exact rule, self-corrects | P0 |
| M3 | **Shadow Run (Behavior Diff)** | Runs baseline and candidate code in a sandbox and diffs *behavior*: network attempts, file writes, process spawns, env reads, routes, API surface, responses, tests | "Review behavior, not code": an innocent-looking change *attempts an outbound call to an unknown host* | P0 |
| M4 | **Flight Recorder (AI Blame)** | Records agent sessions (prompts, tool calls, rejected alternatives, checks run) and attributes every line to agent+prompt; CodeLens "Why does this exist?" with session replay | `git blame` for the AI era; scrub a timeline to replay how a file came to be | P0 |
| M5 | **Earned Autonomy** | Per agent × task class trust score from measured outcomes drives an autonomy ladder (L0 propose-only → L4 auto-PR) and real permissions | The dial visibly drops after a violation and climbs back with clean runs | P0 |
| M6 | **Territory Map** | Parallel agents declare/are inferred to hold regions of the codebase by intent; live treemap shows claims, overlaps, and impact radius; collisions flagged *before* they happen | Watch five agents work without colliding | P1 |
| M7 | **Reviewer's Ghost** | Learns a reviewer's patterns from past PR comments and pre-reviews AI code, every prediction grounded in cited past comments | "Priya would flag this" with receipts | P1 |
| M8 | **Red Team Twin** | Adversarial pass on each change: hallucinated/slopsquatted packages, secrets, injection, authz gaps, fuzzing, context-poisoning scan | "Survived 14 of 17 attacks", three failures shown live | P1 |
| M9 | **Codebase DNA** | Mines the repo for *implicit* conventions nobody wrote down, with prevalence stats, and proposes them as rules | "94% of handlers use the Result wrapper; the AI's code doesn't" | P1 |
| M10 | **CI Foresight** | Parses CI workflows into a DAG; predicts which jobs a diff triggers, missing secrets/env, untested files *before push*; optional capped self-heal loop | CI failures that never happen | P1 (heal loop P2) |
| M11 | **Verdict** | Aggregates every module into one explainable SHIP / REVIEW / BLOCK decision, exportable as a PR comment | The single card that ties the story together | P0 |
| M12 | **Tribunal** | For high-risk changes, presents prosecutor (violations + red team), defense (passing checks + trust history), and judge (verdict) views | Theatrical, memorable review of a risky change | P2 |
| M13 | **Mission Control** | The React dashboard: compliance score, rule hits/misses/recommendations, autonomy dials, territory map, behavior reports, timelines, CI DAG | Everything live in one screen | P0 |
| M14 | **Security Signal Hub** | Ingests SARIF from Semgrep, CodeQL, Gitleaks, Trivy/OSV and similar scanners (or runs the ones installed), diffs findings baseline vs candidate, and **attributes each new finding to the agent session and prompt that introduced it** | "This SQL injection finding came from agent X, prompt Y, and its autonomy level just dropped" | P1 (quick win; promote if DevSecOps is the judging angle) |
| M15 | **Supply Chain Ledger** | Generates a CycloneDX SBOM from lockfiles with **per-component attribution** (which agent/session/verdict added each dependency) plus delta risk flags: install scripts, license policy, registry changes, major bumps | "Every dependency has a provenance receipt" | P1 |
| M16 | **Context Guard** | Stops agents from reading secrets/credential files into their context (preventive via hooks/MCP where supported), logs what each agent read, scans agent outputs (diffs, commits, command output, CI logs) for leaked secrets; optional canary tokens prove leaks | "What did the agent see? Here is the log, and the `.env` read was blocked" | P1 (canaries P2) |
| M17 | **Compliance Evidence** | One-click, tamper-evident evidence pack: verdicts, approvals, waivers, autonomy history, policy snapshot, SBOM, security findings, context-access log, with a completeness report and generic control-theme mapping | "Audit evidence in one click, with a hash chain" | P1 |

## 4A. DevSecOps Positioning

**Pain points (researched Oct 2026; several figures come from secondary coverage of vendor/academic reports, so re-verify primary sources before quoting them in a pitch):**

- Roughly 45% of AI-generated code samples fail security tests (Veracode GenAI Code Security reports, as summarized by the Cloud Security Alliance).
- About 20% of AI-generated code samples reference packages that don't exist, which attackers exploit by registering those names ("slopsquatting") (USENIX Security 2025 study of 576,000 samples across 16 LLMs, via CSA).
- AI-assisted commits leak secrets at roughly twice the baseline rate (GitGuardian State of Secrets Sprawl 2026, via secondary coverage).
- CVEs formally attributed to AI-generated code rose from 6 (Jan 2026) to 35 (Mar 2026); researchers estimate the true number is 5–10x higher because most AI tools leave no commit metadata (CSA, citing Georgia Tech's Vibe Security Radar).
- Agents themselves can be attacked: researchers have tricked coding agents into running attacker code via poisoned content.
- Commentators describe a shift from "DevSecOps" to "DevSecEng" control points: specification gate, pre-commit secrets detection, SAST as a blocking gate for AI code, human-in-the-loop checkpoint, and an AI code provenance log.

| Pain point | Warden module | Fit |
|---|---|---|
| Hallucinated / slopsquatted packages | M8 Red Team, M15 Supply Chain Ledger, `dependency-allowlist` | Strong |
| Secrets leaking via agents | `no-secrets`, M16 Context Guard (input and output sides) | Strong |
| No provenance for AI code | M4 Flight Recorder, M15 attribution, M17 evidence | Strong |
| Over-privileged agents | M5 Earned Autonomy policies | Strong |
| Unexpected side effects (egress, env reads) | M3 Shadow Run | Strong (rare in other tools) |
| No human checkpoint / policy as code | M2 Gatekeeper approvals, constitution | Strong |
| Poisoned context / prompt injection | M8 context-poisoning scan, M16 | Partial (detection, not prevention of model behavior) |
| Insecure code patterns (SQLi, XSS, crypto) | M14 ingests real scanners; M8 taint-lite is heuristic | Partial; depends on scanners |
| Known-vulnerable dependencies (CVEs) | M14 via OSV/Trivy/npm-audit adapters; M15 flags | Partial; depends on scanners |
| IaC, container, runtime security | Not covered (scanner ingestion only) | Gap by design |
| Audit and compliance evidence | M17 | Strong as evidence, **not certification** |

**What Warden is not:** a SAST/SCA/DAST engine, a runtime protection tool, or a compliance certification. Heuristic findings (Red Team taint-lite) are always labelled `Heuristic`; scanner findings are labelled with the scanner name and version.

## 5. How the Modules Reinforce Each Other (the "flywheel")

```
Docs ──► Constitution Forge ──► rules ──► Gatekeeper (blocks/permits)
Repo history ──► Codebase DNA ──► rules ─┘                 │
                                                           ▼
Agent work ──► Flight Recorder (provenance) ──► Shadow Run (behavior) ──► Red Team (attacks)
                                                           │                      │
                    Reviewer's Ghost (taste) ──────────────┤                      │
                    CI Foresight (pipeline) ───────────────┤                      │
                                                           ▼                      ▼
                                                   VERDICT  ◄──────────  Trust Ledger ──► Earned Autonomy ──► new permissions for Gatekeeper
                                                           │
                                       Territory Map ◄─────┘  (prevents parallel-agent collisions upstream of all of this)
```

Outcomes of every check feed the Trust Ledger; the ledger sets the autonomy level; the level changes what Gatekeeper permits. The loop is the product.

## 6. Target Users

- **Vibe coder / solo builder** who can't audit diffs: needs behavior-level review, guardrails, and plain-language explanations.
- **Team lead running several agents in parallel:** needs territory control, provenance, and a trust model.
- **Staff engineer / reviewer** drowning in AI-generated PRs: needs pre-review in their own voice and a Verdict to triage.
- **Hackathon judge / evaluator:** needs a live, visual, verifiable demo (see §9).
- **DevSecOps / AppSec engineer and compliance owner:** needs provenance for AI-written code, scanner findings tied to the agent that introduced them, supply-chain receipts, controls on what agents can read, and audit evidence.

## 7. Differentiation (honest competitive read)

Researched Oct 2026; the space is crowded, so differentiation comes from *integration* and *measured trust*, not any one feature.

| Existing | What it does | Where Warden differs |
|---|---|---|
| GitHub Spec Kit | Spec-driven workflow with a `constitution.md` of project rules | Warden *compiles* and *enforces* constitutions in real time and detects cross-doc conflicts; it also reads a Spec Kit constitution as an input |
| Kiro (AWS) | Spec-driven IDE with agent hooks | Warden is an extension, agent-agnostic, and adds behavior diff + trust |
| Tessl | Spec-anchored development | Warden does not generate from specs; it governs any generator |
| Cladding, NotarAI, PCP | Drift detection / commit gating against specs | Warden adds machine-checkable cited rules, sandbox behavior diff, provenance, and earned autonomy in one UI |
| CircleCI / Datadog / Semaphore / GitHub MCP servers; OpenX-style self-healing projects | Give agents CI visibility and post-failure repair | Warden is *pre-push* and cross-cutting (CI Foresight is one module) |
| SAST/SCA/secret scanners (e.g. Semgrep, CodeQL, Gitleaks, Trivy, OSV-Scanner) | Find vulnerabilities, vulnerable dependencies, and leaked secrets | Warden does not compete: it ingests their SARIF and adds *who introduced it* (agent/prompt/session), behavior evidence, agent autonomy, and audit packaging |

Claims that are **unverified** and must be re-checked before pitching as "first": a polished VS Code extension combining all of the above; pre-push CI prediction for agents; earned-autonomy ladders driven by measured outcomes. Pitch the *combination and the measurements*, not "nobody has done this."

## 8. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope is huge | Strict P0/P1/P2 cut line; Verdict + Mission Control unify even partial modules; TypeScript/Node only |
| Rules extracted from vague docs are vague | Show per-rule confidence; require approval before enforcement; deterministic checker types first |
| False positives destroy trust | Severity tiers, per-rule precision tracking, one-click "mark false positive" feeding rule tuning |
| LLM judge inconsistency | LLM only for hybrid/semantic rules; cached; cited; never the sole basis of a BLOCK on its own unless the user opted in |
| Enforcement only works for cooperating agents | Label guards Preventive vs Detective; checkpoint rollback for detective mode |
| Sandbox flakiness during demo | Cached images, seeded deterministic scenarios, pre-recorded fallback clearly labelled "replay" |
| Reviewer impersonation / privacy concerns | Local-only profile, explicit opt-in per reviewer, framed as a model of review patterns not the person, every prediction cites real past comments |
| Autonomy scores gamed or noisy | Bayesian lower-bound scoring, minimum sample sizes, time decay, hard demotion on critical events |
| Security teams see Warden's heuristics as weaker than real scanners | Heuristics labelled; ingest Semgrep/CodeQL/Gitleaks/Trivy SARIF; never claim scanner-grade coverage |
| Context Guard only prevents reads for cooperating agents | Label Preventive vs Detective; output scanning and canary tokens catch leaks after the fact |
| Evidence pack mistaken for compliance certification | Explicit disclaimers in every export; mapping is informational; recommend external anchoring (protected branch/WORM storage) for tamper-evidence |
| Scanner output or SARIF text carries prompt injection | Treated as untrusted data; sanitized; never fed to an agent as instructions |

## 9. The Hero Demo (≈ 3 minutes, all steps reproducible via `bench/` scenarios)

1. **Docs in.** Drop IDEA/SPEC/DESIGN/CLAUDE.md of the demo repo. Constitution Forge flags 2 contradictions (database choice; auth strategy). Resolve them; ~14 rules compile, each citing its source line.
2. **Agent blocked.** Ask an agent to "add a payments endpoint." It tries a direct DB call from a controller; Gatekeeper blocks with `WR-006` and the DESIGN.md line. The agent self-corrects.
3. **Behavior Diff.** The "fixed" change passes the rules, yet Shadow Run shows it *attempted an outbound call to `telemetry.unknown.io`* and read `STRIPE_SECRET` (neither in the spec). Verdict: REVIEW.
4. **Red Team.** Twin flags a hallucinated package and one unauthenticated route; "survived 14/17".
4b. **DevSecOps layer.** A Semgrep-style SARIF import shows a new injection finding *attributed to the agent session and prompt that wrote that line*; the SBOM shows which agent added the suspicious dependency and that it has an install script; Context Guard shows the agent's attempt to read `.env` was blocked and the redacted read it used instead.
5. **Territory.** A second agent starts on the same module; the map lights up and the second agent is queued.
6. **Provenance.** Click any line: CodeLens shows the prompt, agent, rejected alternatives, rules checked; scrub the replay.
7. **Ghost + CI.** Reviewer's Ghost predicts two review comments with cited history; CI Foresight predicts the deploy job will fail on a missing secret.
8. **Trust.** The agent's autonomy dial dropped to L1 after the violation; after three clean runs it climbs. Final Verdict: SHIP with an explanation.
9. **Proof.** Benchmark panel: same 6 tasks with vs without Warden, real measured violation counts and time-to-clean, with run ID.
10. **Evidence.** Export an evidence pack and run `warden evidence verify`: passes; modify one file and it fails.

## 10. Success Metrics (all measured by `bench/`, never asserted)

- Violation catch rate on seeded violations (target ≥ 90%, report actual).
- False-positive rate on seeded clean changes (target ≤ 10%, report actual).
- Behavior Diff catches seeded side-effects (egress/file/env) (target ≥ 90%).
- Median time from agent write to Verdict (deterministic path ≤ 10 s on demo repo).
- Autonomy dial correctly demotes on critical events (100% of seeded cases).
- Reviewer's Ghost: share of predicted comments that cite real history (must be 100%), and agreement with held-out real comments (report actual).
- Security Signal Hub: share of seeded new findings correctly attributed to the introducing session (target ≥ 95%); existing findings never wrongly attributed to an agent (target 100%).
- Context Guard: share of seeded protected-file reads blocked on cooperating agents (target 100%); seeded secrets in agent output detected (target ≥ 95%).
- Supply Chain Ledger: attribution coverage of dependency additions (target 100% for events seen by Warden) and SBOM schema validity (100%).
- Evidence pack: `warden evidence verify` passes on untampered packs and fails on any modified file (100% on seeded tamper tests).

## 11. Non-Goals

- Not a code generator or autocomplete.
- Not a replacement for human review of security-critical code.
- Not a SAST/SCA/DAST engine or runtime protection tool; it ingests scanner output.
- Not a compliance certification; evidence packs are supporting material for auditors.
- No hosted service, accounts, or telemetry in v1.
- No languages beyond TypeScript/JavaScript in v1 (architecture leaves room).
- No auto-merge to protected branches without explicit user configuration.

## 12. Naming of Artifacts

`CONSTITUTION.md` (human-readable, committed), `.warden/constitution.rules.json` (machine rules), `.warden/warden.db` (local state, git-ignored), `.warden/shadow.yml` (Shadow Run workload config), `.warden/policies.yml` (autonomy policy overrides), `.warden/reviewers/` (local reviewer profiles, git-ignored), `.warden/scanners.yml` (scanner commands/SARIF paths), `.warden/context-guard.yml` (protected paths and modes), `.warden/sbom/` (CycloneDX output), `.warden/evidence/<id>/` (evidence packs).
