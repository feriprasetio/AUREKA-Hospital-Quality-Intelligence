export const CLINICAL_PATHWAY_INM_TARGET_PCT = 80 as const

export type PpaServiceObservation = {
  status: 'compliant' | 'non_compliant' | 'pending' | 'excluded'
  exclusionValidated?: boolean
}

export type RequiredComponentObservation = {
  required: boolean
  status: 'complete' | 'incomplete' | 'pending' | 'not_applicable'
  validated: boolean
  clinicallyExcluded?: boolean
  exclusionValidated?: boolean
}

export type PatientEpisodeObservation = {
  eligibility: 'eligible' | 'excluded' | 'pending'
  compliance: 'compliant' | 'non_compliant' | 'pending'
}

export type ClinicalPathwayRate = {
  numerator: number
  denominator: number
  pending: number
  excluded: number
  percentage: number | null
}

function rate(numerator: number, denominator: number, pending: number, excluded: number): ClinicalPathwayRate {
  return {
    numerator,
    denominator,
    pending,
    excluded,
    percentage: denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null,
  }
}

/**
 * Keeps the three measurement grains separate:
 * - INM: observed PPA services, not checklist cells or patient counts.
 * - Component completeness: mandatory components only, validated as complete.
 * - Episode compliance: eligible and evaluable patient episodes only.
 *
 * The function does not define local cohorts, clinical exceptions, or CP content.
 */
export function calculateClinicalPathwayMetrics(input: {
  ppaServiceObservations?: PpaServiceObservation[]
  requiredComponents?: RequiredComponentObservation[]
  patientEpisodes?: PatientEpisodeObservation[]
}) {
  const services = input.ppaServiceObservations ?? []
  let ppaNumerator = 0
  let ppaDenominator = 0
  let ppaPending = 0
  let ppaExcluded = 0
  for (const service of services) {
    if (service.status === 'excluded' && service.exclusionValidated) {
      ppaExcluded += 1
    } else if (service.status === 'compliant' || service.status === 'non_compliant') {
      ppaDenominator += 1
      if (service.status === 'compliant') ppaNumerator += 1
    } else {
      ppaPending += 1
    }
  }

  const components = (input.requiredComponents ?? []).filter((component) => component.required)
  let componentNumerator = 0
  let componentDenominator = 0
  let componentPending = 0
  let componentExcluded = 0
  for (const component of components) {
    if (component.clinicallyExcluded && component.exclusionValidated) {
      componentExcluded += 1
      continue
    }
    componentDenominator += 1
    if (component.status === 'complete' && component.validated) {
      componentNumerator += 1
    } else if (component.status === 'pending' || component.status === 'not_applicable' || !component.validated) {
      componentPending += 1
    }
  }

  const episodes = input.patientEpisodes ?? []
  let episodeNumerator = 0
  let episodeDenominator = 0
  let episodePending = 0
  let episodeExcluded = 0
  for (const episode of episodes) {
    if (episode.eligibility === 'excluded') {
      episodeExcluded += 1
      continue
    }
    if (episode.eligibility === 'pending') {
      episodePending += 1
      continue
    }
    if (episode.compliance === 'compliant' || episode.compliance === 'non_compliant') {
      episodeDenominator += 1
      if (episode.compliance === 'compliant') episodeNumerator += 1
    } else {
      episodePending += 1
    }
  }

  const officialInmPpa = rate(ppaNumerator, ppaDenominator, ppaPending, ppaExcluded)
  const requiredComponentCompleteness = rate(componentNumerator, componentDenominator, componentPending, componentExcluded)
  const patientEpisodeCompliance = rate(episodeNumerator, episodeDenominator, episodePending, episodeExcluded)

  return {
    officialInmPpa: {
      ...officialInmPpa,
      targetPct: CLINICAL_PATHWAY_INM_TARGET_PCT,
      achieved: officialInmPpa.percentage === null ? null : officialInmPpa.percentage >= CLINICAL_PATHWAY_INM_TARGET_PCT,
    },
    requiredComponentCompleteness,
    patientEpisodeCompliance,
  }
}
