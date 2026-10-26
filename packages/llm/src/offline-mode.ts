/**
 * Offline mode — global LLM_DISABLED switch.
 *
 * When offline mode is active, any call to an LLMProvider throws LLMError
 * with code LLM_DISABLED. All deterministic features (AST checks, diff model,
 * hunk tracker, etc.) must continue to work regardless.
 *
 * Activated by:
 *   - WARDEN_OFFLINE=true environment variable
 *   - setOfflineMode(true) at runtime
 */
import { LLM_DISABLED_ERROR } from "./provider.js";
import { type LLMProvider, type CallOptions, type ProviderResult, type TypedCallOptions } from "./provider.js";

let _offline: boolean = process.env["WARDEN_OFFLINE"] === "true";

export const isOffline = (): boolean => _offline;
export const setOfflineMode = (value: boolean): void => { _offline = value; };

/**
 * OfflineGuardProvider — wraps any provider and throws LLM_DISABLED if offline.
 * Use this as the outermost wrapper so the guard fires regardless of inner layers.
 */
export class OfflineGuardProvider implements LLMProvider {
  public readonly name: string;
  public readonly model: string;

  public constructor(private readonly inner: LLMProvider) {
    this.name = `offline-guard(${inner.name})`;
    this.model = inner.model;
  }

  public async call(options: CallOptions): Promise<ProviderResult> {
    if (isOffline()) throw LLM_DISABLED_ERROR();
    return this.inner.call(options);
  }

  public async callTyped<T>(options: TypedCallOptions<T>): Promise<T> {
    if (isOffline()) throw LLM_DISABLED_ERROR();
    return this.inner.callTyped(options);
  }
}
