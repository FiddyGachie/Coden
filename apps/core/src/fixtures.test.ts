/**
 * Integration test: verifies that the S2 seeded fixture produces a BLOCK from the
 * core JSON-RPC handler. This is the acceptance criterion for T1.1 + T3.4.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handle } from "./index.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/demo-repo/src/controllers");

describe("S2 fixture: forbidden db.query( from controller", () => {
  it("produces a BLOCK verdict citing WR-006 on the seeded payments controller", () => {
    const source = readFileSync(join(fixtureDir, "payments.seeded-s2.ts"), "utf8");
    const response = handle({
      jsonrpc: "2.0",
      id: "s2-test",
      method: "warden_check_diff",
      params: { source, path: "src/controllers/payments.seeded-s2.ts" }
    }) as { result: { violations: Array<{ ruleId: string }>; verdict: { decision: string } } };
    expect(response.result.verdict.decision).toBe("BLOCK");
    expect(response.result.violations.some((v) => v.ruleId === "WR-006")).toBe(true);
  });

  it("ships the clean orders controller with no violations", () => {
    const source = readFileSync(join(fixtureDir, "orders.ts"), "utf8");
    const response = handle({
      jsonrpc: "2.0",
      id: "s2-clean",
      method: "warden_check_diff",
      params: { source, path: "src/controllers/orders.ts" }
    }) as { result: { violations: unknown[]; verdict: { decision: string } } };
    expect(response.result.verdict.decision).toBe("SHIP");
    expect(response.result.violations).toHaveLength(0);
  });
});
