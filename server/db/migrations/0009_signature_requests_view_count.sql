-- Track how many times a public signing link (GIT Confirmation / ROA /
-- any other signable template) is opened by the recipient before they
-- sign it. The GIT Confirmations tab uses this to surface a "Viewed (N)"
-- engagement hint to the broker.
--
-- view_count is bumped on every GET /sign/:token while the request is
-- still pending. After it transitions to 'signed' the counter freezes,
-- which matches the broker-facing meaning ("opens before signing").

ALTER TABLE signature_requests ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signature_requests ADD COLUMN first_viewed_at DATETIME;
ALTER TABLE signature_requests ADD COLUMN last_viewed_at  DATETIME;
