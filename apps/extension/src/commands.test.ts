import { describe, expect, it } from "vitest";
import { commandIds } from "./commands.js";

describe("extension command contract", () => {
  it("exposes the Mission Control and Verdict commands", () => {
    expect(commandIds).toEqual(["warden.openMissionControl", "warden.showVerdict"]);
  });
});
