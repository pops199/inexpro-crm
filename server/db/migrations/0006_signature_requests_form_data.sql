-- Some signable templates (e.g. GIT Confirmation of Insurance) carry
-- per-request payload data that the signing page must render: insured
-- name, addresses, coverage limits, vehicle groups, etc. Static POPIA
-- notices don't need this — they reuse the template's bodyHtml as-is.
--
-- Stored as JSON text. NULL when the template is purely static.

ALTER TABLE signature_requests ADD COLUMN form_data TEXT;
