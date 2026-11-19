BEGIN;

CREATE TABLE IF NOT EXISTS aureka_quality.spm_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 24),
  group_name text NOT NULL CHECK (length(btrim(group_name)) BETWEEN 1 AND 160),
  group_order integer NOT NULL CHECK (group_order BETWEEN 1 AND 99),
  indicator_order integer NOT NULL CHECK (indicator_order BETWEEN 1 AND 999),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  target_operator text NOT NULL DEFAULT '=',
  target_value numeric,
  target_text text,
  unit_of_measure text,
  numerator_definition text,
  denominator_definition text,
  owner_room_id bigint REFERENCES public.master_rooms(id) ON DELETE SET NULL,
  source_mode text NOT NULL DEFAULT 'standalone'
    CHECK (source_mode IN ('standalone','quality_linked','quality_denominator_linked')),
  source_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_config)='object'),
  calculation_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(calculation_config)='object'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_year, code)
);

CREATE INDEX IF NOT EXISTS spm_indicators_year_group_idx
  ON aureka_quality.spm_indicators(profile_year, group_order, indicator_order)
  WHERE is_active=true;

CREATE TABLE IF NOT EXISTS aureka_quality.spm_monthly_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES aureka_quality.spm_indicators(id) ON DELETE RESTRICT,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_json)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','validated')),
  notes text,
  entered_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, profile_year, period_month)
);

CREATE INDEX IF NOT EXISTS spm_measurements_year_month_idx
  ON aureka_quality.spm_monthly_measurements(profile_year, period_month, indicator_id);

CREATE TABLE IF NOT EXISTS aureka_quality.spm_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('indicator_config','monthly_measurement')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE')),
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spm_audit_entity_created_idx
  ON aureka_quality.spm_audit_log(entity_type, entity_id, created_at DESC);

ALTER TABLE aureka_quality.spm_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.spm_monthly_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.spm_audit_log ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA aureka_quality TO authenticated;
GRANT SELECT, UPDATE ON aureka_quality.spm_indicators TO authenticated;
GRANT SELECT, INSERT, UPDATE ON aureka_quality.spm_monthly_measurements TO authenticated;
GRANT SELECT ON aureka_quality.spm_audit_log TO authenticated;

DROP POLICY IF EXISTS spm_indicators_select ON aureka_quality.spm_indicators;
CREATE POLICY spm_indicators_select
  ON aureka_quality.spm_indicators FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
    OR (owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(owner_room_id))
  );

DROP POLICY IF EXISTS spm_indicators_update ON aureka_quality.spm_indicators;
CREATE POLICY spm_indicators_update
  ON aureka_quality.spm_indicators FOR UPDATE TO authenticated
  USING (aureka_system.current_role_code() IN ('ADMIN','PMKP'))
  WITH CHECK (aureka_system.current_role_code() IN ('ADMIN','PMKP'));

DROP POLICY IF EXISTS spm_measurements_select ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_select
  ON aureka_quality.spm_monthly_measurements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  );

DROP POLICY IF EXISTS spm_measurements_insert ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_insert
  ON aureka_quality.spm_monthly_measurements FOR INSERT TO authenticated
  WITH CHECK (
    entered_by=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND i.profile_year=profile_year
        AND i.is_active=true
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  );

DROP POLICY IF EXISTS spm_measurements_update ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_update
  ON aureka_quality.spm_monthly_measurements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  )
  WITH CHECK (
    entered_by=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND i.profile_year=profile_year
        AND i.is_active=true
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  );

DROP POLICY IF EXISTS spm_audit_select ON aureka_quality.spm_audit_log;
CREATE POLICY spm_audit_select
  ON aureka_quality.spm_audit_log FOR SELECT TO authenticated
  USING (aureka_system.current_role_code() IN ('ADMIN','PMKP'));

