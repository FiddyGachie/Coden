/**
 * Prompt: semantic-rule-judge v1
 *
 * Used by the "semantic-llm" checker to evaluate whether a code change
 * violates a rule that cannot be expressed deterministically.
 * Every finding MUST cite the exact source lines; uncited findings are dropped.
 */
import { z } from "zod";
import type { PromptDescriptor } from "../prompt-registry.js";

export const semanticJudgeInputSchema = z.object({
  ruleId: z.string(),
  ruleTitle: z.string(),
  ruleDescription: z.string(),
  sourceDocPath: z.string(),
  sourceDocLines: z.string(),
  /** The code diff or source text to evaluate. */
  codeText: z.string(),
  filePath: z.string()
});
export type SemanticJudgeInput = z.infer<typeof semanticJudgeInputSchema>;

export const semanticFindingSchema = z.object({
  violated: z.boolean(),
  /** If violated, the exact line in the code where the violation occurs. */
  violationLine: z.number().int().positive().optional(),
  /** Verbatim evidence quote from the code text. Required if violated=true. */
  evidenceQuote: z.string().optional(),
  /** Citation of the rule source (doc path + line). */
  sourceDocLine: z.number().int().positive(),
  explanation: z.string()
});
export type SemanticFinding = z.infer<typeof semanticFindingSchema>;

export const semanticJudgeOutputSchema = z.object({
  finding: semanticFindingSchema
});
export type SemanticJudgeOutput = z.infer<typeof semanticJudgeOutputSchema>;

export const semanticRuleJudgePrompt: PromptDescriptor<SemanticJudgeInput, SemanticJudgeOutput> = {
  name: "semantic-rule-judge",
  version: "1",
  systemPrompt: `You are a strict code reviewer checking whether a code change violates a specific rule.
If the rule is violated, you MUST provide the exact line number and a verbatim evidence quote from the code.
Findings without line citations will be discarded. Do not invent violations.
Return ONLY valid JSON. No markdown.`,

  buildUserPrompt: (input: SemanticJudgeInput) =>
    `Rule ${input.ruleId}: ${input.ruleTitle}
Description: ${input.ruleDescription}
Source: ${input.sourceDocPath}
Relevant doc lines:
${input.sourceDocLines}

File: ${input.filePath}
Code:
\`\`\`typescript
${input.codeText.slice(0, 3000)}
\`\`\`

Return JSON: { "finding": { "violated": true/false, "violationLine": <n or omit>, "evidenceQuote": "<exact text or omit>", "sourceDocLine": <n>, "explanation": "..." } }`,

  inputSchema: semanticJudgeInputSchema,
  outputSchema: semanticJudgeOutputSchema,
  repairPrompt: "Invalid JSON. If violated=true, evidenceQuote and violationLine are required. Return ONLY valid JSON."
};
