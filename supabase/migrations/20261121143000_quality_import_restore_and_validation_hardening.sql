BEGIN;

-- Strictly reject malformed/missing row_payload rather than allowing SQL NULL
-- three-valued logic to bypass the staging guard.
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
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
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
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR COALESCE(v_row->>'source_key','') !~ '^[a-f0-9]{64}$'
       OR COALESCE(length(btrim(v_row->>'source_sheet')),0) NOT BETWEEN 1 AND 120
       OR COALESCE(v_row->>'source_row','') !~ '^[1-9][0-9]*$'
       OR jsonb_typeof(v_row->'row_payload') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row->'row_payload'->'record_payload') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row->'row_payload'->'responses') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_row->'row_payload'->'responses')<1 THEN
      RAISE EXCEPTION 'Struktur baris staging tidak valid (sheet, nomor baris, source key, record payload, atau respons).'
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

-- An upsert must not erase a PIC's existing staff attributions when the uploaded
-- worksheet does not contain staff attribution columns.
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
    IF v_existing_record IS NOT NULL
       AND jsonb_typeof(v_attributions)='array'
       AND jsonb_array_length(v_attributions)=0 THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'staff_id',sta.staff_id,
        'field_key',sta.field_key,
        'attribution_type',sta.attribution_type
      ) ORDER BY sta.field_key,sta.staff_id),'[]'::jsonb)
      INTO v_attributions
      FROM aureka_quality.quality_record_staff_attributions sta
      WHERE sta.record_id=v_existing_record;
    END IF;

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

-- Verify every archived row and table checksum before a recovery. Restore the old
-- quality audit entries as well as the data snapshots; write one final RESTORE log.
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
  v_archived bigint;
  v_hash text;
  v_manifest_hash text;
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

  FOREACH v_table IN ARRAY v_order||ARRAY['audit_log'] LOOP
    SELECT row_count,rows_checksum INTO v_expected,v_manifest_hash
    FROM aureka_private.quality_domain_reset_table_manifest
    WHERE backup_id=p_backup_id AND table_name=v_table;
    IF NOT FOUND THEN RAISE EXCEPTION 'Manifest arsip % tidak ditemukan.',v_table USING ERRCODE='55000'; END IF;

    SELECT count(*),md5(COALESCE(string_agg(row_checksum,'' ORDER BY row_number),''))
      INTO v_archived,v_hash
    FROM aureka_private.quality_domain_reset_backup_rows
    WHERE backup_id=p_backup_id AND table_name=v_table
      AND row_checksum=md5(row_payload::text);

    IF v_archived<>v_expected OR COALESCE(v_hash,'')<>COALESCE(v_manifest_hash,'') THEN
      RAISE EXCEPTION 'Checksum arsip % tidak cocok; pemulihan dibatalkan.',v_table USING ERRCODE='55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM aureka_private.quality_domain_reset_backup_rows
      WHERE backup_id=p_backup_id AND table_name=v_table
        AND row_checksum<>md5(row_payload::text)
    ) THEN
      RAISE EXCEPTION 'Checksum per baris arsip % tidak cocok; pemulihan dibatalkan.',v_table USING ERRCODE='55000';
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY v_order LOOP
    EXECUTE format('SELECT count(*) FROM aureka_quality.%I',v_table) INTO v_expected;
    IF v_expected<>0 THEN
      RAISE EXCEPTION 'Pemulihan dibatalkan: tabel % sudah berisi % baris baru. Hapus/ekspor data baru terlebih dahulu.',v_table,v_expected USING ERRCODE='55000';
    END IF;
  END LOOP;

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

  INSERT INTO aureka_quality.audit_log(
    id,actor_id,action,table_name,record_id,before_json,after_json,created_at
  ) OVERRIDING SYSTEM VALUE
  SELECT
    (r.row_payload->>'id')::bigint,
    nullif(r.row_payload->>'actor_id','')::uuid,
    r.row_payload->>'action',
    r.row_payload->>'table_name',
    nullif(r.row_payload->>'record_id','')::uuid,
    r.row_payload->'before_json',
    r.row_payload->'after_json',
    (r.row_payload->>'created_at')::timestamptz
  FROM aureka_private.quality_domain_reset_backup_rows r
  WHERE r.backup_id=p_backup_id AND r.table_name='audit_log'
  ORDER BY r.row_number;

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

REVOKE ALL ON FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION aureka_private.run_quality_domain_reset(text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
