/**
 * T3.8 — RulesTable
 *
 * Renders the interactive rules table for the constitution approval UI.
 * Features:
 *   - Per-rule approve / disable / reset actions
 *   - Inline edit (title, severity, remediation)
 *   - Bulk-approve all unblocked proposed rules
 *   - Blocked-rule indicator (lock icon + tooltip) for unresolved conflicts
 *   - Status badge with colour coding
 */
import type { ReactElement } from "react";
import { useConstitutionStore, type DashRule } from "./constitution-store.js";

// ── Severity badge ────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "sev-critical",
  error:    "sev-error",
  warn:     "sev-warn",
  info:     "sev-info"
};

const SeverityBadge = ({ severity }: { severity: string }): ReactElement => (
  <span className={`badge ${SEVERITY_COLORS[severity] ?? ""}`}>{severity}</span>
);

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  approved: "status-approved",
  proposed: "status-proposed",
  disabled: "status-disabled"
};

const StatusBadge = ({ status }: { status: string }): ReactElement => (
  <span className={`badge ${STATUS_COLORS[status] ?? ""}`}>{status}</span>
);

// ── Inline edit row ───────────────────────────────────────────────────────────

const EditRow = ({ rule }: { rule: DashRule }): ReactElement => {
  const { editDraft, updateDraft, commitEdit, cancelEdit } = useConstitutionStore();

  return (
    <tr className="rule-edit-row" aria-label={`Editing rule ${rule.id}`}>
      <td colSpan={6}>
        <div className="edit-form">
          <div className="edit-row">
            <label htmlFor={`edit-title-${rule.id}`}>Title</label>
            <input
              id={`edit-title-${rule.id}`}
              value={typeof editDraft.title === "string" ? editDraft.title : rule.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
            />
          </div>
          <div className="edit-row">
            <label htmlFor={`edit-sev-${rule.id}`}>Severity</label>
            <select
              id={`edit-sev-${rule.id}`}
              value={editDraft.severity ?? rule.severity}
              onChange={(e) =>
                updateDraft({ severity: e.target.value as DashRule["severity"] })
              }
            >
              {["info", "warn", "error", "critical"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="edit-row">
            <label htmlFor={`edit-rem-${rule.id}`}>Remediation</label>
            <input
              id={`edit-rem-${rule.id}`}
              value={
                typeof editDraft.remediation === "string"
                  ? editDraft.remediation
                  : rule.remediation
              }
              onChange={(e) => updateDraft({ remediation: e.target.value })}
            />
          </div>
          <div className="edit-actions">
            <button type="button" onClick={commitEdit}>Save</button>
            <button type="button" className="secondary" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );
};

// ── Single rule row ───────────────────────────────────────────────────────────

const RuleRow = ({ rule }: { rule: DashRule }): ReactElement => {
  const {
    approveRule, disableRule, resetRule, startEdit,
    editingRuleId, isRuleBlocked
  } = useConstitutionStore();

  const blocked = isRuleBlocked(rule.id);
  const isEditing = editingRuleId === rule.id;

  const sourceRef = rule.source.startLine
    ? `${rule.source.file}:${rule.source.startLine}`
    : rule.source.file;

  return (
    <>
      <tr
        className={`rule-row${blocked ? " rule-blocked" : ""}${isEditing ? " rule-editing" : ""}`}
        aria-label={`Rule ${rule.id}`}
      >
        <td className="rule-id">
          <code>{rule.id}</code>
        </td>
        <td className="rule-title">
          <span>{rule.title}</span>
          <small className="rule-source">{sourceRef}</small>
          {rule.source.quote && (
            <small className="rule-quote">"{rule.source.quote}"</small>
          )}
        </td>
        <td><SeverityBadge severity={rule.severity} /></td>
        <td><code className="checker-chip">{rule.checker}</code></td>
        <td>
          <div className="status-cell">
            <StatusBadge status={rule.status} />
            {blocked && (
              <span
                className="blocked-icon"
                title="Unresolved conflict — resolve it above before approving"
                aria-label="Blocked: unresolved conflict"
              >
                🔒
              </span>
            )}
          </div>
        </td>
        <td className="rule-actions">
          {rule.status === "proposed" && !blocked && (
            <button
              type="button"
              className="action-btn approve-btn"
              onClick={() => approveRule(rule.id)}
              aria-label={`Approve ${rule.id}`}
            >
              Approve
            </button>
          )}
          {rule.status === "approved" && (
            <button
              type="button"
              className="action-btn reset-btn"
              onClick={() => resetRule(rule.id)}
              aria-label={`Reset ${rule.id} to proposed`}
            >
              Revoke
            </button>
          )}
          {rule.status !== "disabled" && (
            <button
              type="button"
              className="action-btn disable-btn secondary"
              onClick={() => disableRule(rule.id)}
              aria-label={`Disable ${rule.id}`}
            >
              Disable
            </button>
          )}
          {rule.status === "disabled" && (
            <button
              type="button"
              className="action-btn reset-btn secondary"
              onClick={() => resetRule(rule.id)}
              aria-label={`Re-propose ${rule.id}`}
            >
              Re-propose
            </button>
          )}
          <button
            type="button"
            className="action-btn edit-btn secondary"
            onClick={() => startEdit(rule.id)}
            disabled={isEditing}
            aria-label={`Edit ${rule.id}`}
          >
            Edit
          </button>
        </td>
      </tr>
      {isEditing && <EditRow rule={rule} />}
    </>
  );
};

// ── Rules table ───────────────────────────────────────────────────────────────

export const RulesTable = (): ReactElement => {
  const { rules, bulkApprove, unresolvedConflictIds } = useConstitutionStore();

  const proposed   = rules.filter((r) => r.status === "proposed");
  const approved   = rules.filter((r) => r.status === "approved");
  const disabled   = rules.filter((r) => r.status === "disabled");
  const unresolved = unresolvedConflictIds().length;

  const canBulkApprove = proposed.some(
    (r) => !useConstitutionStore.getState().isRuleBlocked(r.id)
  );

  return (
    <section className="card constitution-panel" aria-labelledby="rules-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">CONSTITUTION</p>
          <h2 id="rules-heading">Rules</h2>
        </div>
        <div className="panel-meta">
          <span className="meta-chip">{approved.length} approved</span>
          <span className="meta-chip proposed-chip">{proposed.length} proposed</span>
          {disabled.length > 0 && (
            <span className="meta-chip disabled-chip">{disabled.length} disabled</span>
          )}
          {unresolved > 0 && (
            <span className="meta-chip conflict-chip">
              {unresolved} unresolved conflict{unresolved > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {canBulkApprove && (
        <div className="bulk-bar">
          <button
            type="button"
            className="bulk-approve-btn"
            onClick={() => bulkApprove()}
            aria-label="Approve all unblocked proposed rules"
          >
            Approve all unblocked ({proposed.filter(
              (r) => !useConstitutionStore.getState().isRuleBlocked(r.id)
            ).length})
          </button>
          <span className="bulk-hint">
            Blocked rules must have conflicts resolved first.
          </span>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="empty-state">No rules generated yet. Run Constitution Forge first.</p>
      ) : (
        <div className="table-scroll">
          <table className="rules-tbl" aria-label="Constitution rules">
            <thead>
              <tr>
                <th>ID</th>
                <th>Rule</th>
                <th>Severity</th>
                <th>Checker</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
