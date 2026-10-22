import { describe, expect, it } from "vitest";
import { defaultRules, scanChange } from "./analyzer.js";

describe("scanChange", () => {
  it("blocks a controller that reaches directly into the database", () => {
    expect(scanChange("export const create = () => db.query('select 1')")).toMatchObject({ decision: "BLOCK", findings: [{ rule: { id: "CDN-001" }, line: 1 }] });
  });

  it("blocks a likely hard-coded credential", () => {
    expect(scanChange("const token = 'sk-example-not-a-real-key'")).toMatchObject({ decision: "BLOCK", findings: [{ rule: { id: "CDN-002" } }] });
  });

  it("requests review for a payment route without visible authentication", () => {
    expect(scanChange("router.post('/payments', createPayment)")).toMatchObject({ decision: "REVIEW", findings: [{ rule: { id: "CDN-003" } }] });
  });

  it("ships a compliant change", () => {
    expect(scanChange("router.post('/payments', auth, createPayment)\nreturn ordersRepository.create()", defaultRules)).toMatchObject({ decision: "SHIP", findings: [] });
  });
});
