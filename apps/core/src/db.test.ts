import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type CodenDatabase } from "./db.js";
import type { BehaviorReport, Claim, TrustEvent } from "@warden/shared";

let database: CodenDatabase | undefined;
afterEach(() => database?.close());

describe("Coden database", () => {
  it("migrates idempotently with WAL enabled", () => {
    database = openDatabase();
    database.migrate();
    database.migrate();
    expect(database.raw.pragma("journal_mode", { simple: true })).toBe("memory");
    expect(database.raw.prepare("SELECT count(*) AS total FROM schema_migrations").get()).toEqual({ total: 2 });
  });

  it("persists typed rules", () => {
    database = openDatabase();
    database.migrate();
    database.saveRule({ id: "WR-006", title: "Use repositories", severity: "error", source: { path: "DESIGN.md", line: 4, quote: "Use repositories" }, checker: "forbidden-call", params: { pattern: "db.query(" }, remediation: "Use a repository." }, "approved");
    expect(database.getRule("WR-006")?.title).toBe("Use repositories");
  });

  it("lists rules filtered by status", () => {
    database = openDatabase();
    database.migrate();
    database.saveRule({ id: "WR-001", title: "A", severity: "warn", source: { path: "SPEC.md", line: 1, quote: "A" }, checker: "forbidden-call", params: {}, remediation: "Fix A." }, "approved");
    database.saveRule({ id: "WR-002", title: "B", severity: "info", source: { path: "SPEC.md", line: 2, quote: "B" }, checker: "no-secrets", params: {}, remediation: "Fix B." }, "draft");
    expect(database.listRules("approved")).toHaveLength(1);
    expect(database.listRules("draft")).toHaveLength(1);
    expect(database.listRules()).toHaveLength(2);
  });

  it("saves and approves a constitution version", () => {
    database = openDatabase();
    database.migrate();
    const rule = { id: "WR-006", title: "T", severity: "error" as const, source: { path: "D.md", line: 1, quote: "T" }, checker: "forbidden-call" as const, params: {}, remediation: "R." };
    expect(database.latestApprovedConstitution()).toBeUndefined();
    const id = database.saveConstitutionVersion("abc123", [rule]);
    expect(database.latestApprovedConstitution()).toBeUndefined(); // not approved yet
    database.approveConstitutionVersion(id);
    const latest = database.latestApprovedConstitution();
    expect(latest?.hash).toBe("abc123");
    expect(latest?.ruleCount).toBe(1);
    expect(latest?.approvedAt).toBeTruthy();
  });

  it("persists and retrieves trust events", () => {
    database = openDatabase();
    database.migrate();
    const event: TrustEvent = { id: "te-1", agentId: "claude", taskClass: "feature", area: "orders", outcome: "pass", weight: 1, sourceRef: "check-1", ts: "2026-01-01T00:00:00.000Z" };
    database.saveTrustEvent(event);
    const list = database.listTrustEvents("claude");
    expect(list).toHaveLength(1);
    expect(list[0]?.outcome).toBe("pass");
    // idempotent — duplicate insert does nothing
    database.saveTrustEvent(event);
    expect(database.listTrustEvents("claude")).toHaveLength(1);
  });

  it("saves waivers and returns only active ones", () => {
    database = openDatabase();
    database.migrate();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    database.saveWaiver({ id: "w-1", ruleId: "WR-006", reason: "approved exception", grantedBy: "alice", expiresAt: future });
    database.saveWaiver({ id: "w-2", ruleId: "WR-006", reason: "old waiver", grantedBy: "alice", expiresAt: past });
    const active = database.activeWaivers("WR-006");
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe("w-1");
  });

  it("saves and retrieves behavior runs", () => {
    database = openDatabase();
    database.migrate();
    const report: BehaviorReport = { runId: "br-1", isolation: "docker", riskScore: 72, findings: [{ kind: "egress", severity: "error", evidence: "telemetry.unknown.io:443" }], generatedAt: "2026-01-01T00:00:00.000Z" };
    database.saveBehaviorRun(report, "session-1");
    const retrieved = database.getBehaviorRun("br-1");
    expect(retrieved?.riskScore).toBe(72);
    expect(retrieved?.findings).toHaveLength(1);
    expect(retrieved?.findings[0]?.kind).toBe("egress");
  });

  it("saves territory claims and tracks status transitions", () => {
    database = openDatabase();
    database.migrate();
    const claim: Claim = { id: "cl-1", agentId: "claude", sessionId: "s-1", intent: "add payments endpoint", paths: ["src/payments.ts"], status: "active", expiresAt: "2026-12-31T00:00:00.000Z" };
    database.saveClaim(claim);
    expect(database.getClaim("cl-1")?.status).toBe("active");
    expect(database.listActiveClaims()).toHaveLength(1);
    database.updateClaimStatus("cl-1", "released");
    expect(database.listActiveClaims()).toHaveLength(0);
    expect(database.getClaim("cl-1")?.status).toBe("released");
  });

  it("saves and lists bench runs", () => {
    database = openDatabase();
    database.migrate();
    database.saveBenchRun({ id: "run-1", label: "baseline-2026-01-01", scenarios: [{ id: "S2" }], metrics: { violationCatchRate: 1.0 } });
    const runs = database.listBenchRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.label).toBe("baseline-2026-01-01");
    // idempotent
    database.saveBenchRun({ id: "run-1", label: "baseline-2026-01-01", scenarios: [], metrics: {} });
    expect(database.listBenchRuns()).toHaveLength(1);
  });
});
