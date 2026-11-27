/** Read-only briefing over already computed, validated results. No API, no formula change. */
export type ValidatedIndicatorBriefingInput = {
  observations: number
  targetMet: boolean | null
}
export function buildValidatedIndicatorBriefing(results: readonly ValidatedIndicatorBriefingInput[]) {
  const observed=results.filter(row=>Number.isFinite(row.observations)&&row.observations>0)
  const assessed=observed.filter(row=>row.targetMet===true||row.targetMet===false)
  const met=assessed.filter(row=>row.targetMet===true).length
  const below=assessed.length-met
  return {active:results.length, observed:observed.length, assessed:assessed.length, met, below, unassessed:results.length-assessed.length}
}
