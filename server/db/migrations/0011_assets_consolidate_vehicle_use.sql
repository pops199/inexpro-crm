-- Consolidate the duplicated "vehicle use" capture on the assets table.
--
-- Two columns historically captured the same concept from two different
-- form sections:
--   • use_type    — "Motor Details" (Private / Business / Dual Purpose /
--                   Hire & Reward / Courtesy)   [the richer, kept field]
--   • vehicle_use — "Vehicle Risk Details" (Private / Business /
--                   Private & Business)         [retired in the form]
--
-- The asset form now captures vehicle use ONCE, as "Use Type" inside the
-- Vehicle Risk Details section. Fold any existing vehicle_use value into
-- use_type where use_type is not already set, mapping the legacy
-- 'Private & Business' option onto the richer 'Dual Purpose'.
--
-- vehicle_use is left in place (no DROP COLUMN) so historical exports and any
-- row not yet re-saved keep their value; the form simply stops writing it.
-- Both columns are added by the inline migrations in database.js before this
-- versioned migration runs, so they are guaranteed to exist here.

UPDATE assets
   SET use_type = CASE TRIM(vehicle_use)
                    WHEN 'Private & Business' THEN 'Dual Purpose'
                    ELSE TRIM(vehicle_use)
                  END
 WHERE (use_type IS NULL OR TRIM(use_type) = '')
   AND vehicle_use IS NOT NULL
   AND TRIM(vehicle_use) <> '';
