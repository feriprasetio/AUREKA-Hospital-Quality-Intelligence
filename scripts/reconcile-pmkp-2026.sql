-- Run transactionally as the project operator after checking the workbook sources.
-- Stable profile and response IDs preserve links from audit and reconciliation.
DO $reconcile$
DECLARE
  visit_id uuid;
  matched_options integer;
  room_sequence regclass;
  sequence_value bigint;
  max_room_id bigint;
BEGIN
  SELECT id INTO STRICT visit_id
  FROM aureka_quality.indicator_profiles
  WHERE profile_year=2026 AND room_id=14 AND code='14.4' AND status='published' AND is_active
  FOR UPDATE;

  SELECT count(*) INTO matched_options
  FROM aureka_quality.indicator_profiles p, jsonb_array_elements(p.options_json) item
  WHERE p.id=visit_id AND item->>'label' IN (
    'Visite Hari Kerja (06.00-14.00)', 'Visite Hari Kerja (Diatas 14.00)',
    'Tidak Visite', 'Visite Hari Libur', 'Divisitekan Spesialis Lain');
  IF matched_options <> 5 THEN
    RAISE EXCEPTION 'Sumber opsi 14.4 berbeda. Rekonsiliasi dibatalkan.';
  END IF;

  UPDATE aureka_quality.indicator_profiles p SET
    options_json=(SELECT jsonb_agg(
      CASE
        WHEN item->>'label'='Visite Hari Kerja (06.00-14.00)' THEN
          item || '{"code":1,"numerator":true,"denominator":true,"review_required":false}'::jsonb
        WHEN item->>'label' IN ('Visite Hari Kerja (Diatas 14.00)','Tidak Visite') THEN
          item || '{"code":3,"numerator":false,"denominator":true,"review_required":false}'::jsonb
        WHEN item->>'label' IN ('Visite Hari Libur','Divisitekan Spesialis Lain') THEN
          item || '{"code":null,"numerator":null,"review_required":true}'::jsonb
        ELSE item
      END ORDER BY ord)
      FROM jsonb_array_elements(p.options_json) WITH ORDINALITY AS x(item,ord)),
    schema_json=p.schema_json || '{"response_capture_mode":"categorical","indicator_direction":"positive","source_option_correction":"PMKP ICU 2026 / Profil row 3"}'::jsonb,
    updated_at=now()
  WHERE id=visit_id AND NOT (p.schema_json ? 'source_option_correction');

  WITH candidates AS (
    SELECT rr.id, rr.record_id, rr.response_label AS label, rr.raw_value,
      CASE WHEN rr.review_status='pending' THEN 3 END AS corrected_code
    FROM aureka_quality.quality_record_responses rr
    JOIN aureka_quality.quality_records qr ON qr.id=rr.record_id
    WHERE rr.indicator_id=visit_id AND qr.room_id=14 AND qr.profile_year=2026 AND qr.status<>'archived'
      AND (
        (rr.review_status='pending' AND rr.response_label IN ('Visite Hari Kerja (Diatas 14.00)','Tidak Visite')
          AND rr.raw_value->>'source_code'='3' AND rr.raw_value->>'mapping_status'='source_master_conflict')
        OR (rr.review_status='not_required' AND rr.response_label IN ('Visite Hari Libur','Divisitekan Spesialis Lain')
          AND rr.raw_value->>'source_code' IS NULL)
      )
  ), corrected AS (
    UPDATE aureka_quality.quality_record_responses rr SET
      response_code=c.corrected_code,
      review_status=CASE WHEN c.corrected_code IS NULL THEN 'pending' ELSE 'not_required' END,
      raw_value=coalesce(c.raw_value,'{}'::jsonb) || jsonb_build_object(
        'answer',c.label,'code',c.corrected_code,'review_required',c.corrected_code IS NULL,
        'source_option',c.corrected_code IS NULL,
        'review_status',CASE WHEN c.corrected_code IS NULL THEN 'pending' ELSE 'not_required' END,
        'mapping_status',CASE WHEN c.corrected_code IS NULL THEN 'master_pending' ELSE 'mapped' END,
        'prior_mapping_status',c.raw_value->>'mapping_status',
        'correction_source','PMKP ICU 2026 / Profil row 3'),
      updated_at=now()
    FROM candidates c WHERE rr.id=c.id
    RETURNING rr.record_id,rr.raw_value
  )
  UPDATE aureka_quality.quality_records qr SET
    core_data=jsonb_set(qr.core_data,'{indicator_values}',coalesce(qr.core_data->'indicator_values','{}'::jsonb) ||
      jsonb_build_object('14.4',c.raw_value),true),
    updated_at=now()
  FROM corrected c WHERE qr.id=c.record_id;

  UPDATE aureka_quality.indicator_profiles
  SET unit_of_measure='Persentase (%)', updated_at=now()
  WHERE profile_year=2026 AND code='12.2' AND room_id=12 AND is_active AND unit_of_measure LIKE 'Persentase (%) – Indikator Negatif%';

  IF EXISTS (SELECT 1 FROM public.master_rooms WHERE id=38 AND name<>'Bidang Pelayanan Medik dan Keperawatan')
    OR EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles WHERE profile_year=2026 AND code='38.1'
      AND (room_id<>38 OR title<>'Tercapainya Pertemuan Wajib Pelayanan Medik')) THEN
    RAISE EXCEPTION 'ID unit atau kode indikator telah dipakai.';
  END IF;

  INSERT INTO public.master_rooms(id,code,name,sort_order,is_active)
  OVERRIDING SYSTEM VALUE
  VALUES(38,'BID-YANMED-KEP','Bidang Pelayanan Medik dan Keperawatan',38,true)
  ON CONFLICT(id) DO NOTHING;

  room_sequence := pg_get_serial_sequence('public.master_rooms','id')::regclass;
  IF room_sequence IS NOT NULL THEN
    EXECUTE format('SELECT last_value FROM %s',room_sequence) INTO sequence_value;
    SELECT max(id) INTO max_room_id FROM public.master_rooms;
    IF sequence_value <= max_room_id THEN
      PERFORM setval(room_sequence,max_room_id,true);
    END IF;
  END IF;

  INSERT INTO aureka_quality.indicator_profiles(
    profile_year,code,room_id,unit_name,title,indicator_type,unit_of_measure,
    target_text,target_operator,target_value,numerator_definition,denominator_definition,measurement_grain,schema_json
  ) VALUES (
    2026,'38.1',38,'Bidang Pelayanan Medik dan Keperawatan','Tercapainya Pertemuan Wajib Pelayanan Medik',
    '(IMP-Unit) Lokal Unit Pelayanan','Persentase (%)','100%','=',100,
    'Jumlah Pertemuan dan Evaluasi Pelayanan di SMF yang dilaksanakan',
    'Jumlah Pertemuan dan Evaluasi Pelayanan di SMF','activity',
    '{"measurement_type":"ratio","source_excel_row":190,"conversion_source":"Indikator Mutu Tahunan 2026.xlsx"}'
  ) ON CONFLICT(profile_year,code,version) DO NOTHING;
END
$reconcile$;
