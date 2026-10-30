import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LABORATORY_INDICATORS,
  calculateLaboratoryWaitMinutes,
  maskLaboratoryMedicalRecord,
  maskLaboratoryPatientName,
  matchLaboratoryOption,
  normalizeLaboratoryDateTime,
  summarizeLaboratoryDuplicates,
} from '../lib/aureka/laboratorium-logbook.ts'

const options = [
  { label: 'Sampel Diterima dengan Order Valid', code: 1 },
  { label: 'Tanpa Order (Kelalaian Petugas Ruangan / Lupa Menginput di SIMRS sebelum sampel dikirim)', code: 3 },
  { label: 'Lainnya — tuliskan alasan/temuan', code: null, review_required: true },
]

test('maps source headers to profile codes independently of workbook column order', () => {
  assert.deepEqual(LABORATORY_INDICATORS.map(item => [item.code, item.header]), [
    ['9.1', 'Darah Terbuang'],
    ['9.2', 'Unordered Specimen'],
    ['9.3', 'Delay Sampling'],
    ['9.4', 'Lapor Tes Kritis'],
    ['9.5', 'Histopatologi'],
  ])
})

test('normalizes Excel serial date-times and supported Indonesian / ISO strings', () => {
  assert.equal(normalizeLaboratoryDateTime('26/03/2026 23:15:46'), '2026-03-26T23:15:46')
  assert.equal(normalizeLaboratoryDateTime('26/03/2026, 21:35:23'), '2026-03-26T21:35:23')
  assert.equal(normalizeLaboratoryDateTime('2026-07-31T22:23:15'), '2026-07-31T22:23:15')
  assert.equal(normalizeLaboratoryDateTime(46107.96928), '2026-03-26T23:15:46')
  assert.equal(normalizeLaboratoryDateTime(new Date('2026-03-26T23:15:46.000Z')), '2026-03-26T23:15:46')
})

test('rejects impossible or ambiguous timestamps rather than guessing', () => {
  assert.equal(normalizeLaboratoryDateTime('21-98-18'), null)
  assert.equal(normalizeLaboratoryDateTime('31/02/2026 08:00:00'), null)
  assert.equal(normalizeLaboratoryDateTime('26/03/26 08:00:00'), null)
  assert.equal(normalizeLaboratoryDateTime(''), null)
})

test('calculates elapsed minutes across midnight and rejects negative intervals', () => {
  assert.equal(calculateLaboratoryWaitMinutes('26/03/2026 23:15:00', '27/03/2026 00:15:00'), 60)
  assert.equal(calculateLaboratoryWaitMinutes('27/03/2026 00:15:00', '26/03/2026 23:15:00'), null)
  assert.equal(calculateLaboratoryWaitMinutes('bad', '2026-03-26T23:15:00'), null)
})

test('matches exact master choices with consistent optional Code suffixes', () => {
  assert.equal(matchLaboratoryOption('Sampel Diterima dengan Order Valid (Code 1)', options)?.code, 1)
  assert.equal(matchLaboratoryOption('Sampel Diterima dengan Order Valid (Code 3)', options), null)
  assert.equal(matchLaboratoryOption('Pilihan tidak dikenal (Code 1)', options), null)
  assert.equal(matchLaboratoryOption(options[0].label, [options[0], options[0]]), null)
  assert.equal(matchLaboratoryOption(options[2].label, options)?.review_required, true)
})

test('masks identifying data in the import preview', () => {
  assert.equal(maskLaboratoryPatientName('Siti Rahma'), 'S•••a')
  assert.equal(maskLaboratoryMedicalRecord('0012345678'), '00••••78')
  assert.equal(maskLaboratoryMedicalRecord('123'), '••••')
  assert.equal(maskLaboratoryPatientName(''), '—')
})

test('counts repeated MRNs for quality review without collapsing episodes', () => {
  assert.deepEqual(summarizeLaboratoryDuplicates(['001', '002', '001', '003', '002', '002', '']), {
    distinctValues: 3,
    repeatedValues: 2,
    extraRows: 3,
  })
})
