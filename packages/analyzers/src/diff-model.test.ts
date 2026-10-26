import { describe, expect, it } from "vitest";
import { extractHunks, symbolsTouchedByHunks, type DiffHunk } from "./diff-model.js";
import type { GraphNode } from "./ast-index.js";

// ── Fixture diff text (mimics `git diff --unified=0` output) ──────────────────

const SIMPLE_DIFF = `diff --git a/src/orders.ts b/src/orders.ts
index abc..def 100644
--- a/src/orders.ts
+++ b/src/orders.ts
@@ -10,4 +10,6 @@ export const createOrder = () => {
-  return null;
+  const result = db.query('...');
+  return result;
`;

const RENAME_DIFF = `diff --git a/src/old.ts b/src/new.ts
similarity index 80%
rename from src/old.ts
rename to src/new.ts
@@ -5,3 +5,4 @@
+  newLine();
`;

const MULTI_HUNK_DIFF = `diff --git a/src/payments.ts b/src/payments.ts
index aaa..bbb 100644
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -2,2 +2,3 @@
+  import { x } from 'mod';
@@ -20,1 +21,1 @@
-  oldCall();
+  newCall();
`;

// ── hunk header parsing ───────────────────────────────────────────────────────

describe("extractHunks", () => {
  it("parses a simple single-hunk diff", () => {
    const hunks = extractHunks("src/orders.ts", SIMPLE_DIFF);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.addedRange).toEqual({ start: 10, end: 15 });
    expect(hunks[0]!.removedRange).toEqual({ start: 10, end: 13 });
  });

  it("parses multiple hunks from one file diff", () => {
    const hunks = extractHunks("src/payments.ts", MULTI_HUNK_DIFF);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.addedRange.start).toBe(2);
    expect(hunks[1]!.removedRange.start).toBe(20);
  });

  it("handles rename diffs", () => {
    const hunks = extractHunks("src/new.ts", RENAME_DIFF);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.addedRange.start).toBe(5);
  });

  it("returns empty array for a diff with no hunk headers", () => {
    expect(extractHunks("x.ts", "no hunks here\njust text\n")).toHaveLength(0);
  });

  it("handles count=0 hunks (deletion-only)", () => {
    const deletion = `@@ -5,3 +5,0 @@ context`;
    const hunks = extractHunks("f.ts", deletion);
    expect(hunks[0]!.addedRange).toEqual({ start: 5, end: 5 });
    expect(hunks[0]!.removedRange).toEqual({ start: 5, end: 7 });
  });
});

// ── Symbol-range intersection ─────────────────────────────────────────────────

const nodes: GraphNode[] = [
  { id: "src/orders.ts#createOrder", kind: "function", name: "createOrder", file: "src/orders.ts", startLine: 8, endLine: 18 },
  { id: "src/orders.ts#helper",      kind: "function", name: "helper",      file: "src/orders.ts", startLine: 25, endLine: 30 },
  { id: "src/orders.ts",             kind: "file",     name: "src/orders.ts", file: "src/orders.ts", startLine: 1, endLine: 40 }
];

describe("symbolsTouchedByHunks", () => {
  it("identifies functions whose range overlaps with an added range", () => {
    const hunks: DiffHunk[] = [{ file: "src/orders.ts", addedRange: { start: 10, end: 15 }, removedRange: { start: 10, end: 13 }, header: "@@ -10,4 +10,6 @@" }];
    const touched = symbolsTouchedByHunks(hunks, nodes);
    expect(touched.some((t) => t.nodeId === "src/orders.ts#createOrder")).toBe(true);
    expect(touched.some((t) => t.nodeId === "src/orders.ts#helper")).toBe(false);
  });

  it("skips file-level nodes", () => {
    const hunks: DiffHunk[] = [{ file: "src/orders.ts", addedRange: { start: 1, end: 40 }, removedRange: { start: 1, end: 40 }, header: "@@ -1,40 +1,40 @@" }];
    const touched = symbolsTouchedByHunks(hunks, nodes);
    expect(touched.every((t) => t.nodeId !== "src/orders.ts")).toBe(true);
  });

  it("deduplicates symbols touched by multiple hunks", () => {
    const hunks: DiffHunk[] = [
      { file: "src/orders.ts", addedRange: { start: 8, end: 10 }, removedRange: { start: 8, end: 10 }, header: "@@ -8,3 +8,3 @@" },
      { file: "src/orders.ts", addedRange: { start: 14, end: 16 }, removedRange: { start: 14, end: 16 }, header: "@@ -14,3 +14,3 @@" }
    ];
    const touched = symbolsTouchedByHunks(hunks, nodes);
    const ids = touched.map((t) => t.nodeId);
    expect(ids.filter((id) => id === "src/orders.ts#createOrder")).toHaveLength(1);
  });

  it("returns empty array when no nodes overlap", () => {
    const hunks: DiffHunk[] = [{ file: "src/orders.ts", addedRange: { start: 50, end: 55 }, removedRange: { start: 50, end: 55 }, header: "@@ -50,6 +50,6 @@" }];
    expect(symbolsTouchedByHunks(hunks, nodes)).toHaveLength(0);
  });

  it("handles a renamed file correctly using the new path", () => {
    const renamedNodes: GraphNode[] = [
      { id: "src/new.ts#doThing", kind: "function", name: "doThing", file: "src/new.ts", startLine: 3, endLine: 10 }
    ];
    const hunks: DiffHunk[] = [{ file: "src/new.ts", addedRange: { start: 5, end: 8 }, removedRange: { start: 5, end: 7 }, header: "@@ -5,3 +5,4 @@" }];
    const touched = symbolsTouchedByHunks(hunks, renamedNodes);
    expect(touched[0]?.nodeId).toBe("src/new.ts#doThing");
  });
});
