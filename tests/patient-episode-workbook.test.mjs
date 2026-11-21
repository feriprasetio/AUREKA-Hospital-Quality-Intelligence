import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs-hardened'
import {
  buildEpisodeMappings, detectEpisodeFields, inspectEpisodeWorkbook, matchEpisodeOption,
  prepareEpisodeImport, supportsEpisodeWorkbook,
} from '../lib/aureka/patient-episode-workbook.ts'
import { calculateIndicatorResult } from '../lib/aureka/quality-results-engine.ts'

function fixture() {
  const workbook = new ExcelJS.Workbook()
  const logbook = workbook.addWorksheet('Logbook')
  logbook.addRow(['Mutu 2026'])
  logbook.addRow(['No. RM', 'Tanggal Masuk', 'Nama Pasien', 'Respons', 'Respons', 'Lainnya'])
  logbook.addRow(['000001', '01/02/2026', 'Pasien Uji A', 42, 'Patuh (Code 1)', 2])
  logbook.addRow(['000002', '2026-02-02', 'Pasien Uji B', 42, 2, 1])
  logbook.addRow(['000003', '2026-02-03', 'Pasien Uji C', 42, { formula: '3', result: 3 }, 3])
  logbook.getCell('E80').value = { formula: 'IF(A80="", "", 1)', result: 1 }
  const profil = workbook.addWorksheet('Profil')
  profil.addRow(['Kode indikator', 'Nama indikator', 'Kolom Logbook', 'Arah indikator', 'Target', 'Kode 1', 'Kode 2', 'Kode 3', 'Numerator'])
  profil.addRow([6.1, 'Kepatuhan unit', 'E', 'Positif', 0.8, 'Patuh', 'Pengecualian', 'Tidak patuh'])
  profil.getCell('A2').numFmt = '0.00'
  profil.getCell('E2').numFmt = '0%'
  profil.addRow(['6.11', 'Kejadian unit', '', 'Negatif', '≤ 80%', 'Nihil', 'Insiden ringan', 'Insiden berat', {
    formula: 'COUNTIF(Logbook!$F$3:$F$5,2)+COUNTIF(Logbook!$F$3:$F$5,3)', result: 2,
  }])
  return workbook
}

function setup(workbook = fixture(), active = []) {
  const parsed = inspectEpisodeWorkbook(workbook)
  const fields = detectEpisodeFields(parsed.logbook.columns)
  const mappings = buildEpisodeMappings(parsed, active, [], {}, [], true)
  return { parsed, fields, mappings, activeProfiles: active, includeProfiles: true,
    roomId: 6, roomName: 'IGD Uji', year: 2026, layoutFields: ['Tanggal Masuk', 'No. Rekam Medis', 'Nama Pasien'] }
}

test('coded import is limited to units that actually measure patient episodes and works before master profiles exist', () => {
  for (const [room, grain] of [[1, 'event'], [5, 'daily_metric'], [11, 'provider_day'], [30, 'activity']]) {
    assert.equal(supportsEpisodeWorkbook(room, grain), false)
    assert.equal(supportsEpisodeWorkbook(room), false)
  }
  assert.ok(supportsEpisodeWorkbook(6))
  assert.ok(supportsEpisodeWorkbook(27))
  assert.ok(supportsEpisodeWorkbook(29, undefined, [{ room_id: 29, measurement_grain: 'patient_episode' }]))
  assert.equal(supportsEpisodeWorkbook(7, undefined, [{ room_id: 7, measurement_grain: 'activity' }]), false)
  assert.equal(supportsEpisodeWorkbook(7, undefined, [{ room_id: 6, measurement_grain: 'patient_episode' }]), false)
})

