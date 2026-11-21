import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const page = read('components/HomeClient.tsx')
const migration = read('supabase/migrations/20261122150000_signup_active_rooms_column_rls.sql')

test('signup room options come from the database, not hardcoded IDs', () => {
  assert.match(page, /async function rooms\(\)\{[^\n]*from\('master_rooms'\)\.select\('id,name'\)\.eq\('is_active',true\)/)
  assert.doesNotMatch(page, /FALLBACK\.map\(|const FALLBACK=/)
  assert.match(page, /roomsList\.some\(room=>String\(room\.id\)===signupRoom\)/)
})

test('signup prevents phantom unit selection and offers a retry when rooms fail to load', () => {
  assert.match(page, /id="signupRoom"[^\n]*disabled=\{!roomsList\.length\}/)
  assert.match(page, /role="alert"[^\n]*Daftar unit belum dapat dimuat/)
  assert.match(page, /Coba muat ulang unit/)
  assert.match(page, /setRoomOptionsLoaded\(true\)/)
})

test('anonymous access is column-limited and restricted to active rooms', () => {
  assert.match(migration, /ALTER TABLE public\.master_rooms ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /GRANT SELECT \(id, name, is_active, sort_order\)[\s\S]*?TO anon/)
  assert.doesNotMatch(migration, /GRANT SELECT ON (?:TABLE )?public\.master_rooms TO anon/i)
  assert.match(migration, /FOR SELECT TO anon[\s\S]*?USING \(is_active IS TRUE\)/)
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/)
})
