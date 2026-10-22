export type ScanResult = {
  decision: "PASS" | "BLOCK";
  evidence: string;
  remediation: string;
};

/**
 * The Coden proof of concept enforces one clear architectural boundary:
 * controllers must use a repository rather than reaching into the database.
 */
export const scanChange = (source: string): ScanResult => {
  const lineNumber = source.split("\n").findIndex((line) => line.includes("db.query(")) + 1;
  if (lineNumber > 0) {
    return {
      decision: "BLOCK",
      evidence: `Direct database access found on line ${lineNumber}: db.query(`,
      remediation: "Move the query into a repository and call that repository from the controller."
    };
  }

  return {
    decision: "PASS",
    evidence: "No direct database access was found in this change.",
    remediation: "This change respects the current Coden proof-of-concept rule."
  };
};
