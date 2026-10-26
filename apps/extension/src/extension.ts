import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandIds } from "./commands.js";
import { CoreClient } from "./core-client.js";

type DashboardRequest = { type: "coden/scan-change"; source: string; path: string };
type CoreResult = { violations: unknown[]; verdict: unknown };

const dashboardHtml = (panel: vscode.WebviewPanel, extensionPath: string): string => {
  const mediaPath = join(extensionPath, "media");
  const html = readFileSync(join(mediaPath, "index.html"), "utf8");
  const mediaUri = panel.webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
  const nonce = Math.random().toString(36).slice(2);
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource}; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';`;
  return html
    .replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><base href="${mediaUri}/">`)
    .replace(/(src|href)="\.\/assets\//g, `$1="${mediaUri}/assets/`)
    .replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
};

const isDashboardRequest = (message: unknown): message is DashboardRequest =>
  typeof message === "object" && message !== null &&
  "type" in message && message.type === "coden/scan-change" &&
  "source" in message && typeof message.source === "string" &&
  "path" in message && typeof message.path === "string";

export const activate = (context: vscode.ExtensionContext): void => {
  const core = new CoreClient(join(context.extensionPath, "..", "core", "dist", "index.js"));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "$(shield) Warden: starting…";
  status.tooltip = "Warden — click to open Mission Control";
  status.command = commandIds[0];
  status.show();
  context.subscriptions.push(status);

  // Periodic health-check to update the status bar label
  const healthLoop = setInterval(async () => {
    const alive = await core.healthCheck();
    status.text = alive ? "$(shield) Warden: connected" : "$(warning) Warden: reconnecting…";
  }, 6_000);
  context.subscriptions.push({ dispose: () => clearInterval(healthLoop) });

  // Warden: Restart Core
  context.subscriptions.push(vscode.commands.registerCommand(commandIds[2], async () => {
    status.text = "$(sync~spin) Warden: restarting…";
    core.dispose();
    // CoreClient lazily re-spawns on next request; trigger a health-check to confirm.
    const alive = await core.healthCheck();
    status.text = alive ? "$(shield) Warden: connected" : "$(warning) Warden: reconnecting…";
    void vscode.window.showInformationMessage(alive ? "Warden core restarted." : "Warden core is reconnecting — it will retry automatically.");
  }));

  // Warden: Show Verdict (placeholder until T4.6)
  context.subscriptions.push(vscode.commands.registerCommand(commandIds[1], () =>
    vscode.window.showInformationMessage("Warden has not analyzed a change yet.")
  ));

  context.subscriptions.push({ dispose: () => core.dispose() });

  // Warden: Open Mission Control
  context.subscriptions.push(vscode.commands.registerCommand(commandIds[0], () => {
    const panel = vscode.window.createWebviewPanel(
      "codenMissionControl",
      "Coden Mission Control",
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.file(join(context.extensionPath, "media"))] }
    );
    panel.webview.html = dashboardHtml(panel, context.extensionPath);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isDashboardRequest(message)) return;
      try {
        const result = await core.checkChange(message.source, message.path) as CoreResult;
        await panel.webview.postMessage({ type: "coden/scan-result", findings: result.violations, verdict: result.verdict });
      } catch (error: unknown) {
        await panel.webview.postMessage({ type: "coden/scan-error", message: error instanceof Error ? error.message : "Warden core could not complete the check." });
      }
    });
  }));

  // Confirm the initial connection.
  void core.healthCheck().then((alive) => {
    status.text = alive ? "$(shield) Warden: connected" : "$(warning) Warden: reconnecting…";
  });
};

export const deactivate = (): void => undefined;
