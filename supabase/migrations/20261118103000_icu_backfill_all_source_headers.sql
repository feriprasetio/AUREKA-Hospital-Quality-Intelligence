-- Persist exact Excel source headers for all ICU indicators during BHP/Linen backfill.
CREATE OR REPLACE FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_payload jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_source_values jsonb;
  v_source_columns jsonb;
  v_source_column_refs jsonb;
  v_bhp jsonb;
  v_values jsonb;
  v_response jsonb;
  v_profile_id uuid;
  v_record_id uuid;
  v_source_row integer;
  v_subject_key text;
  v_existing_core jsonb;
  v_existing_subject jsonb;
  v_existing_bhp text;
  v_backfilled integer := 0;
  v_preserved integer := 0;
  v_not_found integer := 0;
  v_response_inserted integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk memperbarui sumber BHP/Linen ICU.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Pembaruan sumber BHP/Linen hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(14) THEN
    RAISE EXCEPTION 'Akses ke Intensive Care Unit & High Care Unit tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'Batch backfill BHP/Linen harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  SELECT ip.id INTO v_profile_id
  FROM aureka_quality.indicator_profiles ip
  WHERE ip.room_id = 14 AND ip.profile_year = 2026
    AND ip.code = '14.1' AND ip.is_active = true AND ip.status = 'published'
  ORDER BY ip.version DESC
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil indikator ICU 14.1 belum aktif dan terbit.' USING ERRCODE = '23503';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_source_columns := v_source->'source_indicator_columns';
    v_source_column_refs := v_source->'source_indicator_column_refs';
    v_bhp := v_source->'source_bhp_linen';
    v_values := v_core->'indicator_values';

    IF coalesce(v_payload->>'room_id','') <> '14'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR coalesce(v_source->>'idempotency_basis','') <> 'room_year_source_excel_row'
       OR coalesce(v_source->>'source_storage_bucket','') <> 'aureka-quality-source-workbooks'
       OR coalesce(v_source->>'source_storage_path','') !~ '^14/2026/[0-9]+_[A-Za-z0-9._-]+
       OR coalesce(v_bhp->>'indicator_code','') <> '14.1'
       OR nullif(btrim(v_bhp->>'source_header'),'') IS NULL
       OR nullif(btrim(v_bhp->>'source_value'),'') IS NULL
       OR coalesce(v_source_values->>'14.1','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_source_columns->>'14.1','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_source_column_refs->'14.1'->>'header_text','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_form->>'Kekosongan BHP/Linen','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_values->'14.1'->>'source_value','') <> coalesce(v_bhp->>'source_value','') THEN
      RAISE EXCEPTION 'Sumber BHP/Linen tidak konsisten dengan profil 14.1 atau metadata baris Excel.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003 THEN
      RAISE EXCEPTION 'Nomor baris sumber Excel ICU tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_subject_key := 'excel-pmkp-icu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci idempotensi tidak sesuai dengan nomor baris Excel.' USING ERRCODE = '22023';
    END IF;

    SELECT item.value INTO v_response
    FROM jsonb_array_elements(coalesce(v_row->'responses','[]'::jsonb)) item(value)
    WHERE item.value->>'indicator_id' = v_profile_id::text;

    IF v_response IS NULL
       OR coalesce(v_response->>'response_label','') <> coalesce(v_values->'14.1'->>'answer','')
       OR v_response->'raw_value' IS DISTINCT FROM v_values->'14.1'
       OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped','master_pending','source_master_conflict','not_in_master','ambiguous_master') THEN
      RAISE EXCEPTION 'Respons 14.1 tidak cocok dengan nilai sumber BHP/Linen.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.id, qr.core_data, qr.subject_json
      INTO v_record_id, v_existing_core, v_existing_subject
    FROM aureka_quality.quality_records qr
    WHERE qr.room_id = 14
      AND qr.profile_year = 2026
      AND qr.measurement_grain = 'patient_episode'
      AND qr.subject_key = v_subject_key
      AND qr.status <> 'archived'
    FOR UPDATE;

    IF v_record_id IS NULL THEN
      v_not_found := v_not_found + 1;
      CONTINUE;
    END IF;

    v_existing_bhp := coalesce(
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen'), ''),
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen (sumber belum dipetakan)'), ''),
      ''
    );

    IF nullif(btrim(v_existing_bhp),'') IS NOT NULL
       OR coalesce(v_existing_core->'indicator_values','{}'::jsonb) ? '14.1'
       OR EXISTS (
         SELECT 1 FROM aureka_quality.quality_record_responses rr
         WHERE rr.record_id = v_record_id AND rr.indicator_id = v_profile_id
       )
       OR (SELECT qr.status FROM aureka_quality.quality_records qr WHERE qr.id = v_record_id) <> 'ready' THEN
      v_preserved := v_preserved + 1;
      CONTINUE;
    END IF;

    UPDATE aureka_quality.quality_records qr
    SET core_data =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(qr.core_data,'{}'::jsonb),
            '{form_fields}',
            coalesce(qr.core_data->'form_fields','{}'::jsonb) ||
              jsonb_build_object(
                'Kekosongan BHP/Linen', v_bhp->>'source_value',
                'Kekosongan BHP/Linen (sumber belum dipetakan)', v_bhp->>'source_value'
              ),
            true
          ),
          '{indicator_values}',
          coalesce(qr.core_data->'indicator_values','{}'::jsonb) ||
            jsonb_build_object('14.1', v_values->'14.1'),
          true
        ),
        '{source_import}',
        coalesce(qr.core_data->'source_import','{}'::jsonb) ||
          jsonb_build_object(
            'source_indicator_values',
              coalesce(qr.core_data->'source_import'->'source_indicator_values','{}'::jsonb) ||
                jsonb_build_object('14.1', v_bhp->>'source_value'),
            'source_indicator_columns',
              coalesce(qr.core_data->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                coalesce(v_source_columns,'{}'::jsonb),
            'source_bhp_linen', v_bhp,
            'source_storage_bucket', v_source->>'source_storage_bucket',
            'source_storage_path', v_source->>'source_storage_path',
            'source_workbook', v_source->>'source_workbook',
            'source_indicator_column_refs',
              coalesce(qr.core_data->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                coalesce(v_source_column_refs,'{}'::jsonb),
            'source_bhp_linen_backfill_at', now()
          ),
        true
      ),
      subject_json =
        jsonb_set(
          coalesce(qr.subject_json,'{}'::jsonb),
          '{source_import}',
          coalesce(qr.subject_json->'source_import','{}'::jsonb) ||
            jsonb_build_object(
              'source_indicator_values',
                coalesce(qr.subject_json->'source_import'->'source_indicator_values','{}'::jsonb) ||
                  jsonb_build_object('14.1', v_bhp->>'source_value'),
              'source_indicator_columns',
                coalesce(qr.subject_json->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                  coalesce(v_source_columns,'{}'::jsonb),
              'source_bhp_linen', v_bhp,
              'source_storage_bucket', v_source->>'source_storage_bucket',
              'source_storage_path', v_source->>'source_storage_path',
              'source_workbook', v_source->>'source_workbook',
              'source_indicator_column_refs',
                coalesce(qr.subject_json->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                  coalesce(v_source_column_refs,'{}'::jsonb)
            ),
          true
        ),
      updated_at = now()
    WHERE qr.id = v_record_id;

    INSERT INTO aureka_quality.quality_record_responses (
      record_id, indicator_id, response_label, response_code,
      raw_value, other_text, review_status
    )
    VALUES (
      v_record_id,
      v_profile_id,
      nullif(v_response->>'response_label',''),
      nullif(v_response->>'response_code','')::smallint,
      v_response->'raw_value',
      CASE WHEN coalesce((v_response->'raw_value'->>'review_required')::boolean,false)
        THEN v_bhp->>'source_value' ELSE NULL END,
      coalesce(v_response->>'review_status','pending')
    )
    ON CONFLICT (record_id, indicator_id) DO NOTHING;

    GET DIAGNOSTICS v_response_inserted = ROW_COUNT;
    IF v_response_inserted <> 1 THEN
      RAISE EXCEPTION 'Respons indikator ICU 14.1 sudah ada saat backfill; transaksi dibatalkan agar data tidak tertimpa.' USING ERRCODE = '23505';
    END IF;

    v_backfilled := v_backfilled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'backfilled_count', v_backfilled,
    'preserved_count', v_preserved,
    'not_found_count', v_not_found
  );
END;
$function$;

COMMENT ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) IS
'Backfills only missing ICU/HCU 2026 indicator 14.1 BHP/Linen source values on existing ready episodes matched by physical Excel row. It also records source header names and exact Excel column coordinates for indicators 14.1–14.9 without overwriting their existing response values.';

       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+
       OR coalesce(v_bhp->>'indicator_code','') <> '14.1'
       OR nullif(btrim(v_bhp->>'source_header'),'') IS NULL
       OR nullif(btrim(v_bhp->>'source_value'),'') IS NULL
       OR coalesce(v_source_values->>'14.1','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_source_columns->>'14.1','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_source_column_refs->'14.1'->>'header_text','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_form->>'Kekosongan BHP/Linen','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_values->'14.1'->>'source_value','') <> coalesce(v_bhp->>'source_value','') THEN
      RAISE EXCEPTION 'Sumber BHP/Linen tidak konsisten dengan profil 14.1 atau metadata baris Excel.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003 THEN
      RAISE EXCEPTION 'Nomor baris sumber Excel ICU tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_subject_key := 'excel-pmkp-icu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci idempotensi tidak sesuai dengan nomor baris Excel.' USING ERRCODE = '22023';
    END IF;

    SELECT item.value INTO v_response
    FROM jsonb_array_elements(coalesce(v_row->'responses','[]'::jsonb)) item(value)
    WHERE item.value->>'indicator_id' = v_profile_id::text;

    IF v_response IS NULL
       OR coalesce(v_response->>'response_label','') <> coalesce(v_values->'14.1'->>'answer','')
       OR v_response->'raw_value' IS DISTINCT FROM v_values->'14.1'
       OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped','master_pending','source_master_conflict','not_in_master','ambiguous_master') THEN
      RAISE EXCEPTION 'Respons 14.1 tidak cocok dengan nilai sumber BHP/Linen.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.id, qr.core_data, qr.subject_json
      INTO v_record_id, v_existing_core, v_existing_subject
    FROM aureka_quality.quality_records qr
    WHERE qr.room_id = 14
      AND qr.profile_year = 2026
      AND qr.measurement_grain = 'patient_episode'
      AND qr.subject_key = v_subject_key
      AND qr.status <> 'archived'
    FOR UPDATE;

    IF v_record_id IS NULL THEN
      v_not_found := v_not_found + 1;
      CONTINUE;
    END IF;

    v_existing_bhp := coalesce(
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen'), ''),
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen (sumber belum dipetakan)'), ''),
      ''
    );

    IF nullif(btrim(v_existing_bhp),'') IS NOT NULL
       OR coalesce(v_existing_core->'indicator_values','{}'::jsonb) ? '14.1'
       OR EXISTS (
         SELECT 1 FROM aureka_quality.quality_record_responses rr
         WHERE rr.record_id = v_record_id AND rr.indicator_id = v_profile_id
       )
       OR (SELECT qr.status FROM aureka_quality.quality_records qr WHERE qr.id = v_record_id) <> 'ready' THEN
      v_preserved := v_preserved + 1;
      CONTINUE;
    END IF;

    UPDATE aureka_quality.quality_records qr
    SET core_data =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(qr.core_data,'{}'::jsonb),
            '{form_fields}',
            coalesce(qr.core_data->'form_fields','{}'::jsonb) ||
              jsonb_build_object(
                'Kekosongan BHP/Linen', v_bhp->>'source_value',
                'Kekosongan BHP/Linen (sumber belum dipetakan)', v_bhp->>'source_value'
              ),
            true
          ),
          '{indicator_values}',
          coalesce(qr.core_data->'indicator_values','{}'::jsonb) ||
            jsonb_build_object('14.1', v_values->'14.1'),
          true
        ),
        '{source_import}',
        coalesce(qr.core_data->'source_import','{}'::jsonb) ||
          jsonb_build_object(
            'source_indicator_values',
              coalesce(qr.core_data->'source_import'->'source_indicator_values','{}'::jsonb) ||
                jsonb_build_object('14.1', v_bhp->>'source_value'),
            'source_indicator_columns',
              coalesce(qr.core_data->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                coalesce(v_source_columns,'{}'::jsonb),
            'source_bhp_linen', v_bhp,
            'source_storage_bucket', v_source->>'source_storage_bucket',
            'source_storage_path', v_source->>'source_storage_path',
            'source_workbook', v_source->>'source_workbook',
            'source_indicator_column_refs',
              coalesce(qr.core_data->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                coalesce(v_source_column_refs,'{}'::jsonb),
            'source_bhp_linen_backfill_at', now()
          ),
        true
      ),
      subject_json =
        jsonb_set(
          coalesce(qr.subject_json,'{}'::jsonb),
          '{source_import}',
          coalesce(qr.subject_json->'source_import','{}'::jsonb) ||
            jsonb_build_object(
              'source_indicator_values',
                coalesce(qr.subject_json->'source_import'->'source_indicator_values','{}'::jsonb) ||
                  jsonb_build_object('14.1', v_bhp->>'source_value'),
              'source_indicator_columns',
                coalesce(qr.subject_json->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                  coalesce(v_source_columns,'{}'::jsonb),
              'source_bhp_linen', v_bhp,
              'source_storage_bucket', v_source->>'source_storage_bucket',
              'source_storage_path', v_source->>'source_storage_path',
              'source_workbook', v_source->>'source_workbook',
              'source_indicator_column_refs',
                coalesce(qr.subject_json->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                  coalesce(v_source_column_refs,'{}'::jsonb)
            ),
          true
        ),
      updated_at = now()
    WHERE qr.id = v_record_id;

    INSERT INTO aureka_quality.quality_record_responses (
      record_id, indicator_id, response_label, response_code,
      raw_value, other_text, review_status
    )
    VALUES (
      v_record_id,
      v_profile_id,
      nullif(v_response->>'response_label',''),
      nullif(v_response->>'response_code','')::smallint,
      v_response->'raw_value',
      CASE WHEN coalesce((v_response->'raw_value'->>'review_required')::boolean,false)
        THEN v_bhp->>'source_value' ELSE NULL END,
      coalesce(v_response->>'review_status','pending')
    )
    ON CONFLICT (record_id, indicator_id) DO NOTHING;

    GET DIAGNOSTICS v_response_inserted = ROW_COUNT;
    IF v_response_inserted <> 1 THEN
      RAISE EXCEPTION 'Respons indikator ICU 14.1 sudah ada saat backfill; transaksi dibatalkan agar data tidak tertimpa.' USING ERRCODE = '23505';
    END IF;

    v_backfilled := v_backfilled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'backfilled_count', v_backfilled,
    'preserved_count', v_preserved,
    'not_found_count', v_not_found
  );
END;
$function$;

COMMENT ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) IS
'Backfills only missing ICU/HCU 2026 indicator 14.1 BHP/Linen source values on existing ready episodes matched by physical Excel row. It also records source header names and exact Excel column coordinates for indicators 14.1–14.9 without overwriting their existing response values.';

       OR coalesce(v_bhp->>'indicator_code','') <> '14.1'
       OR nullif(btrim(v_bhp->>'source_header'),'') IS NULL
       OR nullif(btrim(v_bhp->>'source_value'),'') IS NULL
       OR coalesce(v_source_values->>'14.1','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_source_columns->>'14.1','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_source_column_refs->'14.1'->>'header_text','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_form->>'Kekosongan BHP/Linen','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_values->'14.1'->>'source_value','') <> coalesce(v_bhp->>'source_value','') THEN
      RAISE EXCEPTION 'Sumber BHP/Linen tidak konsisten dengan profil 14.1 atau metadata baris Excel.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003 THEN
      RAISE EXCEPTION 'Nomor baris sumber Excel ICU tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_subject_key := 'excel-pmkp-icu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci idempotensi tidak sesuai dengan nomor baris Excel.' USING ERRCODE = '22023';
    END IF;

    SELECT item.value INTO v_response
    FROM jsonb_array_elements(coalesce(v_row->'responses','[]'::jsonb)) item(value)
    WHERE item.value->>'indicator_id' = v_profile_id::text;

    IF v_response IS NULL
       OR coalesce(v_response->>'response_label','') <> coalesce(v_values->'14.1'->>'answer','')
       OR v_response->'raw_value' IS DISTINCT FROM v_values->'14.1'
       OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped','master_pending','source_master_conflict','not_in_master','ambiguous_master') THEN
      RAISE EXCEPTION 'Respons 14.1 tidak cocok dengan nilai sumber BHP/Linen.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.id, qr.core_data, qr.subject_json
      INTO v_record_id, v_existing_core, v_existing_subject
    FROM aureka_quality.quality_records qr
    WHERE qr.room_id = 14
      AND qr.profile_year = 2026
      AND qr.measurement_grain = 'patient_episode'
      AND qr.subject_key = v_subject_key
      AND qr.status <> 'archived'
    FOR UPDATE;

    IF v_record_id IS NULL THEN
      v_not_found := v_not_found + 1;
      CONTINUE;
    END IF;

    v_existing_bhp := coalesce(
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen'), ''),
      nullif(btrim(v_existing_core->'form_fields'->>'Kekosongan BHP/Linen (sumber belum dipetakan)'), ''),
      ''
    );

    IF nullif(btrim(v_existing_bhp),'') IS NOT NULL
       OR coalesce(v_existing_core->'indicator_values','{}'::jsonb) ? '14.1'
       OR EXISTS (
         SELECT 1 FROM aureka_quality.quality_record_responses rr
         WHERE rr.record_id = v_record_id AND rr.indicator_id = v_profile_id
       )
       OR (SELECT qr.status FROM aureka_quality.quality_records qr WHERE qr.id = v_record_id) <> 'ready' THEN
      v_preserved := v_preserved + 1;
      CONTINUE;
    END IF;

    UPDATE aureka_quality.quality_records qr
    SET core_data =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(qr.core_data,'{}'::jsonb),
            '{form_fields}',
            coalesce(qr.core_data->'form_fields','{}'::jsonb) ||
              jsonb_build_object(
                'Kekosongan BHP/Linen', v_bhp->>'source_value',
                'Kekosongan BHP/Linen (sumber belum dipetakan)', v_bhp->>'source_value'
              ),
            true
          ),
          '{indicator_values}',
          coalesce(qr.core_data->'indicator_values','{}'::jsonb) ||
            jsonb_build_object('14.1', v_values->'14.1'),
          true
        ),
        '{source_import}',
        coalesce(qr.core_data->'source_import','{}'::jsonb) ||
          jsonb_build_object(
            'source_indicator_values',
              coalesce(qr.core_data->'source_import'->'source_indicator_values','{}'::jsonb) ||
                jsonb_build_object('14.1', v_bhp->>'source_value'),
            'source_indicator_columns',
              coalesce(qr.core_data->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                coalesce(v_source_columns,'{}'::jsonb),
            'source_bhp_linen', v_bhp,
            'source_storage_bucket', v_source->>'source_storage_bucket',
            'source_storage_path', v_source->>'source_storage_path',
            'source_workbook', v_source->>'source_workbook',
            'source_indicator_column_refs',
              coalesce(qr.core_data->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                coalesce(v_source_column_refs,'{}'::jsonb),
            'source_bhp_linen_backfill_at', now()
          ),
        true
      ),
      subject_json =
        jsonb_set(
          coalesce(qr.subject_json,'{}'::jsonb),
          '{source_import}',
          coalesce(qr.subject_json->'source_import','{}'::jsonb) ||
            jsonb_build_object(
              'source_indicator_values',
                coalesce(qr.subject_json->'source_import'->'source_indicator_values','{}'::jsonb) ||
                  jsonb_build_object('14.1', v_bhp->>'source_value'),
              'source_indicator_columns',
                coalesce(qr.subject_json->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                  coalesce(v_source_columns,'{}'::jsonb),
              'source_bhp_linen', v_bhp,
              'source_storage_bucket', v_source->>'source_storage_bucket',
              'source_storage_path', v_source->>'source_storage_path',
              'source_workbook', v_source->>'source_workbook',
              'source_indicator_column_refs',
                coalesce(qr.subject_json->'source_import'->'source_indicator_column_refs','{}'::jsonb) ||
                  coalesce(v_source_column_refs,'{}'::jsonb)
            ),
          true
        ),
      updated_at = now()
    WHERE qr.id = v_record_id;

    INSERT INTO aureka_quality.quality_record_responses (
      record_id, indicator_id, response_label, response_code,
      raw_value, other_text, review_status
    )
    VALUES (
      v_record_id,
      v_profile_id,
      nullif(v_response->>'response_label',''),
      nullif(v_response->>'response_code','')::smallint,
      v_response->'raw_value',
      CASE WHEN coalesce((v_response->'raw_value'->>'review_required')::boolean,false)
        THEN v_bhp->>'source_value' ELSE NULL END,
      coalesce(v_response->>'review_status','pending')
    )
    ON CONFLICT (record_id, indicator_id) DO NOTHING;

    GET DIAGNOSTICS v_response_inserted = ROW_COUNT;
    IF v_response_inserted <> 1 THEN
      RAISE EXCEPTION 'Respons indikator ICU 14.1 sudah ada saat backfill; transaksi dibatalkan agar data tidak tertimpa.' USING ERRCODE = '23505';
    END IF;

    v_backfilled := v_backfilled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'backfilled_count', v_backfilled,
    'preserved_count', v_preserved,
    'not_found_count', v_not_found
  );
END;
$function$;

COMMENT ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) IS
'Backfills only missing ICU/HCU 2026 indicator 14.1 BHP/Linen source values on existing ready episodes matched by physical Excel row. It also records source header names and exact Excel column coordinates for indicators 14.1–14.9 without overwriting their existing response values.';
