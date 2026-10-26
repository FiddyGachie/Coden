/**
 * Prompt registry — loads versioned prompt files and validates their
 * input/output schemas.
 *
 * Prompts live under packages/llm/src/prompts/<name>.ts and export:
 *   - `version`: string
 *   - `systemPrompt`: string
 *   - `buildUserPrompt`: (input: InputType) => string
 *   - `inputSchema`: ZodType<InputType>
 *   - `outputSchema`: ZodType<OutputType>
 *   - `repairPrompt`: string (optional)
 */
import { z } from "zod";

// ── Prompt descriptor ─────────────────────────────────────────────────────────

export type PromptDescriptor<I, O> = {
  name: string;
  version: string;
  systemPrompt: string;
  buildUserPrompt: (input: I) => string;
  // Use ZodType with three params so schemas with .default() transforms
  // (whose _input differs from _output) satisfy exactOptionalPropertyTypes.
  inputSchema: z.ZodType<I, z.ZodTypeDef, unknown>;
  outputSchema: z.ZodType<O, z.ZodTypeDef, unknown>;
  repairPrompt?: string;
};

// ── Registry ──────────────────────────────────────────────────────────────────

// All prompts are registered here statically (no dynamic import needed
// in the core path — avoids import() latency in hot loops).
import { assertionExtractionPrompt } from "./prompts/assertion-extraction.js";
import { subjectCanonicalizationPrompt } from "./prompts/subject-canonicalization.js";
import { ruleSynthesisPrompt } from "./prompts/rule-synthesis.js";
import { taskClassificationPrompt } from "./prompts/task-classification.js";
import { semanticRuleJudgePrompt } from "./prompts/semantic-rule-judge.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY = new Map<string, PromptDescriptor<any, any>>([
  [assertionExtractionPrompt.name, assertionExtractionPrompt],
  [subjectCanonicalizationPrompt.name, subjectCanonicalizationPrompt],
  [ruleSynthesisPrompt.name, ruleSynthesisPrompt],
  [taskClassificationPrompt.name, taskClassificationPrompt],
  [semanticRuleJudgePrompt.name, semanticRuleJudgePrompt]
]);

export const getPrompt = <I, O>(name: string): PromptDescriptor<I, O> => {
  const prompt = REGISTRY.get(name);
  if (!prompt) throw new Error(`Unknown prompt: "${name}". Registered: ${[...REGISTRY.keys()].join(", ")}`);
  return prompt as PromptDescriptor<I, O>;
};

export const listPrompts = (): Array<{ name: string; version: string }> =>
  [...REGISTRY.values()].map((p) => ({ name: p.name, version: p.version }));
