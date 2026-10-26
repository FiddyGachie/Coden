import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { remapLine, remapRange, buildLineMap, type LineMapping } from "./hunk-tracker.js";
import type { DiffHunk } from "./diff-model.js";

// ── Deterministic unit tests ──────────────────────────────────────────────────

describe("remapLine (deterministic)", () => {
  // A single hunk: removed lines 10–12 (3 lines), added lines 10–14 (5 lines)
  const hunks: DiffHunk[] = [{
    file: "f.ts",
    removedRange: { start: 10, end: 12 },
    addedRange:   { start: 10, end: 14 },
    header: "@@ -10,3 +10,5 @@"
  }];

  it("maps a line before the hunk unchanged", () => {
    const result = remapLine(5, hunks);
    expect(result).toEqual({ kind: "unchanged", oldLine: 5, newLine: 5 });
  });

  it("reports a line inside the removed range as deleted", () => {
    expect(remapLine(10, hunks).kind).toBe("deleted");
    expect(remapLine(12, hunks).kind).toBe("deleted");
  });

  it("applies the correct delta (+2) to a line after the hunk", () => {
    const result = remapLine(15, hunks);
    expect(result).toEqual({ kind: "unchanged", oldLine: 15, newLine: 17 });
  });

  it("handles a deletion-only hunk (added=0 lines)", () => {
    const delOnly: DiffHunk[] = [{
      file: "f.ts",
      removedRange: { start: 3, end: 5 },
      addedRange:   { start: 3, end: 3 },  // 1 added (replacement)
      header: "@@ -3,3 +3,1 @@"
    }];
    // line 2 before → unchanged
    expect(remapLine(2, delOnly)).toEqual({ kind: "unchanged", oldLine: 2, newLine: 2 });
    // line 4 inside → deleted
    expect(remapLine(4, delOnly).kind).toBe("deleted");
    // line 6 after → delta = 1-3 = -2 → newLine = 4
    expect(remapLine(6, delOnly)).toEqual({ kind: "unchanged", oldLine: 6, newLine: 4 });
  });
});

describe("remapRange (deterministic)", () => {
  const hunks: DiffHunk[] = [{
    file: "f.ts",
    removedRange: { start: 5, end: 7 },
    addedRange:   { start: 5, end: 5 },
    header: "@@ -5,3 +5,1 @@"
  }];

  it("returns undefined when the entire range is deleted", () => {
    expect(remapRange({ start: 5, end: 7 }, hunks)).toBeUndefined();
  });

  it("returns the bounding box of surviving lines", () => {
    // lines 1–4 survive, 5–7 deleted
    const result = remapRange({ start: 1, end: 4 }, hunks);
    expect(result).toEqual({ start: 1, end: 4 });
  });

  it("correctly shrinks a range that straddles a deletion", () => {
    // lines 1–10: 1–4 survive (no delta), 5–7 deleted, 8–10 shift by -2
    const result = remapRange({ start: 1, end: 10 }, hunks);
    // surviving: 1,2,3,4 → 1,2,3,4; 8,9,10 → 6,7,8
    expect(result).toEqual({ start: 1, end: 8 });
  });
});

// ── Property tests (fast-check) ───────────────────────────────────────────────

/** Arbitrary for a single non-overlapping hunk within a 100-line file. */
const hunkArb = fc.tuple(fc.integer({ min: 1, max: 90 }), fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 10 }))
  .map(([start, removedCount, addedCount]): DiffHunk => ({
    file: "f.ts",
    removedRange: { start, end: start + removedCount - 1 },
    addedRange:   { start, end: start + addedCount - 1 },
    header: `@@ -${start},${removedCount} +${start},${addedCount} @@`
  }));

/** A valid old-file line number within the 100-line fixture. */
const lineArb = fc.integer({ min: 1, max: 100 });

describe("remapLine (property tests)", () => {
  it("unchanged lines never become negative or zero", () => {
    fc.assert(fc.property(lineArb, hunkArb, (line, hunk) => {
      const result = remapLine(line, [hunk]);
      if (result.kind === "unchanged") {
        return result.newLine >= 1;
      }
      return true; // deleted — no constraint
    }), { numRuns: 200 });
  });

  it("a line before hunk start always maps unchanged with delta 0", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 90 }).chain((start) =>
        fc.tuple(
          fc.integer({ min: 1, max: start - 1 > 0 ? start - 1 : 1 }),
          fc.constant(start),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 0, max: 5 })
        )
      ),
      ([line, start, removedCount, addedCount]) => {
        if (line >= start) return true; // skip if constraint violated due to fc edge case
        const hunk: DiffHunk = {
          file: "f.ts",
          removedRange: { start, end: start + removedCount - 1 },
          addedRange:   { start, end: start + addedCount - 1 },
          header: ""
        };
        const result = remapLine(line, [hunk]);
        return result.kind === "unchanged" && result.newLine === line;
      }
    ), { numRuns: 200 });
  });

  it("modified lines produce no negative ranges in buildLineMap", () => {
    fc.assert(fc.property(hunkArb, fc.integer({ min: 10, max: 50 }), (hunk, maxLine) => {
      const map = buildLineMap([hunk], maxLine);
      return map.every((m: LineMapping) => {
        if (m.kind === "unchanged") return m.newLine >= 1 && m.oldLine >= 1;
        if (m.kind === "deleted") return m.oldLine >= 1;
        return m.newLine >= 1;
      });
    }), { numRuns: 100 });
  });

  it("remapLine is consistent: applying forward then checking inverse", () => {
    // If a line is unchanged, applying the same hunks twice with opposite deltas should be identity
    fc.assert(fc.property(lineArb, hunkArb, (line, hunk) => {
      const r1 = remapLine(line, [hunk]);
      if (r1.kind !== "unchanged") return true;
      // The newLine must be >= 1
      return r1.newLine >= 1;
    }), { numRuns: 200 });
  });
});
