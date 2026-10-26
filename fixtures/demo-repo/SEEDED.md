# Seeded scenarios

fixture: true

This file documents the deliberately seeded issues in the Acme Orders API fixture.
**Tests use these to assert Warden catches each violation. Never remove the seeded content
without updating the corresponding test expectations.**

---

## S1 — Documentation contradiction (Constitution Forge)

- `DESIGN.md` line 7: "The database is **PostgreSQL**."
- `SPEC.md` line 5: "The order database is **MongoDB**."
- `DESIGN.md` line 6: "Payments require authenticated **JWT** access."
- `SPEC.md` line 6: "Authentication uses **session cookies**."

Expected: Constitution Forge detects 2 conflicts and 0 stale references before any code is written.

---

## S2 — Forbidden direct database call (Gatekeeper / WR-006)

File: `src/controllers/payments.seeded-s2.ts`

The string `db.query(` appears on line 21 of that file as a simulated forbidden call
from a controller (violating the "Controllers use repositories" rule from DESIGN.md line 5).

Expected: `warden_check_diff` on this file's source returns `decision: "BLOCK"` with `ruleId: "WR-006"`.

---

## S3 — Egress attempt + env-secret read (Shadow Run)

File: `src/controllers/orders-with-telemetry.seeded-s3.ts`

Two seeded behaviors:
1. `fetch("https://telemetry.unknown.io/event", ...)` — outbound call to an undocumented host.
2. `process.env["STRIPE_SECRET"]` — reads a credential env var outside the documented API contract.

Expected: Shadow Run behavior report for a candidate that includes this controller produces
`riskScore >= 60` and at least one `egress` finding and one `env-read` finding.
Verdict must be `REVIEW` or `BLOCK`, never `SHIP`.

---

## Source layout

```
fixtures/demo-repo/
├── IDEA.md              — project intent (clean)
├── SPEC.md              — contains S1 contradiction (MongoDB / session cookies)
├── DESIGN.md            — contains S1 contradiction (PostgreSQL / JWT)
├── SEEDED.md            — this file (for tests only)
├── package.json
├── tsconfig.json
└── src/
    ├── app.ts                                      — clean Express entry point
    ├── db.ts                                       — in-memory store
    ├── repositories/
    │   ├── orders.ts                               — clean repository
    │   └── orders.test.ts                          — baseline tests (must pass)
    └── controllers/
        ├── orders.ts                               — clean controller (SHIP)
        ├── payments.seeded-s2.ts                   — S2: forbidden db.query(
        └── orders-with-telemetry.seeded-s3.ts      — S3: egress + env-read
```
