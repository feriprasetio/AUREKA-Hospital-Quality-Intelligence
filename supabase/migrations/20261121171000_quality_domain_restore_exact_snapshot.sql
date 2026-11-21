BEGIN;

CREATE INDEX IF NOT EXISTS quality_domain_reset_backup_lookup_idx
ON aureka_private.quality_domain_reset_backup_rows(backup_id,table_name,row_key);

CREATE OR REPLACE FUNCTION aureka_private.verify_quality_domain_restore(p_backup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SET statement_timeout = '0'
AS $function$
DECLARE
  v_table text;
  v_expected bigint;
  v_backup_count bigint;
  v_live_count bigint;
  v_matched_count bigint;
  v_mismatches bigint;
  v_report jsonb:='[]'::jsonb;
  v_tables text[]:=ARRAY[
    'quality_import_batch_errors','quality_import_batch_rows','quality_import_batch_events',
    'quality_import_source_rows','quality_reconciliation_warning_reviews',
    'quality_reconciliation_audit','quality_record_staff_attributions',
    'quality_record_responses','quality_records','quality_monthly_reviews',
    'quality_excel_profile_audit','quality_excel_mapping_audit',
    'quality_excel_header_mappings','quality_import_mappings',
    'quality_import_mapping_audit','oppe_indicator_rules','indicator_profiles',
    'quality_import_batches','audit_log'
  ];
BEGIN
  IF current_user<>'postgres' THEN
    RAISE EXCEPTION 'Verifikasi restore hanya dapat dijalankan melalui koneksi database administrator.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aureka_private.quality_domain_reset_runs
    WHERE id=p_backup_id AND status='committed'
  ) THEN
    RAISE EXCEPTION 'Snapshot tidak ditemukan atau status arsip tidak sesuai.' USING ERRCODE='55000';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT row_count INTO v_expected
    FROM aureka_private.quality_domain_reset_table_manifest
    WHERE backup_id=p_backup_id AND table_name=v_table;
    IF NOT FOUND THEN RAISE EXCEPTION 'Manifest tabel % tidak ditemukan.',v_table USING ERRCODE='55000'; END IF;

    SELECT count(*) INTO v_backup_count
    FROM aureka_private.quality_domain_reset_backup_rows
    WHERE backup_id=p_backup_id AND table_name=v_table
      AND row_checksum=md5(row_payload::text);
    IF v_backup_count<>v_expected THEN
      RAISE EXCEPTION 'Jumlah/checksum arsip baris % tidak valid: % dari %.',v_table,v_backup_count,v_expected USING ERRCODE='55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM aureka_private.quality_domain_reset_backup_rows
      WHERE backup_id=p_backup_id AND table_name=v_table
        AND row_checksum<>md5(row_payload::text)
    ) THEN RAISE EXCEPTION 'Checksum baris arsip % rusak.',v_table USING ERRCODE='55000'; END IF;

    EXECUTE format('SELECT count(*) FROM aureka_quality.%I',v_table) INTO v_live_count;
    EXECUTE format(
      'SELECT count(t.id),count(*) FILTER (WHERE t.id IS NULL OR to_jsonb(t) IS DISTINCT FROM b.row_payload)
       FROM aureka_private.quality_domain_reset_backup_rows b
       LEFT JOIN aureka_quality.%I t ON t.id::text=b.row_key
       WHERE b.backup_id=$1 AND b.table_name=$2',
      v_table
    ) INTO v_matched_count,v_mismatches USING p_backup_id,v_table;

    IF v_live_count<>v_expected OR v_matched_count<>v_expected OR v_mismatches<>0 THEN
      RAISE EXCEPTION 'Verifikasi % gagal. Arsip %, live %, ID cocok %, perbedaan %.',
        v_table,v_expected,v_live_count,v_matched_count,v_mismatches USING ERRCODE='55000';
    END IF;
    v_report:=v_report||jsonb_build_array(jsonb_build_object('table',v_table,'rows',v_live_count,'checksum_match',true));
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='aureka_quality.audit_log'::regclass
      AND conname='audit_log_actor_id_fkey' AND convalidated
  ) THEN RAISE EXCEPTION 'FK audit_log_actor_id_fkey belum aktif/tervalidasi.' USING ERRCODE='55000'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='aureka_quality.quality_records'::regclass
      AND NOT tgisinternal AND tgenabled='D'
  ) THEN RAISE EXCEPTION 'Masih ada trigger quality_records yang dinonaktifkan.' USING ERRCODE='55000'; END IF;

  UPDATE aureka_private.quality_domain_reset_runs
  SET status='restored',completed_at=now(),
      summary_json=summary_json||jsonb_build_object(
        'restore_verified',true,'restore_verified_at',now(),'restored_tables',v_report,
        'audit_actor_fk_validated',true,
        'patient_index_rows',(SELECT count(*) FROM aureka_quality.patient_index)
      )
  WHERE id=p_backup_id;

  RETURN jsonb_build_object('success',true,'backup_id',p_backup_id,
    'status','restored','verified_tables',jsonb_array_length(v_report),'tables',v_report);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_private.restore_quality_domain_backup(
  p_backup_id uuid,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SET statement_timeout = '0'
AS $function$
DECLARE
  v_user text:=current_user;
  v_count bigint;
  v_expected bigint;
  v_actor_missing bigint;
BEGIN
  IF v_user<>'postgres' THEN
    RAISE EXCEPTION 'Pemulihan snapshot hanya dapat dijalankan melalui koneksi database administrator.' USING ERRCODE='42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'RESTORE-QUALITY-DOMAIN-BACKUP' THEN
    RAISE EXCEPTION 'Konfirmasi pemulihan tidak cocok.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aureka_private.quality_domain_reset_runs
    WHERE id=p_backup_id AND status='committed'
  ) THEN RAISE EXCEPTION 'Snapshot reset tidak ditemukan atau sudah dipulihkan.' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aureka_quality.domain_reset',0));
  LOCK TABLE
    aureka_quality.quality_import_batches,aureka_quality.quality_import_batch_rows,
    aureka_quality.quality_import_batch_errors,aureka_quality.quality_import_batch_events,
    aureka_quality.quality_import_source_rows,aureka_quality.quality_reconciliation_warning_reviews,
    aureka_quality.quality_reconciliation_audit,aureka_quality.quality_record_staff_attributions,
    aureka_quality.quality_record_responses,aureka_quality.quality_records,
    aureka_quality.quality_monthly_reviews,aureka_quality.quality_excel_profile_audit,
    aureka_quality.quality_excel_mapping_audit,aureka_quality.quality_excel_header_mappings,
    aureka_quality.quality_import_mappings,aureka_quality.quality_import_mapping_audit,
    aureka_quality.oppe_indicator_rules,aureka_quality.indicator_profiles,aureka_quality.audit_log
  IN ACCESS EXCLUSIVE MODE;

  -- Confirm archive completeness and row hashes before writing any live row.
  FOR v_expected IN
    SELECT count(*) FROM aureka_private.quality_domain_reset_table_manifest
    WHERE backup_id=p_backup_id
  LOOP
    NULL;
  END LOOP;
  IF (SELECT count(*) FROM aureka_private.quality_domain_reset_table_manifest WHERE backup_id=p_backup_id)<>19 THEN
    RAISE EXCEPTION 'Manifest snapshot tidak lengkap; pemulihan dihentikan.' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM aureka_private.quality_domain_reset_backup_rows
    WHERE backup_id=p_backup_id AND row_checksum<>md5(row_payload::text)
  ) THEN RAISE EXCEPTION 'Checksum arsip tidak cocok; pemulihan dihentikan.' USING ERRCODE='55000'; END IF;
  IF EXISTS (
    SELECT 1 FROM aureka_private.quality_domain_reset_table_manifest m
    WHERE m.backup_id=p_backup_id
      AND m.row_count<>(SELECT count(*) FROM aureka_private.quality_domain_reset_backup_rows b
                       WHERE b.backup_id=p_backup_id AND b.table_name=m.table_name)
  ) THEN RAISE EXCEPTION 'Jumlah baris arsip tidak sesuai manifest; pemulihan dihentikan.' USING ERRCODE='55000'; END IF;

  -- Restoration never merges the snapshot into new live data.
  IF EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_records)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_record_responses)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_reconciliation_audit)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_reconciliation_warning_reviews)
     OR EXISTS (SELECT 1 FROM aureka_quality.audit_log)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_excel_header_mappings)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_excel_mapping_audit)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_excel_profile_audit)
     OR EXISTS (SELECT 1 FROM aureka_quality.quality_import_batches) THEN
    RAISE EXCEPTION 'Tabel target harus kosong sebelum pemulihan; tidak ada data baru yang akan ditimpa.' USING ERRCODE='55000';
  END IF;

  SELECT count(*) INTO v_actor_missing
  FROM aureka_private.quality_domain_reset_backup_rows r
  CROSS JOIN LATERAL (SELECT nullif(r.row_payload->>'actor_id','')::uuid AS actor_id) a
  LEFT JOIN auth.users u ON u.id=a.actor_id
  WHERE r.backup_id=p_backup_id AND r.table_name='audit_log'
    AND a.actor_id IS NOT NULL AND u.id IS NULL;
  IF v_actor_missing>0 THEN
    RAISE EXCEPTION 'Arsip audit memiliki % actor_id yang tidak lagi tersedia di auth.users.',v_actor_missing USING ERRCODE='23503';
  END IF;

  -- Suppress triggers while reconstructing snapshot rows. The full row images are
  -- restored from the private snapshot; no synthetic audit entries are generated.
  ALTER TABLE aureka_quality.indicator_profiles DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_records DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_record_responses DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_record_staff_attributions DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_reconciliation_audit DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_reconciliation_warning_reviews DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_header_mappings DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_mapping_audit DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_profile_audit DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_monthly_reviews DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batches DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_rows DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_errors DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_events DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_source_rows DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_mappings DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_mapping_audit DISABLE TRIGGER USER;
  ALTER TABLE aureka_quality.oppe_indicator_rules DISABLE TRIGGER USER;

  INSERT INTO aureka_quality.indicator_profiles
  SELECT (jsonb_populate_record(NULL::aureka_quality.indicator_profiles,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='indicator_profiles' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_records
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_records,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_records' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_batches
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_batches,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_batches' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_record_responses
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_record_responses,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_record_responses' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_record_staff_attributions
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_record_staff_attributions,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_record_staff_attributions' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_batch_rows
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_batch_rows,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_batch_rows' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_batch_errors
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_batch_errors,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_batch_errors' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_batch_events
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_batch_events,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_batch_events' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_source_rows
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_source_rows,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_source_rows' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_excel_header_mappings
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_excel_header_mappings,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_excel_header_mappings' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_excel_mapping_audit
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_excel_mapping_audit,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_excel_mapping_audit' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_excel_profile_audit
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_excel_profile_audit,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_excel_profile_audit' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_mappings
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_mappings,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_mappings' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_import_mapping_audit
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_import_mapping_audit,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_import_mapping_audit' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_monthly_reviews
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_monthly_reviews,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_monthly_reviews' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_reconciliation_warning_reviews
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_reconciliation_warning_reviews,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_reconciliation_warning_reviews' ORDER BY row_number;

  INSERT INTO aureka_quality.quality_reconciliation_audit
  SELECT (jsonb_populate_record(NULL::aureka_quality.quality_reconciliation_audit,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='quality_reconciliation_audit' ORDER BY row_number;

  INSERT INTO aureka_quality.oppe_indicator_rules
  SELECT (jsonb_populate_record(NULL::aureka_quality.oppe_indicator_rules,row_payload)).*
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='oppe_indicator_rules' ORDER BY row_number;

  ALTER TABLE aureka_quality.indicator_profiles ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_records ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_record_responses ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_record_staff_attributions ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_reconciliation_audit ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_reconciliation_warning_reviews ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_header_mappings ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_mapping_audit ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_excel_profile_audit ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_monthly_reviews ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batches ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_rows ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_errors ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_batch_events ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_source_rows ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_mappings ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.quality_import_mapping_audit ENABLE TRIGGER USER;
  ALTER TABLE aureka_quality.oppe_indicator_rules ENABLE TRIGGER USER;

  ALTER TABLE aureka_quality.audit_log DROP CONSTRAINT audit_log_actor_id_fkey;
  INSERT INTO aureka_quality.audit_log(
    id,actor_id,action,table_name,record_id,before_json,after_json,created_at
  ) OVERRIDING SYSTEM VALUE
  SELECT
    (row_payload->>'id')::bigint,
    nullif(row_payload->>'actor_id','')::uuid,
    row_payload->>'action',
    row_payload->>'table_name',
    nullif(row_payload->>'record_id','')::uuid,
    row_payload->'before_json',
    row_payload->'after_json',
    (row_payload->>'created_at')::timestamptz
  FROM aureka_private.quality_domain_reset_backup_rows
  WHERE backup_id=p_backup_id AND table_name='audit_log'
  ORDER BY row_number;
  ALTER TABLE aureka_quality.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey
    FOREIGN KEY(actor_id) REFERENCES auth.users(id) NOT VALID;
  ALTER TABLE aureka_quality.audit_log VALIDATE CONSTRAINT audit_log_actor_id_fkey;

  PERFORM setval('aureka_quality.audit_log_id_seq',
    COALESCE((SELECT max(id) FROM aureka_quality.audit_log),1),true);

  RETURN aureka_private.verify_quality_domain_restore(p_backup_id);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_private.verify_quality_domain_restore(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
