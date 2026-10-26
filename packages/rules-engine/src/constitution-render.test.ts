/**
 * T3.7 tests — constitution render & persist
 *
 * Acceptance: round-trip render → parse JSON → hashes verify; golden output shape.
 */
import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import {
  renderConstitutionMd,
  buildConstitutionJson,
  persistConstitution,
  buildSourceHashes,
  sha256
} from "./constitution-render.js";
import type { RenderableRule, ConstitutionMeta } from "./constitution-render.js";

const testDir = join(tmpdir(), `warden-constitution-test-${Date.now()}`);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const makeMeta = (overrides: Partial<ConstitutionMeta> = {}): ConstitutionMeta => ({
  projectName: "Acme Orders API",
  version: 1,
  generatedAt: "2025-01-01T00:00:00.000Z",
  sourceHashes: { "IDEA.md": "abc123", "SPEC.md": "def456" },
  ...overrides
});

const makeRule = (overrides: Partial<RenderableRule> = {}): RenderableRule => ({
  id: "WR-001",
  title: "No direct DB calls",
  severity: "error",
  checker: "forbidden-call",
  params: { pattern: "db.query(" },
  remediation: "Use the repository layer instead.",
  status: "approved",
  source: { file: "DESIGN.md", startLine: 10, quote: "All DB access must go through the repository layer." },
  ...overrides
});

// ── renderConstitutionMd ──────────────────────────────────────────────────────

describe("renderConstitutionMd", () => {
  it("includes the project name and version in the header", () => {
    const md = renderConstitutionMd([makeRule()], makeMeta());
    expect(md).toContain("# Constitution — Acme Orders API");
    expect(md).toContain("version 1");
  });

  it("lists source doc hashes", () => {
    const md = renderConstitutionMd([makeRule()], makeMeta());
    expect(md).toContain("IDEA.md@abc123");
    expect(md).toContain("SPEC.md@def456");
  });

  it("renders approved rules under ## Approved Rules", () => {
    const md = renderConstitutionMd([makeRule({ status: "approved" })], makeMeta());
    expect(md).toContain("## Approved Rules");
    expect(md).toContain("WR-001 — No direct DB calls");
    expect(md).toContain("repository layer");  // from source.quote
  });

  it("renders proposed rules under ## Proposed Rules with a pending note", () => {
    const md = renderConstitutionMd([makeRule({ status: "proposed" })], makeMeta());
    expect(md).toContain("## Proposed Rules");
    expect(md).toContain("pending approval");
  });

  it("shows 'No rules defined yet' when rules list is empty", () => {
    const md = renderConstitutionMd([], makeMeta());
    expect(md).toContain("No rules defined yet");
  });

  it("separates approved and proposed rules into different sections", () => {
    const rules = [
      makeRule({ id: "WR-001", status: "approved" }),
      makeRule({ id: "WR-002", status: "proposed" })
    ];
    const md = renderConstitutionMd(rules, makeMeta());
    const approvedIdx = md.indexOf("## Approved Rules");
    const proposedIdx = md.indexOf("## Proposed Rules");
    expect(approvedIdx).toBeGreaterThan(-1);
    expect(proposedIdx).toBeGreaterThan(approvedIdx);
  });
});

// ── buildConstitutionJson ─────────────────────────────────────────────────────

describe("buildConstitutionJson", () => {
  it("includes the SHA-256 of the rendered MD", () => {
    const md = renderConstitutionMd([makeRule()], makeMeta());
    const json = buildConstitutionJson([makeRule()], makeMeta(), md);
    expect(json.constitutionMdHash).toBe(sha256(md));
    expect(json.constitutionMdHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash changes when content changes", () => {
    const meta = makeMeta();
    const md1 = renderConstitutionMd([makeRule({ title: "Rule A" })], meta);
    const md2 = renderConstitutionMd([makeRule({ title: "Rule B" })], meta);
    const json1 = buildConstitutionJson([], meta, md1);
    const json2 = buildConstitutionJson([], meta, md2);
    expect(json1.constitutionMdHash).not.toBe(json2.constitutionMdHash);
  });

  it("round-trip: JSON contains all rules", () => {
    const rules = [makeRule({ id: "WR-001" }), makeRule({ id: "WR-002", checker: "import-boundary" })];
    const md = renderConstitutionMd(rules, makeMeta());
    const json = buildConstitutionJson(rules, makeMeta(), md);
    expect(json.rules).toHaveLength(2);
    expect(json.rules[0]!.id).toBe("WR-001");
    expect(json.rules[1]!.checker).toBe("import-boundary");
  });

  it("meta is preserved in JSON output", () => {
    const meta = makeMeta({ projectName: "My Project", version: 3 });
    const json = buildConstitutionJson([], meta, "");
    expect(json.meta.projectName).toBe("My Project");
    expect(json.meta.version).toBe(3);
  });
});

// ── persistConstitution ───────────────────────────────────────────────────────

describe("persistConstitution", () => {
  it("writes CONSTITUTION.md and .warden/constitution.rules.json to disk", async () => {
    const rules = [makeRule()];
    const meta = makeMeta();
    const result = await persistConstitution(rules, meta, { projectRoot: testDir });

    const mdContent = await readFile(result.mdPath, "utf8");
    const jsonContent = await readFile(result.jsonPath, "utf8");

    expect(mdContent).toContain("# Constitution — Acme Orders API");
    const parsed = JSON.parse(jsonContent) as { constitutionMdHash: string; rules: unknown[] };
    expect(parsed.constitutionMdHash).toBe(sha256(mdContent));
    expect(parsed.rules).toHaveLength(1);
  });

  it("hash returned matches hash of file written", async () => {
    const result = await persistConstitution([makeRule()], makeMeta(), {
      projectRoot: testDir,
      mdPath: "CONSTITUTION-v2.md"
    });
    const mdContent = await readFile(result.mdPath, "utf8");
    expect(result.mdHash).toBe(sha256(mdContent));
  });

  it("round-trip: parse JSON → hashes verify", async () => {
    const rules = [makeRule()];
    const meta = makeMeta();
    const result = await persistConstitution(rules, meta, {
      projectRoot: testDir,
      mdPath: "CONSTITUTION-rt.md",
      jsonPath: ".warden/constitution-rt.rules.json"
    });

    const mdContent = await readFile(result.mdPath, "utf8");
    const jsonContent = await readFile(result.jsonPath, "utf8");
    const parsed = JSON.parse(jsonContent) as ConstitutionJson;

    // Hash in JSON must match actual MD content
    expect(parsed.constitutionMdHash).toBe(sha256(mdContent));
  });
});

// ── buildSourceHashes ─────────────────────────────────────────────────────────

describe("buildSourceHashes", () => {
  it("builds a name→hash map from ingested docs", () => {
    const docs = [
      { name: "IDEA.md", hash: "aaa", path: "/p/IDEA.md", sections: [], lineCount: 1 },
      { name: "SPEC.md", hash: "bbb", path: "/p/SPEC.md", sections: [], lineCount: 1 }
    ];
    const hashes = buildSourceHashes(docs);
    expect(hashes["IDEA.md"]).toBe("aaa");
    expect(hashes["SPEC.md"]).toBe("bbb");
  });

  it("returns empty object for empty docs array", () => {
    expect(buildSourceHashes([])).toEqual({});
  });
});

// Type alias for test use
type ConstitutionJson = import("./constitution-render.js").ConstitutionJson;
