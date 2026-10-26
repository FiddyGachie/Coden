/**
 * T3.3 — Conflict Detector
 *
 * Given a flat list of VerifiedAssertions (from T3.2), groups by
 * (normalizedSubject, predicate) and detects:
 *
 *   value_mismatch  — two assertions have the same subject+predicate but
 *                     different values (e.g. "database is PostgreSQL" vs
 *                     "database is MongoDB"). Fully deterministic.
 *   modality_clash  — one assertion says must and another says must_not for
 *                     the same subject+predicate+value. Deterministic.
 *   stale_reference — a doc mentions a module/symbol path that the AST index
 *                     cannot find. Fully deterministic (no LLM).
 *
 * LLM canonicalization (subject-canonicalization prompt) is used when a
 * MockProvider/real provider is supplied; otherwise the synonym table handles
 * common aliases.
 *
 * SPEC §5 step 3.
 */
import type { LLMProvider } from "@warden/llm";
import { getPrompt } from "@warden/llm";
import type { CanonicalizationInput, CanonicalizationOutput } from "@warden/llm";
import type { VerifiedAssertion } from "./assertion-extraction.js";
import type { ProjectGraph } from "@warden/analyzers";

// ── Conflict types ────────────────────────────────────────────────────────────

export type ConflictKind = "value_mismatch" | "modality_clash" | "stale_reference";
export type ConflictSeverity = "info" | "warn" | "error";

export type ConflictingPair = {
  kind: ConflictKind;
  severity: ConflictSeverity;
  /** First assertion in the conflict. */
  a: VerifiedAssertion;
  /** Second assertion (null for stale_reference — only one assertion involved). */
  b: VerifiedAssertion | null;
  /** Human-readable explanation of the conflict. */
  explanation: string;
  /** Suggested resolution for the approval UI. */
  suggestedResolution: string;
};

// ── Synonym table (deterministic subject normalization) ───────────────────────
// Maps common aliases to a canonical form. Keys are lowercase.

const SYNONYMS: Record<string, string> = {
  // Database
  "database":        "database",
  "db":              "database",
  "data store":      "database",
  "datastore":       "database",
  "storage":         "database",
  "persistence":     "database",
  "data layer":      "database",
  // Auth
  "authentication":  "authentication",
  "auth":            "authentication",
  "authn":           "authentication",
  // Authorization
  "authorization":   "authorization",
  "authz":           "authorization",
  "access control":  "authorization",
  // API
  "api":             "api",
  "rest api":        "api",
  "http api":        "api",
  "endpoints":       "api",
  // Caching
  "cache":           "cache",
  "caching":         "cache",
  // Testing
  "tests":           "tests",
  "testing":         "tests",
  "test suite":      "tests",
};

export const normalizeSubject = (subject: string): string => {
  const lower = subject.trim().toLowerCase();
  return SYNONYMS[lower] ?? lower;
};

// ── LLM canonicalization (optional, degrades gracefully) ─────────────────────

/**
 * Canonicalize a list of subject strings via the LLM. Returns a map of
 * original → canonical. Falls back to the synonym table if LLM fails.
 */
export const canonicalizeSubjectsWithLLM = async (
  subjects: string[],
  provider: LLMProvider,
  correlationId?: string
): Promise<Map<string, string>> => {
  const result = new Map<string, string>(subjects.map((s) => [s, normalizeSubject(s)]));
  if (subjects.length === 0) return result;

  const prompt = getPrompt<CanonicalizationInput, CanonicalizationOutput>("subject-canonicalization");
  const callOpts = {
    messages: [
      { role: "system" as const, content: prompt.systemPrompt },
      { role: "user" as const, content: prompt.buildUserPrompt({ subjects }) }
    ],
    outputSchema: prompt.outputSchema,
    ...(correlationId !== undefined ? { correlationId } : {})
  };

  try {
    const output = await provider.callTyped(callOpts);
    for (const mapping of output.canonical) {
      result.set(mapping.original, mapping.canonical.trim().toLowerCase());
    }
  } catch {
    // LLM failure: keep synonym-table fallback results
  }
  return result;
};

// ── Value incompatibility check ───────────────────────────────────────────────

/**
 * Two values are considered incompatible if they are both non-empty and
 * differ after lowercasing + trimming. This is intentionally broad — false
 * positives (e.g. "v2" vs "version 2") surface for human review, which is
 * the correct behaviour for a governance tool.
 */
