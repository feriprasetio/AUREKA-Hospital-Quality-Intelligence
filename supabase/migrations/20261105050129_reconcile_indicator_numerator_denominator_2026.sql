-- Reconcile clear numerator/denominator definitions for selected 2026 indicators.
-- Each update is versioned; prior metadata and all clinical records remain immutable.
DO $definitions$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_num text;
  v_den text;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026 AND status='published' AND is_active=true
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;

    IF v_old.room_id=1 AND v_old.code='1.1' THEN
      v_den := 'Jumlah seluruh komplain yang diterima rumah sakit pada periode pengukuran.';
    ELSIF v_old.room_id=6 AND v_old.code='6.5' THEN
      v_den := 'Jumlah seluruh pasien IGD yang menjadi sampel audit kelengkapan asesmen awal keperawatan pada periode pengukuran.';
    ELSIF v_old.room_id=14 AND v_old.code='14.5' THEN
      v_num := 'Jumlah petugas yang patuh menggunakan APD sesuai indikasi pada periode observasi.';
      v_den := 'Jumlah seluruh petugas yang diobservasi pada periode pengukuran.';
    ELSIF v_old.room_id=14 AND v_old.code='14.6' THEN
      v_num := 'Jumlah pasien rawat inap berisiko tinggi jatuh yang mendapatkan intervensi pencegahan risiko jatuh sesuai hasil asesmen dan standar unit.';
      v_den := 'Jumlah seluruh pasien rawat inap berisiko tinggi jatuh yang diobservasi pada periode pengukuran.';
    ELSIF v_old.room_id=14 AND v_old.code='14.8' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=18 AND v_old.code='18.1' THEN
      v_num := 'Jumlah pasien yang mengalami kejadian unplanned extubation atau pelepasan ventilator/CPAP yang tidak disengaja pada periode pengukuran.';
      v_den := 'Jumlah seluruh pasien yang terpasang ventilator atau CPAP pada periode pengukuran.';
    ELSIF v_old.room_id=18 AND v_old.code='18.5' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=19 AND v_old.code='19.1' THEN
      v_num := 'Jumlah pasien sectio caesarea yang menerima antibiotik profilaksis sefazolin 2 gram intravena sekitar 1 jam sebelum insisi sesuai standar.';
    ELSIF v_old.room_id=19 AND v_old.code='19.2' THEN
      v_num := 'Jumlah persalinan sectio caesarea dengan bayi bugar (APGAR menit pertama ≥ 7) yang mendapatkan inisiasi menyusu dini.';
    ELSIF v_old.room_id=19 AND v_old.code='19.3' THEN
      v_den := 'Jumlah seluruh pasien sectio caesarea yang diamati pada periode pengukuran.';
    ELSIF v_old.room_id=19 AND v_old.code='19.4' THEN
      v_num := 'Jumlah seluruh pasien sectio caesarea yang menjalani pemeriksaan hemostasis sesuai standar.';
    ELSIF v_old.room_id=19 AND v_old.code='19.5' THEN
      v_num := 'Jumlah tindakan sectio caesarea dengan indikasi yang sesuai pedoman POGI berdasarkan hasil audit rekam medis.';
      v_den := 'Jumlah seluruh tindakan sectio caesarea yang dilakukan pada periode pengukuran.';
    ELSIF v_old.room_id=19 AND v_old.code='19.9' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal kebidanannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=20 AND v_old.code='20.1' THEN
      v_den := 'Jumlah seluruh bayi baru lahir dengan diagnosis asfiksia neonatorum pada periode pengukuran.';
    ELSIF v_old.room_id=20 AND v_old.code='20.4' THEN
      v_num := 'Jumlah bayi baru lahir dengan asfiksia neonatorum yang mendapatkan penilaian usaha napas.';
      v_den := 'Jumlah seluruh bayi baru lahir dengan asfiksia neonatorum pada periode pengukuran.';
    ELSIF v_old.room_id=20 AND v_old.code='20.5' THEN
      v_den := 'Jumlah seluruh bayi baru lahir dengan asfiksia neonatorum yang memenuhi indikasi ventilasi tekanan positif pada periode pengukuran.';
    ELSIF v_old.room_id=20 AND v_old.code='20.9' THEN
      v_den := 'Jumlah seluruh bayi yang ditransfer dari PONEK/IGD ke unit tujuan pada periode pengukuran.';
    ELSIF v_old.room_id=20 AND v_old.code='20.10' THEN
      v_num := 'Jumlah bayi baru lahir dengan asfiksia neonatorum yang tidak menunjukkan ensefalopati hipoksik-iskemik berdasarkan hasil penilaian skor Thomson.';
    ELSIF v_old.room_id=20 AND v_old.code='20.11' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=21 AND v_old.code='21.1' THEN
      v_num := 'Jumlah pasien rawat inap yang pulang dengan catatan edukasi pasien dan keluarga terintegrasi terisi lengkap.';
      v_den := 'Jumlah seluruh pasien rawat inap yang pulang pada periode pengukuran.';
    ELSIF v_old.room_id=22 AND v_old.code='22.1' THEN
      v_den := 'Jumlah seluruh pasien anak yang dirawat inap pada periode pengukuran.';
    ELSIF v_old.room_id=22 AND v_old.code='22.2' THEN
      v_den := 'Jumlah seluruh pasien anak yang menerima pelayanan rawat inap pada periode pengukuran.';
    ELSIF v_old.room_id=22 AND v_old.code='22.3' THEN
      v_den := 'Jumlah seluruh pasien anak yang menjalani pemasangan infus intravena perifer pada periode pengukuran.';
    ELSIF v_old.room_id=22 AND v_old.code='22.8' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=23 AND v_old.code='23.6' THEN
      v_num := 'Jumlah pasien pascaoperasi yang memiliki skala nyeri < 4 dalam 24 jam pascaoperasi berdasarkan hasil observasi.';
      v_den := 'Jumlah seluruh pasien pascaoperasi yang diobservasi pada periode pengukuran.';
    ELSIF v_old.room_id=23 AND v_old.code='23.7' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=24 AND v_old.code='24.1' THEN
      v_num := 'Jumlah pasien yang terdiagnosis TB dan memulai pengobatan yang mendapatkan terapi OAT dalam bentuk lepasan atau KDT sesuai regimen.';
      v_den := 'Jumlah seluruh pasien yang terdiagnosis TB dan memulai pengobatan pada periode pengukuran.';
    ELSIF v_old.room_id=24 AND v_old.code='24.3' THEN
      v_den := 'Jumlah seluruh pasien TB yang mendapatkan pengobatan di rumah sakit pada periode pengukuran.';
    ELSIF v_old.room_id=24 AND v_old.code='24.4' THEN
      v_num := 'Jumlah pasien TB yang pada akhir fase intensif mengalami perbaikan gejala respirasi maupun sistemik sesuai kriteria evaluasi.';
      v_den := 'Jumlah seluruh pasien TB yang dievaluasi pada akhir fase intensif pengobatan.';
    ELSIF v_old.room_id=24 AND v_old.code='24.10' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal keperawatannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    ELSIF v_old.room_id=25 AND v_old.code='25.5' THEN
      v_num := 'Jumlah pasien CKD/PGTA yang menjalani pemeriksaan fungsi ginjal, penghitungan eGFR, dan pemeriksaan kimia darah sesuai standar.';
    ELSIF v_old.room_id=25 AND v_old.code='25.6' THEN
      v_num := 'Jumlah pasien CKD yang menjalani pemeriksaan USG selama perawatan atau memiliki hasil pemeriksaan sebelumnya yang masih berlaku (≤ 6 bulan).';
    ELSIF v_old.room_id=25 AND v_old.code='25.13' THEN
      v_num := 'Jumlah pelayanan oleh PPA yang dilaksanakan sesuai dengan item dan standar pelayanan yang tercantum dalam Clinical Pathway.';
      v_den := 'Jumlah seluruh item pelayanan oleh PPA yang wajib dilaksanakan berdasarkan Clinical Pathway pada pasien yang diaudit dalam periode pengukuran.';
    ELSIF v_old.room_id=26 AND v_old.code='26.15' THEN
      v_num := 'Jumlah pasien STEMI dengan onset < 12 jam dan tanpa kontraindikasi medis mutlak yang mendapatkan revaskularisasi dengan agen fibrinolitik atau primary PCI.';
      v_den := 'Jumlah seluruh pasien STEMI yang datang dengan onset < 12 jam dan tidak memiliki kontraindikasi medis mutlak terhadap revaskularisasi pada periode pengukuran.';
    ELSIF v_old.room_id=30 AND v_old.code='30.4' THEN
      v_den := 'Jumlah seluruh mahasiswa yang menjalani praktik klinik di rumah sakit pada periode pengukuran.';
    ELSIF v_old.room_id=30 AND v_old.code='30.5' THEN
      v_num := 'Jumlah mahasiswa yang menyelesaikan dan menyerahkan laporan praktik pada akhir stase sesuai ketentuan.';
      v_den := 'Jumlah seluruh mahasiswa yang menyelesaikan masa praktik klinik/stase pada periode pengukuran.';
    ELSIF v_old.room_id=34 AND v_old.code='34.2' THEN
      v_num := 'Jumlah pasien Ca Mammae yang menjalani mastektomi dalam waktu kurang dari 5 minggu sejak penegakan diagnosis berdasarkan sistem cTNM.';
    ELSIF v_old.room_id=34 AND v_old.code='34.4' THEN
      v_num := 'Jumlah pasien Ca Mammae baru yang menjalani penetapan stadium cTNM sebelum pengobatan melalui pemeriksaan penunjang yang ditetapkan.';
      v_den := 'Jumlah seluruh pasien Ca Mammae baru yang memenuhi kriteria pengukuran pada periode tersebut.';
    ELSIF v_old.room_id=37 AND v_old.code='37.8' THEN
      v_num := 'Jumlah rekam medis pasien baru yang hasil audit asesmen awal kebidanannya sesuai dengan kondisi klinis aktual pasien.';
      v_den := 'Jumlah seluruh rekam medis pasien baru yang diaudit pada periode pengukuran.';
    END IF;

    -- Remove only known spreadsheet header tokens accidentally appended to definitions.
    IF v_num IS NOT NULL THEN
      v_num := btrim(regexp_replace(v_num, '[[:space:]]*(Definisi Operasional|Denumerator[[:space:]]*\([[:space:]]*D[[:space:]]*\)|Denominator[[:space:]]*\([[:space:]]*D[[:space:]]*\)|Target Pencapaian)[[:space:]]*$', '', 'gi'));
    END IF;
    IF v_den IS NOT NULL THEN
      v_den := btrim(regexp_replace(v_den, '[[:space:]]*(Definisi Operasional|Denumerator[[:space:]]*\([[:space:]]*D[[:space:]]*\)|Denominator[[:space:]]*\([[:space:]]*D[[:space:]]*\)|Target Pencapaian)[[:space:]]*$', '', 'gi'));
    END IF;

    IF v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah selama rekonsiliasi definisi; transaksi dibatalkan.',v_old.code;
      END IF;

      INSERT INTO aureka_quality.indicator_profiles (
        profile_year,code,room_id,unit_name,title,indicator_type,category,
        unit_of_measure,target_text,target_operator,target_value,
        numerator_definition,denominator_definition,measurement_grain,
        schema_json,options_json,version,status,is_active,created_by,updated_by
      )
      VALUES (
        v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
        v_old.indicator_type,v_old.category,v_old.unit_of_measure,v_old.target_text,
        v_old.target_operator,v_old.target_value,v_num,v_den,v_old.measurement_grain,
        coalesce(v_old.schema_json,'{}'::jsonb),v_old.options_json,
        coalesce(v_old.version,1)+1,'published',true,v_old.created_by,v_old.updated_by
      );
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Rekonsiliasi definisi N/D 2026 menerbitkan % versi profil baru.',v_changed;
END
$definitions$;