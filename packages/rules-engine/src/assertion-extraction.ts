/**
 * T3.2 — Assertion Extraction + Quote Verification
 *
 * For each document section:
 *   1. Calls the LLM assertion-extraction prompt (MockProvider in tests).
 *   2. Deterministically verifies that each `quote` field appears verbatim
 *      within the lines cited (startLine..endLine). Drops assertions where
 *      the quote cannot be found (anti-hallucination guard per SPEC §5 step 2).
 *
 * The LLM result is schema-validated (Zod) via `runTypedCall`. This function
 * is LLM-backed but the quote-verification step is purely deterministic.
 */
import type { LLMProvider } from "@warden/llm";
import { getPrompt } from "@warden/llm";
import type {
  AssertionInput,
  AssertionOutput,
  Assertion
} from "@warden/llm";
import type { DocSection } from "./doc-ingestion.js";

// ── Re-export Assertion for consumers ─────────────────────────────────────────

export type { Assertion };

/** An assertion that has passed quote verification, with source attribution. */
export type VerifiedAssertion = Assertion & {
  /** Path of the source document. */
  docPath: string;
  /** Whether the quote was found verbatim in the cited lines. Always true here
   * (failed ones are dropped). */
  quoteVerified: true;
};

/** Summary of a single section's extraction run. */
export type ExtractionResult = {
  docPath: string;
  sectionTitle: string;
  startLine: number;
  endLine: number;
  verified: VerifiedAssertion[];
  /** Count of assertions dropped because the quote couldn't be found. */
  droppedCount: number;
};

// ── Quote verification ────────────────────────────────────────────────────────

/**
 * Returns true if `quote` appears verbatim (trimmed) anywhere in the text
 * of the section lines `startLine..endLine` (1-based, inclusive).
 *
 * We search the section's raw text, not line-by-line, to handle quotes that
 * span line wrapping in the source doc.
 */
export const verifyQuote = (
  sectionText: string,
  quote: string
): boolean => {
  const trimmedQuote = quote.trim();
  if (trimmedQuote.length === 0) return false;
  return sectionText.includes(trimmedQuote);
};

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract assertions from a single section using the LLM provider.
 * Quotes are verified deterministically; hallucinated quotes are dropped.
 */
export const extractAssertions = async (
  provider: LLMProvider,
  section: DocSection,
  docPath: string,
  correlationId?: string
): Promise<ExtractionResult> => {
  const prompt = getPrompt<AssertionInput, AssertionOutput>("assertion-extraction");

  const input: AssertionInput = {
    docPath,
    sectionTitle: section.title,
    sectionText: section.text,
    startLine: section.startLine
  };

  let rawAssertions: Assertion[];
  try {
    const callOpts = {
      messages: [
        { role: "system" as const, content: prompt.systemPrompt },
        { role: "user" as const, content: prompt.buildUserPrompt(input) }
      ],
      outputSchema: prompt.outputSchema,
      ...(correlationId !== undefined ? { correlationId } : {})
    };
    const output = await provider.callTyped(callOpts);
    rawAssertions = output.assertions;
  } catch {
    // LLM failure for one section should not crash the whole forge run
    return { docPath, sectionTitle: section.title, startLine: section.startLine, endLine: section.endLine, verified: [], droppedCount: 0 };
  }

  let droppedCount = 0;
  const verified: VerifiedAssertion[] = [];

  for (const assertion of rawAssertions) {
    if (verifyQuote(section.text, assertion.quote)) {
      verified.push({ ...assertion, docPath, quoteVerified: true });
    } else {
      droppedCount++;
    }
  }

  return {
    docPath,
    sectionTitle: section.title,
    startLine: section.startLine,
    endLine: section.endLine,
    verified,
    droppedCount
  };
};

/**
 * Extract assertions from all sections of an ingested document.
 */
export const extractDocAssertions = async (
  provider: LLMProvider,
  sections: DocSection[],
  docPath: string,
  correlationId?: string
): Promise<ExtractionResult[]> => {
  const results: ExtractionResult[] = [];
  for (const section of sections) {
    // Sequential (not parallel) to avoid rate-limiting
    results.push(await extractAssertions(provider, section, docPath, correlationId));
  }
  return results;
};
