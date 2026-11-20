import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateClinicalPathwayMetrics, CLINICAL_PATHWAY_INM_TARGET_PCT } from '../lib/aureka/clinical-pathway-metrics.ts'

test('Clinical Pathway INM, mandatory components and patient episodes use separate denominators', () => {
  const metrics = calculateClinicalPathwayMetrics({
    ppaServiceObservations: [
      ...Array.from({ length: 8 }, () => ({ status: 'compliant' })),
      ...Array.from({ length: 2 }, () => ({ status: 'non_compliant' })),
    ],
    requiredComponents: [
      { required: true, status: 'complete', validated: true },
      { required: true, status: 'complete', validated: true },
      { required: true, status: 'incomplete', validated: true },
      { required: true, status: 'pending', validated: false },
      { required: false, status: 'incomplete', validated: false },
    ],
    patientEpisodes: [
      { eligibility: 'eligible', compliance: 'compliant' },
      { eligibility: 'eligible', compliance: 'non_compliant' },
      { eligibility: 'excluded', compliance: 'compliant' },
    ],
  })

  assert.equal(metrics.officialInmPpa.numerator, 8)
  assert.equal(metrics.officialInmPpa.denominator, 10)
  assert.equal(metrics.officialInmPpa.percentage, 80)
  assert.equal(metrics.officialInmPpa.targetPct, CLINICAL_PATHWAY_INM_TARGET_PCT)
  assert.equal(metrics.officialInmPpa.achieved, true)

  assert.equal(metrics.requiredComponentCompleteness.numerator, 2)
  assert.equal(metrics.requiredComponentCompleteness.denominator, 4)
  assert.equal(metrics.requiredComponentCompleteness.percentage, 50)

  assert.equal(metrics.patientEpisodeCompliance.numerator, 1)
  assert.equal(metrics.patientEpisodeCompliance.denominator, 2)
  assert.equal(metrics.patientEpisodeCompliance.percentage, 50)
})

test('pending and unvalidated clinical exclusions never become compliant observations', () => {
  const metrics = calculateClinicalPathwayMetrics({
    ppaServiceObservations: [
      { status: 'compliant' },
      { status: 'excluded', exclusionValidated: false },
      { status: 'excluded', exclusionValidated: true },
    ],
    requiredComponents: [
      { required: true, status: 'not_applicable', validated: false, clinicallyExcluded: true, exclusionValidated: false },
      { required: true, status: 'complete', validated: true, clinicallyExcluded: true, exclusionValidated: true },
    ],
    patientEpisodes: [
      { eligibility: 'pending', compliance: 'compliant' },
      { eligibility: 'eligible', compliance: 'pending' },
    ],
  })

  assert.equal(metrics.officialInmPpa.numerator, 1)
  assert.equal(metrics.officialInmPpa.denominator, 1)
  assert.equal(metrics.officialInmPpa.pending, 1)
  assert.equal(metrics.officialInmPpa.excluded, 1)
  assert.equal(metrics.requiredComponentCompleteness.numerator, 0)
  assert.equal(metrics.requiredComponentCompleteness.denominator, 1)
  assert.equal(metrics.requiredComponentCompleteness.excluded, 1)
  assert.equal(metrics.patientEpisodeCompliance.denominator, 0)
  assert.equal(metrics.patientEpisodeCompliance.percentage, null)
})

test('empty denominators return null rather than a misleading zero percent', () => {
  const metrics = calculateClinicalPathwayMetrics({})
  assert.equal(metrics.officialInmPpa.percentage, null)
  assert.equal(metrics.requiredComponentCompleteness.percentage, null)
  assert.equal(metrics.patientEpisodeCompliance.percentage, null)
})
