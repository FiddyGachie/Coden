/**
 * T3.8 — Demo seed data
 *
 * Seeds the ConstitutionStore with:
 *   - 6 proposed rules synthesised from the Acme Orders API fixture
 *   - 2 seeded conflicts from SEEDED.md (S1a: PostgreSQL vs MongoDB,
 *     S1b: JWT vs session cookies)
 *
 * The two conflicts each block one rule so the acceptance criterion
 * "unresolved-conflict rules cannot be approved" is testable in the UI.
 */
import type { DashRule, DashConflict } from "./constitution-store.js";

export const DEMO_RULES: DashRule[] = [
  {
    id: "WR-001",
    title: "Controllers must use repositories",
    severity: "error",
    checker: "required-wrapper",
    params: { forbiddenDirectCall: "db.query(", requiredWrapper: "repository." },
    remediation:
      "Replace direct db.query() calls with the appropriate repository method (e.g. ordersRepository.create()).",
    status: "proposed",
    source: {
      file: "DESIGN.md",
      startLine: 5,
      quote: "Controllers must use repository abstractions"
    }
  },
  {
    id: "WR-002",
    title: "No direct database imports in controller files",
    severity: "error",
    checker: "import-boundary",
    params: {
      protectedGlob: "src/db*",
      allowedImporterGlobs: ["src/repositories/**"]
    },
    remediation:
      "Controllers may not import db directly. Import from src/repositories/ instead.",
    status: "proposed",
    source: {
      file: "DESIGN.md",
      startLine: 5,
      quote: "Only repositories may access the database layer"
    }
  },
  {
    id: "WR-003",
    title: "No secrets committed to source",
    severity: "critical",
    checker: "no-secrets",
    params: {},
    remediation:
      "Remove secrets from source. Use environment variables and never commit credentials.",
    status: "proposed",
    source: {
      file: "SPEC.md",
      startLine: 8,
      quote: "Credentials must not appear in version control"
    }
  },
  {
    id: "WR-004",
    title: "Routes must include authenticate middleware",
    severity: "error",
    checker: "route-requires-middleware",
    params: {
      routeFileGlob: "src/controllers/**",
      middlewareName: "authenticate"
    },
    remediation:
      "Add the authenticate middleware to every route handler in controller files.",
    status: "proposed",
    source: {
      file: "DESIGN.md",
      startLine: 6,
      // Blocked by conflict C-001 (JWT vs session cookies)
      quote: "All routes require authenticated access"
    }
  },
  {
    id: "WR-005",
    title: "Orders module must have test coverage",
    severity: "warn",
    checker: "test-required",
    params: { sourceGlob: "src/**/*.ts" },
    remediation:
      "Create a sibling .test.ts file for every source file in src/.",
    status: "proposed",
    source: {
      file: "SPEC.md",
      startLine: 9,
      quote: "All modules must ship with tests"
    }
  },
  {
    id: "WR-006",
    title: "Database layer must use SQLite via better-sqlite3",
    severity: "error",
    checker: "dependency-allowlist",
    params: { allowed: ["better-sqlite3"] },
    remediation:
      "Use only better-sqlite3 for database access. Remove any conflicting ORM or driver.",
    status: "proposed",
    source: {
      file: "SPEC.md",
      startLine: 5,
      // Blocked by conflict C-002 (PostgreSQL vs MongoDB)
      quote: "The order database is …"
    }
  }
];

export const DEMO_CONFLICTS: DashConflict[] = [
  {
    id: "C-001",
    kind: "value_mismatch",
    severity: "error",
    blockedRuleIds: ["WR-004"], // auth-mechanism conflict blocks middleware rule
    explanation:
      '"Authentication mechanism" is defined as "JWT" in DESIGN.md:6 but "session cookies" in SPEC.md:6.',
    suggestedResolution:
      "Decide which document is authoritative and update or remove the other.",
    a: {
      docPath: "DESIGN.md",
      line: 6,
      subject: "authentication",
      predicate: "uses",
      value: "JWT",
      quote: "Payments require authenticated JWT access."
    },
    b: {
      docPath: "SPEC.md",
      line: 6,
      subject: "authentication",
      predicate: "uses",
      value: "session cookies",
      quote: "Authentication uses session cookies."
    }
  },
  {
    id: "C-002",
    kind: "value_mismatch",
    severity: "error",
    blockedRuleIds: ["WR-006"], // database tech conflict blocks DB rule
    explanation:
      '"Database" is defined as "PostgreSQL" in DESIGN.md:7 but "MongoDB" in SPEC.md:5.',
    suggestedResolution:
      "Decide which document is authoritative and update or remove the other.",
    a: {
      docPath: "DESIGN.md",
      line: 7,
      subject: "database",
      predicate: "is",
      value: "PostgreSQL",
      quote: "The database is PostgreSQL."
    },
    b: {
      docPath: "SPEC.md",
      line: 5,
      subject: "database",
      predicate: "is",
      value: "MongoDB",
      quote: "The order database is MongoDB."
    }
  }
];
