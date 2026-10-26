import { describe, expect, it } from "vitest";
import { requestLogger, rootLogger } from "./logger.js";

describe("warden-core logger", () => {
  it("creates a child logger with a correlationId binding", () => {
    const child = requestLogger("test-corr-id-001");
    // pino child loggers expose bindings()
    expect((child as unknown as { bindings(): Record<string, unknown> }).bindings()).toMatchObject({ correlationId: "test-corr-id-001" });
  });

  it("root logger level is info by default", () => {
    expect(rootLogger.level).toBe("info");
  });
});
