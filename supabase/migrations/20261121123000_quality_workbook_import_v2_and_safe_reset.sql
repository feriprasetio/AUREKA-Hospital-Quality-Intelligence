BEGIN;

-- Transactional Excel import staging. The staging payload may contain PHI and is
-- therefore inaccessible through direct Data API table grants; only guarded RPCs
-- can create, stage, validate, and commit a batch.
CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE RESTRICT,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  importer_key text NOT NULL CHECK (length(btrim(importer_key)) BETWEEN 1 AND 80),
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
  import_mode text NOT NULL CHECK (import_mode IN ('profiles_and_data','profiles_only','data_only')),
  data_mode text NOT NULL DEFAULT 'append' CHECK (data_mode IN ('append','upsert')),
  expected_rows integer NOT NULL DEFAULT 0 CHECK (expected_rows BETWEEN 0 AND 10000),
  profile_payload jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(profile_payload) = 'array'),
  status text NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','validated','committed','cancelled')),
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary_json) = 'object'),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  committed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE INDEX IF NOT EXISTS quality_import_batches_scope_idx
  ON aureka_quality.quality_import_batches(room_id, profile_year, created_at DESC);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_batch_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES aureka_quality.quality_import_batches(id) ON DELETE CASCADE,
  source_key text NOT NULL CHECK (source_key ~ '^[a-f0-9]{64}$'),
  source_sheet text NOT NULL CHECK (length(btrim(source_sheet)) BETWEEN 1 AND 120),
  source_row integer NOT NULL CHECK (source_row >= 1),
  row_payload jsonb NOT NULL CHECK (jsonb_typeof(row_payload) = 'object'),
  row_checksum text NOT NULL CHECK (row_checksum ~ '^[a-f0-9]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_key),
  UNIQUE (batch_id, source_sheet, source_row, source_key)
);

CREATE INDEX IF NOT EXISTS quality_import_batch_rows_batch_idx
  ON aureka_quality.quality_import_batch_rows(batch_id, source_row);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_batch_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES aureka_quality.quality_import_batches(id) ON DELETE CASCADE,
  source_sheet text,
  source_row integer,
  field_key text,
  error_code text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_batch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES aureka_quality.quality_import_batches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','rows_staged','validated','committed','cancelled')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A hashed source identity makes re-upload idempotent without storing a patient
-- identifier in the unique key. Upsert may update only editable logbook records.
CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_source_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE RESTRICT,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  importer_key text NOT NULL,
  source_key text NOT NULL CHECK (source_key ~ '^[a-f0-9]{64}$'),
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
  record_id uuid REFERENCES aureka_quality.quality_records(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL REFERENCES aureka_quality.quality_import_batches(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, profile_year, importer_key, source_key)
);

CREATE INDEX IF NOT EXISTS quality_import_source_rows_record_idx
  ON aureka_quality.quality_import_source_rows(record_id);

ALTER TABLE aureka_quality.quality_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_batch_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_batch_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_batch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_source_rows ENABLE ROW LEVEL SECURITY;

