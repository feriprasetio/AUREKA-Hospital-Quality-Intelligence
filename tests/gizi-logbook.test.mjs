import test from 'node:test'
import assert from 'node:assert/strict'
import {
  giziSourceWarnings,
  maskGiziMedicalRecord,
  maskGiziPatientName,
  matchGiziOption,
  normalizeGiziDate,
  summarizeDuplicateValues,
} from '../lib/aureka/gizi-logbook.ts'

const assessmentOptions = [
  { label: 'Asesmen PAGT Dilakukan & Terdokumentasi < 24 Jam (Sesuai Target)', code: 1 },
  { label: 'Tidak Dilakukan Asesmen (Pasien Pulang APS / Dirujuk / Meninggal < 24 Jam)', code: 2 },
  { label: 'Asesmen Terlambat > 24 Jam (Dietisien Lupa Visit / Beban Kerja Overload)', code: 3 },
]

test('normalizes valid Excel serial, Date, ISO, and Indonesian day-first dates', () => {
  assert.equal(normalizeGiziDate(46123), '2026-04-11')
  assert.equal(normalizeGiziDate('2026-09-29'), '2026-09-29')
  assert.equal(normalizeGiziDate('11/04/2026'), '2026-04-11')
  assert.equal(normalizeGiziDate(new Date('2026-04-11T00:00:00.000Z')), '2026-04-11')
})

test('rejects ambiguous, impossible, and unsupported date values without guessing', () => {
  assert.equal(normalizeGiziDate('09/10/26'), null)
  assert.equal(normalizeGiziDate('31/02/2026'), null)
  assert.equal(normalizeGiziDate(''), null)
  assert.equal(normalizeGiziDate('hari ini'), null)
})

test('matches an exact master label and confirms its explicit Code 1 suffix', () => {
  const option = matchGiziOption(
    'Asesmen PAGT Dilakukan & Terdokumentasi < 24 Jam (Sesuai Target) (Code 1)',
    assessmentOptions,
  )
  assert.equal(option?.code, 1)
  assert.equal(option?.label, assessmentOptions[0].label)
})

test('rejects contradictory codes, unknown labels, and ambiguous master labels', () => {
  assert.equal(matchGiziOption(assessmentOptions[0].label + ' (Code 3)', assessmentOptions), null)
  assert.equal(matchGiziOption('Jawaban tidak dikenal (Code 1)', assessmentOptions), null)
  assert.equal(matchGiziOption(assessmentOptions[0].label, [assessmentOptions[0], assessmentOptions[0]]), null)
})

test('masks patient identity in preview', () => {
  assert.equal(maskGiziPatientName('Siti Rahma'), 'S•••a')
  assert.equal(maskGiziMedicalRecord('0012345678'), '00••••78')
  assert.equal(maskGiziMedicalRecord('123'), '••••')
  assert.equal(maskGiziPatientName(''), '—')
})

test('reports missing source attributes and indicator responses without filling them', () => {
  const warnings = giziSourceWarnings({ patientName: 'Pasien', medicalRecordNo: '', dpjp: '', assessment: 'Ada', prescription: '' })
  assert.ok(warnings.some(value => /No\. Rekam Medis kosong/.test(value)))
  assert.ok(warnings.some(value => /DPJP utama kosong/.test(value)))
  assert.ok(warnings.some(value => /Instruksi DPJP 7\.2 kosong/.test(value)))
  assert.ok(!warnings.some(value => /Assessment 7\.1 kosong/.test(value)))
})

test('summarizes duplicate identifiers without deleting repeated episodes', () => {
  assert.deepEqual(summarizeDuplicateValues(['001', '002', '001', '003', '002', '002', '']), {
    distinctValues: 3,
    repeatedValues: 2,
    extraRows: 3,
  })
})
