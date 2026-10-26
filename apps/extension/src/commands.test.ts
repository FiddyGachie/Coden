import { describe, expect, it } from "vitest";
import { commandIds } from "./commands.js";

describe("extension command contract", () => {
  it("exposes the Mission Control, Verdict, and Restart Core commands", () => {
    expect(commandIds).toEqual(["warden.openMissionControl", "warden.showVerdict", "warden.restartCore"]);
  });
});
