CREATE OR REPLACE FUNCTION aureka_quality.archive_quality_logbook(p_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_room_id bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menghapus catatan logbook.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN (
    'ADMIN','SUPERADMIN','SUPER_ADMIN','SUPER-ADMIN','PMKP',
    'PIC','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'
  ) THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan mengarsipkan catatan logbook.' USING ERRCODE = '42501';
  END IF;

  UPDATE aureka_quality.quality_records r
     SET status = 'archived',
         archived_at = now(),
         updated_at = now()
   WHERE r.id = p_record_id
     AND r.status IN ('draft', 'ready', 'reopened')
     AND aureka_system.has_quality_room_access(r.room_id)
     AND (
       v_role IN ('ADMIN','SUPERADMIN','SUPER_ADMIN','SUPER-ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
       OR r.entered_by = v_user_id
     )
  RETURNING r.room_id INTO v_room_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, tidak berada pada unit yang dapat diakses, bukan milik akun Anda, atau sudah tervalidasi.' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.archive_quality_logbook(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.archive_quality_logbook(uuid) TO authenticated;
