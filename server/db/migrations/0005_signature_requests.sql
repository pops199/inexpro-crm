-- e-Signature flow for documents that need a client signature back
-- (POPIA / FICA consent forms, etc.).
--
-- Lifecycle:
--   1. Broker sends an email with a signable template attached. The server
--      creates a `signature_requests` row with status='pending' and a
--      random token, and embeds the public signing URL in the email.
--   2. Client opens /sign/<token>, reviews the notice, ticks YES/NO for
--      marketing, draws their signature, and submits.
--   3. Server stamps the signature onto a generated PDF, saves the PDF to
--      the `documents` table, links it to the contact / account / policy,
--      flips this row to status='signed', and audits the event.

CREATE TABLE signature_requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  token               TEXT NOT NULL UNIQUE,
  template_key        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','signed','expired','revoked')),

  -- Destination linkage — at least one of contact_id / account_id must be set.
  contact_id          INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  policy_id           INTEGER REFERENCES policies(id) ON DELETE SET NULL,

  -- Who sent it + when.
  created_by          INTEGER NOT NULL REFERENCES users(id),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          DATETIME,

  -- Public-facing fields the broker can prefill.
  recipient_name      TEXT,
  recipient_email     TEXT,

  -- Captured at signature submit time.
  signed_at           DATETIME,
  signed_ip           TEXT,
  signed_user_agent   TEXT,
  signer_typed_name   TEXT,
  marketing_consent   INTEGER,      -- 1=yes, 0=no, NULL=not answered

  -- Output: the generated signed PDF in the documents table.
  document_id         INTEGER REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_signature_requests_token   ON signature_requests(token);
CREATE INDEX idx_signature_requests_contact ON signature_requests(contact_id);
CREATE INDEX idx_signature_requests_account ON signature_requests(account_id);
CREATE INDEX idx_signature_requests_status  ON signature_requests(status);
