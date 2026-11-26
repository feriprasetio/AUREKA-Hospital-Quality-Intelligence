-- Reconcile verified source choices, preserving explicit ineligibility.
WITH choices(room_id, code, label, response_code, numerator, eligible) AS (
  VALUES
    (18, '18.5', 'Tanda Vital Tidak Sesuai Fisik', 3, false, true),
    (18, '18.5', 'Status Nutrisi/Diet Salah Input', 3, false, true),
    (18, '18.6', 'Waktu Rawat Panjang karena Rujukan Faskes lain penuh', 2, false, true),
    (20, '20.1', 'Pindah Ruangan NICU untuk Terapi Lanjutan', 2, false, true),
    (20, '20.1', 'Rujuk Faskes Lain', 2, false, true),
    (20, '20.2', 'Diberikan Ventilator/CPAP', 1, true, true),
    (21, '21.1', 'Lengkap', 1, true, true),
    (21, '21.1', 'Tidak Lengkap', 3, false, true),
    (25, '25.13', 'Belum Tersedia CP untuk Diagnosa Ini', NULL, false, false),
    (27, '27.2', 'Tidak memerlukan perawatan kaki', 2, false, false),
    (27, '27.4', 'Tidak dilakukan (Tidak ada intruksi DPJP atau indikasi)', 2, false, false),
    (27, '27.5', 'Tidak dilakukan (Tidak ada indikasi)', 2, false, false),
    (27, '27.6', 'Pasien Dirawat Tanpa Kendala', 1, false, true),
    (27, '27.6', 'Pasien Dirawat Dengan Kekosongan Linen', 3, true, true),
    (27, '27.7', 'Tidak ada obat kosong selama perawatan', 1, false, true),
    (27, '27.7', 'Ada obat yang kosong selama perawatan', 3, true, true),
    (29, '29.1', 'Laporan Masuk Terlambat (≥ 2x24 Jam)', 3, false, true),
    (37, '37.5', 'Tidak Diisi (bukan pasien inpartu)', NULL, false, false),
    (37, '37.5', 'Tidak Diisi (masih fase laten)', NULL, false, false),
    (37, '37.6', 'Pasien Masih di PONEK/IGD', NULL, false, false)
)
UPDATE aureka_quality.indicator_profiles p
SET options_json = p.options_json || additions.options
FROM (
  SELECT ip.id, jsonb_agg(jsonb_build_object(
    'label', c.label, 'code', c.response_code, 'numerator', c.numerator,
    'denominator', c.eligible, 'eligible', c.eligible, 'review_required', false
  ) ORDER BY c.label) AS options
  FROM aureka_quality.indicator_profiles ip JOIN choices c ON c.room_id = ip.room_id AND c.code = ip.code
  WHERE ip.profile_year = 2026 AND ip.is_active AND ip.status = 'published'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(ip.options_json) opt
      WHERE lower(opt->>'label') = lower(c.label)
    )
  GROUP BY ip.id
) additions
WHERE p.id = additions.id;

-- Canonical labels shared by the specialised stockout input and batch validators.
UPDATE aureka_quality.indicator_profiles p
SET options_json = (
  SELECT jsonb_agg(opt || jsonb_build_object(
    'label', CASE WHEN opt->>'code' = '3' THEN 'Terjadi kekosongan ' ELSE 'Tidak terjadi kekosongan ' END ||
      CASE WHEN p.code IN ('23.2','25.9') THEN 'linen' ELSE 'obat' END,
    'numerator', opt->>'code' = '3', 'denominator', true, 'review_required', false
  ) ORDER BY ord)
  FROM jsonb_array_elements(p.options_json) WITH ORDINALITY AS o(opt, ord)
),
schema_json = p.schema_json || CASE WHEN p.code IN ('23.3','25.10') THEN jsonb_build_object(
  'input_mode','free_text_event', 'response_capture_mode',null, 'free_text_field_label','Nama obat yang tidak tersedia',
  'free_text_event_code',3, 'free_text_no_event_code',1,
  'free_text_event_answer','Terjadi kekosongan obat', 'free_text_no_event_answer','Tidak terjadi kekosongan obat'
) ELSE jsonb_build_object('response_capture_mode','categorical') END
WHERE p.profile_year = 2026 AND p.is_active AND p.status = 'published'
  AND (p.room_id,p.code) IN ((23,'23.2'),(23,'23.3'),(25,'25.9'),(25,'25.10'))
  AND jsonb_array_length(p.options_json) = 2
  AND p.options_json @> '[{"code":1},{"code":3}]'::jsonb;

