export type LogbookOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type OptionSummary = {
  numerator: number
  denominator: number
  rate: number | null
  counts: Record<string, number>
}

function cleanChoice(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\(code\s*\d+\)\s*$/i, '')
    .toLocaleLowerCase('id-ID')
}

/** Match labels copied from Excel, including the optional trailing "(Code N)" suffix. */
export function matchLogbookOption<T extends LogbookOption>(raw: unknown, options: T[]): T | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const suffix = text.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const code = suffix ? Number(suffix[1]) : null
  const normalized = cleanChoice(text)
  const candidates = options.filter((option) => cleanChoice(option.label) === normalized)
  if (code != null) {
    const sameCode = candidates.find((option) => option.code != null && Number(option.code) === code)
    if (sameCode) return sameCode
  }
  return candidates.length === 1 ? candidates[0] : null
}

/** Replicates Excel's (follow-up timestamp - complaint timestamp) + 1 duration formula. */
export function calculateInclusiveDurationDays(start: unknown, end: unknown): number | null {
  if (start == null || end == null || String(start).trim() === '' || String(end).trim() === '') return null
  const startMs = new Date(String(start)).getTime()
  const endMs = new Date(String(end)).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return (endMs - startMs) / 86400000 + 1
}

/** Calculate indicator N/D from the option metadata (numerator and denominator flags). */
export function summarizeOptionResponses(responses: unknown[], options: LogbookOption[]): OptionSummary {
  let numerator = 0
  let denominator = 0
  const counts: Record<string, number> = {}
  for (const raw of responses) {
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : { answer: raw }
    const matched = matchLogbookOption(value.answer ?? value.occurrence ?? '', options)
    if (!matched) continue
    const label = String(matched.label)
    counts[label] = (counts[label] ?? 0) + 1
    if (matched.denominator === true) denominator += 1
    if (matched.numerator === true) numerator += 1
  }
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator * 100 : null, counts }
}

/** Source-data anomalies remain visible and are never silently corrected. */
export function complaintSourceWarnings(medicalRecordNo: unknown, complaintAt: unknown, followupAt: unknown): string[] {
  const warnings: string[] = []
  const medicalRecord = String(medicalRecordNo ?? '').trim()
  if (/^0+$/.test(medicalRecord)) {
    warnings.push('No. RM pada sumber bernilai 0; verifikasi identitas sebelum validasi.')
  }
  const complaintMs = new Date(String(complaintAt ?? '')).getTime()
  const followupMs = new Date(String(followupAt ?? '')).getTime()
  if (Number.isFinite(complaintMs) && Number.isFinite(followupMs) && followupMs < complaintMs) {
    warnings.push('Waktu tindak lanjut lebih awal daripada waktu aduan pada sumber; verifikasi urutan waktu.')
  }
  return warnings
}
