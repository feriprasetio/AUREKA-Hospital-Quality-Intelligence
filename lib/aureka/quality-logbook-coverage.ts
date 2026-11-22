/**
 * Coverage is about observed responses, not numerator/denominator eligibility.
 * Missing-code choices count as answered; they never become coded observations.
 */
export function isCategoricalResponseRecorded(
  options: Array<{ label?: unknown; code?: unknown }>,
  response: { answer?: unknown; code?: unknown; code_only?: boolean; source_option?: boolean } | null | undefined,
): boolean {
  if (!response) return false
  const code = response.code == null || response.code === '' ? null : Number(response.code)
  if (response.code_only === true) {
    return [1, 2, 3].includes(Number(code)) && options.some(option => Number(option.code) === code)
  }
  const answer = String(response.answer ?? '').trim()
  if (!answer) return false
  // An unrecognised Excel-only value is answered but still needs mapping review.
  if (response.source_option === true) return true
  const matches = options.filter(option => String(option.label ?? '').trim() === answer)
  if (matches.length !== 1) return false
  const masterCode = matches[0].code == null || matches[0].code === '' ? null : Number(matches[0].code)
  return masterCode === code
}

/**
 * Prevents unrelated diagnosis-specific audit bundles from being required on
 * every inpatient episode. Explicit profile eligibility can be added later.
 */
export function isIndicatorApplicableToDiagnosis(indicatorType: unknown, diagnosis: unknown): boolean {
  const category = String(indicatorType ?? '').toLocaleLowerCase('id-ID')
  if (!category.includes('audit medis')) return true
  const clinicalDiagnosis = String(diagnosis ?? '').normalize('NFKC').toLocaleLowerCase('id-ID')
  if (!clinicalDiagnosis.trim()) return false
  const patterns: Array<[RegExp, RegExp]> = [
    [/sectio caesarea|seksio sesarea/, /sectio|seksio|caesarea|cesarea|\bsc\b/],
    [/asfiksia neonatorum/, /asfiksia|asphyxi/],
    [/tuberkulosis/, /tuberkulosis|\btbc?\b/],
    [/sirosis/, /sirosis|cirrho/],
    [/ginjal tahap akhir/, /gagal ginjal|ginjal tahap akhir|\bpgta\b|\bckd\b|\besrd\b/],
    [/\bstemi\b/, /stemi|infark miokard|myocardial infarction/],
    [/stroke/, /stroke|\bsnh\b|\bcva\b/],
    [/diabetes mellitus/, /diabet|\bdm\b/],
    [/carcinoma mammae/, /mammae|payudara|breast cancer/],
  ]
  const rule = patterns.find(([prefix]) => prefix.test(category))
  return rule ? rule[1].test(clinicalDiagnosis) : false
}
