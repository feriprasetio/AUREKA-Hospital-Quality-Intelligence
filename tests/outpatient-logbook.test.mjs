import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getOutpatientDoctorsForClinic,
  summarizeOutpatientClinics,
} from '../lib/aureka/outpatient-logbook.ts'

const groups = [
  { clinic: 'Klinik Anak', doctors: ['dr. A', 'dr. B'] },
  { clinic: 'Klinik Mata', doctors: ['dr. C'] },
]

test('returns only doctors listed under the selected clinic', () => {
  assert.deepEqual(getOutpatientDoctorsForClinic(groups, '  KLINIK   ANAK '), ['dr. A', 'dr. B'])
  assert.deepEqual(getOutpatientDoctorsForClinic(groups, ''), [])
  assert.deepEqual(getOutpatientDoctorsForClinic(groups, 'Klinik tidak dikenal'), [])
})

test('summarizes doctor-day waiting times using the workbook clinic averaging method', () => {
  const records = [
    { admit: '2026-01-02', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': 10 } },
    { admit: '2026-01-03', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': 20 } },
    { admit: '2026-01-02', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. B', 'Waktu Tunggu Rawat Jalan (Menit)': 40 } },
    { admit: '2026-01-03', formData: { Klinik: 'Klinik Mata', Dokter: 'dr. C', 'Waktu Tunggu Rawat Jalan (Menit)': 0 } },
    { admit: '2025-12-31', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': 90 } },
  ]

  const result = summarizeOutpatientClinics(records, groups, 2026, 1)
  const anak = result.find(item => item.clinic === 'Klinik Anak')
  const mata = result.find(item => item.clinic === 'Klinik Mata')

  assert.equal(anak?.recordCount, 3)
  assert.equal(anak?.measurementCount, 3)
  assert.equal(anak?.daysCount, 2)
  assert.equal(anak?.doctorsWithData, 2)
  assert.equal(anak?.doctorSummaries.find(item => item.doctor === 'dr. A')?.averageMinutes, 15)
  assert.equal(anak?.averageMinutes, 27.5)
  assert.equal(mata?.averageMinutes, 0)
})

test('keeps configured clinics visible even when no logbook exists yet', () => {
  const result = summarizeOutpatientClinics([], groups, 2026)
  assert.equal(result.length, 2)
  assert.equal(result[0].recordCount, 0)
  assert.equal(result[0].averageMinutes, null)
  assert.equal(result[0].rosterDoctorCount, 2)
})

test('ignores invalid and negative waiting times but does not drop the underlying daily records', () => {
  const records = [
    { admit: '2026-04-01', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': 'abc' } },
    { admit: '2026-04-02', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': -5 } },
    { admit: '2026-04-03', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': '12,5' } },
  ]

  const result = summarizeOutpatientClinics(records, groups, 2026, 4)
  assert.equal(result[0].recordCount, 3)
  assert.equal(result[0].measurementCount, 1)
  assert.equal(result[0].averageMinutes, 12.5)
})

test('preserves clinics found in logbook even when they are missing from the configured roster', () => {
  const records = [{
    admit: '2026-05-01',
    formData: { Klinik: 'Klinik Baru', Dokter: 'dr. Tidak dikenal', 'Waktu Tunggu Rawat Jalan (Menit)': 25 },
  }]
  const result = summarizeOutpatientClinics(records, groups, 2026, 5)
  const extra = result.find(item => item.clinic === 'Klinik Baru')
  assert.equal(extra?.rosterDoctorCount, 0)
  assert.equal(extra?.doctorsWithData, 1)
  assert.equal(extra?.averageMinutes, 25)
})

 
test('clinic target is inclusive at 60 minutes and denominator only counts clinics with valid measurement data', () => {
  const records = [
    { admit: '2026-06-01', formData: { Klinik: 'Klinik Anak', Dokter: 'dr. A', 'Waktu Tunggu Rawat Jalan (Menit)': 60 } },
    { admit: '2026-06-01', formData: { Klinik: 'Klinik Mata', Dokter: 'dr. C', 'Waktu Tunggu Rawat Jalan (Menit)': 60.1 } },
  ]
  const result = summarizeOutpatientClinics(records, groups, 2026, 6)
  const withData = result.filter(item => item.averageMinutes !== null)
  assert.equal(withData.filter(item => item.averageMinutes <= 60).length, 1)
  assert.equal(withData.length, 2)
})
