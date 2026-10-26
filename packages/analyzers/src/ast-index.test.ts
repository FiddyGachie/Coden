import { describe, expect, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { indexProject, reindexFile, resetSharedProject, type CacheEntry } from "./ast-index.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/demo-repo");

// ── Project-level graph tests ─────────────────────────────────────────────────

describe("indexProject on the demo repo", () => {
  it("indexes every .ts source file", () => {
    const { files } = indexProject({ root: fixtureDir, include: ["src/**/*.ts"] });
    // Expect at least: app, db, orders repo, orders ctrl, payments seeded, orders-telemetry seeded
    expect(files.size).toBeGreaterThanOrEqual(6);
  });

  it("extracts the clean ordersRouter GET/POST routes", () => {
    const { files } = indexProject({ root: fixtureDir, include: ["src/controllers/orders.ts"] });
    const graph = files.get("src/controllers/orders.ts");
    expect(graph).toBeDefined();
    const routes = graph!.nodes.filter((n) => n.kind === "route");
    // orders.ts declares GET /, GET /:id, POST /
    expect(routes.length).toBeGreaterThanOrEqual(3);
    expect(routes.some((r) => r.name.startsWith("GET"))).toBe(true);
    expect(routes.some((r) => r.name.startsWith("POST"))).toBe(true);
  });

  it("extracts imports in the orders controller", () => {
    const { files } = indexProject({ root: fixtureDir, include: ["src/controllers/orders.ts"] });
    const graph = files.get("src/controllers/orders.ts")!;
    const importNames = graph.nodes.filter((n) => n.kind === "import").map((n) => n.name);
    expect(importNames.some((n) => n.includes("express"))).toBe(true);
    expect(importNames.some((n) => n.includes("orders"))).toBe(true);
  });

  it("includes a file node for every indexed file", () => {
    const { files } = indexProject({ root: fixtureDir, include: ["src/**/*.ts"] });
    for (const [rel, graph] of files) {
      const fileNode = graph.nodes.find((n) => n.kind === "file");
      expect(fileNode?.id).toBe(rel);
    }
  });

  it("records a fileHash for each file", () => {
    const { files } = indexProject({ root: fixtureDir, include: ["src/db.ts"] });
    const graph = files.get("src/db.ts")!;
    expect(graph.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contains the forbidden db.query( string in the seeded S2 source text (used by checkDiff)", () => {
    // The S2 violation embeds the forbidden pattern inside a string literal,
    // so the AST call extractor won't produce a call edge — but checkDiff scans
    // the raw source text, which is what matters for the rules-engine check.
    const source = readFileSync(join(fixtureDir, "src/controllers/payments.seeded-s2.ts"), "utf8");
    expect(source).toContain("db.query(");
  });
});

// ── Incremental cache tests ───────────────────────────────────────────────────

describe("incremental cache", () => {
  it("reuses cached graph when hash is unchanged", () => {
    const cache = new Map<string, CacheEntry>();
    // First pass — populates cache
    indexProject({ root: fixtureDir, include: ["src/db.ts"], cache });
    const entry1 = cache.get("src/db.ts")!;

    // Second pass — should hit cache
    indexProject({ root: fixtureDir, include: ["src/db.ts"], cache });
    const entry2 = cache.get("src/db.ts")!;

    // Same object reference — graph was not re-parsed
    expect(entry2.graph).toBe(entry1.graph);
  });

  it("refreshes cache when hash changes (simulated via reindexFile with stale entry)", () => {
    const cache = new Map<string, CacheEntry>();
    const first = reindexFile("src/db.ts", fixtureDir, cache);
    expect(first).toBeDefined();

    // Corrupt the cached hash to simulate a stale entry
    const entry = cache.get("src/db.ts")!;
    cache.set("src/db.ts", { hash: "stale-hash", graph: entry.graph });

    // reindexFile should detect mismatch and re-parse
    const second = reindexFile("src/db.ts", fixtureDir, cache);
    // New graph should have a different (correct) hash
    expect(second!.fileHash).not.toBe("stale-hash");
    expect(cache.get("src/db.ts")!.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Single-file timing test (≤ 150 ms p95) ───────────────────────────────────

describe("performance", () => {
  beforeAll(() => {
    // Warm up the shared Project (cold start excluded from measurement).
    resetSharedProject();
    const warmCache = new Map<string, CacheEntry>();
    reindexFile("src/controllers/orders.ts", fixtureDir, warmCache);
  });

  it("re-indexes a single file within the 150 ms budget (warm Project)", () => {
    const RUNS = 10;
    const times: number[] = [];

    for (let i = 0; i < RUNS; i++) {
      // New cache each run forces a re-parse (hash miss), but the Project is warm.
      const cache = new Map<string, CacheEntry>();
      const start = performance.now();
      reindexFile("src/controllers/orders.ts", fixtureDir, cache);
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    // p95 from 10 samples
    const p95 = times[Math.ceil(RUNS * 0.95) - 1] ?? times[times.length - 1]!;
    // 150 ms budget per TASKS T1.2
    expect(p95).toBeLessThan(150);
  });
});
