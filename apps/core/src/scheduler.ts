/**
 * File-change scheduler for warden-core.
 *
 * Receives file-change notifications (from the VS Code extension via JSON-RPC)
 * and debounces them into batched re-index jobs. Each job is cancellable via
 * AbortSignal so a new change for the same file cancels an in-flight re-index.
 *
 * Design constraints (TASKS T1.5):
 *   - Debounce delay ≥ 300 ms (configurable, default 300 ms).
 *   - Re-index jobs run with an AbortSignal; callers may cancel at any time.
 *   - The scheduler must not block the core's JSON-RPC event loop.
 */

import type { CacheEntry, FileGraph } from "@warden/analyzers";

export type ReindexJob = {
  /** Relative path from project root. */
  path: string;
  /** AbortController used to cancel this job if a newer change arrives. */
  controller: AbortController;
  /** Resolved when the job completes (or rejects if cancelled). */
  promise: Promise<FileGraph | undefined>;
};

export type SchedulerOptions = {
  /** Debounce delay in ms (must be ≥ 300 per TASKS T1.5). Defaults to 300. */
  debounceMs?: number;
  /** Called to perform the actual re-index. Receives the path, root, and signal. */
  reindex: (path: string, root: string, cache: Map<string, CacheEntry>, signal: AbortSignal) => Promise<FileGraph | undefined>;
  projectRoot: string;
  cache: Map<string, CacheEntry>;
  /** Optional callback invoked when a job completes successfully. */
  onIndexed?: (path: string, graph: FileGraph) => void;
};

export class FileChangeScheduler {
  private readonly debounceMs: number;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly active = new Map<string, ReindexJob>();
  private readonly opts: Required<Omit<SchedulerOptions, "onIndexed">> & { onIndexed?: SchedulerOptions["onIndexed"] };

  public constructor(options: SchedulerOptions) {
    const debounceMs = options.debounceMs ?? 300;
    if (debounceMs < 300) throw new Error("debounceMs must be ≥ 300 ms per TASKS T1.5");
    this.debounceMs = debounceMs;
    this.opts = { ...options, debounceMs };
  }

  /**
   * Notify the scheduler that a file has changed.
   * If there is already a pending debounce timer for this path, it is reset.
   * If there is an in-flight re-index for this path, it is cancelled.
   */
  public notify(path: string): void {
    // Cancel any pending debounce timer for this path
    const existingTimer = this.pending.get(path);
    if (existingTimer !== undefined) clearTimeout(existingTimer);

    // Cancel any in-flight job for this path
    const activeJob = this.active.get(path);
    if (activeJob) { activeJob.controller.abort(); this.active.delete(path); }

    // Schedule a new debounced re-index
    const timer = setTimeout(() => {
      this.pending.delete(path);
      this.schedule(path);
    }, this.debounceMs);
    this.pending.set(path, timer);
  }

  /** Cancel all pending timers and abort all in-flight jobs. */
  public dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const job of this.active.values()) job.controller.abort();
    this.active.clear();
  }

  /** Number of paths currently waiting to be re-indexed (debounce pending). */
  public get pendingCount(): number { return this.pending.size; }

  /** Number of paths currently being re-indexed (job in flight). */
  public get activeCount(): number { return this.active.size; }

  private schedule(path: string): void {
    const controller = new AbortController();
    const { reindex, projectRoot, cache, onIndexed } = this.opts;

    const promise = reindex(path, projectRoot, cache, controller.signal).then((graph) => {
      this.active.delete(path);
      if (graph && onIndexed) onIndexed(path, graph);
      return graph;
    }).catch((err: unknown) => {
      this.active.delete(path);
      if ((err as Error)?.name !== "AbortError") throw err;
      return undefined;
    });

    this.active.set(path, { path, controller, promise });
  }
}
