BEGIN;

CREATE OR REPLACE FUNCTION aureka_private.verify_quality_domain_restore(p_backup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SET statement_timeout = '0'
AS $function$
DECLARE
  v_table text;
  v_expected bigint;
  v_archive_total bigint;
  v_backup_valid bigint;
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
    WHERE id=p_backup_id AND status IN ('committed','restored')
  ) THEN
    RAISE EXCEPTION 'Snapshot tidak ditemukan atau status arsip tidak sesuai.' USING ERRCODE='55000';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT row_count INTO v_expected
    FROM aureka_private.quality_domain_reset_table_manifest
    WHERE backup_id=p_backup_id AND table_name=v_table;
    IF NOT FOUND THEN RAISE EXCEPTION 'Manifest tabel % tidak ditemukan.',v_table USING ERRCODE='55000'; END IF;

    -- One scan validates both total archive rows and per-row checksums.
    SELECT count(*),count(*) FILTER (WHERE row_checksum=md5(row_payload::text))
      INTO v_archive_total,v_backup_valid
    FROM aureka_private.quality_domain_reset_backup_rows
    WHERE backup_id=p_backup_id AND table_name=v_table;

    IF v_archive_total<>v_expected OR v_backup_valid<>v_expected THEN
      RAISE EXCEPTION 'Jumlah/checksum arsip % tidak valid: total %, valid %, diharapkan %.',
        v_table,v_archive_total,v_backup_valid,v_expected USING ERRCODE='55000';
    END IF;

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

    v_report:=v_report||jsonb_build_array(jsonb_build_object(
      'table',v_table,'rows',v_live_count,'checksum_match',true
    ));
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

REVOKE ALL ON FUNCTION aureka_private.verify_quality_domain_restore(uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;