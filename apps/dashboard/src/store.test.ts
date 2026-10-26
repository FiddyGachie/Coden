import { beforeEach, describe, expect, it } from "vitest";
import { useScanStore } from "./store.js";
import type { CoreVerdict } from "./vscode-bridge.js";

const sampleVerdict: CoreVerdict = {
  decision: "BLOCK",
  score: 30,
  reasons: ["WR-006: db.query( found"],
  checksRun: 1,
  checksSkipped: [],
  generatedAt: "2026-01-01T00:00:00.000Z"
};

beforeEach(() => useScanStore.getState().reset());

describe("useScanStore", () => {
  it("starts in idle state", () => {
    expect(useScanStore.getState().verdict.status).toBe("idle");
    expect(useScanStore.getState().findings).toHaveLength(0);
  });

  it("transitions to loading on startScan when idle", () => {
    useScanStore.getState().startScan();
    expect(useScanStore.getState().verdict.status).toBe("loading");
  });

  it("transitions to stale on startScan when already ready", () => {
    useScanStore.getState().setResult(sampleVerdict, []);
    useScanStore.getState().startScan();
    const state = useScanStore.getState().verdict;
    expect(state.status).toBe("stale");
    if (state.status === "stale") expect(state.data.decision).toBe("BLOCK");
  });

  it("transitions to ready on setResult", () => {
    useScanStore.getState().startScan();
    useScanStore.getState().setResult(sampleVerdict, [{ ruleId: "WR-006", severity: "error", message: "db.query( found", path: "src/orders.ts" }]);
    const state = useScanStore.getState().verdict;
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.data.score).toBe(30);
    expect(useScanStore.getState().findings).toHaveLength(1);
  });

  it("transitions to error on setError", () => {
    useScanStore.getState().startScan();
    useScanStore.getState().setError("core timed out");
    const state = useScanStore.getState().verdict;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.message).toBe("core timed out");
  });

  it("reset returns to idle and clears findings", () => {
    useScanStore.getState().setResult(sampleVerdict, [{ ruleId: "WR-006", severity: "error", message: "x", path: "y" }]);
    useScanStore.getState().reset();
    expect(useScanStore.getState().verdict.status).toBe("idle");
    expect(useScanStore.getState().findings).toHaveLength(0);
  });
});
