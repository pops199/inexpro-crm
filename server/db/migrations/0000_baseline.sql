-- Baseline marker. The full schema is owned by schema.sql and is applied
-- on every initDb() before the migration runner starts. This file exists
-- only so the runner has a known floor (version 0000) and so the
-- _schema_migrations table is never empty on a freshly-bootstrapped DB.
SELECT 1;
