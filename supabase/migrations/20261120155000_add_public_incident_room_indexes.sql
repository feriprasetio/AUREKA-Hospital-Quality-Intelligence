-- Cover the room_id foreign keys used by PMKP review and QR reporting.
-- Existing composite indexes begin with link_id, not room_id, so they do not
-- cover lookups and referential checks on room_id.
CREATE INDEX IF NOT EXISTS public_report_links_room_id_idx
  ON aureka_patient_safety.public_report_links (room_id);

CREATE INDEX IF NOT EXISTS public_incident_reports_room_id_idx
  ON aureka_patient_safety.public_incident_reports (room_id);
