-- Rename the product category picklist option from "Commercial — Motor fleet"
-- to "Commercial — Motor" (the "fleet" qualifier was too narrow — same product
-- category covers single-vehicle commercial motor too). The picklist in
-- server/routes/products.js was updated; this migration brings existing
-- product rows in line so they don't become "orphaned" (still load, but
-- value no longer appears in the edit-form select).
--
-- products.product_category is plain TEXT NOT NULL — no CHECK constraint to
-- update.

UPDATE products
   SET product_category = 'Commercial — Motor'
 WHERE product_category = 'Commercial — Motor fleet';
