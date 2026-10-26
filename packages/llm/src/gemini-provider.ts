/**
 * GeminiProvider — calls the Google Gemini API via its OpenAI-compatible endpoint.
 *
 * Google provides an OpenAI-compatible base URL so this is a thin preset
 * on top of OpenAICompatProvider. No extra dependencies required.
 *
 * Free tier: 1,500 requests/day on gemini-1.5-flash (as of 2025).
 * Get a key at https://aistudio.google.com/
 *
 * API key is read from GEMINI_API_KEY by default.
 */
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions } from "./provider.js";
import { OpenAICompatProvider, type OpenAICompatProviderOptions } from "./openai-compat-provider.js";

export type GeminiProviderOptions = {
  /** Gemini model to use. Defaults to "gemini-1.5-flash" (free tier). */
  model?: string;
  /** Env var name holding the Gemini API key. Defaults to "GEMINI_API_KEY". */
  apiKeyEnvVar?: string;
  maxRetries?: number;
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Wraps OpenAICompatProvider with Gemini-specific defaults.
 * The `name` property is set to "gemini" via the LLMProvider interface;
 * we compose rather than extend to avoid the literal-type conflict on `name`.
 */
export class GeminiProvider implements LLMProvider {
  public readonly name = "gemini" as const;
  public readonly model: string;

  private readonly inner: OpenAICompatProvider;

  public constructor(opts: GeminiProviderOptions = {}) {
    const compatOpts: OpenAICompatProviderOptions = {
      model:        opts.model        ?? "gemini-1.5-flash",
      baseUrl:      GEMINI_BASE_URL,
      apiKeyEnvVar: opts.apiKeyEnvVar ?? "GEMINI_API_KEY",
      maxRetries:   opts.maxRetries   ?? 2
    };
    this.inner = new OpenAICompatProvider(compatOpts);
    this.model = this.inner.model;
  }

  public call(options: CallOptions): Promise<ProviderResult> {
    return this.inner.call(options);
  }

  public callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    return this.inner.callTyped(options);
  }
}
