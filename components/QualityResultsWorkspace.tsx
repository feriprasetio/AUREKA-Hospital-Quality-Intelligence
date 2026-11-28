'use client'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'

import { useEffect, useMemo, useState } from 'react'
import { readPagesWithLimit } from '@/lib/aureka/pagination'
import { readIndicatorResultDataset } from '@/lib/aureka/quality-result-dataset'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import SpcChart from '@/components/quality/SpcChart'
import QualityCategoryIntelligence from '@/components/quality/QualityCategoryIntelligence'
import ValidatedIndicatorBriefing from '@/components/quality/ValidatedIndicatorBriefing'
import { resolveQualityCategory } from '@/lib/aureka/quality-category-engine'
import { groupComparable, buildInmRows, isInm, INM_COLUMNS } from '@/lib/aureka/unit-compare'
import { buildCsv, buildCsvTable, downloadCsv } from '@/lib/aureka/csv-export'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { compareToTarget } from '@/lib/aureka/indicator-engine'
import { aggregatePharmacyMetric, combinePharmacyMetric } from '@/lib/aureka/pharmacy-logbook'
import { isOutpatientWaitingIndicator, OUTPATIENT_WAITING_MINUTES_FIELD, outpatientWaitingMinutes, summarizeOutpatientClinics, outpatientWaitingThreshold, type OutpatientProviderGroup } from '@/lib/aureka/outpatient-logbook'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'
import {
  aggregateClinicalDeathAudits,
  aggregateClinicalDeathByValidationMonth,
  aggregateClinicalPathwayRows,
  aggregatePathwayByMonth,
  calculateIndicatorResult,
  calculateIndicatorResultsForProfiles,
  diagnoseIndicator,
  isResultStatusIncluded,
  indicatorProfileIssue,
  type ClinicalDeathAuditResultRow,
  type ClinicalPathwayRow,
  type IndicatorProfileForResults,
  type ResultRecord,
} from '@/lib/aureka/quality-results-engine'

type Room = { id: number; name: string }
type Mode = 'indicators' | 'pathway' | 'clinical-death'
type ClinicalTab = 'clinical' | 'death'
type Props = {
  mode: Mode
  initialRoomId: number | null
  rooms: Room[]
  canViewAllRooms: boolean
  onRoomChange?: (roomId: number | null) => void
  lockRoomScope?: boolean
  /** Blueprint v2 §3: Hasil Capaian — 'unit' (Unit Keseluruhan) atau 'category' (Kategori Indikator) */
  groupBy?: 'unit' | 'category'
  onAskNara?: (prompt: string, source: string) => void
  arcticBriefing?: boolean
}
type IndicatorDataset = { profiles: IndicatorProfileForResults[]; rows: ResultRecord[] }
type PathwayDataset = ClinicalPathwayRow[]
type ClinicalDataset = ClinicalDeathAuditResultRow[]

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

type OperationalCalendarParts = { year: number; month: number; iso: string }
type OperationalLayout = { roomId: number; providerGroups?: OutpatientProviderGroup[] }
const OUTPATIENT_PROVIDER_GROUPS =
  (qualityAuditLayout2026 as OperationalLayout[]).find((layout) => Number(layout.roomId) === 11)?.providerGroups ?? []

function parseOperationalCalendarDate(value: unknown): OperationalCalendarParts | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const check = new Date(Date.UTC(year, month - 1, day))
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
    return { year, month, iso: `${iso[1]}-${iso[2]}-${iso[3]}` }
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    const check = new Date(Date.UTC(year, month - 1, day))
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
    return {
      year,
      month,
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    iso: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
  }
}

function operationalFormFields(row: ResultRecord): Record<string, any> {
  const core = row.core_data ?? {}
  const fields = core.form_fields ?? core.form_data
  return fields && typeof fields === 'object' ? fields as Record<string, any> : {}
}

function operationalRecordDate(row: ResultRecord): string {
  const core = row.core_data ?? {}
  const fields = operationalFormFields(row)
  const candidates = [
    row.record_date,
    core.record_date,
    core.admission_at,
    core.admit,
    fields['Tanggal pengamatan'],
    fields['Tanggal Masuk'],
    fields['Tanggal Audit'],
    fields['Tanggal Dilayani'],
    fields['Tanggal Permintaan'],
  ]
  const found = candidates.find((value) => value != null && String(value).trim() !== '')
  return String(found ?? '')
}

function operationalCalendarParts(row: ResultRecord): OperationalCalendarParts | null {
  return parseOperationalCalendarDate(operationalRecordDate(row))
}

function normalizeRoom(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function defaultRoom(rooms: Room[], initialRoomId: number | null, canViewAllRooms: boolean): number | null {
  const initial = normalizeRoom(initialRoomId)
  if (initial != null) return initial
  if (canViewAllRooms) return null
  return normalizeRoom(rooms[0]?.id)
}

function formatCount(value: number | null | undefined): string {
  return value == null ? '-' : Number(value).toLocaleString('id-ID')
}

function formatPct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? '-' : Number(value).toFixed(2).replace('.', ',') + '%'
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Belum ada data'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Belum ada data'
    : date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Pontianak' })
}

function modeTitle(mode: Mode): string {
  if (mode === 'indicators') return 'Hasil Audit Indikator Mutu'
  if (mode === 'pathway') return 'Hasil Audit Clinical Pathway'
  return 'Hasil Audit Klinis dan Kematian'
}

function targetLabel(profile: IndicatorProfileForResults): string {
  return String(profile.target_text ?? profile.schema_json?.target_text ?? 'Target belum ditetapkan')
}

function indicatorMonthlyLabel(result: ReturnType<typeof calculateIndicatorResult>, month: number): string {
  const item = result.monthly[month - 1]
  if (!item || item.observations === 0) return '-'
  if (result.continuous) {
    const unit = result.unit ? ' ' + result.unit : ''
    const mean = item.mean == null ? '-' : item.mean.toFixed(2).replace('.', ',') + unit
    return mean + (item.targetAttainment == null ? '' : ' · ' + formatPct(item.targetAttainment) + ' target')
  }
  return formatPct(item.rate)
}

function attainmentCaption(result: ReturnType<typeof calculateIndicatorResult>, includeReady: boolean): string {
  if (result.validatedRecords === 0 && !(includeReady && result.readyRecords > 0)) return 'Belum ada data tervalidasi'
  if (result.continuous) {
    return result.annualTargetAttainment == null
      ? 'Rerata pengukuran; target per observasi belum dapat dihitung'
      : formatPct(result.annualTargetAttainment) + ' observasi memenuhi target'
  }
  return result.annualNumerator.toLocaleString('id-ID') + ' / ' + result.annualDenominator.toLocaleString('id-ID') + ' (N/D)'
}

function StatusPill({ value }: { value: boolean | null }) {
  if (value == null) return <span className="qraPill muted">Belum dapat dinilai</span>
  return <span className={'qraPill ' + (value ? 'good' : 'poor')}>{value ? 'Memenuhi target' : 'Belum memenuhi'}</span>
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="qraKpi"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="qraEmpty"><div className="qraEmptyIcon" aria-hidden="true">▤</div><strong>{title}</strong><p>{detail}</p></div>
}

function Bar({ value, max = 100, label, sublabel, suffix = '%' }: { value: number | null; max?: number; label: string; sublabel?: string; suffix?: string }) {
  const width = value == null || !Number.isFinite(value) || max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  const display = value == null || !Number.isFinite(value) ? '-' : Number(value).toFixed(suffix === '%' ? 1 : 0).replace('.', ',') + suffix
  return <div className="qraBarRow"><div className="qraBarLabel"><span>{label}</span><strong>{display}</strong></div><div className="qraBarTrack"><span style={{ width: width + '%' }} /></div>{sublabel && <small>{sublabel}</small>}</div>
}

function Distribution({ summary, minimum, maximum }: { summary: { n: number; distribution: Record<number, number> }; minimum: number; maximum: number }) {
  const largest = Math.max(1, ...Array.from({ length: maximum - minimum + 1 }, (_, index) => summary.distribution[minimum + index] ?? 0))
  return <div className="qraDistribution">{Array.from({ length: maximum - minimum + 1 }, (_, index) => {
    const score = minimum + index
    const count = summary.distribution[score] ?? 0
    return <div className="qraDistributionItem" key={score}><span>{score}</span><div><i style={{ width: (count / largest * 100) + '%' }} /></div><b>{count}</b></div>
  })}</div>
}

