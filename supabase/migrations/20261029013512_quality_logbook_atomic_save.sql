CREATE OR REPLACE FUNCTION aureka_quality.save_quality_logbook(p_record_id uuid, p_payload jsonb, p_responses jsonb DEFAULT '[]'::jsonb, p_attributions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_room_id bigint;
  v_year integer;
  v_grain text;
  v_status text;
  v_record_id uuid := p_record_id;
  v_response jsonb;
  v_attribution jsonb;
  v_response_code smallint;
  v_review_status text;
  v_indicator_id uuid;
  v_staff_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menyimpan logbook mutu.' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('ADMIN', 'PMKP', 'PIC') THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan menyimpan logbook indikator mutu.' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload logbook tidak valid.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'room_id', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Unit logbook wajib dipilih dengan benar.' USING ERRCODE = '22023';
  END IF;

  v_room_id := (p_payload->>'room_id')::bigint;
  v_year := (p_payload->>'profile_year')::integer;
  v_grain := p_payload->>'measurement_grain';
  v_status := p_payload->>'status';

  IF NOT aureka_system.has_quality_room_access(v_room_id) THEN
    RAISE EXCEPTION 'Akses ke unit logbook tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF v_grain NOT IN ('patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate') THEN
    RAISE EXCEPTION 'Metode pencatatan logbook tidak dikenali.' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('draft', 'ready', 'reopened') THEN
    RAISE EXCEPTION 'Status logbook tidak diizinkan untuk penyimpanan PIC.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(coalesce(p_responses, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_attributions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Respons indikator atau atribusi tenaga tidak berbentuk daftar yang valid.' USING ERRCODE = '22023';
  END IF;

  IF p_record_id IS NULL THEN
    INSERT INTO aureka_quality.quality_records (
      room_id, profile_year, measurement_grain, record_date, subject_key,
      subject_json, core_data, status, review_required, entered_by
    )
    VALUES (
      v_room_id, v_year, v_grain,
      nullif(p_payload->>'record_date', '')::date,
      nullif(p_payload->>'subject_key', ''),
      coalesce(p_payload->'subject_json', '{}'::jsonb),
      coalesce(p_payload->'core_data', '{}'::jsonb),
      v_status,
      coalesce((p_payload->>'review_required')::boolean, false),
      v_user_id
    )
    RETURNING id INTO v_record_id;
  ELSE
    UPDATE aureka_quality.quality_records
       SET profile_year = v_year,
           measurement_grain = v_grain,
           record_date = nullif(p_payload->>'record_date', '')::date,
           subject_key = nullif(p_payload->>'subject_key', ''),
           subject_json = coalesce(p_payload->'subject_json', '{}'::jsonb),
           core_data = coalesce(p_payload->'core_data', '{}'::jsonb),
           status = v_status,
           review_required = coalesce((p_payload->>'review_required')::boolean, false),
           validation_note = NULL,
           updated_at = now()
     WHERE id = p_record_id
       AND room_id = v_room_id
       AND status IN ('draft', 'ready', 'reopened')
    RETURNING id INTO v_record_id;

    IF v_record_id IS NULL THEN
      RAISE EXCEPTION 'Logbook tidak ditemukan, tidak dapat diakses, atau sudah tervalidasi/diarsipkan. Muat ulang daftar dan periksa statusnya.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate incoming child rows before replacing current child data.
  FOR v_response IN SELECT value FROM jsonb_array_elements(coalesce(p_responses, '[]'::jsonb))
  LOOP
    IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'Respons indikator memiliki identitas master yang tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_indicator_id := (v_response->>'indicator_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = v_room_id
         AND ip.profile_year = v_year
         AND ip.is_active = true
         AND ip.status = 'published'
    ) THEN
      RAISE EXCEPTION 'Respons mengacu pada indikator tidak aktif atau bukan milik unit/tahun ini.' USING ERRCODE = '23503';
    END IF;
    IF nullif(v_response->>'response_code', '') IS NOT NULL THEN
      v_response_code := (v_response->>'response_code')::smallint;
      IF v_response_code NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Kode respons indikator harus 1, 2, 3, atau kosong.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  FOR v_attribution IN SELECT value FROM jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb))
  LOOP
    IF coalesce(v_attribution->>'staff_id', '') !~* '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'Atribusi tenaga memiliki identitas yang tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_staff_id := (v_attribution->>'staff_id')::uuid;
    IF NOT EXISTS (
      SELECT 1
        FROM aureka_quality.staff_directory sd
        JOIN aureka_quality.staff_team_assignments sta
          ON sta.staff_id = sd.id
         AND sta.room_id = v_room_id
         AND sta.assignment_status = 'active'
         AND sta.is_locked = true
       WHERE sd.id = v_staff_id
         AND sd.directory_status = 'available'
    ) THEN
      RAISE EXCEPTION 'Atribusi tenaga harus merujuk pada anggota tim aktif yang terkunci di unit ini.' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  DELETE FROM aureka_quality.quality_record_responses
   WHERE record_id = v_record_id;

  FOR v_response IN SELECT value FROM jsonb_array_elements(coalesce(p_responses, '[]'::jsonb))
  LOOP
    v_review_status := coalesce(nullif(v_response->>'review_status', ''), 'not_required');
    IF v_review_status NOT IN ('not_required', 'pending', 'classified') THEN
      v_review_status := 'not_required';
    END IF;
    INSERT INTO aureka_quality.quality_record_responses (
      record_id, indicator_id, response_label, response_code, raw_value, other_text, review_status
    )
    VALUES (
      v_record_id,
      (v_response->>'indicator_id')::uuid,
      nullif(v_response->>'response_label', ''),
      nullif(v_response->>'response_code', '')::smallint,
      coalesce(v_response->'raw_value', '{}'::jsonb),
      nullif(v_response->>'other_text', ''),
      v_review_status
    );
  END LOOP;

  DELETE FROM aureka_quality.quality_record_staff_attributions
   WHERE record_id = v_record_id;

  FOR v_attribution IN SELECT value FROM jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb))
  LOOP
    INSERT INTO aureka_quality.quality_record_staff_attributions (
      record_id, staff_id, field_key, attribution_type, created_by, updated_by
    )
    VALUES (
      v_record_id,
      (v_attribution->>'staff_id')::uuid,
      nullif(v_attribution->>'field_key', ''),
      CASE WHEN (v_attribution->>'attribution_type') IN ('responsible_provider', 'related_provider')
           THEN v_attribution->>'attribution_type' ELSE 'related_provider' END,
      v_user_id,
      v_user_id
    );
  END LOOP;

  RETURN v_record_id;
END;
$function$
;

REVOKE ALL ON FUNCTION aureka_quality.save_quality_logbook(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.save_quality_logbook(uuid, jsonb, jsonb, jsonb) TO authenticated;
COMMENT ON FUNCTION aureka_quality.save_quality_logbook(uuid, jsonb, jsonb, jsonb) IS 'Atomically saves a quality logbook parent row, indicator responses, and locked staff attributions; respects invoker permissions and unit-scoped RLS.';
