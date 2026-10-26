export type CoreFinding = { ruleId: string; severity: "info" | "warn" | "error" | "critical"; message: string; path: string; line?: number };
export type CoreVerdict = { decision: "SHIP" | "REVIEW" | "BLOCK"; score: number; reasons: string[]; checksRun: number; checksSkipped: string[]; generatedAt: string };
export type ScanResponse = { type: "coden/scan-result"; verdict: CoreVerdict; findings: CoreFinding[] };
type VsCodeApi = { postMessage(message: unknown): void };
declare global { interface Window { acquireVsCodeApi?: () => VsCodeApi; } }
const api = window.acquireVsCodeApi?.();
export const isVsCodeWebview = (): boolean => api !== undefined;
export const requestCoreScan = (source: string): boolean => {
  if (!api) return false;
  api.postMessage({ type: "coden/scan-change", source, path: "proposed-change.ts" });
  return true;
};
export const subscribeToCoreScans = (onResult: (result: ScanResponse) => void, onError: (message: string) => void): (() => void) => {
  const listener = (event: MessageEvent<unknown>): void => {
    const message = event.data;
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    if (message.type === "coden/scan-result" && "verdict" in message && "findings" in message) onResult(message as ScanResponse);
    if (message.type === "coden/scan-error" && "message" in message && typeof message.message === "string") onError(message.message);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
};
