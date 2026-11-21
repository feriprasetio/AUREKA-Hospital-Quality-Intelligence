BEGIN;

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
  v_table text;
  v_expected bigint;
  v_inserted bigint;
  v_archived bigint;
  v_hash text;
  v_manifest_hash text;
  v_order text[]:=ARRAY[
    'indicator_profiles','quality_records','quality_import_batches',
    'quality_record_responses','quality_record_staff_attributions',
    'quality_import_batch_rows','quality_import_batch_errors',
    'quality_import_batch_events','quality_import_source_rows',
    'quality_excel_header_mappings','quality_excel_mapping_audit',
    'quality_excel_profile_audit','quality_import_mappings',
    'quality_import_mapping_audit','quality_monthly_reviews',
    'quality_reconciliation_warning_reviews','quality_reconciliation_audit',
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
    ) THEN RAISE EXCEPTION 'Checksum per baris arsip % tidak cocok.',v_table USING ERRCODE='55000'; END IF;
  END LOOP;

  FOREACH v_table IN ARRAY v_order LOOP
    EXECUTE format('SELECT count(*) FROM aureka_quality.%I',v_table) INTO v_expected;
    IF v_expected<>0 THEN
      RAISE EXCEPTION 'Pemulihan dibatalkan: tabel % sudah berisi % baris baru.',v_table,v_expected USING ERRCODE='55000';
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

  IF EXISTS (
    SELECT 1
    FROM aureka_private.quality_domain_reset_backup_rows r
    CROSS JOIN LATERAL (SELECT nullif(r.row_payload->>'actor_id','')::uuid AS actor_id) a
    LEFT JOIN auth.users u ON u.id=a.actor_id
    WHERE r.backup_id=p_backup_id AND r.table_name='audit_log'
      AND a.actor_id IS NOT NULL AND u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Arsip audit memuat actor_id yang tidak ada di auth.users.' USING ERRCODE='23503';
  END IF;

  -- Supabase does not permit this role to disable internal RI triggers. Drop only
  -- the audit actor FK transactionally after checking every archived actor_id;
  -- the recreated NOT VALID FK still enforces all subsequent inserts/updates.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='aureka_quality.audit_log'::regclass
      AND conname='audit_log_actor_id_fkey' AND contype='f'
  ) THEN
    ALTER TABLE aureka_quality.audit_log DROP CONSTRAINT audit_log_actor_id_fkey;
  END IF;

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

  ALTER TABLE aureka_quality.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES auth.users(id) NOT VALID;

  INSERT INTO aureka_quality.audit_log(actor_id,action,table_name,record_id,before_json,after_json)
  SELECT NULL,'RESTORE','aureka_quality.quality_domain_reset',p_backup_id,
    jsonb_build_object('backup_id',p_backup_id,'restored_at',now()),
    jsonb_build_object('restored_rows',total_rows)
  FROM aureka_private.quality_domain_reset_runs WHERE id=p_backup_id;

  UPDATE aureka_private.quality_domain_reset_runs SET status='restored',completed_at=now()
  WHERE id=p_backup_id;

  RETURN jsonb_build_object('success',true,'backup_id',p_backup_id,'status','restored',
    'audit_fk_recreated',true,'audit_fk_validated',false);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) IS
'Restores a checksummed quality-domain snapshot. Checks archived actor IDs against auth.users, then recreates audit_log actor FK NOT VALID because hosted Supabase does not permit disabling RI system triggers for the large audit history. New writes remain FK enforced; validation of restored historical rows is an explicit maintenance step.';

COMMIT;
