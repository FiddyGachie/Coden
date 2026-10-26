/**
 * T3.9 — ComplianceWidget
 *
 * Displays compliance scores derived from the constitution store (approved
 * rules) and the current scan findings.
 *
 * Formula (SPEC §5.6):
 *   score = 100 × (1 − Σ(w_s × open_violations) / max(1, Σ(w_s × applicable)))
 *
 * Weights: info=0.1  warn=0.5  error=1  critical=3
 *
 * Since this runs in the browser against demo data (not a real project scan),
 * the widget derives a "simulated" compliance picture from:
 *   - approved rules in the ConstitutionStore (the applicable check set)
 *   - scan findings from the ScanStore (the violations)
 *
 * Per-file breakdown is shown when scan findings are available.
 * A minimal time-series sparkline tracks score across the last N updates.
 */
import { type ReactElement } from "react";
import { useConstitutionStore } from "./constitution-store.js";
import { useScanStore } from "./store.js";

// ── Severity weights (matches SPEC §5.6 and packages/rules-engine) ────────────

const W: Record<string, number> = { info: 0.1, warn: 0.5, error: 1, critical: 3 };
const weight = (sev: string): number => W[sev] ?? 1;

// ── Score computation ─────────────────────────────────────────────────────────

type ScopeScore = {
  score:              number; // 0-100
  weightedViolations: number;
  weightedApplicable: number;
  openViolations:     number;
  totalChecks:        number;
};

type FileScore = ScopeScore & { filePath: string };

type ComplianceSummary = {
  overall: ScopeScore;
  byFile:  FileScore[];
};

const computeScope = (
  applicableSeverities: string[],
  violatedSeverities:   string[]
): ScopeScore => {
  const weightedApplicable = applicableSeverities.reduce((s, v) => s + weight(v), 0);
  const weightedViolations = violatedSeverities.reduce((s, v) => s + weight(v), 0);
  const denominator        = Math.max(1, weightedApplicable);
  const score              = Math.max(0, Math.min(100, 100 * (1 - weightedViolations / denominator)));
  return {
    score,
    weightedViolations,
    weightedApplicable,
    openViolations: violatedSeverities.length,
    totalChecks:    applicableSeverities.length
  };
};

// ── Score ring SVG ────────────────────────────────────────────────────────────

const ScoreRing = ({ score, size = 80 }: { score: number; size?: number }): ReactElement => {
  const r     = (size / 2) * 0.72;
  const circ  = 2 * Math.PI * r;
  const dash  = (score / 100) * circ;
  const color = score >= 80 ? "#4ade80" : score >= 50 ? "#facc15" : "#f87171";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e2d42" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.22} fontWeight="800"
      >
        {Math.round(score)}
      </text>
    </svg>
  );
};

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

const Sparkline = ({ values }: { values: number[] }): ReactElement => {
  if (values.length < 2) return <span className="spark-empty">—</span>;
  const w = 100, h = 28, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (w - 2 * pad));
  const ys = values.map((v) => h - pad - ((v - min) / range) * (h - 2 * pad));
  const d  = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;
  const prev = values[values.length - 2]!;
  const trend = last > prev ? "↑" : last < prev ? "↓" : "→";
  const trendColor = last > prev ? "#4ade80" : last < prev ? "#f87171" : "#94a3b8";

  return (
    <span className="sparkline-wrap" title={`Score trend over ${values.length} scans`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <polyline points="" fill="none" stroke="#1e2d42" strokeWidth="0" />
        <path d={d} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xs[xs.length - 1]!} cy={ys[ys.length - 1]!} r="2.5" fill="#3b82f6" />
      </svg>
      <span style={{ color: trendColor, fontSize: ".85rem", fontWeight: 800 }}>{trend}</span>
    </span>
  );
};

// ── File score row ────────────────────────────────────────────────────────────

const FileRow = ({ fs }: { fs: FileScore }): ReactElement => {
  const bar  = Math.round(fs.score);
  const color = fs.score >= 80 ? "#4ade80" : fs.score >= 50 ? "#facc15" : "#f87171";
  const shortPath = fs.filePath.replace(/^proposed-change\.ts$/, "proposed change");

  return (
    <tr className="score-file-row">
      <td className="score-path"><code>{shortPath}</code></td>
      <td className="score-bar-cell">
        <div className="score-bar-track">
          <div className="score-bar-fill" style={{ width: `${bar}%`, background: color }} />
        </div>
      </td>
      <td className="score-num" style={{ color }}>{Math.round(fs.score)}</td>
      <td className="score-viols">
        {fs.openViolations > 0
          ? <span className="viol-badge">{fs.openViolations} violation{fs.openViolations > 1 ? "s" : ""}</span>
          : <span className="pass-badge">✓</span>
        }
      </td>
    </tr>
  );
};

