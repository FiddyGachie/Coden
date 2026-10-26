# Coden

Coden is a local proof of concept for reviewing AI-generated code changes. It turns a small project constitution into active rules, checks a pasted change, then returns a SHIP, REVIEW, or BLOCK verdict with evidence and a suggested correction.

## Current implementation

The current POC implements the first part of the product loop described in `IDEA.md` and `SPEC.md`: constitution rules → Gatekeeper check → explainable verdict. It includes direct-database, credential, and payment-route authentication checks, a Constitution Forge UI (T3.8 — rules approval, conflict resolution, compliance scoring), and an MCP server package scaffold. The full Warden roadmap in `TASKS.md` remains a future implementation plan; its unchecked tasks are not represented as completed.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @coden/dashboard dev
```

See [QUICK_START.md](QUICK_START.md) for the fastest reliable way to run and verify Coden.

### VS Code demo

Run `pnpm --filter coden-vscode build`, launch this repository with VS Code's **Run Extension** debugger, then run **Coden: Open Mission Control**. The dashboard is the same Vite build used by the browser preview; inside VS Code it sends a scan request through `postMessage` to the extension host, which forwards it to the local Coden core over JSON-RPC and returns the verdict to the dashboard.

Warden does not send telemetry. Demo fixtures are explicitly labelled and are not production findings.

## What Coden does today

Coden is a local, deterministic code-change reviewer with two main surfaces:

**Change scanner** — a developer or AI agent submits a proposed TypeScript change and receives an evidence-backed **SHIP**, **REVIEW**, or **BLOCK** verdict. The current proof of concept demonstrates three rules: direct database access in a controller, potential secrets, and payment routes without visible authentication middleware.

**Constitution tab** — a full rule-review and approval UI backed by a Zustand store (`constitution-store`). It shows proposed rules derived from project documentation, surfaces documentation conflicts (value mismatches, modality clashes, stale references), and enforces the constraint that rules blocked by an unresolved conflict cannot be approved. It also displays a live **compliance score** (SPEC §5.6) with per-file breakdown and a sparkline trend across successive scans.

The same React/Vite dashboard is available in two places:

- **Browser preview** for quick UI development and demonstration.
- **VS Code Mission Control** for the end-to-end local product flow, connected to the extension host and Coden core.

## Architecture

```text
Vite React dashboard
        │ postMessage
        ▼
VS Code extension host
        │ JSON-RPC request over a local child-process channel
        ▼
Coden core (Node/TypeScript)
        │ deterministic rule engine
        ▼
Explainable verdict and findings
        │ postMessage response
        ▼
Dashboard verdict card
```

No pasted source is sent to a remote service by this proof of concept. The extension starts the local core when the dashboard requests a check.

## Package layout

| Package | Description |
| --- | --- |
| `apps/dashboard` | Vite + React dashboard (browser preview and VS Code webview) |
| `apps/extension` | VS Code extension host (activation, core launcher, webview bridge) |
| `packages/rules-engine` | Deterministic checkers, compliance scoring (`computeComplianceReport`), and constitution rendering |
| `packages/shared` | Shared Zod schemas, error codes, and inferred TypeScript types |
| `packages/mcp-server` | MCP server scaffold (`@warden/mcp-server`) — initial package structure |

## Dashboard components (T3.8 / T3.9)

| Component | Purpose |
| --- | --- |
| `constitution-store` | Zustand slice — rules lifecycle (proposed / approved / disabled), conflict resolution, inline edit, bulk approve, blocked-rule enforcement |
| `ConflictPanel` | Per-conflict resolution UI — keep A / keep B / custom note / acknowledge |
| `RulesTable` | Interactive rules table — per-rule approve, disable, reset, inline edit, bulk approve, blocked indicator |
| `ComplianceWidget` | Live compliance score ring, per-file bar chart, sparkline trend; derived from approved rules × scan findings using the SPEC §5.6 formula |

## Compliance scoring (`packages/rules-engine`)

`compliance-score.ts` implements the SPEC §5.6 formula:

```
score = 100 × (1 − Σ(w_s × open_violations) / max(1, Σ(w_s × applicable_checks)))
```

Severity weights: `info=0.1`, `warn=0.5`, `error=1`, `critical=3`. The module exports `computeComplianceReport` (overall + per-file + per-module + per-agent), `snapshotFromReport` for daily archiving, `filterSnapshots`, and `scoreDelta`.

## Requirements

- Node.js 20 or newer (Node 24 is used in CI)
- pnpm 10.8 or newer (`corepack enable` is a convenient way to install it)
- VS Code for the extension demo

## Install

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
```

