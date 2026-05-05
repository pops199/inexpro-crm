-- Asset amendments: free-form notes / amendment log per asset.
-- Mirrors the claim_notes pattern.

CREATE TABLE IF NOT EXISTS asset_amendments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  amendment_date DATE NOT NULL,
  amendment_type TEXT,
  details TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_amendments_asset ON asset_amendments(asset_id);
