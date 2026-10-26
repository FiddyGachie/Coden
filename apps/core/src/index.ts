import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { errorCodes, intentSchema, rpcRequestSchema } from "@warden/shared";
import { checkDiff, checkIntent, makeVerdict } from "@warden/rules-engine";
import { reindexFile, type CacheEntry } from "@warden/analyzers";
import { rootLogger, requestLogger } from "./logger.js";
import { FileChangeScheduler } from "./scheduler.js";

const rules = [{ id: "WR-006", title: "Controllers must not access the database", severity: "error", source: { path: "DESIGN.md", line: 4, quote: "Use repositories" }, checker: "forbidden-call", params: { pattern: "db.query(" }, remediation: "Use OrderRepository." }] as const;

/** Project root used by the scheduler. Set via WARDEN_PROJECT_ROOT env or CWD. */
const projectRoot = process.env["WARDEN_PROJECT_ROOT"] ?? process.cwd();
const indexCache = new Map<string, CacheEntry>();

const scheduler = new FileChangeScheduler({
  projectRoot,
  cache: indexCache,
  reindex: async (path, root, cache, signal) => {
    // Honour cancellation — check before the (synchronous) reindexFile call.
    if (signal.aborted) return undefined;
    return reindexFile(path, root, cache);
  },
  onIndexed: (path) => rootLogger.debug({ path }, "re-index complete")
});

export const handle = (raw: unknown, correlationId: string = randomUUID()): unknown => {
  const log = requestLogger(correlationId);
  const request = rpcRequestSchema.safeParse(raw);
  if (!request.success) {
    log.warn({ correlationId }, "Invalid JSON-RPC request received");
    return { jsonrpc: "2.0", id: null, error: { code: errorCodes.INVALID_REQUEST, message: "Invalid JSON-RPC request" } };
  }
  // Prefer a correlation ID from the caller's meta block if provided
  const effectiveId = request.data.meta?.correlationId ?? correlationId;
  const reqLog = requestLogger(effectiveId);
  reqLog.debug({ method: request.data.method }, "rpc request");

  if (request.data.method === "ping") return { jsonrpc: "2.0", id: request.data.id, result: { status: "ok" } };

  if (request.data.method === "getStatus") {
    return { jsonrpc: "2.0", id: request.data.id, result: { status: "ok", transport: "socket", version: "0.1.0", pendingReindex: scheduler.pendingCount, activeReindex: scheduler.activeCount } };
  }

  if (request.data.method === "warden_file_changed") {
    const params = request.data.params;
    if (typeof params !== "object" || params === null || !("path" in params) || typeof params.path !== "string") {
      return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.INVALID_PARAMS, message: "path must be a string" } };
    }
    scheduler.notify(params.path);
    reqLog.debug({ path: params.path }, "warden_file_changed queued");
    return { jsonrpc: "2.0", id: request.data.id, result: { queued: true, path: params.path } };
  }

  if (request.data.method === "warden_check_intent") {
    const intent = intentSchema.safeParse(request.data.params);
    if (!intent.success) return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.INVALID_PARAMS, message: intent.error.message } };
    const violations = checkIntent(intent.data, rules);
    reqLog.info({ violationCount: violations.length }, "warden_check_intent complete");
    return { jsonrpc: "2.0", id: request.data.id, result: { violations, verdict: makeVerdict(violations) } };
  }

  if (request.data.method === "warden_check_diff") {
    const params = request.data.params;
    if (typeof params !== "object" || params === null || !("source" in params) || typeof params.source !== "string") {
      return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.INVALID_PARAMS, message: "source must be a string" } };
    }
    const path = "path" in params && typeof params.path === "string" ? params.path : "(unspecified)";
    const violations = checkDiff(params.source, path, rules);
    reqLog.info({ path, violationCount: violations.length }, "warden_check_diff complete");
    return { jsonrpc: "2.0", id: request.data.id, result: { violations, verdict: makeVerdict(violations) } };
  }

  return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.METHOD_NOT_FOUND, message: `Unknown method: ${request.data.method}` } };
};

if (process.argv[1]?.endsWith("index.js")) {
  rootLogger.info({ projectRoot }, "warden-core starting (stdin/stdout transport)");
  createInterface({ input: process.stdin })
    .on("line", (line) => {
      try { process.stdout.write(`${JSON.stringify(handle(JSON.parse(line)))}\n`); }
      catch (error: unknown) { rootLogger.error({ error }, "Failed to process request"); }
    })
    .on("close", () => { scheduler.dispose(); });
}
