'use client'

import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import qualityLayouts from '@/data/quality-audit-layout-2026.json'
import { summarizeOutpatientClinics } from '@/lib/aureka/outpatient-logbook'
import {
  aggregateClinicalDeathAudits,
  aggregateClinicalDeathByValidationMonth,
  aggregateClinicalPathwayRows,
  aggregatePathwayByMonth,
  calculateIndicatorResult,
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
  isValidator?: boolean
}
type IndicatorDataset = { profiles: IndicatorProfileForResults[]; rows: ResultRecord[] }
type PathwayDataset = ClinicalPathwayRow[]
type ClinicalDataset = ClinicalDeathAuditResultRow[]

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

function normalizeRoom(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function defaultRoom(rooms: Room[], initialRoomId: number | null, canViewAllRooms: boolean): number | null {
  if (canViewAllRooms) {
    const firstUnit = rooms.find((room) => /informasi\s+dan\s+pengaduan/i.test(room.name))
    if (firstUnit) return normalizeRoom(firstUnit.id)
  }
  const initial = normalizeRoom(initialRoomId)
  if (initial != null) return initial
  return normalizeRoom(rooms[0]?.id)
}

function formatCount(value: number | null | undefined): string {
  return value == null ? '—' : Number(value).toLocaleString('id-ID')
}

function formatPct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(2).replace('.', ',') + '%'
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
  if (!item || item.observations === 0) return '—'
  if (result.continuous) {
    const unit = result.unit ? ' ' + result.unit : ''
    const mean = item.mean == null ? '—' : item.mean.toFixed(2).replace('.', ',') + unit
    return mean + (item.targetAttainment == null ? '' : ' · ' + formatPct(item.targetAttainment) + ' target')
  }
  return formatPct(item.rate)
}

function attainmentCaption(result: ReturnType<typeof calculateIndicatorResult>): string {
  if (result.observations === 0) return 'Belum ada laporan final'
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
  const display = value == null || !Number.isFinite(value) ? '—' : Number(value).toFixed(suffix === '%' ? 1 : 0).replace('.', ',') + suffix
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

async function readPaged<T>(build: (from: number, to: number) => any, maximum = 10000): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = []
  const pageSize = 500
  for (let from = 0; from < maximum; from += pageSize) {
    const { data, error } = await build(from, Math.min(from + pageSize - 1, maximum - 1))
    if (error) throw error
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) return { rows, capped: false }
  }
  return { rows, capped: true }
}

