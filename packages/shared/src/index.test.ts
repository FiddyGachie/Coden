import { describe, expect, it } from "vitest";
import { redactSecrets, ruleSchema } from "./index.js";

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
});