CREATE OR REPLACE FUNCTION aureka_quality.spm_audit_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entity text := CASE WHEN TG_TABLE_NAME='spm_indicators' THEN 'indicator_config' ELSE 'monthly_measurement' END;
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_id := COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid);
    INSERT INTO aureka_quality.spm_audit_log(entity_type,entity_id,action,before_json,after_json,actor_id)
    VALUES (
      v_entity,
      v_id,
      TG_OP,
      CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END,
      to_jsonb(NEW),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.spm_audit_capture() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS spm_indicator_audit ON aureka_quality.spm_indicators;
CREATE TRIGGER spm_indicator_audit
  AFTER UPDATE ON aureka_quality.spm_indicators
  FOR EACH ROW EXECUTE FUNCTION aureka_quality.spm_audit_capture();

DROP TRIGGER IF EXISTS spm_measurement_audit ON aureka_quality.spm_monthly_measurements;
CREATE TRIGGER spm_measurement_audit
  AFTER INSERT OR UPDATE ON aureka_quality.spm_monthly_measurements
  FOR EACH ROW EXECUTE FUNCTION aureka_quality.spm_audit_capture();

CREATE OR REPLACE FUNCTION aureka_quality.spm_quality_source_summary(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_visite jsonb;
  v_falls jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR') THEN
    RAISE EXCEPTION 'Akses ringkasan sumber SPM tidak diberikan.' USING ERRCODE='42501';
  END IF;
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Tahun pengukuran SPM tidak valid.' USING ERRCODE='22023';
  END IF;

  WITH source_profiles(room_id,indicator_code) AS (
    VALUES
      (14::bigint,'14.4'::text),
      (18::bigint,'18.4'::text),
      (19::bigint,'19.8'::text),
      (20::bigint,'20.8'::text),
      (22::bigint,'22.7'::text),
      (23::bigint,'23.5'::text),
      (24::bigint,'24.8'::text),
      (25::bigint,'25.12'::text),
      (26::bigint,'26.7'::text),
      (27::bigint,'27.9'::text),
      (37::bigint,'37.6'::text)
  ),
  monthly AS (
    SELECT
      EXTRACT(MONTH FROM qr.record_date)::integer AS month,
      COUNT(*)::integer AS denominator,
      COUNT(*) FILTER (
        WHERE response.value->>'code'='1'
          AND response.value->>'answer'='Visite Hari Kerja (06.00-14.00)'
          AND COALESCE(response.value->>'mapping_status','mapped')
            NOT IN ('source_code_conflict','ambiguous_master','not_in_master')
      )::integer AS numerator
    FROM aureka_quality.quality_records qr
    JOIN source_profiles s ON s.room_id=qr.room_id
    CROSS JOIN LATERAL (
      SELECT qr.core_data->'indicator_values'->s.indicator_code AS value
    ) response
    WHERE qr.profile_year=p_year
      AND qr.record_date >= make_date(p_year,1,1)
      AND qr.record_date < make_date(p_year+1,1,1)
      AND qr.status IN ('ready','validated')
      AND qr.measurement_grain='patient_episode'
      AND response.value IS NOT NULL
    GROUP BY EXTRACT(MONTH FROM qr.record_date)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month',m.month,
      'numerator',COALESCE(x.numerator,0),
      'denominator',COALESCE(x.denominator,0)
    ) ORDER BY m.month
  ),'[]'::jsonb)
  INTO v_visite
  FROM generate_series(1,12) AS m(month)
  LEFT JOIN monthly x ON x.month=m.month;

  WITH monthly AS (
    SELECT
      EXTRACT(MONTH FROM qr.record_date)::integer AS month,
      COUNT(*)::integer AS denominator
    FROM aureka_quality.quality_records qr
    WHERE qr.profile_year=p_year
      AND qr.record_date >= make_date(p_year,1,1)
      AND qr.record_date < make_date(p_year+1,1,1)
      AND qr.room_id = ANY(ARRAY[14,18,19,20,22,23,24,25,26,27,37]::bigint[])
      AND qr.status IN ('ready','validated')
      AND qr.measurement_grain='patient_episode'
    GROUP BY EXTRACT(MONTH FROM qr.record_date)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month',m.month,
      'denominator',COALESCE(x.denominator,0)
    ) ORDER BY m.month
  ),'[]'::jsonb)
  INTO v_falls
  FROM generate_series(1,12) AS m(month)
  LEFT JOIN monthly x ON x.month=m.month;

  RETURN jsonb_build_object('visite',v_visite,'falls',v_falls);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.spm_quality_source_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.spm_quality_source_summary(integer) TO authenticated;

