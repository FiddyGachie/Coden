/**
 * T3.9 — Compliance scoring unit tests
 *
 * All expected values are hand-computed from the SPEC §5.6 formula:
 *
 *   score = 100 × (1 − weighted_violations / max(1, weighted_applicable))
 *
 * Weights:  info=0.1  warn=0.5  error=1  critical=3
 *
 * Each test case shows the working so reviewers can verify against the spec
 * without running code.
 */
import { describe, expect, it } from "vitest";
import {
  computeScopeScore,
  computeComplianceReport,
  moduleOf,
  snapshotFromReport,
  filterSnapshots,
  scoreDelta,
  SEVERITY_WEIGHTS,
  type CheckRecord
} from "./compliance-score.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a CheckRecord with sensible defaults. */
const rec = (
  opts: Partial<CheckRecord> & Pick<CheckRecord, "severity" | "filePath">
): CheckRecord => ({
  ruleId:  "WR-001",
  violated: false,
  waived:   false,
  ...opts
});

// Round to 6 decimal places to avoid floating-point noise in assertions.
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

// ── SEVERITY_WEIGHTS sanity ────────────────────────────────────────────────────

describe("SEVERITY_WEIGHTS", () => {
  it("matches spec values", () => {
    expect(SEVERITY_WEIGHTS.info).toBe(0.1);
    expect(SEVERITY_WEIGHTS.warn).toBe(0.5);
    expect(SEVERITY_WEIGHTS.error).toBe(1);
    expect(SEVERITY_WEIGHTS.critical).toBe(3);
  });
});

// ── computeScopeScore ─────────────────────────────────────────────────────────

describe("computeScopeScore", () => {

  it("returns 100 when there are no violations", () => {
    // applicable = 2×error (w=1 each) = 2; violations = 0
    // score = 100 × (1 − 0/2) = 100
    const records = [
      rec({ severity: "error", filePath: "a.ts" }),
      rec({ severity: "error", filePath: "b.ts" })
    ];
    expect(computeScopeScore(records).score).toBe(100);
  });

  it("returns 100 when the list is empty (denominator clamp to 1)", () => {
    // score = 100 × (1 − 0/1) = 100
    expect(computeScopeScore([]).score).toBe(100);
  });

  it("single error violation: score = 100 × (1 − 1/1) = 0", () => {
    // applicable = 1×error = 1; violations = 1×error = 1
    // score = 100 × (1 − 1/1) = 0
    const r = computeScopeScore([rec({ severity: "error", filePath: "a.ts", violated: true })]);
    expect(r.score).toBe(0);
    expect(r.weightedViolations).toBe(1);
    expect(r.weightedApplicable).toBe(1);
    expect(r.openViolations).toBe(1);
    expect(r.waivedViolations).toBe(0);
  });

  it("single warn violation among two warn checks: score = 100 × (1 − 0.5/1) = 50", () => {
    // applicable = 2×warn (w=0.5) = 1.0; violations = 1×warn = 0.5
    // score = 100 × (1 − 0.5/1.0) = 50
    const records = [
      rec({ severity: "warn", filePath: "a.ts", violated: true }),
      rec({ severity: "warn", filePath: "b.ts" })
    ];
    const r = computeScopeScore(records);
    expect(r.score).toBe(50);
    expect(r.weightedViolations).toBe(0.5);
    expect(r.weightedApplicable).toBe(1.0);
  });

  it("mixed severities with partial violations (hand-computed)", () => {
    // Checks:
    //   info  pass  w=0.1
    //   warn  FAIL  w=0.5
    //   error FAIL  w=1
    //   critical pass w=3
    //
    // weighted_applicable = 0.1 + 0.5 + 1 + 3 = 4.6
    // weighted_violations = 0.5 + 1 = 1.5
    // score = 100 × (1 − 1.5/4.6) = 100 × (3.1/4.6) ≈ 67.391304...
    const records = [
      rec({ severity: "info",     filePath: "a.ts" }),
      rec({ severity: "warn",     filePath: "a.ts", violated: true }),
      rec({ severity: "error",    filePath: "a.ts", violated: true }),
      rec({ severity: "critical", filePath: "a.ts" })
    ];
    const r = computeScopeScore(records);
    expect(round6(r.weightedApplicable)).toBe(4.6);
    expect(round6(r.weightedViolations)).toBe(1.5);
    // score = 100 × (1 − 1.5/4.6)
    const expected = 100 * (1 - 1.5 / 4.6);
    expect(round6(r.score)).toBe(round6(expected));
  });

  it("waived violation does NOT count as open but does count as applicable", () => {
    // applicable = 1×error = 1; open_violations = 0 (waived); score = 100
    const r = computeScopeScore([
      rec({ severity: "error", filePath: "a.ts", violated: true, waived: true })
    ]);
    expect(r.score).toBe(100);
    expect(r.openViolations).toBe(0);
    expect(r.waivedViolations).toBe(1);
    expect(r.weightedViolations).toBe(0);
    expect(r.weightedApplicable).toBe(1);
  });

  it("score is clamped to [0, 100] — cannot go negative", () => {
    // Even if somehow weighted_violations > weighted_applicable, score >= 0
    const heavyViolations = [
      rec({ severity: "critical", filePath: "a.ts", violated: true }),
      rec({ severity: "critical", filePath: "a.ts", violated: true }),
      rec({ severity: "critical", filePath: "a.ts", violated: true })
    ];
    expect(computeScopeScore(heavyViolations).score).toBeGreaterThanOrEqual(0);
  });

  it("score is clamped to [0, 100] — cannot exceed 100", () => {
    const allPassing = [
      rec({ severity: "info",  filePath: "a.ts" }),
      rec({ severity: "error", filePath: "b.ts" })
    ];
    expect(computeScopeScore(allPassing).score).toBeLessThanOrEqual(100);
  });

  it("critical violation has 3× the weight of an error", () => {
    // 1 critical in 1-check scope: score = 100 × (1 − 3/3) = 0
    const r1 = computeScopeScore([rec({ severity: "critical", filePath: "a.ts", violated: true })]);
    // 1 error in 1-check scope: score = 100 × (1 − 1/1) = 0
    const r2 = computeScopeScore([rec({ severity: "error",    filePath: "a.ts", violated: true })]);
    // Both score 0, but weightedViolations differ
    expect(r1.score).toBe(0);
    expect(r2.score).toBe(0);
    expect(r1.weightedViolations).toBe(3);
    expect(r2.weightedViolations).toBe(1);
  });

  it("total checks, openViolations, waivedViolations counts are correct", () => {
    const records = [
      rec({ severity: "warn", filePath: "a.ts", violated: true }),             // open
      rec({ severity: "warn", filePath: "a.ts", violated: true, waived: true }), // waived
      rec({ severity: "error", filePath: "b.ts" })                             // pass
    ];
    const r = computeScopeScore(records);
    expect(r.totalChecks).toBe(3);
    expect(r.openViolations).toBe(1);
    expect(r.waivedViolations).toBe(1);
  });
});

