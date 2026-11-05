-- Remove placeholder 0% targets that were never approved and reconcile definitions
-- for repeatable assessment-validity and education indicators.
DO $pending_target_cleanup$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_target_text text;
  v_target_value numeric;
  v_unit text;
  v_num text;
  v_den text;
  v_updated integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026 AND status='published' AND is_active=true
       AND (
         target_text ILIKE '%Target dikaji secara absolut%'
         OR (room_id,code) IN (
           (25,'25.18'),(26,'26.16'),(27,'27.12'),
           (27,'27.10'),(30,'30.1'),(30,'30.2'),(30,'30.3')
         )
       )
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb);
    v_target_text := v_old.target_text;
    v_target_value := v_old.target_value;
    v_unit := v_old.unit_of_measure;
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;

    -- This phrase is a review status, not a numeric target. Preserve the full source
    -- text in schema metadata and keep target comparison unavailable until approved.
    IF v_target_text ILIKE '%Target dikaji secara absolut%' THEN
      v_schema := v_schema || jsonb_build_object(
        'target_review_required',true,
        'target_review_note',v_target_text
      );
      v_target_text := NULL;
      v_target_value := NULL;
    END IF;

    IF v_old.code IN ('25.18','26.16','27.12') AND v_old.room_id IN (25,26,27) THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
    ELSIF v_old.room_id=27 AND v_old.code='27.10' THEN
      v_den := 'Jumlah seluruh pasien yang ditransfer dari IGD dan dirawat di ruang VIP pada periode pengukuran.';
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio','indicator_direction','negative');
    ELSIF v_old.room_id=30 AND v_old.code='30.1' THEN
      v_num := 'Jumlah mahasiswa yang menyelesaikan seluruh persyaratan administrasi praktik sejak pengajuan hingga akhir stase sesuai ketentuan rumah sakit.';
      v_den := 'Jumlah seluruh mahasiswa yang menyelesaikan masa stase atau rotasi klinik di rumah sakit pada periode evaluasi.';
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio','indicator_direction','positive');
    ELSIF v_old.room_id=30 AND v_old.code='30.2' THEN
      v_num := 'Jumlah observasi penggunaan atribut mahasiswa yang sesuai dengan ketentuan rumah sakit.';
      v_den := 'Jumlah seluruh sampel observasi penggunaan atribut mahasiswa selama masa praktik pada periode evaluasi.';
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio','indicator_direction','positive');
    ELSIF v_old.room_id=30 AND v_old.code='30.3' THEN
      v_num := 'Jumlah kewajiban kehadiran mahasiswa yang dipenuhi tepat waktu sesuai jadwal praktik.';
      v_den := 'Jumlah seluruh kewajiban absensi mahasiswa pada hari efektif dinas selama periode pengukuran.';
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio','indicator_direction','positive');
    END IF;

    IF v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb)
       OR v_target_text IS DISTINCT FROM v_old.target_text
       OR v_target_value IS DISTINCT FROM v_old.target_value
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah saat pembersihan target placeholder; transaksi dibatalkan.',v_old.code;
      END IF;

      INSERT INTO aureka_quality.indicator_profiles (
        profile_year,code,room_id,unit_name,title,indicator_type,category,
        unit_of_measure,target_text,target_operator,target_value,
        numerator_definition,denominator_definition,measurement_grain,
        schema_json,options_json,version,status,is_active,created_by,updated_by
      )
      VALUES (
        v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
        v_old.indicator_type,v_old.category,v_unit,v_target_text,v_old.target_operator,
        v_target_value,v_num,v_den,v_old.measurement_grain,
        v_schema,v_old.options_json,coalesce(v_old.version,1)+1,'published',true,
        v_old.created_by,v_old.updated_by
      );
      v_updated := v_updated+1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Pembersihan target placeholder dan definisi terstandar menerbitkan % profil.',v_updated;
END
$pending_target_cleanup$;