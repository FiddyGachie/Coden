/**
 * T3.8 — ConflictPanel
 *
 * Renders unresolved documentation conflicts discovered by Constitution Forge
 * and lets the reviewer pick a resolution for each one before rules that
 * depend on it can be approved.
 *
 * Resolution choices per conflict:
 *   keep_a   — document A is authoritative; update document B
 *   keep_b   — document B is authoritative; update document A
 *   custom   — enter a custom resolution note
 *   ack      — acknowledge the discrepancy but proceed anyway
 *
 * A conflict is "resolved" once any choice is recorded. The store's
 * isRuleBlocked() check reads resolutions to decide whether dependent
 * rules can be approved.
 */
import { useState, type ReactElement } from "react";
import {
  useConstitutionStore,
  type DashConflict,
  type ResolutionChoice
} from "./constitution-store.js";

// ── Conflict kind label ───────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  value_mismatch:  "Value mismatch",
  modality_clash:  "Modality clash",
  stale_reference: "Stale reference"
};

const KIND_COLORS: Record<string, string> = {
  value_mismatch:  "conflict-value",
  modality_clash:  "conflict-modality",
  stale_reference: "conflict-stale"
};

// ── Single conflict card ──────────────────────────────────────────────────────

const ConflictCard = ({ conflict }: { conflict: DashConflict }): ReactElement => {
  const { resolutions, resolveConflict, clearResolution, rules } = useConstitutionStore();
  const resolution = resolutions[conflict.id];
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const resolve = (choice: ResolutionChoice): void => {
    resolveConflict(conflict.id, choice);
    setShowCustom(false);
  };

  const blockedTitles = conflict.blockedRuleIds
    .map((id) => rules.find((r) => r.id === id)?.id ?? id)
    .join(", ");

  return (
    <div
      className={`conflict-card${resolution ? " conflict-resolved" : ""}`}
      aria-label={`Conflict: ${conflict.explanation.slice(0, 60)}`}
    >
      {/* Header */}
      <div className="conflict-header">
        <span className={`badge conflict-kind ${KIND_COLORS[conflict.kind] ?? ""}`}>
          {KIND_LABELS[conflict.kind] ?? conflict.kind}
        </span>
        <span className={`badge sev-${conflict.severity}`}>{conflict.severity}</span>
        {resolution && (
          <span className="badge status-approved">resolved</span>
        )}
      </div>

      {/* Explanation */}
      <p className="conflict-explanation">{conflict.explanation}</p>

      {/* Assertion A */}
      <div className="assertion-block">
        <p className="assertion-label">Document A — <code>{conflict.a.docPath}</code> line {conflict.a.line}</p>
        <blockquote className="assertion-quote">"{conflict.a.quote}"</blockquote>
        <p className="assertion-claim">
          <b>{conflict.a.subject}</b> {conflict.a.predicate} <em>{conflict.a.value}</em>
        </p>
      </div>

      {/* Assertion B (null for stale_reference) */}
      {conflict.b && (
        <div className="assertion-block">
          <p className="assertion-label">Document B — <code>{conflict.b.docPath}</code> line {conflict.b.line}</p>
          <blockquote className="assertion-quote">"{conflict.b.quote}"</blockquote>
          <p className="assertion-claim">
            <b>{conflict.b.subject}</b> {conflict.b.predicate} <em>{conflict.b.value}</em>
          </p>
        </div>
      )}

      {/* Suggested resolution */}
      <p className="conflict-suggestion">
        <b>Suggestion:</b> {conflict.suggestedResolution}
      </p>

      {/* Blocked rules */}
      {conflict.blockedRuleIds.length > 0 && (
        <p className="conflict-blocks">
          🔒 Blocks approval of: <code>{blockedTitles}</code>
        </p>
      )}

      {/* Resolution controls */}
      {!resolution ? (
        <div className="resolution-actions" role="group" aria-label="Choose resolution">
          {conflict.b && (
            <>
              <button
                type="button"
                className="action-btn resolve-a-btn"
                onClick={() => resolve({ type: "keep_a" })}
              >
                Keep A ({conflict.a.docPath})
              </button>
              <button
                type="button"
                className="action-btn resolve-b-btn secondary"
                onClick={() => resolve({ type: "keep_b" })}
              >
                Keep B ({conflict.b.docPath})
              </button>
            </>
          )}
          <button
            type="button"
            className="action-btn secondary"
            onClick={() => setShowCustom((v) => !v)}
          >
            Custom…
          </button>
          <button
            type="button"
            className="action-btn ack-btn secondary"
            onClick={() => resolve({ type: "ack" })}
          >
            Acknowledge &amp; proceed
          </button>
        </div>
      ) : (
        <div className="resolution-chosen" role="status" aria-live="polite">
          <span className="resolution-label">
            {resolution.type === "keep_a" && `✓ Will use ${conflict.a.docPath} as authoritative`}
            {resolution.type === "keep_b" && `✓ Will use ${conflict.b?.docPath ?? "B"} as authoritative`}
            {resolution.type === "custom" && `✓ Custom: ${resolution.text}`}
            {resolution.type === "ack" && "✓ Acknowledged — proceeding with discrepancy noted"}
          </span>
          <button
            type="button"
            className="action-btn secondary small-btn"
            onClick={() => clearResolution(conflict.id)}
          >
            Change
          </button>
        </div>
      )}

      {/* Custom text input */}
      {showCustom && !resolution && (
        <div className="custom-resolution">
          <label htmlFor={`custom-${conflict.id}`}>Resolution note</label>
          <textarea
            id={`custom-${conflict.id}`}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Describe how you resolved this conflict…"
            rows={3}
          />
          <div className="edit-actions">
            <button
              type="button"
              className="action-btn"
              disabled={customText.trim().length === 0}
              onClick={() => resolve({ type: "custom", text: customText.trim() })}
            >
              Save resolution
            </button>
            <button
              type="button"
              className="action-btn secondary"
              onClick={() => { setShowCustom(false); setCustomText(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Conflicts panel ───────────────────────────────────────────────────────────

export const ConflictPanel = (): ReactElement | null => {
  const { conflicts, resolutions } = useConstitutionStore();

  if (conflicts.length === 0) return null;

  const resolved   = conflicts.filter((c) => resolutions[c.id] !== undefined);
  const unresolved = conflicts.filter((c) => resolutions[c.id] === undefined);

  return (
    <section
      className="card conflict-panel"
      aria-labelledby="conflicts-heading"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">CONFLICTS</p>
          <h2 id="conflicts-heading">Documentation conflicts</h2>
        </div>
        <div className="panel-meta">
          {unresolved.length > 0 && (
            <span className="meta-chip conflict-chip">
              {unresolved.length} unresolved
            </span>
          )}
          {resolved.length > 0 && (
            <span className="meta-chip">
              {resolved.length} resolved
            </span>
          )}
        </div>
      </div>

      {unresolved.length > 0 && (
        <p className="conflict-intro">
          Resolve each conflict below before approving rules that depend on it.
        </p>
      )}

      <div className="conflict-list">
        {conflicts.map((c) => (
          <ConflictCard key={c.id} conflict={c} />
        ))}
      </div>
    </section>
  );
};
