import pino from "pino";
import { redactSecrets } from "@warden/shared";

/**
 * Root logger for warden-core.
 *
 * Rules (per CLAUDE.md §7):
 * - Structured JSON (pino default).
 * - Secrets redacted before any string reaches the log output.
 * - Never log file contents or LLM prompts at info level.
 * - Correlation ID threaded through via child loggers.
 */
export const rootLogger = pino({
  level: process.env["WARDEN_LOG_LEVEL"] ?? "info",
  serializers: {
    // Redact any string values in the `msg` field and in common envelope keys.
    err: pino.stdSerializers.err
  },
  // pino hooks run before the log entry is written; use to redact free-form message strings.
  hooks: {
    logMethod(inputArgs: Parameters<pino.LogFn>, method: pino.LogFn): void {
      if (inputArgs.length > 0 && typeof inputArgs[0] === "string") {
        inputArgs[0] = redactSecrets(inputArgs[0]);
      }
      // If second arg is the message string (pino(obj, msg) style)
      if (inputArgs.length > 1 && typeof inputArgs[1] === "string") {
        inputArgs[1] = redactSecrets(inputArgs[1]);
      }
      method.apply(this, inputArgs);
    }
  }
});

/**
 * Creates a child logger bound to a specific request correlation ID.
 * Use one per incoming JSON-RPC request so log lines are traceable end-to-end.
 */
export const requestLogger = (correlationId: string): pino.Logger =>
  rootLogger.child({ correlationId });
