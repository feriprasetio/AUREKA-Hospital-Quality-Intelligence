-- These three choices have explicit Code 2 labels in the Room 24 Logbook.
WITH workbook_options(code, label) AS (
  VALUES
    ('24.1', 'OAT Diberhentikan Sementara Karena Ada Temuan Medis dari DPJP'),
    ('24.2', 'Tidak dilakukan karena sudah cek difaskes lain'),
    ('24.3', 'Sudah Tercatat di Faskes Lain')
)
UPDATE aureka_quality.indicator_profiles p
SET options_json = p.options_json || jsonb_build_array(
  jsonb_build_object('label', w.label, 'code', 2, 'numerator', false,
                     'denominator', true, 'review_required', false))
FROM workbook_options w
WHERE p.code = w.code AND p.room_id = 24 AND p.profile_year = 2026
  AND p.is_active AND p.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.options_json) opt
    WHERE lower(opt->>'label') = lower(w.label)
  );

-- Align the Room 24 measurement options with the declared direction and the coded choices.
UPDATE aureka_quality.indicator_profiles p
SET options_json = (
  SELECT jsonb_agg(
    CASE WHEN opt->>'code' IN ('1','2','3') THEN opt || jsonb_build_object(
      'numerator', CASE WHEN p.schema_json->>'indicator_direction' = 'negative'
                       THEN opt->>'code' IN ('2','3') ELSE opt->>'code' = '1' END,
      'denominator', true, 'review_required', false)
    ELSE opt END ORDER BY ord)
  FROM jsonb_array_elements(p.options_json) WITH ORDINALITY AS o(opt, ord)
),
schema_json = p.schema_json || jsonb_build_object('response_capture_mode','categorical')
WHERE p.room_id = 24 AND p.profile_year = 2026 AND p.is_active AND p.status = 'published'
  AND p.code IN ('24.1','24.2','24.3','24.4','24.5','24.6','24.8','24.9','24.10')
  AND p.schema_json->>'indicator_direction' IN ('positive','negative')
  AND jsonb_array_length(p.options_json) > 0;

DO $repair_isolasi_import$
DECLARE
  definition text := pg_get_functiondef('aureka_quality.import_isolasi_inpatient_logbook_batch(jsonb)'::regprocedure);
  patch record;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ($old$         OR coalesce(v_response->>'review_status','') <> 'pending'
         OR coalesce(v_response->'raw_value'->>'review_required','false') <> 'true'$old$,
     $new$         OR NOT (
           (v_response->'raw_value'->>'mapping_status' = 'mapped_existing_master'
            AND coalesce(v_response->>'review_status','') = 'not_required'
            AND coalesce(v_response->'raw_value'->>'review_required','') = 'false')
           OR
           (coalesce(v_response->'raw_value'->>'mapping_status','') <> 'mapped_existing_master'
            AND coalesce(v_response->>'review_status','') = 'pending'
            AND coalesce(v_response->'raw_value'->>'review_required','') = 'true')
         )$new$),
    ($old$        IF v_code NOT IN ('24.5','24.6')
           OR v_response_code IS NULL
           OR v_source_code IS DISTINCT FROM v_response_code THEN
          RAISE EXCEPTION 'Pemetaan master existing hanya diizinkan untuk alias Linen/Obat dengan kode sumber yang cocok (baris Excel %).', v_source_row USING ERRCODE = '22023';
        END IF;$old$,
     $new$        IF v_response_code IS NULL OR (v_source_code IS NOT NULL AND v_source_code <> v_response_code) THEN
          RAISE EXCEPTION 'Kode sumber tidak cocok dengan pilihan master (baris Excel %).', v_source_row USING ERRCODE = '22023';
        END IF;$new$),
    ($old$          AND opt->'denominator' IS NOT DISTINCT FROM v_response->'raw_value'->'denominator';$old$,
     $new$          AND opt->'denominator' IS NOT DISTINCT FROM v_response->'raw_value'->'denominator'
          AND jsonb_typeof(opt->'numerator') = 'boolean'
          AND coalesce(opt->>'review_required','false') = 'false';$new$)
  ) AS changes(previous, replacement) LOOP
    IF strpos(definition, patch.previous) = 0 THEN
      RAISE EXCEPTION 'Kontrak impor Rawat Inap Isolasi berbeda pada %', left(patch.previous,100);
    END IF;
    definition := replace(definition, patch.previous, patch.replacement);
  END LOOP;
  EXECUTE definition;
END
$repair_isolasi_import$;
