import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorProfileBackup,
  parseIndicatorProfileBackup,
} from '../lib/aureka/indicator-profile-transfer.ts'

const uuidA = '11111111-1111-4111-8111-111111111111'
const uuidB = '22222222-2222-4222-8222-222222222222'

const profile = (overrides = {}) => ({
  id: uuidA,
  profile_year: 2026,
  code: '14.1',
  room_id: 14,
  unit_name: 'Intensive Care Unit & High Care Unit',
  title: 'Kekosongan BHP',
  indicator_type: '(IMP-RS) Pelayanan Klinis Prioritas',
  category: 'Outcome',
  unit_of_measure: 'Persentase (%)',
  target_text: '0%',
  target_operator: '=',
  target_value: 0,
  numerator_definition: 'Jumlah pasien terdampak',
  denominator_definition: 'Jumlah seluruh pasien',
  measurement_grain: 'patient_episode',
  schema_json: { measurement_type: 'ratio', indicator_direction: 'negative' },
  options_json: [{ label: 'Terjadi', code: 3 }, { label: 'Tidak terjadi', code: 1 }],
  status: 'published',
  is_active: true,
  ...overrides,
})

test('exports only active published profiles and retains source identity and nested schema', () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'Intensive Care Unit & High Care Unit',
    profiles: [
      profile(),
      profile({ id: uuidB, code: '14.2', status: 'retired', is_active: false }),
    ],
  })

  assert.equal(backup.format, 'AUREKA_INDICATOR_PROFILE_SET')
  assert.equal(backup.profiles.length, 1)
  assert.equal(backup.profiles[0].source_id, uuidA)
  assert.equal(backup.profiles[0].source_code, '14.1')
  assert.deepEqual(backup.profiles[0].schema_json, {
    measurement_type: 'ratio',
    indicator_direction: 'negative',
  })
  assert.equal(backup.scope.room_id, 14)
})

test('parses an exported set and preserves full measurement metadata', () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'ICU',
    profiles: [profile()],
  })
  const parsed = parseIndicatorProfileBackup(JSON.parse(JSON.stringify(backup)))

  assert.equal(parsed.profile_year, 2026)
  assert.equal(parsed.profiles[0].code, '14.1')
  assert.equal(parsed.profiles[0].room_id, 14)
  assert.equal(parsed.profiles[0].target_value, 0)
  assert.equal(parsed.profiles[0].measurement_grain, 'patient_episode')
  assert.deepEqual(parsed.profiles[0].options_json, profile().options_json)
})

test('rejects an empty import so the active profile set cannot be cleared accidentally', () => {
  assert.throws(() => parseIndicatorProfileBackup({
    format: 'AUREKA_INDICATOR_PROFILE_SET',
    schema_version: 1,
    profile_year: 2026,
    scope: { room_id: 14, unit_name: 'ICU' },
    profiles: [],
  }), /tidak memiliki profil/i)
})

test('rejects a file prepared for a different unit scope', () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'ICU',
    profiles: [profile()],
  })
  assert.throws(() => parseIndicatorProfileBackup({
    ...backup,
    profiles: [{ ...backup.profiles[0], room_id: 15 }],
  }), /cakupan unit/i)
})

test('rejects duplicate indicator codes and malformed source identities', () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'ICU',
    profiles: [profile()],
  })
  assert.throws(() => parseIndicatorProfileBackup({
    ...backup,
    profiles: [backup.profiles[0], { ...backup.profiles[0], source_id: uuidB }],
  }), /muncul lebih dari satu kali/i)
  assert.throws(() => parseIndicatorProfileBackup({
    ...backup,
    profiles: [{ ...backup.profiles[0], source_id: 'not-a-uuid' }],
  }), /identitas sumber/i)
})
