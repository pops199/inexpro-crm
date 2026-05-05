-- Allow documents to be attached to an asset amendment.
-- Mirrors the per-module FK pattern already used by the documents table.
-- ON DELETE CASCADE is implicit at the DB level for new SQLite columns
-- via REFERENCES, but SQLite enforces it only when foreign_keys=ON.
-- The route handler also deletes amendment attachments from disk before
-- removing the amendment row, so we don't rely on cascade alone.

ALTER TABLE documents ADD COLUMN asset_amendment_id INTEGER REFERENCES asset_amendments(id);

CREATE INDEX IF NOT EXISTS idx_documents_asset_amendment ON documents(asset_amendment_id);
