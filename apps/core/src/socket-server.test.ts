import { afterEach, describe, expect, it } from "vitest";
import { connect, type Socket } from "node:net";
import { socketPath, encodeFrame } from "./ipc-framing.js";
import { startSocketServer } from "./socket-server.js";
import { handle } from "./index.js";

// Use a unique suffix per test run to avoid port collisions in parallel runs.
const testSuffix = `test-${process.pid}`;

let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

const openClient = (path: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(path);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });

const sendAndReceive = (socket: Socket, message: unknown): Promise<unknown> =>
  new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: string): void => {
      buf += chunk;
      const idx = buf.indexOf("\n");
      if (idx === -1) return;
      socket.off("data", onData);
      resolve(JSON.parse(buf.slice(0, idx)));
    };
    socket.setEncoding("utf8");
    socket.on("data", onData);
    socket.write(encodeFrame(message));
  });

describe("socket server", () => {
  it("round-trips a ping request over the local socket", async () => {
    const { close } = startSocketServer(handle, testSuffix);
    closeServer = close;
    // Give the server a tick to start listening.
    await new Promise((r) => setTimeout(r, 50));

    const client = await openClient(socketPath(testSuffix));
    const response = await sendAndReceive(client, { jsonrpc: "2.0", id: "s-1", method: "ping" });
    client.destroy();
    expect(response).toEqual({ jsonrpc: "2.0", id: "s-1", result: { status: "ok" } });
  });

  it("returns -32600 for a malformed request", async () => {
    const { close } = startSocketServer(handle, testSuffix);
    closeServer = close;
    await new Promise((r) => setTimeout(r, 50));

    const client = await openClient(socketPath(testSuffix));
    const response = await sendAndReceive(client, { not: "jsonrpc" }) as { error: { code: number } };
    client.destroy();
    expect(response.error.code).toBe(-32600);
  });

  it("returns -32602 for missing params on warden_check_intent", async () => {
    const { close } = startSocketServer(handle, testSuffix);
    closeServer = close;
    await new Promise((r) => setTimeout(r, 50));

    const client = await openClient(socketPath(testSuffix));
    const response = await sendAndReceive(client, { jsonrpc: "2.0", id: "s-2", method: "warden_check_intent", params: { wrong: true } }) as { error: { code: number } };
    client.destroy();
    expect(response.error.code).toBe(-32602);
  });

  it("handles concurrent requests correctly", async () => {
    const { close } = startSocketServer(handle, testSuffix);
    closeServer = close;
    await new Promise((r) => setTimeout(r, 50));

    const [c1, c2] = await Promise.all([openClient(socketPath(testSuffix)), openClient(socketPath(testSuffix))]);
    const [r1, r2] = await Promise.all([
      sendAndReceive(c1, { jsonrpc: "2.0", id: "c1-ping", method: "ping" }),
      sendAndReceive(c2, { jsonrpc: "2.0", id: "c2-ping", method: "ping" })
    ]);
    c1.destroy();
    c2.destroy();
    expect((r1 as { id: string }).id).toBe("c1-ping");
    expect((r2 as { id: string }).id).toBe("c2-ping");
  });
});
