-- Per-user email signature linkage on the user profile itself.
-- Stores the basename of a file that lives in <repo>/signatures/.
-- The email-signature helper looks here FIRST, falling back to the
-- legacy smtp_from_list mapping if not set.

ALTER TABLE users ADD COLUMN signature_filename TEXT;
