-- Track when a GIT Confirmation (or any signable) signing link was last
-- emailed to a recipient from the "Signature link created" popup, and to
-- which address. The GIT Confirmations tab uses email_sent_at to show a
-- "Sent" pill until the link is opened (view_count > 0), giving the broker a
-- Sent → Viewed → Signed lifecycle at a glance. The email itself is sent via
-- the shared mailer (which CCs the broker and writes the audit-trail entry);
-- these columns just record that it happened.

ALTER TABLE signature_requests ADD COLUMN email_sent_at   DATETIME;
ALTER TABLE signature_requests ADD COLUMN last_emailed_to TEXT;
