import { z } from "zod";

export const severitySchema = z.enum(["info", "warn", "error", "critical"]);
export type Severity = z.infer<typeof severitySchema>;

export const verdictDecisionSchema = z.enum(["SHIP", "REVIEW", "BLOCK"]);
export type VerdictDecision = z.infer<typeof verdictDecisionSchema>;

export const ruleSchema = z.object({
  id: z.string().regex(/^WR-\d{3}$/),
  title: z.string().min(1),
  severity: severitySchema,
  source: z.object({ path: z.string(), line: z.number().int().positive(), quote: z.string().min(1) }),
  checker: z.enum(["forbidden-call", "import-boundary", "required-wrapper", "no-secrets"]),
  params: z.record(z.string(), z.unknown()).default({}),
  remediation: z.string().min(1)
});
export type Rule = z.infer<typeof ruleSchema>;

export const violationSchema = z.object({
  ruleId: z.string(), severity: severitySchema, message: z.string(), path: z.string(), line: z.number().int().positive().optional(), waived: z.boolean().default(false)
});
export type Violation = z.infer<typeof violationSchema>;

export const intentSchema = z.object({ task: z.string().min(1), plannedPaths: z.array(z.string()), plannedChanges: z.string().optional(), plannedDeps: z.array(z.string()).optional() });
export type Intent = z.infer<typeof intentSchema>;

export const verdictSchema = z.object({
  decision: verdictDecisionSchema,
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()).min(1),
  checksRun: z.number().int().nonnegative(),
  checksSkipped: z.array(z.string()),
  generatedAt: z.string().datetime()
});
export type Verdict = z.infer<typeof verdictSchema>;

export const rpcRequestSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.string().or(z.number()), method: z.string(), params: z.unknown().optional() });
export const rpcResponseSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.string().or(z.number()), result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string() }).optional() });

export const errorCodes = { INVALID_REQUEST: -32600, INVALID_PARAMS: -32602, METHOD_NOT_FOUND: -32601, INTERNAL_ERROR: -32603 } as const;

const secretPatterns: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /(?:github_pat|ghp)_[A-Za-z0-9_]{20,}/g,
  /(?:xox[baprs]-)[A-Za-z0-9-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

/** Removes secret values before they can reach logs, exports, or LLM providers. */
export const redactSecrets = (value: string): string => secretPatterns.reduce((result, pattern) => result.replace(pattern, "[REDACTED]"), value);
