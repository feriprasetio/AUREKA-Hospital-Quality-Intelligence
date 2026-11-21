import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const directory = new URL('../supabase/migrations/', import.meta.url)

test('each migration has a unique, valid fourteen-digit version', () => {
  const migrations = readdirSync(directory).filter(name => name.endsWith('.sql'))
  assert.ok(migrations.length > 0)
  const versions = new Map()
  for (const filename of migrations) {
    assert.match(filename, /^\d{14}_[a-zA-Z0-9_-]+\.sql$/, `Invalid migration filename: ${filename}`)
    const version = filename.slice(0, 14)
    assert.equal(versions.has(version), false,
      `Duplicate migration version ${version}: ${versions.get(version)} and ${filename}`)
    versions.set(version, filename)
  }
})

test('the recommendation migration ends its function DDL with a statement delimiter', () => {
  const path = new URL('../supabase/migrations/20261122140000_recommendation_code_sequence_integrity.sql', import.meta.url)
  const sql = readFileSync(path, 'utf8').trimEnd()
  assert.match(sql, /\$function\$;$/, 'a CREATE OR REPLACE FUNCTION migration must end with a semicolon')
  assert.match(sql, /REVOKE ALL ON SEQUENCE .* FROM PUBLIC, anon, authenticated/)
})
