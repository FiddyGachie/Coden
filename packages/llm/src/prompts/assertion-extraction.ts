/**
 * Prompt: assertion-extraction v1
 *
 * Extracts explicit factual assertions from a documentation section,
 * each with a verbatim quote from the source text.
 * The quote must appear character-for-character in the cited lines.
 */
import { z } from "zod";
import type { PromptDescriptor } from "../prompt-registry.js";

export const assertionInputSchema = z.object({
  docPath: z.string(),
  sectionTitle: z.string(),
  sectionText: z.string().min(1),
  startLine: z.number().int().positive()
});
export type AssertionInput = z.infer<typeof assertionInputSchema>;

export const assertionSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  value: z.string().min(1),
  /** Verbatim quote that must appear in the source text. */
  quote: z.string().min(3),
  /** 1-based line number within the doc where the quote starts. */
  line: z.number().int().positive()
});
export type Assertion = z.infer<typeof assertionSchema>;

export const assertionOutputSchema = z.object({
  assertions: z.array(assertionSchema)
});
export type AssertionOutput = z.infer<typeof assertionOutputSchema>;

export const assertionExtractionPrompt: PromptDescriptor<AssertionInput, AssertionOutput> = {
  name: "assertion-extraction",
  version: "1",
  systemPrompt: `You are an engineer analysing a project specification document.
Extract all explicit factual assertions from the given section.
An assertion is a concrete claim about the system: what database is used, what auth strategy, what a component must or must not do.
Skip vague aspirational statements ("we should consider").
For each assertion include a verbatim quote — copy the exact words from the source text, do not paraphrase.
Return ONLY valid JSON matching the schema. No markdown, no commentary.`,

  buildUserPrompt: (input: AssertionInput) =>
    `Document: ${input.docPath}
Section: ${input.sectionTitle} (starts at line ${input.startLine})

--- BEGIN SECTION ---
${input.sectionText}
--- END SECTION ---

Return JSON: { "assertions": [ { "subject": "...", "predicate": "...", "value": "...", "quote": "...", "line": <number> } ] }`,

  inputSchema: assertionInputSchema,
  outputSchema: assertionOutputSchema,
  repairPrompt: "The JSON was invalid or missing required fields. Return ONLY valid JSON with the exact schema shown above."
};
