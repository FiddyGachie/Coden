/**
 * T3.4 — Checker Framework + 9 Checker Implementations
 *
 * Every checker: interface, param schema, and run() implementation.
 * Single-file check must complete ≤ 300 ms p95 (all deterministic).
 *
 * Checkers implemented here:
 *   1. import-boundary     — only specific packages may import from a module
 *   2. forbidden-call      — a call pattern must not appear in source
 *   3. forbidden-dependency — a package import must not appear
 *   4. dependency-allowlist — only listed packages may be imported
 *   5. file-placement      — files must match a path glob
 *   6. required-wrapper    — a function must only be called through a wrapper
 *   7. route-requires-middleware — Express routes must include named middleware
 *   8. test-required       — every source file must have a sibling test file
 *   9. no-secrets          — source must not contain high-entropy / secret patterns
 *
 * SPEC §5 step 4. Performance budget: single-file check ≤ 300 ms p95.
 */
import { z } from "zod";
import type { FileGraph, ProjectGraph } from "@warden/analyzers";

// ── Checker result ────────────────────────────────────────────────────────────

export type CheckResult = {
  ruleId: string;
  passed: boolean;
  /** Violations found (empty when passed). */
  violations: CheckViolation[];
  /** Time taken in milliseconds. */
  elapsedMs: number;
};

export type CheckViolation = {
  message: string;
  /** 1-based line number, if determinable. */
  line?: number;
  /** Evidence snippet shown to the developer. */
  evidence?: string;
};

// ── Checker interface ─────────────────────────────────────────────────────────

export type CheckContext = {
  /** Path of the file being checked (relative to project root). */
  filePath: string;
  /** Raw source text of the file. */
  source: string;
  /** File's AST graph node (undefined when checking without AST). */
  fileGraph?: FileGraph;
  /** Full project graph (for cross-file checks). */
  projectGraph?: ProjectGraph;
};

export interface Checker {
  readonly type: string;
  // ZodType with three-param form to accept schemas with defaults/transforms
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly paramSchema: z.ZodType<any>;
  run(context: CheckContext, params: unknown): CheckResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const lineOf = (source: string, match: string): number | undefined => {
  const idx = source.indexOf(match);
  if (idx < 0) return undefined;
  return source.slice(0, idx).split("\n").length;
};

const linesOf = (source: string, match: string): number[] => {
  const lines: number[] = [];
  let pos = 0;
  while (true) {
    const idx = source.indexOf(match, pos);
    if (idx < 0) break;
    lines.push(source.slice(0, idx).split("\n").length);
    pos = idx + 1;
  }
  return lines;
};

const time = <T>(fn: () => T): { result: T; elapsedMs: number } => {
  const start = performance.now();
  const result = fn();
  return { result, elapsedMs: Math.round(performance.now() - start) };
};

const pass = (ruleId: string, elapsedMs: number): CheckResult =>
  ({ ruleId, passed: true, violations: [], elapsedMs });

const fail = (ruleId: string, violations: CheckViolation[], elapsedMs: number): CheckResult =>
  ({ ruleId, passed: violations.length === 0, violations, elapsedMs });

/** Build a CheckViolation, omitting optional fields when undefined (exactOptionalPropertyTypes). */
const viol = (message: string, line?: number, evidence?: string): CheckViolation => {
  const v: CheckViolation = { message };
  if (line !== undefined) v.line = line;
  if (evidence !== undefined) v.evidence = evidence;
  return v;
};

// ── 1. import-boundary ────────────────────────────────────────────────────────

const importBoundaryParams = z.object({
  /** Glob for the protected module (e.g. "src/db/**"). */
  protectedGlob: z.string(),
  /** Globs of files that ARE allowed to import from it. */
  allowedImporterGlobs: z.array(z.string())
});

const globToRegex = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DS§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DS§\//g, "(?:.+/)?")
    .replace(/§DS§/g, ".*");
  return new RegExp("^" + escaped + "$");
};

const matchesAnyGlob = (globs: string[], path: string): boolean =>
  globs.some((g) => globToRegex(g).test(path));

