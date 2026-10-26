# Quick start

Run Coden locally in two commands from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @coden/dashboard dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Try the full flow

The dashboard opens on the **Constitution** tab seeded with demo rules and conflicts.

1. Resolve the seeded conflicts in the **Conflicts** section (keep A, keep B, or acknowledge).
2. Approve the unblocked rules with **Approve all unblocked** or rule by rule.
3. Switch to the **Change scanner** tab.
4. Select **Load blocked example**. Coden returns **BLOCK** and cites `CDN-001` because the controller calls `db.query`.
5. Switch back to **Constitution** — the compliance score updates and per-file violations appear.
6. Return to **Change scanner**, select **Load passing example**. Coden returns **SHIP**. The compliance score recovers.
7. Paste `router.post('/payments', createPayment)`. Coden returns **REVIEW** and requests authentication middleware.

## Check the project before changing it

```powershell
pnpm --filter @coden/dashboard typecheck
pnpm --filter @coden/dashboard test
pnpm --filter @coden/dashboard build
```

The browser POC is local-only. It does not send the pasted code anywhere.

## VS Code extension demo (real core-backed verdict)

Build the dashboard into the extension and compile the extension host:

```powershell
pnpm --filter coden-vscode build
```

Open this repository in VS Code and select **Run and Debug → Run Extension** (or press `F5`). In the Extension Development Host, run **Coden: Open Mission Control** from the Command Palette.

1. On the **Constitution** tab, resolve conflicts and approve rules.
2. Switch to **Change scanner**. Keep the blocked example or paste a change containing `db.query(`.
3. Select **Run Coden check**.
4. The webview sends the source to the extension host with `postMessage`; the host starts the local Coden core and sends it JSON-RPC; the returned violation and verdict appear in the dashboard. The ComplianceWidget recalculates.

This is local-only. The browser preview remains useful for UI work, but the VS Code webview button performs the end-to-end core-backed demo.

## Complete first-run guide

This guide is for a first-time setup on Windows, macOS, or Linux. It covers both the browser preview and the complete VS Code extension demonstration.

### 1. Prerequisites

Install:

- **Node.js 20+** (Node 24 is the CI target)
- **pnpm 10.8+**
- **Visual Studio Code** for the extension demo

If Node installed Corepack, enable pnpm with:

```powershell
corepack enable
```

Confirm the tools are available:

```powershell
node --version
pnpm --version
```

### 2. Install workspace packages

From the repository root:

```powershell
pnpm install --frozen-lockfile
```

`--frozen-lockfile` ensures the local dependency graph matches the committed project definition. If you intentionally changed a dependency, use `pnpm install` once to regenerate the lockfile.

### 3. Fast browser-only demo

Start Vite:

```powershell
pnpm --filter @coden/dashboard dev
```

Open the address Vite prints. The dashboard starts on the **Constitution** tab seeded with demo rules and conflicts.

#### Constitution tab

| Action | Expected result |
| --- | --- |
| Resolve a conflict (keep A / keep B / acknowledge) | The conflict card gains a "resolved" badge; dependent rules are unblocked. |
| **Approve all unblocked** | All unblocked proposed rules move to `approved` status. |
| **Approve** a single rule | That rule moves to `approved`. |
| **Disable** a rule | Rule is excluded from scoring and enforcement. |
| **Edit** a rule | Inline form allows changing title, severity, and remediation. |

#### Change scanner tab

| Action | Expected result |
| --- | --- |
| **Load blocked example** | **BLOCK** because the change calls `db.query(` directly. |
| **Load passing example** | **SHIP** because the change uses a repository. |
| Paste `router.post('/payments', createPayment)` | **REVIEW** because the payment route lacks visible auth middleware. |

After running a scan, switch back to the **Constitution** tab. The **Compliance score** ring and per-file bar update based on the approved rules and the findings from the scan. The sparkline trend appears after two or more scans.

The browser version is intentionally standalone: it is the quickest way to demonstrate the UX, but it does not start the extension-host/core bridge.

### 4. Build the VS Code demo

Stop the Vite server if it is still running, then run:

```powershell
pnpm --filter coden-vscode build
```

That command performs three actions in sequence:

1. Compiles the Node-based Coden core.
2. Builds the Vite dashboard into `apps/extension/media`.
3. Compiles the extension host into `apps/extension/dist`.

It is important to run this command after dashboard changes; VS Code serves the generated `media` bundle, not the Vite development server.

### 5. Launch the extension in VS Code

1. Open the repository folder in VS Code.
2. Open **Run and Debug** from the Activity Bar.
3. Select **Run Extension**. If VS Code asks you to create a launch configuration, choose the VS Code Extension option.
4. Press `F5` to open an **Extension Development Host** window.
5. In the new window, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).
6. Run **Coden: Open Mission Control**.

Mission Control should render the same visual dashboard as the browser preview and show a note that it is connected to the local Coden core.

### 6. Demonstrate the real extension-to-core route

In Mission Control:

1. On the **Constitution** tab, resolve any conflicts and approve at least one rule.
2. Switch to **Change scanner** and paste this source:

   ```ts
   export const createOrder = () => db.query("insert into orders values (...)");
   ```

3. Select **Run Coden check**.
4. Confirm that the result is **BLOCK** and includes `WR-006` plus a direct-database-access explanation.
5. Switch back to **Constitution** — the compliance score will have dropped and a per-file violation row will appear.
6. Return to **Change scanner** and replace the source with:

   ```ts
   import { ordersRepository } from "../repositories/orders.js";

   export const createOrder = (request: { body: unknown }) =>
     ordersRepository.create(request.body);
   ```

7. Run the check again. The core should return **SHIP** and the compliance score should recover.

### 7. Understand the data flow

```text
Paste source in Mission Control
  → React dashboard posts coden/scan-change
  → VS Code extension receives and validates the message
  → local Coden core runs deterministic rules
  → core returns JSON-RPC verdict and violations
  → extension posts coden/scan-result
  → React dashboard displays evidence and remediation
  → ComplianceWidget recalculates score from approved rules × findings
```

No remote backend, telemetry service, or code upload is involved in this POC path.

### 8. Verify before a demo or commit

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter coden-vscode build
```

The final build command is the most useful pre-demo check because it confirms that the extension, core, and webview dashboard bundle are compatible.

### Troubleshooting

**The command palette cannot find Coden commands**

Make sure you are in the Extension Development Host window, not the original VS Code window. Relaunch with `F5` after rebuilding.

**The webview is blank or unstyled**

Run `pnpm --filter coden-vscode build` and relaunch the development host. The command recreates the dashboard files under `apps/extension/media`.

**The dashboard says the core is unavailable**

Rebuild the extension, close the Extension Development Host, and launch it again. The extension starts the local core as part of the first scan request.

**The Constitution tab shows no rules or conflicts**

The store is seeded on mount from `constitution-demo-data.ts`. If the tab is empty, open the browser console (or the webview developer tools in VS Code) and look for import or runtime errors.

**A browser result is different from a VS Code result**

The browser preview uses the demo analyzer so it can run independently. The VS Code route uses the Node core, which is the end-to-end implementation to demo.
