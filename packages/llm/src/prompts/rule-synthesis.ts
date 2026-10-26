/**
 * Prompt: rule-synthesis v1
 *
 * Given a set of approved assertions, proposes a set of machine-checkable
 * rules using only the supported checker types in the catalog.
 * Invalid checker types or params are rejected at the engine level.
 */
import { z } from "zod";
import type { PromptDescriptor } from "../prompt-registry.js";

const CHECKER_CATALOG = [
  "forbidden-call", "import-boundary", "required-wrapper",
  "route-requires-middleware", "no-secrets", "test-required",
  "file-placement", "forbidden-dependency", "dependency-allowlist",
  "naming", "size-limit", "api-surface-stable", "semantic-llm"
] as const;

export const ruleSynthesisInputSchema = z.object({
  assertions: z.array(z.object({
    subject: z.string(),
    predicate: z.string(),
    value: z.string(),
    quote: z.string(),
    docPath: z.string(),
    line: z.number().int().positive()
  })),
  existingRuleIds: z.array(z.string()).default([])
});
export type RuleSynthesisInput = z.infer<typeof ruleSynthesisInputSchema>;

export const proposedRuleSchema = z.object({
  id: z.string().regex(/^WR-\d{3}$/),
  title: z.string().min(1),
  severity: z.enum(["info", "warn", "error", "critical"]),
  checker: z.enum(CHECKER_CATALOG),
  params: z.record(z.string(), z.unknown()).default({}),
  remediation: z.string().min(1),
  sourceDocPath: z.string(),
  sourceLine: z.number().int().positive(),
  sourceQuote: z.string()
});
export type ProposedRule = z.infer<typeof proposedRuleSchema>;

export const ruleSynthesisOutputSchema = z.object({
  rules: z.array(proposedRuleSchema)
});
export type RuleSynthesisOutput = z.infer<typeof ruleSynthesisOutputSchema>;

export const ruleSynthesisPrompt: PromptDescriptor<RuleSynthesisInput, RuleSynthesisOutput> = {
  name: "rule-synthesis",
  version: "1",
  systemPrompt: `You are a software architect synthesising machine-checkable rules from documentation assertions.
For each assertion that implies a concrete code constraint, propose one rule.
Only use checker types from this catalog: ${CHECKER_CATALOG.join(", ")}.
Assign the next available WR-NNN id (continuing from the highest existing id).
Set severity: "error" for must-not violations, "warn" for should-not, "info" for style.
Every rule must cite the exact source document, line number, and verbatim quote.
Return ONLY valid JSON. No markdown.`,

  buildUserPrompt: (input: RuleSynthesisInput) =>
    `Existing rule IDs: ${input.existingRuleIds.join(", ") || "none"}

Assertions:
${input.assertions.map((a, i) => `${i + 1}. [${a.docPath}:${a.line}] ${a.subject} ${a.predicate} ${a.value}\n   Quote: "${a.quote}"`).join("\n")}

Return JSON: { "rules": [ { "id":"WR-NNN", "title":"...", "severity":"error|warn|info|critical", "checker":"<type>", "params":{}, "remediation":"...", "sourceDocPath":"...", "sourceLine":<n>, "sourceQuote":"..." } ] }`,

  inputSchema: ruleSynthesisInputSchema,
  outputSchema: ruleSynthesisOutputSchema,
  repairPrompt: "Invalid JSON or invalid checker type. Only use checkers from the catalog. Return ONLY valid JSON."
};
