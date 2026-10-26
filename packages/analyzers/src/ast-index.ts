import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

// ── Graph types (SPEC §4.1) ───────────────────────────────────────────────────

export type NodeKind =
  | "file"
  | "function"
  | "class"
  | "variable"
  | "route"
  | "import"
  | "export";

export type GraphNode = {
  /** Stable ID — relative path for files, "path#name" for symbols. */
  id: string;
  kind: NodeKind;
  name: string;
  /** Relative path from project root. */
  file: string;
  /** 1-based start line. */
  startLine: number;
  endLine: number;
};

export type EdgeKind = "imports" | "calls" | "exports" | "defines" | "declares-route";

export type GraphEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
};

export type FileGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** SHA-256 of the source text at index time. */
  fileHash: string;
  indexedAt: string;
};

export type ProjectGraph = {
  /** Key: relative file path. */
  files: Map<string, FileGraph>;
};

// ── Cache entry ───────────────────────────────────────────────────────────────

export type CacheEntry = { hash: string; graph: FileGraph };

// ── Internal helpers ──────────────────────────────────────────────────────────

export const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const fileId = (rel: string): string => rel;
const symbolId = (rel: string, name: string): string => `${rel}#${name}`;

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "use", "all"]);

// ── Syntax-only per-file indexer ──────────────────────────────────────────────
// Uses TypeScript's createSourceFile directly (no type-checker) for speed.

const lineOf = (sf: ts.SourceFile, pos: number): number =>
  sf.getLineAndCharacterOfPosition(pos).line + 1;

const getMethodName = (node: ts.PropertyAccessExpression): string =>
  node.name.text;

export const indexFileSource = (source: string, rel: string): Omit<FileGraph, "fileHash" | "indexedAt"> => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fid = fileId(rel);

  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const totalLines = sf.getLineAndCharacterOfPosition(sf.end).line + 1;

  // File node
  nodes.push({ id: fid, kind: "file", name: rel, file: rel, startLine: 1, endLine: totalLines });

  const visit = (node: ts.Node): void => {
    // Import declarations
    if (ts.isImportDeclaration(node)) {
      const spec = (node.moduleSpecifier as ts.StringLiteral).text;
      const sid = symbolId(rel, `import:${spec}`);
      const start = lineOf(sf, node.getStart(sf));
      const end = lineOf(sf, node.getEnd());
      nodes.push({ id: sid, kind: "import", name: spec, file: rel, startLine: start, endLine: end });
      edges.push({ from: fid, to: sid, kind: "imports" });
    }

    // Export declarations
    else if (ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier ? (node.moduleSpecifier as ts.StringLiteral).text : "(re-export)";
      const sid = symbolId(rel, `export:${spec}`);
      const start = lineOf(sf, node.getStart(sf));
      const end = lineOf(sf, node.getEnd());
      if (!nodes.find((n) => n.id === sid)) {
        nodes.push({ id: sid, kind: "export", name: spec, file: rel, startLine: start, endLine: end });
      }
      edges.push({ from: fid, to: sid, kind: "exports" });
    }

    // Function declarations and arrow-function variable declarations
    else if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const sid = symbolId(rel, name);
      const start = lineOf(sf, node.getStart(sf));
      const end = lineOf(sf, node.getEnd());
      nodes.push({ id: sid, kind: "function", name, file: rel, startLine: start, endLine: end });
      edges.push({ from: fid, to: sid, kind: "defines" });
    }

    // Variable statements that export arrow functions / const functions
    else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name && ts.isIdentifier(decl.name) && decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          const name = decl.name.text;
          const sid = symbolId(rel, name);
          const start = lineOf(sf, decl.getStart(sf));
          const end = lineOf(sf, decl.getEnd());
          if (!nodes.find((n) => n.id === sid)) {
            nodes.push({ id: sid, kind: "function", name, file: rel, startLine: start, endLine: end });
            edges.push({ from: fid, to: sid, kind: "defines" });
          }
        }
      }
    }

    // Class declarations
    else if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const sid = symbolId(rel, name);
      const start = lineOf(sf, node.getStart(sf));
      const end = lineOf(sf, node.getEnd());
      nodes.push({ id: sid, kind: "class", name, file: rel, startLine: start, endLine: end });
      edges.push({ from: fid, to: sid, kind: "defines" });
    }

    // Call expressions — routes and regular calls
    else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr) && ROUTE_METHODS.has(getMethodName(expr))) {
        // Express route
        const method = getMethodName(expr).toUpperCase();
        const firstArg = node.arguments[0];
        const pattern = firstArg && ts.isStringLiteral(firstArg) ? firstArg.text : "(dynamic)";
        const rid = symbolId(rel, `route:${method}:${pattern}`);
        const startLine = lineOf(sf, node.getStart(sf));
        if (!nodes.find((n) => n.id === rid)) {
          nodes.push({ id: rid, kind: "route", name: `${method} ${pattern}`, file: rel, startLine, endLine: lineOf(sf, node.getEnd()) });
          edges.push({ from: fid, to: rid, kind: "declares-route" });
        }
      } else {
        // General call — record callee name for call-graph edges
        const calleeName = expr.getText(sf).slice(0, 120);
        const cid = symbolId(rel, `call:${calleeName}@${lineOf(sf, node.getStart(sf))}`);
        edges.push({ from: fid, to: cid, kind: "calls" });
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);

  return { nodes, edges };
};

