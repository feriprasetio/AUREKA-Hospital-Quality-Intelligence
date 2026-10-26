'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'
import {
  buildOppeScore,
  evaluateClinicalIndicator,
  isInPeriod,
  professionMatches,
  recordFields,
  type ClinicalIndicatorResult,
  type ManualAssessmentItem,
  type ManualItemStatus,
  type OppeProfile,
  type OppeQualityRecord,
  type OppeResponseRow,
  type OppeRule,
} from '@/lib/aureka/oppe-engine'

type Room = { id: number; name: string }
type SavedAssessment = Record<string, any>
type AuditLayout = { roomId: number; fields: string[]; indicators: string[]; measurementGrain?: string }
type RuleDraft = {
  ruleId: string | null
  profileId: string
  profileYear: number
  roomId: number
  eligible: boolean
  professionLabel: string
  responsibilityField: string
  measurementMethod: OppeRule['measurement_method']
  minimumObservations: number
  criticality: OppeRule['criticality']
  notes: string
}
type GapDraft = {
  title: string
  professionLabel: string
  roomId: number
  measurementGrain: string
  targetText: string
  targetOperator: string
  targetValue: string
  unitOfMeasure: string
  numeratorDefinition: string
  denominatorDefinition: string
  responsibilityField: string
  notes: string
}
type FormState = {
  id: string | null
  roomId: number
  staffName: string
  staffIdentifier: string
  profession: string
  year: number
  quarter: number
  status: string
  behavior: ManualAssessmentItem[]
  professionalism: ManualAssessmentItem[]
  evaluatorName: string
  evaluatorRole: string
  assessmentNotes: string
  developmentPlan: string
}

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const LAYOUTS = qualityAuditLayout2026 as AuditLayout[]
const quarters = [
  { value: 1, label: 'Triwulan I' },
  { value: 2, label: 'Triwulan II' },
  { value: 3, label: 'Triwulan III' },
  { value: 4, label: 'Triwulan IV' },
]
const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i)
const statusLabel: Record<string, string> = {
  draft: 'Draf',
  submitted: 'Menunggu validasi',
  validated: 'Tervalidasi',
  reopened: 'Dikembalikan untuk perbaikan',
  archived: 'Diarsipkan',
}
const statusTone: Record<string, string> = {
  draft: 'oppeNeutral',
  submitted: 'oppeInfo',
  validated: 'oppeGood',
  reopened: 'oppeWarn',
  archived: 'oppeNeutral',
}
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
const keyName = (value: string) => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const asObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const fmtNum = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const fmtPct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
const displayMethod = (method: string) => ({
  numerator_denominator: 'Pembilang / penyebut',
  option_response: 'Pilihan respons berkode',
  numeric_target: 'Nilai numerik dibanding target',
  manual_review: 'Telaah manual (tidak masuk skor otomatis)',
} as Record<string, string>)[method] || method
const defaultBehavior = (): ManualAssessmentItem[] => [
  { id: 'patient_complaints', label: 'Keluhan pasien/pengguna layanan yang telah diverifikasi', target: 'Trigger referensi formulir revisi: > 2 kali; bukan keputusan otomatis', status: 'pending', count: '', evidence: '', notes: '' },
  { id: 'peer_complaints', label: 'Keluhan rekan sejawat yang telah diverifikasi', target: 'Trigger referensi formulir revisi: > 2 kali; bukan keputusan otomatis', status: 'pending', count: '', evidence: '', notes: '' },
  { id: 'management_complaints', label: 'Keluhan/temuan manajemen yang telah diverifikasi', target: 'Trigger referensi formulir revisi: ≥ 1 kali; wajib telaah konteks', status: 'pending', count: '', evidence: '', notes: '' },
]
const defaultProfessionalism = (): ManualAssessmentItem[] => [
  { id: 'meetings_annual', label: 'Jumlah pertemuan ilmiah/profesi yang dihadiri pada triwulan ini', target: 'Target tahunan ≥ 3 kali; jumlah per triwulan dijumlah otomatis pada Triwulan IV', status: 'pending', count: '', evidence: '', notes: '' },
  { id: 'quality_contribution', label: 'Pelaksanaan tugas pengembangan mutu/profesi pada periode ini', target: 'Target referensi formulir revisi: ≥ 1 kegiatan/periode', status: 'pending', count: '', evidence: '', notes: '' },
]
const defaultForm = (roomId: number, year: number, quarter: number, evaluatorName = ''): FormState => ({
  id: null, roomId, staffName: '', staffIdentifier: '', profession: '', year, quarter, status: 'draft',
  behavior: defaultBehavior(), professionalism: defaultProfessionalism(),
  evaluatorName, evaluatorRole: 'Komite PMKP / evaluator yang ditetapkan',
  assessmentNotes: '', developmentPlan: '',
})
const groupForTitle = (title: string) => {
  const text = norm(title)
  if (/perawat|keperawatan|nursing/.test(text)) return 'Perawat'
  if (/bidan|kebidanan|partograf|persalinan/.test(text)) return 'Bidan'
  if (/nutrisi|gizi|pagt|dietisien|dietitian/.test(text)) return 'Nutrisionis/Dietisien'
  if (/farmasi|formularium|obat|apoteker/.test(text)) return 'Farmasi/Apoteker'
  if (/radiologi|rontgen|radiografer/.test(text)) return 'Radiografer'
  if (/laboratorium|spesimen|tes kritis|atlm|analis/.test(text)) return 'ATLM/Analis'
  if (/fisioterapi|rehab medik|terapis/.test(text)) return 'Tenaga rehabilitasi medik'
  if (/dokter|dpjp|visite|operasi|clinical pathway|pathway|medis|stemi|stroke|dokumen medis/.test(text)) return 'Tenaga medis'
  return ''
}
const suggestedField = (profile: any, layout?: AuditLayout) => {
  const fields = (layout?.fields || []).filter((field) => /(dpjp|dokter|perawat|bidan|petugas|penanggung jawab|radiografer|analis|atlm|terapis|apoteker|nutrisionis|dietisien|pemeriksa|pelaksana)/i.test(field))
  const title = norm(`${profile?.title || ''} ${profile?.schema_json?.header_label || ''}`)
  const preferred = /perawat|keperawatan|validitas asesmen awal keperawatan/.test(title) ? ['Perawat Penerima', 'Perawat']
    : /bidan|kebidanan|partograf/.test(title) ? ['Bidan Penerima', 'Bidan']
      : /radiolog|rontgen/.test(title) ? ['Radiografer Penerima', 'Radiografer']
        : /laboratorium|spesimen|tes kritis|histopatologi/.test(title) ? ['Analis Penerima', 'ATLM']
          : /terapi|rehab medik|fisioterapi/.test(title) ? ['Nama Terapis', 'Terapis']
            : /dokter|dpjp|visite|operasi|stemi|stroke|clinical pathway|pathway/.test(title) ? ['DPJP', 'Dokter', 'Nama Dokter', 'Dokter Umum']
              : []
  return [...preferred, ...fields].find((field) => fields.includes(field)) || ''
}
const staffFieldOptions = (roomId: number) => {
  const layout = LAYOUTS.find((item) => Number(item.roomId) === Number(roomId))
  return Array.from(new Set((layout?.fields || []).filter((field) => /(dpjp|dokter|perawat|bidan|petugas|penanggung jawab|radiografer|analis|atlm|terapis|apoteker|nutrisionis|dietisien|pemeriksa|pelaksana)/i.test(field))))
}
const suggestedMeasurementGrain = (profiles: any[], roomId: number) => {
  const layout = LAYOUTS.find((item) => Number(item.roomId) === Number(roomId))
  if (layout?.measurementGrain) return layout.measurementGrain
  const matching = profiles.filter((profile) => Number(profile.room_id) === Number(roomId) && profile.status === 'published' && profile.is_active === true)
  const counts = new Map<string, number>()
  matching.forEach((profile) => {
    const grain = String(profile.measurement_grain || 'patient_episode')
    counts.set(grain, (counts.get(grain) || 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'patient_episode'
}
const GRAIN_LABELS: Record<string, string> = {
  patient_episode: 'Episode pasien',
  provider_day: 'Nakes per hari',
  daily_metric: 'Data harian (numerator/denominator)',
  event: 'Kejadian / event',
  activity: 'Aktivitas / kegiatan',
  aggregate: 'Agregat periode',
}
const statusOptions: Array<{ value: ManualAssessmentItem['status']; label: string }> = [
  { value: 'pending', label: 'Belum dinilai' },
  { value: 'good', label: 'Baik / memenuhi' },
  { value: 'needs_review', label: 'Perlu telaah / tindak lanjut' },
  { value: 'na', label: 'Tidak berlaku (dengan alasan)' },
  { value: 'insufficient_data', label: 'Data belum memadai' },
]

export default function OppeAuditWorkspace({
  initialRoomId,
  rooms,
  isSuperAdmin,
  canManage,
}: {
  initialRoomId: number | null
  rooms: Room[]
  isSuperAdmin: boolean
  canManage: boolean
}) {
  const initialRoom = initialRoomId ?? rooms[0]?.id ?? 0
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [quarter, setQuarter] = useState(() => Math.ceil((new Date().getMonth() + 1) / 3))
  const [roomFilter, setRoomFilter] = useState<number | null>(canManage ? null : initialRoom)
  const [profiles, setProfiles] = useState<any[]>([])
  const [rules, setRules] = useState<OppeRule[]>([])
  const [records, setRecords] = useState<OppeQualityRecord[]>([])
  const [responseRows, setResponseRows] = useState<OppeResponseRow[]>([])
  const [assessments, setAssessments] = useState<SavedAssessment[]>([])
  const [assessmentEvents, setAssessmentEvents] = useState<Record<string, any>[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [screen, setScreen] = useState<'assessment' | 'rules' | 'history'>('assessment')
  const [form, setForm] = useState<FormState>(() => defaultForm(initialRoom, new Date().getFullYear(), Math.ceil((new Date().getMonth() + 1) / 3)))
  const [savedClinicalSnapshot, setSavedClinicalSnapshot] = useState<ClinicalIndicatorResult[] | null>(null)
  const [savedScoreSnapshot, setSavedScoreSnapshot] = useState<ReturnType<typeof buildOppeScore> | null>(null)
  const [ruleProfile, setRuleProfile] = useState<any | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null)
  const [gapDraft, setGapDraft] = useState<GapDraft | null>(null)
  const [search, setSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')

  const roomMap = useMemo(() => new Map(rooms.map((room) => [Number(room.id), room.name])), [rooms])
  const layoutForRoom = (roomId: number) => LAYOUTS.find((layout) => Number(layout.roomId) === Number(roomId))
  const selectedRoomName = roomMap.get(Number(form.roomId)) || 'Unit belum dipetakan'
  const currentReadOnly = form.status === 'submitted' || form.status === 'validated'

  const load = useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    setError('')
    const fetchAll = async (initialQuery: any, tableLabel: string) => {
      const rows: any[] = []
      let from = 0
      while (from < 20000) {
        const { data, error: queryError } = await initialQuery.range(from, from + 499)
        if (queryError) throw new Error(`${tableLabel}: ${queryError.message}`)
        rows.push(...(data || []))
        if (!data || data.length < 500) break
        from += 500
      }
      return rows
    }
    try {
      let pQuery = q().from('indicator_profiles').select('*').eq('profile_year', year).order('unit_name').order('code')
      if (roomFilter != null) pQuery = pQuery.eq('room_id', roomFilter)
      const nextProfiles = await fetchAll(pQuery, 'Master indikator')

      let rQuery = q().from('oppe_indicator_rules').select('*').eq('profile_year', year).order('updated_at', { ascending: false })
      if (roomFilter != null) rQuery = rQuery.eq('room_id', roomFilter)
      const nextRules = await fetchAll(rQuery, 'Pemetaan OPPE')

      // Clinical scoring only needs the currently selected staff assessment unit; keep the full hospital scope for the master/rule lists.
      let qQuery = q().from('quality_records').select('*').eq('profile_year', year).eq('room_id', form.roomId).neq('status', 'archived').order('created_at', { ascending: false })
      const nextRecords = await fetchAll(qQuery, 'Logbook mutu')

      const ids = nextRecords.map((record: any) => String(record.id)).filter(Boolean)
      const nextResponses: OppeResponseRow[] = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100)
        let from = 0
        while (from < 20000) {
          const { data, error: responseError } = await q().from('quality_record_responses')
            .select('record_id,indicator_id,raw_value,response_label,response_code')
            .in('record_id', batch)
            .range(from, from + 499)
          if (responseError) throw new Error(`Respons indikator: ${responseError.message}`)
          nextResponses.push(...((data || []) as OppeResponseRow[]))
          if (!data || data.length < 500) break
          from += 500
        }
      }

      let aQuery = q().from('oppe_assessments').select('*').eq('period_year', year).order('updated_at', { ascending: false })
      if (roomFilter != null) aQuery = aQuery.eq('room_id', roomFilter)
      const nextAssessments = await fetchAll(aQuery, 'Riwayat OPPE')

      setProfiles(nextProfiles)
      setRules(nextRules as OppeRule[])
      setRecords(nextRecords as OppeQualityRecord[])
      setResponseRows(nextResponses)
      setAssessments(nextAssessments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data OPPE gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [canManage, year, roomFilter, form.roomId])

  useEffect(() => { void load() }, [load])

  const loadAssessmentEvents = useCallback(async (assessmentId: string) => {
    setEventsLoading(true)
    try {
      const { data, error } = await q().from('oppe_assessment_events')
        .select('id,event_type,from_status,to_status,actor_id,source_records_count,score_snapshot_json,created_at')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setAssessmentEvents((data || []) as Record<string, any>[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riwayat proses OPPE gagal dimuat.')
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!form.id) {
      setAssessmentEvents([])
      return
    }
    void loadAssessmentEvents(form.id)
  }, [form.id, loadAssessmentEvents])

  useEffect(() => {
    if (!canManage) return
    let active = true
    const refresh = () => { if (active) void load() }
    const channel = sb.channel(`oppe-live-${year}-${roomFilter ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'aureka_quality', table: 'quality_records' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'aureka_quality', table: 'quality_record_responses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'aureka_quality', table: 'oppe_assessments' }, refresh)
      .subscribe()
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      void sb.removeChannel(channel)
    }
  }, [canManage, year, roomFilter, load])

  const activeProfiles = useMemo(() => profiles.filter((profile) =>
    profile.status === 'published' && profile.is_active === true
  ), [profiles])

  const activeRulesByProfile = useMemo(() => {
    const map = new Map<string, OppeRule[]>()
    rules.filter((rule) => rule.status === 'active' && rule.is_oppe_eligible).forEach((rule) => {
      const key = String(rule.profile_id)
      map.set(key, [...(map.get(key) || []), rule])
    })
    return map
  }, [rules])
  const activeRuleCount = useMemo(
    () => rules.filter((rule) => rule.status === 'active' && rule.is_oppe_eligible).length,
    [rules],
  )

  const annualMeetingMetrics = useMemo(() => {
    const currentItem = form.professionalism.find((item) => item.id === 'meetings_annual')
    const currentCount = Math.max(0, Number(currentItem?.count || 0) || 0)
    const staffKey = keyName(form.staffIdentifier.trim() || form.staffName)
    const previous = assessments.filter((assessment) =>
      String(assessment.staff_key || '') === staffKey
      && Number(assessment.room_id) === Number(form.roomId)
      && Number(assessment.period_year) === Number(form.year)
      && Number(assessment.period_quarter) < Number(form.quarter)
      && String(assessment.status) === 'validated'
    )
    const previousCount = previous.reduce((sum, assessment) => {
      const items = Array.isArray(assessment.professionalism_json) ? assessment.professionalism_json : []
      const item = items.find((candidate: any) => candidate?.id === 'meetings_annual')
      return sum + Math.max(0, Number(item?.count || 0) || 0)
    }, 0)
    const expectedPriorQuarters = Array.from({ length: Math.max(0, form.quarter - 1) }, (_, index) => index + 1)
    const validatedPriorQuarters = new Set(previous.map((assessment) => Number(assessment.period_quarter)))
    const priorDataComplete = expectedPriorQuarters.every((period) => validatedPriorQuarters.has(period))
    const totalCount = previousCount + currentCount
    let status: ManualItemStatus = 'pending'
    if (form.quarter === 4) {
      status = totalCount >= 3 ? 'good' : priorDataComplete ? 'needs_review' : 'insufficient_data'
    }
    return { currentCount, previousCount, totalCount, priorDataComplete, missingPriorQuarters: expectedPriorQuarters.filter((period) => !validatedPriorQuarters.has(period)), status }
  }, [assessments, form.professionalism, form.staffIdentifier, form.staffName, form.roomId, form.year, form.quarter])

  const professionalismForScore = useMemo(() => form.professionalism.map((item) =>
    item.id === 'meetings_annual' && form.quarter === 4
      ? { ...item, status: annualMeetingMetrics.status }
      : item
  ), [form.professionalism, form.quarter, annualMeetingMetrics.status])

  const staffSuggestions = useMemo(() => {
    const values = new Map<string, { name: string; fields: Set<string> }>()
    records.filter((record) => record.status === 'validated').forEach((record) => {
      const fields = recordFields(record)
      Object.entries(fields).forEach(([fieldName, value]) => {
        if (!/(dpjp|dokter|perawat|bidan|petugas|penanggung jawab|radiografer|analis|atlm|terapis|apoteker|nutrisionis|dietisien|pelaksana)/i.test(fieldName)) return
        const name = String(value ?? '').trim()
        if (!name || name.length < 3 || name.length > 120 || /^(tidak ada|belum|n\/a|na|-|lainnya)$/i.test(name)) return
        const key = norm(name)
        if (!values.has(key)) values.set(key, { name, fields: new Set<string>() })
        values.get(key)?.fields.add(fieldName)
      })
    })
    return Array.from(values.values()).map((value) => ({ name: value.name, fields: Array.from(value.fields) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [records])

  const clinicalResults = useMemo<ClinicalIndicatorResult[]>(() => {
    if (!form.staffName.trim() || !form.profession.trim()) return []
    return activeProfiles
      .filter((profile) => Number(profile.room_id) === Number(form.roomId))
      .flatMap((profile) => {
        const mappings = (activeRulesByProfile.get(String(profile.id)) || [])
          .filter((rule) => professionMatches(rule.profession_label, form.profession))
        if (!mappings.length) return []
        const exact = mappings.filter((rule) => norm(rule.profession_label) === norm(form.profession))
        const specific = mappings.filter((rule) => !['tenaga medis', 'tenaga kesehatan', 'tenaga kesehatan lainnya'].includes(norm(rule.profession_label)))
        // Prefer exact-profession rules; otherwise choose the most specific matching group rule.
        // This prevents a broad group rule and a narrower rule from counting the same indicator twice.
        const chosen = (exact.length ? exact : specific.length ? specific : mappings)
          .sort((a, b) => b.profession_label.length - a.profession_label.length)
          .slice(0, 1)
        return chosen.map((rule) => evaluateClinicalIndicator({
          profile: profile as OppeProfile,
          rule,
          records,
          responseRows,
          staffName: form.staffName,
          profession: form.profession,
          year: form.year,
          quarter: form.quarter,
        }))
      })
      .sort((a, b) => (a.criticality === 'critical' ? -1 : b.criticality === 'critical' ? 1 : a.title.localeCompare(b.title, 'id')))
  }, [activeProfiles, activeRulesByProfile, form.staffName, form.profession, form.roomId, form.year, form.quarter, records, responseRows])

  const score = useMemo(() => {
    if (currentReadOnly && savedScoreSnapshot) return savedScoreSnapshot
    return buildOppeScore({
      behavior: form.behavior,
      professionalism: professionalismForScore,
      clinical: clinicalResults,
      quarter: form.quarter,
    })
  }, [currentReadOnly, savedScoreSnapshot, form.behavior, professionalismForScore, clinicalResults, form.quarter])

  const clinicalResultsForDisplay = currentReadOnly && savedClinicalSnapshot
    ? savedClinicalSnapshot
    : clinicalResults

  const sourceRecordCount = useMemo(() => records.filter((record) =>
    record.status === 'validated'
    && Number(record.room_id) === Number(form.roomId)
    && Number(record.profile_year) === Number(form.year)
    && isInPeriod(record, form.year, form.quarter)
  ).length, [records, form.roomId, form.year, form.quarter])

  const activeClinicalRules = rules.filter((rule) =>
    rule.status === 'active' && rule.is_oppe_eligible && (roomFilter == null || Number(rule.room_id) === Number(roomFilter))
  ).length

  const hasCurrentFormContent = () => !!(
    form.id
    || form.staffName.trim()
    || form.staffIdentifier.trim()
    || form.profession.trim()
    || form.behavior.some((item) => item.status !== 'pending' || item.count.trim() || item.evidence.trim() || item.notes.trim())
    || form.professionalism.some((item) => item.status !== 'pending' || item.count.trim() || item.evidence.trim() || item.notes.trim())
    || form.assessmentNotes.trim()
    || form.developmentPlan.trim()
  )

  const confirmLeavingForm = () => {
    if (!hasCurrentFormContent()) return true
    return typeof window === 'undefined' || window.confirm('Formulir OPPE yang sedang terbuka akan ditinggalkan. Simpan draf terlebih dahulu jika ingin mempertahankan perubahan. Lanjutkan?')
  }

  const resetNew = () => {
    if (!confirmLeavingForm()) return
    const nextRoom = roomFilter ?? initialRoom
    setForm(defaultForm(nextRoom, year, quarter, form.evaluatorName))
    setSavedClinicalSnapshot(null)
    setSavedScoreSnapshot(null)
    setScreen('assessment')
    setNotice('')
    setError('')
  }

  const changeScope = (nextYear: number, nextQuarter: number, nextRoom: number | null) => {
    if (!confirmLeavingForm()) return
    const nextFormRoom = nextRoom ?? (form.roomId || initialRoom)
    setYear(nextYear)
    setQuarter(nextQuarter)
    setRoomFilter(nextRoom)
    setForm(defaultForm(nextFormRoom, nextYear, nextQuarter, form.evaluatorName))
    setSavedClinicalSnapshot(null)
    setSavedScoreSnapshot(null)
    setScreen('assessment')
    setError('')
    setNotice('Periode/unit berubah. Formulir baru dibuka agar identitas, data klinis, dan skor tidak terbawa ke periode atau unit lain.')
  }

  const openSaved = (assessment: SavedAssessment) => {
    setSavedClinicalSnapshot(Array.isArray(assessment.clinical_snapshot_json) ? assessment.clinical_snapshot_json as ClinicalIndicatorResult[] : null)
    const savedScore = asObject(assessment.score_json)
    setSavedScoreSnapshot(Object.keys(savedScore).length ? savedScore as ReturnType<typeof buildOppeScore> : null)
    setForm({
      id: assessment.id,
      roomId: Number(assessment.room_id),
      staffName: String(assessment.staff_name || ''),
      staffIdentifier: String(assessment.staff_identifier || ''),
      profession: String(assessment.profession || ''),
      year: Number(assessment.period_year),
      quarter: Number(assessment.period_quarter),
      status: String(assessment.status || 'draft'),
      behavior: Array.isArray(assessment.behavior_json) ? assessment.behavior_json : defaultBehavior(),
      professionalism: Array.isArray(assessment.professionalism_json) ? assessment.professionalism_json : defaultProfessionalism(),
      evaluatorName: String(assessment.evaluator_name || ''),
      evaluatorRole: String(assessment.evaluator_role || ''),
      assessmentNotes: String(assessment.assessment_notes || ''),
      developmentPlan: String(assessment.development_plan || ''),
    })
    setYear(Number(assessment.period_year))
    setQuarter(Number(assessment.period_quarter))
    setRoomFilter(Number(assessment.room_id))
    setScreen('assessment')
    setError('')
    setNotice('')
  }

  const patchManualItem = (kind: 'behavior' | 'professionalism', id: string, patch: Partial<ManualAssessmentItem>) => {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].map((item) => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  const assessmentValidationError = (): string => {
    if (!form.staffName.trim()) return 'Nama tenaga kesehatan wajib diisi.'
    if (!form.profession.trim()) return 'Profesi/SMF wajib diisi.'
    if (!form.roomId) return 'Unit kerja wajib dipilih.'
    if (!form.evaluatorName.trim()) return 'Nama evaluator wajib diisi.'
    const items = [
      ...form.behavior,
      ...professionalismForScore.filter((item) => !(item.id === 'meetings_annual' && form.quarter < 4)),
    ]
    const notRated = items.find((item) => item.status === 'pending')
    if (notRated) return `Butir “${notRated.label}” belum dinilai.`
    for (const item of items) {
      if (item.status === 'needs_review' && item.notes.trim().length < 10) {
        return `Tambahkan alasan telaah minimal 10 karakter untuk “${item.label}”.`
      }
      if (item.status === 'na' && item.notes.trim().length < 10) {
        return `Alasan Tidak Berlaku minimal 10 karakter untuk “${item.label}”.`
      }
      if (item.status === 'insufficient_data' && item.notes.trim().length < 10) {
        return `Jelaskan kekurangan data minimal 10 karakter untuk “${item.label}”.`
      }
      if (item.status !== 'pending' && item.evidence.trim().length < 3) {
        return `Sumber bukti wajib diisi untuk “${item.label}”.`
      }
    }
    if ((score.clinical.score === null || !score.clinical.complete) && form.assessmentNotes.trim().length < 10) {
      return 'Komponen kinerja klinis belum lengkap. Tambahkan catatan minimal 10 karakter tentang gap data/pemetaan/atribusi sebelum mengirim penilaian parsial untuk ditelaah.'
    }
    return ''
  }

  const saveAssessment = async (nextStatus: 'draft' | 'submitted' | 'validated' | 'reopened') => {
    if (busy) return
    if (!canManage) {
      setError('Akses Audit OPPE hanya tersedia bagi Superadmin/Komite PMKP yang berwenang.')
      return
    }
    if (!form.staffName.trim()) { setError('Nama tenaga kesehatan wajib diisi.'); return }
    if (!form.profession.trim()) { setError('Profesi/SMF wajib diisi.'); return }
    if (!form.roomId) { setError('Unit kerja wajib dipilih.'); return }
    if (!form.evaluatorName.trim()) { setError('Nama evaluator wajib diisi.'); return }
    if (nextStatus === 'submitted' || nextStatus === 'validated') {
      const validation = assessmentValidationError()
      if (validation) {
        setError(validation)
        return
      }
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
      if (nextStatus === 'validated' && !['submitted', 'reopened'].includes(form.status)) {
        throw new Error('Hanya OPPE yang telah disubmit atau dikembalikan yang dapat divalidasi.')
      }
      if (nextStatus === 'validated') {
        if (!form.id) throw new Error('ID penilaian belum tersedia.')
        const { data: ownership, error: ownershipError } = await q().from('oppe_assessments')
          .select('created_by')
          .eq('id', form.id)
          .single()
        if (ownershipError) throw ownershipError
        if (ownership?.created_by === authData.user.id) {
          throw new Error('Validasi harus dilakukan oleh evaluator yang berbeda dari pembuat OPPE untuk menjaga independensi penilaian.')
        }
      }
      const clinicalSnapshot = nextStatus === 'validated' && savedClinicalSnapshot
        ? savedClinicalSnapshot
        : clinicalResults
      const scoreSnapshot = nextStatus === 'validated' && savedScoreSnapshot
        ? savedScoreSnapshot
        : buildOppeScore({
            behavior: form.behavior,
            professionalism: professionalismForScore,
            clinical: clinicalSnapshot,
            quarter: form.quarter,
          })
      const key = keyName(form.staffIdentifier.trim() || form.staffName)
      if (!key) throw new Error('Identitas tenaga kesehatan tidak valid.')
      const payload: Record<string, any> = {
        room_id: form.roomId,
        staff_key: key,
        staff_identifier: form.staffIdentifier.trim() || null,
        staff_name: form.staffName.trim(),
        profession: form.profession.trim(),
        period_year: form.year,
        period_quarter: form.quarter,
        status: nextStatus,
        behavior_json: form.behavior,
        professionalism_json: professionalismForScore,
        clinical_snapshot_json: clinicalSnapshot,
        score_json: scoreSnapshot,
        source_records_count: sourceRecordCount,
        evaluator_name: form.evaluatorName.trim(),
        evaluator_role: form.evaluatorRole.trim(),
        assessment_notes: form.assessmentNotes.trim(),
        development_plan: form.developmentPlan.trim(),
        updated_by: authData.user.id,
        validated_by: nextStatus === 'validated' ? authData.user.id : null,
        validated_at: nextStatus === 'validated' ? new Date().toISOString() : null,
        ...(nextStatus === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
      }
      let savedId = form.id
      if (savedId) {
        const { error: updateError } = await q().from('oppe_assessments').update(payload).eq('id', savedId)
        if (updateError) throw updateError
      } else {
        const { data: existing, error: existingError } = await q().from('oppe_assessments')
          .select('id,status')
          .eq('room_id', form.roomId)
          .eq('staff_key', key)
          .eq('period_year', form.year)
          .eq('period_quarter', form.quarter)
          .neq('status', 'archived')
          .limit(1)
        if (existingError) throw existingError
        if (existing?.length) {
          const item = existing[0]
          if (['submitted', 'validated'].includes(String(item.status))) throw new Error('OPPE untuk nakes dan periode ini sudah disubmit/tervalidasi. Buka riwayat dan lakukan alur pengembalian bila koreksi diperlukan.')
          savedId = String(item.id)
          const { error: updateError } = await q().from('oppe_assessments').update(payload).eq('id', savedId)
          if (updateError) throw updateError
        } else {
          const { data: inserted, error: insertError } = await q().from('oppe_assessments')
            .insert({ ...payload, created_by: authData.user.id })
            .select('id').single()
          if (insertError) throw insertError
          savedId = String(inserted.id)
        }
      }
      setForm((current) => ({ ...current, id: savedId, status: nextStatus }))
      setSavedClinicalSnapshot(clinicalSnapshot)
      setSavedScoreSnapshot(scoreSnapshot)
      setNotice(nextStatus === 'draft' ? 'Draf OPPE berhasil disimpan.' :
        nextStatus === 'submitted' ? 'OPPE berhasil disubmit untuk validasi.' :
          nextStatus === 'validated' ? 'OPPE berhasil divalidasi dan snapshot penilaiannya tersimpan.' : 'OPPE dikembalikan untuk perbaikan.')
      await load()
      if (savedId) await loadAssessmentEvents(savedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OPPE gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  const reopenAssessment = async () => {
    if (!form.id) return
    if (!form.assessmentNotes.trim()) {
      setError('Catatan pengembalian/revisi wajib ditulis sebelum membuka kembali OPPE.')
      return
    }
    await saveAssessment('reopened')
  }

  const startRuleEdit = (profile: any, existing: OppeRule | null) => {
    const layout = layoutForRoom(Number(profile.room_id))
    const hasExistingMapping = rules.some((rule) => rule.profile_id === String(profile.id))
    setRuleProfile(profile)
    setRuleDraft({
      ruleId: existing?.id ? String(existing.id) : null,
      profileId: String(profile.id),
      profileYear: Number(profile.profile_year),
      roomId: Number(profile.room_id),
      eligible: existing?.is_oppe_eligible ?? false,
      professionLabel: existing?.profession_label || (hasExistingMapping ? '' : String(profile.schema_json?.oppe_profession_label || groupForTitle(profile.title) || '')),
      responsibilityField: existing?.responsibility_field || (hasExistingMapping ? '' : String(profile.schema_json?.oppe_responsibility_field || suggestedField(profile, layout))),
      measurementMethod: existing?.measurement_method || 'manual_review',
      minimumObservations: Number(existing?.minimum_observations || 5),
      criticality: existing?.criticality || 'standard',
      notes: existing?.notes || '',
    })
  }

  const saveRule = async () => {
    if (!ruleProfile || !ruleDraft || busy) return
    if (ruleDraft.eligible) {
      if (!ruleDraft.professionLabel.trim()) {
        setError('Profesi yang dinilai wajib ditentukan.')
        return
      }
      if (!ruleDraft.responsibilityField.trim()) {
        setError('Field penanggung jawab pada logbook wajib ditentukan.')
        return
      }
      if (ruleDraft.notes.trim().length < 10) {
        setError('Catatan dasar pemetaan minimal 10 karakter agar keputusan atribusi dapat diaudit.')
        return
      }
      if (ruleDraft.measurementMethod !== 'manual_review' && /target\s+(dikaji|akan\s+dikaji|belum\s+ditetapkan)|target\s+absolut/i.test(String(ruleProfile.target_text || ''))) {
        setError('Target master masih berupa placeholder atau belum disepakati. Verifikasi target numerik/arah target di Metadata sebelum mengaktifkan skor otomatis.')
        return
      }
      if (ruleDraft.measurementMethod !== 'manual_review' && !String(ruleProfile.target_text || '').trim() && ruleProfile.target_value == null) {
        setError('Target belum tersedia. Lengkapi/verifikasi master indikator sebelum mengaktifkan skor otomatis.')
        return
      }
      if (ruleDraft.measurementMethod === 'numerator_denominator' && (!String(ruleProfile.numerator_definition || '').trim() || !String(ruleProfile.denominator_definition || '').trim())) {
        setError('Definisi numerator dan denominator harus lengkap sebelum indikator diaktifkan untuk skor otomatis.')
        return
      }
      if (ruleDraft.measurementMethod === 'numerator_denominator') {
        const grain = String(ruleProfile.measurement_grain || '')
        const fields = Array.isArray(ruleProfile.schema_json?.fields) ? ruleProfile.schema_json.fields.map((field: unknown) => norm(field)) : []
        const supportsRatioInput = ['daily_metric', 'provider_day'].includes(grain) || (fields.includes('numerator') && fields.includes('denominator'))
        if (!supportsRatioInput) {
          setError('Grain/form ini belum menyediakan input numerator dan denominator per catatan. Gunakan Pilihan Respons berkode untuk kasus per pasien (jika opsi master valid), atau Telaah Manual; jangan mengaktifkan metode yang tidak didukung oleh formulir sumber.')
          return
        }
      }
      if (ruleDraft.measurementMethod === 'option_response') {
        const opts = Array.isArray(ruleProfile.options_json) ? ruleProfile.options_json : []
        const validOptions = opts.filter((option: any) => typeof option?.numerator === 'boolean' && typeof option?.denominator === 'boolean')
        const hasPass = validOptions.some((option: any) => option.denominator === true && option.numerator === true)
        const hasFail = validOptions.some((option: any) => option.denominator === true && option.numerator === false)
        if (!hasPass || !hasFail) {
          setError('Opsi respons harus mempunyai pemetaan eksplisit untuk kondisi memenuhi target (N=true, D=true) dan tidak memenuhi target (N=false, D=true). Metadata yang belum konsisten tidak boleh diaktifkan untuk skor otomatis.')
          return
        }
      }
    }
    if (ruleDraft.eligible && (ruleProfile.status !== 'published' || ruleProfile.is_active !== true)) {
      setError('Indikator master masih draf/nonaktif. Terbitkan dan aktifkan profil dari Metadata terlebih dahulu.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan.')
      const existing = ruleDraft.ruleId ? rules.find((rule) => String(rule.id) === ruleDraft.ruleId) : null
      const duplicateProfession = rules.find((rule) =>
        rule.profile_id === ruleDraft.profileId
        && norm(rule.profession_label) === norm(ruleDraft.professionLabel)
        && String(rule.id || '') !== String(ruleDraft.ruleId || '')
      )
      if (duplicateProfession) {
        throw new Error('Pemetaan untuk indikator dan profesi ini sudah ada. Buka aturan yang ada dan edit field penanggung jawab atau metodenya.')
      }
      const payload: Record<string, any> = {
        profile_id: ruleDraft.profileId,
        room_id: ruleDraft.roomId,
        profile_year: ruleDraft.profileYear,
        is_oppe_eligible: ruleDraft.eligible,
        profession_label: ruleDraft.professionLabel.trim(),
        responsibility_field: ruleDraft.responsibilityField.trim(),
        measurement_method: ruleDraft.measurementMethod,
        minimum_observations: Math.max(1, Number(ruleDraft.minimumObservations) || 1),
        criticality: ruleDraft.criticality,
        status: ruleDraft.eligible ? 'active' : 'draft',
        notes: ruleDraft.notes.trim(),
        updated_by: authData.user.id,
      }
      if (existing?.id) {
        const { error: updateError } = await q().from('oppe_indicator_rules').update(payload).eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await q().from('oppe_indicator_rules')
          .insert({ ...payload, created_by: authData.user.id })
        if (insertError) throw insertError
      }
      setRuleDraft(null)
      setRuleProfile(null)
      setNotice('Pemetaan indikator OPPE berhasil disimpan. Skor hanya dihitung dari logbook tervalidasi yang memiliki atribusi sesuai aturan ini.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pemetaan OPPE gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  const createGapProfile = async () => {
    if (!gapDraft || busy) return
    if (!isSuperAdmin) {
      setError('Hanya Superadmin yang dapat membuat draf indikator baru pada master.')
      return
    }
    if (!gapDraft.title.trim() || !gapDraft.professionLabel.trim() || !gapDraft.roomId) {
      setError('Nama indikator, profesi dan unit wajib diisi.')
      return
    }
    if (!gapDraft.targetText.trim() || !gapDraft.numeratorDefinition.trim() || !gapDraft.denominatorDefinition.trim()) {
      setError('Target, definisi numerator dan denominator wajib lengkap untuk membuat draf indikator.')
      return
    }
    if (gapDraft.measurementGrain !== suggestedMeasurementGrain(profiles, gapDraft.roomId)) {
      setError('Grain draf harus sesuai dengan metode pencatatan aktif di unit ini. Siapkan layout logbook terpisah terlebih dahulu bila membutuhkan grain berbeda.')
      return
    }
    if (!gapDraft.responsibilityField.trim()) {
      setError('Pilih field penanggung jawab yang memang tersedia pada logbook unit tersebut.')
      return
    }
    if (gapDraft.notes.trim().length < 10) {
      setError('Catatan sumber dan alasan klinis minimal 10 karakter agar draf memiliki dasar yang dapat ditelaah.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan.')
      const unitName = roomMap.get(Number(gapDraft.roomId)) || 'Unit belum dipetakan'
      const code = `OPPE-${gapDraft.roomId}-${year}-${Date.now()}`
      const profile = {
        profile_year: year,
        code,
        room_id: gapDraft.roomId,
        unit_name: unitName,
        title: gapDraft.title.trim(),
        indicator_type: '(IMP-Unit) Audit OPPE',
        category: 'Proses',
        unit_of_measure: gapDraft.unitOfMeasure.trim() || 'Persentase (%)',
        target_text: gapDraft.targetText.trim(),
        target_operator: gapDraft.targetOperator,
        target_value: gapDraft.targetValue === '' ? null : Number(gapDraft.targetValue),
        numerator_definition: gapDraft.numeratorDefinition.trim(),
        denominator_definition: gapDraft.denominatorDefinition.trim(),
        measurement_grain: gapDraft.measurementGrain,
        schema_json: {
          source: 'AUREKA OPPE gap proposal',
          header_label: gapDraft.title.trim(),
          header_source: 'OPPE · draf indikator spesifik profesi',
          collection_mode: gapDraft.measurementGrain,
          oppe_dynamic: true,
          oppe_profession_label: gapDraft.professionLabel.trim(),
          oppe_responsibility_field: gapDraft.responsibilityField.trim(),
          oppe_gap_status: 'draft',
          oppe_gap_notes: gapDraft.notes.trim(),
          fields: gapDraft.measurementGrain === 'patient_episode'
            ? ['record_date', 'patient_name', 'medical_record_no', 'diagnosis', gapDraft.responsibilityField.trim(), 'status']
            : ['record_date', 'activity', gapDraft.responsibilityField.trim(), 'numerator', 'denominator', 'notes'],
        },
        options_json: [
          { label: 'Sesuai / memenuhi definisi indikator', code: 1, numerator: true, denominator: true },
          { label: 'Tidak sesuai / tidak memenuhi definisi indikator', code: 3, numerator: false, denominator: true },
          { label: 'Tidak berlaku / tidak memenuhi kriteria inklusi', code: null, numerator: false, denominator: false, review_required: true },
        ],
        version: 1,
        status: 'draft',
        is_active: false,
        created_by: authData.user.id,
        updated_by: authData.user.id,
      }
      const { data: created, error: insertError } = await q().from('indicator_profiles').insert(profile).select('id').single()
      if (insertError) throw insertError
      setGapDraft(null)
      setNotice('Draf indikator OPPE masuk ke master AUREKA dengan status draft/nonaktif. Setelah definisi ditelaah dan profil diterbitkan melalui Metadata, pemetaan dapat diaktifkan di tab Pemetaan indikator.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draf indikator baru gagal dibuat.')
    } finally {
      setBusy(false)
    }
  }

  const filteredProfiles = useMemo(() => {
    const term = norm(search)
    return profiles.filter((profile) => {
      if (roomFilter != null && Number(profile.room_id) !== Number(roomFilter)) return false
      return !term || [profile.code, profile.title, profile.unit_name, profile.indicator_type, profile.schema_json?.oppe_profession_label]
        .some((value) => norm(value).includes(term))
    })
  }, [profiles, search, roomFilter])

  const filteredAssessments = useMemo(() => {
    const term = norm(historySearch)
    return assessments.filter((assessment) => {
      if (Number(assessment.period_quarter) !== quarter) return false
      if (roomFilter != null && Number(assessment.room_id) !== Number(roomFilter)) return false
      return !term || [assessment.staff_name, assessment.profession, assessment.staff_identifier, assessment.evaluator_name]
        .some((value) => norm(value).includes(term))
    })
  }, [assessments, historySearch, roomFilter, quarter])

  const handlePrint = () => {
    if (!form.staffName.trim()) {
      setError('Isi nama tenaga kesehatan sebelum membuat output OPPE.')
      return
    }
    if (typeof window !== 'undefined') window.print()
  }

  const selectedRuleCount = activeRuleCount
  const currentReadOnly = form.status === 'submitted' || form.status === 'validated'
  const scoreStatus = score.overall === null ? 'Belum dapat dihitung' : score.needsReview ? 'Memerlukan telaah khusus' : score.complete ? 'Siap ditinjau' : 'Nilai sementara'

  if (!canManage) {
    return <section className="oppeRoot"><style>{CSS}</style><div className="oppeGlass oppeDenied"><div className="oppeEyebrow">AUREKA · AUDIT OPPE</div><h3>Audit OPPE terbatas</h3><p>Kontainer ini memuat evaluasi kinerja profesional individu. Akses saat ini dibatasi untuk Superadmin/Komite PMKP yang diberi wewenang. PIC tetap mengisi logbook mutu pada kontainer Audit Indikator Mutu.</p></div></section>
  }

  return (
    <section className="oppeRoot">
      <style>{CSS}</style>
      <header className="oppeGlass oppeHeader">
        <div>
          <div className="oppeEyebrow">AUREKA · ONGOING PROFESSIONAL PRACTICE EVALUATION</div>
          <h3>Audit OPPE</h3>
          <p>Penilaian profesional berbasis data logbook terverifikasi, bukti perilaku, dan pengembangan profesi. FPPE tidak termasuk pada versi ini.</p>
          <div className="oppeHeaderNotes"><span>Data klinis: hanya logbook tervalidasi</span><span>Pembaruan realtime + fallback 60 detik</span><span>Indikator otomatis: wajib memiliki aturan atribusi aktif</span><span>Skor bukan keputusan otomatis kewenangan klinis</span></div>
        </div>
        <div className="oppeHeaderActions"><button type="button" className="oppeBtn" disabled={loading} onClick={() => void load()}>{loading ? "Memuat…" : "↻ Perbarui data"}</button><LiquidGlassButton onClick={resetNew}>＋ Penilaian baru</LiquidGlassButton><button type="button" className="oppeBtn" onClick={handlePrint}>Cetak / Simpan PDF</button></div>
      </header>

      {error && <div className="oppeNotice oppeError" role="alert">{error}</div>}
      {notice && <div className="oppeNotice oppeSuccess" role="status">{notice}</div>}

      <section className="oppeGlass oppeFilters">
        <label className="oppeField"><span>Tahun</span><select value={year} onChange={(e) => changeScope(Number(e.target.value), quarter, roomFilter)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="oppeField"><span>Periode penilaian</span><select value={quarter} onChange={(e) => changeScope(year, Number(e.target.value), roomFilter)}>{quarters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="oppeField"><span>Unit kerja</span><select value={roomFilter ?? ''} onChange={(e) => changeScope(year, quarter, e.target.value === '' ? null : Number(e.target.value))}><option value="">Semua unit</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="oppeFilterMeta">{loading ? 'Memuat data…' : `${records.filter((record) => record.status === 'validated').length} logbook tervalidasi pada tahun ${year} · ${selectedRuleCount} aturan OPPE aktif`}</div>
      </section>

      <nav className="oppeTabs" aria-label="Kontainer Audit OPPE">
        <button type="button" className={screen === 'assessment' ? 'active' : ''} onClick={() => setScreen('assessment')}>Form &amp; output OPPE</button>
        <button type="button" className={screen === 'rules' ? 'active' : ''} onClick={() => setScreen('rules')}>Pemetaan indikator <span>{selectedRuleCount}</span></button>
        <button type="button" className={screen === 'history' ? 'active' : ''} onClick={() => setScreen('history')}>Riwayat penilaian <span>{assessments.length}</span></button>
      </nav>

      {screen === 'assessment' && (
        <div className="oppeWorkGrid">
          <main className="oppeMain">
            <section className="oppeGlass oppeSection">
              <div className="oppeSectionHead"><div><div className="oppeEyebrow">IDENTITAS PENILAIAN</div><h4>Profil tenaga kesehatan</h4><p>Nama dapat dipilih dari catatan tervalidasi atau diketik sementara. Identitas resmi akan dipadankan setelah master tenaga kerja tersedia.</p></div><span className={`oppeStatus ${statusTone[form.status] || 'oppeNeutral'}`}>{statusLabel[form.status] || statusLabel.draft}</span></div>
              <div className="oppeFormGrid">
                <label className="oppeField"><span>Nama staf yang dinilai *</span><input list="oppe-staff-suggestions" value={form.staffName} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, staffName: e.target.value }))} placeholder="Pilih/tulis nama sesuai bukti logbook" /><datalist id="oppe-staff-suggestions">{staffSuggestions.map((item) => <option key={item.name} value={item.name}>{item.fields.join(', ')}</option>)}</datalist></label>
                <label className="oppeField"><span>Identitas pegawai (sementara)</span><input value={form.staffIdentifier} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, staffIdentifier: e.target.value }))} placeholder="Diintegrasikan dengan master pegawai nanti" /></label>
                <label className="oppeField"><span>Profesi / SMF *</span><input value={form.profession} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, profession: e.target.value }))} placeholder="Contoh: Dokter Spesialis Anak" /></label>
                <label className="oppeField"><span>Unit penilaian *</span><select value={form.roomId} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, roomId: Number(e.target.value) }))}>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="oppeField"><span>Evaluator *</span><input value={form.evaluatorName} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, evaluatorName: e.target.value }))} placeholder="Nama penilai yang ditetapkan" /></label>
                <label className="oppeField"><span>Jabatan evaluator</span><input value={form.evaluatorRole} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, evaluatorRole: e.target.value }))} /></label>
              </div>
              <div className="oppeInlineNote"><strong>Periode:</strong> {quarters.find((item) => item.value === form.quarter)?.label} {form.year} · <strong>Unit:</strong> {selectedRoomName}. Penilaian final sekurang-kurangnya ditinjau secara tahunan; indikator dengan target tahunan ditampilkan sebagai progres kumulatif pada Triwulan I–III.</div>
            </section>

            <section className="oppeGlass oppeSection">
              <div className="oppeSectionHead"><div><div className="oppeEyebrow">RANAH I</div><h4>Perilaku profesional</h4><p>Keluhan atau temuan yang telah diverifikasi harus memiliki sumber dan telaah. Jumlah keluhan tidak otomatis berarti pelanggaran.</p></div><span className="oppeDomainScore">{fmtPct(score.behavior.score)}</span></div>
              <div className="oppeManualItems">{form.behavior.map((item) => <ManualItemCard key={item.id} item={item} disabled={currentReadOnly} onChange={(patch) => patchManualItem('behavior', item.id, patch)} />)}</div>
            </section>

            <section className="oppeGlass oppeSection">
              <div className="oppeSectionHead"><div><div className="oppeEyebrow">RANAH II</div><h4>Pengembangan profesionalisme</h4><p>Jumlah kegiatan ditampilkan sebagai bukti/progres. Status akhir membutuhkan dokumentasi dan evaluasi penilai.</p></div><span className="oppeDomainScore">{fmtPct(score.professionalism.score)}</span></div>
              <div className="oppeManualItems">{form.professionalism.map((item) => {
                const displayItem = item.id === 'meetings_annual' && form.quarter === 4
                  ? { ...item, status: annualMeetingMetrics.status }
                  : item
                return <ManualItemCard key={item.id} item={displayItem} disabled={currentReadOnly} statusDisabled={currentReadOnly || item.id === 'meetings_annual'} onChange={(patch) => patchManualItem('professionalism', item.id, patch)} />
              })}</div>
              {form.professionalism.some((item) => item.id === 'meetings_annual') && form.staffName.trim() && <div className="oppeNotice oppeNoticeInfo">Kehadiran pertemuan ilmiah: {annualMeetingMetrics.previousCount} kegiatan dari triwulan terdahulu yang sudah tervalidasi + {annualMeetingMetrics.currentCount} kegiatan pada triwulan ini = <strong>{annualMeetingMetrics.totalCount} kegiatan kumulatif</strong> (target tahunan ≥ 3). {form.quarter === 4 ? (annualMeetingMetrics.status === 'good' ? 'Target tahunan terpenuhi.' : annualMeetingMetrics.status === 'needs_review' ? 'Target tahunan belum tercapai berdasarkan data triwulan yang lengkap.' : `Data belum memadai; triwulan terdahulu belum tervalidasi: ${annualMeetingMetrics.missingPriorQuarters.map((period) => `TW${period}`).join(', ')}.`) : 'Status tahunan belum difinalkan sampai Triwulan IV.'}</div>}
            </section>

            <section className="oppeGlass oppeSection">
              <div className="oppeSectionHead"><div><div className="oppeEyebrow">RANAH III</div><h4>Kinerja klinis / profesional otomatis</h4><p>Indikator berasal dari master AUREKA. Hanya data tervalidasi dengan aturan atribusi nakes aktif dan minimum observasi yang cukup yang memengaruhi skor.</p></div><span className="oppeDomainScore">{fmtPct(score.clinical.score)}</span></div>
              {clinicalResultsForDisplay.length === 0 ? (
                <div className="oppeEmpty"><strong>Belum ada indikator klinis yang terhubung ke profesi ini.</strong><span>Pastikan nama dan profesi benar, pilih unit yang sesuai, lalu atur indikator pada tab Pemetaan indikator. Indikator unit/tim tidak otomatis dimasukkan ke skor individu.</span><button type="button" className="oppeBtn" onClick={() => setScreen('rules')}>Buka pemetaan indikator</button></div>
              ) : (
                <div className="oppeClinicalList">{clinicalResultsForDisplay.map((item) => <ClinicalResultCard key={item.profileId} item={item} />)}</div>
              )}
              <div className="oppeDataSummary"><span><b>{sourceRecordCount}</b> logbook tervalidasi pada unit/periode penilaian</span><span><b>{clinicalResultsForDisplay.reduce((sum, item) => sum + item.observations, 0)}</b> observasi indikator yang terpakai</span><span><b>{clinicalResultsForDisplay.filter((item) => item.status === 'insufficient_data').length}</b> indikator belum cukup data</span></div>
            </section>

            <section className="oppeGlass oppeSection">
              <div className="oppeSectionHead"><div><div className="oppeEyebrow">KESIMPULAN &amp; TINDAK LANJUT</div><h4>Catatan penilaian dan rencana pengembangan</h4><p>Nilai digunakan untuk umpan balik dan perbaikan profesional. Keputusan kewenangan klinis tidak dibuat secara otomatis dari skor ini.</p></div></div>
              <label className="oppeField oppeWide"><span>Catatan evaluasi / alasan telaah / keputusan penilai</span><textarea value={form.assessmentNotes} onChange={(e) => setForm((current) => ({ ...current, assessmentNotes: e.target.value }))} placeholder="Cantumkan ringkasan diskusi, konteks kasus, faktor sistem, dan alasan keputusan penilaian." /></label>
              <label className="oppeField oppeWide"><span>Rencana pengembangan / tindak lanjut</span><textarea value={form.developmentPlan} disabled={currentReadOnly} onChange={(e) => setForm((current) => ({ ...current, developmentPlan: e.target.value }))} placeholder="Tujuan perbaikan, tindakan, penanggung jawab dan waktu evaluasi ulang." /></label>
            </section>

            {form.id && (
              <section className="oppeGlass oppeSection">
                <div className="oppeSectionHead"><div><div className="oppeEyebrow">AUDIT TRAIL</div><h4>Riwayat proses OPPE</h4><p>Jejak status disimpan terpisah dan tidak dapat diubah melalui antarmuka ini.</p></div><button type="button" className="oppeBtn" disabled={eventsLoading} onClick={() => void loadAssessmentEvents(form.id!)}>{eventsLoading ? 'Memuat…' : 'Perbarui riwayat'}</button></div>
                <div className="oppeEventList">
                  {assessmentEvents.map((event) => (
                    <article className="oppeEventItem" key={event.id}>
                      <div className="oppeEventMarker" aria-hidden="true" />
                      <div className="oppeEventBody">
                        <strong>{({
                          created: 'Draf OPPE dibuat',
                          draft_saved: 'Draf OPPE disimpan',
                          submitted: 'OPPE diajukan untuk validasi',
                          validated: 'OPPE divalidasi',
                          reopened: 'OPPE dikembalikan / dibuka ulang',
                          archived: 'OPPE diarsipkan',
                          updated: 'Perubahan OPPE disimpan',
                        } as Record<string, string>)[String(event.event_type)] || 'Perubahan OPPE'}</strong>
                        <span>{event.created_at ? new Date(event.created_at).toLocaleString('id-ID') : 'Waktu tidak tersedia'} · {event.actor_id ? `Akun ${String(event.actor_id).slice(0, 8)}…` : 'Akun tidak tercatat'}</span>
                        <small>{event.from_status ? `${statusLabel[String(event.from_status)] || event.from_status} → ` : ''}{statusLabel[String(event.to_status)] || event.to_status} · {Number(event.source_records_count || 0)} sumber logbook · snapshot skor tersimpan</small>
                      </div>
                    </article>
                  ))}
                  {!assessmentEvents.length && <div className="oppeEmpty">{eventsLoading ? 'Memuat riwayat proses…' : 'Belum ada event audit yang tercatat.'}</div>}
                </div>
              </section>
            )}
          </main>

          <aside className="oppeAside">
            <section className="oppeGlass oppeScorePanel">
              <div className="oppeEyebrow">RINGKASAN PENILAIAN</div>
              <h4>{score.overall == null ? 'Belum final' : fmtPct(score.overall)}</h4>
              <span className={`oppeStatus ${score.needsReview ? 'oppeWarn' : score.complete ? 'oppeGood' : 'oppeNeutral'}`}>{scoreStatus}</span>
              <p>{score.category}. Skor total hanya ditampilkan bila ketiga ranah memiliki skor; status lengkap menunjukkan seluruh butir yang berlaku sudah dinilai.</p>
              <div className="oppeScoreRows">
                <div><span>Perilaku profesional</span><strong>{fmtPct(score.behavior.score)}</strong><small>{score.behavior.assessed}/{score.behavior.applicable} butir dinilai</small></div>
                <div><span>Pengembangan profesional</span><strong>{fmtPct(score.professionalism.score)}</strong><small>{score.professionalism.assessed}/{score.professionalism.applicable} butir dinilai</small></div>
                <div><span>Kinerja klinis/profesional</span><strong>{fmtPct(score.clinical.score)}</strong><small>{score.clinical.assessed}/{score.clinical.applicable} indikator memiliki skor</small></div>
              </div>
              <div className="oppeMethodNote"><strong>Metode versi 1</strong><br />Rerata tiga ranah dengan bobot setara; setiap butir/indikator di dalam ranah berbobot sama. Indikator kritis yang tidak memenuhi target tetap ditandai untuk telaah khusus dan tidak boleh ditutupi skor agregat.</div>
              {score.needsReview && <div className="oppeNotice oppeError" style={{ marginTop: 10 }}>Ada indikator dengan tingkat telaah tinggi/kritis yang tidak memenuhi target. Tinjau bukti serta konteks sebelum validasi.</div>}
              {score.overall == null && <div className="oppeNotice oppeNoticeInfo" style={{ marginTop: 10 }}>Skor total belum dihitung. Data tidak memadai tidak diperlakukan sebagai nilai nol.</div>}
              <div className="oppeAsideActions">
                <LiquidGlassButton disabled={busy || currentReadOnly} onClick={() => void saveAssessment('draft')}>{busy ? 'Menyimpan…' : 'Simpan draf'}</LiquidGlassButton>
                {form.status === 'draft' || form.status === 'reopened' ? <button type="button" className="oppeBtn oppePrimary" disabled={busy} onClick={() => void saveAssessment('submitted')}>Submit untuk validasi</button> : null}
                {form.status === 'submitted' && <button type="button" className="oppeBtn oppePrimary" disabled={busy} onClick={() => void saveAssessment('validated')}>Validasi OPPE</button>}
                {form.status === 'validated' && <button type="button" className="oppeBtn" disabled={busy} onClick={() => void reopenAssessment()}>Buka kembali untuk revisi</button>}
                {form.status === 'submitted' && <button type="button" className="oppeBtn" disabled={busy} onClick={() => void reopenAssessment()}>Kembalikan untuk perbaikan</button>}
                <button type="button" className="oppeBtn" onClick={handlePrint}>Cetak output</button>
              </div>
            </section>
            <section className="oppeGlass oppeScorePanel">
              <div className="oppeEyebrow">KELENGKAPAN ENGINE</div>
              <div className="oppeMiniMetric"><span>Aturan indikator aktif</span><strong>{selectedRuleCount}</strong></div>
              <div className="oppeMiniMetric"><span>Logbook tervalidasi tahun ini</span><strong>{records.filter((item) => item.status === 'validated').length}</strong></div>
              <div className="oppeMiniMetric"><span>Staf terdeteksi dari logbook</span><strong>{staffSuggestions.length}</strong></div>
              <p className="oppeMuted">Nama yang terdeteksi hanya saran pencarian. Identitas resmi dan nomor pegawai belum dapat diverifikasi sebelum master tenaga kerja diunggah.</p>
            </section>
          </aside>
        </div>
      )}

      {screen === 'rules' && (
        <section className="oppeGlass oppeSection">
          <div className="oppeSectionHead"><div><div className="oppeEyebrow">GOVERNANCE · MASTER MUTU AUREKA</div><h4>Pemetaan indikator ke OPPE individual</h4><p>Setiap indikator perlu ditetapkan apakah layak dinilai per individu, siapa profesi yang dinilai, field tanggung jawab dan metode hitung. Aturan baru tidak otomatis aktif.</p></div>{isSuperAdmin && <LiquidGlassButton onClick={() => { const roomId = roomFilter ?? initialRoom; setGapDraft({ title: '', professionLabel: '', roomId, measurementGrain: suggestedMeasurementGrain(profiles, roomId), targetText: '', targetOperator: '>=', targetValue: '', unitOfMeasure: 'Persentase (%)', numeratorDefinition: '', denominatorDefinition: '', responsibilityField: staffFieldOptions(roomId)[0] || '', notes: '' }); setError(''); setNotice('') }}>＋ Draf indikator yang belum ada</LiquidGlassButton>}</div>
          <div className="oppeRuleToolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, indikator, unit, profesi…" /><span>{filteredProfiles.length} profil master · {rules.filter((rule) => rule.status === 'active' && rule.is_oppe_eligible).length} aturan aktif pada hasil pemuatan</span></div>
          <div className="oppeRuleList">{filteredProfiles.map((profile) => {
            const profileRules = rules.filter((item) => item.profile_id === String(profile.id))
              .sort((a, b) => a.profession_label.localeCompare(b.profession_label, 'id'))
            const active = profileRules.filter((rule) => rule.status === 'active' && rule.is_oppe_eligible)
            return <article className="oppeRuleRow" key={profile.id}>
              <div className="oppeRuleTitle">
                <strong>{profile.code} · {profile.title}</strong>
                <span>{profile.unit_name} · {profile.indicator_type || 'Tanpa program'} · {profile.measurement_grain} · {profile.status}{profile.is_active ? '' : ' / nonaktif'}</span>
                <span className="oppeRuleDescription">{profileRules.length} pemetaan profesi · {active.length} aktif untuk kalkulasi</span>
                <div className="oppeRuleMappings">
                  {profileRules.map((rule) => (
                    <div className="oppeRuleMapping" key={rule.id}>
                      <div><b>{rule.profession_label || 'Profesi belum diatur'}</b><span>Field: {rule.responsibility_field || '—'} · {displayMethod(rule.measurement_method)} · Minimum {rule.minimum_observations}</span></div>
                      <div className="oppeRuleMappingActions"><span className={`oppeStatus ${rule.status === 'active' && rule.is_oppe_eligible ? 'oppeGood' : 'oppeNeutral'}`}>{rule.status === 'active' && rule.is_oppe_eligible ? 'Aktif' : 'Draf / nonaktif'}</span><button type="button" className="oppeBtn" onClick={() => startRuleEdit(profile, rule)}>Ubah</button></div>
                    </div>
                  ))}
                  {!profileRules.length && <span className="oppeMuted">Belum ada pemetaan profesi.</span>}
                </div>
              </div>
              <div className="oppeRuleActions"><button type="button" className="oppeBtn" onClick={() => startRuleEdit(profile, null)}>＋ Tambah pemetaan</button></div>
            </article>
          })}{!filteredProfiles.length && <div className="oppeEmpty">Tidak ada profil pada filter ini.</div>}</div>
          {ruleProfile && ruleDraft && <div className="oppeModalBackdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) { setRuleProfile(null); setRuleDraft(null) } }}><section className="oppeModal" role="dialog" aria-modal="true" aria-label="Atur indikator OPPE">
            <header className="oppeModalHeader"><div><div className="oppeEyebrow">ATURAN ATRIBUSI &amp; SKOR</div><h4>{ruleProfile.code} · {ruleProfile.title}</h4><p>{ruleDraft.ruleId ? 'Edit pemetaan profesi yang ada' : 'Tambah pemetaan profesi baru'} · {ruleProfile.unit_name} · target master: {ruleProfile.target_text || 'Belum ditentukan'}</p></div><button type="button" className="oppeClose" onClick={() => { setRuleProfile(null); setRuleDraft(null) }}>×</button></header>
            <div className="oppeModalBody">
              <label className="oppeCheck"><input type="checkbox" checked={ruleDraft.eligible} onChange={(e) => setRuleDraft((current) => current ? { ...current, eligible: e.target.checked } : current)} /><span><strong>Aktifkan untuk kalkulasi OPPE individual</strong><small>Centang hanya setelah memastikan bahwa indikator memang mengukur kinerja individu dan field tanggung jawab benar.</small></span></label>
              <div className="oppeFormGrid">
                <label className="oppeField"><span>Profesi/SMF yang dinilai *</span><input value={ruleDraft.professionLabel} onChange={(e) => setRuleDraft((current) => current ? { ...current, professionLabel: e.target.value } : current)} placeholder="Harus cocok dengan profesi di form OPPE" /></label>
                <label className="oppeField"><span>Field penanggung jawab logbook *</span><select value={ruleDraft.responsibilityField} onChange={(e) => setRuleDraft((current) => current ? { ...current, responsibilityField: e.target.value } : current)}><option value="">Pilih field yang tersedia</option>{staffFieldOptions(Number(ruleProfile.room_id)).map((field) => <option key={field} value={field}>{field}</option>)}</select></label>
                <label className="oppeField"><span>Metode pengukuran</span><select value={ruleDraft.measurementMethod} onChange={(e) => setRuleDraft((current) => current ? { ...current, measurementMethod: e.target.value as RuleDraft['measurementMethod'] } : current)}><option value="numerator_denominator">Pembilang / penyebut (rasio)</option><option value="option_response">Pilihan respons berkode</option><option value="numeric_target">Nilai numerik dibanding target</option><option value="manual_review">Telaah manual, tidak masuk skor otomatis</option></select><small className="oppeMuted">Rasio dipakai bila logbook menyimpan N dan D; pilihan respons dipakai bila setiap kasus memiliki opsi master terpetakan; nilai numerik membandingkan rerata nilai mentah dengan target. Jika tidak jelas, pilih telaah manual.</small></label>
                <label className="oppeField"><span>Minimum observasi</span><input type="number" min={1} max={5000} value={ruleDraft.minimumObservations} onChange={(e) => setRuleDraft((current) => current ? { ...current, minimumObservations: Number(e.target.value) } : current)} /></label>
                <label className="oppeField"><span>Tingkat telaah</span><select value={ruleDraft.criticality} onChange={(e) => setRuleDraft((current) => current ? { ...current, criticality: e.target.value as RuleDraft['criticality'] } : current)}><option value="standard">Standar</option><option value="high">Tinggi — perlu telaah bila target gagal</option><option value="critical">Kritis — wajib telaah terpisah bila target gagal</option></select></label>
                <label className="oppeField oppeWide"><span>Dasar pemetaan / validasi definisi *</span><textarea value={ruleDraft.notes} onChange={(e) => setRuleDraft((current) => current ? { ...current, notes: e.target.value } : current)} placeholder="Contoh: indikator mengukur aktivitas perawat yang tercatat pada field Perawat Penerima; numerator dan denominator telah diverifikasi oleh pemilik indikator." /></label>
              </div>
              <div className="oppeNotice oppeNoticeInfo">Satu indikator dapat memiliki beberapa pemetaan profesi; untuk satu staf, aturan profesi yang persis akan mengalahkan aturan kelompok umum agar indikator tidak terhitung ganda. Skor otomatis hanya akan memakai catatan dengan status Validated, pada unit/tahun/triwulan terpilih dan nama yang cocok persis dengan field penanggung jawab. Data draf, data lokal, dan catatan tanpa atribusi tidak masuk skor.</div>
            </div>
            <footer className="oppeModalFooter"><button type="button" className="oppeBtn" onClick={() => { setRuleProfile(null); setRuleDraft(null) }}>Batal</button><LiquidGlassButton disabled={busy} onClick={() => void saveRule()}>{busy ? 'Menyimpan…' : 'Simpan pemetaan'}</LiquidGlassButton></footer>
          </section></div>}
          {gapDraft && <div className="oppeModalBackdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setGapDraft(null) }}><section className="oppeModal" role="dialog" aria-modal="true" aria-label="Tambah draf indikator OPPE">
            <header className="oppeModalHeader"><div><div className="oppeEyebrow">MASTER INDIKATOR · DRAF KESENJANGAN</div><h4>Usulkan indikator profesional baru</h4><p>Draf tidak masuk kalkulasi sampai ditelaah, diterbitkan dan dipetakan.</p></div><button type="button" className="oppeClose" onClick={() => setGapDraft(null)}>×</button></header>
            <div className="oppeModalBody"><div className="oppeFormGrid">
              <label className="oppeField"><span>Unit pemilik</span><select value={gapDraft.roomId} onChange={(e) => { const value = Number(e.target.value); setGapDraft((current) => current ? { ...current, roomId: value, measurementGrain: suggestedMeasurementGrain(profiles, value), responsibilityField: staffFieldOptions(value)[0] || '' } : current) }}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
              <label className="oppeField"><span>Profesi/SMF *</span><input value={gapDraft.professionLabel} onChange={(e) => setGapDraft((current) => current ? { ...current, professionLabel: e.target.value } : current)} placeholder="Contoh: Dokter Spesialis Anestesiologi" /></label>
              <label className="oppeField oppeWide"><span>Nama indikator *</span><input value={gapDraft.title} onChange={(e) => setGapDraft((current) => current ? { ...current, title: e.target.value } : current)} /></label>
              <label className="oppeField"><span>Target tertulis *</span><input value={gapDraft.targetText} onChange={(e) => setGapDraft((current) => current ? { ...current, targetText: e.target.value } : current)} placeholder="Contoh: ≥ 95%" /></label>
              <label className="oppeField"><span>Nilai target numerik</span><input type="number" value={gapDraft.targetValue} onChange={(e) => setGapDraft((current) => current ? { ...current, targetValue: e.target.value } : current)} placeholder="95" /></label>
              <label className="oppeField"><span>Operator target</span><select value={gapDraft.targetOperator} onChange={(e) => setGapDraft((current) => current ? { ...current, targetOperator: e.target.value } : current)}><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option><option value=">">&gt;</option><option value="<">&lt;</option></select></label>
              <label className="oppeField"><span>Satuan</span><input value={gapDraft.unitOfMeasure} onChange={(e) => setGapDraft((current) => current ? { ...current, unitOfMeasure: e.target.value } : current)} /></label>
              <label className="oppeField oppeWide"><span>Definisi numerator *</span><textarea value={gapDraft.numeratorDefinition} onChange={(e) => setGapDraft((current) => current ? { ...current, numeratorDefinition: e.target.value } : current)} /></label>
              <label className="oppeField oppeWide"><span>Definisi denominator *</span><textarea value={gapDraft.denominatorDefinition} onChange={(e) => setGapDraft((current) => current ? { ...current, denominatorDefinition: e.target.value } : current)} /></label>
              <label className="oppeField"><span>Metode pencatatan yang digunakan</span><input value={`${GRAIN_LABELS[gapDraft.measurementGrain] || gapDraft.measurementGrain} · ${gapDraft.measurementGrain}`} disabled /><small className="oppeMuted">Mengikuti grain dominan/layout unit supaya record yang dimasukkan PIC dapat dihitung konsisten. Grain berbeda perlu layout logbook terpisah terlebih dahulu.</small></label>
              <label className="oppeField"><span>Field nakes penanggung jawab *</span><select value={gapDraft.responsibilityField} onChange={(e) => setGapDraft((current) => current ? { ...current, responsibilityField: e.target.value } : current)}><option value="">Pilih field dari logbook</option>{staffFieldOptions(gapDraft.roomId).map((field) => <option key={field} value={field}>{field}</option>)}</select></label>
              <label className="oppeField oppeWide"><span>Catatan kebutuhan / sumber</span><textarea value={gapDraft.notes} onChange={(e) => setGapDraft((current) => current ? { ...current, notes: e.target.value } : current)} placeholder="Dasar klinis, SOP/pedoman, ruang lingkup profesi dan alasan gap." /></label>
            </div><div className="oppeNotice oppeNoticeInfo">Draf disimpan dengan status nonaktif. Publikasi harus ditinjau di Metadata. Pastikan field penanggung jawab memang ada di layout logbook unit agar setiap catatan dapat diatribusikan.</div></div>
            <footer className="oppeModalFooter"><button type="button" className="oppeBtn" onClick={() => setGapDraft(null)}>Batal</button><LiquidGlassButton disabled={busy} onClick={() => void createGapProfile()}>{busy ? 'Menyimpan…' : 'Simpan draf ke master'}</LiquidGlassButton></footer>
          </section></div>}
        </section>
      )}

      {screen === 'history' && (
        <section className="oppeGlass oppeSection">
          <div className="oppeSectionHead"><div><div className="oppeEyebrow">RIWAYAT &amp; OUTPUT</div><h4>Penilaian tersimpan</h4><p>Buka penilaian untuk melihat bukti, snapshot skor dan status validasi. Draf dapat dilanjutkan; penilaian tervalidasi hanya dapat dikoreksi melalui alur pembukaan kembali.</p></div></div>
          <div className="oppeRuleToolbar"><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Cari nama, profesi, ID pegawai, evaluator…" /><span>{filteredAssessments.length} penilaian pada filter aktif</span></div>
          <div className="oppeRuleList">{filteredAssessments.map((assessment) => <article className="oppeRuleRow" key={assessment.id}><div className="oppeRuleTitle"><strong>{assessment.staff_name} · {assessment.profession}</strong><span>{roomMap.get(Number(assessment.room_id)) || 'Unit'} · {quarters.find((item) => item.value === Number(assessment.period_quarter))?.label} {assessment.period_year}</span><span className="oppeRuleDescription">Nilai: {fmtPct(asObject(assessment.score_json).overall)} · {asObject(assessment.score_json).category || 'Belum dinilai'} · Evaluator: {assessment.evaluator_name || '—'}</span></div><div className="oppeRuleActions"><span className={`oppeStatus ${statusTone[assessment.status] || 'oppeNeutral'}`}>{statusLabel[assessment.status] || assessment.status}</span><button type="button" className="oppeBtn" onClick={() => openSaved(assessment)}>Buka penilaian</button></div></article>)}{!filteredAssessments.length && <div className="oppeEmpty">{loading ? 'Memuat riwayat…' : 'Belum ada penilaian tersimpan untuk periode ini. Gunakan Form & output OPPE untuk memulai draf.'}</div>}</div>
        </section>
      )}

      <section className="oppePrintOnly">
        <div className="oppePrintHeader"><h2>ON-GOING PROFESSIONAL PRACTICE EVALUATION (OPPE)</h2><p>Rumah Sakit Umum Daerah Sultan Syarif Mohamad Alkadrie</p></div>
        <table className="oppePrintMeta"><tbody>
          <tr><th>Nama staf</th><td>{form.staffName || '—'}</td><th>Profesi / SMF</th><td>{form.profession || '—'}</td></tr>
          <tr><th>Unit kerja</th><td>{selectedRoomName}</td><th>Periode</th><td>{quarters.find((item) => item.value === form.quarter)?.label} {form.year}</td></tr>
          <tr><th>Evaluator</th><td>{form.evaluatorName || '—'}</td><th>Status</th><td>{statusLabel[form.status] || form.status}</td></tr>
        </tbody></table>
        <h3>I. Perilaku profesional</h3><PrintManualTable items={form.behavior} />
        <h3>II. Pengembangan profesionalisme</h3><PrintManualTable items={professionalismForScore} />
        <h3>III. Kinerja klinis/profesional</h3>
        <table className="oppePrintTable"><thead><tr><th>Kode</th><th>Indikator</th><th>N/D atau rerata</th><th>Capaian</th><th>Target</th><th>Jumlah observasi</th><th>Hasil</th><th>Keterangan</th></tr></thead><tbody>{clinicalResultsForDisplay.map((item) => <tr key={item.profileId}><td>{item.code}</td><td>{item.title}</td><td>{item.rate !== null ? `${fmtNum(item.numerator)}/${fmtNum(item.denominator)}` : fmtNum(item.numericMean)}</td><td>{fmtPct(item.rate)}</td><td>{item.targetText || '—'}</td><td>{item.observations}</td><td>{item.status === 'meets_target' ? 'Memenuhi target' : item.status === 'below_target' ? 'Di bawah target' : item.status === 'manual_review' ? 'Telaah manual' : 'Data belum memadai'}</td><td>{item.reason}</td></tr>)}</tbody></table>
        <h3>IV. Ringkasan hasil</h3>
        <table className="oppePrintMeta"><tbody><tr><th>Skor perilaku</th><td>{fmtPct(score.behavior.score)}</td><th>Skor pengembangan</th><td>{fmtPct(score.professionalism.score)}</td></tr><tr><th>Skor klinis</th><td>{fmtPct(score.clinical.score)}</td><th>Total OPPE</th><td>{fmtPct(score.overall)} · {score.category}</td></tr></tbody></table>
        <p><strong>Metode:</strong> {score.method}</p>
        <p><strong>Catatan evaluasi:</strong> {form.assessmentNotes || '—'}</p>
        <p><strong>Rencana pengembangan:</strong> {form.developmentPlan || '—'}</p>
        <div className="oppePrintSignatures"><div>Mengetahui,<br/>Ketua Sub Komite Mutu Profesi<br/><br/><br/>________________________</div><div>Penilai,<br/>Kepala KSM / evaluator<br/><br/><br/>________________________</div><div>Menyetujui,<br/>Ketua Komite Medik<br/><br/><br/>________________________</div><div>Menyetujui,<br/>Kepala Bidang Pelayanan Medik dan Keperawatan<br/><br/><br/>________________________</div></div>
        <p className="oppePrintFoot">Dokumen internal. Skor OPPE merupakan ringkasan penilaian dan bukan keputusan otomatis tentang kewenangan klinis. Indikator tim/unit tidak dimasukkan ke skor individu tanpa atribusi terverifikasi.</p>
      </section>
    </section>
  )
}

function ManualItemCard({ item, disabled, statusDisabled = false, onChange }: { item: ManualAssessmentItem; disabled: boolean; statusDisabled?: boolean; onChange: (patch: Partial<ManualAssessmentItem>) => void }) {
  const annualDeferred = item.id === 'meetings_annual'
  return <article className="oppeManualCard">
    <div className="oppeManualTitle"><div><strong>{item.label}</strong><span>{item.target}</span></div>{annualDeferred && <span className="oppeTinyTag">Tahunan</span>}</div>
    <div className="oppeFormGrid oppeManualGrid">
      <label className="oppeField"><span>Status penilaian</span><select value={item.status} disabled={disabled || statusDisabled} onChange={(e) => onChange({ status: e.target.value as ManualAssessmentItem['status'] })}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="oppeField"><span>Jumlah kejadian/kegiatan</span><input type="number" min="0" value={item.count} disabled={disabled} onChange={(e) => onChange({ count: e.target.value })} placeholder="0" /></label>
      <label className="oppeField oppeWide"><span>Sumber bukti / referensi *</span><input value={item.evidence} disabled={disabled} onChange={(e) => onChange({ evidence: e.target.value })} placeholder="Nomor laporan terverifikasi, notulen, SK tugas atau bukti lain" /></label>
      <label className="oppeField oppeWide"><span>Catatan telaah / alasan</span><textarea value={item.notes} disabled={disabled} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Konteks, hasil verifikasi, alasan tidak berlaku, atau tindak lanjut." /></label>
    </div>
  </article>
}

function ClinicalResultCard({ item }: { item: ClinicalIndicatorResult }) {
  const stateLabel = item.status === 'meets_target' ? 'Memenuhi target'
    : item.status === 'below_target' ? 'Di bawah target'
      : item.status === 'manual_review' ? 'Konteks telaah'
        : 'Data belum memadai'
  const tone = item.status === 'meets_target' ? 'oppeGood' : item.status === 'below_target' ? (item.criticality === 'critical' || item.criticality === 'high' ? 'oppeWarn' : 'oppeNeutral') : 'oppeNeutral'
  return <article className="oppeClinicalCard">
    <div className="oppeClinicalHead"><div><strong>{item.code} · {item.title}</strong><span>{item.unitName} · {item.grain} · atribusi: {item.attributionField} = profesi/nama yang dipilih</span></div><span className={`oppeStatus ${tone}`}>{stateLabel}</span></div>
    <div className="oppeClinicalStats">
      <div><span>Capaian</span><strong>{fmtPct(item.rate)}</strong></div>
      <div><span>N / D</span><strong>{item.numerator == null ? '—' : `${fmtNum(item.numerator)} / ${fmtNum(item.denominator)}`}</strong></div>
      <div><span>Observasi</span><strong>{item.observations}</strong></div>
      <div><span>Target</span><strong>{item.targetText || '—'}</strong></div>
    </div>
    <div className="oppeClinicalReason">{item.reason}{item.missingResponses > 0 ? ` ${item.missingResponses} respons/atribusi tidak dapat dihitung.` : ''}{item.criticality !== 'standard' ? ` Tingkat telaah: ${item.criticality === 'critical' ? 'kritis' : 'tinggi'}.` : ''}</div>
  </article>
}

function PrintManualTable({ items }: { items: ManualAssessmentItem[] }) {
  return <table className="oppePrintTable"><thead><tr><th>Indikator</th><th>Trigger / target</th><th>Jumlah</th><th>Status</th><th>Sumber bukti</th><th>Catatan</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.label}</td><td>{item.target}</td><td>{item.count || '—'}</td><td>{statusOptions.find((option) => option.value === item.status)?.label || item.status}</td><td>{item.evidence || '—'}</td><td>{item.notes || '—'}</td></tr>)}</tbody></table>
}

const CSS = `
.oppeRoot{display:grid;gap:14px;color:var(--ink)}
.oppeGlass{background:linear-gradient(135deg,rgba(255,255,255,.58),rgba(255,255,255,.26));border:1px solid rgba(255,255,255,.74);border-radius:24px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.8);backdrop-filter:blur(22px) saturate(160%);-webkit-backdrop-filter:blur(22px) saturate(160%);min-width:0}
.oppeHeader{padding:20px 22px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.oppeEyebrow{font-size:9px;letter-spacing:.13em;text-transform:uppercase;font-weight:900;color:var(--accent2)}
.oppeHeader h3{margin:6px 0;font-size:29px;letter-spacing:-.05em;color:var(--ink)}
.oppeHeader p{margin:0;max-width:810px;color:var(--muted);font-size:12px;line-height:1.65}
.oppeHeaderNotes{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.oppeHeaderNotes span{padding:6px 9px;border:1px solid rgba(30,76,55,.1);border-radius:999px;background:rgba(255,255,255,.42);color:#50665a;font-size:9px;font-weight:750}
.oppeHeaderActions{display:flex;gap:8px;flex-wrap:wrap}
.oppeBtn{min-height:40px;border:1px solid rgba(255,255,255,.75);background:rgba(255,255,255,.5);color:#284237;border-radius:12px;padding:9px 12px;font-size:10px;font-weight:850;cursor:pointer}
.oppeBtn:disabled{opacity:.52;cursor:not-allowed}
.oppePrimary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}
.oppeFilters{padding:14px 16px;display:grid;grid-template-columns:150px 180px minmax(200px,1fr) auto;gap:10px;align-items:end}
.oppeField{display:grid;gap:5px;min-width:0;font-size:10px;color:#63746a}
.oppeField>span{font-size:10px;font-weight:850;color:#607268}
.oppeField input,.oppeField select,.oppeField textarea,.oppeRuleToolbar input{width:100%;min-width:0;min-height:41px;border:1px solid rgba(35,63,50,.13);border-radius:12px;background:rgba(255,255,255,.66);padding:9px 11px;color:var(--ink);font:inherit;font-size:11px;outline:none}
.oppeField textarea{min-height:84px;resize:vertical;line-height:1.55}
.oppeFilterMeta{font-size:9px;color:var(--muted);text-align:right;max-width:250px;line-height:1.5}
.oppeTabs{display:flex;gap:7px;flex-wrap:wrap;padding:5px;border-radius:16px;border:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.22)}
.oppeTabs button{border:1px solid transparent;background:rgba(255,255,255,.2);color:#5d7065;border-radius:12px;padding:10px 13px;min-height:40px;font-weight:850;font-size:10px;cursor:pointer}
.oppeTabs button.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.oppeTabs span{display:inline-grid;place-items:center;margin-left:4px;min-width:18px;height:18px;border-radius:999px;background:rgba(255,255,255,.28);font-size:9px}
.oppeWorkGrid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(265px,.8fr);align-items:start;gap:14px}
.oppeMain{display:grid;gap:14px;min-width:0}.oppeAside{display:grid;gap:14px;min-width:0;position:sticky;top:14px}
.oppeSection{padding:17px 18px;min-width:0}
.oppeSectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.oppeSectionHead h4{margin:4px 0 4px;font-size:17px;letter-spacing:-.025em}
.oppeSectionHead p{margin:0;color:var(--muted);font-size:10px;line-height:1.6;max-width:730px}
.oppeFormGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.oppeWide{grid-column:1/-1}
.oppeInlineNote{margin-top:12px;background:rgba(255,255,255,.36);border:1px solid rgba(25,60,45,.09);border-radius:12px;padding:10px 12px;font-size:10px;line-height:1.6;color:var(--muted)}
.oppeStatus{display:inline-flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;white-space:nowrap;line-height:1.3}
.oppeGood{background:#e4f5eb;color:#216b49}.oppeInfo{background:#e8efff;color:#455c9a}.oppeWarn{background:#fff1dc;color:#8b5a12}.oppeNeutral{background:#edf0ee;color:#647269}
.oppeDomainScore{font-size:17px;font-weight:950;color:var(--accent2);white-space:nowrap}
.oppeManualItems{display:grid;gap:10px}
.oppeManualCard{padding:12px;border:1px solid rgba(25,60,45,.1);border-radius:16px;background:rgba(255,255,255,.33)}
.oppeManualTitle{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
.oppeManualTitle>div{display:grid;gap:4px}
.oppeManualTitle strong{font-size:11px;line-height:1.5}
.oppeManualTitle span{font-size:9px;color:var(--muted);line-height:1.5}
.oppeTinyTag{padding:5px 7px;border-radius:999px;background:#e8efff;color:#455c9a;font-weight:900;font-size:8px!important;white-space:nowrap}
.oppeManualGrid{grid-template-columns:minmax(160px,.65fr) minmax(110px,.35fr)}
.oppeScorePanel{padding:17px;display:grid;gap:10px}
.oppeScorePanel h4{font-size:32px;letter-spacing:-.055em;margin:0}
.oppeScorePanel p{margin:0;color:var(--muted);font-size:10px;line-height:1.55}
.oppeScoreRows{display:grid;gap:7px;margin-top:4px}
.oppeScoreRows>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px;padding:10px;border:1px solid rgba(25,60,45,.09);background:rgba(255,255,255,.36);border-radius:12px}
.oppeScoreRows span{font-size:10px;font-weight:800}.oppeScoreRows strong{font-size:12px;color:var(--accent2)}.oppeScoreRows small{grid-column:1/-1;font-size:9px;color:var(--muted)}
.oppeMethodNote{padding:10px 11px;background:rgba(239,246,241,.8);border:1px solid rgba(25,60,45,.1);border-radius:12px;font-size:9px;line-height:1.6;color:#52685c}
.oppeAsideActions{display:grid;gap:7px;margin-top:3px}
.oppeMiniMetric{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(25,60,45,.09);font-size:10px;color:var(--muted)}
.oppeMiniMetric strong{font-size:14px;color:var(--ink)}.oppeMuted{font-size:9px;color:var(--muted);line-height:1.55}
.oppeClinicalList{display:grid;gap:9px}
.oppeClinicalCard{padding:12px;border-radius:15px;border:1px solid rgba(25,60,45,.1);background:rgba(255,255,255,.36)}
.oppeClinicalHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.oppeClinicalHead>div{display:grid;gap:5px;min-width:0}.oppeClinicalHead strong{font-size:11px;line-height:1.45}.oppeClinicalHead span:not(.oppeStatus){font-size:9px;color:var(--muted);line-height:1.5}
.oppeClinicalStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}
.oppeClinicalStats>div{padding:8px;background:rgba(255,255,255,.54);border-radius:10px;min-width:0}
.oppeClinicalStats span{display:block;color:var(--muted);font-size:8px;font-weight:850}.oppeClinicalStats strong{display:block;margin-top:4px;font-size:10px;overflow-wrap:anywhere}
.oppeClinicalReason{font-size:9px;color:var(--muted);line-height:1.6;margin-top:9px}
.oppeDataSummary{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.oppeDataSummary span{padding:7px 9px;background:rgba(255,255,255,.43);border-radius:10px;font-size:9px;color:var(--muted)}
.oppeDataSummary b{color:var(--ink)}
.oppeEmpty{display:grid;justify-items:center;gap:8px;padding:23px 18px;text-align:center;color:var(--muted);font-size:10px;line-height:1.6;border:1px dashed rgba(25,60,45,.19);border-radius:16px}
.oppeEmpty strong{color:var(--ink);font-size:12px}.oppeEmpty span{max-width:680px}
.oppeNotice{padding:10px 12px;border-radius:12px;font-size:10px;line-height:1.6}
.oppeError{background:#fff0ee;color:#903c34;border:1px solid #f0d1cc}
.oppeSuccess{background:#e8f7ee;color:#216a45;border:1px solid #cde9d8}
.oppeNoticeInfo{background:#fff8e5;color:#785c26;border:1px solid #f0e0ac}
.oppeDenied{padding:22px}.oppeDenied h3{font-size:23px;margin:6px 0}.oppeDenied p{font-size:12px;line-height:1.65;color:var(--muted);max-width:700px}
.oppeRuleToolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:10px 0}
.oppeRuleToolbar input{flex:1 1 260px}.oppeRuleToolbar span{font-size:9px;color:var(--muted)}
.oppeRuleList{display:grid;gap:7px}
.oppeRuleRow{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px;border:1px solid rgba(25,60,45,.1);background:rgba(255,255,255,.37);border-radius:14px}
.oppeRuleTitle{display:grid;gap:5px;min-width:0}.oppeRuleTitle strong{font-size:10px;line-height:1.55;overflow-wrap:anywhere}.oppeRuleTitle>span{font-size:9px;color:var(--muted);line-height:1.5}
.oppeRuleDescription{color:#536a5c!important}.oppeRuleMappings{display:grid;gap:7px;margin-top:7px}.oppeRuleMapping{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(25,60,45,.1);border-radius:11px;padding:9px;background:rgba(255,255,255,.36)}.oppeRuleMapping>div:first-child{display:grid;gap:4px;min-width:0}.oppeRuleMapping b{font-size:10px}.oppeRuleMapping span{font-size:9px;line-height:1.45;color:var(--muted)}.oppeRuleMappingActions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.oppeRuleActions{display:flex;align-items:flex-end;gap:7px;flex-direction:column;flex-shrink:0}
.oppeModalBackdrop{position:fixed;inset:0;z-index:120;background:rgba(11,22,17,.32);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px}
.oppeModal{width:min(820px,96vw);max-height:92vh;display:flex;flex-direction:column;background:rgba(249,252,250,.99);border:1px solid rgba(255,255,255,.78);box-shadow:0 25px 80px rgba(0,0,0,.23);border-radius:22px;overflow:hidden}
.oppeModalHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:18px 20px;border-bottom:1px solid rgba(25,60,45,.1)}
.oppeModalHeader h4{margin:5px 0;font-size:17px}.oppeModalHeader p{margin:0;font-size:10px;color:var(--muted);line-height:1.5}
.oppeClose{border:0;border-radius:10px;width:34px;height:34px;background:#e9efeb;color:var(--ink);font-size:21px;cursor:pointer}
.oppeModalBody{padding:16px 20px;overflow:auto;display:grid;gap:13px}.oppeModalFooter{display:flex;justify-content:flex-end;gap:8px;padding:13px 20px;border-top:1px solid rgba(25,60,45,.1)}
.oppeCheck{display:flex;gap:10px;padding:12px;border-radius:13px;background:rgba(255,255,255,.58);border:1px solid rgba(25,60,45,.12);font-size:10px;line-height:1.5}
.oppeCheck input{accent-color:var(--accent);margin-top:3px}.oppeCheck span{display:grid;gap:4px}.oppeCheck small{color:var(--muted)}
.oppeEventList{display:grid;gap:0}.oppeEventItem{display:grid;grid-template-columns:14px minmax(0,1fr);gap:10px;padding:10px 0;border-bottom:1px solid rgba(25,60,45,.09)}.oppeEventMarker{width:9px;height:9px;border-radius:50%;background:var(--accent);margin-top:4px;box-shadow:0 0 0 4px rgba(15,118,86,.09)}.oppeEventBody{display:grid;gap:4px}.oppeEventBody strong{font-size:10px}.oppeEventBody span,.oppeEventBody small{font-size:9px;line-height:1.45;color:var(--muted)}.oppePrintOnly{display:none}
@media(max-width:1150px){.oppeFilters{grid-template-columns:repeat(3,minmax(0,1fr))}.oppeFilterMeta{grid-column:1/-1;text-align:left;max-width:none}.oppeWorkGrid{grid-template-columns:minmax(0,1.4fr) minmax(250px,.8fr)}}
@media(max-width:900px){.oppeWorkGrid{grid-template-columns:1fr}.oppeAside{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.oppeScorePanel:first-child{grid-row:span 2}}
@media(max-width:620px){.oppeHeader{padding:16px}.oppeHeader h3{font-size:24px}.oppeFilters{grid-template-columns:1fr 1fr}.oppeWorkGrid,.oppeAside,.oppeFormGrid,.oppeManualGrid{grid-template-columns:1fr}.oppeWide{grid-column:auto}.oppeRuleRow{display:grid}.oppeRuleActions{flex-direction:row;justify-content:space-between;align-items:center}.oppeClinicalHead{display:grid}.oppeClinicalStats{grid-template-columns:1fr 1fr}.oppeScorePanel:first-child{grid-row:auto}}
@media print {
  body *{visibility:hidden!important}
  .oppePrintOnly,.oppePrintOnly *{visibility:visible!important}
  .oppePrintOnly{display:block!important;position:absolute!important;left:0;top:0;width:100%;padding:0!important;margin:0!important;background:white!important;color:#111!important;font-family:Arial,sans-serif!important;font-size:10pt!important}
  .oppePrintOnly h2{font-size:15pt;text-align:center;margin:0 0 5px}.oppePrintHeader{text-align:center;margin-bottom:18px}.oppePrintHeader p{margin:0}
  .oppePrintOnly h3{font-size:11pt;margin:15px 0 5px}
  .oppePrintTable,.oppePrintMeta{border-collapse:collapse;width:100%;table-layout:auto}
  .oppePrintTable th,.oppePrintTable td,.oppePrintMeta th,.oppePrintMeta td{border:1px solid #777;padding:5px;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere}
  .oppePrintTable th,.oppePrintMeta th{background:#f1f1f1}
  .oppePrintSignatures{display:grid;grid-template-columns:repeat(2,1fr);gap:24px 20px;margin-top:35px;text-align:center;line-height:1.5;page-break-inside:avoid}
  .oppePrintFoot{font-size:8pt;margin-top:20px}
  @page{size:A4 portrait;margin:12mm}
}
`
