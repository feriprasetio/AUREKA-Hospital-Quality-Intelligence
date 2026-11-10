export type ClinicalTextMiningItem = {
  id: string
  label: string
  detail?: string
  profession?: string
  stage?: string
  schedule?: Array<{ day: string; policy: string }>
  text_mining?: {
    aliases?: string[]
    concept_type?: string
    requires_action_evidence?: boolean
    expected_assertion?: 'presence' | 'absence'
  }
}

export type ClinicalTextMiningStatus = 'completed' | 'planned' | 'negated' | 'uncertain'

export type ClinicalTextMiningSuggestion = {
  item_id: string
  label: string
  profession: string
  stage: string
  concept_type: string
  status: ClinicalTextMiningStatus
  confidence: number
  day: string | null
  day_candidate: string | null
  date: string | null
  match_term: string
  evidence: string
  reason: string
  source_start: number
  source_end: number
}

export type ClinicalTextMiningResult = {
  total_items: number
  matched_items: number
  completed_count: number
  planned_count: number
  negated_count: number
  uncertain_count: number
  missing_count: number
  undated_count: number
  outside_period_count: number
  suggestions: ClinicalTextMiningSuggestion[]
}

type DateAnchor = { position: number; date: string | null; day: number | null; time: string | null }

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agustus: 8, august: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, december: 12,
}

const NEGATION_RE = /\\b(tidak|tdk|tak|belum|tanpa|negatif|disangkal|dihentikan|dibatalkan|ditunda|tidak ada|belum ada|tidak ditemukan|tidak dilakukan|tidak diberikan|belum dilakukan)\\b/i
const PLANNED_RE = /\\b(rencana|direncanakan|akan\\s+(?:dilakukan|diberikan|dikerjakan|dipasang|diperiksa|dikonsulkan|dilaksanakan|dimulai)|dipertimbangkan|dipertimbangkan untuk|instruksi untuk|permintaan pemeriksaan|diminta pemeriksaan|dijadwalkan|menunggu jadwal|disiapkan untuk)\\b/i
const COMPLETED_RE = /\\b(telah|sudah|dilakukan|dilaksanakan|dikerjakan|diberikan|terpasang|diperiksa|menjalani|hasil(?:nya)?|menunjukkan|didapatkan|diperoleh|tercatat|dilaporkan|dinilai|terukur|terkontrol|membaik|stabil|baik|selesai|pasca|post[- ]?operasi)\\b/i
const RESULT_RE = /\\b(hasil|kesan|interpretasi|nilai|hb|hematokrit|trombosit|leukosit|gds|hba1c|sgot|sgpt|kreatinin|ureum|inr|aptt|pt)\\b|\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|g|mmhg|mmhg|mmol|mmo[l]?|%|ml|cc|iu|u)\\b/i
const ACTION_RE = /\\b(diberikan|disuntikkan|diinfuskan|diminum|dikonsumsi|dioleskan|terpasang|dilakukan|dikerjakan|dilaksanakan|menjalani|dipasang|dicabut|diambil|dikirim|dikonsulkan|dikunjungi|diedukasi|diajarkan|dilatih)\\b/i

function fold(value: string): string {
  return String(value || '').normalize('NFKD').replace(/\\p{M}/gu, '').toLocaleLowerCase('id-ID').replace(/\\s+/g, ' ').trim()
}

function normalizeWithOffsets(input: string): { value: string; starts: number[]; ends: number[] } {
  let value = ''
  const starts: number[] = []
  const ends: number[] = []
  for (let offset = 0; offset < input.length;) {
    const codePoint = input.codePointAt(offset)
    if (codePoint === undefined) break
    const original = String.fromCodePoint(codePoint)
    const nextOffset = offset + original.length
    const normalized = original.normalize('NFKD').replace(/\\p{M}/gu, '').toLocaleLowerCase('id-ID')
    for (const character of normalized) {
      if (/\\s/u.test(character)) {
        if (value.endsWith(' ')) {
          ends[ends.length - 1] = nextOffset
        } else {
          value += ' '
          starts.push(offset)
          ends.push(nextOffset)
        }
      } else {
        value += character
        starts.push(offset)
        ends.push(nextOffset)
      }
    }
    offset = nextOffset
  }
  return { value: value.trim(), starts, ends }
}

function isWordCharacter(value: string | undefined): boolean {
  return !!value && /[\\p{L}\\p{N}]/u.test(value)
}

