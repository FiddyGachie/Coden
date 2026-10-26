/**
 * T3.5 tests — remaining checkers (naming, size-limit, api-surface-stable, semantic-llm)
 */
import { describe, it, expect } from "vitest";
import { runChecker, CHECKER_REGISTRY } from "./checkers.js";
import type { CheckContext } from "./checkers.js";

const ctx = (source: string, filePath = "src/app.ts"): CheckContext => ({ filePath, source });

describe("CHECKER_REGISTRY — extended", () => {
  it("contains all 13 checker types", () => {
    const types = [...CHECKER_REGISTRY.keys()];
    expect(types).toContain("naming");
    expect(types).toContain("size-limit");
    expect(types).toContain("api-surface-stable");
    expect(types).toContain("semantic-llm");
    expect(types).toHaveLength(13);
  });
});

// ── naming ───────────────────────────────────────────────────────────────────

describe("naming", () => {
  const fileParams = { pattern: "^[a-z][a-z0-9-]*\\.ts$", target: "file", description: "must be kebab-case" };

  it("(positive) PascalCase file name fails kebab-case rule", () => {
    const result = runChecker("naming", ctx("", "src/OrderController.ts"), fileParams);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("OrderController.ts");
  });

  it("(positive) mixed-case file fails rule", () => {
    const result = runChecker("naming", ctx("", "src/orderController.ts"), fileParams);
    expect(result.violations).toHaveLength(1);
  });

  it("(positive) export name not matching camelCase rule", () => {
    const exportParams = { pattern: "^[a-z][a-zA-Z0-9]*$", target: "export", description: "must be camelCase" };
    const result = runChecker("naming",
      ctx(`export const CreateOrder = () => {}`, "src/orders.ts"),
      exportParams
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("CreateOrder");
  });

  it("(negative) kebab-case file name passes", () => {
    const result = runChecker("naming", ctx("", "src/order-controller.ts"), fileParams);
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) matching export passes", () => {
    const exportParams = { pattern: "^[a-z][a-zA-Z0-9]*$", target: "export" };
    const result = runChecker("naming",
      ctx(`export const createOrder = () => {}`, "src/orders.ts"),
      exportParams
    );
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) invalid regex produces a single error violation", () => {
    const result = runChecker("naming", ctx("", "src/app.ts"), { pattern: "[invalid((" });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("invalid pattern");
  });
});

// ── size-limit ────────────────────────────────────────────────────────────────

describe("size-limit", () => {
  it("(positive) file exceeding line limit", () => {
    const source = Array.from({ length: 210 }, (_, i) => `const x${i} = ${i};`).join("\n");
    const result = runChecker("size-limit", ctx(source), { maxLines: 200 });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("210 lines");
  });

  it("(positive) function exceeding line limit", () => {
    // Build a function that is definitely > 50 lines
    const lines = ["function bigFunction() {"];
    for (let i = 0; i < 55; i++) lines.push(`  const step${i} = i + ${i};`);
    lines.push("  return step0;", "}");
    const source = lines.join("\n");
    const result = runChecker("size-limit", ctx(source), { maxLines: 50, target: "function" });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("bigFunction");
  });

  it("(positive) file exactly 1 over limit", () => {
    const source = Array.from({ length: 101 }, () => "// line").join("\n");
    const result = runChecker("size-limit", ctx(source), { maxLines: 100 });
    expect(result.violations).toHaveLength(1);
  });

  it("(negative) file within limit", () => {
    const source = Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join("\n");
    const result = runChecker("size-limit", ctx(source), { maxLines: 200 });
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) function within limit", () => {
    const source = `function small() {\n  return 1;\n}`;
    const result = runChecker("size-limit", ctx(source), { maxLines: 50, target: "function" });
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) exactly at limit passes", () => {
    const source = Array.from({ length: 100 }, () => "// line").join("\n");
    const result = runChecker("size-limit", ctx(source), { maxLines: 100 });
    expect(result.violations).toHaveLength(0);
  });
});

