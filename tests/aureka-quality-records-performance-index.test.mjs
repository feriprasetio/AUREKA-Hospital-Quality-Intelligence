import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261122170000_quality_records_room_year_sort_performance.sql', import.meta.url), 'utf8')

test('quality-records newest-first read path has a dedicated composite index', () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS quality_records_room_year_created_desc_idx/)
  assert.match(sql, /ON aureka_quality\.quality_records\s+USING btree\s*\(room_id, profile_year, created_at DESC\)/)
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE|UPDATE)\b\s+(TABLE|FROM|aureka_quality\.quality_records)/i)
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|statement_timeout\s*=/i)
})