UPDATE aureka_quality.indicator_profiles p
SET options_json = (
  SELECT jsonb_agg(CASE
    WHEN (p.code,opt->>'label') IN (
      ('18.1','Tidak Menggunakan Ventilator/CPAP'),
      ('18.3','Bukan Pasien yang Ditransfer dari IGD')
    ) THEN opt || jsonb_build_object('numerator',false,'denominator',false,'eligible',false,'review_required',false)
    WHEN opt->>'code' IN ('1','2','3') AND coalesce(opt->>'eligible','true') <> 'false'
      THEN opt || jsonb_build_object(
        'numerator', CASE WHEN p.schema_json->>'indicator_direction' = 'negative'
                          THEN opt->>'code' = '3' ELSE opt->>'code' = '1' END,
        'denominator',true,'review_required',false)
    ELSE opt END ORDER BY ord)
  FROM jsonb_array_elements(p.options_json) WITH ORDINALITY AS o(opt, ord)
),
schema_json = p.schema_json || jsonb_build_object('response_capture_mode','categorical')
WHERE p.profile_year = 2026 AND p.is_active AND p.status = 'published'
  AND p.room_id IN (18,19,20,23,25,26)
  AND p.schema_json->>'indicator_direction' IN ('positive','negative')
  AND p.code NOT IN ('23.3','25.10')
  AND jsonb_array_length(p.options_json) > 0;

