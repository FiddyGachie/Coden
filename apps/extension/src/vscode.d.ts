declare module "vscode" {
  export interface Disposable { dispose(): unknown; }
  export interface ExtensionContext { subscriptions: Disposable[]; }
  export enum StatusBarAlignment { Left = 1, Right = 2 }
  export enum ViewColumn { One = 1 }
  export interface StatusBarItem extends Disposable { text: string; command?: string; show(): void; }
  export interface Webview { html: string; }
  export interface WebviewPanel extends Disposable { webview: Webview; }
  export const window: {
    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    showInformationMessage(message: string): Thenable<string | undefined>;
    createWebviewPanel(viewType: string, title: string, column: ViewColumn, options: { enableScripts: boolean }): WebviewPanel;
  };
  export const commands: { registerCommand(command: string, callback: () => unknown): Disposable; };
}
