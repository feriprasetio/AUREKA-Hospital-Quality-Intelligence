-- Complete numerator/denominator definitions where the published response options and
-- existing denominator or population statement are sufficient to define the measure.
-- Do not invent missing clinical target thresholds; profile-only versioning preserves audit history.
DO $complete_nd$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_num text;
  v_den text;
  v_unit text;
  v_schema jsonb;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026 AND status='published' AND is_active=true
       AND (room_id,code) IN (
         (25,'25.2'),(25,'25.3'),(25,'25.7'),(25,'25.14'),(25,'25.15'),
         (33,'33.1'),(33,'33.3'),(33,'33.4')
       )
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;
    v_unit := 'Persentase (%)';
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
      || jsonb_build_object('measurement_type','compliance');

    IF v_old.room_id=25 AND v_old.code='25.2' THEN
      v_num := 'Jumlah pasien sirosis dengan perdarahan varises esofagus yang mendapatkan terapi vasoaktif somatostatin atau octreotide sesuai regimen dosis awal bolus dan terapi pemeliharaan.';
      v_den := 'Jumlah seluruh pasien sirosis dengan perdarahan varises esofagus yang dirawat pada periode pengukuran.';
    ELSIF v_old.room_id=25 AND v_old.code='25.3' THEN
      v_num := 'Jumlah pasien sirosis dengan perdarahan varises esofagus yang menjalani pemeriksaan darah perifer lengkap, PT, APTT, dan fibrinogen secara lengkap.';
      v_den := 'Jumlah seluruh pasien sirosis dengan perdarahan varises esofagus yang dirawat pada periode pengukuran.';
    ELSIF v_old.room_id=25 AND v_old.code='25.7' THEN
      v_num := 'Jumlah pasien dengan indikasi hemodialisis cito/urgent yang menjalani hemodialisis dalam waktu ≤ 48 jam sejak keputusan dokter.';
      v_den := 'Jumlah seluruh pasien dengan indikasi hemodialisis cito/urgent pada periode pengukuran.';
    ELSIF v_old.room_id=25 AND v_old.code='25.14' THEN
      v_num := 'Jumlah pasien PGTA dengan komplikasi yang menunjukkan perbaikan kondisi klinis saat pulang berdasarkan penilaian klinis DPJP.';
      v_den := 'Jumlah seluruh pasien PGTA dengan komplikasi yang dipulangkan pada periode pengukuran.';
    ELSIF v_old.room_id=25 AND v_old.code='25.15' THEN
      v_num := 'Jumlah pasien dengan gangguan parameter laboratorium yang menunjukkan perbaikan parameter sesuai evaluasi klinis (antara lain ureum/kreatinin menurun atau kalium kembali dalam rentang sasaran).';
      v_den := 'Jumlah seluruh pasien yang dirawat dengan gangguan parameter laboratorium tersebut dan dievaluasi pada periode pengukuran.';
    ELSIF v_old.room_id=33 AND v_old.code='33.1' THEN
      v_num := 'Jumlah kasus kegawatdaruratan obstetri/neonatal di PONEK yang ditangani oleh tim lengkap sesuai formasi minimal empat peran utama dan menjalankan komunikasi closed-loop secara efektif.';
      v_den := 'Jumlah seluruh kasus kegawatdaruratan obstetri dan neonatal yang terjadi di unit PONEK pada periode pengukuran.';
    ELSIF v_old.room_id=33 AND v_old.code='33.3' THEN
      v_num := 'Jumlah pasien maternal/neonatal rujukan yang diterima dengan data klinis lengkap dan otorisasi/konfirmasi rujukan melalui SISRUTE sebelum pasien tiba.';
      v_den := 'Jumlah seluruh pasien maternal/neonatal yang masuk melalui rujukan dari fasilitas kesehatan tingkat pertama atau rumah sakit lain pada periode pengukuran.';
    ELSIF v_old.room_id=33 AND v_old.code='33.4' THEN
      v_num := 'Jumlah pasien kritis maternal/neonatal yang dirujuk keluar dari RSUD dalam keadaan stabil sesuai parameter airway, circulation, akses intravena, dan tanda vital dalam batas toleransi klinis.';
      v_den := 'Jumlah seluruh pasien kritis maternal/neonatal yang dirujuk keluar dari RSUD pada periode pengukuran.';
    END IF;

    IF v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb) THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah saat pelengkapan definisi N/D; transaksi dibatalkan.',v_old.code;
      END IF;

      INSERT INTO aureka_quality.indicator_profiles (
        profile_year,code,room_id,unit_name,title,indicator_type,category,
        unit_of_measure,target_text,target_operator,target_value,
        numerator_definition,denominator_definition,measurement_grain,
        schema_json,options_json,version,status,is_active,created_by,updated_by
      )
      VALUES (
        v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
        v_old.indicator_type,v_old.category,v_unit,v_old.target_text,v_old.target_operator,
        v_old.target_value,v_num,v_den,v_old.measurement_grain,
        v_schema,v_old.options_json,coalesce(v_old.version,1)+1,'published',true,
        v_old.created_by,v_old.updated_by
      );
      v_changed := v_changed+1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Pelengkapan definisi N/D 2026 menerbitkan % profil.',v_changed;
END
$complete_nd$;