export const importBoundaryChecker: Checker = {
  type: "import-boundary",
  paramSchema: importBoundaryParams,
  run(ctx, rawParams) {
    const params = importBoundaryParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];
      // Is this file protected itself? If so skip (we check importers, not the module)
      if (matchesAnyGlob([params.protectedGlob], ctx.filePath)) return v;
      // Is this file an allowed importer? If so skip.
      if (matchesAnyGlob(params.allowedImporterGlobs, ctx.filePath)) return v;
      // Check whether source imports from the protected module path
      const importRegex = /import\s+.+?\s+from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = importRegex.exec(ctx.source)) !== null) {
        const importedPath = m[1] ?? "";
        // Resolve relative to context (rough: just check if it matches the protected glob)
        if (matchesAnyGlob([params.protectedGlob], importedPath) ||
            matchesAnyGlob([params.protectedGlob], importedPath.replace(/^\.\//, ""))) {
          v.push(viol(
            `Import from protected module "${importedPath}" is not allowed from "${ctx.filePath}"`,
            lineOf(ctx.source, m[0]),
            m[0].slice(0, 120)
          ));
        }
      }
      return v;
    });
    return fail("import-boundary", violations, elapsedMs);
  }
};

// ── 2. forbidden-call ─────────────────────────────────────────────────────────

const forbiddenCallParams = z.object({
  /** Substring or function call pattern that must not appear (e.g. "db.query("). */
  pattern: z.string().min(1)
});

export const forbiddenCallChecker: Checker = {
  type: "forbidden-call",
  paramSchema: forbiddenCallParams,
  run(ctx, rawParams) {
    const { pattern } = forbiddenCallParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const lines = linesOf(ctx.source, pattern);
      return lines.map((line) => viol(
        `Forbidden call pattern "${pattern}" found`,
        line,
        ctx.source.split("\n")[line - 1]?.trim().slice(0, 120)
      ));
    });
    return fail("forbidden-call", violations, elapsedMs);
  }
};

// ── 3. forbidden-dependency ───────────────────────────────────────────────────

const forbiddenDependencyParams = z.object({
  /** Package name that must not be imported (e.g. "lodash"). */
  packageName: z.string().min(1)
});

export const forbiddenDependencyChecker: Checker = {
  type: "forbidden-dependency",
  paramSchema: forbiddenDependencyParams,
  run(ctx, rawParams) {
    const { packageName } = forbiddenDependencyParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const pattern = `'${packageName}'`;
      const pattern2 = `"${packageName}"`;
      const lines = [...linesOf(ctx.source, pattern), ...linesOf(ctx.source, pattern2)];
      return lines.map((line) => viol(
        `Forbidden dependency "${packageName}" is imported`,
        line,
        ctx.source.split("\n")[line - 1]?.trim().slice(0, 120)
      ));
    });
    return fail("forbidden-dependency", violations, elapsedMs);
  }
};

// ── 4. dependency-allowlist ───────────────────────────────────────────────────

const dependencyAllowlistParams = z.object({
  /** Only these package names may be imported (exact match, no globs). */
  allowed: z.array(z.string())
});

export const dependencyAllowlistChecker: Checker = {
  type: "dependency-allowlist",
  paramSchema: dependencyAllowlistParams,
  run(ctx, rawParams) {
    const { allowed } = dependencyAllowlistParams.parse(rawParams);
    const allowedSet = new Set(allowed);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];
      const importRegex = /from\s+['"]([^.][^'"]*)['"]/g; // bare (non-relative) specifiers
      let m: RegExpExecArray | null;
      while ((m = importRegex.exec(ctx.source)) !== null) {
        const pkg = (m[1] ?? "").split("/")[0] ?? ""; // handle "pkg/sub"
        if (pkg && !allowedSet.has(pkg)) {
          v.push(viol(
            `Package "${pkg}" is not in the import allowlist`,
            lineOf(ctx.source, m[0]),
            m[0].slice(0, 120)
          ));
        }
      }
      return v;
    });
    return fail("dependency-allowlist", violations, elapsedMs);
  }
};

