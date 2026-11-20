BEGIN;
CREATE TABLE IF NOT EXISTS aureka_quality.standard_operating_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 300),
  document_number text,
  revision_number text NOT NULL DEFAULT '00',
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  issue_date date,
  approval_title text,
  approval_name text,
  approval_identifier text,
  understanding text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  policy text NOT NULL DEFAULT '',
  procedure_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(procedure_steps)='array'),
  related_units text[] NOT NULL DEFAULT '{}'::text[],
  flowchart jsonb CHECK (flowchart IS NULL OR jsonb_typeof(flowchart)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','archived')),
  source_file_name text,
  source_file_mime_type text CHECK (source_file_mime_type IS NULL OR source_file_mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  source_file_size_bytes bigint CHECK (source_file_size_bytes IS NULL OR source_file_size_bytes BETWEEN 1 AND 15728640),
  source_storage_path text CHECK (source_storage_path IS NULL OR source_storage_path LIKE 'spo/%'),
  source_sha256 text CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  analysis_engine text,
  analysis_confidence jsonb CHECK (analysis_confidence IS NULL OR jsonb_typeof(analysis_confidence)='object'),
  analysis_notes text[] NOT NULL DEFAULT '{}'::text[],
  review_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_storage_path IS NULL AND source_file_name IS NULL AND source_file_mime_type IS NULL AND source_file_size_bytes IS NULL)
    OR (source_storage_path IS NOT NULL AND source_file_name IS NOT NULL AND source_file_mime_type IS NOT NULL AND source_file_size_bytes IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS standard_operating_procedures_document_revision_uidx
 ON aureka_quality.standard_operating_procedures(document_number,revision_number)
 WHERE document_number IS NOT NULL AND btrim(document_number)<>'';
CREATE INDEX IF NOT EXISTS standard_operating_procedures_status_updated_idx
 ON aureka_quality.standard_operating_procedures(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS standard_operating_procedures_title_lower_idx
 ON aureka_quality.standard_operating_procedures(lower(title));
ALTER TABLE aureka_quality.standard_operating_procedures ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA aureka_quality TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON aureka_quality.standard_operating_procedures TO authenticated;
REVOKE ALL ON aureka_quality.standard_operating_procedures FROM anon;
DROP POLICY IF EXISTS spo_register_read ON aureka_quality.standard_operating_procedures;
CREATE POLICY spo_register_read ON aureka_quality.standard_operating_procedures FOR SELECT TO authenticated
 USING (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'));
DROP POLICY IF EXISTS spo_register_insert ON aureka_quality.standard_operating_procedures;
CREATE POLICY spo_register_insert ON aureka_quality.standard_operating_procedures FOR INSERT TO authenticated
 WITH CHECK (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') AND created_by=(SELECT auth.uid()) AND updated_by=(SELECT auth.uid()) AND status='draft');
DROP POLICY IF EXISTS spo_register_update ON aureka_quality.standard_operating_procedures;
CREATE POLICY spo_register_update ON aureka_quality.standard_operating_procedures FOR UPDATE TO authenticated
 USING (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR'))
 WITH CHECK (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') AND updated_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS spo_register_password_rotation ON aureka_quality.standard_operating_procedures;
CREATE POLICY spo_register_password_rotation ON aureka_quality.standard_operating_procedures AS RESTRICTIVE FOR ALL TO authenticated
 USING (aureka_system.password_rotation_complete()) WITH CHECK (aureka_system.password_rotation_complete());

CREATE OR REPLACE FUNCTION aureka_quality.guard_standard_operating_procedure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=aureka_quality,aureka_system,public AS $function$
DECLARE v_actor uuid:=auth.uid(); v_role text:=aureka_system.current_role_code();
BEGIN
 IF v_actor IS NULL OR v_role NOT IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') THEN
  RAISE EXCEPTION 'Akses pengelolaan SPO tidak diizinkan.' USING ERRCODE='42501';
 END IF;
 IF NEW.updated_by IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'updated_by harus menunjukkan pengguna aktif.' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by IS NULL THEN NEW.created_by:=v_actor; ELSIF NEW.created_by IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'created_by tidak dapat mewakili pengguna lain.' USING ERRCODE='42501'; END IF;
  IF NEW.status<>'draft' THEN RAISE EXCEPTION 'SPO baru harus dimulai sebagai draf.'; END IF;
  NEW.approved_by:=NULL; NEW.approved_at:=NULL;
 ELSE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Identitas pembuat SPO tidak dapat diubah.' USING ERRCODE='42501'; END IF;
  IF OLD.status='approved' AND ROW(
   NEW.title,NEW.document_number,NEW.revision_number,NEW.page_count,NEW.issue_date,NEW.approval_title,NEW.approval_name,NEW.approval_identifier,
   NEW.understanding,NEW.purpose,NEW.policy,NEW.procedure_steps,NEW.related_units,NEW.flowchart,NEW.source_file_name,NEW.source_file_mime_type,
   NEW.source_file_size_bytes,NEW.source_storage_path,NEW.source_sha256
  ) IS DISTINCT FROM ROW(
   OLD.title,OLD.document_number,OLD.revision_number,OLD.page_count,OLD.issue_date,OLD.approval_title,OLD.approval_name,OLD.approval_identifier,
   OLD.understanding,OLD.purpose,OLD.policy,OLD.procedure_steps,OLD.related_units,OLD.flowchart,OLD.source_file_name,OLD.source_file_mime_type,
   OLD.source_file_size_bytes,OLD.source_storage_path,OLD.source_sha256
  ) THEN RAISE EXCEPTION 'SPO yang disahkan terkunci. Buat revisi baru untuk mengubah isinya.'; END IF;
  IF OLD.status='approved' AND NEW.status NOT IN ('approved','archived') THEN RAISE EXCEPTION 'SPO yang telah disahkan hanya dapat diarsipkan.'; END IF;
 END IF;
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
  IF v_role NOT IN ('ADMIN','PMKP','DIREKTUR') THEN RAISE EXCEPTION 'Pengesahan hanya dapat dilakukan oleh ADMIN, PMKP, atau Direktur.' USING ERRCODE='42501'; END IF;
  NEW.approved_by:=v_actor; NEW.approved_at:=COALESCE(NEW.approved_at,now());
 END IF;
 IF NEW.status<>'approved' AND TG_OP='UPDATE' AND OLD.status<>'approved' THEN NEW.approved_by:=NULL; NEW.approved_at:=NULL; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS standard_operating_procedures_guard ON aureka_quality.standard_operating_procedures;
CREATE TRIGGER standard_operating_procedures_guard BEFORE INSERT OR UPDATE ON aureka_quality.standard_operating_procedures
 FOR EACH ROW EXECUTE FUNCTION aureka_quality.guard_standard_operating_procedure();

DROP POLICY IF EXISTS spo_source_documents_read ON storage.objects;
CREATE POLICY spo_source_documents_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='aureka-documents' AND (storage.foldername(name))[1]='spo'
 AND aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR')
 AND aureka_system.password_rotation_complete()
);
DROP POLICY IF EXISTS spo_source_documents_insert ON storage.objects;
CREATE POLICY spo_source_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='aureka-documents' AND (storage.foldername(name))[1]='spo'
 AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
 AND aureka_system.password_rotation_complete()
);
DROP POLICY IF EXISTS spo_source_documents_delete ON storage.objects;
CREATE POLICY spo_source_documents_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='aureka-documents' AND (storage.foldername(name))[1]='spo'
 AND aureka_system.current_role_code() IN ('ADMIN','PMKP') AND aureka_system.password_rotation_complete()
);
COMMIT;
