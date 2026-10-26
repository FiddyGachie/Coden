/**
 * T3.5 — Remaining checkers
 *
 * naming          — symbols/files must match a naming convention pattern
 * size-limit      — file/function must not exceed a line count
 * api-surface-stable — exported symbols must not be removed or renamed
 * semantic-llm    — LLM-backed rule with mandatory line-citation enforcement
 */
import { z } from "zod";
import type { Checker, CheckContext, CheckResult, CheckViolation } from "./checkers.js";

// Re-use the viol builder pattern (internal — not exported from checkers.ts)
const viol = (message: string, line?: number, evidence?: string): CheckViolation => {
  const v: CheckViolation = { message };
  if (line !== undefined) v.line = line;
  if (evidence !== undefined) v.evidence = evidence;
  return v;
};

const pass = (ruleId: string, elapsedMs: number): CheckResult =>
  ({ ruleId, passed: true, violations: [], elapsedMs });

const fail = (ruleId: string, violations: CheckViolation[], elapsedMs: number): CheckResult =>
  ({ ruleId, passed: violations.length === 0, violations, elapsedMs });

const time = <T>(fn: () => T): { result: T; elapsedMs: number } => {
  const start = performance.now();
  const result = fn();
  return { result, elapsedMs: Math.round(performance.now() - start) };
};

// ── naming ───────────────────────────────────────────────────────────────────

const namingParams = z.object({
  /** Pattern that symbol/file names MUST match (JS regex string). */
  pattern: z.string().min(1),
  /** What to match against: "file" (basename), "export", or "function". Default "file". */
  target: z.enum(["file", "export", "function"]).default("file"),
  /** Optional description shown in violations (e.g. "must be camelCase"). */
  description: z.string().optional()
});

export const namingChecker: Checker = {
  type: "naming",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramSchema: namingParams as z.ZodType<any>,
  run(ctx, rawParams) {
    const params = namingParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];
      let regex: RegExp;
      try {
        regex = new RegExp(params.pattern);
      } catch {
        return [viol(`naming: invalid pattern "${params.pattern}"`)];
      }

      if (params.target === "file") {
        const basename = ctx.filePath.split(/[\\/]/).pop() ?? ctx.filePath;
        if (!regex.test(basename)) {
          v.push(viol(
            `File name "${basename}" does not match naming rule${params.description ? `: ${params.description}` : ""}`,
            undefined,
            ctx.filePath
          ));
        }
        return v;
      }

      // export / function — scan source for declarations
      const lines = ctx.source.split("\n");
      const exportRegex = /export\s+(?:const|function|class|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
      let m: RegExpExecArray | null;
      while ((m = exportRegex.exec(ctx.source)) !== null) {
        const name = m[1] ?? "";
        if (!regex.test(name)) {
          const lineNum = ctx.source.slice(0, m.index).split("\n").length;
          v.push(viol(
            `Export "${name}" does not match naming rule${params.description ? `: ${params.description}` : ""}`,
            lineNum,
            lines[lineNum - 1]?.trim().slice(0, 120)
          ));
        }
      }
      return v;
    });
    return fail("naming", violations, elapsedMs);
  }
};

// ── size-limit ────────────────────────────────────────────────────────────────

const sizeLimitParams = z.object({
  /** Maximum number of lines allowed. */
  maxLines: z.number().int().positive(),
  /** What to measure: "file" or "function". Default "file". */
  target: z.enum(["file", "function"]).default("file")
});