-- Stage rows contain workbook content, including possible identifiers. No direct
-- SELECT/INSERT/UPDATE grants are given to API roles; guarded RPCs are the only API.
REVOKE ALL ON TABLE aureka_quality.quality_import_batches FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE aureka_quality.quality_import_batch_rows FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE aureka_quality.quality_import_batch_errors FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE aureka_quality.quality_import_batch_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE aureka_quality.quality_import_source_rows FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION aureka_quality.create_quality_import_batch(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text,
  p_file_name text,
  p_file_sha256 text,
  p_import_mode text,
  p_data_mode text DEFAULT 'append',
  p_profiles jsonb DEFAULT '[]'::jsonb,
  p_expected_rows integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_batch uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook.' USING ERRCODE='28000'; END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP','PIC') THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan membuat impor logbook mutu.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses impor untuk unit yang dipilih tidak diberikan.' USING ERRCODE='42501';
  END IF;
  IF p_profile_year NOT BETWEEN 2000 AND 2100
     OR COALESCE(length(btrim(p_importer_key)),0) NOT BETWEEN 1 AND 80
     OR COALESCE(length(btrim(p_file_name)),0) NOT BETWEEN 1 AND 255
     OR COALESCE(p_file_sha256,'') !~ '^[a-f0-9]{64}$'
     OR p_import_mode NOT IN ('profiles_and_data','profiles_only','data_only')
     OR p_data_mode NOT IN ('append','upsert')
     OR p_expected_rows NOT BETWEEN 0 AND 10000
     OR p_profiles IS NULL OR jsonb_typeof(p_profiles) <> 'array' THEN
    RAISE EXCEPTION 'Metadata workbook tidak valid. Periksa unit, tahun, jenis impor, hash, dan jumlah baris.' USING ERRCODE='22023';
  END IF;
  IF p_import_mode IN ('profiles_and_data','profiles_only') THEN
    IF NOT aureka_system.is_superadmin() THEN
      RAISE EXCEPTION 'Impor dan sinkronisasi profil penuh hanya dapat dilakukan Superadmin.' USING ERRCODE='42501';
    END IF;
    IF jsonb_array_length(p_profiles) < 1 OR jsonb_array_length(p_profiles) > 500 THEN
      RAISE EXCEPTION 'Sheet Profil Indikator wajib berisi 1–500 profil valid.' USING ERRCODE='22023';
    END IF;
  ELSIF jsonb_array_length(p_profiles) <> 0 THEN
    RAISE EXCEPTION 'Mode data saja tidak menerima perubahan master profil.' USING ERRCODE='22023';
  END IF;
  IF p_import_mode='profiles_only' AND p_expected_rows<>0 THEN
    RAISE EXCEPTION 'Mode profil saja tidak boleh berisi baris logbook.' USING ERRCODE='22023';
  END IF;
  IF p_import_mode IN ('profiles_and_data','data_only') AND p_expected_rows<1 THEN
    RAISE EXCEPTION 'Tidak ada baris data yang disiapkan untuk diimpor.' USING ERRCODE='22023';
  END IF;

  INSERT INTO aureka_quality.quality_import_batches(
    room_id,profile_year,importer_key,file_name,file_sha256,import_mode,
    data_mode,expected_rows,profile_payload,created_by
  ) VALUES (
    p_room_id,p_profile_year,btrim(p_importer_key),btrim(p_file_name),lower(p_file_sha256),
    p_import_mode,p_data_mode,p_expected_rows,COALESCE(p_profiles,'[]'::jsonb),v_user
  ) RETURNING id INTO v_batch;

  INSERT INTO aureka_quality.quality_import_batch_events(batch_id,event_type,actor_id,detail)
  VALUES (v_batch,'created',v_user,jsonb_build_object(
    'room_id',p_room_id,'profile_year',p_profile_year,'import_mode',p_import_mode,
    'data_mode',p_data_mode,'expected_rows',p_expected_rows,
    'profile_count',jsonb_array_length(COALESCE(p_profiles,'[]'::jsonb))
  ));

  RETURN jsonb_build_object('success',true,'batch_id',v_batch,'status','staging');
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.stage_quality_import_batch_rows(
  p_batch_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_batch aureka_quality.quality_import_batches%ROWTYPE;
  v_row jsonb;
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Login diperlukan.' USING ERRCODE='28000'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
     OR jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>250 THEN
    RAISE EXCEPTION 'Setiap pengiriman staging harus berisi 1–250 baris.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_batch
  FROM aureka_quality.quality_import_batches
  WHERE id=p_batch_id AND created_by=v_user
  FOR UPDATE;
  IF NOT FOUND OR v_batch.status<>'staging' THEN
    RAISE EXCEPTION 'Batch impor tidak ditemukan, bukan milik akun ini, atau sudah dikunci.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(v_batch.room_id) THEN
    RAISE EXCEPTION 'Akses unit batch impor tidak lagi tersedia.' USING ERRCODE='42501';
  END IF;
  IF v_batch.import_mode='profiles_only' THEN
    RAISE EXCEPTION 'Batch profil saja tidak menerima baris logbook.' USING ERRCODE='22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row)<>'object'
       OR COALESCE(v_row->>'source_key','') !~ '^[a-f0-9]{64}$'
       OR COALESCE(length(btrim(v_row->>'source_sheet')),0) NOT BETWEEN 1 AND 120
       OR COALESCE(v_row->>'source_row','') !~ '^[1-9][0-9]*$'
       OR jsonb_typeof(v_row->'row_payload')<>'object' THEN
      RAISE EXCEPTION 'Struktur baris staging tidak valid (sheet, nomor baris, source key, atau payload).'
        USING ERRCODE='22023';
    END IF;

    INSERT INTO aureka_quality.quality_import_batch_rows(
      batch_id,source_key,source_sheet,source_row,row_payload,row_checksum
    ) VALUES (
      p_batch_id,lower(v_row->>'source_key'),btrim(v_row->>'source_sheet'),
      (v_row->>'source_row')::integer,v_row->'row_payload',
      md5((v_row->'row_payload')::text)
    );
    v_count := v_count+1;
  END LOOP;

  IF (SELECT count(*) FROM aureka_quality.quality_import_batch_rows WHERE batch_id=p_batch_id)
     > v_batch.expected_rows THEN
    RAISE EXCEPTION 'Jumlah baris staging melampaui jumlah baris yang diumumkan.' USING ERRCODE='22023';
  END IF;

  UPDATE aureka_quality.quality_import_batches
  SET updated_at=now(),summary_json=summary_json || jsonb_build_object(
    'staged_rows',(SELECT count(*) FROM aureka_quality.quality_import_batch_rows WHERE batch_id=p_batch_id)
  )
  WHERE id=p_batch_id;

  INSERT INTO aureka_quality.quality_import_batch_events(batch_id,event_type,actor_id,detail)
  VALUES (p_batch_id,'rows_staged',v_user,jsonb_build_object('added_rows',v_count));

  RETURN jsonb_build_object('success',true,'staged_count',v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.validate_quality_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_batch aureka_quality.quality_import_batches%ROWTYPE;
  v_staged integer := 0;
  v_profile jsonb;
  v_row jsonb;
  v_response jsonb;
  v_code text;
  v_grain text;
  v_errors integer := 0;
  v_missing integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Login diperlukan.' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_batch FROM aureka_quality.quality_import_batches
   WHERE id=p_batch_id AND created_by=v_user FOR UPDATE;
  IF NOT FOUND OR v_batch.status<>'staging' THEN
    RAISE EXCEPTION 'Batch impor tidak ditemukan atau tidak lagi berada pada tahap staging.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(v_batch.room_id) THEN
    RAISE EXCEPTION 'Akses unit batch impor tidak lagi tersedia.' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO v_staged
  FROM aureka_quality.quality_import_batch_rows WHERE batch_id=p_batch_id;
  IF v_staged<>v_batch.expected_rows THEN
    RAISE EXCEPTION 'Jumlah baris belum lengkap: diharapkan %, diterima %.',v_batch.expected_rows,v_staged USING ERRCODE='22023';
  END IF;

  IF v_batch.import_mode IN ('profiles_and_data','profiles_only') THEN
    IF NOT aureka_system.is_superadmin() THEN
      RAISE EXCEPTION 'Role Superadmin diperlukan untuk validasi sinkronisasi profil.' USING ERRCODE='42501';
    END IF;
    IF jsonb_array_length(v_batch.profile_payload)<1 THEN
      RAISE EXCEPTION 'Sheet profil tidak boleh kosong.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_batch.profile_payload) p
      WHERE jsonb_typeof(p)<>'object'
        OR COALESCE(length(btrim(p->>'code')),0)=0
        OR COALESCE(length(btrim(p->>'title')),0)=0
        OR COALESCE(p->>'room_id','') !~ '^[0-9]+$'
        OR (p->>'room_id')::bigint<>v_batch.room_id
        OR COALESCE(p->>'measurement_grain','') NOT IN ('patient_episode','provider_day','daily_metric','event','activity','aggregate')
        OR jsonb_typeof(p->'schema_json')<>'object'
        OR jsonb_typeof(p->'options_json')<>'array'
    ) THEN
      RAISE EXCEPTION 'Ada profil tidak lengkap: kode, judul, unit, grain, schema JSON, dan opsi JSON wajib valid.' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_batch.profile_payload))
       <> (SELECT count(DISTINCT upper(btrim(p->>'code'))) FROM jsonb_array_elements(v_batch.profile_payload) p) THEN
      RAISE EXCEPTION 'Kode indikator ganda ditemukan pada sheet Profil Indikator.' USING ERRCODE='23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_batch.profile_payload) p,
        LATERAL jsonb_array_elements(p->'options_json') o
      WHERE nullif(o->>'code','') IS NOT NULL
        AND (o->>'code') !~ '^[1-3]$'
    ) THEN
      RAISE EXCEPTION 'Kode opsi klasifikasi harus 1, 2, atau 3; perbaiki sheet Opsi Indikator.' USING ERRCODE='22023';
    END IF;
  END IF;

  IF v_batch.import_mode IN ('profiles_and_data','data_only') THEN
    FOR v_row IN
      SELECT row_payload FROM aureka_quality.quality_import_batch_rows
      WHERE batch_id=p_batch_id ORDER BY source_row,id
    LOOP
      IF jsonb_typeof(v_row->'record_payload')<>'object'
         OR jsonb_typeof(v_row->'responses')<>'array'
         OR jsonb_array_length(v_row->'responses')<1
         OR COALESCE(v_row->'record_payload'->>'room_id','') !~ '^[0-9]+$'
         OR (v_row->'record_payload'->>'room_id')::bigint<>v_batch.room_id
         OR COALESCE(v_row->'record_payload'->>'profile_year','') !~ '^[0-9]{4}$'
         OR (v_row->'record_payload'->>'profile_year')::integer<>v_batch.profile_year
         OR COALESCE(v_row->'record_payload'->>'measurement_grain','') NOT IN ('patient_episode','provider_day','daily_metric','event','activity','aggregate')
         OR COALESCE(v_row->'record_payload'->>'status','ready') NOT IN ('draft','ready','reopened') THEN
        v_errors:=v_errors+1;
        EXIT;
      END IF;

      FOR v_response IN SELECT value FROM jsonb_array_elements(v_row->'responses')
      LOOP
        v_code:=btrim(COALESCE(v_response->>'indicator_code',''));
        IF v_code='' THEN v_errors:=v_errors+1; EXIT; END IF;
        IF nullif(v_response->>'response_code','') IS NOT NULL
           AND (v_response->>'response_code') !~ '^[1-3]$' THEN
          v_errors:=v_errors+1; EXIT;
        END IF;

        IF v_batch.import_mode='profiles_and_data' THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_batch.profile_payload) p
            WHERE p->>'code'=v_code
              AND p->>'measurement_grain'=v_row->'record_payload'->>'measurement_grain'
          ) THEN
            v_errors:=v_errors+1; EXIT;
          END IF;
        ELSE
          IF NOT EXISTS (
            SELECT 1 FROM aureka_quality.indicator_profiles ip
            WHERE ip.room_id=v_batch.room_id AND ip.profile_year=v_batch.profile_year
              AND ip.code=v_code AND ip.is_active=true AND ip.status='published'
              AND ip.measurement_grain=v_row->'record_payload'->>'measurement_grain'
          ) THEN
            v_errors:=v_errors+1; EXIT;
          END IF;
        END IF;
      END LOOP;
      IF v_errors>0 THEN EXIT; END IF;
    END LOOP;

    IF v_errors>0 THEN
      RAISE EXCEPTION 'Validasi data gagal pada satu atau lebih baris: grain, respons, kode indikator, atau kode respons tidak sesuai profil.' USING ERRCODE='22023';
    END IF;

    IF v_batch.data_mode='append' AND EXISTS (
      SELECT 1
      FROM aureka_quality.quality_import_batch_rows br
      JOIN aureka_quality.quality_import_source_rows sr
        ON sr.room_id=v_batch.room_id AND sr.profile_year=v_batch.profile_year
       AND sr.importer_key=v_batch.importer_key AND sr.source_key=br.source_key
      WHERE br.batch_id=p_batch_id
    ) THEN
      RAISE EXCEPTION 'Sebagian baris sudah pernah diimpor. Gunakan mode Upsert hanya untuk memperbarui catatan yang belum tervalidasi.' USING ERRCODE='23505';
    END IF;

    IF v_batch.data_mode='upsert' AND EXISTS (
      SELECT 1
      FROM aureka_quality.quality_import_batch_rows br
      JOIN aureka_quality.quality_import_source_rows sr
        ON sr.room_id=v_batch.room_id AND sr.profile_year=v_batch.profile_year
       AND sr.importer_key=v_batch.importer_key AND sr.source_key=br.source_key
      JOIN aureka_quality.quality_records qr ON qr.id=sr.record_id
      WHERE br.batch_id=p_batch_id AND qr.status NOT IN ('draft','ready','reopened')
    ) THEN
      RAISE EXCEPTION 'Upsert ditolak karena setidaknya satu catatan sudah tervalidasi atau diarsipkan. Koreksi data sumber melalui proses revisi resmi.' USING ERRCODE='55000';
    END IF;
  END IF;

  UPDATE aureka_quality.quality_import_batches
  SET status='validated',updated_at=now(),
      summary_json=summary_json || jsonb_build_object(
        'staged_rows',v_staged,
        'profile_count',jsonb_array_length(profile_payload),
        'validated_at',now()
      )
  WHERE id=p_batch_id;

  INSERT INTO aureka_quality.quality_import_batch_events(batch_id,event_type,actor_id,detail)
  VALUES (p_batch_id,'validated',v_user,jsonb_build_object('rows',v_staged));

  RETURN jsonb_build_object('success',true,'batch_id',p_batch_id,'status','validated',
    'staged_rows',v_staged,'profile_count',jsonb_array_length(v_batch.profile_payload));
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.commit_quality_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '0'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_batch aureka_quality.quality_import_batches%ROWTYPE;
  v_row record;
  v_response jsonb;
  v_responses jsonb;
  v_attributions jsonb;
  v_record_payload jsonb;
  v_profile_id uuid;
  v_existing_record uuid;
  v_record_id uuid;
  v_source_found boolean;
  v_rows integer:=0;
  v_profile_result jsonb;
  v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Login diperlukan.' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_batch FROM aureka_quality.quality_import_batches
   WHERE id=p_batch_id AND created_by=v_user FOR UPDATE;
  IF NOT FOUND OR v_batch.status<>'validated' THEN
    RAISE EXCEPTION 'Batch belum lolos validasi atau bukan milik akun ini.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(v_batch.room_id) THEN
    RAISE EXCEPTION 'Akses unit batch impor tidak lagi tersedia.' USING ERRCODE='42501';
  END IF;
  IF v_batch.import_mode IN ('profiles_and_data','profiles_only') THEN
    IF NOT aureka_system.is_superadmin() THEN
      RAISE EXCEPTION 'Superadmin diperlukan untuk menerapkan profil indikator.' USING ERRCODE='42501';
    END IF;
    v_profile_result:=aureka_quality.replace_indicator_profile_set(
      v_batch.profile_year,v_batch.room_id,v_batch.profile_payload
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'aureka_quality.workbook_import:'||v_batch.room_id::text||':'||v_batch.profile_year::text,0
  ));

  FOR v_row IN
    SELECT br.* FROM aureka_quality.quality_import_batch_rows br
    WHERE br.batch_id=p_batch_id ORDER BY br.source_row,br.id
  LOOP
    v_existing_record:=NULL;
    v_source_found:=false;
    SELECT sr.record_id INTO v_existing_record
      FROM aureka_quality.quality_import_source_rows sr
     WHERE sr.room_id=v_batch.room_id AND sr.profile_year=v_batch.profile_year
       AND sr.importer_key=v_batch.importer_key AND sr.source_key=v_row.source_key
     FOR UPDATE;
    v_source_found:=FOUND;

    IF v_source_found AND v_batch.data_mode='append' THEN
      RAISE EXCEPTION 'Duplikasi source key ditemukan saat commit. Tidak ada bagian batch yang disimpan.' USING ERRCODE='23505';
    END IF;
    IF v_source_found AND v_existing_record IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM aureka_quality.quality_records qr
        WHERE qr.id=v_existing_record AND qr.room_id=v_batch.room_id
          AND qr.status IN ('draft','ready','reopened')
      ) THEN
        RAISE EXCEPTION 'Upsert hanya diizinkan untuk catatan draft/ready/reopened. Catatan tervalidasi/arsip tidak dapat ditimpa.' USING ERRCODE='55000';
      END IF;
    END IF;

    v_record_payload:=v_row.row_payload->'record_payload';
    v_record_payload:=v_record_payload || jsonb_build_object(
      'room_id',v_batch.room_id,'profile_year',v_batch.profile_year
    );
    v_responses:='[]'::jsonb;

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_row.row_payload->'responses')
    LOOP
      v_code:=btrim(COALESCE(v_response->>'indicator_code',''));
      SELECT ip.id INTO v_profile_id
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.room_id=v_batch.room_id AND ip.profile_year=v_batch.profile_year
         AND ip.code=v_code AND ip.is_active=true AND ip.status='published'
       ORDER BY ip.version DESC,ip.updated_at DESC,ip.created_at DESC
       LIMIT 1;
      IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Profil indikator % tidak aktif/tidak ditemukan saat commit. Seluruh batch dibatalkan.',v_code USING ERRCODE='23503';
      END IF;
      v_responses:=v_responses || jsonb_build_array(
        (v_response - 'indicator_code') || jsonb_build_object('indicator_id',v_profile_id)
      );
    END LOOP;

    v_attributions:=COALESCE(v_row.row_payload->'attributions','[]'::jsonb);
    v_record_id:=aureka_quality.save_quality_logbook(
      v_existing_record,v_record_payload,v_responses,v_attributions
    );

    IF v_source_found THEN
      UPDATE aureka_quality.quality_import_source_rows
         SET record_id=v_record_id,batch_id=p_batch_id,
             source_sheet=v_row.source_sheet,source_row=v_row.source_row,
             file_sha256=v_batch.file_sha256,updated_at=now()
       WHERE room_id=v_batch.room_id AND profile_year=v_batch.profile_year
         AND importer_key=v_batch.importer_key AND source_key=v_row.source_key;
    ELSE
      INSERT INTO aureka_quality.quality_import_source_rows(
        room_id,profile_year,importer_key,source_key,source_sheet,source_row,
        file_sha256,record_id,batch_id
      ) VALUES (
        v_batch.room_id,v_batch.profile_year,v_batch.importer_key,v_row.source_key,
        v_row.source_sheet,v_row.source_row,v_batch.file_sha256,v_record_id,p_batch_id
      );
    END IF;
    v_rows:=v_rows+1;
  END LOOP;

  UPDATE aureka_quality.quality_import_batches
  SET status='committed',committed_by=v_user,committed_at=now(),updated_at=now(),
      summary_json=summary_json || jsonb_build_object(
        'committed_rows',v_rows,'committed_at',now(),
        'profile_result',COALESCE(v_profile_result,'{}'::jsonb)
      )
  WHERE id=p_batch_id;

  INSERT INTO aureka_quality.quality_import_batch_events(batch_id,event_type,actor_id,detail)
  VALUES (p_batch_id,'committed',v_user,jsonb_build_object(
    'rows',v_rows,'profiles',jsonb_array_length(v_batch.profile_payload),
    'data_mode',v_batch.data_mode
  ));

  RETURN jsonb_build_object('success',true,'batch_id',p_batch_id,'status','committed',
    'imported_rows',v_rows,'profile_count',jsonb_array_length(v_batch.profile_payload),
    'profile_result',COALESCE(v_profile_result,'{}'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.cancel_quality_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid(); v_batch aureka_quality.quality_import_batches%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Login diperlukan.' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_batch FROM aureka_quality.quality_import_batches
  WHERE id=p_batch_id AND created_by=v_user FOR UPDATE;
  IF NOT FOUND OR v_batch.status NOT IN ('staging','validated') THEN
    RAISE EXCEPTION 'Batch tidak ditemukan atau sudah diproses.' USING ERRCODE='42501';
  END IF;
  UPDATE aureka_quality.quality_import_batches SET status='cancelled',updated_at=now()
  WHERE id=p_batch_id;
  INSERT INTO aureka_quality.quality_import_batch_events(batch_id,event_type,actor_id,detail)
  VALUES (p_batch_id,'cancelled',v_user,jsonb_build_object('reason','Cancelled by owner'));
  RETURN jsonb_build_object('success',true,'status','cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.create_quality_import_batch(bigint,integer,text,text,text,text,text,jsonb,integer) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION aureka_quality.stage_quality_import_batch_rows(uuid,jsonb) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION aureka_quality.validate_quality_import_batch(uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION aureka_quality.commit_quality_import_batch(uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION aureka_quality.cancel_quality_import_batch(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.create_quality_import_batch(bigint,integer,text,text,text,text,text,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.stage_quality_import_batch_rows(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.validate_quality_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.commit_quality_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.cancel_quality_import_batch(uuid) TO authenticated;

COMMENT ON TABLE aureka_quality.quality_import_batches IS
'Transactional Excel workbook imports. Stores workbook metadata and profile configuration; source data remains inaccessible through direct Data API table access and is committed only through guarded RPCs.';
COMMENT ON TABLE aureka_quality.quality_import_batch_rows IS
'Private-to-RPC staging rows for workbook logbooks. May contain sensitive clinical data; no direct API table grants are given.';
COMMENT ON TABLE aureka_quality.quality_import_source_rows IS
'Hashed row provenance keys for idempotent workbook imports and safe re-import of editable logbook records.';
COMMENT ON FUNCTION aureka_quality.commit_quality_import_batch(uuid) IS
'Atomically applies an already validated workbook batch. Profile replacement and logbook rows share one database transaction; any row failure rolls back the entire batch.';

-- Private reset archive: the schema is not included in PostgREST exposed schemas,
-- and no API role has schema/table/function privileges. Snapshots are row-level,
-- checksummed, and restorable without exposing PHI to the client.
CREATE SCHEMA IF NOT EXISTS aureka_private;
REVOKE ALL ON SCHEMA aureka_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS aureka_private.quality_domain_reset_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('backing_up','committed','restored')),
  confirmation_label text NOT NULL,
  executed_as text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_rows bigint NOT NULL DEFAULT 0,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS aureka_private.quality_domain_reset_table_manifest (
  backup_id uuid NOT NULL REFERENCES aureka_private.quality_domain_reset_runs(id) ON DELETE RESTRICT,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  rows_checksum text NOT NULL,
  PRIMARY KEY (backup_id,table_name)
);

CREATE TABLE IF NOT EXISTS aureka_private.quality_domain_reset_backup_rows (
  backup_id uuid NOT NULL REFERENCES aureka_private.quality_domain_reset_runs(id) ON DELETE RESTRICT,
  table_name text NOT NULL,
  row_number bigint NOT NULL,
  row_key text NOT NULL,
  row_payload jsonb NOT NULL,
  row_checksum text NOT NULL,
  PRIMARY KEY (backup_id,table_name,row_number)
);

REVOKE ALL ON ALL TABLES IN SCHEMA aureka_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aureka_private FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION aureka_private.run_quality_domain_reset(p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_backup uuid;
  v_table text;
  v_count bigint;
  v_hash text;
  v_total bigint:=0;
  v_manifest jsonb:='{}'::jsonb;
  v_audit_names text[]:=ARRAY[
    'aureka_quality.indicator_profiles',
    'aureka_quality.quality_records',
    'aureka_quality.quality_record_responses',
    'aureka_quality.quality_record_staff_attributions',
    'aureka_quality.quality_excel_header_mappings',
    'aureka_quality.quality_excel_mapping_audit',
    'aureka_quality.quality_excel_profile_audit',
    'aureka_quality.quality_import_batches',
    'aureka_quality.quality_import_batch_rows',
    'aureka_quality.quality_import_batch_errors',
    'aureka_quality.quality_import_batch_events',
    'aureka_quality.quality_import_source_rows',
    'aureka_quality.quality_import_mappings',
    'aureka_quality.quality_import_mapping_audit',
    'aureka_quality.quality_reconciliation_audit',
    'aureka_quality.quality_reconciliation_warning_reviews',
    'aureka_quality.quality_monthly_reviews',
    'aureka_quality.oppe_indicator_rules'
  ];
  v_tables text[]:=ARRAY[
    'quality_import_batch_errors',
    'quality_import_batch_rows',
    'quality_import_batch_events',
    'quality_import_source_rows',
    'quality_reconciliation_warning_reviews',
    'quality_reconciliation_audit',
    'quality_record_staff_attributions',
    'quality_record_responses',
    'quality_records',
    'quality_monthly_reviews',
    'quality_excel_profile_audit',
    'quality_excel_mapping_audit',
    'quality_excel_header_mappings',
    'quality_import_mappings',
    'quality_import_mapping_audit',
    'oppe_indicator_rules',
    'indicator_profiles',
    'quality_import_batches'
  ];
  v_fk_unknown text;
  v_linked_proposals bigint;
BEGIN
  IF current_user<>'postgres' THEN
    RAISE EXCEPTION 'Fungsi reset hanya dapat dijalankan melalui koneksi database administrator.' USING ERRCODE='42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'RESET-INDIKATOR-MUTU-AND-PROFIL-ALL-ROOMS' THEN
    RAISE EXCEPTION 'Konfirmasi reset tidak cocok. Tidak ada data yang diubah.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aureka_quality.domain_reset',0));

  SELECT count(*) INTO v_linked_proposals
  FROM aureka_governance.indicator_proposals
  WHERE activated_profile_id IS NOT NULL;
  IF v_linked_proposals>0 THEN
    RAISE EXCEPTION 'Reset dihentikan: terdapat % proposal indikator yang masih terhubung ke profil. Riwayat proposal harus diputus secara administratif terlebih dahulu.',v_linked_proposals
      USING ERRCODE='55000';
  END IF;

  SELECT string_agg(con.conrelid::regclass::text||' ('||con.conname||')',', ')
    INTO v_fk_unknown
  FROM pg_constraint con
  WHERE con.contype='f'
    AND (
      con.confrelid='aureka_quality.indicator_profiles'::regclass
      AND con.conrelid NOT IN (
        'aureka_governance.indicator_proposals'::regclass,
        'aureka_quality.oppe_indicator_rules'::regclass,
        'aureka_quality.quality_excel_profile_audit'::regclass,
        'aureka_quality.quality_reconciliation_audit'::regclass,
        'aureka_quality.quality_record_responses'::regclass
      )
      OR con.confrelid='aureka_quality.quality_records'::regclass
      AND con.conrelid NOT IN (
        'aureka_quality.clinical_death_audits'::regclass,
        'aureka_quality.clinical_pathway_audits'::regclass,
        'aureka_quality.igd_consultation_audits'::regclass,
        'aureka_quality.quality_reconciliation_audit'::regclass,
        'aureka_quality.quality_reconciliation_warning_reviews'::regclass,
        'aureka_quality.quality_record_responses'::regclass,
        'aureka_quality.quality_record_staff_attributions'::regclass,
        'aureka_system.education_participants'::regclass,
        'aureka_quality.quality_import_source_rows'::regclass
      )
      OR con.confrelid='aureka_quality.quality_record_responses'::regclass
      AND con.conrelid NOT IN ('aureka_quality.quality_reconciliation_audit'::regclass)
    );
  IF v_fk_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Reset dihentikan karena ditemukan foreign key di luar daftar dependensi yang telah diaudit: %',v_fk_unknown USING ERRCODE='55000';
  END IF;

  LOCK TABLE
    aureka_quality.quality_import_batches,
    aureka_quality.quality_import_batch_rows,
    aureka_quality.quality_import_batch_errors,
    aureka_quality.quality_import_batch_events,
    aureka_quality.quality_import_source_rows,
    aureka_quality.quality_reconciliation_warning_reviews,
    aureka_quality.quality_reconciliation_audit,
    aureka_quality.quality_record_staff_attributions,
    aureka_quality.quality_record_responses,
    aureka_quality.quality_records,
    aureka_quality.quality_monthly_reviews,
    aureka_quality.quality_excel_profile_audit,
    aureka_quality.quality_excel_mapping_audit,
    aureka_quality.quality_excel_header_mappings,
    aureka_quality.quality_import_mappings,
    aureka_quality.quality_import_mapping_audit,
    aureka_quality.oppe_indicator_rules,
    aureka_quality.indicator_profiles,
    aureka_quality.audit_log
  IN ACCESS EXCLUSIVE MODE;

  INSERT INTO aureka_private.quality_domain_reset_runs(
    status,confirmation_label,executed_as
  ) VALUES ('backing_up',p_confirmation,current_user) RETURNING id INTO v_backup;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'INSERT INTO aureka_private.quality_domain_reset_backup_rows(backup_id,table_name,row_number,row_key,row_payload,row_checksum)
       SELECT $1,$2,row_number() OVER (ORDER BY t.id::text),t.id::text,to_jsonb(t),md5(to_jsonb(t)::text)
       FROM aureka_quality.%I t',
      v_table
    ) USING v_backup,v_table;

    EXECUTE format(
      'SELECT count(*),md5(COALESCE(string_agg(row_checksum, '''' ORDER BY row_number),'''')) 
       FROM aureka_private.quality_domain_reset_backup_rows
       WHERE backup_id=$1 AND table_name=$2'
    ) INTO v_count,v_hash USING v_backup,v_table;

    INSERT INTO aureka_private.quality_domain_reset_table_manifest(backup_id,table_name,row_count,rows_checksum)
    VALUES (v_backup,v_table,v_count,COALESCE(v_hash,md5('')));
    v_total:=v_total+v_count;
    v_manifest:=v_manifest || jsonb_build_object(v_table,v_count);
  END LOOP;

  -- The quality audit log stores full before/after JSON, including PHI. Preserve
  -- only rows belonging to the reset domain in the private backup, then clear those
  -- entries after delete triggers have emitted their own records.
  INSERT INTO aureka_private.quality_domain_reset_backup_rows(
    backup_id,table_name,row_number,row_key,row_payload,row_checksum
  )
  SELECT v_backup,'audit_log',row_number() OVER (ORDER BY a.id),a.id::text,to_jsonb(a),md5(to_jsonb(a)::text)
  FROM aureka_quality.audit_log a
  WHERE a.table_name=ANY(v_audit_names);

  SELECT count(*),md5(COALESCE(string_agg(row_checksum, '' ORDER BY row_number),'')) 
    INTO v_count,v_hash
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=v_backup AND table_name='audit_log';
  INSERT INTO aureka_private.quality_domain_reset_table_manifest(backup_id,table_name,row_count,rows_checksum)
  VALUES (v_backup,'audit_log',v_count,COALESCE(v_hash,md5('')));
  v_total:=v_total+v_count;
  v_manifest:=v_manifest || jsonb_build_object('aureka_quality.audit_log (indicator domain)',v_count);

  -- Delete only the reviewed quality-indicator domain. Patient index, clinical
  -- audit tables, education participants, OPPE assessments/events, proposals,
  -- risk/SPM and all other modules are intentionally preserved.
  DELETE FROM aureka_quality.quality_import_batch_errors;
  DELETE FROM aureka_quality.quality_import_batch_rows;
  DELETE FROM aureka_quality.quality_import_batch_events;
  DELETE FROM aureka_quality.quality_import_source_rows;
  DELETE FROM aureka_quality.quality_reconciliation_warning_reviews;
  DELETE FROM aureka_quality.quality_reconciliation_audit;
  DELETE FROM aureka_quality.quality_record_staff_attributions;
  DELETE FROM aureka_quality.quality_record_responses;
  DELETE FROM aureka_quality.quality_records;
  DELETE FROM aureka_quality.quality_monthly_reviews;
  DELETE FROM aureka_quality.quality_excel_profile_audit;
  DELETE FROM aureka_quality.quality_excel_mapping_audit;
  DELETE FROM aureka_quality.quality_excel_header_mappings;
  DELETE FROM aureka_quality.quality_import_mappings;
  DELETE FROM aureka_quality.quality_import_mapping_audit;
  DELETE FROM aureka_quality.oppe_indicator_rules;
  DELETE FROM aureka_quality.indicator_profiles;
  DELETE FROM aureka_quality.quality_import_batches;

  DELETE FROM aureka_quality.audit_log WHERE table_name=ANY(v_audit_names);

  -- Fail closed if any table in the declared reset set retains data.
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FROM aureka_quality.%I',v_table) INTO v_count;
    IF v_count<>0 THEN
      RAISE EXCEPTION 'Verifikasi reset gagal: % masih berisi % baris. Seluruh transaksi dibatalkan.',v_table,v_count USING ERRCODE='55000';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM aureka_quality.audit_log WHERE table_name=ANY(v_audit_names)
  ) THEN
    RAISE EXCEPTION 'Verifikasi reset log audit mutu gagal. Seluruh transaksi dibatalkan.' USING ERRCODE='55000';
  END IF;

  UPDATE aureka_private.quality_domain_reset_runs
  SET status='committed',completed_at=now(),total_rows=v_total,
      summary_json=jsonb_build_object(
        'deleted_table_rows',v_manifest,
        'profile_proposal_links_preserved',v_linked_proposals,
        'patient_index_preserved',true,
        'clinical_and_education_audits_preserved',true,
        'oppe_assessments_and_events_preserved',true,
        'proposals_preserved',true
      )
  WHERE id=v_backup;

  RETURN jsonb_build_object('success',true,'backup_id',v_backup,'status','committed',
    'archived_rows',v_total,'tables',v_manifest);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_private.restore_quality_domain_backup(
  p_backup_id uuid,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_table text;
  v_expected bigint;
  v_inserted bigint;
  v_order text[]:=ARRAY[
    'indicator_profiles',
    'quality_records',
    'quality_import_batches',
    'quality_record_responses',
    'quality_record_staff_attributions',
    'quality_import_batch_rows',
    'quality_import_batch_errors',
    'quality_import_batch_events',
    'quality_import_source_rows',
    'quality_excel_header_mappings',
    'quality_excel_mapping_audit',
    'quality_excel_profile_audit',
    'quality_import_mappings',
    'quality_import_mapping_audit',
    'quality_monthly_reviews',
    'quality_reconciliation_warning_reviews',
    'quality_reconciliation_audit',
    'oppe_indicator_rules'
  ];
BEGIN
  IF current_user<>'postgres' THEN
    RAISE EXCEPTION 'Pemulihan snapshot hanya dapat dijalankan melalui koneksi database administrator.' USING ERRCODE='42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'RESTORE-QUALITY-DOMAIN-BACKUP' THEN
    RAISE EXCEPTION 'Konfirmasi pemulihan tidak cocok.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aureka_private.quality_domain_reset_runs
    WHERE id=p_backup_id AND status='committed'
  ) THEN RAISE EXCEPTION 'Snapshot reset tidak ditemukan atau sudah dipulihkan.' USING ERRCODE='22023'; END IF;

  LOCK TABLE
    aureka_quality.quality_import_batches,
    aureka_quality.quality_import_batch_rows,
    aureka_quality.quality_import_batch_errors,
    aureka_quality.quality_import_batch_events,
    aureka_quality.quality_import_source_rows,
    aureka_quality.quality_reconciliation_warning_reviews,
    aureka_quality.quality_reconciliation_audit,
    aureka_quality.quality_record_staff_attributions,
    aureka_quality.quality_record_responses,
    aureka_quality.quality_records,
    aureka_quality.quality_monthly_reviews,
    aureka_quality.quality_excel_profile_audit,
    aureka_quality.quality_excel_mapping_audit,
    aureka_quality.quality_excel_header_mappings,
    aureka_quality.quality_import_mappings,
    aureka_quality.quality_import_mapping_audit,
    aureka_quality.oppe_indicator_rules,
    aureka_quality.indicator_profiles,
    aureka_quality.audit_log
  IN ACCESS EXCLUSIVE MODE;

  FOREACH v_table IN ARRAY v_order LOOP
    EXECUTE format('SELECT count(*) FROM aureka_quality.%I',v_table) INTO v_expected;
    IF v_expected<>0 THEN
      RAISE EXCEPTION 'Pemulihan dibatalkan: tabel % sudah berisi % baris baru. Hapus/ekspor data baru terlebih dahulu.',v_table,v_expected USING ERRCODE='55000';
    END IF;
  END LOOP;

  -- Suppress domain audit/patient-index write triggers while reconstructing the
  -- exact snapshot; these records already have their original audit history.
  ALTER TABLE aureka_quality.quality_records DISABLE TRIGGER USER;
  FOREACH v_table IN ARRAY v_order LOOP
    SELECT row_count INTO v_expected
    FROM aureka_private.quality_domain_reset_table_manifest
    WHERE backup_id=p_backup_id AND table_name=v_table;

    EXECUTE format(
      'INSERT INTO aureka_quality.%I
       SELECT (jsonb_populate_record(NULL::aureka_quality.%I,b.row_payload)).*
       FROM aureka_private.quality_domain_reset_backup_rows b
       WHERE b.backup_id=$1 AND b.table_name=$2 ORDER BY b.row_number',
      v_table,v_table
    ) USING p_backup_id,v_table;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted<>COALESCE(v_expected,0) THEN
      RAISE EXCEPTION 'Jumlah baris pemulihan % tidak sesuai: % dari %.',v_table,v_inserted,COALESCE(v_expected,0) USING ERRCODE='55000';
    END IF;
  END LOOP;
  ALTER TABLE aureka_quality.quality_records ENABLE TRIGGER USER;

  DELETE FROM aureka_quality.audit_log WHERE table_name=ANY(ARRAY[
    'aureka_quality.indicator_profiles','aureka_quality.quality_records',
    'aureka_quality.quality_record_responses','aureka_quality.quality_record_staff_attributions',
    'aureka_quality.quality_excel_header_mappings','aureka_quality.quality_excel_mapping_audit',
    'aureka_quality.quality_excel_profile_audit','aureka_quality.quality_import_batches',
    'aureka_quality.quality_import_batch_rows','aureka_quality.quality_import_batch_errors',
    'aureka_quality.quality_import_batch_events','aureka_quality.quality_import_source_rows',
    'aureka_quality.quality_import_mappings','aureka_quality.quality_import_mapping_audit',
    'aureka_quality.quality_reconciliation_audit','aureka_quality.quality_reconciliation_warning_reviews',
    'aureka_quality.quality_monthly_reviews','aureka_quality.oppe_indicator_rules'
  ]);
  INSERT INTO aureka_quality.audit_log(actor_id,action,table_name,record_id,before_json,after_json)
  SELECT NULL,'RESTORE','aureka_quality.quality_domain_reset',p_backup_id,
    jsonb_build_object('backup_id',p_backup_id,'restored_at',now()),
    jsonb_build_object('restored_rows',total_rows)
  FROM aureka_private.quality_domain_reset_runs WHERE id=p_backup_id;

  UPDATE aureka_private.quality_domain_reset_runs SET status='restored',completed_at=now()
  WHERE id=p_backup_id;

  RETURN jsonb_build_object('success',true,'backup_id',p_backup_id,'status','restored');
END;
$function$;

REVOKE ALL ON ALL TABLES IN SCHEMA aureka_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aureka_private FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON SCHEMA aureka_private IS
'Non-API private administrative schema. Contains encrypted-at-rest database backups of sensitive AUREKA quality-indicator reset operations; accessible only to database administrators.';

COMMIT;
