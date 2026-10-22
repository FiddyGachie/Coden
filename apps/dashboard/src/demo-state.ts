import type { Verdict } from "@warden/shared";

/** Clearly labelled fixture data used only by the dashboard shell. */
export const demoVerdict: Verdict = { decision: "REVIEW", score: 68, reasons: ["Behavior run attempted egress to telemetry.unknown.io", "STRIPE_SECRET was read outside the documented contract"], checksRun: 5, checksSkipped: ["Red Team: not run"], generatedAt: "2026-10-22T00:00:00.000Z" };
