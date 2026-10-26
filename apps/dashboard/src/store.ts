import { create } from "zustand";
import type { CoreFinding, CoreVerdict } from "./vscode-bridge.js";

/** Discriminated union for any async panel state. */
export type PanelState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "stale"; data: T }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export type ScanState = {
  verdict: PanelState<CoreVerdict>;
  findings: CoreFinding[];
  /** Marks current data as stale without clearing it (new scan started). */
  startScan(): void;
  setResult(verdict: CoreVerdict, findings: CoreFinding[]): void;
  setError(message: string): void;
  reset(): void;
};

export const useScanStore = create<ScanState>((set, get) => ({
  verdict: { status: "idle" },
  findings: [],

  startScan: () => {
    const current = get().verdict;
    // If we already have data, mark it stale rather than wiping it.
    set({
      verdict: current.status === "ready" || current.status === "stale"
        ? { status: "stale", data: current.data }
        : { status: "loading" }
    });
  },

  setResult: (verdict, findings) => {
    set({ verdict: { status: "ready", data: verdict }, findings });
  },

  setError: (message) => {
    set({ verdict: { status: "error", message } });
  },

  reset: () => {
    set({ verdict: { status: "idle" }, findings: [] });
  }
}));
