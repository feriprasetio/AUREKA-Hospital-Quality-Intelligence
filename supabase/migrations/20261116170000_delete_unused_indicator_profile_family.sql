-- Permanently remove an unused indicator identity and its profile versions.
-- Deletion is limited to Superadmin and blocked when any normalized response or
-- code-based logbook value is linked to the indicator family.

CREATE OR REPLACE FUNCTION aureka_quality.delete_indicator_profile_family(
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_year integer;
  v_room_id bigint;
  v_code text;
  v_response_count bigint := 0;
  v_record_count bigint := 0;
  v_proposal_count bigint := 0;
  v_oppe_count bigint := 0;
  v_deleted_profiles integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menghapus indikator.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat menghapus permanen profil indikator.'
      USING ERRCODE = '42501';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Identitas profil indikator wajib diisi.'
      USING ERRCODE = '22023';
  END IF;

  SELECT ip.profile_year, ip.room_id, ip.code
    INTO v_profile_year, v_room_id, v_code
    FROM aureka_quality.indicator_profiles ip
   WHERE ip.id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil indikator tidak ditemukan. Muat ulang daftar indikator.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_code IS NULL OR btrim(v_code) = '' OR v_room_id IS NULL OR v_profile_year IS NULL THEN
    RAISE EXCEPTION 'Identitas tahun, unit, atau kode indikator tidak lengkap; penghapusan dibatalkan.'
      USING ERRCODE = '22023';
  END IF;

  -- Lock every version for this indicator identity before checking references.
  PERFORM 1
    FROM aureka_quality.indicator_profiles ip
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code
   FOR UPDATE;

  -- Lock any normalized audit responses that point to any version in this family.
  PERFORM 1
    FROM aureka_quality.quality_record_responses rr
    JOIN aureka_quality.indicator_profiles ip ON ip.id = rr.indicator_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code
   FOR UPDATE OF rr;

  -- Lock code-based logbook records, including archived records, before reference checks.
  PERFORM 1
    FROM aureka_quality.quality_records qr
   WHERE qr.profile_year = v_profile_year
     AND qr.room_id = v_room_id
     AND (
       (
         jsonb_typeof(qr.core_data->'indicator_values') = 'object'
         AND (qr.core_data->'indicator_values') ? v_code
       )
       OR
       (
         jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
         AND (qr.subject_json->'indicator_values') ? v_code
       )
     )
   FOR UPDATE OF qr;

  SELECT count(*)
    INTO v_response_count
    FROM aureka_quality.quality_record_responses rr
    JOIN aureka_quality.indicator_profiles ip ON ip.id = rr.indicator_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code;

  SELECT count(*)
    INTO v_record_count
    FROM aureka_quality.quality_records qr
   WHERE qr.profile_year = v_profile_year
     AND qr.room_id = v_room_id
     AND (
       (
         jsonb_typeof(qr.core_data->'indicator_values') = 'object'
         AND (qr.core_data->'indicator_values') ? v_code
       )
       OR
       (
         jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
         AND (qr.subject_json->'indicator_values') ? v_code
       )
     );

  -- Indicator proposals and OPPE rules also reference profile ids directly.
  PERFORM 1
    FROM aureka_governance.indicator_proposals proposal
    JOIN aureka_quality.indicator_profiles ip
      ON ip.id = proposal.activated_profile_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code
   FOR UPDATE OF proposal;

  SELECT count(*)
    INTO v_proposal_count
    FROM aureka_governance.indicator_proposals proposal
    JOIN aureka_quality.indicator_profiles ip
      ON ip.id = proposal.activated_profile_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code;

  PERFORM 1
    FROM aureka_quality.oppe_indicator_rules rule
    JOIN aureka_quality.indicator_profiles ip
      ON ip.id = rule.profile_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code
   FOR UPDATE OF rule;

  SELECT count(*)
    INTO v_oppe_count
    FROM aureka_quality.oppe_indicator_rules rule
    JOIN aureka_quality.indicator_profiles ip
      ON ip.id = rule.profile_id
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code;

  IF v_response_count > 0 OR v_record_count > 0 OR v_proposal_count > 0 OR v_oppe_count > 0 THEN
    RAISE EXCEPTION
      'Indikator % pada unit % tahun % tidak dapat dihapus: % respons audit, % catatan logbook, % usulan indikator, dan % aturan OPPE masih terhubung. Pensiunkan indikator untuk mempertahankan histori dan referensi tata kelola.',
      v_code, v_room_id, v_profile_year, v_response_count, v_record_count, v_proposal_count, v_oppe_count
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM aureka_quality.indicator_profiles ip
   WHERE ip.profile_year = v_profile_year
     AND ip.room_id = v_room_id
     AND ip.code = v_code;

  GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;

  IF v_deleted_profiles < 1 THEN
    RAISE EXCEPTION 'Tidak ada versi profil yang dihapus. Transaksi dibatalkan.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'profile_year', v_profile_year,
    'room_id', v_room_id,
    'code', v_code,
    'deleted_profiles', v_deleted_profiles,
    'linked_responses', v_response_count,
    'linked_logbook_records', v_record_count,
    'linked_indicator_proposals', v_proposal_count,
    'linked_oppe_rules', v_oppe_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.delete_indicator_profile_family(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.delete_indicator_profile_family(uuid) TO authenticated;

COMMENT ON FUNCTION aureka_quality.delete_indicator_profile_family(uuid) IS
'Superadmin-only permanent deletion of all versions of one indicator identity. Rejects deletion when normalized quality_record_responses or code-based quality_records (including archived records) contain evidence linked to the indicator.';
