import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IGD_INDICATORS,
  calculateIgdElapsedMinutes,
  igdDateOnly,
  matchIgdConsultationToEncounter,
  matchIgdSourceOption,
  normalizeIgdDateTime,
  normalizeIgdMedicalRecord,
  parseIgdMonthFromFilename,
  summarizeIgdMatches,
} from '../lib/aureka/igd-logbook.ts'

const encounters = [
  { subjectKey: 'episode-1', medicalRecordNo: '001234', patientName: 'Siti Rahma', recordDate: '2026-01-12T08:15:00' },
  { subjectKey: 'episode-2', medicalRecordNo: '001234', patientName: 'Siti Rahma', recordDate: '2026-01-13T08:15:00' },
  { subjectKey: 'episode-3', medicalRecordNo: '009999', patientName: 'Budi', recordDate: '2026-01-12T09:15:00' },
  { subjectKey: 'episode-4a', medicalRecordNo: '000777', patientName: 'Ayu', recordDate: '2026-01-15T08:00:00' },
  { subjectKey: 'episode-4b', medicalRecordNo: '000777', patientName: 'Ayu', recordDate: '2026-01-15T09:00:00' },
]

test('defines the seven active IGD indicator headers explicitly', () => {
  assert.deepEqual(IGD_INDICATORS.map(item => [item.code, item.header]), [
    ['6.1', 'Kematian IGD ≤8h'],
    ['6.2', 'Door-to-Decision'],
    ['6.3', 'Response Time DPJP'],
    ['6.4', 'Antrian Rawat Inap'],
    ['6.5', 'Kelengkapan Assessment Keperawatan'],
    ['6.6', 'Overcrowding Index'],
    ['6.7', 'Response Triage'],
  ])
})

test('normalizes Excel serials and explicit ISO/Indonesian timestamps', () => {
  assert.equal(normalizeIgdDateTime('12/01/2026 08:15:00'), '2026-01-12T08:15:00')
  assert.equal(normalizeIgdDateTime('2026-01-12 08:15'), '2026-01-12T08:15:00')
  assert.equal(normalizeIgdDateTime('2026-01-12 08:15:00.808'), '2026-01-12T08:15:00')
  assert.equal(normalizeIgdDateTime(46034.34375), '2026-01-12T08:15:00')
  assert.equal(igdDateOnly('12/01/2026'), '2026-01-12')
})

test('rejects invalid or ambiguous timestamps instead of guessing', () => {
  assert.equal(normalizeIgdDateTime('31/02/2026 08:00:00'), null)
  assert.equal(normalizeIgdDateTime('12/01/26 08:00:00'), null)
  assert.equal(normalizeIgdDateTime(''), null)
})

test('calculates elapsed registration-to-consultation minutes and rejects negative intervals', () => {
  assert.equal(calculateIgdElapsedMinutes('12/01/2026 08:15:00', '12/01/2026 09:15:00'), 60)
  assert.equal(calculateIgdElapsedMinutes('12/01/2026 09:15:00', '12/01/2026 08:15:00'), null)
  assert.equal(calculateIgdElapsedMinutes('bad', '2026-01-12T09:15:00'), null)
})

test('preserves leading zeroes and punctuation in medical record identifiers', () => {
  assert.equal(normalizeIgdMedicalRecord('0012-34'), '0012-34')
  assert.notEqual(normalizeIgdMedicalRecord('001234'), normalizeIgdMedicalRecord('1234'))
})

test('links a consult only when MRN and calendar date resolve uniquely', () => {
  assert.equal(matchIgdConsultationToEncounter('001234', '12/01/2026 10:00', 'Siti Rahma', encounters).subjectKey, 'episode-1')
  assert.equal(matchIgdConsultationToEncounter('001234', '14/01/2026 10:00', 'Siti Rahma', encounters).status, 'date_mismatch')
  assert.equal(matchIgdConsultationToEncounter('not-found', '12/01/2026 10:00', 'Nobody', encounters).status, 'rm_not_found')
  assert.equal(matchIgdConsultationToEncounter('', '12/01/2026 10:00', 'Nobody', encounters).status, 'missing_mrn')
  assert.equal(matchIgdConsultationToEncounter('001234', '', 'Siti Rahma', encounters).status, 'missing_date')
})

test('ambiguous same-day duplicate episodes remain unlinked unless exact patient name uniquely resolves them', () => {
  const ambiguous = matchIgdConsultationToEncounter('000777', '15/01/2026 12:00', '', encounters)
  assert.equal(ambiguous.status, 'ambiguous_rm_date')
  assert.equal(ambiguous.subjectKey, null)
  const resolved = matchIgdConsultationToEncounter('000777', '15/01/2026 12:00', 'Ayu', encounters)
  assert.equal(resolved.status, 'ambiguous_rm_date') // duplicate source records have the same name; exact name is not a sufficient tie-break
})

test('matches source indicator choices only on exact label/code agreement', () => {
  const options = [
    { label: 'Respon DPJP Tepat Waktu (Sesuai SPO)', code: 1 },
    { label: 'Respon Terlambat (Operasi Cito - Ada Backup)', code: 2 },
    { label: 'Lainnya — tuliskan alasan/temuan', code: null, review_required: true },
  ]
  assert.equal(matchIgdSourceOption('Respon DPJP Tepat Waktu (Sesuai SPO) (Code 1)', options)?.code, 1)
  assert.equal(matchIgdSourceOption('Respon DPJP Tepat Waktu (Sesuai SPO) (Code 3)', options), null)
  assert.equal(matchIgdSourceOption('pilihan tidak dikenal (Code 1)', options), null)
  assert.equal(matchIgdSourceOption('Lainnya — tuliskan alasan/temuan', options)?.review_required, true)
})

test('recognizes Indonesian source months from source filenames', () => {
  assert.equal(parseIgdMonthFromFilename('1. PMKP IGD Januari Waktu Konsul DPJP.xlsx'), 1)
  assert.equal(parseIgdMonthFromFilename('PMKP IGD Mei 2026.xlsx'), 5)
  assert.equal(parseIgdMonthFromFilename('Workbook without month.xlsx'), null)
})

test('summarizes each match state without merging episodes', () => {
  const statuses = [
    matchIgdConsultationToEncounter('001234', '12/01/2026 10:00', 'Siti Rahma', encounters),
    matchIgdConsultationToEncounter('000777', '15/01/2026 12:00', '', encounters),
    matchIgdConsultationToEncounter('missing', '12/01/2026 12:00', '', encounters),
  ]
  const summary = summarizeIgdMatches(statuses)
  assert.equal(summary.matched_unique, 1)
  assert.equal(summary.ambiguous_rm_date, 1)
  assert.equal(summary.rm_not_found, 1)
})