export const indexFile = (source: string, rel: string): FileGraph => {
  const fileHash = sha256(source);
  const { nodes, edges } = indexFileSource(source, rel);
  return { nodes, edges, fileHash, indexedAt: new Date().toISOString() };
};

// ── Project indexer ───────────────────────────────────────────────────────────

export type AstIndexOptions = {
  /** Absolute path to the project root (where tsconfig.json lives). */
  root: string;
  /** Glob patterns to include (relative to root). Defaults to all .ts files. */
  include?: string[];
  /** File-hash cache — provide a persistent Map to enable incremental re-index. */
  cache?: Map<string, CacheEntry>;
};

/**
 * Indexes a TypeScript project and returns the project graph.
 * Uses syntax-only parsing (no type-checker) for speed.
 *
 * Incremental: if `cache` is provided and the file hash hasn't changed,
 * the cached FileGraph is reused without re-parsing.
 *
 * Performance target: single-file re-index ≤ 150 ms p95 (TASKS T1.2).
 */
export const indexProject = (options: AstIndexOptions): ProjectGraph => {
  const { root, include = ["**/*.ts"], cache } = options;
  const absRoot = resolve(root);

  // Resolve globs via TypeScript's host (avoids adding a glob dep).
  // Fall back to a simple recursive walk.
  const matchedFiles = resolveGlobs(absRoot, include);

  const files = new Map<string, FileGraph>();

  for (const abs of matchedFiles) {
    const rel = relative(absRoot, abs).replace(/\\/g, "/");
    let source: string;
    try { source = readFileSync(abs, "utf8"); } catch { continue; }
    const hash = sha256(source);

    if (cache) {
      const entry = cache.get(rel);
      if (entry && entry.hash === hash) { files.set(rel, entry.graph); continue; }
      const graph = indexFile(source, rel);
      cache.set(rel, { hash, graph });
      files.set(rel, graph);
    } else {
      files.set(rel, indexFile(source, rel));
    }
  }

  return { files };
};

/**
 * Re-indexes a single file in place, updating the cache.
 * Returns the new FileGraph or undefined if the file couldn't be read.
 *
 * Uses syntax-only parsing, so this is typically < 10 ms for a small file.
 */
export const reindexFile = (
  filePath: string,
  root: string,
  cache: Map<string, CacheEntry>
): FileGraph | undefined => {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, filePath);
  let source: string;
  try { source = readFileSync(abs, "utf8"); } catch { return undefined; }

  const hash = sha256(source);
  const cached = cache.get(filePath);
  if (cached && cached.hash === hash) return cached.graph;

  const graph = indexFile(source, filePath);
  cache.set(filePath, { hash, graph });
  return graph;
};

/** No-op stub kept for API compatibility with the old ts-morph implementation. */
export const resetSharedProject = (): void => { /* no-op: no shared project in the syntax-only impl */ };

// ── Glob resolver (lightweight, no extra dep) ─────────────────────────────────

const resolveGlobs = (root: string, patterns: string[]): string[] => {
  // Use the TypeScript compiler host to find files matching patterns.
  // For simple "**/*.ts" patterns we do a manual recursive walk.
  const host = ts.sys;
  const results = new Set<string>();
  for (const pattern of patterns) {
    const matched = host.readDirectory(root, [".ts"], ["node_modules", "dist", ".git"], [pattern]);
    for (const f of matched) results.add(f.replace(/\\/g, "/"));
  }
  return [...results];
};

// ── Public re-exports ─────────────────────────────────────────────────────────

export { sha256 as hashContent };
