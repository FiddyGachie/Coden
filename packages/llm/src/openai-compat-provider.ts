/**
 * OpenAICompatProvider — calls any OpenAI-compatible chat-completions endpoint.
 *
 * Works with OpenAI, local LLMs (Ollama, LM Studio), Azure OpenAI, etc.
 * API key is optional (some local servers don't require auth).
 */
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions, runTypedCall, LLMError } from "./provider.js";
import { errorCodes } from "@warden/shared";

export type OpenAICompatProviderOptions = {
  model?: string;
  baseUrl?: string;
  apiKeyEnvVar?: string;
  maxRetries?: number;
};

type OAIMessage = { role: string; content: string };
type OAIRequest = { model: string; messages: OAIMessage[]; max_tokens?: number; temperature?: number };
type OAIResponse = { choices: Array<{ message: { content: string | null } }>; model: string; usage?: { prompt_tokens: number; completion_tokens: number } };

export class OpenAICompatProvider implements LLMProvider {
  public readonly name = "openai-compat";
  public readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKeyEnvVar: string | undefined;
  private readonly maxRetries: number;

  public constructor(opts: OpenAICompatProviderOptions = {}) {
    this.model = opts.model ?? "gpt-4o-mini";
    this.baseUrl = (opts.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    this.apiKeyEnvVar = opts.apiKeyEnvVar ?? "OPENAI_API_KEY";
    this.maxRetries = opts.maxRetries ?? 2;
  }

  public async call(options: CallOptions): Promise<ProviderResult> {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const apiKey = this.apiKeyEnvVar ? process.env[this.apiKeyEnvVar] : undefined;

    const body: OAIRequest = {
      model: this.model,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      temperature: options.temperature ?? 0
    };

    return this.callWithRetry(body, apiKey, options.signal, 0);
  }

  public async callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    return runTypedCall(this, options);
  }

  private async callWithRetry(
    body: OAIRequest,
    apiKey: string | undefined,
    signal: AbortSignal | undefined,
    attempt: number
  ): Promise<ProviderResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal ?? null
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt < this.maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        await sleep(delay, signal);
        return this.callWithRetry(body, apiKey, signal, attempt + 1);
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "(unreadable)");
      throw new LLMError(`OpenAI-compat API error ${response.status}: ${text.slice(0, 200)}`, errorCodes.CORE_UNAVAILABLE);
    }

    const data = await response.json() as OAIResponse;
    const text = data.choices[0]?.message.content ?? "";
    const result: ProviderResult = { text, model: data.model };
    if (data.usage) {
      result.usage = { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens };
    }
    return result;
  }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