For a normal development verification run:

```powershell
pnpm typecheck
pnpm test
pnpm lint
```

## Run the browser dashboard

```powershell
pnpm --filter @coden/dashboard dev
```

Open the URL Vite prints (normally `http://localhost:5173`). The dashboard opens on the **Constitution** tab seeded with demo rules and conflicts. Switch to the **Change scanner** tab and use **Load blocked example** / **Load passing example** to see verdicts. The browser build uses the local demonstration analyzer so it remains useful without VS Code.

## Build and run the VS Code extension

Build every piece required by the extension:

```powershell
pnpm --filter coden-vscode build
```

This command builds the core, compiles the Vite dashboard into `apps/extension/media`, and compiles the extension host into `apps/extension/dist`.

Then open the repository folder in VS Code:

1. Open **Run and Debug**.
2. Choose **Run Extension** and press `F5`. VS Code opens an Extension Development Host window.
3. In that window, open the Command Palette with `Ctrl+Shift+P`.
4. Run **Coden: Open Mission Control**.
5. On the **Constitution** tab, resolve any conflicts, then approve rules.
6. Switch to **Change scanner**, paste a change, and select **Run Coden check**.

Try this deliberately blocked example:

```ts
export const createOrder = () => db.query("insert into orders values (...)");
```

Mission Control should show **BLOCK** with rule `WR-006`, the file/line evidence, and a suggested correction. The compliance score on the Constitution tab will update to reflect the violation.

## How the extension connects to the dashboard

The dashboard is not a separate deployed website in the extension demo. Vite packages it as static files under `apps/extension/media`. The extension opens those local files in a VS Code webview with scripts enabled only for that webview and a restrictive content security policy.

When you choose **Run Coden check**:

1. The React dashboard posts a typed `coden/scan-change` message to VS Code.
2. The extension validates the message shape and forwards the source and proposed path to the local Node core.
3. The core evaluates its deterministic rules and creates a verdict plus violations.
4. The extension posts `coden/scan-result` back to the webview.
5. The dashboard renders the decision, score, rule identifiers, evidence, and remediation. The ComplianceWidget on the Constitution tab recalculates against the new findings.

This keeps browser UI responsibilities separate from analysis responsibilities: the webview renders; the extension bridges; the core evaluates.

## Extension packaging note

The repository is ready to launch with VS Code's extension debugger. A distributable `.vsix` package has not been added yet. For a local installed package, add `@vscode/vsce`, define the extension's publisher and repository metadata, then run `vsce package` from `apps/extension`. The debug route above is the supported POC installation method.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `pnpm` is not recognized | Run `corepack enable`, restart the terminal, then retry. |
| Mission Control opens but has no styling | Run `pnpm --filter coden-vscode build` again; it regenerates `apps/extension/media`. |
| The check reports a core error | Rebuild with the same command, stop and relaunch the Extension Development Host, then try again. |
| Browser and VS Code results differ | Expected for now: the browser is a standalone demo analyzer; VS Code uses the core-backed rule path. |
| Constitution tab shows no rules | The store is seeded on mount from `constitution-demo-data.ts`. If the tab is empty, check the browser console for import errors. |

See [QUICK_START.md](QUICK_START.md) for an accelerated first-run checklist.
