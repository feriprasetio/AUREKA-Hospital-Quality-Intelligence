-- Reconcile the eight published Room 22 profiles with the Rawat Inap Anak Logbook.
UPDATE aureka_quality.indicator_profiles
SET options_json = options_json ||
  CASE code
    WHEN '22.2' THEN '[{"code":2,"label":"Pasien Menangis Histeris Trauma Tindakan"}]'::jsonb
    WHEN '22.3' THEN '[{"code":1,"label":"Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang"}]'::jsonb
    WHEN '22.4' THEN '[{"code":1,"label":"Menggunakan Linen"},{"code":2,"label":"Menggunakan Stick Laken Pengganti Linen"}]'::jsonb
    WHEN '22.7' THEN '[{"code":2,"label":"Pasien APS Tidak Sempat Visite"},{"code":2,"label":"Divisitekan Spesialis Lain/Dokter Jaga Ruangan"}]'::jsonb
  END
WHERE room_id=22 AND profile_year=2026 AND status='published' AND is_active
  AND code IN ('22.2','22.3','22.4','22.7');

UPDATE aureka_quality.indicator_profiles p
SET options_json = (
  SELECT jsonb_agg(opt || jsonb_build_object(
    'code', choice_code,
    'numerator', CASE WHEN p.schema_json->>'indicator_direction'='negative'
                      THEN choice_code IN (2,3) ELSE choice_code=1 END,
    'denominator', true, 'review_required', false) ORDER BY ord)
  FROM jsonb_array_elements(p.options_json) WITH ORDINALITY AS o(opt,ord)
  CROSS JOIN LATERAL (SELECT coalesce((opt->>'code')::int, 2) AS choice_code) c
),
numerator_definition = CASE WHEN p.code='22.8'
  THEN 'Jumlah rekam medis pasien baru yang diaudit dengan seluruh item asesmen akurat.'
  ELSE p.numerator_definition END,
schema_json = p.schema_json || jsonb_build_object('measurement_type','compliance','response_capture_mode','categorical')
WHERE p.room_id=22 AND p.profile_year=2026 AND p.status='published' AND p.is_active
  AND p.code IN ('22.1','22.2','22.3','22.4','22.6','22.7','22.8');

UPDATE aureka_quality.indicator_profiles
SET options_json='[
    {"code":1,"label":"Tidak terjadi kekosongan obat","numerator":false,"denominator":true,"review_required":false},
    {"code":3,"label":"Terjadi kekosongan obat","numerator":true,"denominator":true,"review_required":false}
  ]'::jsonb,
  schema_json=schema_json || jsonb_build_object(
    'measurement_type','compliance',
    'response_capture_mode',null,
    'input_mode','free_text_event',
    'free_text_field_label','Nama obat yang tidak tersedia',
    'free_text_placeholder','Isi nama obat yang tidak tersedia.',
    'free_text_presence_means_adverse_event',true,
    'free_text_event_code',3,
    'free_text_no_event_code',1,
    'free_text_event_answer','Terjadi kekosongan obat',
    'free_text_no_event_answer','Tidak terjadi kekosongan obat',
    'free_text_counts_by_patient_once',true,
    'free_text_evidence_field','other_text'),
  numerator_definition='Jumlah episode dengan sedikitnya satu obat yang dibutuhkan tetapi tidak tersedia.',
  denominator_definition='Jumlah episode rawat inap yang dinilai ketersediaan obatnya.'
WHERE room_id=22 AND profile_year=2026 AND status='published' AND is_active AND code='22.5';

