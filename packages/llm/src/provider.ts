/**
 * Core LLM provider interface.
 *
 * Every provider must implement this contract. All outputs are
 * schema-validated (Zod) and secrets are redacted before the call leaves
 * the machine. LLM calls must never be the sole basis for a BLOCK decision.
 *
 * Error codes from SPEC §1.3:
 *   LLM_INVALID_OUTPUT = 1004 — output failed schema validation after repair
 *   LLM_DISABLED       = 1003 — offline mode is active
 */
import { z } from "zod";
import { errorCodes } from "@warden/shared";

// ── Message types ─────────────────────────────────────────────────────────────

export const messageRoleSchema = z.enum(["system", "user", "assistant"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1)
});
export type Message = z.infer<typeof messageSchema>;

// ── Provider call options ─────────────────────────────────────────────────────

export type CallOptions = {
  messages: Message[];
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Temperature (0–1). Defaults to 0 for structured output. */
  temperature?: number;
  /** AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
  /** A unique correlation ID for log correlation. */
  correlationId?: string;
};

// ── Provider result ───────────────────────────────────────────────────────────

export type ProviderResult = {
  /** Raw text returned by the model. */
  text: string;
  /** Model name actually used (may differ from requested). */
  model: string;
  /** Approximate token counts (best-effort). */
  usage?: { promptTokens: number; completionTokens: number };
};

// ── Typed LLM output (schema-validated call) ──────────────────────────────────

export type TypedCallOptions<T> = CallOptions & {
  /** Zod schema the output must satisfy. */
  outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /**
   * Optional repair prompt to append when the output fails schema validation.
   * The invalid output is appended as assistant turn and the repair prompt
   * as a new user turn, then one more call is made.
   */
  repairPrompt?: string;
};

// ── Provider interface ────────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Raw text call — use this only when you do not need structured output. */
  call(options: CallOptions): Promise<ProviderResult>;
  /** Schema-validated structured call. Retries once with a repair prompt on failure. */
  callTyped<T>(options: TypedCallOptions<T>): Promise<T>;
}

// ── Warden LLM error ─────────────────────────────────────────────────────────

export class LLMError extends Error {
  public readonly code: number;
  public constructor(message: string, code: number) {
    super(message);
    this.name = "LLMError";
    this.code = code;
  }
}

export const LLM_DISABLED_ERROR = (): LLMError =>
  new LLMError("LLM is disabled (offline mode)", errorCodes.LLM_DISABLED);

export const LLM_INVALID_OUTPUT_ERROR = (detail: string): LLMError =>
  new LLMError(`LLM output failed schema validation: ${detail}`, errorCodes.LLM_INVALID_OUTPUT);

// ── Shared typed-call implementation (used by all providers) ──────────────────

export const runTypedCall = async <T>(
  provider: LLMProvider,
  options: TypedCallOptions<T>
): Promise<T> => {
  const { outputSchema, repairPrompt, ...callOpts } = options;

  const firstResult = await provider.call(callOpts);
  const firstParsed = tryParseJson<T>(firstResult.text, outputSchema);
  if (firstParsed.ok) return firstParsed.value;

  // Attempt one repair pass if a repairPrompt is configured
  if (repairPrompt) {
    const repairMessages: Message[] = [
      ...callOpts.messages,
      { role: "assistant", content: firstResult.text },
      { role: "user", content: `${repairPrompt}\n\nThe previous output was:\n${firstResult.text}\n\nError: ${firstParsed.error}` }
    ];
    const repairResult = await provider.call({ ...callOpts, messages: repairMessages });
    const repairParsed = tryParseJson<T>(repairResult.text, outputSchema);
    if (repairParsed.ok) return repairParsed.value;
    throw LLM_INVALID_OUTPUT_ERROR(`${repairParsed.error} (after repair attempt)`);
  }

  throw LLM_INVALID_OUTPUT_ERROR(firstParsed.error);
};

// ── JSON extraction helper ────────────────────────────────────────────────────

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const tryParseJson = <T>(text: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): ParseResult<T> => {
  // Strip markdown code fences if the model wrapped the JSON
  const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, error: `Not valid JSON: ${stripped.slice(0, 200)}` };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message.slice(0, 400) };
};
