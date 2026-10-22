import { createInterface } from "node:readline";
import pino from "pino";
import { errorCodes, intentSchema, rpcRequestSchema } from "@warden/shared";
import { checkIntent, makeVerdict } from "@warden/rules-engine";

const log = pino({ level: process.env["WARDEN_LOG_LEVEL"] ?? "info" });
const rules = [{ id: "WR-006", title: "Controllers must not access the database", severity: "error", source: { path: "DESIGN.md", line: 4, quote: "Use repositories" }, checker: "forbidden-call", params: { pattern: "db.query(" }, remediation: "Use OrderRepository." }] as const;

export const handle = (raw: unknown): unknown => {
  const request = rpcRequestSchema.safeParse(raw);
  if (!request.success) return { jsonrpc: "2.0", id: null, error: { code: errorCodes.INVALID_REQUEST, message: "Invalid JSON-RPC request" } };
  if (request.data.method === "ping") return { jsonrpc: "2.0", id: request.data.id, result: { status: "ok" } };
  if (request.data.method === "warden_check_intent") {
    const intent = intentSchema.safeParse(request.data.params);
    if (!intent.success) return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.INVALID_PARAMS, message: intent.error.message } };
    const violations = checkIntent(intent.data, rules);
    return { jsonrpc: "2.0", id: request.data.id, result: { violations, verdict: makeVerdict(violations) } };
  }
  return { jsonrpc: "2.0", id: request.data.id, error: { code: errorCodes.METHOD_NOT_FOUND, message: `Unknown method: ${request.data.method}` } };
};

if (process.argv[1]?.endsWith("index.js")) {
  createInterface({ input: process.stdin }).on("line", (line) => {
    try { process.stdout.write(`${JSON.stringify(handle(JSON.parse(line)))}\n`); } catch (error: unknown) { log.error({ error }, "Failed to process request"); }
  });
}
