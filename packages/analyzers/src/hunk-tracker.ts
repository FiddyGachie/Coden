/**
 * Hunk line tracker — maps line numbers from one version of a file to another
 * by applying a sequence of hunks (adds/removes).
 *
 * Used by the Flight Recorder (T5.2) to attribute specific lines to agent
 * sessions even after subsequent edits have shifted line numbers.
 *
 * Algorithm: walk hunks in order, accumulating a running delta (lines added
 * minus lines removed). For each query line:
 *   - If the line falls inside a removed range → it was deleted (return undefined).
 *   - If the line falls before the hunk start → apply accumulated delta so far.
 *   - After all hunks → apply total delta.
 *
 * This is the "context-line remapping" approach used by standard blame tools;
 * it does not implement a full Myers LCS, but uses the hunk metadata that
 * Myers already computed (via `git diff --unified=0`).
 */

import type { DiffHunk, LineRange } from "./diff-model.js";

// ── Mapped line result ────────────────────────────────────────────────────────

export type LineMapping =
  | { kind: "unchanged"; oldLine: number; newLine: number }
  | { kind: "added";     newLine: number }
  | { kind: "deleted";   oldLine: number };

// ── Core remapper ─────────────────────────────────────────────────────────────

/**
 * Given a set of hunks describing changes from `old` → `new`, remap
 * `oldLine` (1-based) to the corresponding line in the new file.
 *
 * Returns:
 *   - `{ kind: "unchanged", newLine }` if the line survived unchanged.
 *   - `{ kind: "deleted" }` if the line was removed by a hunk.
 */
export const remapLine = (oldLine: number, hunks: readonly DiffHunk[]): LineMapping => {
  // Sort by removal start to process in order
  const sorted = [...hunks].sort((a, b) => a.removedRange.start - b.removedRange.start);
  let delta = 0; // cumulative (added - removed) so far

  for (const hunk of sorted) {
    const { removedRange, addedRange } = hunk;
    const removedCount = removedRange.end - removedRange.start + 1;
    const addedCount = addedRange.end - addedRange.start + 1;
    const hunkDelta = addedCount - removedCount;

    if (oldLine < removedRange.start) {
      // Line is before this hunk — apply delta accumulated so far
      return { kind: "unchanged", oldLine, newLine: oldLine + delta };
    }
    if (oldLine >= removedRange.start && oldLine <= removedRange.end) {
      // Line was deleted by this hunk
      return { kind: "deleted", oldLine };
    }
    // Line is after this hunk — accumulate delta and continue
    delta += hunkDelta;
  }

  // Line is after all hunks
  return { kind: "unchanged", oldLine, newLine: oldLine + delta };
};

/**
 * Remap an entire line range from `old` to `new`.
 * Returns the bounding box of surviving mapped lines, or `undefined` if
 * the entire range was deleted.
 */
export const remapRange = (range: LineRange, hunks: readonly DiffHunk[]): LineRange | undefined => {
  const mappedLines: number[] = [];
  for (let line = range.start; line <= range.end; line++) {
    const result = remapLine(line, hunks);
    if (result.kind === "unchanged") mappedLines.push(result.newLine);
  }
  if (mappedLines.length === 0) return undefined;
  return { start: Math.min(...mappedLines), end: Math.max(...mappedLines) };
};

/**
 * Given a set of hunks, compute the full line map: for every line in the old
 * file up to `maxOldLine`, produce a `LineMapping`.
 */
export const buildLineMap = (hunks: readonly DiffHunk[], maxOldLine: number): LineMapping[] =>
  Array.from({ length: maxOldLine }, (_, i) => remapLine(i + 1, hunks));
