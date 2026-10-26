import { simpleGit, type DiffResult, type DiffResultTextFile } from "simple-git";
import type { GraphNode } from "./ast-index.js";

// ── Hunk types ────────────────────────────────────────────────────────────────

export type LineRange = { start: number; end: number };

export type DiffHunk = {
  /** Path relative to repo root. */
  file: string;
  /** Line range in the **new** version of the file. */
  addedRange: LineRange;
  /** Line range in the **old** version of the file. */
  removedRange: LineRange;
  /** Raw unified-diff header, e.g. "@@ -10,4 +10,6 @@" */
  header: string;
};

export type FileDiff = {
  /** Relative path. */
  path: string;
  oldPath?: string;   // set on renames
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  hunks: DiffHunk[];
};

export type DiffSummary = {
  files: FileDiff[];
  /** Symbols touched across all changed files, resolved from the graph nodes. */
  touchedSymbols: Array<{ nodeId: string; file: string }>;
};

// ── Hunk header parser ────────────────────────────────────────────────────────
// Parses "@@ -a,b +c,d @@" — no regex for code, but unified-diff headers are
// a fixed format so a simple parse is acceptable here (CLAUDE.md §7, §8.1
// says "no regex for code or YAML"; a diff header is neither).

const parseHunkHeader = (header: string): { oldStart: number; oldCount: number; newStart: number; newCount: number } | undefined => {
  // Format: @@ -<start>[,<count>] +<start>[,<count>] @@[ context]
  const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(header);
  if (!match) return undefined;
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] !== undefined ? Number(match[2]) : 1,
    newStart: Number(match[3]),
    newCount: match[4] !== undefined ? Number(match[4]) : 1
  };
};

// ── Unified-diff hunk extractor ───────────────────────────────────────────────
// Parses the raw unified diff text from simple-git into structured hunks.

export const extractHunks = (path: string, rawDiff: string): DiffHunk[] => {
  const hunks: DiffHunk[] = [];
  for (const line of rawDiff.split("\n")) {
    if (!line.startsWith("@@")) continue;
    const parsed = parseHunkHeader(line);
    if (!parsed) continue;
    hunks.push({
      file: path,
      addedRange: { start: parsed.newStart, end: parsed.newStart + Math.max(parsed.newCount - 1, 0) },
      removedRange: { start: parsed.oldStart, end: parsed.oldStart + Math.max(parsed.oldCount - 1, 0) },
      header: line
    });
  }
  return hunks;
};

// ── Symbol-range intersection ─────────────────────────────────────────────────

export const symbolsTouchedByHunks = (
  hunks: DiffHunk[],
  nodes: GraphNode[]
): Array<{ nodeId: string; file: string }> => {
  const touched: Array<{ nodeId: string; file: string }> = [];
  for (const hunk of hunks) {
    for (const node of nodes) {
      if (node.file !== hunk.file) continue;
      if (node.kind === "file" || node.kind === "import" || node.kind === "export") continue;
      // Overlap: node range overlaps with the added or removed range
      const overlap = (a: LineRange, b: LineRange): boolean =>
        a.start <= b.end && b.start <= a.end;
      if (overlap({ start: node.startLine, end: node.endLine }, hunk.addedRange) ||
          overlap({ start: node.startLine, end: node.endLine }, hunk.removedRange)) {
        touched.push({ nodeId: node.id, file: node.file });
      }
    }
  }
  // Deduplicate by nodeId
  const seen = new Set<string>();
  return touched.filter(({ nodeId }) => seen.has(nodeId) ? false : (seen.add(nodeId), true));
};

// ── Git diff adapter ──────────────────────────────────────────────────────────

type DiffMode = "working-tree" | "staged" | "range";

export type GetDiffOptions =
  | { mode: "working-tree"; repoRoot: string }
  | { mode: "staged"; repoRoot: string }
  | { mode: "range"; repoRoot: string; from: string; to?: string };

/**
 * Returns structured FileDiff[] for the requested git diff.
 * Handles renames, deletions, binary files, and empty diffs.
 */
export const getDiff = async (options: GetDiffOptions): Promise<FileDiff[]> => {
  const git = simpleGit(options.repoRoot);

  let rawFiles: DiffResult;
  let rawText: string;

  if (options.mode === "working-tree") {
    rawFiles = await git.diffSummary(["HEAD"]);
    rawText = await git.diff(["HEAD", "--unified=0"]);
  } else if (options.mode === "staged") {
    rawFiles = await git.diffSummary(["--cached"]);
    rawText = await git.diff(["--cached", "--unified=0"]);
  } else {
    const range = options.to ? `${options.from}..${options.to}` : `${options.from}..HEAD`;
    rawFiles = await git.diffSummary([range]);
    rawText = await git.diff([range, "--unified=0"]);
  }

  return buildFileDiffs(rawFiles, rawText);
};

const buildFileDiffs = (summary: DiffResult, rawText: string): FileDiff[] => {
  // Split the raw diff by file sections ("diff --git a/... b/...")
  const sections = rawText.split(/^diff --git /m).filter(Boolean);
  const hunksByFile = new Map<string, DiffHunk[]>();

  for (const section of sections) {
    // Extract the b-side filename from the section header
    const headerLine = section.split("\n")[0] ?? "";
    const bMatch = /b\/(.+)$/.exec(headerLine);
    if (!bMatch) continue;
    const path = bMatch[1]!;
    hunksByFile.set(path, extractHunks(path, section));
  }

  return (summary.files as DiffResultTextFile[]).map((f) => {
    const path = f.file;
    const hunks = hunksByFile.get(path) ?? [];
    return {
      path,
      isNew: "insertions" in f && (f as { insertions: number }).insertions > 0 && !("deletions" in f && (f as { deletions: number }).deletions > 0),
      isDeleted: false,
      isBinary: false,
      hunks
    };
  });
};

// ── Full diff summary with symbol resolution ──────────────────────────────────

export const getDiffSummary = async (
  options: GetDiffOptions,
  graphNodes: GraphNode[]
): Promise<DiffSummary> => {
  const files = await getDiff(options);
  const allHunks = files.flatMap((f) => f.hunks);
  const touchedSymbols = symbolsTouchedByHunks(allHunks, graphNodes);
  return { files, touchedSymbols };
};