test('workbook selects an explicit Excel column and a column referenced by a formula, then calculates from codes', async () => {
  const workbook = fixture()
  const decoded = new ExcelJS.Workbook()
  await decoded.xlsx.load(await workbook.xlsx.writeBuffer())
  const input = setup(decoded)
  assert.equal(input.parsed.profileSheet, 'Profil')
  assert.equal(input.parsed.logbook.header, 2)
  assert.deepEqual(input.parsed.logbook.columns.filter(column => column.name === 'Respons').map(column => [column.letter, column.occurrence]), [['D',1], ['E',2]])
  assert.deepEqual(input.mappings.map(mapping => [mapping.code, mapping.column]), [['6.10', 5], ['6.11', 6]])
  const result = await prepareEpisodeImport(input)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.codes, [2, 2, 2])
  assert.equal(result.profiles[0].target_value, 80)
  assert.equal(result.rows.length, 3)
  const records = result.rows.map(row => row.row_payload.record_payload)
  assert.equal(records[0].core_data.medical_record_no, '000001')
  assert.equal(records[0].core_data.indicator_values['6.10'].code, 1)
  assert.equal(records[0].core_data.indicator_values['6.11'].code, 2)
  assert.ok(records[0].subject_key.endsWith(result.rows[0].source_key))
  assert.doesNotMatch(JSON.stringify(result.rows.map(row => row.row_payload.responses)), /numerator|denominator/)
  const reviewed = records.map(record => ({ ...record, status: 'validated' }))
  const positive = calculateIndicatorResult(result.profiles[0], reviewed, 2026)
  const negative = calculateIndicatorResult(result.profiles[1], reviewed, 2026)
  assert.deepEqual([positive.annualNumerator, positive.annualDenominator], [1, 3])
  assert.deepEqual([negative.annualNumerator, negative.annualDenominator], [2, 3])
})

test('transposed profiles and Logbook dropdown options can establish a new profile without a database master', async () => {
  const workbook = new ExcelJS.Workbook()
  const logbook = workbook.addWorksheet('Logbook')
  logbook.addRow(['ID Episode', 'Tanggal', 'Periksa'])
  logbook.addRow(['EP-UJI', '2026-02-05', 'Lengkap (Code 1)'])
  const list = workbook.addWorksheet('Pilihan')
  list.addRows([['Lengkap (Code 1)'], ['Ditunda (Code 2)'], ['Tidak lengkap (Code 3)']])
  workbook.definedNames.add('Pilihan!$A$1:$A$3', 'OpsiPemeriksaan')
  logbook.getCell('C2').dataValidation = { type: 'list', formulae: ['OpsiPemeriksaan'] }
  const profile = workbook.addWorksheet('Profil')
  profile.addRows([['Kode indikator', '6.50'], ['Judul indikator', 'Periksa'], ['Arah indikator', 'Positif']])
  const input = setup(workbook)
  const result = await prepareEpisodeImport(input)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.profiles[0].options_json.map(item => item.label), ['Lengkap', 'Ditunda', 'Tidak lengkap'])
  assert.equal(result.rows[0].row_payload.responses[0].response_code, 1)
})

test('duplicate headers use their saved occurrence and new profile import retains other published profiles', async () => {
  const active = [{
    id: '001', room_id: 6, code: '6.99', title: 'Aktivitas Non-episode', status: 'published',
    measurement_grain: 'activity', schema_json: {}, options_json: [],
  }]
  const input = setup(fixture(), active)
  const result = await prepareEpisodeImport(input)
  assert.deepEqual(result.issues, [])
  assert.equal(result.profiles.at(-1), active[0])
  const direct = buildEpisodeMappings(input.parsed, result.profiles, [], {}, [{
    indicator_code: '6.10', source_header: 'Respons', occurrence: 2,
  }], false)
  assert.equal(direct.find(item => item.code === '6.10').column, 5)
  const draft = await prepareEpisodeImport({ ...input, activeProfiles: [{ ...active[0], status: 'draft' }] })
  assert.match(draft.issues[0].message, /profil draf/)
  assert.deepEqual(draft.rows, [])
})

test('conflicting labels and ambiguous episode corrections cannot partially stage data', async () => {
  const workbook = fixture()
  workbook.getWorksheet('Logbook').getCell('E3').value = 'Patuh (Code 3)'
  const input = setup(workbook)
  const bad = await prepareEpisodeImport(input)
  assert.match(bad.issues[0].message, /tidak cocok/)
  assert.equal(bad.rows.length, 0)
  workbook.getWorksheet('Logbook').getCell('E3').value = 1
  workbook.getWorksheet('Logbook').getCell('A4').value = '000001'
  workbook.getWorksheet('Logbook').getCell('B4').value = '2026-02-01'
  const duplicate = await prepareEpisodeImport(input)
  assert.match(duplicate.issues[0].message, /Episode ganda/)
  assert.equal(duplicate.rows.length, 0)
})

test('bare response code can be stored without guessing a label when options share their meaning', () => {
  const options = [{ label: 'Tipe A', code: 2 }, { label: 'Tipe B', code: 2 }]
  assert.equal(matchEpisodeOption(2, options, true).codeOnly, true)
  assert.equal(matchEpisodeOption('Tipe B (KODE 2)', options, true).option.label, 'Tipe B')
  assert.match(matchEpisodeOption(2, [options[0], { ...options[1], eligible: false }], true).error, /beberapa makna/)
})