export default function QualityResultsWorkspace({ mode, initialRoomId, rooms, canViewAllRooms, isValidator = false }: Props) {
  const [roomId, setRoomId] = useState<number | null>(() => defaultRoom(rooms, initialRoomId, canViewAllRooms))
  const [year, setYear] = useState(2026)
  const [clinicalTab, setClinicalTab] = useState<ClinicalTab>('clinical')
  const [indicatorData, setIndicatorData] = useState<IndicatorDataset>({ profiles: [], rows: [] })
  const [pathwayData, setPathwayData] = useState<PathwayDataset>([])
  const [clinicalData, setClinicalData] = useState<ClinicalDataset>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [capped, setCapped] = useState(false)
  const [reload, setReload] = useState(0)
  const [monthlyValidation, setMonthlyValidation] = useState<any | null>(null)
  const [validatingMonth, setValidatingMonth] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setCapped(false)
    setIndicatorData({ profiles: [], rows: [] })
    setPathwayData([])
    setClinicalData([])

    const load = async () => {
      const selectedRoom = normalizeRoom(roomId)
      if (selectedRoom == null) {
        throw new Error('Unit kerja belum terpetakan. Pilih unit yang valid sebelum melihat hasil audit.')
      }

      if (mode === 'indicators') {
        const [profileResult, recordResult] = await Promise.all([
          q().from('indicator_profiles')
            .select('id,room_id,code,title,indicator_type,unit_of_measure,target_text,target_operator,target_value,numerator_definition,denominator_definition,measurement_grain,schema_json,options_json')
            .eq('room_id', selectedRoom)
            .eq('profile_year', year)
            .eq('status', 'published')
            .eq('is_active', true)
            .order('code'),
          readPaged<ResultRecord>((from, to) => q().from('quality_records')
            .select('id,room_id,profile_year,record_date,status,created_at,updated_at,core_data')
            .eq('room_id', selectedRoom)
            .eq('profile_year', year)
            .neq('status', 'archived')
            .order('created_at', { ascending: false })
            .range(from, to)),
        ])
        if (profileResult.error) throw profileResult.error
        if (cancelled) return
        setIndicatorData({ profiles: (profileResult.data ?? []) as IndicatorProfileForResults[], rows: recordResult.rows })
        setCapped(recordResult.capped)
      } else if (mode === 'pathway') {
        const start = String(year) + '-01-01'
        const end = String(year + 1) + '-01-01'
        const result = await readPaged<ClinicalPathwayRow>((from, to) => q().from('clinical_pathway_audits')
          .select('room_id,template_code,template_name,admission_date,created_at,updated_at,status,template_snapshot,selected_items_json,additional_phases_json,inclusion_json,answers_json,variations_json,calculation_json')
          .eq('room_id', selectedRoom)
          .gte('admission_date', start)
          .lt('admission_date', end)
          .neq('status', 'archived')
          .order('admission_date', { ascending: false })
          .range(from, to))
        if (cancelled) return
        setPathwayData(result.rows)
        setCapped(result.capped)
      } else {
        const result = await readPaged<ClinicalDeathAuditResultRow>((from, to) => q().from('clinical_death_audits')
          .select('room_id,audit_type,review_period,review_phases:review_json->phases,review_recommended_actions:review_json->>recommended_actions,review_learning_points:review_json->>learning_points,overall_care_score,care_issue_identified,contribution_to_outcome,avoidability_score,status,created_at,updated_at,validated_at')
          .eq('room_id', selectedRoom)
          .eq('review_period', String(year))
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .range(from, to))
        if (cancelled) return
        setClinicalData(result.rows.map((row) => ({
          ...row,
          review_json: {
            phases: row.review_phases ?? {},
            recommended_actions: row.review_recommended_actions ?? '',
            learning_points: row.review_learning_points ?? '',
          },
        })))
        setCapped(result.capped)
      }
    }

    load().catch((loadError) => {
      if (cancelled) return
      setError('Hasil audit tidak dapat dimuat: ' + (loadError instanceof Error ? loadError.message : 'Periksa koneksi dan hak akses unit.'))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [mode, roomId, year, reload])

  const outpatientGroups = useMemo(() => ((qualityLayouts as any[]).find((layout) => Number(layout.roomId) === 11)?.providerGroups ?? []) as Array<{clinic:string;doctors:string[]}>, [])
  const outpatientClinicResults = useMemo(() => {
    if (Number(roomId) !== 11) return null
    const finalRecords = indicatorData.rows.filter((row) => ['ready','validated'].includes(String(row.status ?? '').toLowerCase()))
    const records = finalRecords.map((row) => ({ recordDate: row.record_date, admit: row.record_date, formData: row.core_data?.form_fields ?? {} }))
    const all = summarizeOutpatientClinics(records, outpatientGroups, year)
    const average = (items: typeof all) => {
      const values = items.filter((item) => item.rosterDoctorCount > 0 && item.averageMinutes != null).map((item) => item.averageMinutes as number)
      return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null
    }
    const monthResults = Array.from({length:12},(_,index)=>{
      const month=index+1
      const items=summarizeOutpatientClinics(records,outpatientGroups,year,month)
      const compliant=items.filter(item=>item.rosterDoctorCount>0&&item.averageMinutes!=null&&item.averageMinutes<60).length
      const operational=outpatientGroups.length
      const hasObservations=items.some(item=>item.rosterDoctorCount>0&&item.averageMinutes!=null)
      return {month,items,compliant,operational,rate:operational&&hasObservations?(compliant/operational)*100:null,mean:average(items)}
    })
    const compliant=all.filter(item=>item.rosterDoctorCount>0&&item.averageMinutes!=null&&item.averageMinutes<60).length
    const hasObservations=all.some(item=>item.rosterDoctorCount>0&&item.averageMinutes!=null)
    return {items:all,operational:outpatientGroups.length,compliant,missing:all.filter(item=>item.rosterDoctorCount>0&&item.averageMinutes==null).length,rate:outpatientGroups.length&&hasObservations?(compliant/outpatientGroups.length)*100:null,mean:average(all),records:records.length,monthResults}
  }, [roomId,indicatorData,year,outpatientGroups])
  const indicatorResults = useMemo(() => indicatorData.profiles.filter(profile => !(Number(roomId)===11 && String(profile.code)==='11.1')).map((profile) =>
    calculateIndicatorResult(profile, indicatorData.rows, year),
  ), [indicatorData, year, roomId])
  const assessedIndicators = indicatorResults.filter((result) => result.observations > 0 && result.targetMet != null)
  const metIndicators = assessedIndicators.filter((result) => result.targetMet === true).length + (outpatientClinicResults?.rate!=null && outpatientClinicResults.rate >= 100 ? 1 : 0)
  const overallDenominator = assessedIndicators.length + (outpatientClinicResults?.rate!=null ? 1 : 0)
  const overallIndicatorAchievement = overallDenominator ? (metIndicators / overallDenominator) * 100 : null
  const finalReportCount = mode === 'indicators'
    ? indicatorData.rows.filter((row) => ['ready','validated'].includes(String(row.status).toLowerCase())).length
    : 0
  const temporaryCount = mode === 'indicators'
    ? indicatorData.rows.filter((row) => String(row.status).toLowerCase() === 'draft').length
    : 0

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

  const selectedRoomName = rooms.find((room) => Number(room.id) === Number(roomId))?.name ?? 'Unit tidak diketahui'
  const previousPeriod = (() => { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Pontianak',year:'numeric',month:'2-digit'}).formatToParts(new Date());const cy=Number(parts.find(p=>p.type==='year')?.value),cm=Number(parts.find(p=>p.type==='month')?.value);const d=new Date(Date.UTC(cy,cm-2,1));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1} })()
  const [monthlyValidationError, setMonthlyValidationError] = useState('')
  const validateMonthlyReport = async () => {
    if (!isValidator || roomId == null || validatingMonth || monthlyValidation) return
    setValidatingMonth(true);setMonthlyValidationError('')
    try {
      const {data,error} = await q().rpc('validate_quality_monthly_report',{p_room_id:roomId,p_report_year:previousPeriod.year,p_report_month:previousPeriod.month})
      if(error) throw error
      setMonthlyValidation(data)
    } catch (error) { setMonthlyValidationError(error instanceof Error ? error.message : 'Validasi laporan bulanan gagal.') }
    finally { setValidatingMonth(false) }
  }
  useEffect(() => {
    let cancelled=false
    setMonthlyValidation(null);setMonthlyValidationError('')
    if(!isValidator||roomId==null)return
    void q().from('monthly_report_validations').select('*').eq('room_id',roomId).eq('report_year',previousPeriod.year).eq('report_month',previousPeriod.month).maybeSingle()
      .then(({data,error})=>{if(cancelled)return;if(error)setMonthlyValidationError(error.message);else setMonthlyValidation(data)})
    return ()=>{cancelled=true}
  },[isValidator,roomId,reload,previousPeriod.year,previousPeriod.month])

  const pageCss = `
    .qraValidation{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:14px}.qraValidation strong{font-size:12px}.qraValidation p{margin:3px 0 0;color:var(--muted);font-size:9px;line-height:1.5}.qraValidationMeta{font-size:9px;color:var(--muted)}.qraValidationBtn{border:0;border-radius:9px;padding:10px 15px;background:var(--accent2);color:#fff;font-size:10px;font-weight:850;cursor:pointer}.qraValidationBtn:disabled{opacity:.5;cursor:not-allowed}.qraValidationDone{padding:7px 10px;border-radius:8px;background:#e9f6ee;color:#216b49;font-size:10px;font-weight:850}
    .qra{display:grid;gap:14px;color:var(--ink)}
    .qraHero,.qraPanel{background:var(--surface,#fff);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(18,47,34,.045)}
    .qraHero{padding:18px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
    .qraEyebrow{font-size:9px;font-weight:900;letter-spacing:.1em;color:var(--accent2)}
    .qraHero h2{font-size:24px;letter-spacing:-.045em;margin:5px 0}
    .qraHero p{margin:0;max-width:850px;color:var(--muted);font-size:11px;line-height:1.6}
    .qraActions{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
    .qraField{display:grid;gap:5px;min-width:145px}.qraField span{font-size:9px;color:var(--muted);font-weight:850}
    .qraField select{min-height:39px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff);color:var(--ink);padding:8px 10px;font-size:11px}
    .qraBtn{min-height:39px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff);color:var(--accent2);font-size:10px;font-weight:850;padding:8px 12px;cursor:pointer}
    .qraKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .qraKpi{padding:14px 15px;min-width:0;background:var(--surface,#fff);border:1px solid var(--line);border-radius:15px}
    .qraKpi span{display:block;font-size:9px;color:var(--muted);font-weight:850}
    .qraKpi strong{display:block;margin:5px 0 2px;font-size:23px;letter-spacing:-.035em}
    .qraKpi small{display:block;color:var(--muted);font-size:9px;line-height:1.45}
    .qraPill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#edf1ee;color:#5f7066;font-size:9px;font-weight:850;white-space:nowrap}
    .qraPill.good{background:#e8f7ef;color:#216b49}.qraPill.poor{background:#fff0ed;color:#923e34}.qraPill.muted{background:#edf1ee;color:#63716a}
    .qraPanel{overflow:hidden}.qraPanelHead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 15px;border-bottom:1px solid var(--line)}
    .qraPanelHead h3{margin:0;font-size:14px}.qraPanelHead p{margin:3px 0 0;color:var(--muted);font-size:9px;line-height:1.45}
    .qraNotice{padding:10px 14px;background:#f5f8f6;color:#51655a;font-size:10px;line-height:1.5;border-top:1px solid var(--line)}
    .qraTableWrap{overflow:auto;max-width:100%}.qraTable{width:100%;min-width:980px;border-collapse:collapse;font-size:10px}
    .qraTable th,.qraTable td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
    .qraTable th{background:#f7faf8;color:#66766d;font-size:8px;white-space:nowrap;position:sticky;top:0;z-index:1}
    .qraTable td strong{display:block;font-size:10px}.qraTable td small{display:block;color:var(--muted);font-size:8px;margin-top:3px;line-height:1.4}
    .qraMonthly{display:grid;grid-template-columns:repeat(12,minmax(13px,1fr));gap:3px;align-items:end;min-width:190px;height:44px}
    .qraMonthly span{display:block;background:var(--accent-soft);border-radius:4px 4px 2px 2px;min-height:2px;position:relative}
    .qraMonthly span.empty{background:#eef1ef}
    .qraMonthlyLabels{display:grid;grid-template-columns:repeat(12,minmax(13px,1fr));gap:3px;margin-top:4px}
    .qraMonthlyLabels span{text-align:center;color:var(--muted);font-size:7px}
    .qraMonthMatrix{display:grid;grid-template-columns:repeat(12,minmax(44px,1fr));gap:3px;min-width:550px}
    .qraMonthCell{padding:6px 4px;background:#f8faf9;border-radius:7px;text-align:center;min-height:42px}
    .qraMonthCell strong{display:block;font-size:9px}.qraMonthCell small{display:block;color:var(--muted);font-size:7px;margin-top:3px}
    .qraMonthCell.empty{color:#a2ada6;background:#f4f6f5}
    .qraEmpty{display:grid;place-items:center;text-align:center;min-height:145px;padding:24px;color:var(--muted)}
    .qraEmptyIcon{font-size:24px;color:#9aa9a0}.qraDim{opacity:.48}.qraEmpty strong{font-size:12px;color:var(--ink);margin-top:8px}.qraEmpty p{max-width:520px;margin:5px 0 0;font-size:10px;line-height:1.55}
    .qraBars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end;padding:15px}
    .qraBarsItem{display:grid;gap:5px;text-align:center;min-width:0}.qraBarsTrack{height:112px;border-radius:8px;background:#eef2ef;display:flex;align-items:flex-end;overflow:hidden}
    .qraBarsTrack span{display:block;width:100%;border-radius:7px 7px 0 0;background:linear-gradient(180deg,#54a783,#197653);min-height:0}
    .qraBarsItem b{font-size:8px}.qraBarsItem small{font-size:8px;color:var(--muted)}
    .qraLegend{display:flex;gap:12px;flex-wrap:wrap;padding:0 15px 12px;color:var(--muted);font-size:9px}
    .qraLegend span{display:inline-flex;align-items:center;gap:5px}.qraDot{width:9px;height:9px;border-radius:3px;background:#197653}
    .qraStatusGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px}
    .qraStatusBox{background:#f7faf8;border:1px solid var(--line);border-radius:11px;padding:10px}.qraStatusBox span{display:block;font-size:8px;color:var(--muted)}.qraStatusBox strong{font-size:16px;display:block;margin-top:4px}
    .qraSplit{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .qraContent{padding:14px}
    .qraBarRow{display:grid;gap:4px;padding:9px 0;border-bottom:1px solid var(--line)}.qraBarRow:last-child{border-bottom:0}
    .qraBarLabel{display:flex;justify-content:space-between;gap:8px;font-size:9px}.qraBarLabel strong{font-size:9px}
    .qraBarTrack{height:8px;background:#eef2ef;border-radius:99px;overflow:hidden}.qraBarTrack span{display:block;height:100%;background:linear-gradient(90deg,#76b995,#176b4d);border-radius:99px}
    .qraDistribution{display:grid;gap:7px;padding:12px 14px}
    .qraDistributionItem{display:grid;grid-template-columns:18px minmax(0,1fr) 28px;gap:7px;align-items:center;font-size:9px}
    .qraDistributionItem>div{height:9px;background:#eff2f0;border-radius:99px;overflow:hidden}.qraDistributionItem i{display:block;height:100%;background:#4c9a76;border-radius:99px}
    .qraDistributionItem b{text-align:right}
    .qraTabs{display:flex;gap:6px;padding:7px;background:#f6f8f7;border-radius:12px}
    .qraTabs button{border:1px solid transparent;background:transparent;border-radius:9px;padding:8px 12px;font-size:10px;font-weight:850;color:var(--muted);cursor:pointer}
    .qraTabs button.active{background:#fff;border-color:var(--line);color:var(--accent2)}
    .qraError{padding:12px 14px;border-radius:12px;border:1px solid #f1d1cb;background:#fff0ed;color:#8e3e34;font-size:10px;line-height:1.5}
    .qraInfo{padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:#f7faf8;color:var(--muted);font-size:10px;line-height:1.55}
    @media(max-width:1050px){.qraKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.qraSplit{grid-template-columns:1fr}.qraStatusGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:650px){.qraHero{display:grid}.qraActions{width:100%}.qraField{flex:1;min-width:120px}.qraKpis{grid-template-columns:1fr 1fr}.qraKpi strong{font-size:19px}.qraBars{gap:3px;padding:10px}.qraBarsTrack{height:80px}.qraStatusGrid{grid-template-columns:1fr 1fr}}
  `

  const totalRows = mode === 'indicators'
    ? indicatorData.rows.length
    : mode === 'pathway'
      ? pathwayData.length
      : clinicalData.length
  const loadingError = !!error

  return <div className="qra">
    <style>{pageCss}</style>
    <section className="qraHero">
      <div>
        <div className="qraEyebrow">AUREKA · HASIL AUDIT MUTU KLINIS</div>
        <h2>{modeTitle(mode)}</h2>
        <p>{mode === 'indicators'
          ? 'Analisis capaian indikator per bulan, hasil kumulatif tahunan, status target, keterkinian input, dan kelengkapan data untuk satu unit kerja.'
          : mode === 'pathway'
            ? 'Analisis kelengkapan dan kepatuhan Clinical Pathway pada seluruh laporan final PIC, dengan denominator sel yang benar-benar dijadwalkan dan dinilai.'
            : 'Analisis hasil telaah klinis dan kematian. Distribusi serta median skor dihitung dari laporan final PIC; data pasien tidak ditampilkan pada laporan.'}</p>
      </div>
      <div className="qraActions">
        <label className="qraField"><span>Unit kerja</span><select value={roomId ?? ''} disabled={!canViewAllRooms} onChange={(event) => setRoomId(normalizeRoom(event.target.value))}>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>
        <label className="qraField"><span>Tahun</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {YEARS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <button type="button" className="qraBtn" disabled={loading} onClick={() => setReload((value) => value + 1)}>{loading ? 'Memuat…' : '↻ Muat ulang'}</button>
      </div>
    </section>

    {error && <div className="qraError" role="alert">{error}</div>}
    {capped && <div className="qraInfo" role="status">Daftar dibatasi 10.000 catatan. Ringkasan ini hanya mencakup data yang terbaca; periksa rentang tahun atau unit bila diperlukan.</div>}
    {isValidator && <section className="qraValidation" aria-label="Pemeriksaan laporan bulanan"><div><strong>Pemeriksaan laporan bulanan · {MONTHS[previousPeriod.month-1]} {previousPeriod.year}</strong><p>Satu konfirmasi untuk seluruh laporan periode sebelumnya pada unit ini. Batas penilaian tepat waktu: tanggal 10 bulan berjalan. Konfirmasi setelah tanggal 10 tetap tercatat sebagai terlambat.</p>{monthlyValidationError&&<p role="alert" style={{color:'#9b3b31'}}>{monthlyValidationError}</p>}{monthlyValidation&&<div className="qraValidationMeta">Diperiksa {formatDateTime(monthlyValidation.validated_at)} · {monthlyValidation.validated_on_time?'Tepat waktu':'Terlambat'} · {formatCount(monthlyValidation.total_record_count)} laporan tercakup (Indikator {formatCount(monthlyValidation.quality_record_count)}, CP {formatCount(monthlyValidation.clinical_pathway_count)}, Klinis/Kematian {formatCount(monthlyValidation.clinical_death_count)})</div>}</div>{monthlyValidation?<span className="qraValidationDone">✓ Sudah diperiksa</span>:<button className="qraValidationBtn" type="button" disabled={validatingMonth||loading||roomId==null} onClick={()=>void validateMonthlyReport()}>{validatingMonth?'Menyimpan pemeriksaan…':'Sudah diperiksa'}</button>}</section>}
    {loading
      ? <div className="qraPanel"><EmptyState title="Memuat data hasil audit…" detail="Mengambil data satu unit dan satu tahun sesuai hak akses." /></div>
      : loadingError
        ? null
        : mode === 'indicators'
          ? <>
            <div className="qraKpis">
              <Kpi label="Capaian Mutu Unit Secara Keseluruhan" value={overallIndicatorAchievement == null ? '—' : formatPct(overallIndicatorAchievement)} detail={assessedIndicators.length ? metIndicators + ' dari ' + assessedIndicators.length + ' indikator dengan target terukur memenuhi target' : 'Belum ada indikator dengan data yang dapat dinilai'} />
              <Kpi label="Indikator aktif" value={formatCount(indicatorResults.length + (outpatientClinicResults ? 1 : 0))} detail="Profil terbit dan aktif pada tahun terpilih" />
              <Kpi label="Laporan final" value={formatCount(finalReportCount)} detail="Laporan yang telah disampaikan PIC" />
              <Kpi label="Data sementara" value={formatCount(temporaryCount)} detail="Belum masuk perhitungan hasil audit" />
            </div>
            <section className="qraPanel">
              <div className="qraPanelHead"><div><h3>Hasil setiap indikator</h3><p>Setiap persentase rasio menggunakan Σ numerator ÷ Σ denominator; bukan rerata sederhana antarbaris atau antarb ulan.</p></div><span className="qraPill">{selectedRoomName} · {year}</span></div>
              {indicatorResults.length === 0
                ? <EmptyState title="Belum ada indikator aktif" detail="Master indikator tahun ini belum memiliki profil aktif dan terbit untuk unit yang dipilih." />
                : <div className="qraTableWrap"><table className="qraTable qraIndicatorTable">
                  <thead><tr><th>Indikator / target</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}<th>Rata-rata tahunan</th><th>Status target</th><th>Input terakhir</th><th>Jumlah data</th></tr></thead>
                  <tbody>{outpatientClinicResults && <tr key="outpatient-clinic-summary"><td><strong>11.1 · Waktu Tunggu Rawat Jalan</strong><small>Target: 100% klinik operasional memiliki rerata waktu tunggu &lt;60 menit · Rerata tidak berbobot dari rerata setiap dokter.</small></td>{outpatientClinicResults.monthResults.map(month=><td key={month.month} className={month.items.some(item=>item.averageMinutes!=null)?'':'qraDim'}><b>{month.rate==null?'—':formatPct(month.rate)}</b><small>{month.rate==null?'Belum ada data':month.compliant+'/'+month.operational+' klinik &lt;60 menit'}</small></td>)}<td><strong>{outpatientClinicResults.rate==null?'—':formatPct(outpatientClinicResults.rate)}</strong><small>{outpatientClinicResults.rate==null?'Belum ada data pengukuran klinik':outpatientClinicResults.compliant+'/'+outpatientClinicResults.operational+' klinik · rerata '+(outpatientClinicResults.mean==null?'—':outpatientClinicResults.mean.toFixed(2).replace('.',',')+' menit')} · {outpatientClinicResults.missing} klinik tanpa data</small></td><td><StatusPill value={outpatientClinicResults.rate==null?null:outpatientClinicResults.rate>=100}/></td><td>{formatDateTime(indicatorData.rows.filter(row=>['ready','validated'].includes(String(row.status??'').toLowerCase())).map(row=>row.updated_at??row.created_at??'').filter(Boolean).sort().at(-1)??null)}</td><td><strong>{formatCount(outpatientClinicResults.records)}</strong><small>Catatan dokter-hari final</small></td></tr>}{indicatorResults.map((result) => <tr key={result.profile.id ?? result.profile.code}>
                    <td><strong>{result.profile.code ? result.profile.code + ' · ' : ''}{result.profile.title ?? 'Indikator tanpa judul'}</strong><small>Target: {targetLabel(result.profile)} · {result.kind === 'ratio' ? 'Rasio N/D' : result.continuous ? 'Rerata pengukuran dan target per observasi' : 'Proporsi hasil numerator'}</small></td>
                    {result.monthly.map((month) => <td key={month.month} className={month.observations === 0 ? 'qraDim' : ''}><b>{indicatorMonthlyLabel(result, month.month)}</b><small>n={formatCount(month.observations)} laporan final{result.continuous ? '' : ' · N/D ' + formatCount(month.numerator) + '/' + formatCount(month.denominator)}</small></td>)}
                    <td><strong>{result.continuous ? (result.annualMean == null ? '—' : result.annualMean.toFixed(2).replace('.', ',') + (result.unit ? ' ' + result.unit : '')) : formatPct(result.annualRate)}</strong><small>{attainmentCaption(result)}{result.monthlyMeanRate == null ? '' : ' · rerata bulanan ' + formatPct(result.monthlyMeanRate)}</small></td>
                    <td><StatusPill value={result.targetMet} /></td>
                    <td>{formatDateTime(result.latestInputAt)}</td>
                    <td><strong>{formatCount(result.observations)}</strong><small>{formatCount(result.observations)} laporan final</small></td>
                  </tr>)}</tbody>
                </table></div>}
              <div className="qraNotice">Capaian mutu unit merupakan proporsi indikator yang targetnya dapat dinilai dan memenuhi target, bukan rata-rata persentase indikator yang berbeda definisi. Laporan final yang disampaikan PIC masuk dalam perhitungan; data sementara tidak dihitung. Untuk indikator 11.1, proporsi dihitung dari jumlah klinik operasional dengan rerata waktu tunggu &lt;60 menit dibagi seluruh klinik dalam roster operasional. Klinik tanpa data tetap berada dalam denominator dan tidak dinilai memenuhi target. Untuk rasio lain, capaian menggunakan penggabungan numerator dan denominator.</div>
            </section>
          </>
          : mode === 'pathway'
            ? <>
              <div className="qraKpis">
                <Kpi label="Audit Clinical Pathway" value={formatCount(pathway.overall.totalRecords)} detail={pathway.overall.validatedRecords + ' laporan final'} />
                <Kpi label="Keterisian laporan CP" value={formatPct(pathway.overall.completionPct)} detail={formatCount(pathway.overall.filled) + ' dari ' + formatCount(pathway.overall.expected) + ' sel terjadwal telah diputuskan'} />
                <Kpi label="Kepatuhan laporan CP" value={formatPct(pathway.overall.compliancePct)} detail={formatCount(pathway.overall.done) + ' sesuai dari ' + formatCount(pathway.overall.done + pathway.overall.notDone) + ' sel yang dinilai'} />
                <Kpi label="Episode memenuhi target CP" value={formatPct(pathway.overall.episodeTargetMetPct)} detail={pathway.overall.targetMetRecords + ' dari ' + pathway.overall.assessedRecords + ' episode dengan skor terukur'} />
              </div>
              <section className="qraPanel">
                <div className="qraPanelHead"><div><h3>Tren bulanan berdasarkan tanggal masuk</h3><p>Seluruh laporan final; numerator dan denominator dijumlahkan antar-episode.</p></div><span className="qraPill">{pathway.overall.validatedRecords} laporan final</span></div>
                {pathway.overall.validatedRecords === 0
                  ? <EmptyState title="Belum ada laporan Clinical Pathway" detail="Grafik dan capaian akan tersedia setelah PIC melaporkan audit Clinical Pathway. Data sementara tidak diperlakukan sebagai capaian." />
                  : <>
                    <div className="qraBars">{pathwayMonthly.map((month) => <div className="qraBarsItem" key={month.month}>
                      <div className="qraBarsTrack"><span style={{ height: (month.compliancePct ?? 0) + '%' }} /></div><b>{month.compliancePct == null ? '—' : Math.round(month.compliancePct) + '%'}</b><small>{MONTHS[month.month - 1]}</small>
                    </div>)}</div>
                    <div className="qraLegend"><span><i className="qraDot"/>Kepatuhan laporan CP</span></div>
                  </>}
              </section>
              <section className="qraPanel">
                <div className="qraPanelHead"><div><h3>Hasil menurut Clinical Pathway</h3><p>Rekap per template; denominator kepatuhan mengecualikan sel N/A dan sel yang tidak dijadwalkan.</p></div></div>
                {pathwayTemplates.length === 0
                  ? <EmptyState title="Belum ada template dengan catatan audit" detail="Daftar akan terbentuk otomatis berdasarkan template yang dipakai pada audit." />
                  : <div className="qraTableWrap"><table className="qraTable"><thead><tr><th>Clinical Pathway</th><th>Jumlah audit</th><th>Laporan final</th><th>Keterisian tertimbang</th><th>Kepatuhan tertimbang</th><th>Rata-rata per episode</th><th>Episode memenuhi target</th><th>Bagian D lulus</th></tr></thead><tbody>{pathwayTemplates.map((item) => <tr key={item.code}>
                    <td><strong>{item.name}</strong><small>{item.code}</small></td><td>{formatCount(item.result.totalRecords)}</td><td>{formatCount(item.result.validatedRecords)}</td><td>{formatPct(item.result.completionPct)}</td><td>{formatPct(item.result.compliancePct)}</td><td>{formatPct(item.result.meanEpisodeCompliancePct)}</td><td>{formatPct(item.result.episodeTargetMetPct)}</td><td>{formatPct(item.result.sectionDPassPct)}</td>
                  </tr>)}</tbody></table></div>}
              </section>
              
              <div className="qraInfo">Interpretasi: keterisian = sel terisi ÷ seluruh sel yang dijadwalkan. Kepatuhan = sel “Sesuai” ÷ (sel “Sesuai” + “Tidak Sesuai”); N/A dan sel yang tidak dijadwalkan tidak masuk denominator. Karena setiap template memiliki target sendiri, proporsi episode yang memenuhi target dihitung terhadap target pada snapshot template masing-masing.</div>
            </>
            : <>
              <div className="qraPanel"><div className="qraPanelHead"><div><h3>Jenis hasil telaah</h3><p>Pisahkan distribusi audit klinis dan audit kematian untuk menghindari pencampuran denominator.</p></div>
                <div className="qraTabs"><button type="button" className={clinicalTab === 'clinical' ? 'active' : ''} onClick={() => setClinicalTab('clinical')}>Audit Klinis</button><button type="button" className={clinicalTab === 'death' ? 'active' : ''} onClick={() => setClinicalTab('death')}>Audit Kematian</button></div>
              </div></div>
              <div className="qraKpis">
                <Kpi label="Telaah tercatat" value={formatCount(selectedClinical.totalRecords)} detail="Seluruh catatan audit pada periode terpilih" />
                <Kpi label="Laporan final" value={formatCount(selectedClinical.validatedRecords)} detail="Laporan PIC yang masuk ringkasan audit" />
                <Kpi label="Median skor mutu pelayanan" value={selectedClinical.overallScore.median == null ? '—' : String(selectedClinical.overallScore.median).replace('.', ',') + ' / 5'} detail={selectedClinical.overallScore.n ? 'IQR ' + selectedClinical.overallScore.q1 + '–' + selectedClinical.overallScore.q3 + ' · n=' + selectedClinical.overallScore.n : 'Belum ada skor laporan final'} />
                <Kpi label="Rekomendasi tindak lanjut" value={formatCount(selectedClinical.createdActions)} detail="Laporan final dengan rekomendasi terdokumentasi" />
              </div>
              <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Skor per fase perawatan</h3><p>Median dan IQR skala ordinal 1–5; fase N/A tidak dihitung.</p></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada laporan final" detail="Skor fase akan dihitung setelah PIC melaporkan telaah. Catatan sementara tidak dimasukkan." />
                    : <div className="qraContent">{selectedClinical.phases.map((phase) => <Bar key={phase.id} label={phase.label} value={phase.summary.median} max={5} suffix=" / 5" sublabel={'Median ordinal · IQR ' + (phase.summary.q1 ?? '—') + '–' + (phase.summary.q3 ?? '—') + ' · n=' + phase.summary.n} />)}</div>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Masalah mutu pelayanan</h3><p>Distribusi penilaian pada seluruh laporan final.</p></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada hasil untuk ditampilkan" detail="Distribusi akan terbentuk setelah PIC melaporkan telaah." />
                    : <div className="qraContent">{[
                      ['Teridentifikasi', selectedClinical.careIssue.yes],
                      ['Tidak teridentifikasi', selectedClinical.careIssue.no],
                      ['Belum pasti', selectedClinical.careIssue.uncertain],
                      ['Belum diisi', selectedClinical.careIssue.missing],
                    ].map(([label, count]) => <Bar key={String(label)} label={String(label)} value={Number(count)} max={selectedClinical.validatedRecords} suffix="" sublabel={formatCount(Number(count)) + ' dari ' + formatCount(selectedClinical.validatedRecords)} />)}</div>}
                </section>
              </div>
              {clinicalTab === 'death' && <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Kontribusi masalah pelayanan terhadap kematian</h3><p>Penilaian reviewer; bukan kesimpulan otomatis kausalitas.</p></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada laporan audit kematian" detail="Distribusi kontribusi akan tampil setelah laporan audit kematian disampaikan." />
                    : <div className="qraContent">{[
                      ['Ya', selectedClinical.contribution.yes],
                      ['Tidak', selectedClinical.contribution.no],
                      ['Belum pasti', selectedClinical.contribution.uncertain],
                      ['Belum diisi', selectedClinical.contribution.missing],
                    ].map(([label, count]) => <Bar key={String(label)} label={String(label)} value={Number(count)} max={selectedClinical.validatedRecords} suffix="" sublabel={formatCount(Number(count)) + ' kasus'} />)}</div>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Skor ketercegahan kematian</h3><p>Skala ordinal 1–6; laporkan distribusi, median dan IQR tanpa menyamakan skor sebagai probabilitas kausal.</p></div></div>
                  {selectedClinical.avoidability.n === 0
                    ? <EmptyState title="Belum ada skor ketercegahan" detail="Skala 1 (pasti dapat dicegah) sampai 6 (pasti tidak dapat dicegah) akan ditampilkan setelah laporan final tersedia." />
                    : <><div className="qraContent"><strong>Median {selectedClinical.avoidability.median} / 6 · IQR {selectedClinical.avoidability.q1}–{selectedClinical.avoidability.q3} · n={selectedClinical.avoidability.n}</strong></div><Distribution summary={selectedClinical.avoidability} minimum={1} maximum={6}/></>}
                </section>
              </div>}
              <div className="qraSplit">
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Distribusi skor mutu pelayanan</h3><p>Skala ordinal 1–5; median dan IQR menjadi ringkasan utama.</p></div></div>
                  {selectedClinical.overallScore.n === 0
                    ? <EmptyState title="Belum ada skor mutu pelayanan" detail="Tidak ada nilai yang dibuat-buat; distribusi menunggu laporan final." />
                    : <><div className="qraContent"><strong>Median {selectedClinical.overallScore.median} / 5 · IQR {selectedClinical.overallScore.q1}–{selectedClinical.overallScore.q3} · n={selectedClinical.overallScore.n}</strong></div><Distribution summary={selectedClinical.overallScore} minimum={1} maximum={5}/></>}
                </section>
                <section className="qraPanel"><div className="qraPanelHead"><div><h3>Jumlah laporan final per bulan</h3><p>Jumlah laporan yang tercatat pada periode masing-masing.</p></div></div>
                  {selectedClinical.validatedRecords === 0
                    ? <EmptyState title="Belum ada laporan final pada periode ini" detail="Grafik bulanan akan muncul seiring penyampaian laporan final PIC." />
                    : <div className="qraBars">{selectedValidationMonthly.map((item) => <div className="qraBarsItem" key={item.month}><div className="qraBarsTrack"><span style={{ height: (item.validated / Math.max(1, ...selectedValidationMonthly.map((entry) => entry.validated))) * 100 + '%' }} /></div><b>{item.validated}</b><small>{MONTHS[item.month - 1]}</small></div>)}</div>}
                </section>
              </div>
              <section className="qraPanel"><div className="qraPanelHead"><div><h3>Jejak kelengkapan telaah</h3><p>Dokumentasi tidak disamakan dengan penyelesaian tindak lanjut.</p></div></div><div className="qraNotice">Poin pembelajaran terdokumentasi: {selectedClinical.learningDocumented} laporan final. Rekomendasi tindak lanjut terdokumentasi: {selectedClinical.createdActions} laporan final. Modul saat ini menyimpan rekomendasi, belum status penyelesaian tindakan.</div></section>
              <div className="qraInfo">Semua skor dan distribusi pada halaman ini dihitung dari laporan final untuk unit dan periode yang dipilih. Skor 1–5 dan 1–6 diperlakukan sebagai data ordinal; median, IQR, dan distribusi diprioritaskan dibanding rerata aritmetika. Audit kematian tidak secara otomatis menyimpulkan bahwa kematian dapat dicegah atau bahwa masalah pelayanan menyebabkan kematian.</div>
            </>}

    <div className="qraFoot"><span>Sumber: Supabase AUREKA · {selectedRoomName} · {year} · {formatCount(totalRows)} catatan terbaca</span><span>Data terakhir diperbarui: {formatDateTime(latestDataInputAt)}</span></div>
  </div>
}