export const sizeLimitChecker: Checker = {
  type: "size-limit",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramSchema: sizeLimitParams as z.ZodType<any>,
  run(ctx, rawParams) {
    const params = sizeLimitParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];

      if (params.target === "file") {
        const lineCount = ctx.source.split("\n").length;
        if (lineCount > params.maxLines) {
          v.push(viol(
            `File has ${lineCount} lines, exceeding the ${params.maxLines}-line limit`,
            undefined,
            ctx.filePath
          ));
        }
        return v;
      }

      // function-level: count lines between { and matching }
      // Use a simple brace counter (not full AST — acceptable for line-count heuristic)
      const lines = ctx.source.split("\n");
      let functionStart: number | null = null;
      let functionName = "";
      let depth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        // Detect function start
        const funcMatch = /(?:function\s+([A-Za-z_$][A-Za-z0-9_$]*)|(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\()/.exec(line);
        if (funcMatch && depth === 0) {
          functionName = funcMatch[1] ?? funcMatch[2] ?? "(anonymous)";
          functionStart = i;
        }

        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        depth += opens - closes;

        if (functionStart !== null && depth === 0 && i > functionStart) {
          const funcLines = i - functionStart + 1;
          if (funcLines > params.maxLines) {
            v.push(viol(
              `Function "${functionName}" has ${funcLines} lines, exceeding the ${params.maxLines}-line limit`,
              functionStart + 1,
              lines[functionStart]?.trim().slice(0, 120)
            ));
          }
          functionStart = null;
          functionName = "";
        }
      }
      return v;
    });
    return fail("size-limit", violations, elapsedMs);
  }
};

// ── api-surface-stable ────────────────────────────────────────────────────────

const apiSurfaceStableParams = z.object({
  /** List of export names that must remain present. */
  requiredExports: z.array(z.string()).min(1)
});

export const apiSurfaceStableChecker: Checker = {
  type: "api-surface-stable",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramSchema: apiSurfaceStableParams as z.ZodType<any>,
  run(ctx, rawParams) {
    const { requiredExports } = apiSurfaceStableParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      const v: CheckViolation[] = [];
      // Extract export names from source
      const exportedNames = new Set<string>();
      const exportRegex = /export\s+(?:const|function|class|type|interface|enum|default)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
      let m: RegExpExecArray | null;
      while ((m = exportRegex.exec(ctx.source)) !== null) {
        exportedNames.add(m[1] ?? "");
      }
      // Also match "export { foo, bar }"
      const namedExportRegex = /export\s*\{([^}]+)\}/g;
      while ((m = namedExportRegex.exec(ctx.source)) !== null) {
        const names = (m[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/).pop()?.trim() ?? "");
        for (const name of names) {
          if (name) exportedNames.add(name);
        }
      }

      for (const required of requiredExports) {
        if (!exportedNames.has(required)) {
          v.push(viol(
            `Required export "${required}" is missing from the API surface`,
            undefined,
            ctx.filePath
          ));
        }
      }
      return v;
    });
    return fail("api-surface-stable", violations, elapsedMs);
  }
};

// ── semantic-llm ──────────────────────────────────────────────────────────────

export type SemanticLlmFinding = {
  message: string;
  /** Line number in the file (1-based). REQUIRED — findings without it are dropped. */
  line: number;
  severity: "info" | "warn";
  evidence: string;
};

const semanticLlmParams = z.object({
  /** The rule description forwarded to the LLM prompt. */
  ruleDescription: z.string().min(10),
  /** Default severity when the LLM does not specify. */
  defaultSeverity: z.enum(["info", "warn"]).default("warn"),
  /** Pre-computed findings (injected by the forge pipeline after LLM call). */
  findings: z.array(z.object({
    message: z.string(),
    // Allow 0/negative so we can detect and drop uncited findings at runtime
    line: z.number().int(),
    severity: z.enum(["info", "warn"]).optional(),
    evidence: z.string()
  })).default([])
});

export const semanticLlmChecker: Checker = {
  type: "semantic-llm",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramSchema: semanticLlmParams as z.ZodType<any>,
  run(ctx, rawParams) {
    const params = semanticLlmParams.parse(rawParams);
    const { result: violations, elapsedMs } = time(() => {
      // findings are pre-populated by the forge pipeline; the checker only
      // validates them and enforces the line-citation requirement.
      const v: CheckViolation[] = [];
      let droppedCount = 0;

      for (const finding of params.findings) {
        // SPEC §3.5: "semantic checker rejects outputs lacking line citations"
        if (!finding.line || finding.line < 1) {
          droppedCount++;
          continue;
        }
        v.push(viol(finding.message, finding.line, finding.evidence));
      }

      if (droppedCount > 0) {
        v.push(viol(`[semantic-llm] ${droppedCount} finding(s) dropped: missing line citations`));
      }
      return v;
    });
    return fail("semantic-llm", violations, elapsedMs);
  }
};

// Re-export all for the main checkers barrel
export { pass as _pass, fail as _fail, time as _time };
