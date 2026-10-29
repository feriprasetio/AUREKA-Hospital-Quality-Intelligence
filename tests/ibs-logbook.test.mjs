import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ibsSourceWarnings,
  maskIbsMedicalRecord,
  maskIbsPatientName,
  matchIbsOption,
  normalizeIbsDate,
} from '../lib/aureka/ibs-logbook.ts'

const shortageOptions = [
  { label: 'Pasien Dirawat Tanpa Kendala', code: 1, numerator: false, denominator: true },
  { label: 'Pasien Dirawat Dengan Kekosongan Linen', code: 3, numerator: true, denominator: true },
  { label: 'Pasien Dirawat Dengan Kekosongan BHP', code: 3, numerator: true, denominator: true },
  { label: 'Pasien Dirawat Dengan Kekosongan BHP dan Linen', code: 3, numerator: true, denominator: true },
  { label: 'Pasien Dirawat Dengan Kendala Penunjang Lainnya', code: 3, numerator: true, denominator: true },
  { label: 'Lainnya — tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true },
]

test('matches an exact source option and the explicit Code 3 suffix', () => {
  const option = matchIbsOption('Pasien Dirawat Dengan Kekosongan BHP dan Linen (Code 3)', shortageOptions)
  assert.equal(option?.label, 'Pasien Dirawat Dengan Kekosongan BHP dan Linen')
  assert.equal(option?.code, 3)
  assert.equal(option?.numerator, true)
})

test('rejects a contradictory source code and unknown options', () => {
  assert.equal(matchIbsOption('Pasien Dirawat Dengan Kekosongan BHP dan Linen (Code 1)', shortageOptions), null)
  assert.equal(matchIbsOption('Pilihan yang tidak ada di master (Code 3)', shortageOptions), null)
})

test('normalizes Excel serial, ISO, and Indonesian day-first dates without guessing', () => {
  assert.equal(normalizeIbsDate(46023), '2026-01-01')
  assert.equal(normalizeIbsDate('2026-09-30'), '2026-09-30')
  assert.equal(normalizeIbsDate('25/05/2025'), '2025-05-25')
  assert.equal(normalizeIbsDate('31/02/2026'), null)
  assert.equal(normalizeIbsDate(''), null)
  assert.equal(normalizeIbsDate('09/10/26'), null)
})

test('preserves missing clinical attributes as warnings and flags historical records', () => {
  const warnings = ibsSourceWarnings({
    patientName: 'Pasien',
    medicalRecordNo: '',
    diagnosis: '',
    procedure: 'Tindakan',
    dpjp: '',
    date: '2025-05-25',
  })
  assert.ok(warnings.some(value => /No\. Rekam Medis kosong/.test(value)))
  assert.ok(warnings.some(value => /Diagnosa operasi kosong/.test(value)))
  assert.ok(warnings.some(value => /DPJP kosong/.test(value)))
  assert.ok(warnings.some(value => /historis/.test(value)))
})

test('preview masking does not reveal full patient or medical-record identifiers', () => {
  assert.equal(maskIbsPatientName('Siti Rahma'), 'S•••a')
  assert.equal(maskIbsMedicalRecord('0012345678'), '00••••78')
  assert.equal(maskIbsMedicalRecord('123'), '••••')
})
