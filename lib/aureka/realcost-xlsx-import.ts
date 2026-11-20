import {
  REALCOST_COST_COMPONENTS,
  analyzeRealcostEpisodes,
  type RealcostEpisode,
  type RealcostCostMap,
} from '@/lib/aureka/realcost-engine'

export type RealcostPatientIdentity = {
  episode_id: string
  patient_name: string | null
  medical_record_number: string | null
  sep_number: string | null
  insurance_number: string | null
  attending_physician: string | null
  coder_id: string | null
}

export type RealcostPreparedImport = {
  episodes: RealcostEpisode[]
  identities: RealcostPatientIdentity[]
  findings: {
    sheet_name: string
    header_row: number
    source_rows: number
    valid_rows: number
    invalid_rows: number
    duplicate_episode_keys: number
    period_start: string
    period_end: string
    cost_component_mismatches: number
    c2_billing_group_mismatches: number
    c2_tarif_mismatches: number
    total_tarif_package_exceptions: number
    warnings: string[]
    errors: string[]
  }
}

const IDENTITY_HEADERS = new Set([
  'NAMA_PASIEN', 'MRN', 'SEP', 'NOKARTU', 'DPJP', 'CODER_ID', 'C1',
])

function plainValue(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(item, 'result')) return plainValue(item.result)
    if (Array.isArray(item.richText)) return item.richText.map(part => String((part as Record<string, unknown>)?.text ?? '')).join('')
    if (typeof item.text === 'string') return item.text
    if (typeof item.hyperlink === 'string') return String(item.text ?? item.hyperlink)
    return JSON.stringify(value)
  }
  return value
}

export function realcostText(value: unknown): string {
  const clean = plainValue(value)
  return clean == null ? '' : String(clean).trim()
}

export function realcostNumber(value: unknown): number | null {
  const clean = plainValue(value)
  if (clean == null || clean === '') return null
  if (typeof clean === 'number') return Number.isFinite(clean) ? clean : null
  let raw = String(clean).trim().replace(/\s/g, '').replace(/[^\d,().+-]/g, '')
  if (!raw || raw === '-' || raw === '+') return null
  const negative = raw.startsWith('(') && raw.endsWith(')')
  raw = raw.replace(/[()]/g, '')
  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  } else if (comma >= 0) {
    raw = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.')
  } else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, '')
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null
}

export function realcostDate(value: unknown): string | null {
  const clean = plainValue(value)
  if (clean == null || clean === '') return null
  if (clean instanceof Date) return Number.isNaN(clean.getTime()) ? null : clean.toISOString().slice(0, 10)
  if (typeof clean === 'number' && Number.isFinite(clean) && clean >= 20000 && clean <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(clean) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  const raw = String(clean).trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw)
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    if (date.getUTCFullYear() === Number(iso[1]) && date.getUTCMonth() === Number(iso[2]) - 1 && date.getUTCDate() === Number(iso[3])) return date.toISOString().slice(0, 10)
  }
  const dmy = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})/.exec(raw)
  if (dmy) {
    const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])))
    if (date.getUTCFullYear() === Number(dmy[3]) && date.getUTCMonth() === Number(dmy[2]) - 1 && date.getUTCDate() === Number(dmy[1])) return date.toISOString().slice(0, 10)
  }
  return null
}

function normalizeHeader(value: unknown): string {
  return realcostText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toUpperCase()
}

function splitCodes(value: unknown): string[] {
  return realcostText(value).split(/[;|,]+/).map(code => code.trim()).filter(Boolean)
}

function embeddedJsonObjects(raw: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  for (let start = raw.indexOf('{'); start >= 0; start = raw.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }
    if (end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end)) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) found.push(parsed as Record<string, unknown>)
      } catch { /* Malformed embedded JSON is retained as a row-level reconciliation finding. */ }
    }
  }
  return found
}

export function extractRealcostBillingGroup(value: unknown): { billing_group: Record<string, number>; total_tarif_rs: number | null } {
  const raw = realcostText(value)
  const objects = embeddedJsonObjects(raw)
  const detail = objects.find(item => item.billing_group && typeof item.billing_group === 'object')
  if (!detail) return { billing_group: {}, total_tarif_rs: null }
  const rawGroup = detail.billing_group as Record<string, unknown>
  const billing: Record<string, number> = {}
  for (const component of REALCOST_COST_COMPONENTS) {
    const amount = realcostNumber(rawGroup[component.billingKey])
    if (amount != null) billing[component.billingKey] = amount
  }
  return { billing_group: billing, total_tarif_rs: realcostNumber(detail.total_tarif_rs) }
}

function serializeSourcePayload(headers: string[], values: unknown[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  headers.forEach((header, index) => {
    if (!header || IDENTITY_HEADERS.has(header) || header === 'C2') return
    const value = plainValue(values[index])
    if (value !== null && value !== '') payload[header] = value
  })
  return payload
}

async function hashEpisodeKey(rawKey: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung SHA-256. Gunakan browser modern untuk mengimpor workbook.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey))
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung SHA-256. Gunakan browser modern untuk mengimpor workbook.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
}

