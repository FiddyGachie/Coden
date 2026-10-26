/**
 * T3.8 — Constitution Store
 *
 * Zustand slice for the rules approval UI. Tracks:
 *   - proposed/approved/disabled rules (RenderableRule shape from T3.7)
 *   - unresolved conflicts (ConflictingPair shape from T3.3)
 *   - per-conflict resolution choices
 *   - edit-in-progress state for the inline rule editor
 *
 * Rules that have an unresolved conflict are "blocked" — they cannot be
 * approved until the conflict is acknowledged or resolved.
 */
import { create } from "zustand";

// ── Rule shape (mirrors RenderableRule from packages/rules-engine) ───────────

export type RuleSeverity = "info" | "warn" | "error" | "critical";
export type RuleStatus = "proposed" | "approved" | "disabled";

export type DashRule = {
  id: string;
  title: string;
  severity: RuleSeverity;
  checker: string;
  params: Record<string, unknown>;
  remediation: string;
  status: RuleStatus;
  source: {
    file: string;
    startLine?: number;
    quote?: string;
  };
};

// ── Conflict shape (mirrors ConflictingPair from packages/rules-engine) ──────

export type ConflictKind = "value_mismatch" | "modality_clash" | "stale_reference";

export type ConflictAssertion = {
  docPath: string;
  line: number;
  subject: string;
  predicate: string;
  value: string;
  quote: string;
};

export type DashConflict = {
  id: string;
  kind: ConflictKind;
  severity: "info" | "warn" | "error";
  /** IDs of rules that are blocked by this conflict. */
  blockedRuleIds: string[];
  explanation: string;
  suggestedResolution: string;
  a: ConflictAssertion;
  b: ConflictAssertion | null;
};

// ── Resolution choices ────────────────────────────────────────────────────────

export type ResolutionChoice =
  | { type: "keep_a" }
  | { type: "keep_b" }
  | { type: "custom"; text: string }
  | { type: "ack" };

// ── Store ─────────────────────────────────────────────────────────────────────

export type ConstitutionState = {
  rules: DashRule[];
  conflicts: DashConflict[];
  /** Map of conflictId → chosen resolution. */
  resolutions: Record<string, ResolutionChoice>;
  /** Rule currently being edited inline (null = none). */
  editingRuleId: string | null;
  /** Pending edit buffer. */
  editDraft: Partial<DashRule>;

  // ── Rule actions ────────────────────────────────────────────────────────────
  approveRule(ruleId: string): void;
  disableRule(ruleId: string): void;
  resetRule(ruleId: string): void;
  bulkApprove(ruleIds?: string[]): void;
  startEdit(ruleId: string): void;
  updateDraft(patch: Partial<DashRule>): void;
  commitEdit(): void;
  cancelEdit(): void;

  // ── Conflict actions ────────────────────────────────────────────────────────
  resolveConflict(conflictId: string, choice: ResolutionChoice): void;
  clearResolution(conflictId: string): void;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  isRuleBlocked(ruleId: string): boolean;
  unresolvedConflictIds(): string[];

  // ── Seed / replace all ──────────────────────────────────────────────────────
  load(rules: DashRule[], conflicts: DashConflict[]): void;
};

export const useConstitutionStore = create<ConstitutionState>((set, get) => ({
  rules: [],
  conflicts: [],
  resolutions: {},
  editingRuleId: null,
  editDraft: {},

  approveRule(ruleId) {
    if (get().isRuleBlocked(ruleId)) return; // blocked rules cannot be approved
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === ruleId ? { ...r, status: "approved" } : r
      )
    }));
  },

  disableRule(ruleId) {
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === ruleId ? { ...r, status: "disabled" } : r
      )
    }));
  },

  resetRule(ruleId) {
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === ruleId ? { ...r, status: "proposed" } : r
      )
    }));
  },

  bulkApprove(ruleIds) {
    const ids = new Set(ruleIds ?? get().rules.map((r) => r.id));
    set((s) => ({
      rules: s.rules.map((r) =>
        ids.has(r.id) && !get().isRuleBlocked(r.id) && r.status === "proposed"
          ? { ...r, status: "approved" }
          : r
      )
    }));
  },

  startEdit(ruleId) {
    const rule = get().rules.find((r) => r.id === ruleId);
    if (!rule) return;
    set({ editingRuleId: ruleId, editDraft: { ...rule } });
  },

  updateDraft(patch) {
    set((s) => ({ editDraft: { ...s.editDraft, ...patch } }));
  },

  commitEdit() {
    const { editingRuleId, editDraft } = get();
    if (!editingRuleId) return;
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === editingRuleId ? { ...r, ...editDraft } : r
      ),
      editingRuleId: null,
      editDraft: {}
    }));
  },

  cancelEdit() {
    set({ editingRuleId: null, editDraft: {} });
  },

  resolveConflict(conflictId, choice) {
    set((s) => ({
      resolutions: { ...s.resolutions, [conflictId]: choice }
    }));
  },

  clearResolution(conflictId) {
    set((s) => {
      const next = { ...s.resolutions };
      delete next[conflictId];
      return { resolutions: next };
    });
  },

  isRuleBlocked(ruleId) {
    const { conflicts, resolutions } = get();
    return conflicts.some(
      (c) =>
        c.blockedRuleIds.includes(ruleId) &&
        resolutions[c.id] === undefined
    );
  },

  unresolvedConflictIds() {
    const { conflicts, resolutions } = get();
    return conflicts
      .filter((c) => resolutions[c.id] === undefined)
      .map((c) => c.id);
  },

  load(rules, conflicts) {
    set({ rules, conflicts, resolutions: {}, editingRuleId: null, editDraft: {} });
  }
}));
