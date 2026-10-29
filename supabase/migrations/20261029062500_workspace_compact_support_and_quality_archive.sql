-- Safe logbook response replacement, PIC archive controls, and Super Admin support chat.
GRANT DELETE ON TABLE aureka_quality.quality_record_responses TO authenticated;

DROP POLICY IF EXISTS qi_responses_delete_editable_room
  ON aureka_quality.quality_record_responses;
CREATE POLICY qi_responses_delete_editable_room
  ON aureka_quality.quality_record_responses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM aureka_quality.quality_records r
      WHERE r.id = quality_record_responses.record_id
        AND aureka_system.has_quality_room_access(r.room_id)
        AND r.status IN ('draft', 'ready', 'reopened')
        AND (aureka_system.current_role_code() IN ('ADMIN', 'PMKP') OR r.entered_by = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION aureka_quality.archive_quality_logbook(p_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menghapus catatan logbook.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP', 'PIC') THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan menghapus catatan logbook.' USING ERRCODE = '42501';
  END IF;
  UPDATE aureka_quality.quality_records r
     SET status = 'archived', archived_at = now(), updated_at = now()
   WHERE r.id = p_record_id
     AND r.status IN ('draft', 'ready', 'reopened')
     AND aureka_system.has_quality_room_access(r.room_id)
     AND (v_role IN ('ADMIN', 'PMKP') OR r.entered_by = v_user_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, bukan milik unit/akun Anda, atau sudah tervalidasi sehingga tidak dapat dihapus.' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION aureka_quality.archive_quality_logbook(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.archive_quality_logbook(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS aureka_system.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject text NOT NULL DEFAULT 'Bantuan Super Admin',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aureka_system.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES aureka_system.support_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_conversations_room_updated_idx
  ON aureka_system.support_conversations (room_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_conversation_created_idx
  ON aureka_system.support_messages (conversation_id, created_at);
ALTER TABLE aureka_system.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_system.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversations_select_participant ON aureka_system.support_conversations;
CREATE POLICY support_conversations_select_participant
  ON aureka_system.support_conversations FOR SELECT TO authenticated
  USING (aureka_system.current_role_code() = 'ADMIN' OR created_by = auth.uid());

DROP POLICY IF EXISTS support_conversations_insert_unit_user ON aureka_system.support_conversations;
CREATE POLICY support_conversations_insert_unit_user
  ON aureka_system.support_conversations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND aureka_system.has_quality_room_access(room_id)
    AND aureka_system.current_role_code() IN ('PIC', 'ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS')
  );

DROP POLICY IF EXISTS support_messages_select_participant ON aureka_system.support_messages;
CREATE POLICY support_messages_select_participant
  ON aureka_system.support_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM aureka_system.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND (c.created_by = auth.uid() OR aureka_system.current_role_code() = 'ADMIN')
  ));

DROP POLICY IF EXISTS support_messages_insert_participant ON aureka_system.support_messages;
CREATE POLICY support_messages_insert_participant
  ON aureka_system.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM aureka_system.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND (c.created_by = auth.uid() OR aureka_system.current_role_code() = 'ADMIN')
    )
  );
GRANT SELECT, INSERT ON TABLE aureka_system.support_conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE aureka_system.support_messages TO authenticated;
