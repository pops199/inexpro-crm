# Schema migrations

Sequenced SQL files applied in order, recorded in `_schema_migrations`.

## Naming
`NNNN_short_description.sql` — four-digit ascending number, lowercase
underscores, no spaces. Example: `0003_add_broker_signoff_audit.sql`.

## Rules
- One migration = one logical change. Don't bundle unrelated DDL.
- All statements must be **idempotent-safe**: `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN` guarded by a `PRAGMA table_info` check is unnecessary because
  the runner only applies a file once per DB. Plain `CREATE TABLE` and
  `ALTER TABLE ADD COLUMN` are fine.
- Each file is wrapped in a single transaction by the runner — do **not**
  begin/commit yourself.
- Never edit a migration after it has been pushed to a release. Fix
  forward with a new migration.

## How the runner decides what to apply
1. Reads files in this folder, sorted by name.
2. Compares against `_schema_migrations.version` (the `NNNN` prefix).
3. Applies any file whose version is greater than the max applied.
4. On any error, the transaction rolls back and the runner aborts.

## Baseline (0000)
`0000_baseline.sql` is intentionally empty. Existing live DBs already have
the full schema applied via `schema.sql`, so the runner records 0000 as
applied without executing it. New DBs created from scratch still go
through `initDb()` (which runs `schema.sql`) before the runner starts, so
baseline is always implicit.

Real schema changes start at `0001`.
