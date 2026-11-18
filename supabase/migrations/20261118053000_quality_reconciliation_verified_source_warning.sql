BEGIN;

ALTER TABLE aureka_quality.quality_reconciliation_audit
  DROP CONSTRAINT quality_reconciliation_audit_action_type_check;
ALTER TABLE aureka_quality.quality_reconciliation_audit
  ADD CONSTRAINT quality_reconciliation_audit_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'response_auto_mapped',
    'response_manually_mapped',
    'warning_accepted_derived_value',
    'warning_marked_source_correction',
    'warning_accepted_existing_data'
  ]::text[]));

ALTER TABLE aureka_quality.quality_reconciliation_warning_reviews
  DROP CONSTRAINT quality_reconciliation_warning_reviews_action_type_check;
ALTER TABLE aureka_quality.quality_reconciliation_warning_reviews
  ADD CONSTRAINT quality_reconciliation_warning_reviews_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'accept_derived_value',
    'needs_source_correction',
    'accept_verified_existing_data'
  ]::text[]));

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_list_v2(
  p_profile_year integer DEFAULT 2026,
  p_room_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '45s'
AS $function$
DECLARE
  v_base jsonb;
  v_group jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_room bigint;
  v_warning text;
  v_total integer;
  v_verified integer;
BEGIN
  v_base := aureka_quality.quality_reconciliation_list(p_profile_year, p_room_id);

  FOR v_group IN
    SELECT item
    FROM pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(v_base->'warning_groups')='array'
        THEN v_base->'warning_groups' ELSE '[]'::jsonb END
    ) AS x(item)
  LOOP
    v_room := (v_group->>'room_id')::bigint;
    v_warning := v_group->>'warning_text';

    IF v_room = 14
       AND v_warning = 'Kolom gabungan BHP/Linen kosong; tidak ada asumsi pemetaan ke indikator 14.1 atau 14.10.' THEN
      SELECT
        pg_catalog.count(*)::integer,
        pg_catalog.count(*) FILTER (
          WHERE
            nullif(pg_catalog.btrim(qr.core_data->'indicator_values'->'14.1'->>'source_value'), '') IS NOT NULL
            AND nullif(pg_catalog.btrim(qr.core_data->'form_fields'->>'Kekosongan BHP/Linen'), '') IS NOT NULL
            AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->'source_bhp_linen'->>'source_value'), '') IS NOT NULL
            AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->>'source_excel_row'), '') ~ '^[0-9]+$'
            AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->'source_indicator_columns'->>'14.1'), '') IS NOT NULL
        )::integer
      INTO v_total, v_verified
      FROM aureka_quality.quality_records qr
      WHERE qr.room_id = v_room
        AND qr.profile_year = p_profile_year
        AND qr.status <> 'archived'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements_text(
            CASE
              WHEN pg_catalog.jsonb_typeof(qr.core_data->'source_import'->'source_warnings')='array'
              THEN qr.core_data->'source_import'->'source_warnings'
              ELSE '[]'::jsonb
            END
          ) AS warning_item(warning_text)
          WHERE pg_catalog.btrim(warning_item.warning_text) = v_warning
        );

      v_group := v_group || pg_catalog.jsonb_build_object(
        'safe_existing_data', v_total > 0 AND v_verified = v_total,
        'verified_count', v_verified,
        'verification_total', v_total
      );
    ELSE
      v_group := v_group || pg_catalog.jsonb_build_object('safe_existing_data', false);
    END IF;

    v_groups := v_groups || pg_catalog.jsonb_build_array(v_group);
  END LOOP;

  RETURN pg_catalog.jsonb_set(v_base, '{warning_groups}', v_groups, true);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_accept_verified_warning(
  p_room_id bigint,
  p_profile_year integer,
  p_warning_hash text,
  p_warning_text text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '90s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_reason text := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_item record;
  v_total integer;
  v_verified integer;
  v_count integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk konfirmasi pemulihan sumber.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role, '') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Konfirmasi warning massal hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses ke unit yang dipilih tidak diberikan.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id <> 14
     OR p_profile_year <> 2026
     OR p_warning_text <> 'Kolom gabungan BHP/Linen kosong; tidak ada asumsi pemetaan ke indikator 14.1 atau 14.10.'
     OR p_warning_hash IS NULL
     OR p_warning_hash <> pg_catalog.md5(pg_catalog.btrim(p_warning_text)) THEN
    RAISE EXCEPTION 'Warning tidak termasuk kelompok sumber ICU/HCU yang sudah diverifikasi.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Catatan konfirmasi minimal 10 karakter.' USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE
        nullif(pg_catalog.btrim(qr.core_data->'indicator_values'->'14.1'->>'source_value'), '') IS NOT NULL
        AND nullif(pg_catalog.btrim(qr.core_data->'form_fields'->>'Kekosongan BHP/Linen'), '') IS NOT NULL
        AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->'source_bhp_linen'->>'source_value'), '') IS NOT NULL
        AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->>'source_excel_row'), '') ~ '^[0-9]+$'
        AND nullif(pg_catalog.btrim(qr.core_data->'source_import'->'source_indicator_columns'->>'14.1'), '') IS NOT NULL
    )::integer
  INTO v_total, v_verified
  FROM aureka_quality.quality_records qr
  WHERE qr.room_id = p_room_id
    AND qr.profile_year = p_profile_year
    AND qr.status <> 'archived'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(
        CASE
          WHEN pg_catalog.jsonb_typeof(qr.core_data->'source_import'->'source_warnings')='array'
          THEN qr.core_data->'source_import'->'source_warnings'
          ELSE '[]'::jsonb
        END
      ) AS warning_item(warning_text)
      WHERE pg_catalog.btrim(warning_item.warning_text) = p_warning_text
    );

  IF v_total = 0 OR v_verified <> v_total THEN
    RAISE EXCEPTION 'Konfirmasi ditolak: tidak semua episode pada kelompok warning memiliki nilai 14.1, form field, header, dan baris sumber yang lengkap.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT qr.id AS record_id
    FROM aureka_quality.quality_records qr
    WHERE qr.room_id = p_room_id
      AND qr.profile_year = p_profile_year
      AND qr.status <> 'archived'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements_text(
          CASE
            WHEN pg_catalog.jsonb_typeof(qr.core_data->'source_import'->'source_warnings')='array'
            THEN qr.core_data->'source_import'->'source_warnings'
            ELSE '[]'::jsonb
          END
        ) AS warning_item(warning_text)
        WHERE pg_catalog.btrim(warning_item.warning_text) = p_warning_text
      )
    ORDER BY qr.id
    FOR UPDATE OF qr
  LOOP
    INSERT INTO aureka_quality.quality_reconciliation_warning_reviews (
      room_id, profile_year, record_id, warning_hash, warning_text,
      review_state, action_type, decision_note, reviewed_by, reviewed_at
    ) VALUES (
      p_room_id, p_profile_year, v_item.record_id, p_warning_hash, p_warning_text,
      'resolved', 'accept_verified_existing_data', v_reason, v_user_id, v_now
    )
    ON CONFLICT (record_id, warning_hash) DO UPDATE
    SET review_state = 'resolved',
        action_type = 'accept_verified_existing_data',
        decision_note = EXCLUDED.decision_note,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at;

    INSERT INTO aureka_quality.quality_reconciliation_audit (
      room_id, profile_year, record_id, action_type, issue_key, source_label,
      decision_note, before_json, after_json, actor_id, created_at
    ) VALUES (
      p_room_id, p_profile_year, v_item.record_id,
      'warning_accepted_existing_data', p_warning_hash, p_warning_text,
      v_reason,
      pg_catalog.jsonb_build_object('review_state', 'pending'),
      pg_catalog.jsonb_build_object(
        'review_state', 'resolved',
        'verified_indicator', '14.1',
        'source_workbook_retained', true
      ),
      v_user_id, v_now
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'affected_count', v_count,
    'verified_count', v_verified,
    'review_state', 'resolved'
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_list_v2(integer,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_accept_verified_warning(bigint,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_list_v2(integer,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_accept_verified_warning(bigint,integer,text,text,text) TO authenticated;

COMMENT ON FUNCTION aureka_quality.quality_reconciliation_accept_verified_warning(bigint,integer,text,text,text) IS
'Closes only the obsolete ICU/HCU 14.1 missing-source warning after server-side verification of every episode''s value, form field, workbook row and source header. It never changes source or clinical response values.';

COMMIT;