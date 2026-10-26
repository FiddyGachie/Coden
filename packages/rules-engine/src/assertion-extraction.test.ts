/**
 * T3.2 tests — assertion-extraction + quote verification
 *
 * Acceptance criteria:
 *   - test injects a hallucinated quote via MockProvider → it is dropped and counted
 *   - verified quotes pass through unchanged
 *   - LLM failure for a section is swallowed (returns empty, not a throw)
 */
import { describe, it, expect } from "vitest";
import { MockProvider } from "@warden/llm";
import { verifyQuote, extractAssertions, extractDocAssertions } from "./assertion-extraction.js";
import type { DocSection } from "./doc-ingestion.js";

const makeSection = (overrides: Partial<DocSection> = {}): DocSection => ({
  title: "Database",
  startLine: 10,
  endLine: 15,
  depth: 2,
  text: "The database is PostgreSQL. It stores all order data.",
  ...overrides
});

describe("verifyQuote", () => {
  it("returns true when the quote appears verbatim in the section text", () => {
    const text = "The database is PostgreSQL. It stores all order data.";
    expect(verifyQuote(text, "database is PostgreSQL")).toBe(true);
  });

  it("returns false when the quote does not appear in the section text", () => {
    const text = "The database is PostgreSQL.";
    expect(verifyQuote(text, "database is MongoDB")).toBe(false);
  });

  it("returns false for an empty quote", () => {
    expect(verifyQuote("Some text.", "")).toBe(false);
    expect(verifyQuote("Some text.", "   ")).toBe(false);
  });

  it("is case-sensitive (quote must match exactly)", () => {
    expect(verifyQuote("PostgreSQL is used", "postgresql is used")).toBe(false);
    expect(verifyQuote("PostgreSQL is used", "PostgreSQL is used")).toBe(true);
  });

  it("works for multi-word phrases", () => {
    const text = "Authentication uses JWT tokens issued at login.";
    expect(verifyQuote(text, "JWT tokens issued at login")).toBe(true);
  });
});

describe("extractAssertions", () => {
  it("returns verified assertions when the LLM returns a valid real quote", async () => {
    const section = makeSection();
    const validOutput = JSON.stringify({
      assertions: [{ subject: "database", predicate: "is", value: "PostgreSQL", quote: "database is PostgreSQL", line: 10 }]
    });
    const provider = new MockProvider([validOutput]);

    const result = await extractAssertions(provider, section, "DESIGN.md");
    expect(result.verified).toHaveLength(1);
    expect(result.droppedCount).toBe(0);
    expect(result.verified[0]!.docPath).toBe("DESIGN.md");
    expect(result.verified[0]!.quoteVerified).toBe(true);
  });

  it("drops a hallucinated quote (quote not in section text) and increments droppedCount", async () => {
    const section = makeSection();
    // LLM hallucinates a quote that doesn't appear in the section text
    const hallucinatedOutput = JSON.stringify({
      assertions: [
        { subject: "database", predicate: "is", value: "PostgreSQL", quote: "database is PostgreSQL", line: 10 },
        { subject: "cache",    predicate: "uses", value: "Redis",     quote: "cache uses Redis everywhere", line: 11 }
      ]
    });
    const provider = new MockProvider([hallucinatedOutput]);

    const result = await extractAssertions(provider, section, "SPEC.md");
    expect(result.verified).toHaveLength(1);     // only the real quote survives
    expect(result.droppedCount).toBe(1);          // Redis quote was hallucinated
    expect(result.verified[0]!.subject).toBe("database");
  });

  it("drops ALL assertions when all quotes are hallucinated", async () => {
    const section = makeSection({ text: "We use a relational database." });
    const allHallucinated = JSON.stringify({
      assertions: [
        { subject: "db", predicate: "is", value: "MongoDB", quote: "NoSQL document store", line: 10 },
        { subject: "db", predicate: "uses", value: "Redis", quote: "in-memory cache layer", line: 11 }
      ]
    });
    const provider = new MockProvider([allHallucinated]);

    const result = await extractAssertions(provider, section, "IDEA.md");
    expect(result.verified).toHaveLength(0);
    expect(result.droppedCount).toBe(2);
  });

  it("returns empty verified list when LLM returns invalid JSON (swallowed)", async () => {
    const section = makeSection();
    const provider = new MockProvider(["not valid json at all {{{"]);

    const result = await extractAssertions(provider, section, "DESIGN.md");
    expect(result.verified).toHaveLength(0);
    expect(result.droppedCount).toBe(0);
  });

  it("returns empty verified list when LLM output fails schema validation (swallowed)", async () => {
    const section = makeSection();
    // Missing required fields in assertions
    const badSchema = JSON.stringify({ assertions: [{ subject: "db" }] });
    const provider = new MockProvider([badSchema]);

    const result = await extractAssertions(provider, section, "DESIGN.md");
    expect(result.verified).toHaveLength(0);
  });

  it("passes correlationId through when provided", async () => {
    const section = makeSection();
    const validOutput = JSON.stringify({
      assertions: [{ subject: "database", predicate: "is", value: "PostgreSQL", quote: "database is PostgreSQL", line: 10 }]
    });
    const provider = new MockProvider([validOutput]);

    await extractAssertions(provider, section, "SPEC.md", "corr-abc-123");
    // The provider records the call; correlationId should be on the record
    expect(provider.calls[0]!.correlationId).toBe("corr-abc-123");
  });
});

describe("extractDocAssertions", () => {
  it("processes all sections in order and aggregates results", async () => {
    const sections: DocSection[] = [
      makeSection({ title: "Database", text: "Uses PostgreSQL for persistence.", startLine: 1, endLine: 5 }),
      makeSection({ title: "Auth", text: "Authentication uses JWT tokens.", startLine: 6, endLine: 10 })
    ];
    const outputs = [
      JSON.stringify({ assertions: [{ subject: "db", predicate: "uses", value: "PostgreSQL", quote: "Uses PostgreSQL", line: 1 }] }),
      JSON.stringify({ assertions: [{ subject: "auth", predicate: "uses", value: "JWT", quote: "Authentication uses JWT tokens", line: 6 }] })
    ];
    const provider = new MockProvider(outputs);

    const results = await extractDocAssertions(provider, sections, "SPEC.md");
    expect(results).toHaveLength(2);
    expect(results[0]!.sectionTitle).toBe("Database");
    expect(results[0]!.verified).toHaveLength(1);
    expect(results[1]!.sectionTitle).toBe("Auth");
    expect(results[1]!.verified).toHaveLength(1);
  });

  it("returns an empty array when given no sections", async () => {
    const provider = new MockProvider(["unused"]);
    const results = await extractDocAssertions(provider, [], "SPEC.md");
    expect(results).toHaveLength(0);
  });
});
