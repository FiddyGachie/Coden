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
});
