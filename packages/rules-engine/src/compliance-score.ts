/**
 * T3.9 — Compliance Scoring  (SPEC §5.6)
 *
 * Formula:
 *   ComplianceScore(scope) =
 *     100 × (1 − Σ(w_s × open_violations_s) / max(1, Σ(w_s × applicable_checks_s)))
 *
 * Severity weights:  info=0.1  warn=0.5  error=1  critical=3
 *
 * "Applicable checks" counts rule × target pairs evaluated (one entry per
 * (ruleId, filePath) pair that was actually run).
 *
 * Scopes reported:
 *   - per-file   — one score per unique filePath evaluated
 *   - module     — one score per directory (first path segment group)
 *   - agent      — one score per agentId (optional; omitted when absent)
 *   - overall    — aggregate across all inputs
 *
 * Time series: a daily snapshot is just a ComplianceSnapshot stamped with
 * `date` (YYYY-MM-DD). Callers accumulate snapshots; this module only
 * produces and queries them.
 */

import type { Severity } from "@warden/shared";

// ── Severity weights (SPEC §5.6) ──────────────────────────────────────────────

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  info:     0.1,
  warn:     0.5,
  error:    1,
  critical: 3
};

// ── Input types ───────────────────────────────────────────────────────────────

/**
 * One evaluated (rule × file) pair — the atomic unit of compliance data.
 *
 * Produce one CheckRecord per `runChecker()` call:
 *   - `ruleId`       from the rule
 *   - `severity`     from the rule
 *   - `filePath`     relative path of the file checked
 *   - `violated`     true when the checker produced at least one violation
 *   - `waived`       true when a human waiver covers this violation
 *   - `agentId`      optional — set when the check was triggered by an agent session
 */
export type CheckRecord = {
  ruleId:   string;
  severity: Severity;
  filePath: string;
  violated: boolean;
  waived:   boolean;
  agentId?: string;
};

// ── Score result types ────────────────────────────────────────────────────────

export type ScopeScore = {
  /** Score 0–100 (may be fractional, round for display). */
  score:              number;
  /** Weighted sum of open (non-waived) violations. */
  weightedViolations: number;
  /** Weighted sum of all applicable checks. */
  weightedApplicable: number;
  /** Raw counts for display. */
  totalChecks:        number;
  openViolations:     number;
  waivedViolations:   number;
};

export type FileScore = ScopeScore & { filePath: string };
export type ModuleScore = ScopeScore & { module: string };
export type AgentScore = ScopeScore & { agentId: string };

export type ComplianceReport = {
  overall:  ScopeScore;
  byFile:   FileScore[];
  byModule: ModuleScore[];
  byAgent:  AgentScore[];
  /** ISO date this report was computed. */
  generatedAt: string;
};

// ── Time-series snapshot ──────────────────────────────────────────────────────

/**
 * A daily snapshot stored in the bench/dashboard time series.
 * Callers append one snapshot per day; query with `filterSnapshots`.
 */
export type ComplianceSnapshot = {
  /** YYYY-MM-DD */
  date:    string;
  overall: ScopeScore;
  /** Per-module scores at the time of the snapshot (optional). */
  byModule?: ModuleScore[];
};

// ── Core formula ──────────────────────────────────────────────────────────────

/**
 * Compute a single ScopeScore from a flat list of CheckRecords.
 * Waived violations are excluded from `open_violations` but still count
 * as applicable checks (they represent work done, not absence of a rule).
 */
export const computeScopeScore = (records: CheckRecord[]): ScopeScore => {
  let weightedViolations = 0;
  let weightedApplicable = 0;
  let openViolations     = 0;
  let waivedViolations   = 0;

  for (const r of records) {
    const w = SEVERITY_WEIGHTS[r.severity];
    weightedApplicable += w;
    if (r.violated) {
      if (r.waived) {
        waivedViolations++;
        // waived: still counts as applicable but NOT as an open violation
      } else {
        openViolations++;
        weightedViolations += w;
      }
    }
  }

  const denominator = Math.max(1, weightedApplicable);
  const score       = 100 * (1 - weightedViolations / denominator);

  return {
    score:              Math.max(0, Math.min(100, score)),
    weightedViolations,
    weightedApplicable,
    totalChecks:        records.length,
    openViolations,
    waivedViolations
  };
};

