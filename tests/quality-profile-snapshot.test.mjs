import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../data/quality-profile-2026/', import.meta.url)

test('2026 canonical indicator profile snapshot contains all twelve complete chunks', async () => {
  const chunks = []
  for (let index = 1; index <= 12; index += 1) {
    const name = 'chunk-' + String(index).padStart(2, '0') + '.json'
    const rows = JSON.parse(await readFile(new URL(name, root), 'utf8'))
    assert.ok(Array.isArray(rows), name + ' must be a JSON array')
    assert.ok(rows.length > 0, name + ' must not be empty')
    chunks.push(...rows)
  }

  assert.equal(chunks.length, 189, 'snapshot must contain all 189 active published profiles')
  const codes = chunks.map((row) => row.code)
  assert.equal(new Set(codes).size, codes.length, 'indicator codes must be unique in the active snapshot')

  for (const row of chunks) {
    assert.equal(row.profile_year, 2026)
    assert.ok(Number.isInteger(row.room_id) && row.room_id > 0)
    assert.ok(typeof row.unit_name === 'string' && row.unit_name.trim())
    assert.ok(typeof row.title === 'string')
    assert.ok(typeof row.measurement_grain === 'string' && row.measurement_grain)
    assert.ok(row.schema_json && typeof row.schema_json === 'object' && !Array.isArray(row.schema_json))
    assert.ok(Array.isArray(row.options_json))
  }
})
