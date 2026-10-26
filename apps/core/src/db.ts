import Database from "better-sqlite3";
import type { Rule, TrustEvent, Claim, BehaviorReport, Verdict } from "@warden/shared";

// Migration 1 — core tables (rules, checks, violations, events)
// Migration 2 — constitution versions, trust events, waivers, behavior runs, territory claims, bench runs
const migrations: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, trigger TEXT NOT NULL, target_json TEXT NOT NULL, decision TEXT NOT NULL, duration_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS violations (id TEXT PRIMARY KEY, check_id TEXT NOT NULL, rule_id TEXT NOT NULL, severity TEXT NOT NULL, file TEXT NOT NULL, start_line INTEGER, end_line INTEGER, evidence_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, ts TEXT NOT NULL);`,

  `CREATE TABLE IF NOT EXISTS constitution_versions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     hash TEXT NOT NULL,
     rule_count INTEGER NOT NULL,
     json TEXT NOT NULL,
     approved_at TEXT,
     created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS trust_events (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     task_class TEXT NOT NULL,
     area TEXT NOT NULL,
     outcome TEXT NOT NULL,
     weight REAL NOT NULL,
     source_ref TEXT NOT NULL,
     ts TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS waivers (
     id TEXT PRIMARY KEY,
     rule_id TEXT NOT NULL,
     agent_id TEXT,
     reason TEXT NOT NULL,
     granted_by TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     mark_agent_error INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS behavior_runs (
     id TEXT PRIMARY KEY,
     session_id TEXT,
     isolation TEXT NOT NULL,
     risk_score INTEGER NOT NULL,
     findings_json TEXT NOT NULL,
     verdict_json TEXT,
     generated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS territory_claims (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     session_id TEXT NOT NULL,
     intent TEXT NOT NULL,
     paths_json TEXT NOT NULL,
     status TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS bench_runs (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     scenarios_json TEXT NOT NULL,
     metrics_json TEXT NOT NULL,
     created_at TEXT NOT NULL
   );`
];

export type ConstitutionVersionRow = { id: number; hash: string; ruleCount: number; approvedAt: string | undefined; createdAt: string };

export type CodenDatabase = {
  readonly raw: Database.Database;
  migrate(): void;
  // Rules
  saveRule(rule: Rule, status?: "draft" | "approved" | "disabled"): void;
  getRule(id: string): Rule | undefined;
  listRules(status?: "draft" | "approved" | "disabled"): Rule[];
  // Constitution versions
  saveConstitutionVersion(hash: string, rules: readonly Rule[]): number;
  approveConstitutionVersion(id: number): void;
  latestApprovedConstitution(): ConstitutionVersionRow | undefined;
  // Trust events
  saveTrustEvent(event: TrustEvent): void;
  listTrustEvents(agentId: string): TrustEvent[];
  // Waivers
  saveWaiver(waiver: { id: string; ruleId: string; agentId?: string; reason: string; grantedBy: string; expiresAt: string; markAgentError?: boolean }): void;
  activeWaivers(ruleId: string): Array<{ id: string; expiresAt: string }>;
  // Behavior runs
  saveBehaviorRun(report: BehaviorReport, sessionId?: string, verdict?: Verdict): void;
  getBehaviorRun(id: string): BehaviorReport | undefined;
  // Territory claims
  saveClaim(claim: Claim): void;
  getClaim(id: string): Claim | undefined;
  listActiveClaims(): Claim[];
  updateClaimStatus(id: string, status: Claim["status"]): void;
  // Bench runs
  saveBenchRun(run: { id: string; label: string; scenarios: unknown; metrics: unknown }): void;
  listBenchRuns(): Array<{ id: string; label: string; createdAt: string }>;
  close(): void;
};

export const openDatabase = (filename = ":memory:"): CodenDatabase => {
  const raw = new Database(filename);
  raw.pragma("journal_mode = WAL");

  const migrate = (): void => {
    raw.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const [index, sql] of migrations.entries()) {
      const version = index + 1;
      if (raw.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version)) continue;
      raw.transaction(() => {
        raw.exec(sql);
        raw.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
      })();
    }
  };

  const now = (): string => new Date().toISOString();

  return {
    raw,
    migrate,

    // Rules
    saveRule: (rule, status = "draft") => {
      const ts = now();
      raw.prepare("INSERT INTO rules (id, version, json, status, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status, updated_at = excluded.updated_at").run(rule.id, JSON.stringify(rule), status, ts, ts);
    },
    getRule: (id) => {
      const row = raw.prepare("SELECT json FROM rules WHERE id = ?").get(id) as { json: string } | undefined;
      return row ? JSON.parse(row.json) as Rule : undefined;
    },
    listRules: (status) => {
      const rows = (status
        ? raw.prepare("SELECT json FROM rules WHERE status = ?").all(status)
        : raw.prepare("SELECT json FROM rules").all()) as Array<{ json: string }>;
      return rows.map((r) => JSON.parse(r.json) as Rule);
    },

    // Constitution versions
    saveConstitutionVersion: (hash, rules) => {
      const result = raw.prepare("INSERT INTO constitution_versions (hash, rule_count, json, created_at) VALUES (?, ?, ?, ?)").run(hash, rules.length, JSON.stringify(rules), now());
      return result.lastInsertRowid as number;
    },
    approveConstitutionVersion: (id) => {
      raw.prepare("UPDATE constitution_versions SET approved_at = ? WHERE id = ?").run(now(), id);
    },
    latestApprovedConstitution: () => {
      const row = raw.prepare("SELECT id, hash, rule_count, approved_at, created_at FROM constitution_versions WHERE approved_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { id: number; hash: string; rule_count: number; approved_at: string; created_at: string } | undefined;
      if (!row) return undefined;
      return { id: row.id, hash: row.hash, ruleCount: row.rule_count, approvedAt: row.approved_at, createdAt: row.created_at };
    },

    // Trust events
    saveTrustEvent: (event) => {
      raw.prepare("INSERT INTO trust_events (id, agent_id, task_class, area, outcome, weight, source_ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(event.id, event.agentId, event.taskClass, event.area, event.outcome, event.weight, event.sourceRef, event.ts);
    },
    listTrustEvents: (agentId) => {
      const rows = raw.prepare("SELECT * FROM trust_events WHERE agent_id = ? ORDER BY ts ASC").all(agentId) as Array<{ id: string; agent_id: string; task_class: string; area: string; outcome: string; weight: number; source_ref: string; ts: string }>;
      return rows.map((r) => ({ id: r.id, agentId: r.agent_id, taskClass: r.task_class, area: r.area, outcome: r.outcome as TrustEvent["outcome"], weight: r.weight, sourceRef: r.source_ref, ts: r.ts }));
    },

    // Waivers
    saveWaiver: ({ id, ruleId, agentId, reason, grantedBy, expiresAt, markAgentError = false }) => {
      raw.prepare("INSERT INTO waivers (id, rule_id, agent_id, reason, granted_by, expires_at, mark_agent_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(id, ruleId, agentId ?? null, reason, grantedBy, expiresAt, markAgentError ? 1 : 0, now());
    },
    activeWaivers: (ruleId) => {
      const rows = raw.prepare("SELECT id, expires_at FROM waivers WHERE rule_id = ? AND expires_at > ?").all(ruleId, now()) as Array<{ id: string; expires_at: string }>;
      return rows.map((r) => ({ id: r.id, expiresAt: r.expires_at }));
    },

    // Behavior runs
    saveBehaviorRun: (report, sessionId, verdict) => {
      raw.prepare("INSERT INTO behavior_runs (id, session_id, isolation, risk_score, findings_json, verdict_json, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(report.runId, sessionId ?? null, report.isolation, report.riskScore, JSON.stringify(report.findings), verdict ? JSON.stringify(verdict) : null, report.generatedAt);
    },
    getBehaviorRun: (id) => {
      const row = raw.prepare("SELECT * FROM behavior_runs WHERE id = ?").get(id) as { id: string; session_id: string | null; isolation: string; risk_score: number; findings_json: string; verdict_json: string | null; generated_at: string } | undefined;
      if (!row) return undefined;
      return { runId: row.id, isolation: row.isolation as BehaviorReport["isolation"], riskScore: row.risk_score, findings: JSON.parse(row.findings_json) as BehaviorReport["findings"], generatedAt: row.generated_at };
    },

    // Territory claims
    saveClaim: (claim) => {
      const ts = now();
      raw.prepare("INSERT INTO territory_claims (id, agent_id, session_id, intent, paths_json, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET paths_json = excluded.paths_json, status = excluded.status, expires_at = excluded.expires_at, updated_at = excluded.updated_at").run(claim.id, claim.agentId, claim.sessionId, claim.intent, JSON.stringify(claim.paths), claim.status, claim.expiresAt, ts, ts);
    },
    getClaim: (id) => {
      const row = raw.prepare("SELECT * FROM territory_claims WHERE id = ?").get(id) as { id: string; agent_id: string; session_id: string; intent: string; paths_json: string; status: string; expires_at: string } | undefined;
      if (!row) return undefined;
      return { id: row.id, agentId: row.agent_id, sessionId: row.session_id, intent: row.intent, paths: JSON.parse(row.paths_json) as string[], status: row.status as Claim["status"], expiresAt: row.expires_at };
    },
    listActiveClaims: () => {
      const rows = raw.prepare("SELECT * FROM territory_claims WHERE status = 'active' OR status = 'queued'").all() as Array<{ id: string; agent_id: string; session_id: string; intent: string; paths_json: string; status: string; expires_at: string }>;
      return rows.map((r) => ({ id: r.id, agentId: r.agent_id, sessionId: r.session_id, intent: r.intent, paths: JSON.parse(r.paths_json) as string[], status: r.status as Claim["status"], expiresAt: r.expires_at }));
    },
    updateClaimStatus: (id, status) => {
      raw.prepare("UPDATE territory_claims SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
    },

    // Bench runs
    saveBenchRun: ({ id, label, scenarios, metrics }) => {
      raw.prepare("INSERT INTO bench_runs (id, label, scenarios_json, metrics_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(id, label, JSON.stringify(scenarios), JSON.stringify(metrics), now());
    },
    listBenchRuns: () => {
      const rows = raw.prepare("SELECT id, label, created_at FROM bench_runs ORDER BY created_at DESC").all() as Array<{ id: string; label: string; created_at: string }>;
      return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
    },

    close: () => raw.close()
  };
};
