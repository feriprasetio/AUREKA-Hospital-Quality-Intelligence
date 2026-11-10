CREATE OR REPLACE FUNCTION aureka_system.send_mass_room_announcement(p_body text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, aureka_system, auth, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Login diperlukan untuk mengirim pengumuman.'; END IF;
  IF aureka_system.current_role_code() <> 'ADMIN' THEN RAISE EXCEPTION 'Hanya Super Admin yang dapat mengirim pengumuman massal.'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Isi pengumuman wajib diisi dan maksimal 4.000 karakter.'; END IF;
  WITH created AS (
    INSERT INTO aureka_system.support_conversations (room_id, created_by, subject)
    SELECT r.id, v_user_id, 'Pengumuman Massal'
    FROM public.master_rooms r
    WHERE r.is_active = true
    ORDER BY r.sort_order, r.id
    RETURNING id
  )
  INSERT INTO aureka_system.support_messages (conversation_id, sender_id, body)
  SELECT created.id, v_user_id, trim(p_body) FROM created;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'Tidak ada ruangan aktif yang menerima pengumuman.'; END IF;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION aureka_system.send_mass_room_announcement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_system.send_mass_room_announcement(text) TO authenticated;
