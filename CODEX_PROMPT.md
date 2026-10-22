# CODEX_PROMPT.md — Prompts to Build WARDEN with Codex

## How to use

1. Create an empty repo. Add `CLAUDE.md`, `IDEA.md`, `SPEC.md`, `TASKS.md` at the root, and **copy `CLAUDE.md` to `AGENTS.md`** (Codex reads `AGENTS.md`).
2. Give Codex **Prompt 1 (Kickoff)**. Let it finish the phase it stops at.
3. Review the status report. If it passes, give **Prompt 2 (Continue)** with the next phase. Repeat.
4. Use **Prompt 3 (Audit)** after each priority tier (P0, P1) and **Prompt 4 (Fix)** when something fails.
5. Work in a branch; let Codex commit per task. Large phases may need to be split across several sessions: that is expected.

---

## Prompt 1 — Kickoff (paste as-is)

```
You are building WARDEN, a VS Code extension that acts as mission control for AI coding agents.

Before writing any code, read these files in this order and treat them as the source of truth:
1. AGENTS.md (identical to CLAUDE.md) — rules, stack, workflow, anti-patterns, definition of done
2. IDEA.md — product vision, modules M1–M13, hero demo, success metrics
3. SPEC.md — full technical specification
4. TASKS.md — the phased build plan with acceptance criteria

Rules of engagement:
- Follow the execution workflow in AGENTS.md §6 exactly: contract (Zod) first, core logic + tests, wire to core, then UI, then fixture/scenario, then verify with the gate commands in §9.
- Work through TASKS.md in order, starting at Phase 0. Do not start a phase until the previous phase's PHASE GATE passes.
- Respect the priority cut line: finish all P0 phases (0 through 10) to a polished standard before touching any P1 module. P1 = Phases 11–15 and 15A–15D (DevSecOps pack); P2 = Phase 16 and items marked P2.
- Honesty is a hard requirement: never fabricate metrics, scores, benchmark numbers, or findings. All dashboard numbers must come from recorded events or real measurements. Demo/fixture data must be labelled as such in code and UI.
- Deterministic analysis first (AST, graphs, sandbox measurements). Use LLMs only where SPEC says, always schema-validated, always with evidence, always behind the redaction layer. All deterministic features must work in offline mode.
- Do not substitute technologies from the stack table without writing an ADR in docs/adr/. Do not add Rust, extra databases, telemetry, or a second UI framework.
- If SPEC is ambiguous, choose the simplest option consistent with AGENTS.md §2, record a short ADR, and continue. If something in SPEC is infeasible (for example, an agent lacks hook support), implement the detective fallback, label it in the UI, and log an ADR. Where SPEC says to verify an external tool's current config syntax, check its official documentation instead of guessing.
- Commit after each completed task using Conventional Commits. Tick the task's checkbox in TASKS.md when its acceptance criteria pass.

Your first assignment: complete Phase 0 and Phase 1 of TASKS.md (scaffolding, shared contracts, database, logging/redaction, JSON-RPC, extension skeleton, dashboard skeleton, demo repository, AST index, diff model, hunk tracker, file watcher).

When you reach the end of Phase 1, STOP and print a status report with: tasks completed, gate commands output summary, any failing or deferred items, ADRs written, and any questions. Do not continue past the gate without being told to.
```

---

## Prompt 2 — Continue (replace the bracketed values)

```
Continue building WARDEN. Re-read AGENTS.md, SPEC.md, and TASKS.md, then check the current repo state (git log, TASKS.md checkboxes, docs/adr/).

Assignment: complete [Phase X through Phase Y] of TASKS.md, following AGENTS.md §6 for every task and the acceptance criteria exactly.

Constraints:
- Do not weaken or delete tests to make them pass. If a test is wrong, fix it and explain why in the commit message.
- Do not hardcode results to satisfy scenarios; scenarios must pass because the real implementation works.
- Keep the extension host thin; heavy work belongs in warden-core or the sandbox.
- Every new UI panel must implement loading, empty, error, and stale states and be keyboard accessible.
- Run the full gate commands (AGENTS.md §9) before each commit to main.

At the PHASE GATE, STOP and print a status report (completed, failing, deferred, decisions/ADRs, risks, questions).
```

Suggested sequence of assignments:

| Session | Assignment |
|---|---|
| 1 | Phases 0–1 (Prompt 1) |
| 2 | Phases 2–3 (LLM layer, Constitution Forge) |
| 3 | Phase 4 (Gatekeeper, MCP, editor integration) |
| 4 | Phases 5–6 (Flight Recorder, Earned Autonomy) |
| 5 | Phase 7 (Shadow Run) |
| 6 | Phases 8–10 (Verdict, Mission Control, benchmarks) → run Prompt 3 (P0 audit) |
| 7 | Phase 11 (Territory Map) and Phase 12 (Red Team Twin) |
| 8 | Phases 13–15 (Ghost, DNA, CI Foresight) → run Prompt 3 (P1 audit) |
| 8b | Phases 15A–15D (Security Signal Hub, Supply Chain Ledger, Context Guard, Compliance Evidence) → Prompt 6. If the audience is security-focused, run this right after session 6 |
| 9 | Phase 16 (Tribunal, adapters, packaging, docs) |

