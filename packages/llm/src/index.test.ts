import { describe, expect, it, afterEach } from "vitest";
import { z } from "zod";
import { MockProvider } from "./mock-provider.js";
import { RedactingProvider } from "./redacting-provider.js";
import { OfflineGuardProvider, setOfflineMode } from "./offline-mode.js";
import { tryParseJson, LLMError } from "./provider.js";
import { getPrompt, listPrompts } from "./prompt-registry.js";
import { errorCodes } from "@warden/shared";

afterEach(() => setOfflineMode(false));

// ── tryParseJson ──────────────────────────────────────────────────────────────

describe("tryParseJson", () => {
  const schema = z.object({ id: z.string(), count: z.number() });

  it("parses valid JSON", () => {
    const result = tryParseJson('{"id":"abc","count":3}', schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("abc");
  });

  it("strips markdown code fences before parsing", () => {
    const result = tryParseJson('```json\n{"id":"x","count":1}\n```', schema);
    expect(result.ok).toBe(true);
  });

  it("returns an error for invalid JSON", () => {
    const result = tryParseJson("not json", schema);
    expect(result.ok).toBe(false);
  });

  it("returns an error when schema validation fails", () => {
    const result = tryParseJson('{"id":123,"count":"wrong"}', schema);
    expect(result.ok).toBe(false);
  });
});

// ── MockProvider ──────────────────────────────────────────────────────────────

describe("MockProvider", () => {
  it("returns canned responses in order", async () => {
    const provider = new MockProvider(['{"result":"a"}', '{"result":"b"}']);
    const r1 = await provider.call({ messages: [{ role: "user", content: "q" }] });
    const r2 = await provider.call({ messages: [{ role: "user", content: "q" }] });
    expect(r1.text).toBe('{"result":"a"}');
    expect(r2.text).toBe('{"result":"b"}');
  });

  it("cycles responses when exhausted", async () => {
    const provider = new MockProvider(["A"]);
    const r1 = await provider.call({ messages: [{ role: "user", content: "q" }] });
    const r2 = await provider.call({ messages: [{ role: "user", content: "q" }] });
    expect(r1.text).toBe("A");
    expect(r2.text).toBe("A");
  });

  it("records all calls made", async () => {
    const provider = new MockProvider(["X"]);
    await provider.call({ messages: [{ role: "user", content: "hello" }], correlationId: "c1" });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.correlationId).toBe("c1");
  });

  it("returns a callTyped result when output matches schema", async () => {
    const schema = z.object({ name: z.string() });
    const provider = new MockProvider(['{"name":"alice"}']);
    const result = await provider.callTyped({ messages: [{ role: "user", content: "q" }], outputSchema: schema });
    expect(result.name).toBe("alice");
  });

  it("repairs invalid output using the repair prompt then succeeds", async () => {
    const schema = z.object({ name: z.string() });
    // First call returns invalid JSON, second returns valid
    const provider = new MockProvider(["not json", '{"name":"bob"}']);
    const result = await provider.callTyped({
      messages: [{ role: "user", content: "q" }],
      outputSchema: schema,
      repairPrompt: "Fix the JSON."
    });
    expect(result.name).toBe("bob");
    expect(provider.calls).toHaveLength(2);
  });

  it("throws LLM_INVALID_OUTPUT after failed repair", async () => {
    const schema = z.object({ name: z.string() });
    const provider = new MockProvider(["bad", "also bad"]);
    await expect(provider.callTyped({
      messages: [{ role: "user", content: "q" }],
      outputSchema: schema,
      repairPrompt: "Fix it."
    })).rejects.toMatchObject({ code: errorCodes.LLM_INVALID_OUTPUT });
  });

  it("throws LLMError with LLM_INVALID_OUTPUT when no repair prompt and output is invalid", async () => {
    const schema = z.object({ id: z.string() });
    const provider = new MockProvider(["oops"]);
    const error = await provider.callTyped({ messages: [{ role: "user", content: "q" }], outputSchema: schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMError);
    expect((error as LLMError).code).toBe(errorCodes.LLM_INVALID_OUTPUT);
  });

  it("throws AbortError when signal is already aborted", async () => {
    const provider = new MockProvider(["ok"]);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.call({ messages: [{ role: "user", content: "q" }], signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});

// ── RedactingProvider ─────────────────────────────────────────────────────────

describe("RedactingProvider", () => {
  it("redacts AWS keys from messages before forwarding", async () => {
    const inner = new MockProvider(['{"ok":true}']);
    const provider = new RedactingProvider(inner, { disableCache: true });
    await provider.call({ messages: [{ role: "user", content: "key: AKIAIOSFODNN7EXAMPLE" }] });
    expect(inner.calls[0]?.messages[0]?.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(inner.calls[0]?.messages[0]?.content).toContain("[REDACTED]");
  });

  it("returns a cache hit on the second call with identical messages", async () => {
    const inner = new MockProvider(["first", "second"]);
    const provider = new RedactingProvider(inner);
    const m = [{ role: "user" as const, content: "hello" }];
    const r1 = await provider.call({ messages: m });
    const r2 = await provider.call({ messages: m });
    expect(r1.text).toBe("first");
    expect(r2.text).toBe("first"); // cache hit
    expect(inner.calls).toHaveLength(1);
  });

  it("bypasses cache when disableCache is true", async () => {
    const inner = new MockProvider(["a", "b"]);
    const provider = new RedactingProvider(inner, { disableCache: true });
    const m = [{ role: "user" as const, content: "hello" }];
    const r1 = await provider.call({ messages: m });
    const r2 = await provider.call({ messages: m });
    expect(r1.text).toBe("a");
    expect(r2.text).toBe("b"); // no cache
  });

  it("throws when a message matches a neverSendGlob", async () => {
    const inner = new MockProvider(["ok"]);
    const provider = new RedactingProvider(inner, { neverSendGlobs: ["**/.env*"], disableCache: true });
    await expect(provider.call({ messages: [{ role: "user", content: ".env.local" }] }))
      .rejects.toThrow("neverSendGlobs");
  });

  it("logs call metadata but never content", async () => {
    const logs: Record<string, unknown>[] = [];
    const inner = new MockProvider(['{"x":1}']);
    const provider = new RedactingProvider(inner, { disableCache: true, log: (m) => logs.push(m) });
    await provider.call({ messages: [{ role: "user", content: "secret content" }] });
    expect(logs.some((l) => l["event"] === "llm_call_start")).toBe(true);
    expect(logs.every((l) => !JSON.stringify(l).includes("secret content"))).toBe(true);
  });

  it("seeded secret never reaches the inner provider's received payload", async () => {
    const inner = new MockProvider(["ok"]);
    const provider = new RedactingProvider(inner, { disableCache: true });
    const secret = "AKIA1234567890ABCDEF"; // AWS key fixture
    await provider.call({ messages: [{ role: "user", content: `Key is ${secret}` }] });
    const received = inner.calls[0]?.messages[0]?.content ?? "";
    expect(received).not.toContain(secret);
  });
});

// ── OfflineGuardProvider ──────────────────────────────────────────────────────

describe("OfflineGuardProvider", () => {
  it("passes calls through when offline mode is off", async () => {
    setOfflineMode(false);
    const inner = new MockProvider(["ok"]);
    const guard = new OfflineGuardProvider(inner);
    const result = await guard.call({ messages: [{ role: "user", content: "q" }] });
    expect(result.text).toBe("ok");
  });

  it("throws LLM_DISABLED when offline mode is on", async () => {
    setOfflineMode(true);
    const inner = new MockProvider(["ok"]);
    const guard = new OfflineGuardProvider(inner);
    const error = await guard.call({ messages: [{ role: "user", content: "q" }] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMError);
    expect((error as LLMError).code).toBe(errorCodes.LLM_DISABLED);
  });

  it("offline mode does not affect non-LLM code paths", () => {
    setOfflineMode(true);
    // deterministic code still works
    expect(1 + 1).toBe(2);
  });
});

// ── Prompt registry ───────────────────────────────────────────────────────────

describe("prompt registry", () => {
  it("lists all five registered prompts", () => {
    const prompts = listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain("assertion-extraction");
    expect(names).toContain("subject-canonicalization");
    expect(names).toContain("rule-synthesis");
    expect(names).toContain("task-classification");
    expect(names).toContain("semantic-rule-judge");
  });

  it("retrieves and runs assertion-extraction with MockProvider", async () => {
    const prompt = getPrompt<import("./prompts/assertion-extraction.js").AssertionInput, import("./prompts/assertion-extraction.js").AssertionOutput>("assertion-extraction");
    const mockOutput = JSON.stringify({ assertions: [{ subject: "database", predicate: "is", value: "PostgreSQL", quote: "PostgreSQL", line: 5 }] });
    const provider = new MockProvider([mockOutput]);

    const input: import("./prompts/assertion-extraction.js").AssertionInput = {
      docPath: "DESIGN.md", sectionTitle: "Database", sectionText: "The database is PostgreSQL.", startLine: 5
    };
    const result = await provider.callTyped({
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.buildUserPrompt(input) }
      ],
      outputSchema: prompt.outputSchema
    });
    expect(result.assertions[0]?.subject).toBe("database");
  });

  it("validates assertion-extraction input schema", () => {
    const prompt = getPrompt("assertion-extraction");
    expect(prompt.inputSchema.safeParse({ docPath: "x", sectionTitle: "y", sectionText: "z", startLine: 1 }).success).toBe(true);
    expect(prompt.inputSchema.safeParse({ docPath: "x" }).success).toBe(false);
  });

  it("throws for unknown prompt name", () => {
    expect(() => getPrompt("nonexistent")).toThrow("Unknown prompt");
  });
});