DO $repair_pediatric_import$
DECLARE
  definition text := pg_get_functiondef('aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb)'::regprocedure);
  patch record;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ($old$ARRAY['22.1','22.2','22.3','22.5','22.6','22.7','22.8']$old$, $new$ARRAY['22.1','22.2','22.3','22.4','22.5','22.6','22.7','22.8']$new$),
    ($old$AND jsonb_array_length(ip.options_json)>0) <> 7 THEN$old$, $new$AND jsonb_array_length(ip.options_json)>0) <> 8 THEN$new$),
    ($old$OR jsonb_array_length(v_responses)>7 OR jsonb_array_length(v_source_only)<>6$old$, $new$OR jsonb_array_length(v_responses)>8 OR jsonb_array_length(v_source_only)<>4$new$),
    ($old$FROM jsonb_object_keys(v_source_cells))<>13$old$, $new$FROM jsonb_object_keys(v_source_cells))<>12$new$),
    ($old$Tujuh kolom indikator dan enam kolom sumber-only$old$, $new$Delapan kolom indikator dan empat kolom sumber Dengue$new$),
    ($old$('22.3','Infus Vena Perifer'),('22.5','Kekosongan Obat')$old$, $new$('22.3','Infus Vena Perifer'),('22.4','Kekosongan Linen'),('22.5','Kekosongan Obat')$new$),
    ($old$    IF NOT (v_source_cells ? '22.4_source_only') OR NOT (v_source_cells ? '22.5_source_only')
       OR coalesce(v_form->>'Kekosongan Linen','')<>coalesce(v_source_cells->>'22.4_source_only','')
       OR coalesce(v_form->>'Kekosongan Obat','')<>coalesce(v_source_cells->>'22.5_source_only','') THEN
      RAISE EXCEPTION 'Nilai sumber Kekosongan Linen/Obat tidak dipertahankan persis (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;$old$, $new$$new$),
    ($old$    IF coalesce(v_source_only->0->>'code','')<>'22.4' OR coalesce(v_source_only->0->>'source_header','')<>'Kekosongan Linen'
       OR coalesce(v_source_only->0->>'source_value','')<>coalesce(v_form->>'Kekosongan Linen','')
       OR coalesce(v_source_only->0->>'mapping_status','')<>'source_semantics_not_mapped'
       OR coalesce(v_source_only->1->>'code','')<>'22.5' OR coalesce(v_source_only->1->>'source_header','')<>'Kekosongan Obat'
       OR coalesce(v_source_only->1->>'source_value','')<>coalesce(v_form->>'Kekosongan Obat','')
       OR coalesce(v_source_only->1->>'mapping_status','')<>'free_text_source_not_mapped'
       OR coalesce(v_source_only->2->>'code','')<>'22.9' OR coalesce(v_source_only->2->>'source_header','')<>'Demam 2–7H + Trombositopenia + ↑Ht'
       OR coalesce(v_source_only->2->>'source_value','')<>coalesce(v_form->>'Demam 2–7H + Trombositopenia + ↑Ht','')
       OR coalesce(v_source_only->2->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->3->>'code','')<>'22.10' OR coalesce(v_source_only->3->>'source_header','')<>'DR ≥1×/Hari'
       OR coalesce(v_source_only->3->>'source_value','')<>coalesce(v_form->>'DR ≥1×/Hari','')
       OR coalesce(v_source_only->3->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->4->>'code','')<>'22.11' OR coalesce(v_source_only->4->>'source_header','')<>'Kristaloid ≥500 cc/8J'
       OR coalesce(v_source_only->4->>'source_value','')<>coalesce(v_form->>'Kristaloid ≥500 cc/8J','')
       OR coalesce(v_source_only->4->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->5->>'code','')<>'22.12' OR coalesce(v_source_only->5->>'source_header','')<>'Tidak DSS'
       OR coalesce(v_source_only->5->>'source_value','')<>coalesce(v_form->>'Tidak DSS','')
       OR coalesce(v_source_only->5->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR NOT (v_source_cells ? '22.5')
       OR coalesce(v_source_cells->>'22.5','')<>coalesce(v_form->>'Kekosongan Obat','') THEN
      RAISE EXCEPTION 'Sumber Linen, Obat dan Dengue tidak lengkap/tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;$old$, $new$    IF coalesce(v_source_only->0->>'code','')<>'22.9' OR coalesce(v_source_only->0->>'source_header','')<>'Demam 2–7H + Trombositopenia + ↑Ht'
       OR coalesce(v_source_only->0->>'source_value','')<>coalesce(v_form->>'Demam 2–7H + Trombositopenia + ↑Ht','')
       OR coalesce(v_source_only->0->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->1->>'code','')<>'22.10' OR coalesce(v_source_only->1->>'source_header','')<>'DR ≥1×/Hari'
       OR coalesce(v_source_only->1->>'source_value','')<>coalesce(v_form->>'DR ≥1×/Hari','')
       OR coalesce(v_source_only->1->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->2->>'code','')<>'22.11' OR coalesce(v_source_only->2->>'source_header','')<>'Kristaloid ≥500 cc/8J'
       OR coalesce(v_source_only->2->>'source_value','')<>coalesce(v_form->>'Kristaloid ≥500 cc/8J','')
       OR coalesce(v_source_only->2->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->3->>'code','')<>'22.12' OR coalesce(v_source_only->3->>'source_header','')<>'Tidak DSS'
       OR coalesce(v_source_only->3->>'source_value','')<>coalesce(v_form->>'Tidak DSS','')
       OR coalesce(v_source_only->3->>'mapping_status','')<>'clinical_definition_pending_source_only'
 THEN
      RAISE EXCEPTION 'Sumber Dengue tidak lengkap atau tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;$new$),
    ($old$OR nullif(btrim(v_form->>'Tanggal Masuk'),'') IS NULL OR nullif(btrim(v_form->>'Kategori Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'Perawat Penerima'),'') IS NULL OR nullif(btrim(v_form->>'DPJP'),'') IS NULL THEN
      RAISE EXCEPTION 'Nama, No. RM, Tanggal Masuk, Kategori Pasien, Perawat Penerima, dan DPJP wajib tersedia$old$, $new$OR nullif(btrim(v_form->>'Tanggal Masuk'),'') IS NULL THEN
      RAISE EXCEPTION 'Nama, No. RM dan Tanggal Masuk wajib tersedia$new$),
    ($old$OR extract(year FROM v_discharge_date)::integer<>2026 THEN$old$, $new$THEN$new$),
    ($old$Tanggal Keluar harus valid, tidak sebelum Tanggal Masuk, dan tahun 2026$old$, $new$Tanggal Keluar harus valid dan tidak sebelum Tanggal Masuk$new$),
    ($old$      v_response_code:=NULL;$old$, $new$      IF v_code='22.5' AND (
           coalesce(v_response->>'response_code','') NOT IN ('1','3')
           OR upper(btrim(coalesce(v_form->>'Kekosongan Obat',''))) IN
              ('#VALUE!','#NUM!','#REF!','#DIV/0!','#N/A','#NAME?','#NULL!','#SPILL!','#CALC!')
           OR v_response->>'review_status'<>'not_required'
         ) THEN
        RAISE EXCEPTION 'Nilai Kekosongan Obat tidak valid (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
      v_response_code:=NULL;$new$)
  ) AS changes(previous, replacement) LOOP
    IF strpos(definition, patch.previous)=0 THEN
      RAISE EXCEPTION 'Kontrak impor Rawat Inap Anak berbeda pada %', left(patch.previous,100);
    END IF;
    definition := replace(definition, patch.previous, patch.replacement);
  END LOOP;
  EXECUTE definition;
END
$repair_pediatric_import$;
