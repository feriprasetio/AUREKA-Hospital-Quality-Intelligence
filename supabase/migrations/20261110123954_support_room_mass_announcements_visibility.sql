DROP POLICY IF EXISTS support_conversations_select_participant ON aureka_system.support_conversations;
CREATE POLICY support_conversations_select_participant ON aureka_system.support_conversations FOR SELECT TO authenticated
USING (aureka_system.current_role_code() = 'ADMIN' OR created_by = (SELECT auth.uid()) OR (subject = 'Pengumuman Massal' AND aureka_system.has_quality_room_access(room_id)));

DROP POLICY IF EXISTS support_messages_select_participant ON aureka_system.support_messages;
CREATE POLICY support_messages_select_participant ON aureka_system.support_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM aureka_system.support_conversations c WHERE c.id = support_messages.conversation_id AND (c.created_by = (SELECT auth.uid()) OR aureka_system.current_role_code() = 'ADMIN' OR (c.subject = 'Pengumuman Massal' AND aureka_system.has_quality_room_access(c.room_id)))));

DROP POLICY IF EXISTS support_messages_insert_participant ON aureka_system.support_messages;
CREATE POLICY support_messages_insert_participant ON aureka_system.support_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM aureka_system.support_conversations c WHERE c.id = support_messages.conversation_id AND (c.created_by = (SELECT auth.uid()) OR aureka_system.current_role_code() = 'ADMIN' OR (c.subject = 'Pengumuman Massal' AND aureka_system.has_quality_room_access(c.room_id)))));