// ── api-surface-stable ────────────────────────────────────────────────────────

describe("api-surface-stable", () => {
  const params = { requiredExports: ["createOrder", "getOrder", "deleteOrder"] };

  it("(positive) missing one required export", () => {
    const result = runChecker("api-surface-stable",
      ctx(`export const createOrder = () => {};\nexport const getOrder = () => {};`),
      params
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("deleteOrder");
  });

  it("(positive) all required exports removed", () => {
    const result = runChecker("api-surface-stable", ctx(`// empty module`), params);
    expect(result.violations).toHaveLength(3);
  });

  it("(positive) named export block missing one symbol", () => {
    const result = runChecker("api-surface-stable",
      ctx(`const createOrder = () => {};\nexport { createOrder }`),
      { requiredExports: ["createOrder", "getOrder"] }
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain("getOrder");
  });

  it("(negative) all required exports present", () => {
    const result = runChecker("api-surface-stable",
      ctx(`export const createOrder = () => {};\nexport const getOrder = () => {};\nexport function deleteOrder() {}`),
      params
    );
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) named export block with all symbols", () => {
    const result = runChecker("api-surface-stable",
      ctx(`const a = 1, b = 2;\nexport { a as createOrder, b as getOrder }`),
      { requiredExports: ["createOrder", "getOrder"] }
    );
    expect(result.violations).toHaveLength(0);
  });

  it("(negative) extra exports beyond required are fine", () => {
    const result = runChecker("api-surface-stable",
      ctx(`export const createOrder = () => {};\nexport const getOrder = () => {};\nexport function deleteOrder() {};\nexport const extraHelper = () => {};`),
      params
    );
    expect(result.violations).toHaveLength(0);
  });
});

// ── semantic-llm ──────────────────────────────────────────────────────────────

describe("semantic-llm", () => {
  const params = { ruleDescription: "Auth controllers must validate JWT before processing" };

  it("(positive) findings with line citations are reported as violations", () => {
    const findings = [{ message: "Missing JWT check", line: 5, evidence: "const getOrders = () => repo.findAll()" }];
    const result = runChecker("semantic-llm", ctx(""), { ...params, findings });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]!.message).toBe("Missing JWT check");
    expect(result.violations[0]!.line).toBe(5);
  });

  it("(positive) findings without line citations are dropped and counted", () => {
    const findings = [
      { message: "Finding with cite", line: 3, evidence: "code..." },
      { message: "Hallucinated finding", line: 0, evidence: "ghost" }
    ];
    const result = runChecker("semantic-llm", ctx(""), { ...params, findings });
    const realViolations = result.violations.filter((v) => !v.message.startsWith("[semantic-llm]"));
    expect(realViolations).toHaveLength(1);
    const dropNote = result.violations.find((v) => v.message.startsWith("[semantic-llm]"));
    expect(dropNote).toBeDefined();
    expect(dropNote!.message).toContain("dropped");
  });

  it("(positive) all findings dropped when none have line citations", () => {
    const findings = [
      { message: "No line 1", line: 0, evidence: "..." },
      { message: "No line 2", line: -1, evidence: "..." }
    ];
    const result = runChecker("semantic-llm", ctx(""), { ...params, findings });
    const realViolations = result.violations.filter((v) => !v.message.startsWith("[semantic-llm]"));
    expect(realViolations).toHaveLength(0);
    expect(result.violations.some((v) => v.message.includes("2"))).toBe(true);
  });

  it("(negative) no findings → passes cleanly", () => {
    const result = runChecker("semantic-llm", ctx(""), { ...params, findings: [] });
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it("(negative) single well-cited finding passes through", () => {
    const result = runChecker("semantic-llm", ctx(""),
      { ...params, findings: [{ message: "ok", line: 1, evidence: "x" }] }
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.line).toBe(1);
  });

  it("(negative) empty source with empty findings", () => {
    const result = runChecker("semantic-llm", ctx(""), { ...params });
    expect(result.passed).toBe(true);
  });
});