const RECORD_LIMIT = 10000

export default function QualityResultsWorkspace({ mode, initialRoomId, rooms, canViewAllRooms, onRoomChange, lockRoomScope = false, groupBy = 'unit', onAskNara, arcticBriefing = false }: Props) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [roomId, setRoomId] = useState<number | null>(() => defaultRoom(rooms, initialRoomId, canViewAllRooms))
  useEffect(() => {
    const incoming = normalizeRoom(initialRoomId)
    if (incoming !== roomId) setRoomId(incoming)
  }, [initialRoomId])
  useEffect(() => {
    if (roomId == null) {
      const initial = defaultRoom(rooms, initialRoomId, canViewAllRooms)
      if (initial != null) setRoomId(initial)
    }
  }, [roomId, rooms, initialRoomId, canViewAllRooms])

  useEffect(() => {
    if (canViewAllRooms) onRoomChange?.(roomId)
    else if (roomId != null) onRoomChange?.(roomId)
  }, [roomId, onRoomChange, canViewAllRooms])
  const [year, setYear] = useState(2026)
  const [clinicalTab, setClinicalTab] = useState<ClinicalTab>('clinical')
  const [indicatorData, setIndicatorData] = useState<IndicatorDataset>({ profiles: [], rows: [] })
  // Official INM export always uses the validated dataset. The checkbox adds ready reports to the on-screen view.
  const [includeReadyPreference, setIncludeReady] = useState<boolean | null>(null)
  const rawReadyCount = useMemo(() => indicatorData.rows.filter((row) => String(row.status ?? '').toLowerCase() === 'ready').length, [indicatorData])
  const rawValidatedCount = useMemo(() => indicatorData.rows.filter((row) => String(row.status ?? '').toLowerCase() === 'validated').length, [indicatorData])
  const includeReady = includeReadyPreference ?? (rawReadyCount > 0 && rawValidatedCount === 0)
  const [pathwayData, setPathwayData] = useState<PathwayDataset>([])
  const [clinicalData, setClinicalData] = useState<ClinicalDataset>([])
  const [reading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const scope = JSON.stringify([mode, roomId, year, canViewAllRooms, reload])
  const [finishedScope, setFinishedScope] = useState('')
  const loading = reading || finishedScope !== scope

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setIndicatorData({ profiles: [], rows: [] })
    setPathwayData([])
    setClinicalData([])
    setWhyFor(null)
    setSpcFor(null)
    setSourceFor(null)

    const requireComplete = (capped: boolean) => {
      if (capped) throw new Error('Cakupan ini memuat lebih dari ' + RECORD_LIMIT.toLocaleString('id-ID') + ' catatan. Pilih satu unit atau tahun lain untuk melihat hasil lengkap dan mengunduh laporan.')
    }

    const load = async () => {
      const selectedRoom = normalizeRoom(roomId)
      if (selectedRoom == null && !canViewAllRooms) {
        throw new Error('Unit kerja belum terpetakan. Pilih unit yang valid sebelum melihat hasil audit.')
      }

      if (mode === 'indicators') {
        // Tanggal pelayanan bisa tersimpan di record_date, core_data.record_date, admission_at, atau
        // kolom tanggal di formulir. Semua sumber itu harus ikut terbaca untuk setiap unit; bila tidak,
        // catatan yang record_date-nya kosong gugur diam-diam saat satu unit dipilih.
        const indicatorDataset = await readIndicatorResultDataset(sb,year,selectedRoom,controller.signal)
        if (cancelled) return
        setIndicatorData(indicatorDataset)
      } else if (mode === 'pathway') {
        const start = String(year) + '-01-01'
        const end = String(year + 1) + '-01-01'
        const result = await readPagesWithLimit<ClinicalPathwayRow>((from, to) => {
          let request: any = q().from('clinical_pathway_audits')
            .select('room_id,template_code,template_name,admission_date,created_at,updated_at,status,template_snapshot,selected_items_json,additional_phases_json,inclusion_json,answers_json,variations_json,calculation_json')
            .gte('admission_date', start)
            .lt('admission_date', end)
            .neq('status', 'archived')
          if (selectedRoom != null) request = request.eq('room_id', selectedRoom)
          return request.order('admission_date', { ascending: false }).order('id').range(from, to).abortSignal(controller.signal)
        }, RECORD_LIMIT)
        if (cancelled) return
        requireComplete(result.capped)
        setPathwayData(result.rows)
      } else {
        const result = await readPagesWithLimit<ClinicalDeathAuditResultRow>((from, to) => {
          let request: any = q().from('clinical_death_audits')
            .select('room_id,audit_type,review_period,review_phases:review_json->phases,review_recommended_actions:review_json->>recommended_actions,review_learning_points:review_json->>learning_points,overall_care_score,care_issue_identified,contribution_to_outcome,avoidability_score,status,created_at,updated_at,validated_at')
            .eq('review_period', String(year))
            .neq('status', 'archived')
          if (selectedRoom != null) request = request.eq('room_id', selectedRoom)
          return request.order('updated_at', { ascending: false }).order('id').range(from, to).abortSignal(controller.signal)
        }, RECORD_LIMIT)
        if (cancelled) return
        requireComplete(result.capped)
        setClinicalData(result.rows.map((row) => ({
          ...row,
          review_json: {
            phases: row.review_phases ?? {},
            recommended_actions: row.review_recommended_actions ?? '',
            learning_points: row.review_learning_points ?? '',
          },
        })))
      }
    }

    load().catch((loadError) => {
      if (cancelled) return
      setError(toUserFacingError(loadError, { fallback: 'Hasil audit belum dapat dimuat. Periksa koneksi dan hak akses unit.' }))
    }).finally(() => {
      if (!cancelled) { setFinishedScope(scope); setLoading(false) }
    })
    return () => { cancelled = true; controller.abort() }
  }, [mode, roomId, year, canViewAllRooms, scope])

  const officialIndicatorResults = useMemo(() => calculateIndicatorResultsForProfiles(
    indicatorData.profiles, indicatorData.rows, year,
  ), [indicatorData, year])
  const indicatorResults = useMemo(() => includeReady ? calculateIndicatorResultsForProfiles(
    indicatorData.profiles, indicatorData.rows, year, true,
  ) : officialIndicatorResults, [includeReady, indicatorData, year, officialIndicatorResults])
  const assessedIndicators = indicatorResults.filter((result) => result.observations > 0 && result.targetMet != null)
  const roomNameOf = (id: number) => rooms.find((room) => Number(room.id) === id)?.name ?? 'Unit ' + id
  const compareGroups = useMemo(() => roomId == null ? groupComparable(indicatorResults, roomNameOf, includeReady) : [], [indicatorResults, roomId, rooms, includeReady]) // eslint-disable-line react-hooks/exhaustive-deps
  const [compareOpen, setCompareOpen] = useState(false)
  const hasInm = indicatorResults.some(isInm)
  const inmHasData = useMemo(() => buildInmRows(officialIndicatorResults, year, () => '').length > 0, [officialIndicatorResults, year])
  const exportInm = () => {
    if (loading || error) return
    const rows = buildInmRows(officialIndicatorResults, year, roomNameOf)
    if (!rows.length) return
    downloadCsv('aureka-inm-' + year + (roomId == null ? '-semua-unit' : '-unit-' + roomId) + '.csv', buildCsv(rows, INM_COLUMNS))
  }
  const [whyFor, setWhyFor] = useState<IndicatorProfileForResults | null>(null)
  const whyDiagnosis = useMemo(() => whyFor ? diagnoseIndicator(whyFor, indicatorData.rows, year) : null, [whyFor, indicatorData, year])
  const [spcFor, setSpcFor] = useState<ReturnType<typeof calculateIndicatorResult> | null>(null)
  const [sourceFor, setSourceFor] = useState<IndicatorProfileForResults | null>(null)
  const [sourceMonth, setSourceMonth] = useState<number | null>(null)
  const openSourceTrace = (profile: IndicatorProfileForResults, month: number | null = null) => {
    setSourceMonth(month)
    setSourceFor(profile)
    setSourceWorkbookUrl('')
    setSourceWorkbookError('')
  }
  const [sourceWorkbookBusy, setSourceWorkbookBusy] = useState(false)
  const [sourceWorkbookUrl, setSourceWorkbookUrl] = useState('')
  const [sourceWorkbookError, setSourceWorkbookError] = useState('')
  const sourceProvenance = useMemo(() => {
    if (!sourceFor) return null
    const code = String(sourceFor.code ?? '')
    const outpatientSource = isOutpatientWaitingIndicator(sourceFor.room_id, code)
    const mapping = sourceFor.schema_json?.excel_mapping && typeof sourceFor.schema_json.excel_mapping === 'object'
      ? sourceFor.schema_json.excel_mapping as Record<string, unknown>
      : {}
    const entries = indicatorData.rows
      .filter((row) =>
        Number(row.room_id) === Number(sourceFor.room_id) &&
        !!row.core_data?.source_import &&
        (sourceMonth == null || operationalCalendarParts(row)?.month === sourceMonth)
      )
      .map((row) => {
        const source = row.core_data?.source_import ?? {}
        const form = row.core_data?.form_fields ?? {}
        const rawValue = (outpatientSource ? outpatientWaitingMinutes(form) : undefined)
          ?? source.source_indicator_values?.[code]
          ?? (code === '14.1' ? source.source_bhp_linen?.source_value : undefined)
          ?? (code === '14.1' ? form['Kekosongan BHP/Linen'] ?? form['Kekosongan BHP/Linen (sumber belum dipetakan)'] : undefined)
          ?? ''
        const header = source.source_indicator_columns?.[code]
          ?? (code === '14.1' ? source.source_bhp_linen?.source_header : undefined)
          ?? (outpatientSource ? OUTPATIENT_WAITING_MINUTES_FIELD : mapping.indicator_header)
          ?? ''
        const columnRef = source.source_indicator_column_refs?.[code] ?? {}
        const excelRow = source.source_excel_row == null ? '' : String(source.source_excel_row)
        const columnLetter = String((outpatientSource ? source.source_excel_column : columnRef.column_letter ?? mapping.column_letter) ?? '')
        return {
          workbook: String(source.source_workbook ?? ''),
          storagePath: String(source.source_storage_path ?? ''),
          sheet: String(source.source_sheet ?? ''),
          excelRow,
          header: String(header ?? ''),
          columnLetter,
          cellRef: columnLetter && excelRow ? String(source.source_sheet ?? 'Logbook') + '!' + columnLetter + excelRow : '',
          value: String(rawValue ?? ''),
          recordDate: String(row.record_date ?? row.core_data?.admission_at ?? ''),
          status: String(row.status ?? ''),
        }
      })
    const withValues = entries.filter((entry) => entry.value.trim() !== '')
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
    return {
      code,
      mappingWorksheet: String(mapping.worksheet ?? ''),
      mappingHeader: String(mapping.indicator_header ?? ''),
      workbooks: unique(entries.map((entry) => entry.workbook)),
      storagePaths: unique(entries.map((entry) => entry.storagePath)),
      sheets: unique(entries.map((entry) => entry.sheet)),
      headers: unique(entries.map((entry) => entry.header)),
      columnLetters: unique(entries.map((entry) => entry.columnLetter)),
      totalRows: entries.length,
      rowsWithValues: withValues.length,
      rows: withValues,
    }
  }, [sourceFor, sourceMonth, indicatorData.rows])
  const visibleIndicatorResults = groupBy === 'category' && categoryFilter ? indicatorResults.filter((result) => resolveQualityCategory(result.profile).id === categoryFilter) : indicatorResults
  const metIndicators = assessedIndicators.filter((result) => result.targetMet === true).length
  const overallIndicatorAchievement = assessedIndicators.length ? (metIndicators / assessedIndicators.length) * 100 : null
  const pharmacyMetricSummary = useMemo(() => {
    if (mode !== 'indicators' || Number(roomId) !== 5) return null

    const yearRows = indicatorData.rows.filter((row) => operationalCalendarParts(row)?.year === year)
    const validatedRows = yearRows.filter((row) => String(row.status ?? '').toLowerCase() === 'validated')
    const readyRecords = yearRows.filter((row) => String(row.status ?? '').toLowerCase() === 'ready').length
    const pharmacyRows = yearRows.filter(row => isResultStatusIncluded(row.status, includeReady)).map((row) => ({
      databaseStatus: row.status,
      formData: operationalFormFields(row),
      indicatorValues: row.core_data?.indicator_values ?? {},
    }))
    const definitions = [
      { code: '5.2', title: 'Angka Copy Resep' },
      { code: '5.3', title: 'Angka Ketidakpatuhan Penggunaan Label High Alert' },
      { code: '5.4', title: 'Kepatuhan Penggunaan Formularium Nasional' },
      { code: '5.5', title: 'Kepatuhan Penggunaan Formularium Rumah Sakit' },
    ]
    const metrics = definitions.map((item) => {
      const profile = indicatorData.profiles.find((candidate) => Number(candidate.room_id) === 5 && String(candidate.code) === item.code)
      const outpatient = aggregatePharmacyMetric(pharmacyRows, item.code, 'Rawat Jalan')
      const inpatient = aggregatePharmacyMetric(pharmacyRows, item.code, 'Rawat Inap')
      const combined = combinePharmacyMetric(outpatient, inpatient)
      const meets = profile && combined.rate != null ? compareToTarget(profile, combined.rate) : null
      return { ...item, profile, outpatient, inpatient, combined, meets }
    })
    return {
      metrics,
      validatedRecords: validatedRows.length,
      readyRecords,
      periodLabel: String(year),
    }
  }, [mode, roomId, indicatorData, includeReady, year])

  const outpatientClinicSummary = useMemo(() => {
    if (mode !== 'indicators' || Number(roomId) !== 11) return null

    const yearRows = indicatorData.rows.filter((row) => operationalCalendarParts(row)?.year === year)
    const includedRows = yearRows.filter((row) =>
      isResultStatusIncluded(row.status, includeReady) &&
      row.core_data?.source_import?.exclude_from_profile_year_metrics !== true
    )
    const outpatientRows = includedRows.map((row) => {
      const date = operationalRecordDate(row)
      return {
        admit: date,
        recordDate: date,
        formData: operationalFormFields(row),
      }
    })
    const metrics = summarizeOutpatientClinics(
      outpatientRows,
      OUTPATIENT_PROVIDER_GROUPS,
      year,
      0,
      'Waktu Tunggu Rawat Jalan (Menit)',
    )
    const profile = indicatorData.profiles.find((candidate) => Number(candidate.room_id) === 11 && String(candidate.code) === '11.1')
    const thresholdMinutes = outpatientWaitingThreshold(profile?.schema_json?.threshold_minutes)
    return {
      metrics,
      thresholdMinutes,
      recordsWithMinutes: metrics.reduce((total, item) => total + item.measurementCount, 0),
      includedRecords: includedRows.length,
      periodLabel: String(year),
    }
  }, [mode, roomId, indicatorData, includeReady, year])

  const pathway = useMemo(() => aggregateClinicalPathwayRows(pathwayData), [pathwayData])
  const pathwayMonthly = useMemo(() => aggregatePathwayByMonth(pathwayData, year), [pathwayData, year])
  const pathwayTemplates = useMemo(() => {
    const groups = new Map<string, ClinicalPathwayRow[]>()
    pathwayData.forEach((row) => {
      const key = String(row.template_code ?? row.template_name ?? 'Tidak diketahui')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    })
    return Array.from(groups.entries()).map(([code, rows]) => ({
      code,
      name: String(rows[0]?.template_name ?? rows[0]?.template_snapshot?.name ?? code),
      result: aggregateClinicalPathwayRows(rows).overall,
    })).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [pathwayData])

  const clinical = useMemo(() => aggregateClinicalDeathAudits(clinicalData, 'clinical'), [clinicalData])
  const death = useMemo(() => aggregateClinicalDeathAudits(clinicalData, 'death'), [clinicalData])
  const clinicalValidationMonthly = useMemo(() => aggregateClinicalDeathByValidationMonth(clinicalData, 'clinical', year), [clinicalData, year])
  const deathValidationMonthly = useMemo(() => aggregateClinicalDeathByValidationMonth(clinicalData, 'death', year), [clinicalData, year])
  const selectedClinical = clinicalTab === 'clinical' ? clinical : death
  const selectedValidationMonthly = clinicalTab === 'clinical' ? clinicalValidationMonthly : deathValidationMonthly

  const latestDataInputAt = useMemo(() => {
    const candidates = mode === 'indicators'
      ? indicatorResults.map((result) => result.latestInputAt)
      : mode === 'pathway'
        ? pathwayData.map((row) => row.created_at ?? row.updated_at ?? null)
        : clinicalData.map((row) => String(row.created_at ?? row.updated_at ?? '') || null)
    return candidates.filter((value): value is string => !!value).sort().at(-1) ?? null
  }, [mode, indicatorResults, pathwayData, clinicalData])

  const selectedRoomName = roomId == null
    ? 'Seluruh unit'
    : rooms.find((room) => Number(room.id) === Number(roomId))?.name ?? 'Unit tidak diketahui'

  const pageCss = `
    .qra{display:grid;gap:14px;color:var(--ink)}
    .qraHero,.qraPanel{background:var(--surface,#fff);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(18,47,34,.045)}
    .qraHero{padding:18px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
    .qraEyebrow{font-size:12px;font-weight:900;letter-spacing:.1em;color:var(--accent2)}
    .qraHero h2{font-size:24px;letter-spacing:-.045em;margin:5px 0}
    .qraHero p{margin:0;max-width:850px;color:var(--muted);font-size:12px;line-height:1.6}
    .qraActions{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
    .qraField{display:grid;gap:5px;min-width:145px}.qraField span{font-size:12px;color:var(--muted);font-weight:850}
    .qraField select{min-height:39px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff);color:var(--ink);padding:8px 10px;font-size:12px}
    .qraBtn{min-height:39px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff);color:var(--accent2);font-size:12px;font-weight:850;padding:8px 12px;cursor:pointer}
    .qraKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .qraKpis.qraKpisThree{grid-template-columns:repeat(3,minmax(0,1fr))}
    .qraNestedTable{min-width:560px}
    .qraKpi{padding:14px 15px;min-width:0;background:var(--surface,#fff);border:1px solid var(--line);border-radius:15px}
    .qraKpi span{display:block;font-size:12px;color:var(--muted);font-weight:850}
    .qraKpi strong{display:block;margin:5px 0 2px;font-size:23px;letter-spacing:-.035em}
    .qraKpi small{display:block;color:var(--muted);font-size:12px;line-height:1.45}
    .qraPill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#edf1ee;color:#5f7066;font-size:12px;font-weight:850;white-space:nowrap}
    .qraPill.good{background:#e8f7ef;color:#216b49}.qraPill.poor{background:#fff0ed;color:#923e34}.qraPill.muted{background:#edf1ee;color:#63716a}
    .qraPanel{overflow:hidden}.qraPanelHead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 15px;border-bottom:1px solid var(--line)}
    .qraPanelHead h3{margin:0;font-size:14px}.qraPanelHead p{margin:3px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
    .qraNotice{padding:10px 14px;background:#f5f8f6;color:#51655a;font-size:12px;line-height:1.5;border-top:1px solid var(--line)}
    .qraTableWrap{overflow:auto;max-width:100%}.qraTable{width:100%;min-width:980px;border-collapse:collapse;font-size:12px}
    .qraTable th,.qraTable td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
    .qraTable th{background:#f7faf8;color:#66766d;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:1}
    .qraTable td strong{display:block;font-size:12px}.qraTable td small{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.4}
    .qraMonthly{display:grid;grid-template-columns:repeat(12,minmax(13px,1fr));gap:3px;align-items:end;min-width:190px;height:44px}
    .qraMonthly span{display:block;background:var(--accent-soft);border-radius:4px 4px 2px 2px;min-height:2px;position:relative}
    .qraMonthly span.empty{background:#eef1ef}
    .qraMonthlyLabels{display:grid;grid-template-columns:repeat(12,minmax(13px,1fr));gap:3px;margin-top:4px}
    .qraMonthlyLabels span{text-align:center;color:var(--muted);font-size:12px}
    .qraMonthMatrix{display:grid;grid-template-columns:repeat(12,minmax(44px,1fr));gap:3px;min-width:550px}
    .qraMonthCell{padding:6px 4px;background:#f8faf9;border-radius:7px;text-align:center;min-height:42px}
    .qraMonthCell strong{display:block;font-size:12px}.qraMonthCell small{display:block;color:var(--muted);font-size:12px;margin-top:3px}
    .qraMonthCell.empty{color:#a2ada6;background:#f4f6f5}
    .qraEmpty{display:grid;place-items:center;text-align:center;min-height:145px;padding:24px;color:var(--muted)}
    .qraEmptyIcon{font-size:24px;color:#9aa9a0}.qraDim{opacity:.48}.qraEmpty strong{font-size:12px;color:var(--ink);margin-top:8px}.qraEmpty p{max-width:520px;margin:5px 0 0;font-size:12px;line-height:1.55}
    .qraBars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end;padding:15px}
    .qraBarsItem{display:grid;gap:5px;text-align:center;min-width:0}.qraBarsTrack{height:112px;border-radius:8px;background:#eef2ef;display:flex;align-items:flex-end;overflow:hidden}
    .qraBarsTrack span{display:block;width:100%;border-radius:7px 7px 0 0;background:linear-gradient(180deg,#54a783,#197653);min-height:0}
    .qraBarsItem b{font-size:12px}.qraBarsItem small{font-size:12px;color:var(--muted)}
    .qraLegend{display:flex;gap:12px;flex-wrap:wrap;padding:0 15px 12px;color:var(--muted);font-size:12px}
    .qraLegend span{display:inline-flex;align-items:center;gap:5px}.qraDot{width:9px;height:9px;border-radius:3px;background:#197653}
    .qraStatusGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px}
    .qraStatusBox{background:#f7faf8;border:1px solid var(--line);border-radius:11px;padding:10px}.qraStatusBox span{display:block;font-size:12px;color:var(--muted)}.qraStatusBox strong{font-size:16px;display:block;margin-top:4px}
    .qraSplit{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .qraContent{padding:14px}
    .qraBarRow{display:grid;gap:4px;padding:9px 0;border-bottom:1px solid var(--line)}.qraBarRow:last-child{border-bottom:0}
    .qraBarLabel{display:flex;justify-content:space-between;gap:8px;font-size:12px}.qraBarLabel strong{font-size:12px}
    .qraBarTrack{height:8px;background:#eef2ef;border-radius:99px;overflow:hidden}.qraBarTrack span{display:block;height:100%;background:linear-gradient(90deg,#76b995,#176b4d);border-radius:99px}
    .qraDistribution{display:grid;gap:7px;padding:12px 14px}
    .qraDistributionItem{display:grid;grid-template-columns:18px minmax(0,1fr) 28px;gap:7px;align-items:center;font-size:12px}
    .qraDistributionItem>div{height:9px;background:#eff2f0;border-radius:99px;overflow:hidden}.qraDistributionItem i{display:block;height:100%;background:#4c9a76;border-radius:99px}
    .qraDistributionItem b{text-align:right}
    .qraTabs{display:flex;gap:6px;padding:7px;background:#f6f8f7;border-radius:12px}
    .qraTabs button{border:1px solid transparent;background:transparent;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:850;color:var(--muted);cursor:pointer}
    .qraTabs button.active{background:#fff;border-color:var(--line);color:var(--accent2)}
    .qraSourceBtn{margin-top:6px;border:1px solid var(--line);background:#f7faf8;color:var(--accent2);border-radius:8px;padding:5px 8px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
    .qraSourceBtn:hover{background:#edf5f0}
    .qraSourceCell{display:grid;gap:4px;width:100%;padding:2px 0;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
    .qraSourceCell:hover strong{color:var(--accent2);text-decoration:underline}
    .qraSourceCell>small{color:var(--muted);font-size:10px;line-height:1.35}
    .qraSourceCell>em{font-size:10px;font-style:normal;font-weight:850;color:var(--accent2)}
    .qraSourceCell:focus-visible,.qraSourceBtn:focus-visible{outline:2px solid var(--accent2);outline-offset:2px;border-radius:5px}
    .qraError{padding:12px 14px;border-radius:12px;border:1px solid #f1d1cb;background:#fff0ed;color:#8e3e34;font-size:12px;line-height:1.5}
    .qraInfo{padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:#f7faf8;color:var(--muted);font-size:12px;line-height:1.55}
    @media(max-width:1050px){.qraKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.qraKpis.qraKpisThree{grid-template-columns:repeat(2,minmax(0,1fr))}.qraSplit{grid-template-columns:1fr}.qraStatusGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:650px){.qraHero{display:grid}.qraActions{width:100%}.qraField{flex:1;min-width:120px}.qraKpis{grid-template-columns:1fr 1fr}.qraKpis.qraKpisThree{grid-template-columns:1fr 1fr}.qraKpi strong{font-size:19px}.qraBars{gap:3px;padding:10px}.qraBarsTrack{height:80px}.qraStatusGrid{grid-template-columns:1fr 1fr}}

    /* Compact, balanced presentation shared with the Audit Logbook workspace */
    .qra{gap:10px}
    .qraHero{padding:14px 16px;border-radius:13px;box-shadow:0 1px 2px rgba(18,47,34,.035)}
    .qraHero h2{font-size:21px;margin:4px 0}
    .qraHero p{font-size:12px;line-height:1.5}
    .qraActions{gap:7px}
    .qraField{min-width:135px}
    .qraField select,.qraBtn{min-height:36px;border-radius:9px;font-size:12px}
    .qraKpis{gap:8px}
    .qraKpi{padding:11px 12px;border-radius:12px}
    .qraKpi strong{font-size:20px;margin:4px 0 2px}
    .qraKpi small{font-size:12px;line-height:1.4}
    .qraPanel{border-radius:13px;box-shadow:0 1px 2px rgba(18,47,34,.035)}
    .qraPanelHead{padding:11px 13px}
    .qraPanelHead h3{font-size:13px}
    .qraTableWrap{max-width:100%;overflow:auto}
    .qraTable{min-width:1080px;font-size:12px}
    .qraTable th,.qraTable td{padding:8px 7px}
    .qraTable th{font-size:12px}
    .qraNotice,.qraInfo{font-size:12px;line-height:1.45;padding:9px 12px}
    @media(max-width:650px){
      .qraHero{padding:12px}
      .qraHero h2{font-size:18px}
      .qraActions{display:grid;grid-template-columns:1fr 1fr;width:100%}
      .qraActions .qraBtn{grid-column:1/-1}
      .qraKpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .qraKpis.qraKpisThree{grid-template-columns:repeat(2,minmax(0,1fr))}
      .qraKpi{padding:10px}
      .qraKpi strong{font-size:18px}
    }

  `

  const totalRows = mode === 'indicators'
    ? indicatorData.rows.length
    : mode === 'pathway'
      ? pathwayData.length
      : clinicalData.length
  const loadingError = !!error

  return <div className="qra">
    <style>{pageCss}</style>
    <WorkspaceModuleHeader
      className="qraHero"
      title={modeTitle(mode)}
      actions={<div className="qraActions">
        <label className="qraField"><span>Unit kerja</span><select value={roomId ?? ''} disabled={!canViewAllRooms || lockRoomScope} onChange={(event) => { const next = normalizeRoom(event.target.value); setRoomId(next); onRoomChange?.(next) }}>
          {canViewAllRooms && !lockRoomScope && <option value="">Semua unit · lintas ruangan</option>}
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>
        <label className="qraField"><span>Tahun</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {YEARS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <button type="button" className="qraBtn" disabled={loading} onClick={() => setReload((value) => value + 1)}>{loading ? 'Memuat…' : '↻ Muat ulang'}</button>
        {mode === 'indicators' && hasInm && <button type="button" className="qraBtn" disabled={loading || !!error || !inmHasData} onClick={exportInm} title={inmHasData ? 'Unduh capaian bulanan Indikator Nasional Mutu untuk dilaporkan ke Kemenkes' : 'Belum ada data INM tervalidasi tahun ' + year}>Ekspor INM (CSV)</button>}
      </div>}
    />

    {!loading && error && <div className="qraError" role="alert">{error}</div>}
    {loading
      ? <div className="qraPanel"><EmptyState title="Memuat data hasil audit…" detail="" /></div>
      : loadingError
        ? null
        : mode === 'indicators'
          ? <>
            <div className="qraKpis">
              <Kpi label="Capaian Mutu Unit Secara Keseluruhan" value={overallIndicatorAchievement == null ? '-' : formatPct(overallIndicatorAchievement)} detail={assessedIndicators.length ? metIndicators + ' dari ' + assessedIndicators.length + ' indikator dengan target terukur memenuhi target' : 'Belum ada indikator dengan data yang dapat dinilai'} />
              <Kpi label="Indikator aktif" value={formatCount(indicatorResults.length)} detail="Profil terbit dan aktif pada tahun terpilih" />
              <Kpi label="Laporan masuk" value={formatCount(rawReadyCount + rawValidatedCount)} detail={formatCount(rawValidatedCount) + ' sudah divalidasi · ' + formatCount(rawReadyCount) + ' belum divalidasi'} />
              
            </div>
            <div className="qraNotice" role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={includeReady} onChange={(event) => setIncludeReady(event.target.checked)} /> Hitung juga laporan yang belum divalidasi</label>
              {includeReady ? <span>Pratinjau capaian sementara. Ekspor INM memakai laporan tervalidasi.</span> : rawReadyCount > 0 && rawValidatedCount === 0 && <span>Laporan tersedia untuk pratinjau. Belum ada laporan tervalidasi.</span>}
            </div>
            {arcticBriefing&&<ValidatedIndicatorBriefing key={scope} results={officialIndicatorResults} year={year} scopeLabel={selectedRoomName} validatedRecords={rawValidatedCount}/>}
            {groupBy === 'category' && <section className="qraPanel" aria-label="Capaian per kategori indikator">
              <QualityCategoryIntelligence
                results={indicatorResults} records={indicatorData.rows} year={year}
                scopeLabel={selectedRoomName} selectedCategoryId={categoryFilter}
                onSelectCategory={setCategoryFilter} includeReady={includeReady}
                onAskNara={onAskNara} roomName={roomNameOf}/>
            </section>}
            {compareGroups.length > 0 && <details className="qraPanel" aria-label="Perbandingan antar unit" data-arctic-analytics="comparison"><summary>Perbandingan antar unit · {compareGroups.length} indikator</summary>
              <div className="qraPanelHead"><div><h3>Perbandingan antar unit</h3><p className="qraMuted">Indikator yang sama diukur di beberapa unit. Urutan dari capaian terbaik; merah berarti belum memenuhi target.</p></div><span className="qraPill">{compareGroups.length} indikator</span></div>
              <div className="qraCompare">
                {(compareOpen ? compareGroups : compareGroups.slice(0, 4)).map((group) => {
                  const max = Math.max(...group.entries.map((e) => e.value), group.entries.every((e) => e.display.endsWith('%')) ? 100 : 0) || 1
                  return <article key={group.key} className="qraCompareCard">
                    <header><strong>{group.title}</strong><small>Target {group.target || '-'} · {group.higherBetter ? 'makin tinggi makin baik' : 'makin rendah makin baik'}</small></header>
                    <ol>{group.entries.map((e) => <li key={e.roomId} className={e.met === false ? 'miss' : e.met ? 'ok' : ''}>
                      <span className="qraCmpName">{e.room}</span>
                      <span className="qraCmpBar" aria-hidden="true"><i style={{ width: Math.max(2, (e.value / max) * 100) + '%' }} /></span>
                      <b>{e.display}</b>
                    </li>)}</ol>
                  </article>
                })}
              </div>
              {compareGroups.length > 4 && <div className="qraCompareMore"><button type="button" className="qraBtn" onClick={() => setCompareOpen((v) => !v)}>{compareOpen ? 'Tampilkan lebih sedikit' : 'Lihat semua ' + compareGroups.length + ' indikator'}</button></div>}
            </details>}
            <section className="qraPanel">
              <div className="qraPanelHead"><div><h3>Hasil setiap indikator{groupBy === 'category' && categoryFilter ? ' · ' + categoryFilter : ''}</h3></div><span className="qraPill">{selectedRoomName} · {year}</span></div>
              {visibleIndicatorResults.length === 0
                ? <EmptyState title="Belum ada indikator aktif" detail="Master indikator tahun ini belum memiliki profil aktif dan terbit untuk unit yang dipilih." />
                : <WorkspaceTableViewport label="Hasil capaian mutu" className="qraTableWrap"><table className="qraTable qraIndicatorTable">
                  <thead><tr>{roomId == null && <th>Unit kerja</th>}<th>Indikator / target</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}<th>Rata-rata tahunan</th><th>Status target</th><th>Input terakhir</th><th>Jumlah data</th></tr></thead>
                  <tbody>{visibleIndicatorResults.map((result) => <tr key={result.profile.id ?? result.profile.code}>
                    {roomId == null && <td><strong>{rooms.find((room) => Number(room.id) === Number(result.profile.room_id))?.name ?? 'Unit tidak diketahui'}</strong></td>}
                    <td><strong>{result.profile.code ? result.profile.code + ' · ' : ''}{result.profile.title ?? 'Indikator tanpa judul'}</strong><small>Target: {targetLabel(result.profile)} · {result.kind === 'ratio' ? 'Rasio N/D' : result.continuous ? 'Rerata pengukuran dan target per observasi' : 'Proporsi hasil numerator'}</small><button type="button" className="qraSourceBtn" onClick={() => openSourceTrace(result.profile)}>Sumber Excel · semua bulan</button>{(result.validatedRecords > 0 || (includeReady && result.readyRecords > 0)) && <button type="button" className="qraSpcBtn" onClick={() => setSpcFor(result)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l5-6 4 3 6-8 3 3" /></svg>Grafik kendali</button>}</td>
                    {result.monthly.map((month) => <td key={month.month} className={month.observations === 0 ? 'qraDim' : ''}>
                      <button type="button" className="qraSourceCell" onClick={() => openSourceTrace(result.profile, month.month)} title={'Telusuri nilai sumber Excel untuk ' + MONTHS[month.month - 1]}>
                        <strong>{indicatorMonthlyLabel(result, month.month)}</strong>
                        <small>{month.observations ? [month.validatedRecords ? 'Valid n=' + formatCount(month.validatedRecords) : '', month.readyRecords ? formatCount(month.readyRecords) + ' siap ditinjau' : '', !result.continuous && month.denominator > 0 ? 'N/D ' + formatCount(month.numerator) + '/' + formatCount(month.denominator) : ''].filter(Boolean).join(' · ') : 'Belum ada hasil tercatat'}</small>
                        <em>Lacak Excel</em>
                      </button>
                    </td>)}
                    <td><strong>{result.continuous ? (result.annualMean == null ? '-' : result.annualMean.toFixed(2).replace('.', ',') + (result.unit ? ' ' + result.unit : '')) : formatPct(result.annualRate)}</strong><small>{attainmentCaption(result, includeReady)}{result.monthlyMeanRate == null ? '' : ' · rerata bulanan ' + formatPct(result.monthlyMeanRate)}{result.readyRecords ? ' · ' + formatCount(result.readyRecords) + ' siap ditinjau' : ''}</small></td>
                    <td><StatusPill value={result.targetMet} /></td>
                    <td>{formatDateTime(result.latestInputAt)}</td>
                    <td><strong>{formatCount(result.observations)}</strong><small>{formatCount(result.readyRecords)} siap · {formatCount(result.validatedRecords)} valid</small>{indicatorProfileIssue(result.profile) && <small>Profil memerlukan koreksi</small>}{(result.observations === 0 || (!includeReady && result.validatedRecords === 0)) && <button type="button" className="qraWhyBtn" onClick={() => setWhyFor(result.profile)}>Kenapa kosong?</button>}</td>
                  </tr>)}</tbody>
                </table></WorkspaceTableViewport>}
              <AurekaModal open={!!whyFor} size="md" onClose={() => setWhyFor(null)}
                title={whyFor ? 'Kenapa ' + (whyFor.code ?? 'indikator ini') + ' belum ada capaian?' : ''}
                subtitle={whyFor ? (whyFor.title ?? '') + ' · ' + (rooms.find((room) => Number(room.id) === Number(whyFor.room_id))?.name ?? selectedRoomName) + ' · ' + year : ''}>
                {whyDiagnosis && <div className="qraWhy">
                  <div className="qraWhyStats">
                    <span><b>{formatCount(whyDiagnosis.total)}</b>catatan unit</span>
                    <span><b>{formatCount(whyDiagnosis.counted)}</b>terhitung</span>
                    <span><b>{formatCount(whyDiagnosis.total - whyDiagnosis.counted)}</b>tidak terhitung</span>
                  </div>
                  <ul>{whyDiagnosis.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <p className="qraMuted">Perbaiki di Form Logbook unit terkait. Untuk kode indikator yang berbeda atau pilihan jawaban yang tidak cocok, samakan dulu profil indikatornya di Pengaturan → Profil Indikator.</p>
                </div>}
              </AurekaModal>
              <AurekaModal open={!!spcFor} size="lg" onClose={() => setSpcFor(null)}
                title={spcFor ? (spcFor.profile.code ? spcFor.profile.code + ' · ' : '') + (spcFor.profile.title ?? 'Indikator') : ''}
                subtitle={spcFor ? 'Grafik kendali ' + year + (includeReady ? ' · pratinjau sementara' : '') + ' · ' + (rooms.find((room) => Number(room.id) === Number(spcFor.profile.room_id))?.name ?? selectedRoomName) + ' · target ' + targetLabel(spcFor.profile) : ''}>
                {spcFor && <SpcChart
                  percent={!spcFor.continuous && spcFor.kind !== 'ratio'}
                  unit={spcFor.continuous ? (spcFor.unit ? ' ' + spcFor.unit : '') : '%'}
                  target={(() => { const t = Number(spcFor.profile.target_value); return spcFor.profile.target_value != null && spcFor.profile.target_value !== '' && Number.isFinite(t) ? t : null })()}
                  points={spcFor.monthly.map((m) => spcFor.continuous ? { month: m.month, value: m.mean } : { month: m.month, value: m.rate, numerator: m.numerator, denominator: m.denominator })} />}
              </AurekaModal>
              <AurekaModal
                open={!!sourceFor}
                size="lg"
                onClose={() => setSourceFor(null)}
                title={sourceFor ? 'Sumber Excel · ' + (sourceFor.code ? sourceFor.code + ' · ' : '') + (sourceFor.title ?? 'Indikator') : ''}
                subtitle={sourceFor ? 'Jejak data sumber untuk unit ' + roomNameOf(Number(sourceFor.room_id)) + ' · ' + year + (sourceMonth == null ? ' · seluruh bulan' : ' · ' + MONTHS[sourceMonth - 1]) : ''}
              >
                {sourceFor && sourceProvenance && <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                  <div className="qraInfo">
                    <strong>Hubungan profil → kolom sumber</strong>
                    <div>Worksheet: <b>{sourceProvenance.mappingWorksheet || sourceProvenance.sheets.join(', ') || 'Belum direkam'}</b></div>
                    <div>Header kolom: <b>{sourceProvenance.mappingHeader || sourceProvenance.headers.join(', ') || 'Header aktual belum direkam pada impor ini'}</b></div>
                    <div>Kolom Excel: <b>{sourceProvenance.columnLetters.join(', ') || 'Koordinat kolom belum direkam pada impor lama'}</b></div>
                    <div>Workbook: <b>{sourceProvenance.workbooks.join(', ') || 'Belum ada provenance workbook'}</b></div>
                    <div>Data bernilai: <b>{formatCount(sourceProvenance.rowsWithValues)}</b> dari <b>{formatCount(sourceProvenance.totalRows)}</b> catatan sumber</div>
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <button type="button" className="qraBtn" disabled={sourceProvenance.rows.length===0} onClick={() => {
                        const columns=['Baris Excel','Referensi sel','Tanggal pengamatan','Header','Nilai','Status']
                        downloadCsv('aureka-jejak-sumber-'+year+'.csv', buildCsvTable(columns, sourceProvenance.rows.map(r=>[
                          r.excelRow,r.cellRef||'',r.recordDate||'',r.header||'',r.value,r.status||''
                        ])))
                      }}>Ekspor jejak data sumber (CSV)</button>
                      <small>File Excel asli tidak tersedia untuk diunduh ulang. Pratinjau menampilkan hingga 25 catatan. CSV memuat seluruh catatan bernilai pada periode ini.</small>
                    </div>
                  </div>
                  {sourceFor.code === '14.1' && sourceProvenance.rowsWithValues === 0 && <div className="qraNotice">
                    Data BHP/Linen pada impor ICU sebelumnya tersimpan kosong dan belum pernah ditautkan ke indikator 14.1. Upload ulang workbook asli ICU untuk mengisi kolom ini; proses backfill akan memperbarui hanya field 14.1 yang masih kosong dan mempertahankan data indikator lainnya.
                  </div>}
                  {sourceProvenance.rows.length > 0 ? <div className="qraTableWrap">
                    <table className="qraTable" style={{ minWidth: 650 }}>
                      <thead><tr><th>Baris Excel</th><th>Referensi sel</th><th>Tanggal pengamatan</th><th>Header sumber</th><th>Nilai sumber</th><th>Status laporan</th></tr></thead>
                      <tbody>{sourceProvenance.rows.slice(0, 25).map((row, index) => <tr key={row.excelRow + '-' + index}>
                        <td>{row.excelRow || '-'}</td>
                        <td><strong>{row.cellRef || (row.excelRow ? (row.sheet || 'Logbook') + ' · baris ' + row.excelRow : '-')}</strong></td>
                        <td>{row.recordDate || '-'}</td>
                        <td>{row.header || sourceProvenance.mappingHeader || 'Belum direkam'}</td>
                        <td>{row.value}</td>
                        <td>{row.status || '-'}</td>
                      </tr>)}</tbody>
                    </table>
                    {sourceProvenance.rows.length > 25 && <div className="qraMuted">Menampilkan 25 nilai sumber terbaru.</div>}
                  </div> : <EmptyState title="Nilai sumber belum tersedia" detail="Belum ada nilai kolom Excel yang tersimpan untuk indikator ini pada episode yang dimuat." />}
                  <div className="qraInfo">
                    Header dan koordinat sel aktual direkam dari workbook saat impor. Referensi seperti Logbook!J42 menunjuk ke sel sumber yang digunakan. Untuk data impor terdahulu, AUREKA hanya menampilkan metadata yang memang tersimpan dan tidak menebak header atau kolom.
                  </div>
                </div>}
              </AurekaModal>
              </section>
              {pharmacyMetricSummary && <section className="qraPanel" aria-label="Rekap capaian indikator Farmasi">
                <div className="qraPanelHead">
                  <div><h3>Rekap capaian indikator Farmasi</h3></div>
                  <span className="qraPill">{pharmacyMetricSummary.periodLabel} · {pharmacyMetricSummary.validatedRecords} tervalidasi</span>
                </div>
                <div className="qraKpis qraKpisThree">
                  <Kpi label="Catatan tervalidasi" value={formatCount(pharmacyMetricSummary.validatedRecords)} detail="" />
                  <Kpi label="Siap ditinjau" value={formatCount(pharmacyMetricSummary.readyRecords)} detail={includeReady ? "Termasuk dalam pratinjau" : "Menunggu validasi"} />
                  <Kpi label="Indikator Farmasi" value={formatCount(pharmacyMetricSummary.metrics.length)} detail="Empat indikator pada rekap operasional" />
                </div>
                <WorkspaceTableViewport label="Rekap capaian indikator Farmasi" className="qraTableWrap">
                  <table className="qraTable">
                    <thead><tr><th>Indikator</th><th>Rawat Jalan · Sumber N/D</th><th>Capaian</th><th>Rawat Inap · Sumber N/D</th><th>Capaian</th><th>Gabungan · Sumber N/D</th><th>Capaian gabungan</th><th>Target master</th><th>Status</th></tr></thead>
                    <tbody>{pharmacyMetricSummary.metrics.map((item) => {
                      const sourceCount = (aggregate: typeof item.outpatient) => {
                        const numerator = item.code === '5.3' ? aggregate.noncompliant : aggregate.numerator
                        return formatCount(numerator) + ' / ' + formatCount(aggregate.denominator)
                      }
                      return <tr key={item.code}>
                        <td><strong>{item.title}</strong><small>{item.code === '5.3' ? 'N sumber = obat tidak berlabel; capaian dikonversi menjadi kepatuhan.' : 'N/D dijumlahkan sebelum persentase dihitung.'}</small></td>
                        <td>{sourceCount(item.outpatient)}</td><td><strong>{formatPct(item.outpatient.rate)}</strong></td>
                        <td>{sourceCount(item.inpatient)}</td><td><strong>{formatPct(item.inpatient.rate)}</strong></td>
                        <td><strong>{sourceCount(item.combined)}</strong></td><td><strong>{formatPct(item.combined.rate)}</strong></td>
                        <td>{item.profile ? targetLabel(item.profile) : '-'}</td>
                        <td><StatusPill value={item.meets} /></td>
                      </tr>
                    })}</tbody>
                  </table>
                </WorkspaceTableViewport>
                
                
              </section>}
              {outpatientClinicSummary && <section className="qraPanel" aria-label="Rekap capaian waktu tunggu Rawat Jalan">
                <div className="qraPanelHead">
                  <div><h3>Rekap waktu tunggu Rawat Jalan per klinik</h3></div>
                  <span className="qraPill">{outpatientClinicSummary.periodLabel} · {outpatientClinicSummary.includedRecords} {includeReady ? 'catatan dalam rekap' : 'tervalidasi'}</span>
                </div>
                <div className="qraKpis qraKpisThree">
                  <Kpi label="Pengukuran berangka" value={formatCount(outpatientClinicSummary.recordsWithMinutes)} detail={outpatientClinicSummary.periodLabel} />
                  <Kpi label="Klinik dengan pengukuran" value={formatCount(outpatientClinicSummary.metrics.filter(item => item.measurementCount > 0).length)} detail="Data operasional per klinik" />
                </div>
                <div className="qraTableWrap">
                  <table className="qraTable">
                    <thead><tr><th>Klinik</th><th>Dokter dengan data</th><th>Catatan dokter-hari</th><th>Hari tercatat</th><th>Rata-rata waktu tunggu</th><th>Rerata di bawah {outpatientClinicSummary.thresholdMinutes} menit</th><th>Terakhir dicatat</th><th>Rincian dokter</th></tr></thead>
                    <tbody>{outpatientClinicSummary.metrics.map((item) => <tr key={item.clinic}>
                      <td><strong>{item.clinic}</strong><small>{formatCount(item.rosterDoctorCount)} dokter pada roster klinik</small></td>
                      <td>{formatCount(item.doctorsWithData)} / {formatCount(item.rosterDoctorCount)}</td>
                      <td>{formatCount(item.recordCount)}</td>
                      <td>{formatCount(item.daysCount)}</td>
                      <td><strong>{item.averageMinutes == null ? '-' : item.averageMinutes.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' menit'}</strong></td>
                      <td><strong>{item.averageMinutes == null ? 'Belum ada data' : item.averageMinutes < outpatientClinicSummary.thresholdMinutes ? 'Memenuhi' : 'Tidak memenuhi'}</strong></td>
                      <td>{formatDateTime(item.lastObserved)}</td>
                      <td><details><summary>Rincian ({item.doctorSummaries.length})</summary><WorkspaceTableViewport label={'Rincian dokter ' + item.clinic} className="qraTableWrap"><table className="qraTable qraNestedTable"><thead><tr><th>Dokter</th><th>Catatan berangka</th><th>Rata-rata (menit)</th><th>Terakhir dicatat</th></tr></thead><tbody>{item.doctorSummaries.map((doctor) => <tr key={doctor.doctor}><td>{doctor.doctor}</td><td>{formatCount(doctor.measurementCount)}</td><td>{doctor.averageMinutes == null ? '-' : doctor.averageMinutes.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td><td>{formatDateTime(doctor.lastObserved)}</td></tr>)}</tbody></table></WorkspaceTableViewport></details></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                
              </section>}
          </>
          : mode === 'pathway'
            ? <>
              <div className="qraKpis">
                <Kpi label="Audit Clinical Pathway" value={formatCount(pathway.overall.totalRecords)} detail={pathway.overall.validatedRecords + ' tervalidasi · ' + pathway.overall.readyRecords + ' menunggu review'} />
                <Kpi label="Keterisian CP tervalidasi" value={formatPct(pathway.overall.completionPct)} detail={formatCount(pathway.overall.filled) + ' dari ' + formatCount(pathway.overall.expected) + ' sel terjadwal telah diputuskan'} />
                <Kpi label="Kepatuhan CP tervalidasi" value={formatPct(pathway.overall.compliancePct)} detail={formatCount(pathway.overall.done) + ' sesuai dari ' + formatCount(pathway.overall.done + pathway.overall.notDone) + ' sel yang dinilai'} />
                <Kpi label="Episode memenuhi target CP" value={formatPct(pathway.overall.episodeTargetMetPct)} detail={pathway.overall.targetMetRecords + ' dari ' + pathway.overall.assessedRecords + ' episode dengan skor terukur'} />
              </div>
              <section className="qraPanel">
                <div className="qraPanelHead"><div><h3>Tren bulanan berdasarkan tanggal masuk</h3></div><span className="qraPill">{pathway.overall.validatedRecords} episode tervalidasi</span></div>
                {pathway.overall.validatedRecords === 0
                  ? <EmptyState title="Belum ada hasil Clinical Pathway tervalidasi" detail="Grafik dan capaian akan tersedia setelah audit Clinical Pathway disimpan dan divalidasi. Data draf tidak diperlakukan sebagai capaian." />
                  : <>
                    <div className="qraBars">{pathwayMonthly.map((month) => <div className="qraBarsItem" key={month.month}>
                      <div className="qraBarsTrack"><span style={{ height: (month.compliancePct ?? 0) + '%' }} /></div><b>{month.compliancePct == null ? '-' : Math.round(month.compliancePct) + '%'}</b><small>{MONTHS[month.month - 1]}</small>
                    </div>)}</div>
                    <div className="qraLegend"><span><i className="qraDot"/>Kepatuhan CP tervalidasi</span></div>
                  </>}
              </section>
              <section className="qraPanel">
                <div className="qraPanelHead"><div><h3>Hasil menurut Clinical Pathway</h3></div></div>
                {pathwayTemplates.length === 0
                  ? <EmptyState title="Belum ada template dengan catatan audit" detail="Daftar akan terbentuk otomatis berdasarkan template yang dipakai pada audit." />
                  : <WorkspaceTableViewport label="Hasil capaian mutu · 2" className="qraTableWrap"><table className="qraTable"><thead><tr><th>Clinical Pathway</th><th>Jumlah audit</th><th>Tervalidasi</th><th>Keterisian tertimbang</th><th>Kepatuhan tertimbang</th><th>Rata-rata per episode</th><th>Episode memenuhi target</th><th>Bagian D lulus</th></tr></thead><tbody>{pathwayTemplates.map((item) => <tr key={item.code}>
                    <td><strong>{item.name}</strong><small>{item.code}</small></td><td>{formatCount(item.result.totalRecords)}</td><td>{formatCount(item.result.validatedRecords)}</td><td>{formatPct(item.result.completionPct)}</td><td>{formatPct(item.result.compliancePct)}</td><td>{formatPct(item.result.meanEpisodeCompliancePct)}</td><td>{formatPct(item.result.episodeTargetMetPct)}</td><td>{formatPct(item.result.sectionDPassPct)}</td>
                  </tr>)}</tbody></table></WorkspaceTableViewport>}
              </section>
              <section className="qraPanel"><div className="qraPanelHead"><div><h3>Alur review data</h3></div></div><div className="qraStatusGrid">
                <div className="qraStatusBox"><span>Tervalidasi</span><strong>{pathway.statusCounts.validated}</strong></div>
                <div className="qraStatusBox"><span>Menunggu review</span><strong>{pathway.statusCounts.submitted + pathway.statusCounts.ready}</strong></div>
                <div className="qraStatusBox"><span>Draf</span><strong>{pathway.statusCounts.draft}</strong></div>
                <div className="qraStatusBox"><span>Dibuka kembali</span><strong>{pathway.statusCounts.reopened}</strong></div>
              </div></section>
              
            </>
            : <>
              <div className="qraPanel"><div className="qraPanelHead"><div><h3>Jenis hasil telaah</h3></div>
                <div className="qraTabs"><button type="button" className={clinicalTab === 'clinical' ? 'active' : ''} onClick={() => setClinicalTab('clinical')}>Audit Klinis</button><button type="button" className={clinicalTab === 'death' ? 'active' : ''} onClick={() => setClinicalTab('death')}>Audit Kematian</button></div>
              </div></div>
              <div className="qraKpis">
                <Kpi label="Telaah tercatat" value={formatCount(selectedClinical.totalRecords)} detail="Draf, diajukan, dibuka kembali, dan tervalidasi" />
                <Kpi label="Telaah tervalidasi" value={formatCount(selectedClinical.validatedRecords)} detail="Satu-satunya status yang masuk ringkasan skor" />
                <Kpi label="Median skor mutu pelayanan" value={selectedClinical.overallScore.median == null ? '-' : String(selectedClinical.overallScore.median).replace('.', ',') + ' / 5'} detail={selectedClinical.overallScore.n ? 'IQR ' + selectedClinical.overallScore.q1 + '–' + selectedClinical.overallScore.q3 + ' · n=' + selectedClinical.overallScore.n : 'Belum ada skor tervalidasi'} />
                <Kpi label="Rekomendasi tindak lanjut" value={formatCount(selectedClinical.createdActions)} detail="Telaah tervalidasi dengan rekomendasi terdokumentasi" />
              </div>
              <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Skor per fase perawatan</h3></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada telaah tervalidasi" detail="" />
                    : <div className="qraContent">{selectedClinical.phases.map((phase) => <Bar key={phase.id} label={phase.label} value={phase.summary.median} max={5} suffix=" / 5" sublabel={'Median ordinal · IQR ' + (phase.summary.q1 ?? '-') + '–' + (phase.summary.q3 ?? '-') + ' · n=' + phase.summary.n} />)}</div>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Masalah mutu pelayanan</h3></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada hasil untuk ditampilkan" detail="" />
                    : <div className="qraContent">{[
                      ['Teridentifikasi', selectedClinical.careIssue.yes],
                      ['Tidak teridentifikasi', selectedClinical.careIssue.no],
                      ['Belum pasti', selectedClinical.careIssue.uncertain],
                      ['Belum diisi', selectedClinical.careIssue.missing],
                    ].map(([label, count]) => <Bar key={String(label)} label={String(label)} value={Number(count)} max={selectedClinical.validatedRecords} suffix="" sublabel={formatCount(Number(count)) + ' dari ' + formatCount(selectedClinical.validatedRecords)} />)}</div>}
                </section>
              </div>
              {clinicalTab === 'death' && <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Kontribusi masalah pelayanan terhadap kematian</h3></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada hasil audit kematian tervalidasi" detail="" />
                    : <div className="qraContent">{[
                      ['Ya', selectedClinical.contribution.yes],
                      ['Tidak', selectedClinical.contribution.no],
                      ['Belum pasti', selectedClinical.contribution.uncertain],
                      ['Belum diisi', selectedClinical.contribution.missing],
                    ].map(([label, count]) => <Bar key={String(label)} label={String(label)} value={Number(count)} max={selectedClinical.validatedRecords} suffix="" sublabel={formatCount(Number(count)) + ' kasus'} />)}</div>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Skor ketercegahan kematian</h3></div></div>
                  {selectedClinical.avoidability.n === 0
                    ? <EmptyState title="Belum ada skor ketercegahan" detail="" />
                    : <><div className="qraContent"><strong>Median {selectedClinical.avoidability.median} / 6 · IQR {selectedClinical.avoidability.q1}–{selectedClinical.avoidability.q3} · n={selectedClinical.avoidability.n}</strong></div><Distribution summary={selectedClinical.avoidability} minimum={1} maximum={6}/></>}
                </section>
              </div>}
              <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Distribusi skor mutu pelayanan</h3></div></div>
                  {selectedClinical.overallScore.n === 0
                    ? <EmptyState title="Belum ada skor mutu pelayanan" detail="" />
                    : <><div className="qraContent"><strong>Median {selectedClinical.overallScore.median} / 5 · IQR {selectedClinical.overallScore.q1}–{selectedClinical.overallScore.q3} · n={selectedClinical.overallScore.n}</strong></div><Distribution summary={selectedClinical.overallScore} minimum={1} maximum={5}/></>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Hasil validasi per bulan</h3></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada validasi pada periode ini" detail="" />
                    : <div className="qraBars">{selectedValidationMonthly.map((item) => <div className="qraBarsItem" key={item.month}><div className="qraBarsTrack"><span style={{ height: (item.validated / Math.max(1, ...selectedValidationMonthly.map((entry) => entry.validated))) * 100 + '%' }} /></div><b>{item.validated}</b><small>{MONTHS[item.month - 1]}</small></div>)}</div>}
                </section>
              </div>
              <section className="qraPanel"><div className="qraPanelHead"><div><h3>Jejak kelengkapan telaah</h3></div></div>
                <div className="qraStatusGrid">
                  <div className="qraStatusBox"><span>Tervalidasi</span><strong>{selectedClinical.statusCounts.validated}</strong></div>
                  <div className="qraStatusBox"><span>Menunggu review</span><strong>{selectedClinical.statusCounts.submitted}</strong></div>
                  <div className="qraStatusBox"><span>Draf</span><strong>{selectedClinical.statusCounts.draft}</strong></div>
                  <div className="qraStatusBox"><span>Dibuka kembali</span><strong>{selectedClinical.statusCounts.reopened}</strong></div>
                </div>
                
              </section>
              
            </>}

    
  </div>
}