-- Validate master-backed and unresolved responses separately. The caller still
-- validates room/year, authorisation, row identity, and source provenance.
CREATE OR REPLACE FUNCTION aureka_quality.assert_active_workbook_indicator_response(
  p_indicator_id uuid, p_response jsonb
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_status text := coalesce(p_response->>'review_status','');
  v_raw jsonb := p_response->'raw_value';
  v_mapping text := coalesce(v_raw->>'mapping_status','');
  v_code text := p_response->>'response_code';
  v_source_code text := v_raw->>'source_code';
  v_options integer;
BEGIN
  IF v_raw->'code' IS DISTINCT FROM p_response->'response_code'
     OR (v_code IS NOT NULL AND v_code !~ '^[1-3]$') THEN
    RAISE EXCEPTION 'Kode respons workbook tidak konsisten.' USING ERRCODE='22023';
  END IF;

  IF v_mapping IN ('not_in_master','ambiguous_master','source_code_conflict') THEN
    IF v_code IS NOT NULL OR v_status <> 'pending' OR v_raw->'numerator' IS DISTINCT FROM 'null'::jsonb
       OR coalesce(v_raw->>'review_required','false') <> 'true'
       OR nullif(btrim(v_raw->>'source_value'),'') IS NULL THEN
      RAISE EXCEPTION 'Respons sumber yang belum terpetakan harus disimpan untuk ditinjau.' USING ERRCODE='22023';
    END IF;
    RETURN;
  END IF;

  IF (v_source_code IS NOT NULL AND v_source_code IS DISTINCT FROM v_code)
     OR NOT (
       (v_mapping = 'mapped_existing_master' AND v_status = 'not_required' AND coalesce(v_raw->>'review_required','') = 'false')
       OR (v_mapping = 'mapped_pending_classification' AND v_status = 'pending' AND coalesce(v_raw->>'review_required','') = 'true')
     ) THEN
    RAISE EXCEPTION 'Status atau kode sumber workbook tidak konsisten dengan master.' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_options
  FROM aureka_quality.indicator_profiles p
  CROSS JOIN LATERAL jsonb_array_elements(p.options_json) opt
  WHERE p.id = p_indicator_id AND p.is_active AND p.status = 'published'
    AND opt->>'label' = p_response->>'response_label'
    AND opt->>'code' IS NOT DISTINCT FROM v_code
    AND (
      v_status = 'pending' OR (
        jsonb_typeof(opt->'numerator') = 'boolean'
        AND coalesce(opt->>'review_required','false') = 'false'
        AND opt->'numerator' IS NOT DISTINCT FROM v_raw->'numerator'
        AND opt->'denominator' IS NOT DISTINCT FROM v_raw->'denominator'
      )
    );
  IF v_options <> 1 THEN
    RAISE EXCEPTION 'Pilihan workbook tidak cocok secara unik dengan master aktif.' USING ERRCODE='23503';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION aureka_quality.assert_active_workbook_indicator_response(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.assert_active_workbook_indicator_response(uuid,jsonb) TO authenticated;

DO $repair_specialised_imports$
DECLARE
  name text;
  definition text;
  lookup_begin integer;
  lookup_end integer;
  response_cursor integer;
  provenance_guard text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'import_nicu_logbook_batch','import_nifas_logbook_batch','import_perinatology_logbook_batch',
    'import_surgical_inpatient_logbook_batch','import_penyakit_dalam_inpatient_logbook_batch',
    'import_saraf_inpatient_logbook_batch'
  ] LOOP
    definition := pg_get_functiondef(format('aureka_quality.%I(jsonb)',name)::regprocedure);
    response_cursor := strpos(definition,'FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)');
    IF response_cursor = 0 THEN
      RAISE EXCEPTION 'Loop validasi respons tidak ditemukan untuk %',name;
    END IF;
    IF name IN ('import_nicu_logbook_batch','import_nifas_logbook_batch','import_perinatology_logbook_batch') THEN
      lookup_begin := strpos(definition,$match$      IF coalesce(v_response->>'review_status'$match$);
      IF name = 'import_nifas_logbook_batch' THEN
        definition := replace(definition,$old$         OR v_response->'raw_value'->>'review_required' <> 'true' THEN$old$,'      THEN');
        lookup_begin := strpos(definition,$match$      IF coalesce(v_response->>'review_status'$match$);
      END IF;
    ELSIF name = 'import_saraf_inpatient_logbook_batch' THEN
      definition := replace(definition,$old$         OR coalesce(v_response->>'review_status','') <> 'pending'
         OR coalesce(v_response->'raw_value'->>'review_required','false') <> 'true'
$old$,'');
      lookup_begin := strpos(definition,$match$      IF coalesce(v_response->'raw_value'->>'mapping_status'$match$);
    ELSE
      provenance_guard := split_part(substr(definition,response_cursor),'        RAISE EXCEPTION ''Nilai sumber/inti/respons indikator',1);
      provenance_guard := substr(provenance_guard,strpos(provenance_guard,'         OR v_response->''raw_value'' IS DISTINCT FROM v_values->v_code'));
      IF position('review_required' in provenance_guard) = 0 THEN
        RAISE EXCEPTION 'Validasi provenance berbeda untuk %',name;
      END IF;
      definition := replace(definition, provenance_guard,
        '         OR v_response->''raw_value'' IS DISTINCT FROM v_values->v_code' || E'\n         OR coalesce(v_response->>''other_text'','''')<>coalesce(v_source_values->>v_code,'''') THEN\n');
      lookup_begin := strpos(definition,'      SELECT opt INTO v_option');
    END IF;
    lookup_end := strpos(substr(definition,lookup_begin),E'\n    END LOOP;');
    IF lookup_begin < response_cursor OR lookup_end = 0 THEN
      RAISE EXCEPTION 'Blok validasi master tidak ditemukan untuk %',name;
    END IF;
    definition := overlay(definition placing
      '      PERFORM aureka_quality.assert_active_workbook_indicator_response(v_indicator_id,v_response);'
      from lookup_begin for lookup_end-1);
    IF name = 'import_nicu_logbook_batch' THEN
      IF strpos(definition,$old$ARRAY['18.1','18.3','18.4','18.5','18.6']$old$) = 0 THEN
        RAISE EXCEPTION 'Daftar indikator NICU berubah';
      END IF;
      definition := replace(definition,$old$ARRAY['18.1','18.3','18.4','18.5','18.6']$old$,$new$ARRAY['18.1','18.2','18.3','18.4','18.5','18.6']$new$);
      definition := replace(definition,') <> 5 THEN',') <> 6 THEN');
      definition := replace(definition,'jsonb_array_length(v_responses) > 5','jsonb_array_length(v_responses) > 6');
      definition := replace(definition,'combined_source_not_mapped_requires_review','mapped_as_combined_stockout');
      definition := replace(definition,'Kekosongan BHP/Linen (sumber belum dipetakan)','Kekosongan BHP/Linen');
      definition := replace(definition,$old$jsonb_array_length(v_unmapped->'target_profiles') <> 2$old$,
        $new$jsonb_array_length(v_unmapped->'target_profiles') <> 1
       OR coalesce(v_unmapped->>'source_value','') <> coalesce(v_source_values->>'18.2','')$new$);
      definition := replace(definition,
        'Sumber gabungan BHP/Linen/penunjang harus dipertahankan dan tidak boleh dipaksakan ke master 18.2/18.7.',
        'Sumber gabungan BHP/Linen/penunjang harus sesuai respons 18.2.');
    ELSIF name = 'import_nifas_logbook_batch' THEN
      definition := replace(definition,$old$'19.5','19.7'$old$,$new$'19.5','19.6','19.7'$new$);
      definition := replace(definition,') <> 9 THEN',') <> 10 THEN');
      definition := replace(definition,'jsonb_array_length(v_responses) > 9','jsonb_array_length(v_responses) > 10');
      definition := replace(definition,$old$('19.5','Indikasi SC POGI'),$old$,$new$('19.5','Indikasi SC POGI'),('19.6','Kekosongan BHP/Linen'),$new$);
      definition := replace(definition,'combined_source_not_mapped_requires_review','mapped_as_combined_stockout');
      definition := replace(definition,'Kekosongan BHP/Linen (sumber belum dipetakan)','Kekosongan BHP/Linen');
      definition := replace(definition,$old$'["19.6 Kekosongan Linen", "19.11 Kekosongan Obat"]'::jsonb THEN$old$,
        $new$'["19.6 Kekosongan BHP/Linen"]'::jsonb
       OR coalesce(v_unmapped->>'source_value','') <> coalesce(v_source_values->>'19.6','') THEN$new$);
    ELSIF name = 'import_perinatology_logbook_batch' THEN
      definition := replace(definition,$old$'20.5','20.7'$old$,$new$'20.5','20.6','20.7'$new$);
      definition := replace(definition,') <> 10 THEN',') <> 11 THEN');
      definition := replace(definition,'jsonb_array_length(v_responses) > 10','jsonb_array_length(v_responses) > 11');
      definition := replace(definition,'combined_bhp_linen_source_not_mapped','mapped_as_combined_stockout');
      definition := replace(definition,$old$ || ' (sumber belum dipetakan)'$old$,'');
      definition := replace(definition,$old$'["20.6 Kekosongan Linen", "20.12 Kekosongan Obat"]'::jsonb THEN$old$,
        $new$'["20.6 Kekosongan BHP/Linen"]'::jsonb
       OR coalesce(v_unmapped->>'source_value','') <> coalesce(v_source_values->>'20.6','') THEN$new$);
    END IF;
    EXECUTE definition;
  END LOOP;
END
$repair_specialised_imports$;
