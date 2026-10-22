import { describe, expect, it } from "vitest";
import { demoVerdict } from "./demo-state.js";

describe("dashboard demo state", () => {
  it("labels fixture state as a review instead of shipping it", () => expect(demoVerdict.decision).toBe("REVIEW"));
});
