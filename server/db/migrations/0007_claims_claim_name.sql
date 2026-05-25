-- Optional free-text label for a claim, captured at creation time so
-- the broker can give the claim a short human-readable name in addition
-- to the system-generated claim_number. Surfaces in the list view as a
-- toggleable column and in the claim detail page next to the number.

ALTER TABLE claims ADD COLUMN claim_name TEXT;
