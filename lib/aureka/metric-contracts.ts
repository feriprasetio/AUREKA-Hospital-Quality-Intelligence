import type { SupabaseClient } from '@supabase/supabase-js'

export type MetricReadStatus = 'complete' | 'unavailable'
export type MetricRead<T> = {
  status: MetricReadStatus
  data: T | null
  source: string
  retrievedAt: string
  error?: string
}

export type MetricCount = { label: string; count: number }
export type MetricMonth = { month: number; total: number; validated?: number }
export type QualityRoomReportingRow = {
  room_id: number
  month: number
  total: number
  latest_report_at: string | null
  latest_period: string | null
}

export type AurekaPortfolioSummary = {
  year: number
  room_id: number | null
  room_name: string
  quality: {
    active_indicators: number
    records: number
    validated: number
    validation_rate: number
    monthly: MetricMonth[]
    categories: MetricCount[]
  }
  clinical: {
    episodes: number
    validated_episodes: number
    validation_rate: number
    monthly: MetricMonth[]
    categories: MetricCount[]
    clinical_pathway_audits: number
    clinical_pathway_validated: number
    clinical_death_audits: number
    clinical_death_validated: number
  }
  incidents: { total: number; open: number; closed: number; monthly: MetricMonth[] }
  risk: {
    total: number
    very_high: number
    open: number
    relationships: number
    monthly: MetricMonth[]
    levels: MetricCount[]
    categories: MetricCount[]
  }
  program: {
    recommendations: number
    actions: number
    open_actions: number
    overdue_actions: number
    completed_actions: number
  }
}

export type AurekaProgramList = {
  actions?: Array<Record<string, unknown>>
  recommendations?: Array<Record<string, unknown>>
  priorities?: Array<Record<string, unknown>>
  [key: string]: unknown
}

const stamp = () => new Date().toISOString()
const failure = <T,>(source: string, error: unknown): MetricRead<T> => ({
  status: 'unavailable',
  data: null,
  source,
  retrievedAt: stamp(),
  error: error instanceof Error ? error.message : String((error as { message?: unknown })?.message || 'Sumber data tidak tersedia.'),
})

/**
 * Shared read-only contracts for cross-workspace indicators.
 * These functions reuse existing secured RPCs and preserve null/unavailable states.
 * They do not duplicate or persist operational data.
 */
export async function readAurekaPortfolioSummary(
  client: SupabaseClient,
  year: number,
  roomId: number | null,
): Promise<MetricRead<AurekaPortfolioSummary>> {
  const source = 'aureka_gov_infographics_summary_secure'
  try {
    const { data, error } = await client.rpc(source, { p_year: year, p_room: roomId })
    if (error) return failure(source, error)
    const sections = ['quality', 'clinical', 'incidents', 'risk', 'program'] as const
    if (!data || sections.some(key => !data[key] || typeof data[key] !== 'object' || Array.isArray(data[key]))) {
      return failure(source, new Error('Ringkasan belum memuat seluruh bagian yang diperlukan.'))
    }
    return { status: 'complete', data: data as AurekaPortfolioSummary, source, retrievedAt: stamp() }
  } catch (error) {
    return failure(source, error)
  }
}

export async function readAurekaQualityRoomReportingStatus(
  client: SupabaseClient,
  year: number,
): Promise<MetricRead<QualityRoomReportingRow[]>> {
  const source = 'aureka_quality_room_reporting_status'
  try {
    const { data, error } = await client.rpc(source, { p_year: year })
    if (error) return failure(source, error)
    if (!Array.isArray(data)) return failure(source, new Error('Status pelaporan tidak berbentuk daftar.'))
    const rows = data.map((row: Record<string, unknown>) => ({
      room_id: Number(row.room_id),
      month: Number(row.month),
      total: Number(row.total),
      latest_report_at: row.latest_report_at ? String(row.latest_report_at) : null,
      latest_period: row.latest_period ? String(row.latest_period) : null,
    })).filter((row: QualityRoomReportingRow) =>
      Number.isFinite(row.room_id) && Number.isFinite(row.month) && Number.isFinite(row.total))
    return { status: 'complete', data: rows, source, retrievedAt: stamp() }
  } catch (error) {
    return failure(source, error)
  }
}

export async function readAurekaOverdueIncidents(
  client: SupabaseClient,
  options: { unitName?: string | null; olderThanHours?: number } = {},
): Promise<MetricRead<number>> {
  const source = 'aureka_patient_safety.incidents'
  try {
    const olderThanHours = Math.max(0, options.olderThanHours ?? 48)
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
    let query: any = client.schema('aureka_patient_safety').from('incidents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_review'])
      .lt('created_at', cutoff)
    if (options.unitName) query = query.eq('unit_name', options.unitName)
    const { count, error } = await query
    if (error) return failure(source, error)
    if (count == null) return failure(source, new Error('Jumlah insiden tertunda tidak tersedia.'))
    return { status: 'complete', data: count, source, retrievedAt: stamp() }
  } catch (error) {
    return failure(source, error)
  }
}

export async function readAurekaProgramList(
  client: SupabaseClient,
  year: number,
): Promise<MetricRead<AurekaProgramList>> {
  const source = 'aureka_gov_program_list'
  try {
    const { data, error } = await client.rpc(source, { p_year: year })
    if (error) return failure(source, error)
    if (!data || typeof data !== 'object') return failure(source, new Error('Daftar program tidak mengembalikan payload.'))
    return { status: 'complete', data: data as AurekaProgramList, source, retrievedAt: stamp() }
  } catch (error) {
    return failure(source, error)
  }
}
