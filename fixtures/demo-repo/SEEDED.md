# Seeded scenarios

fixture: true

- `S1`: `DESIGN.md` and `SPEC.md` deliberately disagree on the database and authentication approach.
- `S2`: A controller attempts to call `db.query(` and must receive a cited `WR-006` block.
- `S3`: A candidate attempts outbound telemetry and reads `STRIPE_SECRET`; the behavior report must require review.
