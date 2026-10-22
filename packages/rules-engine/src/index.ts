import type { Intent, Rule, Verdict, Violation } from "@warden/shared";

const lineOf = (text: string, match: string): number | undefined => {
  const index = text.indexOf(match);
  return index < 0 ? undefined : text.slice(0, index).split("\n").length;
};

export const checkDiff = (source: string, path: string, rules: readonly Rule[]): Violation[] => rules.flatMap((rule) => {
  if (rule.checker !== "forbidden-call") return [];
  const pattern = rule.params["pattern"];
  if (typeof pattern !== "string" || !source.includes(pattern)) return [];
  return [{ ruleId: rule.id, severity: rule.severity, message: `${rule.title}: found ${pattern}`, path, ...(lineOf(source, pattern) === undefined ? {} : { line: lineOf(source, pattern) }) }];
});

export const checkIntent = (intent: Intent, rules: readonly Rule[]): Violation[] => {
  const text = `${intent.task}\n${intent.plannedChanges ?? ""}`;
  return checkDiff(text, intent.plannedPaths[0] ?? "(unspecified)", rules);
};

export const makeVerdict = (violations: readonly Violation[], skipped: readonly string[] = []): Verdict => {
  const active = violations.filter((violation) => !violation.waived);
  const hasBlocker = active.some((violation) => violation.severity === "critical" || violation.severity === "error");
  const hasWarning = active.some((violation) => violation.severity === "warn") || skipped.length > 0;
  const decision = hasBlocker ? "BLOCK" : hasWarning ? "REVIEW" : "SHIP";
  const penalty = active.reduce((total, item) => total + ({ info: 2, warn: 10, error: 30, critical: 60 }[item.severity]), 0);
  return { decision, score: Math.max(0, 100 - penalty), reasons: active.length ? active.map((item) => item.message) : [decision === "SHIP" ? "All available deterministic checks passed." : "One or more checks need attention."], checksRun: 1, checksSkipped: [...skipped], generatedAt: new Date().toISOString() };
};