// ── 5. file-placement ─────────────────────────────────────────────────────────

const filePlacementParams = z.object({
  /** Files matching this glob MUST exist at a path matching requiredPathGlob. */
  fileGlob: z.string(),
  /** The path the file must match. */
  requiredPathGlob: z.string()
});

export const filePlacementChecker: Checker = {
  type: "file-placement",
  paramSchema: filePlacementParams,
  run(ctx, rawParams) {
    const { fileGlob, requiredPathGlob } = filePlacementParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      if (!matchesAnyGlob([fileGlob], ctx.filePath)) return [];
      if (matchesAnyGlob([requiredPathGlob], ctx.filePath)) return [];
      return [viol(`File "${ctx.filePath}" matches the placement rule but is not in the required path "${requiredPathGlob}"`, undefined, ctx.filePath)];
    });
    return fail("file-placement", violations, elapsedMs);
  }
};

// ── 6. required-wrapper ───────────────────────────────────────────────────────

const requiredWrapperParams = z.object({
  /** Pattern that must NOT appear raw (e.g. "db.query("). */
  forbiddenDirectCall: z.string().min(1),
  /** The approved wrapper that must be used instead (e.g. "repository."). */
  requiredWrapper: z.string().min(1)
});

export const requiredWrapperChecker: Checker = {
  type: "required-wrapper",
  paramSchema: requiredWrapperParams,
  run(ctx, rawParams) {
    const { forbiddenDirectCall, requiredWrapper: _wrapper } = requiredWrapperParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const lines = linesOf(ctx.source, forbiddenDirectCall);
      return lines.map((line) => viol(
        `Direct call "${forbiddenDirectCall}" is forbidden; use the approved wrapper instead`,
        line,
        ctx.source.split("\n")[line - 1]?.trim().slice(0, 120)
      ));
    });
    return fail("required-wrapper", violations, elapsedMs);
  }
};

// ── 7. route-requires-middleware ──────────────────────────────────────────────

const routeRequiresMiddlewareParams = z.object({
  /** Glob matching files that declare routes (e.g. "src/controllers/**"). */
  routeFileGlob: z.string(),
  /** The middleware name that must appear before route handlers (e.g. "authenticate"). */
  middlewareName: z.string().min(1),
  /** Route verb patterns to check (default: all). */
  verbs: z.array(z.string()).default(["get", "post", "put", "patch", "delete"])
});

export const routeRequiresMiddlewareChecker: Checker = {
  type: "route-requires-middleware",
  paramSchema: routeRequiresMiddlewareParams,
  run(ctx, rawParams) {
    const params = routeRequiresMiddlewareParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      if (!matchesAnyGlob([params.routeFileGlob], ctx.filePath)) return [];
      const v: CheckViolation[] = [];
      const lines = ctx.source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const hasVerb = params.verbs.some((verb) =>
          line.includes(`router.${verb}(`) || line.includes(`app.${verb}(`)
        );
        if (!hasVerb) continue;
        if (!line.includes(params.middlewareName)) {
          v.push(viol(
            `Route at line ${i + 1} is missing required middleware "${params.middlewareName}"`,
            i + 1,
            line.trim().slice(0, 120)
          ));
        }
      }
      return v;
    });
    return fail("route-requires-middleware", violations, elapsedMs);
  }
};

// ── 8. test-required ─────────────────────────────────────────────────────────

const testRequiredParams = z.object({
  // Glob for source files that must have tests, e.g. src double-star *.ts
  sourceGlob: z.string(),
  // Suffix for test files, default ".test.ts"
  testSuffix: z.string().default(".test.ts")
});

