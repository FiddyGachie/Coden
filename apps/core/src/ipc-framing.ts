/**
 * JSON-RPC 2.0 framing helpers — newline-delimited JSON over a stream.
 *
 * These are shared by both the socket server (core) and the IPC client
 * (extension, MCP server, tests). Extracted here so the framing contract
 * is a single source of truth.
 */

export type FramedMessage = { raw: string; parsed: unknown };

/**
 * Accumulates incoming chunks and emits complete newline-delimited JSON frames.
 * Returns a tuple of [complete frames, remaining buffer].
 */
export const splitFrames = (buffer: string, chunk: string): [FramedMessage[], string] => {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const remaining = lines.pop() ?? "";
  const frames: FramedMessage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      frames.push({ raw: trimmed, parsed: JSON.parse(trimmed) });
    } catch {
      // Malformed frame — silently drop; the caller should return a -32700 error if desired.
    }
  }
  return [frames, remaining];
};

/** Serialize a JSON-RPC message to a newline-terminated frame. */
export const encodeFrame = (value: unknown): string => `${JSON.stringify(value)}\n`;

/** Resolve the local socket path for this OS.
 *
 * - Windows: named pipe  \\.\pipe\warden-core-<suffix>
 * - Unix:    /tmp/warden-core-<suffix>.sock
 */
export const socketPath = (suffix = "default"): string =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\warden-core-${suffix}`
    : `/tmp/warden-core-${suffix}.sock`;
