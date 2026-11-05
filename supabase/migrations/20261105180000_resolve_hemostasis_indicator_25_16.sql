-- Resolve indicator 25.16: bleeding that has not stopped but is referred is not a successful hemostasis outcome.
-- The denominator retains all recorded clinical outcomes; numerator is clinical hemostasis achieved.
DO $resolve_2516$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_count integer;
BEGIN
  SELECT *
    INTO v_old
    FROM aureka_quality.indicator_profiles
   WHERE profile_year=2026 AND room_id=25 AND code='25.16'
     AND status='published' AND is_active=true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil 25.16 aktif tidak ditemukan.';
  END IF;

  IF jsonb_typeof(v_old.options_json)<>'array'
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_old.options_json) opt
        WHERE opt->>'label'='Perdarahan Belum Berhenti (Dirujuk ke RS Tipe A/B untuk tindakan lanjut)'
          AND opt->>'code'='1'
     ) THEN
    RAISE EXCEPTION 'Master opsi 25.16 tidak sesuai dengan pola yang diaudit; koreksi dibatalkan.';
  END IF;

  SELECT jsonb_agg(
    CASE WHEN opt->>'label'='Perdarahan Belum Berhenti (Dirujuk ke RS Tipe A/B untuk tindakan lanjut)'
      THEN jsonb_build_object(
        'code',2,
        'label',opt->>'label',
        'numerator',null,
        'denominator',true,
        'review_required',true
      )
      ELSE opt
    END ORDER BY ord
  )
  INTO v_options
  FROM jsonb_array_elements(v_old.options_json) WITH ORDINALITY AS x(opt,ord);

  SELECT count(*) INTO v_count
    FROM jsonb_array_elements(v_options) opt
   WHERE opt->>'label'='Perdarahan Belum Berhenti (Dirujuk ke RS Tipe A/B untuk tindakan lanjut)'
     AND opt->>'code'='2';
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Reklasifikasi opsi rujukan 25.16 tidak berhasil.';
  END IF;

  v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
    || jsonb_build_object(
      'indicator_direction','positive',
      'measurement_type','compliance'
    );

  UPDATE aureka_quality.indicator_profiles
     SET status='retired',is_active=false
   WHERE id=v_old.id AND status='published' AND is_active=true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil 25.16 berubah selama koreksi; transaksi dibatalkan.';
  END IF;

  INSERT INTO aureka_quality.indicator_profiles (
    profile_year,code,room_id,unit_name,title,indicator_type,category,
    unit_of_measure,target_text,target_operator,target_value,
    numerator_definition,denominator_definition,measurement_grain,
    schema_json,options_json,version,status,is_active,created_by,updated_by
  )
  VALUES (
    v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
    v_old.indicator_type,v_old.category,'Persentase (%)',v_old.target_text,
    v_old.target_operator,v_old.target_value,
    'Jumlah pasien dengan perdarahan saluran cerna (hematemesis dan/atau melena) yang mengalami henti perdarahan secara klinis, yaitu tidak terdapat hematemesis atau melena pada saat outcome perawatan dicatat.',
    'Jumlah seluruh pasien yang dirawat dengan perdarahan saluran cerna (hematemesis dan/atau melena) dan memiliki outcome perawatan yang tercatat pada periode pengukuran.',
    v_old.measurement_grain,v_schema,v_options,coalesce(v_old.version,1)+1,
    'published',true,v_old.created_by,v_old.updated_by
  );
END
$resolve_2516$;