// ── moduleOf ──────────────────────────────────────────────────────────────────

describe("moduleOf", () => {
  it("extracts directory path from nested file", () => {
    expect(moduleOf("src/controllers/orders.ts")).toBe("src/controllers");
  });

  it("returns (root) for a top-level file", () => {
    expect(moduleOf("index.ts")).toBe("(root)");
  });

  it("handles backslash paths (Windows)", () => {
    expect(moduleOf("src\\repositories\\orders.ts")).toBe("src/repositories");
  });

  it("uses only the directory portion — not the filename", () => {
    const mod = moduleOf("packages/llm/src/provider.ts");
    expect(mod).not.toContain("provider.ts");
    expect(mod).toBe("packages/llm/src");
  });
});

// ── computeComplianceReport ───────────────────────────────────────────────────

describe("computeComplianceReport", () => {

  it("overall score matches manual computeScopeScore on same records", () => {
    const records: CheckRecord[] = [
      rec({ ruleId: "WR-001", severity: "error", filePath: "src/a.ts", violated: true }),
      rec({ ruleId: "WR-002", severity: "warn",  filePath: "src/b.ts" })
    ];
    const report = computeComplianceReport(records, "2025-01-15T00:00:00.000Z");
    const direct = computeScopeScore(records);
    expect(report.overall.score).toBe(direct.score);
  });

  it("byFile groups records correctly", () => {
    // 2 files, 1 violation in a.ts only
    // a.ts: 1 error violated → score = 100 × (1 − 1/1) = 0
    // b.ts: 1 error pass     → score = 100
    const records: CheckRecord[] = [
      rec({ severity: "error", filePath: "src/a.ts", violated: true }),
      rec({ severity: "error", filePath: "src/b.ts" })
    ];
    const { byFile } = computeComplianceReport(records);
    const aScore = byFile.find((f) => f.filePath === "src/a.ts");
    const bScore = byFile.find((f) => f.filePath === "src/b.ts");
    expect(aScore?.score).toBe(0);
    expect(bScore?.score).toBe(100);
  });

  it("byModule groups by directory", () => {
    const records: CheckRecord[] = [
      rec({ severity: "error", filePath: "src/controllers/a.ts", violated: true }),
      rec({ severity: "warn",  filePath: "src/controllers/b.ts" }),
      rec({ severity: "error", filePath: "src/repositories/c.ts" })
    ];
    const { byModule } = computeComplianceReport(records);
    const ctrl = byModule.find((m) => m.module === "src/controllers");
    const repo = byModule.find((m) => m.module === "src/repositories");
    expect(ctrl).toBeDefined();
    expect(repo).toBeDefined();
    // controllers: 1 error violated + 1 warn pass
    //   applicable = 1 + 0.5 = 1.5; violations = 1
    //   score = 100 × (1 − 1/1.5) = 33.333...
    const expectedCtrl = 100 * (1 - 1 / 1.5);
    expect(round6(ctrl!.score)).toBe(round6(expectedCtrl));
    // repositories: 1 error pass → score = 100
    expect(repo!.score).toBe(100);
  });

  it("byAgent only includes records with agentId", () => {
    const records: CheckRecord[] = [
      rec({ severity: "error", filePath: "a.ts", agentId: "agent-1", violated: true }),
      rec({ severity: "warn",  filePath: "b.ts", agentId: "agent-1" }),
      rec({ severity: "error", filePath: "c.ts" })  // no agentId
    ];
    const { byAgent } = computeComplianceReport(records);
    expect(byAgent).toHaveLength(1);
    expect(byAgent[0]?.agentId).toBe("agent-1");
    // agent-1: 1 error violated + 1 warn pass
    //   applicable = 1 + 0.5 = 1.5; violations = 1
    //   score = 100 × (1 − 1/1.5) ≈ 33.333
    const expected = 100 * (1 - 1 / 1.5);
    expect(round6(byAgent[0]!.score)).toBe(round6(expected));
  });

  it("byAgent is empty when no records have agentId", () => {
    const records: CheckRecord[] = [
      rec({ severity: "error", filePath: "a.ts", violated: true })
    ];
    const { byAgent } = computeComplianceReport(records);
    expect(byAgent).toHaveLength(0);
  });

  it("generatedAt is included in the report", () => {
    const ts = "2025-06-01T12:00:00.000Z";
    const { generatedAt } = computeComplianceReport([], ts);
    expect(generatedAt).toBe(ts);
  });
});

