/**
 * T3.1 — Doc Ingestion
 *
 * Reads Markdown documents, computes SHA-256 hashes, and splits each into
 * sections keyed by heading. Uses the remark AST (never regex) so that
 * fenced code blocks and inline formatting don't confuse section boundaries.
 *
 * SPEC §5 step 1: "read docs, hash, split into sections by Markdown headings
 * (use a Markdown AST parser, e.g. `remark`; not regex). Record line ranges."
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Heading, RootContent } from "mdast";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single heading-delimited section of a Markdown document. */
export type DocSection = {
  /** Heading text, or "(preamble)" for content before the first heading. */
  title: string;
  /** 1-based line number where this section starts (the heading line itself). */
  startLine: number;
  /** 1-based line number of the last line in this section (inclusive). */
  endLine: number;
  /** The raw Markdown text of this section (heading + body). */
  text: string;
  /** Heading depth (1 = H1, 2 = H2, …, 0 = preamble pseudo-section). */
  depth: number;
};

/** A fully-ingested document with its sections and metadata. */
export type IngestedDoc = {
  /** Absolute path on disk. */
  path: string;
  /** Short display name (basename without path). */
  name: string;
  /** SHA-256 hex digest of the raw file content. */
  hash: string;
  /** All sections in document order. */
  sections: DocSection[];
  /** Total line count. */
  lineCount: number;
};

// ── Default document candidates ───────────────────────────────────────────────

export const DEFAULT_DOC_NAMES = [
  "IDEA.md",
  "SPEC.md",
  "DESIGN.md",
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  "memory/constitution.md",
  ".specify/memory/constitution.md"
] as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

const sha256 = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

/**
 * Extract heading text from a remark Heading node.
 * Concatenates all literal text children.
 */
const headingText = (node: Heading): string =>
  node.children
    .map((child: RootContent) => ("value" in child ? (child as { value: string }).value : ""))
    .join("");

/**
 * Split raw Markdown content into sections using the remark AST.
 * Returns sections in document order; content before the first heading
 * is returned as a "(preamble)" section (depth 0) if non-empty.
 */
export const splitSections = (content: string): DocSection[] => {
  const lines = content.split("\n");
  const totalLines = lines.length;

  const tree: Root = unified().use(remarkParse).parse(content);

  // Collect heading positions from the AST
  const headings: Array<{ depth: number; title: string; line: number }> = [];
  for (const node of tree.children as RootContent[]) {
    if (node.type === "heading" && node.position) {
      headings.push({
        depth: node.depth,
        title: headingText(node),
        line: node.position.start.line // 1-based
      });
    }
  }

  const sections: DocSection[] = [];

  // Build boundary pairs: each section runs from its heading line to just
  // before the next heading (or end of file).
  const boundaries: Array<{ startLine: number; endLine: number; titleLine: number; title: string; depth: number }> = [];

  if (headings.length === 0) {
    // Entire document is a single preamble
    boundaries.push({ startLine: 1, endLine: totalLines, titleLine: 0, title: "(preamble)", depth: 0 });
  } else {
    // Preamble (if any content before first heading)
    const firstHeadingLine = headings[0]!.line;
    if (firstHeadingLine > 1) {
      boundaries.push({ startLine: 1, endLine: firstHeadingLine - 1, titleLine: 0, title: "(preamble)", depth: 0 });
    }
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i]!;
      const nextStart = headings[i + 1]?.line ?? totalLines + 1;
      boundaries.push({ startLine: h.line, endLine: nextStart - 1, titleLine: h.line, title: h.title, depth: h.depth });
    }
  }

  for (const b of boundaries) {
    const sectionLines = lines.slice(b.startLine - 1, b.endLine);
    const text = sectionLines.join("\n");
    if (text.trim().length === 0) continue; // skip empty sections
    sections.push({
      title: b.title,
      startLine: b.startLine,
      endLine: b.endLine,
      text,
      depth: b.depth
    });
  }

  return sections;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ingest a single Markdown file. Returns null if the file doesn't exist
 * (missing docs are tolerated per SPEC §5 step 1).
 */
export const ingestDoc = async (filePath: string): Promise<IngestedDoc | null> => {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return {
    path: filePath,
    name,
    hash: sha256(content),
    sections: splitSections(content),
    lineCount: content.split("\n").length
  };
};

/**
 * Ingest all default doc candidates from a project root directory.
 * Missing files are silently skipped; at least one doc must exist or
 * the returned array is empty (caller should warn).
 */
export const ingestProjectDocs = async (
  projectRoot: string,
  extraPaths: string[] = []
): Promise<IngestedDoc[]> => {
  const candidates = [
    ...DEFAULT_DOC_NAMES.map((name) => resolve(projectRoot, name)),
    ...extraPaths.map((p) => resolve(projectRoot, p))
  ];

  const results = await Promise.all(candidates.map((p) => ingestDoc(p)));
  return results.filter((r): r is IngestedDoc => r !== null);
};
