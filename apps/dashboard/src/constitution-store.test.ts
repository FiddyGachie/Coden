/**
 * T3.8 — ConstitutionStore unit tests
 *
 * Verifies the key acceptance criteria:
 *  - unresolved-conflict rules cannot be approved
 *  - resolving a conflict unblocks dependent rules
 *  - bulk-approve skips blocked rules
 *  - inline edit round-trips correctly
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useConstitutionStore } from "./constitution-store.js";
import type { DashRule, DashConflict } from "./constitution-store.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeRule = (id: string, status: DashRule["status"] = "proposed"): DashRule => ({
  id,
  title: `Rule ${id}`,
  severity: "error",
  checker: "forbidden-call",
  params: { pattern: "db.query(" },
  remediation: "Use repository instead.",
  status,
  source: { file: "DESIGN.md", startLine: 5, quote: "Use repositories" }
});

const makeConflict = (id: string, blockedRuleIds: string[]): DashConflict => ({
  id,
  kind: "value_mismatch",
  severity: "error",
  blockedRuleIds,
  explanation: `Conflict ${id}`,
  suggestedResolution: "Fix it.",
  a: { docPath: "DESIGN.md", line: 7, subject: "database", predicate: "is", value: "PostgreSQL", quote: "db is pg" },
  b: { docPath: "SPEC.md",   line: 5, subject: "database", predicate: "is", value: "MongoDB",    quote: "db is mongo" }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const store = () => useConstitutionStore.getState();

beforeEach(() => {
  useConstitutionStore.getState().load([], []);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useConstitutionStore", () => {
  // Blocked rules
  it("marks a rule as blocked when its conflict is unresolved", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    expect(store().isRuleBlocked("WR-001")).toBe(true);
  });

  it("unblocks a rule once its conflict is resolved", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().resolveConflict("C-001", { type: "ack" });
    expect(store().isRuleBlocked("WR-001")).toBe(false);
  });

  it("unresolved conflict appears in unresolvedConflictIds()", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    expect(store().unresolvedConflictIds()).toContain("C-001");
  });

  it("resolved conflict disappears from unresolvedConflictIds()", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().resolveConflict("C-001", { type: "keep_a" });
    expect(store().unresolvedConflictIds()).not.toContain("C-001");
  });

  // Approve blocked rule
  it("approveRule does nothing when rule is blocked", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().approveRule("WR-001");
    expect(store().rules[0]?.status).toBe("proposed");
  });

  it("approveRule succeeds after conflict is resolved", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().resolveConflict("C-001", { type: "ack" });
    store().approveRule("WR-001");
    expect(store().rules[0]?.status).toBe("approved");
  });

  // Disable / reset
  it("disableRule sets status to disabled regardless of blocking", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().disableRule("WR-001");
    expect(store().rules[0]?.status).toBe("disabled");
  });

  it("resetRule returns rule to proposed", () => {
    store().load([makeRule("WR-001", "approved")], []);
    store().resetRule("WR-001");
    expect(store().rules[0]?.status).toBe("proposed");
  });

  // Bulk approve
  it("bulkApprove skips blocked rules", () => {
    store().load(
      [makeRule("WR-001"), makeRule("WR-002")],
      [makeConflict("C-001", ["WR-001"])]
    );
    store().bulkApprove();
    const statuses = store().rules.map((r) => r.status);
    // WR-001 blocked → still proposed; WR-002 unblocked → approved
    expect(statuses[0]).toBe("proposed");
    expect(statuses[1]).toBe("approved");
  });

  it("bulkApprove approves all unblocked proposed rules after conflicts resolved", () => {
    store().load(
      [makeRule("WR-001"), makeRule("WR-002")],
      [makeConflict("C-001", ["WR-001"])]
    );
    store().resolveConflict("C-001", { type: "keep_b" });
    store().bulkApprove();
    const statuses = store().rules.map((r) => r.status);
    expect(statuses[0]).toBe("approved");
    expect(statuses[1]).toBe("approved");
  });

  // Inline edit
  it("startEdit / commitEdit round-trips title change", () => {
    store().load([makeRule("WR-001")], []);
    store().startEdit("WR-001");
    store().updateDraft({ title: "Updated title" });
    store().commitEdit();
    expect(store().rules[0]?.title).toBe("Updated title");
    expect(store().editingRuleId).toBeNull();
  });

  it("cancelEdit discards draft", () => {
    store().load([makeRule("WR-001")], []);
    store().startEdit("WR-001");
    store().updateDraft({ title: "Discarded" });
    store().cancelEdit();
    expect(store().rules[0]?.title).toBe("Rule WR-001");
    expect(store().editingRuleId).toBeNull();
  });

  // Resolution choices
  it("resolveConflict stores custom resolution text", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().resolveConflict("C-001", { type: "custom", text: "We chose PostgreSQL." });
    const res = store().resolutions["C-001"];
    expect(res?.type).toBe("custom");
    if (res?.type === "custom") expect(res.text).toBe("We chose PostgreSQL.");
  });

  it("clearResolution re-blocks the dependent rule", () => {
    store().load([makeRule("WR-001")], [makeConflict("C-001", ["WR-001"])]);
    store().resolveConflict("C-001", { type: "ack" });
    expect(store().isRuleBlocked("WR-001")).toBe(false);
    store().clearResolution("C-001");
    expect(store().isRuleBlocked("WR-001")).toBe(true);
  });
});