function findPhraseMatches(
  normalizedText: string,
  starts: number[],
  ends: number[],
  phrase: string,
): Array<{ start: number; end: number }> {
  const normalizedPhrase = fold(phrase)
  if (!normalizedPhrase || normalizedPhrase.length < 2) return []
  const matches: Array<{ start: number; end: number }> = []
  let searchAt = 0
  while (searchAt < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedPhrase, searchAt)
    if (index < 0) break
    const finalIndex = index + normalizedPhrase.length - 1
    const before = index > 0 ? normalizedText[index - 1] : undefined
    const after = finalIndex + 1 < normalizedText.length ? normalizedText[finalIndex + 1] : undefined
    const leftBoundary = !isWordCharacter(normalizedPhrase[0]) || !isWordCharacter(before)
    const rightBoundary = !isWordCharacter(normalizedPhrase[normalizedPhrase.length - 1]) || !isWordCharacter(after)
    if (leftBoundary && rightBoundary && starts[index] !== undefined && ends[finalIndex] !== undefined) {
      matches.push({ start: starts[index], end: ends[finalIndex] })
    }
    searchAt = index + Math.max(1, normalizedPhrase.length)
  }
  return matches
}

function parseDateParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

function parseDateToken(value: string): string | null {
  const token = value.trim()
  let match = token.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/)
  if (match) return parseDateParts(Number(match[1]), Number(match[2]), Number(match[3]))
  match = token.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})$/)
  if (match) return parseDateParts(Number(match[3]), Number(match[2]), Number(match[1]))
  match = token.match(/^(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})$/i)
  if (match) {
    const monthToken = match[2].toLocaleLowerCase('id-ID')
    const month = MONTHS[monthToken] || MONTHS[monthToken.slice(0, 3)]
    if (month) return parseDateParts(Number(match[3]), month, Number(match[1]))
  }
  return null
}

function parseDateAnchors(text: string): DateAnchor[] {
  const anchors: DateAnchor[] = []
  const lines = text.split(/\\r?\\n/)
  let position = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      const explicitDay = trimmed.match(/^(?:hari\\s*(?:ke[- ]?)?|h\\s*[-:]?\\s*)(\\d{1,2})\\b/i)
      if (explicitDay) {
        anchors.push({ position, date: null, day: Number(explicitDay[1]), time: null })
      } else {
        const prefix = trimmed.match(/^(?:tanggal(?:\\s+(?:catatan|pemeriksaan|pelayanan))?\\s*[:=-]?\\s*)?(.+?)\\s*$/i)
        const candidate = prefix?.[1] || ''
        const dateMatch = candidate.match(/^(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{4}|\\d{1,2}\\s+[A-Za-z]+\\s+\\d{4})(?:[,\\s]+(\\d{1,2}:\\d{2}))?/i)
        if (dateMatch) {
          const date = parseDateToken(dateMatch[1])
          if (date) anchors.push({ position, date, day: null, time: dateMatch[2] || null })
        }
      }
    }
    position += line.length + 1
  }
  return anchors.sort((a, b) => a.position - b.position)
}

function dateDifferenceInDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
}

function anchorForPosition(anchors: DateAnchor[], position: number): DateAnchor | null {
  let result: DateAnchor | null = null
  for (const anchor of anchors) {
    if (anchor.position > position) break
    result = anchor
  }
  return result
}

function excerptFor(text: string, start: number, end: number): string {
  const lineStart = Math.max(text.lastIndexOf('\\n', start - 1) + 1, text.lastIndexOf(';', start - 1) + 1)
  const nextLine = text.indexOf('\\n', end)
  const nextSemi = text.indexOf(';', end)
  const lineEndOptions = [nextLine, nextSemi].filter((value) => value >= 0)
  let lineEnd = lineEndOptions.length ? Math.min(...lineEndOptions) : text.length
  let from = lineStart
  let to = lineEnd
  if (to - from > 260) {
    from = Math.max(from, start - 100)
    to = Math.min(to, end + 140)
  }
  return text.slice(from, to).replace(/\\s+/g, ' ').trim().slice(0, 260)
}

