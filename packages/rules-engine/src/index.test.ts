import { describe, expect, it } from "vitest";
import type { Rule } from "@warden/shared";
import { checkDiff, makeVerdict } from "./index.js";

const rule: Rule = { id: "WR-006", title: "Controllers must not access the database", severity: "error", source: { path: "DESIGN.md", line: 4, quote: "Use repositories" }, checker: "forbidden-call", params: { pattern: "db.query(" }, remediation: "Use OrderRepository." };
describe("Gatekeeper", () => {
  it("blocks a direct database call", () => expect(makeVerdict(checkDiff("db.query('select 1')", "src/orders.ts", [rule])).decision).toBe("BLOCK"));
  it("ships clean source", () => expect(makeVerdict(checkDiff("repository.find()", "src/orders.ts", [rule])).decision).toBe("SHIP"));
});