const valuesConflict = (a: string, b: string): boolean => {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na.length > 0 && nb.length > 0 && na !== nb;
};

// ── Stale reference detection ─────────────────────────────────────────────────

/**
 * A stale reference occurs when an assertion mentions a TypeScript module
 * path (e.g. "src/repositories/orders.ts") that cannot be found in the
 * AST index. The check is fully deterministic.
 *
 * We look for path-like values (containing "/" or ".ts") in assertion values.
 */
export const detectStaleReferences = (
  assertions: VerifiedAssertion[],
  index: ProjectGraph
): ConflictingPair[] => {
  const conflicts: ConflictingPair[] = [];
  const indexedPaths = new Set(index.files.keys());

  for (const assertion of assertions) {
    const value = assertion.value.trim();
    // Only check path-like values
    if (!value.includes("/") && !value.endsWith(".ts") && !value.endsWith(".js")) continue;
    // Normalise: strip leading "./"
    const normalised = value.replace(/^\.\//, "");
    const found = [...indexedPaths].some((p) => p.endsWith(normalised) || p.includes(normalised));
    if (!found) {
      conflicts.push({
        kind: "stale_reference",
        severity: "warn",
        a: assertion,
        b: null,
        explanation: `"${value}" is mentioned in ${assertion.docPath}:${assertion.line} but could not be found in the repository.`,
        suggestedResolution: `Verify the path is correct or remove this assertion from the constitution.`
      });
    }
  }
  return conflicts;
};

// ── Main detector ─────────────────────────────────────────────────────────────

export type DetectionOptions = {
  /** If provided, use LLM to canonicalize subjects beyond the synonym table. */
  provider?: LLMProvider;
  /** AST index for stale reference detection. Omit to skip that check. */
  astIndex?: ProjectGraph;
  correlationId?: string;
};

export const detectConflicts = async (
  assertions: VerifiedAssertion[],
  opts: DetectionOptions = {}
): Promise<ConflictingPair[]> => {
  const conflicts: ConflictingPair[] = [];

  // 1. Build subject → canonical map
  const uniqueSubjects = [...new Set(assertions.map((a) => a.subject))];
  const canonical: Map<string, string> = opts.provider
    ? await canonicalizeSubjectsWithLLM(uniqueSubjects, opts.provider, opts.correlationId)
    : new Map(uniqueSubjects.map((s) => [s, normalizeSubject(s)]));

  // 2. Group by (canonicalSubject, predicate)
  const groups = new Map<string, VerifiedAssertion[]>();
  for (const a of assertions) {
    const canon = canonical.get(a.subject) ?? normalizeSubject(a.subject);
    const key = `${canon}::${a.predicate.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }

  // 3. Within each group, find conflicts
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;

        // modality_clash: one says "must" and the other "must_not" for same value
        if (a.value.trim().toLowerCase() === b.value.trim().toLowerCase()) {
          const aModality = (a as { modality?: string }).modality;
          const bModality = (b as { modality?: string }).modality;
          if ((aModality === "must" && bModality === "must_not") ||
              (aModality === "must_not" && bModality === "must")) {
            conflicts.push({
              kind: "modality_clash",
              severity: "error",
              a, b,
              explanation: `"${a.subject} ${a.predicate} ${a.value}" is required by ${a.docPath}:${a.line} but forbidden by ${b.docPath}:${b.line}.`,
              suggestedResolution: `Choose which document's intent should prevail, or reconcile the two.`
            });
          }
          continue; // Same value — no value_mismatch
        }

        // value_mismatch: same subject+predicate but different values
        if (valuesConflict(a.value, b.value)) {
          conflicts.push({
            kind: "value_mismatch",
            severity: "error",
            a, b,
            explanation: `"${a.subject} ${a.predicate}" is defined as "${a.value}" in ${a.docPath}:${a.line} but "${b.value}" in ${b.docPath}:${b.line}.`,
            suggestedResolution: `Decide which document is authoritative and update or remove the other.`
          });
        }
      }
    }
  }

  // 4. Stale reference detection (deterministic)
  if (opts.astIndex) {
    conflicts.push(...detectStaleReferences(assertions, opts.astIndex));
  }

  return conflicts;
};
