import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ambulanceSourceWarnings,
  calculateAmbulanceResponseMinutes,
  matchAmbulanceOption,
  normalizeAmbulanceDate,
  normalizeAmbulanceTime,
} from '../lib/aureka/ambulance-logbook.ts'

const options = [
  { label: 'Waktu Pelayanan Sesuai SPO / Tepat Waktu', code: 1, numerator: false, denominator: true },
  { label: 'Terlambat (Stabilisasi Kondisi Pasien - Life Saving dulu di IGD)', code: 2, numerator: false, denominator: true },
  { label: 'Terlambat (Faktor Eksternal: Cuaca/Banjir/Macet Total)', code: 2, numerator: false, denominator: true },
  { label: 'Terlambat (Menunggu Keluarga Datang / Keluarga Mengurus Admin)', code: 2, numerator: false, denominator: true },
  { label: 'Terlambat (Supir Tidak Ada di Tempat / Sulit Dihubungi)', code: 3, numerator: true, denominator: true },
]

test('maps source timely dropdown label to the current published master without losing code', () => {
  const option = matchAmbulanceOption('Pelayanan Tepat Waktu (Code 1)', options)
  assert.equal(option?.label, options[0].label)
  assert.equal(option?.code, 1)
})

test('matches a source lateness label to canonical published option', () => {
  const option = matchAmbulanceOption('Terlambat (Stabilisasi Kondisi Pasien/Diselamatkan dulu) (Code 2)', options)
  assert.equal(option?.label, options[1].label)
  assert.equal(option?.code, 2)
})

test('rejects source code contradictions and ambiguous master choices', () => {
  assert.equal(matchAmbulanceOption('Pelayanan Tepat Waktu (Code 3)', options), null)
  assert.equal(matchAmbulanceOption('Terlambat (Faktor Eksternal: Cuaca/Banjir/Macet Total)', options), options[2])
})

test('normalizes obvious spreadsheet punctuation errors while preserving warnings', () => {
  const cases = [
    ['10;00:00', '10:00'],
    ['00"35:00', '00:35'],
    ['15;:10', '15:10'],
    ['00:10p05', '00:10'],
    ['06"00:00', '06:00'],
    ['02:10;00', '02:10'],
    ['0O:10"00', '00:10'],
    ['15:10"00', '15:10'],
    ['18:30"00', '18:30'],
    ['00"10:00', '00:10'],
  ]
  for (const [source, expected] of cases) {
    const result = normalizeAmbulanceTime(source)
    assert.equal(result.time, expected, source)
    assert.ok(result.warnings.some(warning => /dinormalisasi/.test(warning)), source)
  }
})

test('does not guess missing, invalid, or unexplained reversed times', () => {
  assert.equal(normalizeAmbulanceTime('').time, null)
  assert.equal(normalizeAmbulanceTime('29:80').time, null)
  assert.equal(calculateAmbulanceResponseMinutes('01:15', '01:10'), null)
  assert.equal(calculateAmbulanceResponseMinutes('10:00', ''), null)
})

test('handles explicit next-day Excel marker and avoids false rollover otherwise', () => {
  assert.equal(calculateAmbulanceResponseMinutes('23:50', '00:10', true), 20)
  assert.equal(calculateAmbulanceResponseMinutes('23:50', '00:10', false), null)
  const explicit = normalizeAmbulanceTime(new Date(Date.UTC(1900, 0, 1, 0, 10)))
  assert.equal(explicit.time, '00:10')
  assert.equal(explicit.excelDayCarry, true)
  assert.ok(explicit.warnings.some(warning => /pergantian hari/.test(warning)))
})

test('normalizes Excel dates and validates impossible calendar dates', () => {
  assert.equal(normalizeAmbulanceDate('07/09/2026'), '2026-09-07')
  assert.equal(normalizeAmbulanceDate('2026-02-28'), '2026-02-28')
  assert.equal(normalizeAmbulanceDate('31/02/2026'), null)
  assert.equal(normalizeAmbulanceDate(''), null)
})

test('source validation warnings keep formula errors and missing data visible', () => {
  const warnings = ambulanceSourceWarnings({
    patientName: '',
    requestDate: '2026-03-01',
    requestedTime: '10:00',
    deliveredTime: '10:05',
    origin: '',
    driver: '0',
    activity: 'Antar pasien',
    destination: 'IGD',
    indicatorValue: 'Pelayanan Tepat Waktu (Code 1)',
    formulaValue: '#VALUE!',
    timeWarnings: [],
    responseMinutes: 5,
  })
  assert.ok(warnings.some(warning => /Nama pasien kosong/.test(warning)))
  assert.ok(warnings.some(warning => /Asal ruangan kosong/.test(warning)))
  assert.ok(warnings.some(warning => /Nama supir.*bernilai 0/.test(warning)))
  assert.ok(warnings.some(warning => /#VALUE!/.test(warning)))
})
