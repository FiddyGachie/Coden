import { describe, expect, it } from "vitest";
import { handle } from "./index.js";

describe("core JSON-RPC", () => {
  it("responds to ping", () => {
    expect(handle({ jsonrpc: "2.0", id: 1, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 1, result: { status: "ok" } });
  });

  it("returns a BLOCK for a forbidden intent", () => {
    const response = handle({ jsonrpc: "2.0", id: 2, method: "warden_check_intent", params: { task: "add payment", plannedPaths: ["src/controller.ts"], plannedChanges: "db.query('select')" } }) as { result: { verdict: { decision: string } } };
    expect(response.result.verdict.decision).toBe("BLOCK");
  });

  it("checks a dashboard change through the diff RPC method", () => {
    const response = handle({ jsonrpc: "2.0", id: 3, method: "warden_check_diff", params: { source: "export const save = () => db.query('select')", path: "src/orders.ts" } }) as { result: { violations: Array<{ ruleId: string; path: string }>; verdict: { decision: string } } };
    expect(response.result.verdict.decision).toBe("BLOCK");
    expect(response.result.violations).toEqual([expect.objectContaining({ ruleId: "WR-006", path: "src/orders.ts" })]);
  });

  it("queues a file-change notification via warden_file_changed", () => {
    const response = handle({ jsonrpc: "2.0", id: 4, method: "warden_file_changed", params: { path: "src/orders.ts" } }) as { result: { queued: boolean; path: string } };
    expect(response.result.queued).toBe(true);
    expect(response.result.path).toBe("src/orders.ts");
  });

  it("returns -32602 for warden_file_changed with missing path", () => {
    const response = handle({ jsonrpc: "2.0", id: 5, method: "warden_file_changed", params: {} }) as { error: { code: number } };
    expect(response.error.code).toBe(-32602);
  });

  it("getStatus includes scheduler queue depths", () => {
    const response = handle({ jsonrpc: "2.0", id: 6, method: "getStatus" }) as { result: { status: string; pendingReindex: number; activeReindex: number } };
    expect(response.result.status).toBe("ok");
    expect(typeof response.result.pendingReindex).toBe("number");
    expect(typeof response.result.activeReindex).toBe("number");
  });
});
