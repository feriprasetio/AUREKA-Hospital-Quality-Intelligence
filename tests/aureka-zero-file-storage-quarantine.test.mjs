import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261122184500_zero_file_storage_legacy_quarantine.sql', import.meta.url), 'utf8')

test('legacy source objects are read- and delete-inaccessible to application identities', () => {
  for (const operation of ['SELECT', 'DELETE']) {
    assert.match(sql, new RegExp('AS RESTRICTIVE FOR ' + operation + ' TO anon, authenticated'))
  }
  assert.match(sql, /USING \(false\)/)
  assert.doesNotMatch(sql, /\bDELETE FROM storage\.objects|\bDROP BUCKET|\bTRUNCATE\b|\bDROP TABLE\b/i)
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/)
})

test('historical Storage objects stay in custody for separate backup/retention review', () => {
  const policy = readFileSync(new URL('../supabase/migrations/20261122181000_zero_file_storage_policies.sql', import.meta.url), 'utf8')
  assert.match(policy, /AS RESTRICTIVE FOR INSERT TO anon, authenticated/)
  assert.match(policy, /AS RESTRICTIVE FOR UPDATE TO anon, authenticated/)
  assert.doesNotMatch(sql, /UPDATE storage\.objects|DELETE FROM storage\.objects/i)
})
