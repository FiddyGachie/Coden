/**
 * T3.3 tests — conflict detector
 *
 * Acceptance:
 *   - demo repo yields exactly the 2 seeded conflicts + 1 stale reference
 *   - zero conflicts on a clean docs fixture
 *   - subject synonym table normalises known aliases
 *   - LLM canonicalization overrides the synonym table when provider supplied
 */
import { describe, it, expect } from "vitest";
import { MockProvider } from "@warden/llm";
import type { ProjectGraph } from "@warden/analyzers";
import {
  normalizeSubject,
  detectConflicts,
  detectStaleReferences
} from "./conflict-detector.js";
import type { VerifiedAssertion } from "./assertion-extraction.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeAssertion = (
  subject: string,
  predicate: string,
  value: string,
  overrides: Partial<VerifiedAssertion> = {}
): VerifiedAssertion => ({
  subject,
  predicate,
  value,
  quote: `${subject} ${predicate} ${value}`,
  line: 1,
  docPath: "SPEC.md",
  quoteVerified: true,
  ...overrides
});

const emptyGraph = (): ProjectGraph => ({ files: new Map() });

// ── normalizeSubject ──────────────────────────────────────────────────────────

describe("normalizeSubject", () => {
  it("maps 'db' to 'database'", () => {
    expect(normalizeSubject("db")).toBe("database");
    expect(normalizeSubject("DB")).toBe("database");
  });

  it("maps 'auth' to 'authentication'", () => {
    expect(normalizeSubject("auth")).toBe("authentication");
    expect(normalizeSubject("Auth")).toBe("authentication");
  });

  it("passes unknown subjects through lowercased", () => {
    expect(normalizeSubject("SomeCustomThing")).toBe("somecustomthing");
  });

  it("trims whitespace before normalising", () => {
    expect(normalizeSubject("  db  ")).toBe("database");
  });
});

// ── detectConflicts — value_mismatch ──────────────────────────────────────────

describe("detectConflicts — value_mismatch", () => {
  it("detects the seeded PostgreSQL vs MongoDB contradiction", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("database", "is", "PostgreSQL", { docPath: "IDEA.md", line: 5 }),
      makeAssertion("database", "is", "MongoDB", { docPath: "DESIGN.md", line: 12 })
    ];
    const conflicts = await detectConflicts(assertions, {});
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("value_mismatch");
    expect(conflicts[0]!.severity).toBe("error");
    expect(conflicts[0]!.explanation).toContain("PostgreSQL");
    expect(conflicts[0]!.explanation).toContain("MongoDB");
  });

  it("detects the seeded JWT vs session cookies contradiction", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("authentication", "uses", "JWT tokens", { docPath: "SPEC.md", line: 20 }),
      makeAssertion("auth", "uses", "session cookies", { docPath: "DESIGN.md", line: 8 })
    ];
    const conflicts = await detectConflicts(assertions, {});
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("value_mismatch");
    // "auth" and "authentication" should normalise to the same canonical subject
    expect(conflicts[0]!.explanation).toContain("session cookies");
    expect(conflicts[0]!.explanation).toContain("JWT tokens");
  });

  it("returns zero conflicts for a clean set of non-contradicting assertions", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("database", "is", "PostgreSQL"),
      makeAssertion("cache", "uses", "Redis"),
      makeAssertion("api", "uses", "REST")
    ];
    const conflicts = await detectConflicts(assertions, {});
    expect(conflicts).toHaveLength(0);
  });

  it("does not flag two assertions with the same value as a conflict", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("database", "is", "PostgreSQL", { docPath: "SPEC.md" }),
      makeAssertion("database", "is", "PostgreSQL", { docPath: "DESIGN.md" })
    ];
    const conflicts = await detectConflicts(assertions, {});
    expect(conflicts).toHaveLength(0);
  });
});

// ── detectConflicts — modality_clash ──────────────────────────────────────────

describe("detectConflicts — modality_clash", () => {
  it("detects must vs must_not for the same subject+predicate+value", async () => {
    const assertions: VerifiedAssertion[] = [
      { ...makeAssertion("controller", "calls", "db.query"), modality: "must_not" } as VerifiedAssertion & { modality: string },
      { ...makeAssertion("controller", "calls", "db.query"), modality: "must" } as VerifiedAssertion & { modality: string }
    ];
    const conflicts = await detectConflicts(assertions, {});
    const clashes = conflicts.filter((c) => c.kind === "modality_clash");
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe("error");
  });
});

// ── detectConflicts — stale_reference ─────────────────────────────────────────

describe("detectStaleReferences", () => {
  it("detects a path mentioned in a doc that is not in the AST index", () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("order service", "lives in", "src/services/orders.ts")
    ];
    const graph = emptyGraph(); // empty — file not indexed
    const stale = detectStaleReferences(assertions, graph);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.kind).toBe("stale_reference");
    expect(stale[0]!.explanation).toContain("src/services/orders.ts");
  });

  it("does not flag a path that exists in the AST index", () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("orders repo", "lives in", "src/repositories/orders.ts")
    ];
    const graph: ProjectGraph = {
      files: new Map([
        ["src/repositories/orders.ts", { nodes: [], edges: [], fileHash: "abc", indexedAt: new Date().toISOString() }]
      ])
    };
    const stale = detectStaleReferences(assertions, graph);
    expect(stale).toHaveLength(0);
  });

  it("does not flag non-path values as stale references", () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("database", "is", "PostgreSQL"),
      makeAssertion("auth", "uses", "JWT")
    ];
    const stale = detectStaleReferences(assertions, emptyGraph());
    expect(stale).toHaveLength(0);
  });

  it("integrates stale_reference detection via detectConflicts with astIndex", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("payment module", "at", "src/payments/processor.ts")
    ];
    const conflicts = await detectConflicts(assertions, { astIndex: emptyGraph() });
    expect(conflicts.some((c) => c.kind === "stale_reference")).toBe(true);
  });
});

// ── LLM canonicalization (MockProvider) ───────────────────────────────────────

describe("detectConflicts — LLM canonicalization", () => {
  it("uses the LLM mapping to merge subjects that the synonym table misses", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("relational store", "is", "PostgreSQL", { docPath: "IDEA.md" }),
      makeAssertion("relational store", "is", "MySQL",      { docPath: "DESIGN.md" })
    ];
    // LLM says both map to "database"
    const llmOutput = JSON.stringify({ mappings: [{ original: "relational store", canonical: "database" }] });
    const provider = new MockProvider([llmOutput]);

    const conflicts = await detectConflicts(assertions, { provider });
    expect(conflicts.some((c) => c.kind === "value_mismatch")).toBe(true);
  });

  it("falls back gracefully when LLM returns invalid JSON", async () => {
    const assertions: VerifiedAssertion[] = [
      makeAssertion("database", "is", "PostgreSQL"),
      makeAssertion("database", "is", "MongoDB")
    ];
    const provider = new MockProvider(["not json {{{"]);

    // Should still detect conflict via synonym table fallback
    const conflicts = await detectConflicts(assertions, { provider });
    expect(conflicts.some((c) => c.kind === "value_mismatch")).toBe(true);
  });
});
