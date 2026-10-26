import { createServer, type Server, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { unlink, existsSync } from "node:fs";
import { errorCodes, rpcRequestSchema } from "@warden/shared";
import { splitFrames, encodeFrame, socketPath } from "./ipc-framing.js";
import { rootLogger, requestLogger } from "./logger.js";

export type RpcHandler = (raw: unknown, correlationId?: string) => unknown;

/**
 * Starts a JSON-RPC 2.0 server over a local Unix socket / Windows named pipe.
 *
 * - Each incoming connection gets its own buffer.
 * - Requests are handled synchronously (the handler may be async in the future).
 * - Notifications (no `id`) are dispatched to the handler but no response is sent.
 * - Malformed frames receive a -32700 parse-error response.
 */
export const startSocketServer = (handler: RpcHandler, suffix = "default"): { server: Server; path: string; close: () => Promise<void> } => {
  const path = socketPath(suffix);

  // On Unix, clean up a stale socket file from a previous process.
  if (process.platform !== "win32" && existsSync(path)) {
    unlink(path, (err) => { if (err) rootLogger.warn({ err, path }, "Could not remove stale socket file"); });
  }

  const server = createServer((socket: Socket) => {
    const connId = randomUUID().slice(0, 8);
    const log = rootLogger.child({ connId });
    log.debug("socket client connected");
    let buffer = "";

    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      const [frames, next] = splitFrames(buffer, chunk);
      buffer = next;

      for (const frame of frames) {
        const correlationId = randomUUID();
        const reqLog = requestLogger(correlationId);

        // Validate it looks like a JSON-RPC envelope before calling the handler.
        const parsed = rpcRequestSchema.safeParse(frame.parsed);
        if (!parsed.success) {
          reqLog.warn({ raw: frame.raw.slice(0, 200) }, "malformed JSON-RPC frame");
          const id = typeof frame.parsed === "object" && frame.parsed !== null && "id" in frame.parsed ? (frame.parsed as Record<string, unknown>)["id"] : null;
          socket.write(encodeFrame({ jsonrpc: "2.0", id: id ?? null, error: { code: errorCodes.INVALID_REQUEST, message: "Invalid JSON-RPC request" } }));
          continue;
        }

        // Notifications (no id) — dispatch but no response.
        const isNotification = parsed.data.id === undefined;
        const result = handler(frame.parsed, parsed.data.meta?.correlationId ?? correlationId);

        if (!isNotification) {
          socket.write(encodeFrame(result));
        }
      }
    });

    socket.on("error", (err) => log.warn({ err }, "socket error"));
    socket.on("close", () => log.debug("socket client disconnected"));
  });

  server.on("error", (err) => rootLogger.error({ err }, "socket server error"));

  server.listen(path, () => {
    rootLogger.info({ path }, "warden-core socket server listening");
  });

  const close = (): Promise<void> => new Promise((resolve) => {
    server.close(() => {
      if (process.platform !== "win32" && existsSync(path)) {
        unlink(path, () => resolve());
      } else {
        resolve();
      }
    });
  });

  return { server, path, close };
};
