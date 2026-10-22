import { describe, expect, it } from "vitest";
import { scanChange } from "./analyzer.js";

describe("scanChange", () => {
  it("blocks a controller that reaches directly into the database", () => {
    expect(scanChange("export const create = () => db.query('select 1')")).toMatchObject({ decision: "BLOCK", evidence: expect.stringContaining("line 1") });
  });

  it("passes a controller that uses a repository", () => {
    expect(scanChange("export const create = () => ordersRepository.create()")).toMatchObject({ decision: "PASS" });
  });
});