function classifyEvidence(
  item: ClinicalTextMiningItem,
  context: string,
  matchedText: string,
): { status: ClinicalTextMiningStatus; reason: string; confidenceAdjustment: number } {
  const config = item.text_mining || {}
  const kind = String(config.concept_type || 'clinical_activity').toLowerCase()
  const expectedAbsence = config.expected_assertion === 'absence'
  const combined = context + ' ' + matchedText
  const hasNegation = NEGATION_RE.test(combined)
  const hasPlanning = PLANNED_RE.test(context)
  const hasAction = ACTION_RE.test(context) || COMPLETED_RE.test(context)
  const hasResult = RESULT_RE.test(context)
  if (expectedAbsence) {
    if (hasNegation) {
      return { status: 'completed', reason: 'Dokumentasi mencatat tidak adanya kondisi yang menjadi kriteria item ini.', confidenceAdjustment: 0.08 }
    }
    return { status: 'negated', reason: 'Dokumentasi menyebut kondisi/temuan yang berlawanan dengan kriteria ketiadaan pada item CP.', confidenceAdjustment: 0.02 }
  }
  if (hasNegation) {
    return { status: 'negated', reason: 'Kata negasi atau pembatalan ditemukan di sekitar istilah item.', confidenceAdjustment: 0.02 }
  }
  if (hasPlanning) {
    return { status: 'planned', reason: 'Dokumentasi menunjukkan rencana, instruksi, atau permintaan; belum menjadi bukti pelaksanaan.', confidenceAdjustment: 0.04 }
  }
  if (kind === 'diagnosis') {
    if (/\\b(diagnosis|diagnosa|assessment|assesment|\\ba\\s*:|a\/)\\b/i.test(context) || hasAction) {
      return { status: 'completed', reason: 'Diagnosis tercantum dalam asesmen atau penetapan diagnosis.', confidenceAdjustment: 0.08 }
    }
    return { status: 'uncertain', reason: 'Istilah diagnosis ditemukan, tetapi konteks penetapan diagnosis belum jelas.', confidenceAdjustment: -0.12 }
  }
  if (kind === 'outcome') {
    if (hasAction || /\\b(stabil|membaik|membaik|baik|terkontrol|mandiri|bebas demam|minimal|normal|terpenuhi)\\b/i.test(context)) {
      return { status: 'completed', reason: 'Dokumentasi memuat kondisi atau outcome pasien yang relevan.', confidenceAdjustment: 0.04 }
    }
    return { status: 'uncertain', reason: 'Istilah outcome ditemukan, tetapi pernyataan hasil pasien belum cukup eksplisit.', confidenceAdjustment: -0.12 }
  }
  if (kind === 'laboratory' || kind === 'radiology') {
    if (hasResult || hasAction) {
      return { status: 'completed', reason: 'Ada petunjuk pemeriksaan telah dilakukan atau hasil pemeriksaan didokumentasikan.', confidenceAdjustment: 0.06 }
    }
    return { status: 'uncertain', reason: 'Nama pemeriksaan ditemukan tanpa bukti hasil atau pelaksanaan yang cukup.', confidenceAdjustment: -0.12 }
  }
  if (kind === 'medication') {
    if (/(\\b(diberikan|diinfuskan|disuntikkan|diminum|dikonsumsi|bolus|injeksi|infus)\\b)/i.test(context)) {
      return { status: 'completed', reason: 'Dokumentasi memuat bukti pemberian atau penggunaan obat.', confidenceAdjustment: 0.08 }
    }
    return { status: 'uncertain', reason: 'Nama obat ditemukan, tetapi bukti administrasi/pemberian belum jelas.', confidenceAdjustment: -0.12 }
  }
  if (hasAction) {
    return { status: 'completed', reason: 'Dokumentasi memuat kata kerja pelaksanaan atau hasil yang berkaitan dengan item.', confidenceAdjustment: 0.06 }
  }
  if (kind === 'assessment' && /\\b(s:|o:|a:|p:|soap|cppt|pengkajian|asesmen|anamnesis)\\b/i.test(context)) {
    return { status: 'uncertain', reason: 'Konteks SOAP/CPPT relevan, tetapi tindakan/asesmen belum dinyatakan secara eksplisit.', confidenceAdjustment: -0.08 }
  }
  return { status: 'uncertain', reason: 'Istilah item ditemukan, tetapi status pelaksanaan tidak dapat dipastikan dari konteks.', confidenceAdjustment: -0.12 }
}

