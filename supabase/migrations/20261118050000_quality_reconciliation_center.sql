-- AUREKA: centralized, auditable quality-data reconciliation.
-- Bulk actions are restricted to Admin/PMKP and never infer a clinical classification.
BEGIN;

CREATE TABLE IF NOT EXISTS aureka_quality.quality_reconciliation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  indicator_id uuid REFERENCES aureka_quality.indicator_profiles(id) ON DELETE SET NULL,
  record_id uuid REFERENCES aureka_quality.quality_records(id) ON DELETE SET NULL,
  response_id uuid REFERENCES aureka_quality.quality_record_responses(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'response_auto_mapped',
    'response_manually_mapped',
    'warning_accepted_derived_value',
    'warning_marked_source_correction'
  )),
  issue_key text,
  source_label text,
  source_code text,
  target_label text,
  target_code smallint CHECK (target_code IS NULL OR target_code BETWEEN 1 AND 3),
  decision_note text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quality_reconciliation_audit_room_created_idx
  ON aureka_quality.quality_reconciliation_audit (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_reconciliation_audit_record_idx
  ON aureka_quality.quality_reconciliation_audit (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_reconciliation_audit_actor_idx
  ON aureka_quality.quality_reconciliation_audit (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_reconciliation_warning_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  record_id uuid NOT NULL REFERENCES aureka_quality.quality_records(id) ON DELETE CASCADE,
  warning_hash text NOT NULL,
  warning_text text NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('resolved', 'needs_source_correction')),
  action_type text NOT NULL CHECK (action_type IN ('accept_derived_value', 'needs_source_correction')),
  decision_note text NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, warning_hash)
);

CREATE INDEX IF NOT EXISTS quality_reconciliation_warning_room_year_idx
  ON aureka_quality.quality_reconciliation_warning_reviews (room_id, profile_year, reviewed_at DESC);

ALTER TABLE aureka_quality.quality_reconciliation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_reconciliation_warning_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_reconciliation_audit_select ON aureka_quality.quality_reconciliation_audit;
CREATE POLICY quality_reconciliation_audit_select
  ON aureka_quality.quality_reconciliation_audit
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

DROP POLICY IF EXISTS quality_reconciliation_warning_reviews_select ON aureka_quality.quality_reconciliation_warning_reviews;
CREATE POLICY quality_reconciliation_warning_reviews_select
  ON aureka_quality.quality_reconciliation_warning_reviews
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

