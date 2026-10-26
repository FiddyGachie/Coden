import { describe, expect, it } from "vitest";
import { behaviorReportSchema, claimSchema, containsSecret, encodeFrame, eventSchema, policySchema, redactSecrets, rpcResponseSchema, ruleSchema, socketPath, splitFrames, trustEventSchema } from "./index.js";

describe("ruleSchema", () => {
  it("accepts a cited rule", () => {
    expect(ruleSchema.parse({ id: "WR-006", title: "Use repositories", severity: "error", source: { path: "DESIGN.md", line: 12, quote: "Controllers use repositories" }, checker: "forbidden-call", remediation: "Inject the repository." }).id).toBe("WR-006");
  });

  it("rejects an uncited rule", () => {
    expect(() => ruleSchema.parse({ id: "bad", title: "x", severity: "error", source: {}, checker: "no-secrets", remediation: "x" })).toThrow();
  });

  it("redacts tokens while preserving surrounding evidence", () => {
    expect(redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz")).toBe("Authorization: [REDACTED]");
  });

  it("redacts high-entropy env-var values while preserving the key name", () => {
    // Note: deliberately broken format so GitHub push protection does not flag test fixtures.
    // The checker regex matches sk- followed by 20+ alphanum chars (see checkers.ts SECRET_PATTERNS).
    const line = "STRIPE_SECRET=sk-test-FAKEKEYFORTESTING1234567890";
    const result = redactSecrets(line);
    expect(result).toContain("STRIPE_SECRET=");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-test-FAKE");
  });

  it("does not redact ordinary short identifiers", () => {
    const safe = "const userId = 'abc123'; const name = 'Alice';";
    expect(redactSecrets(safe)).toBe(safe);
  });

  it("containsSecret detects known patterns", () => {
    expect(containsSecret("AKIA1234567890ABCDEF")).toBe(true);
    expect(containsSecret("hello world")).toBe(false);
  });

  it("accepts the shared policy, event, behavior, territory, and trust contracts", () => {
    expect(policySchema.parse({ id: "default", level: "L1" }).maxChangedFiles).toBe(10);
    expect(eventSchema.parse({ id: "e1", sessionId: "s1", seq: 0, type: "check", payload: {}, ts: "2026-01-01T00:00:00.000Z" }).type).toBe("check");
    expect(behaviorReportSchema.parse({ runId: "b1", isolation: "docker", riskScore: 10, findings: [], generatedAt: "2026-01-01T00:00:00.000Z" }).riskScore).toBe(10);
    expect(claimSchema.parse({ id: "c1", agentId: "agent", sessionId: "s1", intent: "edit order", paths: ["src/orders.ts"], status: "active", expiresAt: "2026-01-01T00:00:00.000Z" }).status).toBe("active");
    expect(trustEventSchema.parse({ id: "t1", agentId: "agent", taskClass: "feature", area: "orders", outcome: "pass", weight: 1, sourceRef: "check-1", ts: "2026-01-01T00:00:00.000Z" }).outcome).toBe("pass");
  });

  it("rejects malformed IPC results and invalid trust weights", () => {
    expect(() => rpcResponseSchema.parse({ jsonrpc: "2.0", id: 1 })).toThrow();
    expect(() => trustEventSchema.parse({ id: "t1", agentId: "agent", taskClass: "feature", area: "orders", outcome: "pass", weight: 0, sourceRef: "check-1", ts: "2026-01-01T00:00:00.000Z" })).toThrow();
  });
});

describe("IPC framing", () => {
  it("splits a single complete frame", () => {
    const [frames, remaining] = splitFrames("", '{"a":1}\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.parsed).toEqual({ a: 1 });
    expect(remaining).toBe("");
  });

  it("accumulates a partial frame and emits nothing", () => {
    const [frames, remaining] = splitFrames("", '{"a":');
    expect(frames).toHaveLength(0);
    expect(remaining).toBe('{"a":');
  });

  it("splits multiple frames arriving together", () => {
    const [frames] = splitFrames("", '{"id":1}\n{"id":2}\n');
    expect(frames).toHaveLength(2);
    expect((frames[1]?.parsed as { id: number }).id).toBe(2);
  });

  it("spans a frame split across two chunks", () => {
    const [, partial] = splitFrames("", '{"id":1}');
    const [frames] = splitFrames(partial, '\n');
    expect(frames).toHaveLength(1);
  });

  it("encodeFrame produces a newline-terminated JSON string", () => {
    expect(encodeFrame({ x: 1 })).toBe('{"x":1}\n');
  });

  it("socketPath uses named-pipe format on Windows", () => {
    const path = socketPath("mytest");
    if (process.platform === "win32") {
      expect(path).toMatch(/^\\\\.\\pipe\\/);
    } else {
      expect(path).toMatch(/^\/tmp\//);
    }
  });
});
