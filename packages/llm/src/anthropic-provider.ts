/**
 * AnthropicProvider — calls the Anthropic Messages API.
 *
 * Never logs message content at info level (CLAUDE.md §7).
 * API key is read from the environment at call time (never stored in the
 * provider object itself — it must come from VS Code SecretStorage in the
 * extension, injected as an env var for the core process).
 */
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions, runTypedCall, LLMError } from "./provider.js";
import { errorCodes } from "@warden/shared";

export type AnthropicProviderOptions = {
  model?: string;
  apiKeyEnvVar?: string;
  /** Base URL override for testing against a local proxy. */
  baseUrl?: string;
  maxRetries?: number;
};

type AnthropicMessage = { role: "user" | "assistant"; content: string };
type AnthropicRequest = {
  model: string;
  max_tokens: number;
  temperature: number;
  system?: string;
  messages: AnthropicMessage[];
};
type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
};

export class AnthropicProvider implements LLMProvider {
  public readonly name = "anthropic";
  public readonly model: string;

  private readonly apiKeyEnvVar: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;

  public constructor(opts: AnthropicProviderOptions = {}) {
    this.model = opts.model ?? "claude-3-5-haiku-20241022";
    this.apiKeyEnvVar = opts.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
    this.maxRetries = opts.maxRetries ?? 2;
  }

  public async call(options: CallOptions): Promise<ProviderResult> {
    const apiKey = process.env[this.apiKeyEnvVar];
    if (!apiKey) throw new LLMError(`${this.apiKeyEnvVar} is not set`, errorCodes.CORE_UNAVAILABLE);
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Split system messages from the conversation
    const systemMessages = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const conversationMessages: AnthropicMessage[] = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const body: AnthropicRequest = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      messages: conversationMessages
    };
    if (systemMessages) body.system = systemMessages;

    return this.callWithRetry(body, apiKey, options.signal, 0);
  }

  public async callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    return runTypedCall(this, options);
  }

  private async callWithRetry(
    body: AnthropicRequest,
    apiKey: string,
    signal: AbortSignal | undefined,
    attempt: number
  ): Promise<ProviderResult> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
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
      throw new LLMError(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`, errorCodes.CORE_UNAVAILABLE);
    }

    const data = await response.json() as AnthropicResponse;
    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const result: ProviderResult = { text, model: data.model };
    if (data.usage) {
      result.usage = { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens };
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