REVOKE ALL ON TABLE aureka_quality.quality_reconciliation_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE aureka_quality.quality_reconciliation_warning_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE aureka_quality.quality_reconciliation_audit TO authenticated;
GRANT SELECT ON TABLE aureka_quality.quality_reconciliation_warning_reviews TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_normalize_label(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          COALESCE(p_value, ''),
          '\s*\(\s*code\s*[0-9]+\s*\)\s*$',
          '',
          'i'
        )
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_normalize_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_normalize_label(text) TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_list(
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
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_rooms bigint[];
  v_response_groups jsonb := '[]'::jsonb;
  v_warning_groups jsonb := '[]'::jsonb;
  v_recent_audit jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk membuka Pusat Rekonsiliasi Data.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Pusat Rekonsiliasi Data hanya dapat dikelola Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100 THEN
    RAISE EXCEPTION 'Tahun profil tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL AND NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses rekonsiliasi ke unit yang dipilih tidak diberikan.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(r.id ORDER BY r.sort_order), '{}'::bigint[])
    INTO v_rooms
  FROM public.master_rooms r
  WHERE r.is_active = true
    AND aureka_system.has_quality_room_access(r.id)
    AND (p_room_id IS NULL OR r.id = p_room_id);

  IF pg_catalog.cardinality(v_rooms) = 0 THEN
    RAISE EXCEPTION 'Tidak ada unit yang dapat diakses untuk rekonsiliasi.' USING ERRCODE = '42501';
  END IF;

  WITH pending AS (
    SELECT
      qr.room_id,
      qr.profile_year,
      rr.indicator_id,
      ip.code AS indicator_code,
      ip.title AS indicator_title,
      ip.options_json,
      COALESCE(NULLIF(pg_catalog.btrim(rr.raw_value->>'source_value'), ''), rr.response_label, '') AS source_label,
      NULLIF(pg_catalog.btrim(rr.raw_value->>'source_code'), '') AS source_code,
      COALESCE(NULLIF(rr.raw_value->>'mapping_status',''), 'unknown') AS mapping_status,
      rr.id AS response_id
    FROM aureka_quality.quality_record_responses rr
    JOIN aureka_quality.quality_records qr ON qr.id = rr.record_id
    JOIN aureka_quality.indicator_profiles ip ON ip.id = rr.indicator_id
    WHERE qr.room_id = ANY(v_rooms)
      AND qr.profile_year = p_profile_year
      AND qr.status <> 'archived'
      AND rr.review_status = 'pending'
  ),
  grouped AS (
    SELECT
      room_id, profile_year, indicator_id, indicator_code, indicator_title,
      options_json, source_label, source_code, mapping_status,
      pg_catalog.count(*)::integer AS affected_count
    FROM pending
    GROUP BY room_id, profile_year, indicator_id, indicator_code, indicator_title,
      options_json, source_label, source_code, mapping_status
  ),
  with_suggestions AS (
    SELECT
      g.*,
      r.name AS room_name,
      candidate.match_count,
      candidate.target_label,
      candidate.target_code,
      (
        candidate.match_count = 1
        AND candidate.target_code BETWEEN 1 AND 3
        AND (g.source_code IS NULL OR g.source_code = candidate.target_code::text)
        AND g.mapping_status NOT IN ('source_master_conflict','source_code_conflict','ambiguous_master','not_in_master')
      ) AS auto_fixable
    FROM grouped g
    JOIN public.master_rooms r ON r.id = g.room_id
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.count(*)::integer AS match_count,
        pg_catalog.min(opt.value->>'label') AS target_label,
        pg_catalog.min((opt.value->>'code')::smallint) AS target_code
      FROM pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(g.options_json) = 'array' THEN g.options_json ELSE '[]'::jsonb END
      ) AS opt(value)
      WHERE aureka_quality.quality_reconciliation_normalize_label(g.source_label)
          = aureka_quality.quality_reconciliation_normalize_label(opt.value->>'label')
        AND (opt.value->>'code') ~ '^[1-3]$'
    ) candidate ON true
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'room_id', room_id,
        'room_name', room_name,
        'profile_year', profile_year,
        'indicator_id', indicator_id,
        'indicator_code', indicator_code,
        'indicator_title', indicator_title,
        'source_label', source_label,
        'source_code', source_code,
        'mapping_status', mapping_status,
        'affected_count', affected_count,
        'auto_fixable', COALESCE(auto_fixable, false),
        'suggested_target_label', CASE WHEN auto_fixable THEN target_label ELSE NULL END,
        'suggested_target_code', CASE WHEN auto_fixable THEN target_code ELSE NULL END,
        'options', CASE WHEN pg_catalog.jsonb_typeof(options_json) = 'array' THEN options_json ELSE '[]'::jsonb END
      )
      ORDER BY room_name, indicator_code, source_label
    ),
    '[]'::jsonb
  )
  INTO v_response_groups
  FROM with_suggestions;

  WITH warning_items AS (
    SELECT DISTINCT
      qr.id AS record_id,
      qr.room_id,
      qr.profile_year,
      pg_catalog.btrim(w.warning_text) AS warning_text,
      pg_catalog.md5(pg_catalog.btrim(w.warning_text)) AS warning_hash,
      wr.review_state
    FROM aureka_quality.quality_records qr
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(
      CASE
        WHEN pg_catalog.jsonb_typeof(qr.core_data->'source_import'->'source_warnings') = 'array'
        THEN qr.core_data->'source_import'->'source_warnings'
        ELSE '[]'::jsonb
      END
    ) AS w(warning_text)
    LEFT JOIN aureka_quality.quality_reconciliation_warning_reviews wr
      ON wr.record_id = qr.id
     AND wr.warning_hash = pg_catalog.md5(pg_catalog.btrim(w.warning_text))
    WHERE qr.room_id = ANY(v_rooms)
      AND qr.profile_year = p_profile_year
      AND qr.status <> 'archived'
      AND pg_catalog.btrim(w.warning_text) <> ''
      AND wr.review_state IS DISTINCT FROM 'resolved'
  ),
  grouped_warnings AS (
    SELECT
      wi.room_id,
      r.name AS room_name,
      wi.profile_year,
      wi.warning_hash,
      wi.warning_text,
      pg_catalog.count(DISTINCT wi.record_id)::integer AS affected_count,
      pg_catalog.count(DISTINCT wi.record_id) FILTER (WHERE wi.review_state IS NULL)::integer AS pending_count,
      pg_catalog.count(DISTINCT wi.record_id) FILTER (WHERE wi.review_state = 'needs_source_correction')::integer AS needs_source_correction_count,
      (
        wi.warning_text ~* '(cache formula|formula.*error|los.*berbeda|nilai.*los.*sumber)'
        AND wi.warning_text ~* '(dihitung ulang|nilai turunan|memakai tanggal)'
      ) AS safe_derived_value
    FROM warning_items wi
    JOIN public.master_rooms r ON r.id = wi.room_id
    GROUP BY wi.room_id, r.name, wi.profile_year, wi.warning_hash, wi.warning_text
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'room_id', room_id,
        'room_name', room_name,
        'profile_year', profile_year,
        'warning_hash', warning_hash,
        'warning_text', warning_text,
        'affected_count', affected_count,
        'pending_count', pending_count,
        'needs_source_correction_count', needs_source_correction_count,
        'safe_derived_value', safe_derived_value
      )
      ORDER BY room_name, warning_text
    ),
    '[]'::jsonb
  )
  INTO v_warning_groups
  FROM grouped_warnings;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'room_id', a.room_id,
        'profile_year', a.profile_year,
        'action_type', a.action_type,
        'source_label', a.source_label,
        'source_code', a.source_code,
        'target_label', a.target_label,
        'target_code', a.target_code,
        'decision_note', a.decision_note,
        'affected_record', a.record_id,
        'created_at', a.created_at
      )
      ORDER BY a.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_audit
  FROM (
    SELECT *
    FROM aureka_quality.quality_reconciliation_audit
    WHERE room_id = ANY(v_rooms)
      AND profile_year = p_profile_year
    ORDER BY created_at DESC
    LIMIT 30
  ) a;

  RETURN pg_catalog.jsonb_build_object(
    'profile_year', p_profile_year,
    'room_scope', p_room_id,
    'response_groups', v_response_groups,
    'warning_groups', v_warning_groups,
    'recent_audit', v_recent_audit,
    'summary', pg_catalog.jsonb_build_object(
      'response_group_count', pg_catalog.jsonb_array_length(v_response_groups),
      'response_record_count', COALESCE((
        SELECT pg_catalog.sum((item->>'affected_count')::integer)
        FROM pg_catalog.jsonb_array_elements(v_response_groups) AS item
      ), 0),
      'auto_fixable_group_count', COALESCE((
        SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(v_response_groups) AS item
        WHERE (item->>'auto_fixable')::boolean = true
      ), 0),
      'auto_fixable_record_count', COALESCE((
        SELECT pg_catalog.sum((item->>'affected_count')::integer)
        FROM pg_catalog.jsonb_array_elements(v_response_groups) AS item
        WHERE (item->>'auto_fixable')::boolean = true
      ), 0),
      'warning_group_count', pg_catalog.jsonb_array_length(v_warning_groups),
      'warning_record_count', COALESCE((
        SELECT pg_catalog.sum((item->>'affected_count')::integer)
        FROM pg_catalog.jsonb_array_elements(v_warning_groups) AS item
      ), 0)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_apply_bulk(
  p_room_id bigint,
  p_profile_year integer,
  p_indicator_id uuid,
  p_source_label text,
  p_source_code text,
  p_target_label text,
  p_target_code smallint,
  p_action text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_profile_code text;
  v_options jsonb;
  v_target_option jsonb;
  v_option_count integer;
  v_normalized_matches integer;
  v_option_review_required boolean := false;
  v_reason text := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_item record;
  v_original_source text;
  v_original_source_code text;
  v_before jsonb;
  v_after_raw jsonb;
  v_after jsonb;
  v_changed integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk rekonsiliasi massal.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Rekonsiliasi massal hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses ke unit yang dipilih tidak diberikan.' USING ERRCODE = '42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100 THEN
    RAISE EXCEPTION 'Tahun profil tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_action NOT IN ('auto_exact','manual') THEN
    RAISE EXCEPTION 'Jenis tindakan rekonsiliasi tidak dikenal.' USING ERRCODE = '22023';
  END IF;
  IF p_source_label IS NULL OR pg_catalog.btrim(p_source_label) = ''
     OR p_target_label IS NULL OR pg_catalog.btrim(p_target_label) = ''
     OR p_target_code IS NULL OR p_target_code NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Label sumber dan pilihan master berkode 1/2/3 wajib diisi.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Alasan keputusan minimal 10 karakter.' USING ERRCODE = '22023';
  END IF;

  SELECT ip.code, ip.options_json
    INTO v_profile_code, v_options
  FROM aureka_quality.indicator_profiles ip
  WHERE ip.id = p_indicator_id
    AND ip.room_id = p_room_id
    AND ip.profile_year = p_profile_year
    AND ip.status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil indikator tidak ditemukan pada unit dan tahun yang dipilih.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_option_count
  FROM pg_catalog.jsonb_array_elements(
    CASE WHEN pg_catalog.jsonb_typeof(v_options) = 'array' THEN v_options ELSE '[]'::jsonb END
  ) AS opt(value)
  WHERE pg_catalog.btrim(opt.value->>'label') = pg_catalog.btrim(p_target_label)
    AND (opt.value->>'code') ~ '^[1-3]$'
    AND (opt.value->>'code')::smallint = p_target_code;

  IF v_option_count <> 1 THEN
    RAISE EXCEPTION 'Pilihan master harus cocok dengan tepat satu opsi aktif dan memiliki kode 1/2/3.' USING ERRCODE = '22023';
  END IF;

  SELECT opt.value
    INTO v_target_option
  FROM pg_catalog.jsonb_array_elements(
    CASE WHEN pg_catalog.jsonb_typeof(v_options) = 'array' THEN v_options ELSE '[]'::jsonb END
  ) AS opt(value)
  WHERE pg_catalog.btrim(opt.value->>'label') = pg_catalog.btrim(p_target_label)
    AND (opt.value->>'code')::smallint = p_target_code
  LIMIT 1;

  v_option_review_required := COALESCE((v_target_option->>'review_required')::boolean, false);

  IF p_action = 'auto_exact' THEN
    SELECT pg_catalog.count(*)::integer
      INTO v_normalized_matches
    FROM pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(v_options) = 'array' THEN v_options ELSE '[]'::jsonb END
    ) AS opt(value)
    WHERE aureka_quality.quality_reconciliation_normalize_label(p_source_label)
        = aureka_quality.quality_reconciliation_normalize_label(opt.value->>'label')
      AND (opt.value->>'code') ~ '^[1-3]$';

    IF v_normalized_matches <> 1
       OR aureka_quality.quality_reconciliation_normalize_label(p_source_label)
          <> aureka_quality.quality_reconciliation_normalize_label(p_target_label)
       OR (p_source_code IS NOT NULL AND pg_catalog.btrim(p_source_code) <> p_target_code::text) THEN
      RAISE EXCEPTION 'Auto-fix ditolak: label sumber tidak cocok secara unik atau kode sumber bertentangan. Gunakan telaah manual.' USING ERRCODE = '22023';
    END IF;
    v_reason := 'Pemetaan otomatis: satu label sumber cocok unik dengan opsi master dan kode sumber konsisten.';
  END IF;

  FOR v_item IN
    SELECT
      rr.id AS response_id,
      rr.record_id,
      rr.response_label,
      rr.response_code,
      rr.raw_value,
      rr.review_status,
      qr.core_data
    FROM aureka_quality.quality_record_responses rr
    JOIN aureka_quality.quality_records qr ON qr.id = rr.record_id
    WHERE qr.room_id = p_room_id
      AND qr.profile_year = p_profile_year
      AND qr.status <> 'archived'
      AND rr.indicator_id = p_indicator_id
      AND rr.review_status = 'pending'
      AND COALESCE(NULLIF(pg_catalog.btrim(rr.raw_value->>'source_value'), ''), rr.response_label, '') = p_source_label
      AND NULLIF(pg_catalog.btrim(rr.raw_value->>'source_code'), '') IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(p_source_code), '')
    ORDER BY rr.id
    FOR UPDATE OF rr, qr
  LOOP
    v_original_source := COALESCE(NULLIF(v_item.raw_value->>'source_value',''), v_item.response_label, p_source_label);
    v_original_source_code := NULLIF(pg_catalog.btrim(v_item.raw_value->>'source_code'), '');

    v_before := pg_catalog.jsonb_build_object(
      'source_label', v_original_source,
      'source_code', v_original_source_code,
      'response_label', v_item.response_label,
      'response_code', v_item.response_code,
      'mapping_status', v_item.raw_value->>'mapping_status',
      'review_status', v_item.review_status
    );

    v_after_raw :=
      (CASE WHEN pg_catalog.jsonb_typeof(v_item.raw_value) = 'object' THEN v_item.raw_value ELSE '{}'::jsonb END)
      || pg_catalog.jsonb_build_object(
        'answer', p_target_label,
        'code', p_target_code,
        'source_value', v_original_source,
        'source_code', p_target_code,
        'original_source_code', v_original_source_code,
        'review_required', false,
        'master_review_required', v_option_review_required,
        'mapping_status', 'mapped',
        'resolution_action', p_action,
        'classification_note', v_reason,
        'classified_by', v_user_id,
        'classified_at', v_now
      );

    UPDATE aureka_quality.quality_record_responses
    SET response_label = p_target_label,
        response_code = p_target_code,
        raw_value = v_after_raw,
        classified_code = p_target_code,
        classification_note = v_reason,
        classified_by = v_user_id,
        classified_at = v_now,
        review_status = 'classified',
        updated_at = v_now
    WHERE id = v_item.response_id;

    UPDATE aureka_quality.quality_records
    SET core_data = pg_catalog.jsonb_set(
          COALESCE(v_item.core_data, '{}'::jsonb),
          ARRAY['indicator_values', v_profile_code],
          v_after_raw,
          true
        ),
        updated_at = v_now
    WHERE id = v_item.record_id;

    v_after := pg_catalog.jsonb_build_object(
      'answer', p_target_label,
      'code', p_target_code,
      'source_label_preserved', v_original_source,
      'source_code_original', v_original_source_code,
      'mapping_status', 'mapped',
      'review_status', 'classified',
      'classification_note', v_reason
    );

    INSERT INTO aureka_quality.quality_reconciliation_audit (
      room_id, profile_year, indicator_id, record_id, response_id,
      action_type, source_label, source_code, target_label, target_code,
      decision_note, before_json, after_json, actor_id, created_at
    ) VALUES (
      p_room_id, p_profile_year, p_indicator_id, v_item.record_id, v_item.response_id,
      CASE WHEN p_action = 'auto_exact' THEN 'response_auto_mapped' ELSE 'response_manually_mapped' END,
      v_original_source, v_original_source_code, p_target_label, p_target_code,
      v_reason, v_before, v_after, v_user_id, v_now
    );

    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed = 0 THEN
    RAISE EXCEPTION 'Tidak ada respons pending yang cocok dengan pola sumber ini. Muat ulang antrean rekonsiliasi.' USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'action', p_action,
    'affected_count', v_changed,
    'indicator_code', v_profile_code,
    'target_label', p_target_label,
    'target_code', p_target_code
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_reconciliation_review_warning(
  p_room_id bigint,
  p_profile_year integer,
  p_warning_hash text,
  p_warning_text text,
  p_action text,
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
  v_count integer := 0;
  v_state text;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk telaah warning sumber.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Telaah massal warning hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses ke unit yang dipilih tidak diberikan.' USING ERRCODE = '42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100
     OR p_warning_text IS NULL OR pg_catalog.btrim(p_warning_text) = ''
     OR p_warning_hash IS NULL
     OR p_warning_hash <> pg_catalog.md5(pg_catalog.btrim(p_warning_text)) THEN
    RAISE EXCEPTION 'Identitas warning atau tahun tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Alasan telaah minimal 10 karakter.' USING ERRCODE = '22023';
  END IF;
  IF p_action NOT IN ('accept_derived_value','needs_source_correction') THEN
    RAISE EXCEPTION 'Tindakan warning tidak dikenal.' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'accept_derived_value'
     AND NOT (
       p_warning_text ~* '(cache formula|formula.*error|los.*berbeda|nilai.*los.*sumber)'
       AND p_warning_text ~* '(dihitung ulang|nilai turunan|memakai tanggal)'
     ) THEN
    RAISE EXCEPTION 'Warning ini tidak termasuk hasil hitung ulang deterministik. Koreksi harus dilakukan dari sumber.' USING ERRCODE = '22023';
  END IF;

  v_state := CASE WHEN p_action = 'accept_derived_value' THEN 'resolved' ELSE 'needs_source_correction' END;

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
            WHEN pg_catalog.jsonb_typeof(qr.core_data->'source_import'->'source_warnings') = 'array'
            THEN qr.core_data->'source_import'->'source_warnings'
            ELSE '[]'::jsonb
          END
        ) AS w(warning_text)
        WHERE pg_catalog.btrim(w.warning_text) = pg_catalog.btrim(p_warning_text)
      )
    ORDER BY qr.id
    FOR UPDATE OF qr
  LOOP
    INSERT INTO aureka_quality.quality_reconciliation_warning_reviews (
      room_id, profile_year, record_id, warning_hash, warning_text,
      review_state, action_type, decision_note, reviewed_by, reviewed_at
    ) VALUES (
      p_room_id, p_profile_year, v_item.record_id, p_warning_hash, p_warning_text,
      v_state, p_action, v_reason, v_user_id, v_now
    )
    ON CONFLICT (record_id, warning_hash) DO UPDATE
    SET review_state = EXCLUDED.review_state,
        action_type = EXCLUDED.action_type,
        decision_note = EXCLUDED.decision_note,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at;

    INSERT INTO aureka_quality.quality_reconciliation_audit (
      room_id, profile_year, record_id, action_type, issue_key, source_label,
      decision_note, before_json, after_json, actor_id, created_at
    ) VALUES (
      p_room_id, p_profile_year, v_item.record_id,
      CASE WHEN p_action = 'accept_derived_value'
        THEN 'warning_accepted_derived_value'
        ELSE 'warning_marked_source_correction' END,
      p_warning_hash, p_warning_text, v_reason,
      pg_catalog.jsonb_build_object('review_state', 'pending'),
      pg_catalog.jsonb_build_object('review_state', v_state, 'action_type', p_action),
      v_user_id, v_now
    );

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Warning tidak lagi ditemukan pada catatan aktif. Muat ulang antrean.' USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'action', p_action,
    'review_state', v_state,
    'affected_count', v_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_list(integer,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_apply_bulk(bigint,integer,uuid,text,text,text,smallint,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_reconciliation_review_warning(bigint,integer,text,text,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_list(integer,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_apply_bulk(bigint,integer,uuid,text,text,text,smallint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_reconciliation_review_warning(bigint,integer,text,text,text,text) TO authenticated;

COMMENT ON TABLE aureka_quality.quality_reconciliation_audit IS
'Append-only audit trail for bulk indicator-response mapping and source-warning review. The log stores source/target values and record identifiers but no patient names or medical record numbers.';
COMMENT ON TABLE aureka_quality.quality_reconciliation_warning_reviews IS
'Review state for non-classification source warnings. Only deterministic derived-LOS/formula warnings can be accepted as resolved; other warnings remain flagged for source correction.';
COMMENT ON FUNCTION aureka_quality.quality_reconciliation_apply_bulk(bigint,integer,uuid,text,text,text,smallint,text,text) IS
'Atomically classifies a complete pending response group for one unit, year, indicator, exact source label and source code. Updates quality_record_responses and core_data.indicator_values together and writes per-record audit.';
COMMENT ON FUNCTION aureka_quality.quality_reconciliation_review_warning(bigint,integer,text,text,text,text) IS
'Bulk reviews source warning groups. Accepts only known deterministic formula/LOS recalculations; all other warnings are marked as requiring source correction and are not dismissed.';
COMMIT;
