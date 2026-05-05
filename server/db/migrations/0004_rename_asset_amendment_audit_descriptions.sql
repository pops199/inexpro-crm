-- Backfill: the asset "Amendments" tab was renamed to "Notes" in v1.0.30.
-- Future audit_log writes from server/routes/assets.js already use the new
-- wording, but rows created before the rename still read "Amendment …".
-- Rewrite those rows so timelines render the new wording uniformly.
--
-- Scoped to module = 'assets' to avoid touching unrelated audit entries
-- (e.g. the separate "Create Amendment Mail" feature on the asset detail
-- page, which uses module = 'emails' / 'documents').

UPDATE audit_log
SET description = 'Note added to asset'
WHERE module = 'assets'
  AND description = 'Amendment added to asset';

UPDATE audit_log
SET description = 'Note updated on asset'
WHERE module = 'assets'
  AND description = 'Amendment updated on asset';

UPDATE audit_log
SET description = REPLACE(description, 'Amendment deleted from asset', 'Note deleted from asset')
WHERE module = 'assets'
  AND description LIKE 'Amendment deleted from asset%';
