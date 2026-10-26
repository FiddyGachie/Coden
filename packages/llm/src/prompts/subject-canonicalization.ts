/**
 * Prompt: subject-canonicalization v1
 *
 * Normalises different phrasings of the same subject into a canonical form
 * so the conflict detector can group conflicting assertions about the same thing.
 */
import { z } from "zod";
import type { PromptDescriptor } from "../prompt-registry.js";

export const canonicalizationInputSchema = z.object({
  subjects: z.array(z.string().min(1)).min(1),
  context: z.string().optional()
});
export type CanonicalizationInput = z.infer<typeof canonicalizationInputSchema>;

export const canonicalizationOutputSchema = z.object({
  /** One entry per input subject, in the same order. */
  canonical: z.array(z.object({
    original: z.string(),
    canonical: z.string().min(1)
  }))
});
export type CanonicalizationOutput = z.infer<typeof canonicalizationOutputSchema>;

export const subjectCanonicalizationPrompt: PromptDescriptor<CanonicalizationInput, CanonicalizationOutput> = {
  name: "subject-canonicalization",
  version: "1",
  systemPrompt: `You are normalising subject phrases from a software specification.
Map each phrase to a canonical lower-case kebab-case identifier.
Synonyms must map to the same canonical form (e.g. "the database", "DB", "data store" → "database").
Return ONLY valid JSON. No markdown, no commentary.`,

  buildUserPrompt: (input: CanonicalizationInput) =>
    `${input.context ? `Context: ${input.context}\n\n` : ""}Subjects to canonicalize:
${input.subjects.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

Return JSON: { "canonical": [ { "original": "...", "canonical": "..." } ] }`,

  inputSchema: canonicalizationInputSchema,
  outputSchema: canonicalizationOutputSchema,
  repairPrompt: "Invalid JSON. Return ONLY the JSON object matching the schema."
};
