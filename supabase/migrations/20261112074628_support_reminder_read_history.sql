-- Persist reminder read state per recipient and retain the original chat message as history.
CREATE TABLE IF NOT EXISTS aureka_system.support_reminder_reads (
  conversation_id uuid NOT NULL
    REFERENCES aureka_system.support_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_reminder_reads_pkey PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS support_reminder_reads_user_read_at_idx
  ON aureka_system.support_reminder_reads (user_id, read_at DESC);

COMMENT ON TABLE aureka_system.support_reminder_reads IS
  'Status baca pengingat Komite PMKP per pengguna; record yang dibaca menjadi riwayat notifikasi dan tidak menghapus pesan sumber.';

ALTER TABLE aureka_system.support_reminder_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aureka_system.support_reminder_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE aureka_system.support_reminder_reads TO authenticated;

-- Permit each unit member to see and reply to its own PMKP reminder.
DROP POLICY IF EXISTS support_conversations_select_participant
  ON aureka_system.support_conversations;
CREATE POLICY support_conversations_select_participant
  ON aureka_system.support_conversations
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() = 'ADMIN'
    OR created_by = (SELECT auth.uid())
    OR (
      subject IN ('Pengumuman Massal', 'Pengingat Komite PMKP')
      AND aureka_system.has_quality_room_access(room_id)
    )
  );

DROP POLICY IF EXISTS support_messages_select_participant
  ON aureka_system.support_messages;
CREATE POLICY support_messages_select_participant
  ON aureka_system.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM aureka_system.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND (
          c.created_by = (SELECT auth.uid())
          OR aureka_system.current_role_code() = 'ADMIN'
          OR (
            c.subject IN ('Pengumuman Massal', 'Pengingat Komite PMKP')
            AND aureka_system.has_quality_room_access(c.room_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS support_messages_insert_participant
  ON aureka_system.support_messages;
CREATE POLICY support_messages_insert_participant
  ON aureka_system.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM aureka_system.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND (
          c.created_by = (SELECT auth.uid())
          OR aureka_system.current_role_code() = 'ADMIN'
          OR (
            c.subject IN ('Pengumuman Massal', 'Pengingat Komite PMKP')
            AND aureka_system.has_quality_room_access(c.room_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS support_reminder_reads_select_own
  ON aureka_system.support_reminder_reads;
CREATE POLICY support_reminder_reads_select_own
  ON aureka_system.support_reminder_reads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_reminder_reads_insert_own_accessible_reminder
  ON aureka_system.support_reminder_reads;
CREATE POLICY support_reminder_reads_insert_own_accessible_reminder
  ON aureka_system.support_reminder_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM aureka_system.support_conversations c
      WHERE c.id = support_reminder_reads.conversation_id
        AND c.subject = 'Pengingat Komite PMKP'
        AND aureka_system.has_quality_room_access(c.room_id)
    )
  );