// ── Time-series helpers ───────────────────────────────────────────────────────

describe("snapshotFromReport", () => {
  it("derives date from generatedAt (first 10 chars)", () => {
    const records = [rec({ severity: "error", filePath: "a.ts" })];
    const report  = computeComplianceReport(records, "2025-03-15T08:30:00.000Z");
    const snap    = snapshotFromReport(report);
    expect(snap.date).toBe("2025-03-15");
  });

  it("carries overall score and byModule", () => {
    const records = [rec({ severity: "warn", filePath: "src/a.ts", violated: true })];
    const report  = computeComplianceReport(records, "2025-03-15T00:00:00.000Z");
    const snap    = snapshotFromReport(report);
    expect(snap.overall.score).toBe(report.overall.score);
    expect(snap.byModule).toBeDefined();
  });
});

describe("filterSnapshots", () => {
  const snapshots = [
    { date: "2025-01-01", overall: computeScopeScore([]) },
    { date: "2025-01-10", overall: computeScopeScore([]) },
    { date: "2025-01-20", overall: computeScopeScore([]) },
    { date: "2025-02-01", overall: computeScopeScore([]) }
  ];

  it("returns snapshots within inclusive date range", () => {
    const result = filterSnapshots(snapshots, "2025-01-10", "2025-01-20");
    expect(result).toHaveLength(2);
    expect(result[0]?.date).toBe("2025-01-10");
    expect(result[1]?.date).toBe("2025-01-20");
  });

  it("returns empty array when range has no matches", () => {
    expect(filterSnapshots(snapshots, "2024-01-01", "2024-12-31")).toHaveLength(0);
  });

  it("includes boundary dates (inclusive)", () => {
    const result = filterSnapshots(snapshots, "2025-01-01", "2025-02-01");
    expect(result).toHaveLength(4);
  });
});

describe("scoreDelta", () => {
  it("returns undefined for fewer than 2 snapshots", () => {
    expect(scoreDelta([])).toBeUndefined();
    expect(scoreDelta([{ date: "2025-01-01", overall: computeScopeScore([]) }])).toBeUndefined();
  });

  it("returns positive delta when score improves", () => {
    // Day 1: one error violation → score = 0
    // Day 2: no violations → score = 100
    const snap1 = {
      date:    "2025-01-01",
      overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts", violated: true })])
    };
    const snap2 = {
      date:    "2025-01-02",
      overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts" })])
    };
    const delta = scoreDelta([snap1, snap2]);
    expect(delta).toBe(100); // 100 − 0
  });

  it("returns negative delta when score degrades", () => {
    const snap1 = {
      date:    "2025-01-01",
      overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts" })])      // 100
    };
    const snap2 = {
      date:    "2025-01-02",
      overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts", violated: true })]) // 0
    };
    const delta = scoreDelta([snap1, snap2]);
    expect(delta).toBe(-100); // 0 − 100
  });

  it("sorts by date before computing delta (order-independent input)", () => {
    // Pass snapshots in reverse chronological order
    const snap1 = { date: "2025-01-01", overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts", violated: true })]) }; // 0
    const snap2 = { date: "2025-01-03", overall: computeScopeScore([rec({ severity: "error", filePath: "a.ts" })]) };                  // 100
    const delta = scoreDelta([snap2, snap1]); // reversed order
    expect(delta).toBe(100); // last (01-03) − first (01-01)
  });
});
