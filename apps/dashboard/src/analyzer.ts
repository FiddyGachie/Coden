export type Severity = "info" | "warn" | "error" | "critical";

export type Rule = {
  id: string;
  title: string;
  severity: Severity;
  source: string;
  remediation: string;
  enabled: boolean;
};

export type Finding = { rule: Rule; line: number; evidence: string };

export type ScanResult = {
  decision: "SHIP" | "REVIEW" | "BLOCK";
  score: number;
  findings: Finding[];
  summary: string;
};

export const defaultRules: Rule[] = [
  { id: "CDN-001", title: "Controllers use repositories", severity: "error", source: "Architecture policy: controllers must not call db.query directly.", remediation: "Move the query into a repository and call that repository from the controller.", enabled: true },
  { id: "CDN-002", title: "Changes do not include secrets", severity: "critical", source: "Security policy: never include credentials or tokens in source changes.", remediation: "Remove the secret, revoke it if it is real, and load it from protected configuration.", enabled: true },
  { id: "CDN-003", title: "Routes declare authentication", severity: "warn", source: "API policy: new payment routes should declare an auth middleware.", remediation: "Add authentication middleware or record a deliberate public-route exception.", enabled: true }
];

const firstLine = (source: string, matcher: (line: string) => boolean): number => source.split("\n").findIndex(matcher) + 1;
const activeRule = (rules: readonly Rule[], id: string): Rule | undefined => rules.find((rule) => rule.id === id && rule.enabled);
const createFinding = (rule: Rule | undefined, line: number, evidence: string): Finding[] => rule && line > 0 ? [{ rule, line, evidence }] : [];

export const scanChange = (source: string, rules: readonly Rule[] = defaultRules): ScanResult => {
  const findings = [
    ...createFinding(activeRule(rules, "CDN-001"), firstLine(source, (line) => line.includes("db.query(")), "Direct database access: db.query("),
    ...createFinding(activeRule(rules, "CDN-002"), firstLine(source, (line) => /(sk-|ghp_|github_pat_|AKIA[0-9A-Z]{16}|STRIPE_SECRET\s*=)/.test(line)), "Possible credential or secret in the proposed change."),
    ...createFinding(activeRule(rules, "CDN-003"), firstLine(source, (line) => /(?:app|router)\.(?:post|put|patch|delete)\([^\n]*payments/.test(line) && !line.includes("auth")), "Payment route has no visible authentication middleware.")
  ];
  const hasBlocker = findings.some(({ rule }) => rule.severity === "error" || rule.severity === "critical");
  const hasWarning = findings.some(({ rule }) => rule.severity === "warn");
  const decision = hasBlocker ? "BLOCK" : hasWarning ? "REVIEW" : "SHIP";
  const penalty = findings.reduce((total, finding) => total + ({ info: 2, warn: 12, error: 35, critical: 60 }[finding.rule.severity]), 0);
  return { decision, score: Math.max(0, 100 - penalty), findings, summary: findings.length === 0 ? "All enabled Coden checks passed." : `${findings.length} policy ${findings.length === 1 ? "issue needs" : "issues need"} attention.` };
};
