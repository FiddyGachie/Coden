/**
 * RedactingProvider — wraps any LLMProvider and:
 *   1. Redacts secrets from every message before it leaves the machine.
 *   2. Logs call metadata (never content) at debug level.
 *   3. Caches responses keyed on (model, messages-hash) for 7 days.
 *   4. Enforces neverSendGlobs — refuses to call if any message content
 *      matches a glob pattern for sensitive files.
 *
 * CLAUDE.md §2.3: code leaves the machine only after the redaction layer.
 */
import { createHash } from "node:crypto";
import { redactSecrets } from "@warden/shared";
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions, type Message, runTypedCall } from "./provider.js";

// ── Cache entry ───────────────────────────────────────────────────────────────

type CacheEntry = {
  result: ProviderResult;
  storedAt: number; // ms since epoch
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Simple glob matcher (no external dep) ─────────────────────────────────────
// Only supports * and ** patterns — sufficient for path matching.

const globMatches = (pattern: string, value: string): boolean => {
  // **/foo should match "foo" (no parent dir) as well as "a/b/foo"
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DSTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DSTAR§\//g, "(?:.+/)?")  // "**/" = zero or more path segments
    .replace(/§DSTAR§/g, ".*");          // "**" standalone = anything
  const regex = new RegExp("^" + escaped + "$");
  return regex.test(value);
};

const matchesAnyGlob = (globs: readonly string[], text: string): boolean =>
  globs.some((g) => globMatches(g, text));

// ── RedactingProvider ─────────────────────────────────────────────────────────

export type RedactingProviderOptions = {
  /** Patterns for file paths/content that must never be sent to the LLM. */
  neverSendGlobs?: readonly string[];
  /** Disable the response cache (useful in tests). */
  disableCache?: boolean;
  /** Log function for metadata (never content). */
  log?: (meta: Record<string, unknown>) => void;
};

export class RedactingProvider implements LLMProvider {
  public readonly name: string;
  public readonly model: string;

  private readonly inner: LLMProvider;
  private readonly neverSendGlobs: readonly string[];
  private readonly cache: Map<string, CacheEntry>;
  private readonly disableCache: boolean;
  private readonly log: (meta: Record<string, unknown>) => void;

  public constructor(inner: LLMProvider, opts: RedactingProviderOptions = {}) {
    this.inner = inner;
    this.name = `redacting(${inner.name})`;
    this.model = inner.model;
    this.neverSendGlobs = opts.neverSendGlobs ?? [];
    this.cache = new Map();
    this.disableCache = opts.disableCache ?? false;
    this.log = opts.log ?? (() => { /* no-op */ });
  }

  public async call(options: CallOptions): Promise<ProviderResult> {
    const redacted = this.redactMessages(options.messages);
    this.enforceNeverSend(redacted);
    const cacheKey = this.cacheKey(redacted);

    if (!this.disableCache) {
      const hit = this.cache.get(cacheKey);
      if (hit && Date.now() - hit.storedAt < SEVEN_DAYS_MS) {
        this.log({ event: "llm_cache_hit", model: this.model, correlationId: options.correlationId });
        return hit.result;
      }
    }

    this.log({ event: "llm_call_start", model: this.model, messageCount: redacted.length, correlationId: options.correlationId });
    const result = await this.inner.call({ ...options, messages: redacted });
    this.log({ event: "llm_call_complete", model: result.model, correlationId: options.correlationId, completionTokens: result.usage?.completionTokens });

    if (!this.disableCache) {
      this.cache.set(cacheKey, { result, storedAt: Date.now() });
    }
    return result;
  }

  public async callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    return runTypedCall(this, options);
  }

  /** Evict expired cache entries. */
  public evictExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.storedAt >= SEVEN_DAYS_MS) { this.cache.delete(key); count++; }
    }
    return count;
  }

  public get cacheSize(): number { return this.cache.size; }

  private redactMessages(messages: Message[]): Message[] {
    return messages.map((m) => ({ ...m, content: redactSecrets(m.content) }));
  }

  private enforceNeverSend(messages: Message[]): void {
    if (this.neverSendGlobs.length === 0) return;
    for (const m of messages) {
      // Check each line of the content against the glob patterns
      for (const line of m.content.split("\n")) {
        if (matchesAnyGlob(this.neverSendGlobs, line.trim())) {
          throw new Error(`neverSendGlobs: message content matches restricted pattern`);
        }
      }
    }
  }

  private cacheKey(messages: Message[]): string {
    const payload = JSON.stringify({ model: this.model, messages });
    return createHash("sha256").update(payload).digest("hex");
  }
}
