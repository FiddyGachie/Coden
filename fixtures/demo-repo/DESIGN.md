# Acme Orders API Design

fixture: true

- Controllers use repositories and must not call `db.query(` directly.
- Payments require authenticated JWT access.
- The database is PostgreSQL.
