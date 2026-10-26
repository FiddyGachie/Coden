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

export const policyLevelSchema = z.enum(["L0", "L1", "L2", "L3"]);
export const policySchema = z.object({
  id: z.string().min(1),
  level: policyLevelSchema,
  allowedPaths: z.array(z.string()).default([]),
  requiresApprovalPaths: z.array(z.string()).default([]),
  maxChangedFiles: z.number().int().positive().default(10),
  allowedCommands: z.array(z.string()).default([])
});
export type Policy = z.infer<typeof policySchema>;

export const eventTypeSchema = z.enum(["intent", "check", "write", "revert", "verdict", "policy_denied"]);
export const eventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  type: eventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  ts: z.string().datetime()
});
export type WardenEvent = z.infer<typeof eventSchema>;

export const behaviorFindingSchema = z.object({
  kind: z.enum(["egress", "env-read", "file-write", "spawn", "api-change"]),
  severity: severitySchema,
  evidence: z.string().min(1)
});
export const behaviorReportSchema = z.object({
  runId: z.string().min(1),
  isolation: z.enum(["docker", "local-reduced"]),
  riskScore: z.number().min(0).max(100),
  findings: z.array(behaviorFindingSchema),
  generatedAt: z.string().datetime()
});
export type BehaviorReport = z.infer<typeof behaviorReportSchema>;

export const claimStatusSchema = z.enum(["active", "queued", "released", "expired"]);
export const claimSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  intent: z.string().min(1),
  paths: z.array(z.string()).min(1),
  status: claimStatusSchema,
  expiresAt: z.string().datetime()
});
export type Claim = z.infer<typeof claimSchema>;

export const trustOutcomeSchema = z.enum(["pass", "warn", "block", "reverted"]);
export const trustEventSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  taskClass: z.string().min(1),
  area: z.string().min(1),
  outcome: trustOutcomeSchema,
  weight: z.number().positive(),
  sourceRef: z.string().min(1),
  ts: z.string().datetime()
});
export type TrustEvent = z.infer<typeof trustEventSchema>;

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

export const rpcIdSchema = z.string().min(1).or(z.number().int());
export const rpcRequestSchema = z.object({ jsonrpc: z.literal("2.0"), id: rpcIdSchema, method: z.string().min(1), params: z.unknown().optional(), meta: z.object({ correlationId: z.string().min(1) }).optional() });
export const rpcResponseSchema = z.object({ jsonrpc: z.literal("2.0"), id: rpcIdSchema.nullable(), result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional() }).superRefine((value, context) => {
  if ((value.result === undefined) === (value.error === undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Response must contain exactly one of result or error." });
});

export const errorCodes = { INVALID_REQUEST: -32600, INVALID_PARAMS: -32602, METHOD_NOT_FOUND: -32601, INTERNAL_ERROR: -32603, CORE_UNAVAILABLE: 1001, CONSTITUTION_NOT_APPROVED: 1002, LLM_DISABLED: 1003, LLM_INVALID_OUTPUT: 1004, SANDBOX_UNAVAILABLE: 1005, POLICY_DENIED: 1006, TERRITORY_CONFLICT: 1007, ANALYSIS_TIMEOUT: 1008, NOT_A_GIT_REPO: 1009, DOC_PARSE_FAILED: 1010 } as const;

const secretPatterns: readonly RegExp[] = [
  // AWS access key IDs
  /AKIA[0-9A-Z]{16}/g,
  // GitHub personal access tokens (classic and fine-grained)
  /(?:github_pat|ghp)_[A-Za-z0-9_]{20,}/g,
  // Slack tokens
  /(?:xox[baprs]-)[A-Za-z0-9-]{10,}/g,
  // Bearer auth headers
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  // PEM private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // High-entropy environment variable assignments: KEY=<value ≥ 20 chars with mixed case + digit or symbol>
  // Matches lines like: STRIPE_SECRET=sk_live_abc123... or export API_KEY=...
  // Only the value portion is replaced so the key name (useful for diagnostics) is preserved.
  /(?<=[A-Z][A-Z0-9_]{3,}=)[A-Za-z0-9/+._~@!#$%^&*-]{20,}/g
];

/** Removes secret values before they can reach logs, exports, or LLM providers. */
export const redactSecrets = (value: string): string => secretPatterns.reduce((result, pattern) => result.replace(pattern, "[REDACTED]"), value);

/**
 * Checks whether a string still contains a pattern that looks like a secret after redaction.
 * Useful as a safety assertion in tests.
 */
export const containsSecret = (value: string): boolean => secretPatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(value); });

// Re-export IPC framing utilities so consumers can import from "@warden/shared" only.
export { splitFrames, encodeFrame, socketPath, type FramedMessage } from "./ipc-framing.js";
