import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildIndicatorProfileBackup,
  parseIndicatorProfileBackup,
  buildIndicatorProfileXlsx,
  parseIndicatorProfileXlsx,
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


const migrationSource = await readFile(new URL('../supabase/migrations/20261114080000_indicator_profile_set_transfer.sql', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../components/QualitySettings.tsx', import.meta.url), 'utf8')
const auditWorkspaceSource = await readFile(new URL('../components/QualityIndicatorWorkspace.tsx', import.meta.url), 'utf8')

test('replacement RPC is invoker-secured, transactional, and retains historical profile rows', () => {
  assert.match(migrationSource, /SECURITY INVOKER/i)
  assert.match(migrationSource, /aureka_system\.is_superadmin\(\)/)
  assert.match(migrationSource, /FOR v_old_profile_id IN[\s\S]+?ip\.code = v_previous_code/)
  assert.match(migrationSource, /UPDATE aureka_quality\.quality_record_responses/)
  assert.match(migrationSource, /jsonb_each\(qr\.core_data->'indicator_values'\)/)
  assert.doesNotMatch(migrationSource, /DELETE\s+FROM\s+aureka_quality\.indicator_profiles/i)
  assert.doesNotMatch(migrationSource, /DELETE\s+FROM\s+aureka_quality\.quality_records/i)
})

test('profile workspace provides export, guarded import confirmation, and one atomic replacement RPC', () => {
  assert.match(settingsSource, /Export profil/)
  assert.match(settingsSource, /Import profil/)
  assert.match(settingsSource, /Ganti seluruh profil/)
  assert.match(settingsSource, /replace_indicator_profile_set/)
  assert.match(settingsSource, /Saya memahami bahwa seluruh profil aktif/)
})

test('audit workspace invalidates and reloads cached profile snapshots after replacement', () => {
  assert.match(auditWorkspaceSource, /aureka:indicator-profiles-updated/)
  assert.match(auditWorkspaceSource, /QIW_MEMORY_CACHE\.clear\(\)/)
})


test('exports and reimports an XLSX workbook without losing profile or instrument metadata', async () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'ICU',
    profiles: [profile()],
  })
  const bytes = await buildIndicatorProfileXlsx(backup)
  assert.ok(bytes instanceof Uint8Array)
  assert.ok(bytes.byteLength > 1000)
  const parsed = await parseIndicatorProfileXlsx(bytes)
  assert.equal(parsed.profile_year, 2026)
  assert.equal(parsed.scope.room_id, 14)
  assert.equal(parsed.profiles[0].code, '14.1')
  assert.equal(parsed.profiles[0].target_value, 0)
  assert.equal(parsed.profiles[0].source_id, uuidA)
  assert.deepEqual(parsed.profiles[0].schema_json, profile().schema_json)
  assert.deepEqual(parsed.profiles[0].options_json, profile().options_json)
})

test('XLSX workbook contains editable profile, metadata, and instruction sheets', async () => {
  const backup = buildIndicatorProfileBackup({
    profileYear: 2026,
    scopeRoomId: 14,
    scopeName: 'ICU',
    profiles: [profile()],
  })
  const bytes = await buildIndicatorProfileXlsx(backup)
  const ExcelJS = (await import('exceljs-hardened')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  assert.ok(workbook.getWorksheet('Profil Indikator'))
  assert.ok(workbook.getWorksheet('Metadata'))
  assert.ok(workbook.getWorksheet('Petunjuk'))
  assert.equal(workbook.getWorksheet('Profil Indikator').rowCount, 2)
})

test('profile workspace accepts XLSX only and no longer advertises JSON transfer', () => {
  assert.match(settingsSource, /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/)
  assert.match(settingsSource, /Export XLSX/)
  assert.match(settingsSource, /Import XLSX/)
  assert.match(settingsSource, /parseIndicatorProfileXlsx/)
  assert.doesNotMatch(settingsSource, /JSON Profil Indikator AUREKA/)
})
