import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeLandingWorkspace.tsx')
const client = read('components/HomeClient.tsx')
const migration = read('supabase/migrations/20261112074628_support_reminder_read_history.sql')

test('Beranda offers an explicit mark-as-read action and removes the reminder after persistence', () => {
  assert.ok(home.includes('Tandai sudah dibaca'))
  assert.ok(home.includes("from('support_reminder_reads')"))
  assert.ok(home.includes("insert({conversation_id:reminderId,user_id:userId})"))
  assert.ok(home.includes("setReminders(current=>current.filter(item=>item.id!==reminderId))"))
  assert.ok(home.includes('onReminderRead?.()'))
})

test('read reminders are retained in the notification history across sessions', () => {
  assert.ok(client.includes('type ReminderHistoryItem='))
  assert.ok(client.includes("from('support_reminder_reads')"))
  assert.ok(client.includes('Riwayat Pengingat Komite PMKP'))
  assert.ok(client.includes('Dibaca {new Date(item.readAt)'))
  assert.ok(!client.includes('aureka-reminder-seen:'))
})

test('reminder read-state is user-scoped and restricted to accessible PMKP reminders', () => {
  assert.ok(migration.includes('ALTER TABLE aureka_system.support_reminder_reads ENABLE ROW LEVEL SECURITY'))
  assert.ok(migration.includes('GRANT SELECT, INSERT ON TABLE aureka_system.support_reminder_reads TO authenticated'))
  assert.ok(migration.includes('user_id = (SELECT auth.uid())'))
  assert.ok(migration.includes("c.subject = 'Pengingat Komite PMKP'"))
  assert.ok(migration.includes('aureka_system.has_quality_room_access(c.room_id)'))
  assert.ok(!migration.includes('GRANT DELETE'))
})

test('the reminder chat source remains intact and visible only within permitted room scope', () => {
  assert.ok(migration.includes("subject IN ('Pengumuman Massal', 'Pengingat Komite PMKP')"))
  assert.ok(migration.includes('support_messages_select_participant'))
  assert.ok(migration.includes('support_messages_insert_participant'))
  assert.ok(migration.includes('ON DELETE CASCADE'))
})
