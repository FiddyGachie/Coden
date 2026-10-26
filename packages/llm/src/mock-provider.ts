/**
 * MockProvider — deterministic in-process provider for tests.
 *
 * Configured with a queue of canned responses (or a function).
 * Never makes network calls. Does not honour redaction (it's a test double).
 */
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions, runTypedCall } from "./provider.js";

export type MockResponse =
  | string
  | { text: string; model?: string }
  | ((messages: CallOptions["messages"]) => string);

export class MockProvider implements LLMProvider {
  public readonly name = "mock";
  public readonly model: string;

  private readonly responses: MockResponse[];
  private callIndex = 0;
  /** Records every call made, for assertions. */
  public readonly calls: Array<{ messages: CallOptions["messages"]; correlationId?: string }> = [];

  public constructor(responses: MockResponse[], model = "mock-1") {
    if (responses.length === 0) throw new Error("MockProvider requires at least one response");
    this.responses = responses;
    this.model = model;
  }

  public async call(options: CallOptions): Promise<ProviderResult> {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const entry: { messages: CallOptions["messages"]; correlationId?: string } = { messages: options.messages };
    if (options.correlationId !== undefined) entry.correlationId = options.correlationId;
    this.calls.push(entry);

    const response = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;
    if (response === undefined) throw new Error("MockProvider: no response configured");

    const text = typeof response === "function"
      ? response(options.messages)
      : typeof response === "string" ? response : response.text;
    const model = typeof response === "object" && !Array.isArray(response) && "model" in response && response.model
      ? response.model : this.model;

    return { text, model, usage: { promptTokens: 100, completionTokens: text.length } };
  }

  public async callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    return runTypedCall(this, options);
  }

  /** Reset call history and index (useful between tests). */
  public reset(): void { this.callIndex = 0; this.calls.length = 0; }
}