test('a formula without a cached result is surfaced before staging', async () => {
  const workbook = fixture()
  workbook.getWorksheet('Logbook').getCell('E3').value = { formula: '1' }
  const result = await prepareEpisodeImport(setup(workbook))
  assert.match(result.issues[0].message, /Hasil formula belum tersimpan/)
  assert.equal(result.rows.length, 0)
})

test('an unchanged workbook profile does not create a fresh version during a later data import', async () => {
  const workbook = fixture()
  const first = await prepareEpisodeImport(setup(workbook))
  const published = first.profiles.map((profile, index) => ({ ...profile, id: 'published-' + index, status: 'published' }))
  const next = await prepareEpisodeImport(setup(workbook, published))
  assert.deepEqual(next.issues, [])
  assert.deepEqual(next.profiles, [])
  assert.equal(next.rows.length, 3)
})


test('profile-only workbook fills empty master without Logbook or patient records', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Profil Indikator')
  sheet.addRow(['Kode indikator', 'Nama indikator', 'Arah indikator', 'Kode 1', 'Kode 2', 'Kode 3', 'Target'])
  sheet.addRow(['6.50', 'Kepatuhan audit simulasi', 'Positif', 'Sesuai', 'Pengecualian', 'Tidak sesuai', '≥ 85%'])
  const parsed = inspectEpisodeWorkbook(workbook)
  assert.equal(parsed.hasLogbook, false)
  assert.equal(parsed.profileSheet, 'Profil Indikator')
  const input = setup(workbook)
  const preview = await prepareEpisodeImport({ ...input, profilesOnly: true })
  assert.deepEqual(preview.issues, [])
  assert.equal(preview.rows.length, 0)
  assert.equal(preview.profiles.length, 1)
  assert.equal(preview.profiles[0].code, '6.50')
  assert.deepEqual(preview.profiles[0].options_json.map(option => option.label), ['Sesuai', 'Pengecualian', 'Tidak sesuai'])
})

test('profile-only upload rejects guessed response labels instead of creating fictional clinical definitions', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Profil')
  sheet.addRow(['Kode indikator', 'Nama indikator', 'Arah indikator'])
  sheet.addRow(['6.51', 'Indikator tanpa klasifikasi sumber', 'Positif'])
  const preview = await prepareEpisodeImport({ ...setup(workbook), profilesOnly: true })
  assert.equal(preview.rows.length, 0)
  assert.ok(preview.issues.some(issue => /minimal dua pilihan jawaban/.test(issue.message)))
})

test('profile-only preview refuses silent overwrite when the source has no changes', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Profil')
  sheet.addRow(['Kode indikator', 'Nama indikator', 'Arah indikator', 'Kode 1', 'Kode 2'])
  sheet.addRow(['6.52', 'Profil stabil', 'Positif', 'Patuh', 'Tidak patuh'])
  const first = await prepareEpisodeImport({ ...setup(workbook), profilesOnly: true })
  assert.deepEqual(first.issues, [])
  const existing = first.profiles.map((profile, index) => ({
    ...profile, id: 'saved-' + index, status: 'published',
  }))
  const preview = await prepareEpisodeImport({ ...setup(workbook, existing), profilesOnly: true })
  assert.equal(preview.rows.length, 0)
  assert.equal(preview.profiles.length, 0)
  assert.ok(preview.issues.some(issue => /Tidak ada perubahan/.test(issue.message)))
})

test('active episode workbook dialog prioritizes empty master, uses profile-only RPC and skips staging', async () => {
  const { readFile } = await import('node:fs/promises')
  const dialog = await readFile(new URL('../components/PatientEpisodeWorkbookDialog.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /const autoFillMissingMaster = useProfiles && profiles\.length === 0/)
  assert.match(dialog, /await prepareEpisodeImport\(\{[\s\S]*?profilesOnly: true/)
  assert.match(dialog, /await commitBatch\(next, prepared, true\)/)
  assert.match(dialog, /p_import_mode: onlyProfiles \? 'profiles_only'/)
  assert.match(dialog, /p_expected_rows: onlyProfiles \? 0/)
  assert.match(dialog, /if \(onlyProfiles\) break/)
  assert.doesNotMatch(dialog, /upload\(|storage\.from\(/)
})