WITH raw_seed AS (
  SELECT value AS item
  FROM jsonb_array_elements($spm_seed$[["SPM-001","Instalasi Gawat Darurat",1,1,"Kemampuan menangani life saving anak dan dewasa","=",1,"1","nilai",6,"Jumlah kumulatif pasien yang mendapat pertolongan life saving di Gawat Darurat","Jumlah seluruh pasien yang membutuhkan penanganan life saving di Unit Gawat Darurat"],["SPM-002","Instalasi Gawat Darurat",1,2,"Jam buka pelayanan gawat darurat","=",24,"24 Jam","jam",6,"Jumlah kumulatif jam buka gawat darurat dalam satu bulan","Jumlah hari dalam satu bulan"],["SPM-003","Instalasi Gawat Darurat",1,3,"Pemberi pelayanan kegawat daruratan yang bersertifikat BLS/PPGD/GELS/ALS","=",1,"1","nilai",6,"Jumlah tenaga yang bersertifikat BLS/PPGD/GELS/ALS","Jumlah tenaga yang memberikan pelayanan kegawat daruratan"],["SPM-004","Instalasi Gawat Darurat",1,4,"Ketersediaan tim penanggulangan bencana","=",1,"1 Tim","nilai",6,"Jumlah Tim penanggulangan bencana yang ada di rumah sakit","- ada"],["SPM-005","Instalasi Gawat Darurat",1,5,"Waktu tanggap Pelayanan Dokter di Gawat Darurat","≤",5,"5 Menit","menit",6,"Jumlah kumulatif waktu yang diperlukan sejak kedatangan semua pasien yang disampling secara acak sampai dilayani dokter","Jumlah seluruh pasien yang di sampling (minimal n = 50)"],["SPM-006","Instalasi Gawat Darurat",1,6,"Kepuasan Pelanggan pada Gawat Darurat","≥",70,"70","persen",6,"Jumlah kumulatif rerata penilaian kepuasan pasien Gawat Darurat yang di survey","Jumlah seluruh pasien Gawat Darurat yang di survey (minimal n = 50)"],["SPM-007","Instalasi Gawat Darurat",1,7,"Kematian Pasien ≤ 24 jam di Gawat Darurat","≤",0.002,"2/1000","proporsi",6,"Jumlah pasien yang meninggal dalam periode ≤ 24 jam sejak pasien datang","Jumlah seluruh yang ditangani di Gawat Darurat"],["SPM-008","Instalasi Gawat Darurat",1,8,"Tidak adanya keharusan untuk membayar uang muka","=",1,"1","nilai",6,"Jumlah pasien gawat darurat yang - membayar uang muka","Jumlah seluruh pasien yang datang di Gawat Darurat"],["SPM-009","Instalasi Rawat Jalan",2,1,"Pemberi pelayanan di klinik spesialis","=",1,"1","nilai",11,"Jumlah hari buka klinik spesialis yang ditangani oleh dokter spesialis dalam waktu satu bulan","Jumlah seluruh hari buka klinik spesialis dalam waktu satu bulan"],["SPM-010","Instalasi Rawat Jalan",2,2,"Ketersediaan pelayanan rawat jalan","=",4,"4","nilai",11,"Jenis – jenis pelayanan rawat jalan spesialistik yang ada (kualitatif)","- ada"],["SPM-011","Instalasi Rawat Jalan",2,3,"Ketersediaan pelayanan rawat jalan di rumah sakit jiwa","=",4,"4","nilai",11,"Jenis – jenis pelayanan rawat jalan spesialistik yang ada (kualitatif/NAPZA;Gangguan Psikotik;Gangguan Neurotik;Gangguan Organik)","Tidak Ada"],["SPM-012","Instalasi Rawat Jalan",2,4,"Buka pelayanan sesuai ketentuan","=",1,"1","nilai",11,"Jumlah pelayanan rawat jalan spesialistik yang buka sesuai ketentuan dalam satu bulan","Jumlah seluruh hari pelayanan rawat jalan spesialistik dalamsatu bulan"],["SPM-013","Instalasi Rawat Jalan",2,5,"Waktu tunggu di Rawat Jalan","≤",60,"60 Menit","menit",11,"Jumlah kumulatif waktu tunggu pasien rawat jalan yang disurvey","Jumlah seluruh pasien rawat jalan yang disurvey"],["SPM-014","Instalasi Rawat Jalan",2,6,"Kepuasan Pelanggan pada Rawat Jalan","≥",90,"90","persen",11,"Jumlah kumulatif rerata penilaian kepuasan pasien rawat jalan yang disurvey","Jumlah seluruh pasien rawat jalan yang disurvey (minimal n = 50)"],["SPM-015","Instalasi Rawat Jalan",2,7,"Pasien rawat jalan tuberkulosis yang ditangani dengan strategi DOTS","=",1,"1","nilai",11,"Jumlah semua pasien rawat jalan tuberculosis yang ditangani dengan strategi DOTS","Jumlah seluruh pasien rawat jalan tuberculosis yang ditangani di rumah sakit dalam waktu tiga bulan"],["SPM-016","Instalasi Rawat Inap",3,1,"Pemberi pelayanan rawat inap","=",1,"1","nilai",null,"Jumlah Tenaga Dokter Dan Perawat Yang Memberi Pelayanan Diruang Rawat Inap Yang Sesuai Dengan Ketentuan","Jumlah Seluruh Tenaga Dokter Dan Perawat Yang Bertugas Dirawat Inap"],["SPM-017","Instalasi Rawat Inap",3,2,"Dokter penanggung jawab pasien rawat inap","=",1,"1","nilai",null,"Jumlah pasien dalam satu bulan yang mempunyai dokter sebagai penanggung jawab","Jumlah seluruh pasien rawat inap dalam satu bulan"],["SPM-018","Instalasi Rawat Inap",3,3,"Ketersediaan Pelayanan Rawat Inap","=",4,"4 (A, PD, Kb, B)","nilai",null,"Jenis – jenis pelayanan rawat inap spesialistik yang ada (kualitatif)","Tidak ada"],["SPM-019","Instalasi Rawat Inap",3,4,"Jam Visite Dokter Spesialis","=",1,"1","nilai",null,"Jumlah visite dokter spesialis antara jam 07.00 - 14.00 yang disurvei","Jumlah pelaksanaan visite dokter spesialis yang disurvei"],["SPM-020","Instalasi Rawat Inap",3,5,"Kejadian Infeksi Pasca Operasi","≤",0.015,"0.015","proporsi",null,"Jumlah pasien yang mengalami infeksi pasca operasi dalam satu bulan","Jumlah seluruh pasien yang di operasi dalam satu bulan"],["SPM-021","Instalasi Rawat Inap",3,6,"Angka kejadian infeksi nosokomial","≤",0.015,"0.015","proporsi",null,"Jumlah pasien rawat inap yang terkena infeksi nosokomial (phlebitis) dalam satu bulan","Jumlah pasien rawat inap dalam satu bulan"],["SPM-022","Instalasi Rawat Inap",3,7,"Tidak adanya kejadian pasien jatuh yang berakibat kecacatan/kematian","=",1,"1","nilai",null,"Jumlah pasien dirawat dalam bulan tersebut dikurangi jumlah pasien yang jatuh dan berakibat kecacatan atau kematian","Jumlah pasien dirawat dalam bulan"],["SPM-023","Instalasi Rawat Inap",3,8,"Kematian Pasien >48 Jam","≤",0.0024,"0.0024","proporsi",null,"Jumlah kejadian kematian pasien rawat inap > 48 jam dalam satu bulan","Jumlah seluruh pasien rawat inap dalam satu bulan"],["SPM-024","Instalasi Rawat Inap",3,9,"Kejadian Pulang Paksa","≤",0.05,"0.05","proporsi",null,"Jumlah pasien pulang paksa dalam satu bulan","Jumlah seluruh pasien yang dirawat dalam satu bulan"],["SPM-025","Instalasi Rawat Inap",3,10,"Kepuasan Pelanggan Rawat Inap","≥",90,"90","persen",null,"Jumlah kumulatif rerata penilaian kepuasan pasien rawat inap yang di survey","Jumlah seluruh pasien rawat inap yang di survey (minimal n = 50)"],["SPM-026","Instalasi Rawat Inap",3,11,"Pasien Rawat Inap TB","=",1,"1","nilai",null,"Jumlah semua pasien rawat inap tuberculosis yang ditangani dengan strategi DOTS","Jumlah seluruh pasien rawat inap tuberculosis yang ditangani dir rumah sakit dalam waktu tiga bulan"],["SPM-027","Instalasi Rawat Inap",3,12,"Ketersediaan pelayanan rawat di rumah sakit yang memberikan pelayanan jiwa","=",4,"4 (Napza, Psikotik, Neurotik, Organik)","nilai",null,"Jenis – jenis pelayanan rawat inap rumah sakit jiwa (NAPZA; Gangguan Psikotik; Gangguan Neurotik;Gangguan Organik)","Tidak Ada"],["SPM-028","Instalasi Rawat Inap",3,13,"Tidak adanya Kematian Pasien gangguan jiwa karena bunuh diri","=",1,"1","nilai",null,"Jumlah seluruh pasien yang dirawat dalam satu bulan dikurangi jumlah kejadian kematian pasien gangguan jiwa bunuh diri dalam satu bulan","Jumlah seluruh pasien yang dirawat dalam satu bulan"],["SPM-029","Instalasi Rawat Inap",3,14,"Kejadian (re-admision) pasien gangguan jiwa tidak kembali dalam perawatan dalam waktu ≤ 1 bulan","=",1,"1","nilai",null,"Jumlah seluruh pasien gangguan yang dipulangkan dalam 1 bulan dikurangi jumlah kejadian pasien gangguan jiwa yang kembali dirawat dalam waktu ≤ 1 bulan","Jumlah seluruh pasien yang gangguan jiwa yang dipulangkan dalam 1 bulan"],["SPM-030","Instalasi Rawat Inap",3,15,"Lama hari perawatan pasien gangguan jiwa","≤",6,"6 Minggu","nilai",null,"Jumlah rerata perawtan pasien gangguan jiwa 6 minggu","Tidak Ada"],["SPM-031","Instalasi Bedah Sentral",4,1,"Waktu tunggu operasi elektif","≤",2,"2 Hari","nilai",4,"Jumlah kumulatif waktu tunggu operasi yang terencana dari seluruh pasien yang dioperasi dalam satu bulan","Jumlah pasien yang dioperasi dalam satu bulan"],["SPM-032","Instalasi Bedah Sentral",4,2,"Kejadian kematian dimeja operasi","≤",0.01,"0.01","proporsi",4,"Jumlah pasien yang meninggal dimeja operasi dalam satu bulan","Jumlah pasien yang dilakukan tindakan pembedahan dalam satu bulan"],["SPM-033","Instalasi Bedah Sentral",4,3,"Tidak adanya kejadian operasi salah sisi","≤",0.01,"0.01","proporsi",4,"Jumlah pasien yang dioperasi dalam waktu satu bulan dikurangi jumlah pasien yang dioperasi salah sisi dalam waktu satu bulan","Jumlah pasien yang dioperasi dalam waktu satu bulan"],["SPM-034","Instalasi Bedah Sentral",4,4,"Tidak adanya kejadian operasi salah orang","=",0,"0","nilai",4,"Jumlah pasien yang dioperasi dalam waktu satu bulan dikurangi jumlah operasi salah orang dalam waktu satu bulan","Jumlah pasien yang dioperasi dalam waktu satu bulan"],["SPM-035","Instalasi Bedah Sentral",4,5,"Tidak adanya kejadian salah tindakan pada operasi","=",0,"0","nilai",4,"Jumlah pasien yang dioperasi dalam waktu satu bulan dikurangi jumlah pasien yang mengalami salah tindakan operasi dalam satu bulan","Jumlah pasien yang dioperasi dalam waktu satu bulan"],["SPM-036","Instalasi Bedah Sentral",4,6,"Tidak adanya kejadian tertinggalnya benda asing pada tubuh pasien setelah operasi","=",0,"0","nilai",4,"Jumlah pasien yang dioperasi dalam waktu satu bulan dikurangi jumlah pasien yang mengalami tertinggalnya benda asing dalam tubuh akibat operasi dalam satu bulan","Jumlah pasien yang dioperasi dalam satu bulan"],["SPM-037","Instalasi Bedah Sentral",4,7,"Komplikasi anastesi karena over dosis, reaksi anantesi dan salah penempatan endotracheal tube","≤",0.06,"0.06","proporsi",4,"Jumlah pasien yang mengalami komplikasianastesi dalam satu bulan","Jumlah pasien yang dioperasi dalam waktu satu bulan"],["SPM-038","Instalasi Maternal Perinatal",5,1,"Kejadian kematian ibu karena persalinan","≤",0.01,"0.01","proporsi",null,"Jumlah kematian pasien persalinan karena pendarahan, pre-eklampsia/eklampsia dan sepsis","Jumlah pasien-pasien persalinan dengan pendarahan, pre-eklampsia/eklampsia dan sepsis"],["SPM-039","Instalasi Maternal Perinatal",5,2,"Pemberi pelayanan persalinan normal","=",1,"1","nilai",null,"Jumlah tenaga dokter Sp.OG, dokter umum terlatih (asuhan persalinan normal) dan bidan yang memberikan pertolongan persalinan normal","Jumlah seluruh tenaga yang memberi pertolongan persalinan normal."],["SPM-040","Instalasi Maternal Perinatal",5,3,"Pemberi pelayanan persalinan dengan penyulit","=",null,"Tersedia","nilai",null,"Tersedianya tim dokter Sp.OG, dokter umum, bidan dan perawat terlatih.","Tidak ada"],["SPM-041","Instalasi Maternal Perinatal",5,4,"Pemberi pelayanan persalinan dengan tindakan operasi","=",1,"1","nilai",null,"Jumlah tenaga dokter Sp.OG, dokter spesialis anak, dokter spesialis anastesi yang memberikan pertolongan persalinan dengan tindakan operasi","Jumlah seluruh tenaga yang melayani persalinan dengan tindakan operasi"],["SPM-042","Instalasi Maternal Perinatal",5,5,"Pertolongan persalinan melalui seksio cesaria","≤",0.2,"0.2","proporsi",null,"Jumlah persalinan dengan seksio cesaria dalam 1 bulan","Jumlah seluruh persalinan dalam 1 bulan"],["SPM-043","Instalasi Maternal Perinatal",5,6,"Keluarga Berencana Mantap","=",1,"1","nilai",null,"Jenis pelayanan KB mantap","Jumlah peserta KB"],["SPM-044","Instalasi Maternal Perinatal",5,7,"Konseling KB Mantap","=",1,"1","nilai",null,"Jumlah konseling layanan KB mantap","Jumlah Peserta KB Mantap"],["SPM-045","Instalasi Maternal Perinatal",5,8,"Kepuasan Pelanggan","≥",80,"80","persen",null,"Jumlah kumulatif hasil penilaian kepuasan dari pasien yang disurvei (dalam prosen)","Jumlah total pasien yang disurvei (n minial 50)"],["SPM-046","Instalasi Maternal Perinatal",5,9,"Kemampuan menangani BBLR 1500 gr-2500 gr","=",1,"1","nilai",null,"Jumlah BBLR 1500 gr-2500 gr yang berhasil ditangani","Jumlah seluruh BBLR 1500 gr-2500 gr yang ditangani"],["SPM-047","Intensive Care Unit",6,1,"Rata-rata pasien yang kembali ke perawatan intensif dengan kasus yang sama < 72 jam","≤",0.03,"0.03","proporsi",14,"Jumlah pasien yang kembali ke perawatan intensif dengan kasus yang sama < 72 jam dalam 1 bulan","Jumlah seluruh pasien yang dirawat di ruang intensif dalam 1 bulan."],["SPM-048","Intensive Care Unit",6,2,"Pemberi pelayanan unit intensif","=",1,"1","nilai",14,"Jumlah tenaga dokter Sp.An dan spesialis yang sesuai dengan kasus yang ditangani perawat D3 dengan sertifikat perawat mahir ICU/setara yang melayani pelayanan perawatan intensif","Jumlah seluruh tenaga dokter dan perawat yang melayani perawatan intensif"],["SPM-049","Instalasi Radiologi",7,1,"Waktu tunggu hasil pelayanan thorax foto","≤",180,"180 Menit","menit",10,"Jumlah kumulatif waktu tunggu hasil pelayanan thorax foto dalam satu bulan.","Jumlah pasien yang difoto thorax dalam bulan tersebut."],["SPM-050","Instalasi Radiologi",7,2,"Pelaksana ekspertisi hasil pemeriksaan","=",1,"1","nilai",10,"Jumlah seluruh pemeriksaan foto rontgen dalam 1 bulan.","Register di Instalasi Radiologi"],["SPM-051","Instalasi Radiologi",7,3,"Kejadian kegagalan pelayanan rontgen","≤",0.02,"0.02","proporsi",10,"Jumlah foto rusak yang tidak dapat dibaca dalam 1 bulan","Jumlah seluruh pemeriksaan foto dalam 1 bulan"],["SPM-052","Instalasi Radiologi",7,4,"Kepuasan pelanggan","≥",80,"80","persen",10,"Jumlah pasien yang disurvei yang menyatakan puas","Jumlah total pasien yang disurvei (n minial 50)"],["SPM-053","Instalasi Laboratorium",8,1,"Waktu tunggu hasil pelayanan laboratorium","≤",140,"140 Menit","menit",9,"Jumlah kumulatif waktu tunggu hasil pelayanan laboratorium pasien yang disurvey dalam satu bulan","Jumlah pasien yang diperiksa di laboratorium yang disurvey dalam bulan tersebut."],["SPM-054","Instalasi Laboratorium",8,2,"Pelaksana ekspertisi hasil pemeriksaan laboratorium","=",1,"1","nilai",9,"Jumlah hasil lab. yang diverifikasi hasilnya oleh dokter spesialis patologi klinik dalam satu bulan","Jumlah seluruh pemeriksaan laboratorium dalam satu bulan"],["SPM-055","Instalasi Laboratorium",8,3,"Tidak adanya kesalahan penyerahan hasil pemeriksaan laboratorium","=",1,"1","nilai",9,"Jumlah seluruh pasien yang diperiksa laboratorium dalam satu bulan dikurangi jumlah penyerahan hasil laboratorium salah orang dalam satu bulan","Jumlah pasien yang diperiksa di laboratorium dalam bulan tersebut"],["SPM-056","Instalasi Laboratorium",8,4,"Kepuasan pelanggan","≥",80,"80","persen",9,"Jumlah kumulatif hasil penilaian kepuasan dari pasien yang disurvei (dalam prosen)","Jumlah total pasien yang disurvei (n minial 50)"],["SPM-057","Instalasi Rehab Medik",9,1,"Kejadian drop out pasien terhadap pelayanan rehabilitasi yang direncanakan.","≤",0.5,"0.5","proporsi",12,"Jumlah seluruh pasien yang drop out dalam 3 bulan","Jumlah seluruh pasien yang di program rehabilitasi medik dalam 3 bulan"],["SPM-058","Instalasi Rehab Medik",9,2,"Tidak adanya kejadian kesalahan tindakan rehabilitasi medik","=",1,"1","nilai",12,"Jumlah seluruh pasien yang deprogram rehabilitasi medik dalam 1 bulan dikurangi jumlah pasien yang mengalami kesalahan tindakan rehabilitasi medik dalam 1 bulan","Jumlah seluruh pasien yang deprogram rehabilitasi medik dalam 1 bulan"],["SPM-059","Instalasi Rehab Medik",9,3,"Kepuasan Pelanggan","≥",80,"80","persen",12,"Jumlah kumulatif hasil penilaian kepuasan pasien dari pasien yang disurvei (dalam prosen)","Jumlah total pasien yang disurvei (n minimal 50)"],["SPM-060","Instalasi Farmasi",10,1,"Waktu tunggu pelayanan obat jadi","≤",30,"30 Menit","menit",5,"Jumlah kumulatif waktu tunggu pelayanan obat jadi pasien yang disurvey dalam satu bulan","Jumlah pasien yang disurvey dalam bulan tersebut."],["SPM-061","Instalasi Farmasi",10,2,"Waktu tunggu pelayanan obat racikan","≤",60,"60 Menit","menit",5,"Jumlah kumulatif waktu tunggu pelayanan obat racikan pasien yang disurvey dalam satu bulan","Jumlah pasien yang disurvey dalam bulan tersebut."],["SPM-062","Instalasi Farmasi",10,3,"Tidak adanya kejadian kesalahan pemberian obat","=",1,"1","nilai",5,"Jumlah seluruh pasien instalasi farmasi yang disurvey dikurangi jumlah pasien yang mengalami kesalahan pemberian obat","Jumlah seluruh pasien instalasi farmasi yang disurvey"],["SPM-063","Instalasi Farmasi",10,4,"Kepuasan Pelanggan","≥",80,"80","persen",5,"Jumlah kumulatif hasil penilaian kepuasan dari pasien yang disurvei (dalam prosen)","Jumlah total pasien yang disurvei (n minimal 50)"],["SPM-064","Instalasi Farmasi",10,5,"Penulisan resep sesuai formularium","=",1,"1","nilai",5,"Jumlah resep yang diambil sebagai sample yang sesuai formularium dalam satu bulan","Jumlah seluruh resep yang diambil sebagai sampel dalam satu bulan (n minimal 50)"],["SPM-065","Instalasi Gizi",11,1,"Ketepatan waktu pemberian makanan kepada pasien","≥",0.9,"0.9","proporsi",7,"Jumlah pasien rawat inap yang disurvei yang mendapat makanan tepat waktu satu bulan","Jumlah seluruh pasien rawat inap yang disurvei"],["SPM-066","Instalasi Gizi",11,2,"Sisa makanan yang tidak termakan oleh pasien","≤",20,"20 Porsi","nilai",7,"Jumlah kumulatif porsi sisa makanan dari pasien yang disurvey","Jumlah pasien yang disurvey dalam satu bulan"],["SPM-067","Instalasi Gizi",11,3,"Tidak adanya kesalahan dalam pemberian diet","=",1,"1","nilai",7,"Jumlah pemberian makanan yang disurvey dikurangi jumlah pemberian makanan yang salah diet","Jumlah pasien yang disurvey dalam satu bulan"],["SPM-068","Pelayanan Bansos",12,1,"Pelayanan terhadap pasien GAKIN yang datang ke RS pada setiap unit pelayanan","=",1,"1","nilai",null,"Jumlah pasien GAKIN yang dilayani rumah sakit dalam satu bulan","Jumlah seluruh pasien GAKIN yang datang ke rumah sakit dalam satu bulan."],["SPM-069","Instalasi Rekam Medik",13,1,"Kelengkapan pengisian rekam medik 24 jam setelah selesai pelayanan","=",1,"1","nilai",13,"Jumlah rekam medik yang disurvey dalam 1 bulan yang diisi lengkap","Jumlah rekam medik yang disurvey dalam 1 bulan."],["SPM-070","Instalasi Rekam Medik",13,2,"Kelengkapan informed concent setelah mendapatkan informasi yang jelas","=",1,"1","nilai",13,"Jumlah pasien yang mendapat tindakan medik yang disurvey yang mendapat informasi lengkap sebelum memberikan persetujuan tindakan medik dalam 1 bulan","Jumlah pasien yang mendapat tindakan medik yang disurvey dalam 1 bulan"],["SPM-071","Instalasi Rekam Medik",13,3,"Waktu penyediaan dokumen rekam medik pelayanan rawat jalan","≤",10,"10 Menit","menit",13,"Jumlah kumulatif waktu penyediaan rekam medis sampel rawat jalan yang diamati","Total sampel penyediaan rekam medis yang diamati (N tidak kurang dari 100)."],["SPM-072","Instalasi Rekam Medik",13,4,"Waktu penyediaan dokumen rekam medik pelayanan rawat inap","≤",15,"15 Menit","menit",13,"Total sampel penyediaan rekam medis rawat inap yang diamati","Hasil survei pengamatan diruang pendaftaran rawat jalan"],["SPM-073","Instalasi Pengolahan Air Limbah",14,1,"Baku mutu limbah cair","=",1,"1","nilai",null,"Hasil laboratorium  pemeriksaan limbah cair rumah sakit yang sesuai dengan baku mutu","Jumlah seluruh pemeriksaan limbah cair."],["SPM-074","Instalasi Pengolahan Air Limbah",14,2,"Pengolahan limbah padat berbahaya sesuai dengan aturan","=",1,"1","nilai",null,"Jumlah limbah padat yang dikelola sesuai dengan standar prosedur operasional yang diamati","Jumlah total proses pengolahan limbah padat yang diamati"],["SPM-075","Sub-Bagian Umum dan Aparatur",15,1,"Tindak lanjut penyelesaian hasil pertemuan tingkat direksi","=",1,"1","nilai",null,"Hasil keputusan pertemuan direksi yang ditindaklanjuti dalam satu bulan","Total hasil keputusan yang harus ditindaklanjuti dalam satu bulan"],["SPM-076","Sub-Bagian Umum dan Aparatur",15,2,"Kelengkapan laporan akuntabilitas kinerja","=",1,"1","nilai",null,"Laporan akuntabilitas kinerja yang lengkap dan dilakukan minimal 3 bulan dalam satu tahun","Jumlah laporan akuntabilitas yang seharusnya disusun dalam satu tahun"],["SPM-077","Sub-Bagian Umum dan Aparatur",15,3,"Ketepatan waktu pengusulan kenaikan pangkat Jabatan Fungsional Tertentu","=",1,"1","nilai",null,"Jumlah pegawai JFT yang tepat waktu dalam penyelesaian kenaikan pangkat","Jumlah seluruh pegawai JFT yang mengusulkan kenaikan pangkat pada periode tersebut"],["SPM-078","Sub-Bagian Umum dan Aparatur",15,4,"Ketepatan waktu pengusulan kenaikan pangkat Jabatan Fungsional Umum/Struktural","=",1,"1","nilai",null,"Jumlah pegawai JFU yang tepat waktu dalam penyelesaian kenaikan pangkat","Jumlah seluruh pegawai JFU yang mengusulkan kenaikan pangkat pada periode tersebut"],["SPM-079","Sub-Bagian Umum dan Aparatur",15,5,"Ketepatan waktu pengurusan kenaikan gaji berkala","=",1,"1","nilai",null,"Jumlah pegawai yang diusulkan tepat waktu sesuai periode kenaikan gaji berkala dalam satu tahun","Jumlah seluruh pegawai yang seharusnya diusulkan kenaikan gaji berkala dalam satu tahun"],["SPM-080","Sub-Bagian Umum dan Aparatur",15,6,"Karyawan yang mendapat pelatihan minimal 20 jam pertahun","≥",0.6,"0.6","proporsi",null,"Jumlah karyawan yang mendapat pelatihan minimal 20 jam per tahun","Jumlah seluruh karyawan di rumah sakit"],["SPM-081","Sub-Bagian Keuangan",16,1,"Cost Recovery","≥",0.4,"0.4","proporsi",null,"Jumlah pendapatan fungsional dalam satu bulan","Jumlah pembelanjaan operasional dalam satu bulan"],["SPM-082","Sub-Bagian Keuangan",16,2,"Ketepatan waktu penyusunan laporan keuangan","=",1,"1","nilai",null,"Jumlah  laporan  keuangan  yang  diselesaikan  sebelum  tanggal setiap  bulan berikutnya dalam tiga bulan","Jumlah laporan keuangan yang harus diselesaikan dalam tiga bulan"],["SPM-083","Sub-Bagian Keuangan",16,3,"Kecepatan waktu pemberian informasi tentang tagihan pasien rawat inap","≤",120,"120 Menit","menit",null,"Jumlah kumulatif waktu pemberian informasi tagihan pasien rawat inap yang diamati dalam satu bulan","Jumlah total pasien rawat inap yang diamati dalam satu bulan"],["SPM-084","Sub-Bagian Keuangan",16,4,"Ketepatan waktu pemberian imbalan (insentif) sesuai kesepakatan waktu","=",1,"1","nilai",null,"Jumlah bulan dengan kelambatan pemberian insentif","6 bulan"],["SPM-085","Instalasi Ambulance",17,1,"Waktu pelayanan ambulance/kereta jenazah","=",24,"24 Jam","jam",3,"Total waktu buka (dalam jam) pelayanan ambulance dalam satu bulan","Jumlah hari dalam bulan tersebut"],["SPM-086","Instalasi Ambulance",17,2,"Kecepatan memberikan pelayanan ambulance/kereta jenazah di rumah sakit","=",1,"1","nilai",3,"Jumlah penyediaan ambulance/kereta jenazah yang tepat waktu dalam 1 bulan","Jumlah seluruh permintaan ambulance/kereta jenazah dalam satu bulan"],["SPM-087","Unit Pemulasaran Jenazah",18,1,"Waktu tanggap pelayanan pemulasaraan jenazah","≤",2,"2 Jam","jam",null,"Total kumulatif waktu pelayanan pemulasaraan jenazah pasien yang diamati dalam satu bulan","Total pasien yang diamati dalam satu bulan"],["SPM-088","Pelayanan Pemeliharaan Sarana Rumah Sakit",19,1,"Kecepatan waktu menanggapi kerusakan alat medis","≥",0.8,"0.8","proporsi",null,"Jumlah laporan kerusakan alat medis yang ditanggapi kurang atau sama dengan 15 menit dalam satu bulan","Jumlah seluruh laporan kerusakan alat medis dalam satu bulan"],["SPM-089","Pelayanan Pemeliharaan Sarana Rumah Sakit",19,2,"Ketepatan waktu pemeliharaan alat medis","=",1,"1","nilai",null,"Jumlah alat medis yang dilakukan pemeliharaan (service) tepat waktu dalam satu bulan","Jumlah seluruh alat medis yang seharusnya dilakukan pemeliharaan dalam satu bulan"],["SPM-090","Pelayanan Pemeliharaan Sarana Rumah Sakit",19,3,"Peralatan Laboratorium (dan alat ukur yang lain) yang terkalibrasi tepat waktu sesuai dengan ketentuan kalibrasi","=",1,"1","nilai",null,"Jumlah seluruh alat laboratorium yang dikalibrasi tepat waktu dalam satu tahun","Jumlah alat laboratorium yang perlu dikalibrasi dalam 1 tahun"],["SPM-091","Instalasi Laundry",20,1,"Tidak adanya kejadian linen yang hilang","=",1,"1","nilai",null,"Jumlah linen yang dihitung dalam 4 hari sampling dalam satu tahun","Jumlah linen yang seharusnya ada pada hari sampling tersebut"],["SPM-092","Instalasi Laundry",20,2,"Ketepatan waktu penyediaan linen untuk ruang rawat inap","=",0.1,"0.1","proporsi",null,"Jumlah hari dalam satu bulan dengan penyediaan linen tepat waktu","Jumlah hari dalam satu bulan"],["SPM-093","Komite Pencegahan dan Pengendalian Infeksi",21,1,"Tersedianya anggota Tim PPI yang terlatih","≥",0.75,"0.75","proporsi",16,"Jumlah anggota tim PPI yang sudah terlatih","Jumlah anggota Tim PPI"],["SPM-094","Komite Pencegahan dan Pengendalian Infeksi",21,2,"Tersedianya APD (Alat Pelindung Diri)","≥",0.6,"0.6","proporsi",16,"Jumlah instalasi yang menyediakan APD","Jumlah instalasi di rumah sakit"],["SPM-095","Komite Pencegahan dan Pengendalian Infeksi",21,3,"Kegiatan pencatatan dan pelaporan infeksi nosokomial di rumah sakit","≥",0.75,"0.75","proporsi",16,"Jumlah instalasi yang melakukan pencatatan dan pelaporan","Jumlah instalasi yang tersedia"],["SPM-096","Unit Surveilance",22,1,"Pelaksanaan Sistem Kewaspadaan Dini dan Respon (SKDR) Rumah Sakit","=",1,"1","nilai",null,"Jumlah laporan SKDR (Ewars ) yang terlaksana","Jumlah laporan SKDR (Ewars) yang wajib dikerjakan"],["SPM-097","Unit Surveilance",22,2,"Pelaksanaan Surveilans PD3I (Penyakit yang dapat dicegah dengan Imunisasi)","=",1,"1","nilai",null,"Jumlah laporan PD3I yang terlaksana","Jumlah laporan PD3I  yang wajib dikerjakan"],["SPM-098","Unit Surveilance",22,3,"Pelaksanaan Analisa SKDR DAN PD3I","=",1,"1","nilai",null,"Jumlah laporan analisa SKDR dan PD3I  yang terlaksana","Jumlah laporan analisa SKDR dan PD3I  yang wajib dikerjakan"]]$spm_seed$::jsonb)
),
seed AS (
  SELECT
    item->>0 AS code,
    item->>1 AS group_name,
    (item->>2)::integer AS group_order,
    (item->>3)::integer AS indicator_order,
    item->>4 AS title,
    item->>5 AS target_operator,
    NULLIF(item->>6,'')::numeric AS target_value,
    item->>7 AS target_text,
    item->>8 AS unit_of_measure,
    NULLIF(item->>9,'')::bigint AS owner_room_id,
    NULLIF(item->>10,'') AS numerator_definition,
    NULLIF(item->>11,'') AS denominator_definition
  FROM raw_seed
)
INSERT INTO aureka_quality.spm_indicators (
  profile_year,code,group_name,group_order,indicator_order,title,
  target_operator,target_value,target_text,unit_of_measure,
  numerator_definition,denominator_definition,owner_room_id,
  source_mode,source_config,calculation_config,is_active
)
SELECT
  2026,
  code,group_name,group_order,indicator_order,title,
  target_operator,target_value,target_text,
  CASE WHEN code IN ('SPM-019','SPM-022') THEN 'proporsi' ELSE unit_of_measure END,
  numerator_definition,denominator_definition,owner_room_id,
  CASE
    WHEN code='SPM-019' THEN 'quality_linked'
    WHEN code='SPM-022' THEN 'quality_denominator_linked'
    ELSE 'standalone'
  END,
  CASE
    WHEN code='SPM-019' THEN jsonb_build_object(
      'source_table','aureka_quality.quality_records',
      'source_indicator_codes',jsonb_build_array(
        '14.4','18.4','19.8','20.8','22.7','23.5','24.8','25.12','26.7','27.9','37.6'
      ),
      'source_room_ids',jsonb_build_array(14,18,19,20,22,23,24,25,26,27,37),
      'window_start_time','06:00',
      'window_end_time','14:00',
      'aggregation','weighted_ratio',
      'source_statuses',jsonb_build_array('ready','validated')
    )
    WHEN code='SPM-022' THEN jsonb_build_object(
      'source_table','aureka_quality.quality_records',
      'source_room_ids',jsonb_build_array(14,18,19,20,22,23,24,25,26,27,37),
      'source_measurement_grain','patient_episode',
      'source_statuses',jsonb_build_array('ready','validated'),
      'period_date_field','record_date',
      'manual_numerator_field','numerator',
      'numerator_definition','Jumlah pasien rawat inap dikurangi pasien jatuh yang berakibat kecacatan atau kematian'
    )
    ELSE '{}'::jsonb
  END,
  CASE
    WHEN code='SPM-019' THEN jsonb_build_object(
      'method','ratio','multiplier',1,'aggregation','weighted_ratio','result_unit','proporsi'
    )
    WHEN code='SPM-022' THEN jsonb_build_object(
      'method','no_event_rate','multiplier',1,'aggregation','derived_ratio','result_unit','proporsi'
    )
    WHEN lower(title) LIKE '%kepuasan%' OR lower(unit_of_measure)='persen' THEN jsonb_build_object(
      'method','score_to_percent','multiplier',100,'scale_max',4,'aggregation','weighted_mean','result_unit','persen'
    )
    WHEN lower(unit_of_measure) IN ('menit','jam','hari','minggu') THEN jsonb_build_object(
      'method','time_average','multiplier',1,'aggregation','weighted_mean','result_unit',unit_of_measure
    )
    WHEN denominator_definition IS NULL OR lower(btrim(denominator_definition)) IN ('tidak ada','-') THEN jsonb_build_object(
      'method','manual_value','multiplier',1,'aggregation','monthly_average','result_unit',COALESCE(unit_of_measure,'nilai')
    )
    ELSE jsonb_build_object(
      'method','ratio','multiplier',1,'aggregation','weighted_ratio','result_unit',COALESCE(unit_of_measure,'nilai')
    )
  END,
  true
FROM seed
ON CONFLICT (profile_year,code) DO NOTHING;

DO $assert_seed$
DECLARE
  v_count integer;
  v_linked integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM aureka_quality.spm_indicators
  WHERE profile_year=2026 AND is_active=true;
  SELECT count(*) INTO v_linked
  FROM aureka_quality.spm_indicators
  WHERE profile_year=2026 AND is_active=true
    AND source_mode IN ('quality_linked','quality_denominator_linked');
  IF v_count <> 98 OR v_linked <> 2 THEN
    RAISE EXCEPTION 'Seed SPM tidak sesuai kontrak: indikator aktif %, indikator tertaut %; diharapkan 98 dan 2.',v_count,v_linked;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aureka_quality.spm_indicators
    WHERE profile_year=2026 AND code='SPM-019'
      AND source_mode='quality_linked'
      AND source_config->>'window_start_time'='06:00'
      AND source_config->>'window_end_time'='14:00'
  ) THEN
    RAISE EXCEPTION 'Profil SPM Jam Visite belum menggunakan jendela 06:00–14:00.';
  END IF;
END;
$assert_seed$;

COMMIT;
