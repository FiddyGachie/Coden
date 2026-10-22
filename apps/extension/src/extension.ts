import * as vscode from "vscode";
import { commandIds } from "./commands.js";

export const activate = (context: vscode.ExtensionContext): void => {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "$(shield) Warden: starting";
  status.command = commandIds[0];
  status.show();
  context.subscriptions.push(status);
  context.subscriptions.push(vscode.commands.registerCommand(commandIds[1], () => vscode.window.showInformationMessage("Warden has not analyzed a change yet.")));
  context.subscriptions.push(vscode.commands.registerCommand(commandIds[0], () => {
    const panel = vscode.window.createWebviewPanel("wardenMissionControl", "Warden Mission Control", vscode.ViewColumn.One, { enableScripts: false });
    panel.webview.html = "<!doctype html><html><body><h1>Warden Mission Control</h1><p>The local core is ready for analysis.</p></body></html>";
  }));
  status.text = "$(shield) Warden: connected";
};

export const deactivate = (): void => undefined;