export { hashBuffer as hashRealcostWorkbook }

function headerPosition(grid: unknown[][]): { rowIndex: number; headers: string[] } | null {
  const required = [
    'ADMISSION_DATE', 'DISCHARGE_DATE', 'INACBG', 'TARIF_INACBG', 'TARIF_RS',
    'TOTAL_TARIF', 'LOS', ...REALCOST_COST_COMPONENTS.map(item => item.key),
  ]
  const maxScan = Math.min(grid.length, 20)
  for (let rowIndex = 0; rowIndex < maxScan; rowIndex++) {
    const headers = (grid[rowIndex] ?? []).map(normalizeHeader)
    const headerSet = new Set(headers)
    if (required.every(header => headerSet.has(header))) return { rowIndex, headers }
  }
  return null
}

export async function prepareRealcostImport(grid: unknown[][], sheetName: string): Promise<RealcostPreparedImport> {
  if (!Array.isArray(grid) || grid.length < 2) throw new Error('Worksheet tidak memiliki baris header dan data.')
  const header = headerPosition(grid)
  if (!header) {
    throw new Error('Header wajib Audit Realcost tidak ditemukan. Pastikan terdapat tanggal masuk/keluar, kode INA-CBG, tarif, LOS, dan seluruh 18 komponen biaya.')
  }

  const headers = header.headers
  const headerIndex = new Map<string, number>()
  headers.forEach((value, index) => { if (value && !headerIndex.has(value)) headerIndex.set(value, index) })
  const get = (values: unknown[], key: string): unknown => values[headerIndex.get(key) ?? -1]
  const warnings: string[] = []
  const errors: string[] = []
  const episodes: RealcostEpisode[] = []
  const identities: RealcostPatientIdentity[] = []
  const seenKeys = new Set<string>()
  const periodDates: string[] = []
  let sourceRows = 0
  let invalidRows = 0
  let duplicateEpisodeKeys = 0

  for (let rowIndex = header.rowIndex + 1; rowIndex < grid.length; rowIndex++) {
    const values = grid[rowIndex] ?? []
    if (!values.some(value => realcostText(value) !== '')) continue
    sourceRows++
    const sourceRow = rowIndex + 1
    const dischargeDate = realcostDate(get(values, 'DISCHARGE_DATE'))
    const admissionDate = realcostDate(get(values, 'ADMISSION_DATE'))
    const inacbgCode = realcostText(get(values, 'INACBG'))
    const tarifInacbg = realcostNumber(get(values, 'TARIF_INACBG'))
    const tarifRs = realcostNumber(get(values, 'TARIF_RS'))
    const totalTarif = realcostNumber(get(values, 'TOTAL_TARIF'))
    const los = realcostNumber(get(values, 'LOS'))
    const rowProblems: string[] = []
    if (!dischargeDate) rowProblems.push('DISCHARGE_DATE tidak terbaca')
    if (!admissionDate) rowProblems.push('ADMISSION_DATE tidak terbaca')
    if (!inacbgCode) rowProblems.push('INACBG kosong')
    if (tarifInacbg == null) rowProblems.push('TARIF_INACBG bukan angka')
    if (tarifRs == null) rowProblems.push('TARIF_RS bukan angka')
    if (totalTarif == null) rowProblems.push('TOTAL_TARIF bukan angka')
    if (los == null || los < 0) rowProblems.push('LOS tidak valid')

    const costComponents: Partial<RealcostCostMap> = {}
    for (const component of REALCOST_COST_COMPONENTS) {
      const amount = realcostNumber(get(values, component.key))
      if (amount == null || amount < 0) rowProblems.push(component.key + ' bukan nilai numerik yang valid')
      else (costComponents as Record<string, number>)[component.key] = amount
    }
    if (rowProblems.length) {
      invalidRows++
      if (errors.length < 25) errors.push('Baris Excel ' + sourceRow + ': ' + rowProblems.join('; '))
      continue
    }

    const sep = realcostText(get(values, 'SEP'))
    const c1 = realcostText(get(values, 'C1'))
    const sourceKey = sep || c1 || (sheetName + ':row:' + sourceRow)
    const episodeKeyHash = await hashEpisodeKey(sourceKey)
    if (seenKeys.has(episodeKeyHash)) {
      duplicateEpisodeKeys++
      invalidRows++
      if (errors.length < 25) errors.push('Baris Excel ' + sourceRow + ': kunci episode sumber berulang (SEP/C1).')
      continue
    }
    seenKeys.add(episodeKeyHash)
    periodDates.push(dischargeDate as string)

    const c2 = extractRealcostBillingGroup(get(values, 'C2'))
    const episodeId = globalThis.crypto.randomUUID()
    const billingMismatch = REALCOST_COST_COMPONENTS.some(component => {
      const sourceValue = (costComponents as Record<string, number>)[component.key]
      const billingValue = c2.billing_group[component.billingKey]
      return billingValue != null && Math.abs(sourceValue - billingValue) > 1
    })
    if (billingMismatch && warnings.length < 25) warnings.push('Baris Excel ' + sourceRow + ': rincian C2 billing_group berbeda dari kolom komponen biaya.')
    if (!Object.keys(c2.billing_group).length && warnings.length < 25) warnings.push('Baris Excel ' + sourceRow + ': billing_group C2 tidak dapat diparse; rekonsiliasi C2 dilewati.')

    const allSourceHeaders = headers
    const sourcePayload = serializeSourcePayload(allSourceHeaders, values)
    const episode: RealcostEpisode = {
      id: episodeId,
      source_row: sourceRow,
      episode_key_hash: episodeKeyHash,
      admission_date: admissionDate,
      discharge_date: dischargeDate as string,
      class_code: realcostText(get(values, 'KELAS_RAWAT')) || 'Tidak diketahui',
      inacbg_code: inacbgCode,
      inacbg_description: realcostText(get(values, 'DESKRIPSI_INACBG')),
      tariff_inacbg: tarifInacbg as number,
      tarif_rs: tarifRs as number,
      total_tarif: totalTarif as number,
      tarif_poli_eks: realcostNumber(get(values, 'TARIF_POLI_EKS')) ?? 0,
      los: los as number,
      icu_indicator: ['1', 'true', 'ya'].includes(realcostText(get(values, 'ICU_INDIKATOR')).toLowerCase()),
      icu_los: realcostNumber(get(values, 'ICU_LOS')) ?? 0,
      vent_hour: realcostNumber(get(values, 'VENT_HOUR')) ?? 0,
      discharge_status: realcostText(get(values, 'DISCHARGE_STATUS')) || 'Tidak diketahui',
      diagnosis_codes: splitCodes(get(values, 'DIAGLIST')),
      procedure_codes: splitCodes(get(values, 'PROCLIST')),
      cost_components: costComponents,
      billing_group: c2.billing_group,
      billing_group_total_tarif_rs: c2.total_tarif_rs,
      source_payload: sourcePayload,
    }
    episodes.push(episode)

    identities.push({
      episode_id: episodeId,
      patient_name: realcostText(get(values, 'NAMA_PASIEN')) || null,
      medical_record_number: realcostText(get(values, 'MRN')) || null,
      sep_number: sep || null,
      insurance_number: realcostText(get(values, 'NOKARTU')) || null,
      attending_physician: realcostText(get(values, 'DPJP')) || null,
      coder_id: realcostText(get(values, 'CODER_ID')) || null,
    })
  }

  if (!episodes.length) throw new Error('Tidak ada episode yang lolos validasi. ' + (errors[0] ?? 'Periksa kembali isi worksheet.'))
  const calculated = analyzeRealcostEpisodes(episodes)
  if (calculated.reconciliation.component_total_mismatch_count > 0 && warnings.length < 25) {
    warnings.push(calculated.reconciliation.component_total_mismatch_count + ' episode memiliki jumlah 18 komponen yang berbeda dari TARIF_RS.')
  }
  if (calculated.reconciliation.c2_billing_group_mismatch_count > 0 && warnings.length < 25) {
    warnings.push('Rincian billing_group C2 tidak sama dengan nilai komponen biaya.')
  }
  if (calculated.reconciliation.c2_total_tarif_mismatch_count > 0 && warnings.length < 25) {
    warnings.push('Nilai total_tarif_rs di C2 tidak sama dengan TARIF_RS.')
  }
  if (calculated.reconciliation.total_tarif_vs_package_mismatch_count > 0 && warnings.length < 25) {
    warnings.push('TOTAL_TARIF berbeda dari TARIF_INACBG + TARIF_POLI_EKS pada ' + calculated.reconciliation.total_tarif_vs_package_mismatch_count + ' episode; perlu konfirmasi definisi sumber, tidak otomatis dianggap kesalahan.')
  }

  return {
    episodes,
    identities,
    findings: {
      sheet_name: sheetName,
      header_row: header.rowIndex + 1,
      source_rows: sourceRows,
      valid_rows: episodes.length,
      invalid_rows: invalidRows,
      duplicate_episode_keys: duplicateEpisodeKeys,
      period_start: [...periodDates].sort()[0] ?? '',
      period_end: [...periodDates].sort().at(-1) ?? '',
      cost_component_mismatches: calculated.reconciliation.component_total_mismatch_count,
      c2_billing_group_mismatches: calculated.reconciliation.c2_billing_group_mismatch_count,
      c2_tarif_mismatches: calculated.reconciliation.c2_total_tarif_mismatch_count,
      total_tarif_package_exceptions: calculated.reconciliation.total_tarif_vs_package_mismatch_count,
      warnings,
      errors,
    },
  }
}
