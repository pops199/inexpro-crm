-- Incident detail enrichment for the claims module.
--
-- Rationale: brokers need a fuller incident record to support the insurer
-- file, FAIS-aligned advice records, and TCF "fair outcome" evidence. The
-- "Claim Date" field is reused as Date of Incident on the UI, and these
-- additional columns capture the time, GPS-pinned location, and a full
-- police report block (mandatory for theft / hijacking / accident matters
-- under most SA insurer wordings).
--
-- Notes:
--  * incident_time stored as TEXT (HH:MM 24-hour) — SQLite has no native
--    TIME type and TEXT keeps form serialization simple.
--  * GPS lat/lng kept as TEXT to preserve the user's original precision and
--    match the contacts.phys_gps_lat/lng convention.
--  * The police report attachment itself is stored via the existing
--    documents table (module='claims', record_id=<claim>) so it appears in
--    the claim's Documents tab automatically. police_report_received is the
--    broker's tick-box that the original report has been received.

ALTER TABLE claims ADD COLUMN incident_time TEXT;
ALTER TABLE claims ADD COLUMN incident_location_address TEXT;
ALTER TABLE claims ADD COLUMN incident_gps_lat TEXT;
ALTER TABLE claims ADD COLUMN incident_gps_lng TEXT;

ALTER TABLE claims ADD COLUMN police_case_number TEXT;
ALTER TABLE claims ADD COLUMN police_station_reported TEXT;
ALTER TABLE claims ADD COLUMN police_report_date_reported DATE;
ALTER TABLE claims ADD COLUMN police_officer_name TEXT;
ALTER TABLE claims ADD COLUMN police_report_received INTEGER NOT NULL DEFAULT 0;