export function analyzeClinicalPathwayText(input: {
  text: string
  items: ClinicalTextMiningItem[]
  admissionDate?: string
  days?: string[]
}): ClinicalTextMiningResult {
  const text = String(input.text || '')
  const items = Array.isArray(input.items) ? input.items : []
  const maxDays = new Set((input.days || []).map(String))
  const normalized = normalizeWithOffsets(text)
  const anchors = parseDateAnchors(text)
  const admissionDate = input.admissionDate ? parseDateToken(input.admissionDate.slice(0, 10)) : null
  const grouped = new Map<string, ClinicalTextMiningSuggestion[]>()
  const matchedItemIds = new Set<string>()
  let undatedCount = 0
  let outsidePeriodCount = 0

  for (const item of items) {
    const rawTerms = [item.label, ...(item.text_mining?.aliases || [])]
    const seenTerms = new Set<string>()
    const terms = rawTerms.map((term) => String(term || '').trim()).filter((term) => {
      const folded = fold(term)
      if (folded.length < 2 || seenTerms.has(folded)) return false
      seenTerms.add(folded)
      return true
    })
    const matches: Array<{ term: string; start: number; end: number }> = []
    for (const term of terms) {
      for (const hit of findPhraseMatches(normalized.value, normalized.starts, normalized.ends, term)) {
        matches.push({ term, start: hit.start, end: hit.end })
      }
    }
    matches.sort((a, b) => a.start - b.start || b.term.length - a.term.length)
    const deduped = matches.filter((match, index) => {
      const previous = matches[index - 1]
      return !previous || previous.start !== match.start || previous.end !== match.end
    })
    const byDay = new Map<string, ClinicalTextMiningSuggestion[]>()
    for (const match of deduped) {
      const evidence = excerptFor(text, match.start, match.end)
      const local = evidence
      const matchText = text.slice(match.start, match.end)
      const classification = classifyEvidence(item, local, matchText)
      const anchor = anchorForPosition(anchors, match.start)
      let date = anchor?.date || null
      let day: string | null = null
      let dayCandidate: string | null = null
      if (anchor?.day != null) {
        dayCandidate = String(anchor.day)
        if (!maxDays.size || maxDays.has(dayCandidate)) day = dayCandidate
        else outsidePeriodCount += 1
      } else if (date && admissionDate) {
        const calculated = dateDifferenceInDays(admissionDate, date) + 1
        dayCandidate = String(calculated)
        if (calculated >= 1 && (!maxDays.size || maxDays.has(dayCandidate))) day = dayCandidate
        else outsidePeriodCount += 1
      }
      if (!day) undatedCount += 1
      const exactLabel = fold(match.term) === fold(item.label)
      let confidence = exactLabel ? 0.84 : 0.76
      confidence += classification.confidenceAdjustment
      if (anchor?.time) confidence += 0.03
      confidence = Math.max(0.35, Math.min(0.98, Number(confidence.toFixed(2))))
      const suggestion: ClinicalTextMiningSuggestion = {
        item_id: item.id,
        label: item.label,
        profession: item.profession || '',
        stage: item.stage || '',
        concept_type: item.text_mining?.concept_type || 'clinical_activity',
        status: classification.status,
        confidence,
        day,
        day_candidate: dayCandidate,
        date,
        match_term: match.term,
        evidence,
        reason: classification.reason,
        source_start: match.start,
        source_end: match.end,
      }
      const key = day || 'undated'
      byDay.set(key, [...(byDay.get(key) || []), suggestion])
      matchedItemIds.add(item.id)
    }
    for (const [dayKey, entries] of byDay) {
      const statuses = new Set(entries.map((entry) => entry.status))
      let status: ClinicalTextMiningStatus
      if (statuses.has('completed') && statuses.has('negated')) status = 'uncertain'
      else if (statuses.has('completed')) status = 'completed'
      else if (statuses.has('negated')) status = 'negated'
      else if (statuses.has('planned')) status = 'planned'
      else status = 'uncertain'
      const best = entries.slice().sort((a, b) => b.confidence - a.confidence)[0]
      const merged: ClinicalTextMiningSuggestion = {
        ...best,
        status,
        confidence: status === 'uncertain' && statuses.size > 1 ? Math.min(best.confidence, 0.62) : best.confidence,
        evidence: entries.length > 1
          ? entries.map((entry) => entry.evidence).filter((value, index, all) => value && all.indexOf(value) === index).slice(0, 2).join(' | ')
          : best.evidence,
        reason: statuses.size > 1
          ? 'Ada lebih dari satu konteks/penegasan yang berbeda pada hari yang sama; perlu verifikasi PIC.'
          : best.reason,
        source_start: Math.min(...entries.map((entry) => entry.source_start)),
        source_end: Math.max(...entries.map((entry) => entry.source_end)),
      }
      const groupKey = item.id + '|' + dayKey
      grouped.set(groupKey, [merged])
    }
  }

  const suggestions = Array.from(grouped.values()).flat().sort((a, b) => {
    const dayA = Number(a.day || a.day_candidate || 99)
    const dayB = Number(b.day || b.day_candidate || 99)
    return dayA - dayB || a.profession.localeCompare(b.profession, 'id') || a.label.localeCompare(b.label, 'id')
  })
  const count = (status: ClinicalTextMiningStatus) => suggestions.filter((row) => row.status === status).length
  return {
    total_items: items.length,
    matched_items: matchedItemIds.size,
    completed_count: count('completed'),
    planned_count: count('planned'),
    negated_count: count('negated'),
    uncertain_count: count('uncertain'),
    missing_count: Math.max(0, items.length - matchedItemIds.size),
    undated_count: suggestions.filter((row) => !row.day).length,
    outside_period_count: outsidePeriodCount,
    suggestions,
  }
}