// ── Main widget ───────────────────────────────────────────────────────────────

export const ComplianceWidget = ({ scoreHistory }: { scoreHistory: number[] }): ReactElement => {
  const { rules } = useConstitutionStore();
  const { verdict, findings } = useScanStore();

  const approvedRules = rules.filter((r) => r.status === "approved");

  // Build the compliance summary from approved rules + current scan findings.
  // Each approved rule × each evaluated file = one applicable check.
  // If there are scan findings, use them as violations; otherwise no violations.
  const hasScanResult = verdict.status === "ready";
  const scanFindings  = findings; // CoreFinding[]

  // Derive applicable checks: one per approved rule per distinct file seen.
  // For demo purposes, if no scan yet — treat as 0 files scanned.
  const scannedFiles = hasScanResult
    ? [...new Set(scanFindings.map((f) => f.path).concat(["proposed-change.ts"]))]
    : [];

  const allRecords: Array<{ filePath: string; severity: string; violated: boolean }> = [];
  for (const file of scannedFiles) {
    for (const rule of approvedRules) {
      const violated = hasScanResult && scanFindings.some(
        (f) => f.path === file && f.ruleId === rule.id
      );
      allRecords.push({ filePath: file, severity: rule.severity, violated });
    }
  }

  // Overall
  const applicableSevs = allRecords.map((r) => r.severity);
  const violatedSevs   = allRecords.filter((r) => r.violated).map((r) => r.severity);
  const overall        = computeScope(applicableSevs, violatedSevs);

  // By file
  const fileMap = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const list = fileMap.get(r.filePath) ?? [];
    list.push(r);
    fileMap.set(r.filePath, list);
  }
  const byFile: FileScore[] = [...fileMap.entries()].map(([filePath, recs]) => ({
    filePath,
    ...computeScope(recs.map((r) => r.severity), recs.filter((r) => r.violated).map((r) => r.severity))
  }));

  const summary: ComplianceSummary = { overall, byFile };

  const noRulesApproved = approvedRules.length === 0;
  const noScanYet       = !hasScanResult;

  return (
    <section className="card compliance-widget" aria-labelledby="compliance-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">COMPLIANCE SCORE</p>
          <h2 id="compliance-heading">Project health</h2>
        </div>
        {scoreHistory.length >= 2 && (
          <div className="spark-wrap">
            <span className="spark-label">Trend</span>
            <Sparkline values={scoreHistory} />
          </div>
        )}
      </div>

      {noRulesApproved ? (
        <p className="compliance-hint">
          Approve at least one rule on the <b>Constitution</b> tab to see compliance scores.
        </p>
      ) : noScanYet ? (
        <div className="compliance-no-scan">
          <ScoreRing score={100} />
          <p className="compliance-hint">
            No scan run yet — score will update after you run a check on the <b>Change scanner</b> tab.
          </p>
        </div>
      ) : (
        <>
          {/* Overall score */}
          <div className="compliance-overall">
            <ScoreRing score={summary.overall.score} size={96} />
            <div className="compliance-overall-detail">
              <div className="compliance-stat">
                <span className="stat-value">{approvedRules.length}</span>
                <span className="stat-label">approved rules</span>
              </div>
              <div className="compliance-stat">
                <span className="stat-value">{summary.overall.totalChecks}</span>
                <span className="stat-label">checks run</span>
              </div>
              <div className="compliance-stat">
                <span className="stat-value" style={{ color: summary.overall.openViolations > 0 ? "#f87171" : "#4ade80" }}>
                  {summary.overall.openViolations}
                </span>
                <span className="stat-label">open violations</span>
              </div>
            </div>
          </div>

          {/* Per-file breakdown */}
          {summary.byFile.length > 0 && (
            <div className="compliance-files">
              <p className="compliance-section-label">Per-file scores</p>
              <table className="score-table" aria-label="Per-file compliance scores">
                <tbody>
                  {summary.byFile.map((fs) => <FileRow key={fs.filePath} fs={fs} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};
