-- Immutable structured certificate snapshots. Original PDF bytes are never persisted.
BEGIN;
ALTER TABLE aureka_system.education_certificates
  ADD COLUMN IF NOT EXISTS render_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS render_snapshot_sha256 text;

ALTER TABLE aureka_system.education_certificates
  DROP CONSTRAINT IF EXISTS education_certificates_render_snapshot_hash_check;
ALTER TABLE aureka_system.education_certificates
  ADD CONSTRAINT education_certificates_render_snapshot_hash_check
  CHECK (render_snapshot IS NULL OR (jsonb_typeof(render_snapshot)='object'
    AND render_snapshot_sha256 ~ '^[a-f0-9]{64}$'));

CREATE OR REPLACE FUNCTION aureka_system.freeze_browser_certificate_snapshot(
  p_certificate_id uuid, p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_certificate aureka_system.education_certificates%ROWTYPE;
  v_room bigint;
  v_hash text;
BEGIN
  IF v_actor IS NULL OR NOT aureka_system.can_manage_education() THEN
    RAISE EXCEPTION 'Akses penerbitan sertifikat ditolak.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_certificate
  FROM aureka_system.education_certificates c
  WHERE c.id=p_certificate_id AND c.issued_by=v_actor AND c.revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sertifikat tidak ada atau penerbit tidak berwenang.' USING ERRCODE='42501';
  END IF;
  SELECT room_id INTO v_room FROM aureka_system.education_events WHERE id=v_certificate.event_id;
  IF NOT aureka_system.can_access_room_or_global(v_room) THEN
    RAISE EXCEPTION 'Kegiatan di luar ruang lingkup akses.' USING ERRCODE='42501';
  END IF;
  IF v_certificate.render_snapshot IS NOT NULL THEN
    RETURN jsonb_build_object('snapshot',v_certificate.render_snapshot,
      'sha256',v_certificate.render_snapshot_sha256,'already_frozen',true);
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
    OR octet_length(p_snapshot::text)>65536
    OR COALESCE(p_snapshot->>'kind','') NOT IN ('in_house_training','student_orientation')
    OR COALESCE(p_snapshot->>'event_id','') <> v_certificate.event_id::text
    OR COALESCE(p_snapshot->>'participant_id','') <> v_certificate.participant_id::text
    OR jsonb_typeof(p_snapshot->'layout')<>'object'
    OR jsonb_typeof(p_snapshot->'data')<>'object' THEN
    RAISE EXCEPTION 'Manifest sertifikat lokal tidak valid.' USING ERRCODE='22023';
  END IF;

  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot::text,'UTF8')),'hex');
  UPDATE aureka_system.education_certificates
  SET render_snapshot=p_snapshot,render_snapshot_sha256=v_hash,
      object_path=NULL,file_sha256=NULL
  WHERE id=v_certificate.id;

  RETURN jsonb_build_object('snapshot',p_snapshot,'sha256',v_hash,'already_frozen',false);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_system.freeze_browser_certificate_snapshot(uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_system.freeze_browser_certificate_snapshot(uuid,jsonb)
  TO authenticated;

COMMENT ON COLUMN aureka_system.education_certificates.render_snapshot IS
  'Immutable browser rendering manifest; re-create PDF locally without storing binary files.';
COMMIT;
