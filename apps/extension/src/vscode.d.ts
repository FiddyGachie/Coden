declare module "vscode" {
  export interface Disposable { dispose(): unknown; }
  export interface ExtensionContext { subscriptions: Disposable[]; extensionPath: string; }
  export enum StatusBarAlignment { Left = 1, Right = 2 }
  export enum ViewColumn { One = 1 }
  export interface StatusBarItem extends Disposable { text: string; command?: string; show(): void; }
  export interface Webview {
    html: string;
    cspSource: string;
    asWebviewUri(uri: Uri): Uri;
    postMessage(message: unknown): Thenable<boolean>;
    onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable;
  }
  export interface WebviewPanel extends Disposable { webview: Webview; }
  export class Uri { static file(path: string): Uri; toString(): string; }
  export const window: {
    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    showInformationMessage(message: string): Thenable<string | undefined>;
    createWebviewPanel(viewType: string, title: string, column: ViewColumn, options: { enableScripts: boolean; localResourceRoots?: Uri[] }): WebviewPanel;
  };
  export const commands: { registerCommand(command: string, callback: () => unknown): Disposable; };
}
