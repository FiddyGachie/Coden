import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

type RpcResponse = { jsonrpc: "2.0"; id: string; result?: unknown; error?: { code: number; message: string } };

const HEALTH_CHECK_INTERVAL_MS = 5_000;
const MAX_RESTART_ATTEMPTS = 5;
// Exponential backoff: 500 ms → 1 s → 2 s → 4 s → 8 s
const backoffMs = (attempt: number): number => Math.min(500 * 2 ** attempt, 10_000);

export class CoreClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private nextId = 0;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private restartAttempts = 0;
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  /** Path to the lock file written while the core is running. */
  public readonly lockPath: string;

  public constructor(private readonly coreEntry: string, lockDir = tmpdir()) {
    this.lockPath = join(lockDir, `warden-core-${process.pid}.lock`);
  }

  public async checkChange(source: string, path: string): Promise<unknown> {
    return this.request("warden_check_diff", { source, path });
  }

  /**
   * Sends a `ping` request to the core and returns `true` if it responds within
   * the timeout. Used by the health-check loop and the status bar.
   */
  public async healthCheck(timeoutMs = 2_000): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.request("ping", undefined),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("health-check timeout")), timeoutMs))
      ]);
      return (result as { status?: string } | null)?.status === "ok";
    } catch {
      return false;
    }
  }

  public dispose(): void {
    this.disposed = true;
    clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    this.process?.kill();
    this.process = undefined;
    this.removeLock();
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("Warden core stopped."));
    }
    this.pending.clear();
  }

  private writeLock(): void {
    try {
      writeFileSync(this.lockPath, String(process.pid), { flag: "w" });
    } catch {
      // Non-fatal — the lock is advisory.
    }
  }

  private removeLock(): void {
    try {
      if (existsSync(this.lockPath)) unlinkSync(this.lockPath);
    } catch {
      // Non-fatal.
    }
  }

  private startHealthLoop(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(async () => {
      if (this.disposed) return;
      const alive = await this.healthCheck();
      if (!alive && !this.disposed) {
        this.scheduleRestart();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private scheduleRestart(delayMs = 0): void {
    if (this.disposed || this.restartAttempts >= MAX_RESTART_ATTEMPTS) return;
    const attempt = this.restartAttempts++;
    setTimeout(() => {
      if (this.disposed) return;
      this.process?.kill();
      this.process = undefined;
      this.ensureProcess();
    }, delayMs + backoffMs(attempt));
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) return this.process;
    const child = spawn(process.execPath, [this.coreEntry], { stdio: ["pipe", "pipe", "pipe"] });
    this.writeLock();
    this.restartAttempts = 0;

    child.stdout.on("data", (chunk: Buffer) => this.consume(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => {
      // Core writes pino JSON to stderr — ignore in the extension host.
      void chunk;
    });
    child.once("exit", (code) => {
      this.removeLock();
      if (!this.disposed) {
        const delay = backoffMs(this.restartAttempts);
        this.scheduleRestart(delay);
        // Reject all in-flight requests so callers don't hang.
        for (const { reject, timer } of this.pending.values()) {
          clearTimeout(timer);
          reject(new Error(`Warden core exited (code ${String(code)}); restarting.`));
        }
        this.pending.clear();
      }
    });

    this.process = child;
    this.startHealthLoop();
    return child;
  }

  private request(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
    const child = this.ensureProcess();
    const id = `coden-${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} (${method}) timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params, meta: { correlationId: randomUUID() } })}\n`);
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let response: RpcResponse;
      try { response = JSON.parse(line) as RpcResponse; } catch { continue; }
      const request = this.pending.get(response.id);
      if (!request) continue;
      clearTimeout(request.timer);
      this.pending.delete(response.id);
      if (response.error) request.reject(new Error(response.error.message));
      else request.resolve(response.result);
    }
  }
}
