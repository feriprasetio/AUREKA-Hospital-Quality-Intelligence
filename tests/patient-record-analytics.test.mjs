import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePatientRecordAnalytics, patientRecordCoverage } from '../lib/aureka/patient-record-analytics.ts'

const scope = { year: 2026, roomId: 1 }

function fixture() {
  return {
    allowed: true, year: scope.year, scope_room_id: scope.roomId,
    episodes: 3, unique_patients: 3, inpatient_episodes: 3, discharged_inpatients: 2,
    active_inpatients: 1, valid_mrn: 3, invalid_mrn: 0, diagnosis_available: 3,
    diagnosis_missing: 0, icd10_coded: 0, diagnosis_uncoded: 3, los_count: 1,
    average_los: 0,
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: i === 0 ? 3 : 0 })),
    top_icd10: [], los_bands: [{ label: '0 hari', count: 1 }], units: [],
  }
}

test('accepts observed zero and computes coverage for a defined population', () => {
  const analytics = parsePatientRecordAnalytics(fixture(), scope)
  assert.equal(analytics.average_los, 0)
  assert.equal(patientRecordCoverage(analytics.icd10_coded, analytics.episodes), 0)
  assert.equal(patientRecordCoverage(analytics.los_count, analytics.discharged_inpatients), 50)
  assert.equal(patientRecordCoverage(0, 0), null)
})

test('rejects denied, stale or incomplete episode summaries', () => {
  const analytics = fixture()
  assert.throws(() => parsePatientRecordAnalytics({ ...analytics, allowed: false }, scope), /akses/)
  assert.throws(() => parsePatientRecordAnalytics(analytics, { ...scope, roomId: 5 }), /filter/)
  assert.throws(() => parsePatientRecordAnalytics(analytics, { ...scope, year: 2027 }), /filter/)
  assert.throws(() => parsePatientRecordAnalytics({ ...analytics, monthly: analytics.monthly.slice(1) }, scope), /tidak lengkap/)
  assert.throws(() => parsePatientRecordAnalytics({ ...analytics, icd10_coded: null }, scope), /tidak lengkap/)
  assert.throws(() => parsePatientRecordAnalytics({ ...analytics, average_los: null }, scope), /LOS tidak konsisten/)
})