export const testRequiredChecker: Checker = {
  type: "test-required",
  paramSchema: testRequiredParams,
  run(ctx, rawParams) {
    const { sourceGlob, testSuffix } = testRequiredParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      if (!matchesAnyGlob([sourceGlob], ctx.filePath)) return [];
      if (ctx.filePath.includes(testSuffix) || ctx.filePath.includes(".test.")) return [];
      if (!ctx.projectGraph) return []; // Can't verify without the graph
      // Check if there's any file in the project graph whose path looks like a test for this file
      const baseName = ctx.filePath.replace(/\.[tj]sx?$/, "");
      const hasTest = [...ctx.projectGraph.files.keys()].some(
        (p) => p.startsWith(baseName) && p.includes(testSuffix.replace(".ts", ""))
      );
      if (!hasTest) {
        return [viol(`No test file found for "${ctx.filePath}" (expected "${baseName}${testSuffix}")`, undefined, ctx.filePath)];
      }
      return [];
    });
    return fail("test-required", violations, elapsedMs);
  }
};

// ── 9. no-secrets ────────────────────────────────────────────────────────────

const noSecretsParams = z.object({
  /** Extra patterns to scan for (in addition to built-in set). */
  extraPatterns: z.array(z.string()).default([])
});

// Built-in secret patterns (string-based; not used to parse code — only to scan raw text)
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,                               // AWS access key
  /(?:ghp|github_pat)_[A-Za-z0-9_]{36,255}/,        // GitHub personal access token
  /sk-[A-Za-z0-9]{20,}/,                             // OpenAI-style key
  /(?:xox[baprs])-[0-9A-Za-z-]+/,                   // Slack token
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,        // PEM private key
  /Bearer\s+[A-Za-z0-9._~+/\-]{20,}/,               // Bearer token
];

export const noSecretsChecker: Checker = {
  type: "no-secrets",
  paramSchema: noSecretsParams,
  run(ctx, rawParams) {
    const { extraPatterns } = noSecretsParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];
      const allPatterns = [
        ...SECRET_PATTERNS,
        ...extraPatterns.map((p) => new RegExp(p))
      ];
      for (const pattern of allPatterns) {
        const match = pattern.exec(ctx.source);
        if (match) {
          v.push(viol(
            `Potential secret found matching pattern ${pattern.source.slice(0, 40)}`,
            lineOf(ctx.source, match[0]),
            match[0].slice(0, 12) + "…[REDACTED]"
          ));
        }
      }
      return v;
    });
    return fail("no-secrets", violations, elapsedMs);
  }
};

// ── Registry ──────────────────────────────────────────────────────────────────

import {
  namingChecker, sizeLimitChecker, apiSurfaceStableChecker, semanticLlmChecker
} from "./checkers-extended.js";

export const CHECKER_REGISTRY = new Map<string, Checker>([
  ["import-boundary",          importBoundaryChecker],
  ["forbidden-call",           forbiddenCallChecker],
  ["forbidden-dependency",     forbiddenDependencyChecker],
  ["dependency-allowlist",     dependencyAllowlistChecker],
  ["file-placement",           filePlacementChecker],
  ["required-wrapper",         requiredWrapperChecker],
  ["route-requires-middleware", routeRequiresMiddlewareChecker],
  ["test-required",            testRequiredChecker],
  ["no-secrets",               noSecretsChecker],
  ["naming",                   namingChecker],
  ["size-limit",               sizeLimitChecker],
  ["api-surface-stable",       apiSurfaceStableChecker],
  ["semantic-llm",             semanticLlmChecker]
]);

export const getChecker = (type: string): Checker => {
  const checker = CHECKER_REGISTRY.get(type);
  if (!checker) throw new Error(`Unknown checker type: "${type}". Known: ${[...CHECKER_REGISTRY.keys()].join(", ")}`);
  return checker;
};

/**
 * Run a named checker on a context within a 300 ms budget.
 * Returns a timed-out violation if the budget is exceeded.
 */
export const runChecker = (type: string, context: CheckContext, params: unknown): CheckResult => {
  const checker = getChecker(type);
  const start = performance.now();
  const result = checker.run(context, params);
  const total = performance.now() - start;
  if (total > 300) {
    result.violations.push({
      message: `[PERF] checker "${type}" exceeded 300 ms budget (took ${Math.round(total)} ms)`,
    });
  }
  return result;
};