// ── Module key (first-level directory) ───────────────────────────────────────

/**
 * Derive the "module" key from a file path.
 * "src/controllers/orders.ts" → "src/controllers"
 * "orders.ts"                 → "(root)"
 */
export const moduleOf = (filePath: string): string => {
  const parts = filePath.replace(/\\/g, "/").split("/");
  // Drop the filename, keep up to 2 directory levels for grouping
  const dir = parts.slice(0, -1).join("/");
  return dir.length > 0 ? dir : "(root)";
};

// ── Full report ───────────────────────────────────────────────────────────────

/**
 * Compute the full ComplianceReport from a list of CheckRecords.
 *
 * Groups records by filePath and module, then scores each group.
 * If any records have agentId set, also scores per-agent.
 */
export const computeComplianceReport = (
  records: CheckRecord[],
  now = new Date().toISOString()
): ComplianceReport => {

  // ── overall ────────────────────────────────────────────────────────────────
  const overall = computeScopeScore(records);

  // ── by file ────────────────────────────────────────────────────────────────
  const fileGroups = new Map<string, CheckRecord[]>();
  for (const r of records) {
    const list = fileGroups.get(r.filePath) ?? [];
    list.push(r);
    fileGroups.set(r.filePath, list);
  }
  const byFile: FileScore[] = [...fileGroups.entries()].map(([filePath, recs]) => ({
    filePath,
    ...computeScopeScore(recs)
  }));

  // ── by module ──────────────────────────────────────────────────────────────
  const moduleGroups = new Map<string, CheckRecord[]>();
  for (const r of records) {
    const mod  = moduleOf(r.filePath);
    const list = moduleGroups.get(mod) ?? [];
    list.push(r);
    moduleGroups.set(mod, list);
  }
  const byModule: ModuleScore[] = [...moduleGroups.entries()].map(([module, recs]) => ({
    module,
    ...computeScopeScore(recs)
  }));

  // ── by agent (only when agentId is present) ────────────────────────────────
  const agentGroups = new Map<string, CheckRecord[]>();
  for (const r of records) {
    if (!r.agentId) continue;
    const list = agentGroups.get(r.agentId) ?? [];
    list.push(r);
    agentGroups.set(r.agentId, list);
  }
  const byAgent: AgentScore[] = [...agentGroups.entries()].map(([agentId, recs]) => ({
    agentId,
    ...computeScopeScore(recs)
  }));

  return { overall, byFile, byModule, byAgent, generatedAt: now };
};

// ── Time-series helpers ───────────────────────────────────────────────────────

/**
 * Create a ComplianceSnapshot from a ComplianceReport (for daily archiving).
 * The `date` is derived from `report.generatedAt` (ISO string).
 */
export const snapshotFromReport = (report: ComplianceReport): ComplianceSnapshot => ({
  date:     report.generatedAt.slice(0, 10),   // YYYY-MM-DD
  overall:  report.overall,
  byModule: report.byModule
});

/**
 * Filter a snapshot series to a date range (inclusive on both ends).
 * Dates are compared lexicographically (safe for YYYY-MM-DD strings).
 */
export const filterSnapshots = (
  snapshots: ComplianceSnapshot[],
  from: string,
  to:   string
): ComplianceSnapshot[] =>
  snapshots.filter((s) => s.date >= from && s.date <= to);

/**
 * Compute the score delta between the earliest and latest snapshot in a series.
 * Returns undefined when fewer than two snapshots are present.
 */
export const scoreDelta = (snapshots: ComplianceSnapshot[]): number | undefined => {
  if (snapshots.length < 2) return undefined;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const first  = sorted[0]!.overall.score;
  const last   = sorted[sorted.length - 1]!.overall.score;
  return last - first;
};