---

## Prompt 3 — Audit (after each priority tier)

```
Audit the WARDEN repository against SPEC.md and TASKS.md without making changes yet.

1. For every task in the completed phases, verify its acceptance criteria by running or reading the relevant tests. List any task marked done whose criteria are not actually met.
2. Search for violations of AGENTS.md §8 anti-patterns: use of `any`, regex used to parse code/YAML, hardcoded demo results or benchmark numbers, unlabelled fixture data, extension-host heavy work, un-validated boundaries, missing loading/empty/error states, secrets in logs, network calls outside the allowed set, scanner/SARIF text treated as instructions, heuristic findings unlabelled, and any compliance-certification claims.
3. Run `pnpm install --frozen-lockfile && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm bench:smoke` and report results.
4. Run the hero demo (IDEA.md §9) for the steps available in this tier, using the scenarios in bench/, and report what works, what is flaky, and what is missing.
5. Verify SPEC §27 conformance checklist item by item.
6. Produce docs/AUDIT-<tier>.md with: findings ranked by severity, evidence (file paths/test names), and a proposed fix plan mapped to TASKS.md items.

Be strict and specific. If you cannot verify something, say so rather than assuming it passes.
```

---

## Prompt 4 — Fix (use after an audit or a failing gate)

```
Read docs/AUDIT-<tier>.md (or the failing output below). Fix the listed issues in priority order, starting with correctness and honesty problems (fabricated or hardcoded numbers, unlabelled fixtures, false "Preventive" labels, tests that don't test what they claim), then security/privacy, then missing states and accessibility, then performance budgets.

For each fix: add or correct a test that would have caught it, keep changes minimal, commit with a Conventional Commit message, and update the audit file with a "Resolved" note and commit hash. Run the full gate commands before finishing and print a summary of what was fixed, what remains, and anything you disagree with and why.

[paste failing output or list of audit items here]
```

---

## Prompt 5 — Demo Rehearsal (final)

```
Prepare WARDEN for a live demo.

1. Write docs/DEMO.md: a timed, step-by-step script of the hero demo in IDEA.md §9, mapping each step to its scenario ID (S1–S8) and the exact command or UI action to trigger it, with expected on-screen results.
2. Add a `pnpm demo:reset` script that restores the demo repo, clears .warden state, preloads the cached Docker images, and loads demo data (clearly badged).
3. Add a clearly labelled "Replay" fallback for the Shadow Run and agent-session steps (pre-recorded outputs from real runs, shown with a "Replay" badge) in case Docker or the network fails during the demo.
4. Run the full demo three times from reset and report timing and any flakiness. Fix flakiness at the root; do not mask it.
5. Run `pnpm bench` and make sure the benchmark panel shows the latest real run with its run label and timestamp.

Do not add features. Stability, honesty, and clarity only.
```

---

## Prompt 6 — DevSecOps Pack (Phases 15A–15D)

```
Read AGENTS.md, SPEC.md §14A–14D, and TASKS.md Phases 15A–15D, then check repo state.

Assignment: implement Phases 15A (Security Signal Hub), 15B (Supply Chain Ledger), 15C (Context Guard), and 15D (Compliance Evidence), in that order, following AGENTS.md §6 for every task.

Hard requirements:
- Do not bundle or reimplement SAST/SCA engines. Ingest SARIF and run only scanners the user has installed and approved in .warden/scanners.yml. Disclose skipped/missing scanners in the Verdict.
- Label findings as `Heuristic` or by scanner name/version. Existing findings must never be attributed to an agent.
- Treat SARIF messages, advisory text, and dependency READMEs as untrusted data: sanitize, cap, escape, and never pass them to an agent or LLM as instructions. Include a prompt-injection test fixture.
- Context Guard must label each control Preventive or Detective; logs contain paths and counts only, never secret values. For agent hook configuration, verify current syntax in each agent's official documentation and record sources in an ADR.
- Evidence packs must be verifiable (`warden evidence verify`), fail on any tampering, and carry the "supporting material, not a certification" disclaimer. Do not claim compliance with any specific framework's controls.
- SARIF fixtures are labelled fixtures; benchmarks must not claim any real scanner's accuracy.

STOP at the combined PHASE GATE 15A–D and print a status report (completed, failing, deferred, ADRs, risks, questions).
```

---

## Tips for the human operator

- **Keep sessions short and gated.** A single prompt that says "build everything" will produce shallow results. The gates exist so you can catch drift early.
- **Check honesty items yourself** after P0: open the benchmark code and confirm there are no constants standing in for measurements; open the Shadow Run report and confirm the egress finding comes from real probe events.
- **Verify external config syntax** (MCP registration, agent hooks) against each agent's current official documentation; these change often.
- **Name check:** "Warden" is a working name. Search the VS Code Marketplace and trademark databases before publishing.
- **If time runs out:** ship P0 polished. A flawless Constitution → Gate → Behavior Diff → Verdict → Autonomy story beats nine half-working modules.
