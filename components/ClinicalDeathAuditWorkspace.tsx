'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Room = { id: number; name: string }
type StaffOption = { id: string; employee_code: string; display_name: string; profession_group: string; position_title: string; room_id: number; room_name: string }
type AuditType = 'clinical' | 'death'
type Phase = { id: string; label: string; hint: string; optional?: boolean }
type PhaseReview = { score: number | null; comment: string; notApplicable: boolean }
type ReviewDraft = {
  background: string
  phases: Record<string, PhaseReview>
  overallScore: number | null
  careIssue: '' | 'yes' | 'no' | 'uncertain'
  contribution: '' | 'yes' | 'no' | 'uncertain' | 'not_applicable'
  avoidabilityScore: number | null
  learningPoints: string
  actions: string
}
type Episode = {
  id: string
  sourceKey: string
  sourceRecordId: string | null
  source: 'database' | 'local'
  roomId: number | null
  unit: string
  name: string
  rm: string
  sex: string
  age: string
  admit: string
  discharge: string
  caseDate: string
  diagnosis: string
  dpjp: string
  outcome: string
  isDeath: boolean
  updatedAt: string
}
type AuditRow = {
  id: string
  room_id: number
  source_record_id: string | null
  source_subject_key: string
  audit_type: AuditType
  review_period: string
  episode_snapshot: Record<string, any>
  criteria_snapshot: Record<string, any>
  review_json: Record<string, any>
  overall_care_score: number | null
  care_issue_identified: string | null
  contribution_to_outcome: string | null
  avoidability_score: number | null
  status: string
  created_at: string
  updated_at: string
}
type Props = { initialRoomId: number | null; rooms: Room[]; isAdmin: boolean; isValidator?: boolean }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const EPISODE_CACHE_KEY = 'aureka-quality-episode-cache-v3'
const PHASES: Phase[] = [
  { id: 'admission', label: 'Admisi dan perawatan awal', hint: 'Fokus 24 jam pertama sejak masuk rumah sakit.' },
  { id: 'ongoing', label: 'Perawatan lanjutan', hint: 'Pemantauan, respons terapi, eskalasi dan koordinasi selama perawatan.' },
  { id: 'procedure', label: 'Perawatan selama prosedur', hint: 'Isi jika pasien menjalani tindakan atau prosedur.', optional: true },
  { id: 'perioperative', label: 'Perioperatif / perawatan prosedural', hint: 'Isi bila perawatan pra-, intra- atau pascaprosedur relevan.', optional: true },
  { id: 'end_of_life', label: 'Akhir hayat / pemulangan', hint: 'Pada kasus kematian, nilai pengenalan kondisi terminal, keputusan, kenyamanan dan komunikasi.' },
]
const CARE_SCORES = [
  { value: 1, label: '1 — Sangat buruk' },
  { value: 2, label: '2 — Buruk' },
  { value: 3, label: '3 — Adekuat' },
  { value: 4, label: '4 — Baik' },
  { value: 5, label: '5 — Sangat baik' },
]
const AVOIDABILITY = [
  { value: 1, label: '1 — Pasti dapat dicegah' },
  { value: 2, label: '2 — Sangat mungkin dapat dicegah' },
  { value: 3, label: '3 — Kemungkinan dapat dicegah >50%' },
  { value: 4, label: '4 — Kemungkinan dapat dicegah <50%' },
  { value: 5, label: '5 — Ada sedikit bukti dapat dicegah' },
  { value: 6, label: '6 — Pasti tidak dapat dicegah' },
]
const CSS = ".acd{display:grid;gap:14px}.acdPanel{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.56),rgba(255,255,255,.28));border:1px solid rgba(255,255,255,.72);border-radius:24px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.72);backdrop-filter:blur(22px) saturate(155%);-webkit-backdrop-filter:blur(22px) saturate(155%)}.acdHero{padding:20px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.acdHero h3{margin:4px 0;font-size:25px;letter-spacing:-.045em}.acdHero p{max-width:800px;margin:0;color:var(--muted);font-size:12px;line-height:1.6}.acdEyebrow{font-size:9px;font-weight:900;letter-spacing:.12em;color:var(--accent)}.acdActions{display:flex;gap:7px;flex-wrap:wrap}.acdBtn{min-height:40px;border:1px solid rgba(255,255,255,.82);background:rgba(255,255,255,.55);color:var(--accent2);border-radius:12px;padding:9px 13px;font-size:11px;font-weight:850;cursor:pointer}.acdBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;color:#fff}.acdBtn:disabled{opacity:.5;cursor:not-allowed}.acdMode{display:flex;gap:8px;flex-wrap:wrap;padding:7px}.acdMode button{flex:1;min-width:180px;border:1px solid rgba(255,255,255,.7);border-radius:15px;background:rgba(255,255,255,.34);padding:12px 14px;text-align:left;color:var(--ink);font-weight:850;font-size:12px;cursor:pointer}.acdMode button span{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:500;line-height:1.45}.acdMode button.active{background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(var(--accent-rgb),.13));border-color:rgba(var(--accent-rgb),.28);color:var(--accent2)}.acdFilters{padding:16px 18px}.acdFilterGrid{display:grid;grid-template-columns:1.1fr .65fr 1.7fr 1.5fr;gap:10px}.acdField label{display:block;margin:0 0 6px 2px;color:var(--muted);font-size:10px;font-weight:850}.acdField input,.acdField select{width:100%;min-height:42px;border:1px solid rgba(35,63,50,.14);border-radius:12px;background:rgba(255,255,255,.66);padding:10px 12px;color:var(--ink);font:inherit;font-size:12px;outline:none}.acdKpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.acdKpi{padding:14px 16px}.acdKpi span{color:var(--muted);font-size:10px;font-weight:850}.acdKpi strong{display:block;margin:5px 0 2px;font-size:25px;letter-spacing:-.04em}.acdKpi small{color:var(--muted);font-size:10px}.acdInfo{padding:11px 14px;border-radius:13px;background:rgba(255,255,255,.52);border:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.55}.acdInfo.warn{background:#fff7e5;color:#805c20;border-color:#f2e2ba}.acdInfo.error{background:#fff0ed;color:#9a4033;border-color:#f4d2cc}.acdTableWrap{overflow:auto;max-height:calc(100vh - 455px);border-radius:0 0 22px 22px}table.acdTable{width:100%;min-width:900px;border-collapse:separate;border-spacing:0;font-size:11px}table.acdTable th,table.acdTable td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}table.acdTable th{position:sticky;top:0;background:rgba(248,251,249,.96);font-size:9px;color:var(--muted);z-index:2}table.acdTable td{white-space:normal}table.acdTable tbody tr:hover{background:rgba(255,255,255,.45)}.acdName{font-weight:900;color:var(--accent2)}.acdSmall{margin-top:4px;color:var(--muted);font-size:9px}.acdPill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.6);border:1px solid var(--line);font-size:9px;font-weight:850;white-space:nowrap}.acdPill.green{background:var(--accent-soft);border-color:transparent;color:var(--accent2)}.acdPill.amber{background:#fff2d7;border-color:#f2dfb4;color:#7d5a1d}.acdPill.red{background:#ffebe7;border-color:#f1d2cc;color:#923e34}.acdEmpty{display:grid;place-items:center;min-height:145px;padding:22px;text-align:center;color:var(--muted);font-size:11px;line-height:1.6}.acdDrawerBack{position:fixed;inset:0;z-index:140;background:rgba(9,24,17,.3);backdrop-filter:blur(5px);display:flex;justify-content:flex-end}.acdDrawer{width:min(1000px,97vw);height:100%;display:flex;flex-direction:column;background:rgba(248,251,249,.985);box-shadow:-25px 0 70px rgba(0,0,0,.2)}.acdDrawerHead{display:flex;justify-content:space-between;gap:18px;padding:19px 22px;border-bottom:1px solid var(--line)}.acdDrawerHead h4{margin:4px 0;font-size:22px;letter-spacing:-.035em}.acdDrawerHead p{margin:0;color:var(--muted);font-size:10px;line-height:1.5}.acdClose{width:38px;height:38px;border:0;border-radius:12px;background:#e9eeeb;font-size:22px;color:var(--ink);cursor:pointer}.acdDrawerBody{flex:1;min-height:0;overflow:auto;padding:18px 22px}.acdEpisodeSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.acdMetaBox{padding:10px 12px;border:1px solid var(--line);background:rgba(255,255,255,.6);border-radius:13px;min-width:0}.acdMetaBox span{display:block;color:var(--muted);font-size:9px;font-weight:800}.acdMetaBox strong{display:block;margin-top:4px;font-size:11px;overflow-wrap:anywhere}.acdSectionTitle{margin:19px 0 8px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}.acdSectionTitle h5{margin:0;font-size:15px}.acdSectionTitle p{margin:3px 0 0;color:var(--muted);font-size:10px;line-height:1.5}.acdPhase{border:1px solid var(--line);background:rgba(255,255,255,.62);border-radius:15px;padding:13px 14px;margin:9px 0}.acdPhaseHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.acdPhaseHead strong{font-size:12px}.acdPhaseHead p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.5}.acdPhaseFields{display:grid;grid-template-columns:210px minmax(0,1fr);gap:10px;margin-top:11px}.acdPhaseFields label,.acdEditorField label{display:block;margin-bottom:5px;font-size:10px;font-weight:850;color:var(--muted)}.acdPhaseFields select,.acdPhaseFields textarea,.acdEditorField select,.acdEditorField textarea{width:100%;min-height:39px;border:1px solid rgba(35,63,50,.14);border-radius:11px;background:#fff;padding:9px 10px;font:inherit;font-size:11px;color:var(--ink)}.acdPhaseFields textarea,.acdEditorField textarea{min-height:72px;resize:vertical;line-height:1.5}.acdPhaseFields .acdComment{min-width:0}.acdCheck{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);white-space:nowrap}.acdCheck input{accent-color:var(--accent)}.acdEditorGrid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.acdEditorField{min-width:0}.acdDrawerFoot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 22px;border-top:1px solid var(--line);background:rgba(255,255,255,.87)}.acdFootNote{font-size:10px;color:var(--muted);line-height:1.45}.acdSource{display:inline-flex;margin-left:6px;font-size:9px;color:var(--muted)}@media(max-width:1100px){.acdFilterGrid{grid-template-columns:1fr 1fr}.acdFilterGrid .acdField:last-child{grid-column:1/-1}.acdEpisodeSummary{grid-template-columns:1fr 1fr}.acdPhaseFields{grid-template-columns:180px minmax(0,1fr)}}@media(max-width:760px){.acdHero{display:block}.acdActions{margin-top:10px}.acdKpis{grid-template-columns:1fr}.acdFilterGrid{grid-template-columns:1fr}.acdFilterGrid .acdField:last-child{grid-column:auto}.acdDrawer{width:100%}.acdEpisodeSummary{grid-template-columns:1fr 1fr}.acdPhaseFields{grid-template-columns:1fr}.acdEditorGrid{grid-template-columns:1fr}.acdDrawerFoot{align-items:flex-start;flex-direction:column}.acdTableWrap{max-height:calc(100vh - 560px)}}@media(max-width:480px){.acdEpisodeSummary{grid-template-columns:1fr}.acdMode button{min-width:0}}"

function objectValue(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
function textValue(...values: any[]): string {
  for (const value of values) {
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}
function norm(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function labelValue(record: Record<string, any>, labels: string[]): string {
  const keys = Object.keys(record)
  for (const label of labels) {
    const found = keys.find((key) => norm(key) === norm(label))
    if (found && record[found] != null && String(record[found]).trim() !== '') return String(record[found]).trim()
  }
  return ''
}
function isDeathOutcome(value: string): boolean {
  return /meninggal|death|deceased|died|expired|dead on arrival|\bdoa\b/.test(norm(value))
}
function safeLocalRead(): any[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(EPISODE_CACHE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
function makeDraft(source?: any): ReviewDraft {
  const input = objectValue(source)
  const incomingPhases = objectValue(input.phases)
  const phases: Record<string, PhaseReview> = {}
  PHASES.forEach((phase) => {
    const item = objectValue(incomingPhases[phase.id])
    const rawScore = item.score == null || item.score === '' ? null : Number(item.score)
    phases[phase.id] = {
      score: rawScore != null && Number.isFinite(rawScore) && rawScore >= 1 && rawScore <= 5 ? rawScore : null,
      comment: String(item.comment ?? ''),
      notApplicable: Boolean(item.notApplicable),
    }
  })
  const score = input.overall_score == null || input.overall_score === '' ? null : Number(input.overall_score)
  const issue = ['yes', 'no', 'uncertain'].includes(String(input.care_issue_identified)) ? input.care_issue_identified : ''
  const contribution = ['yes', 'no', 'uncertain', 'not_applicable'].includes(String(input.contribution_to_death)) ? input.contribution_to_death : ''
  const avoidability = input.avoidability_score == null || input.avoidability_score === '' ? null : Number(input.avoidability_score)
  return {
    background: String(input.background ?? ''),
    phases,
    overallScore: score != null && Number.isFinite(score) && score >= 1 && score <= 5 ? score : null,
    careIssue: issue,
    contribution,
    avoidabilityScore: avoidability != null && Number.isFinite(avoidability) && avoidability >= 1 && avoidability <= 6 ? avoidability : null,
    learningPoints: String(input.learning_points ?? ''),
    actions: String(input.recommended_actions ?? ''),
  }
}
function buildEpisode(row: any, roomMap: Map<number, string>): Episode {
  const core = objectValue(row.core_data ?? row.subject_json)
  const form = objectValue(core.form_fields ?? core.form_data)
  const roomId = Number(row.room_id ?? core.room_id) || null
  const admit = textValue(core.admission_at, core.admit, labelValue(form, ['Tanggal Masuk', 'Tanggal Masuk Rawat', 'Tanggal Admisi']), row.record_date)
  const discharge = textValue(core.discharge_at, core.discharge, labelValue(form, ['Tanggal Keluar', 'Tanggal Pulang', 'Tanggal Keluar Rawat']))
  const outcome = textValue(
    labelValue(form, ['Status Akhir', 'Status Pasien', 'Status Pulang', 'Kondisi Pulang', 'Cara Keluar', 'Keadaan Keluar', 'Outcome', 'Status Keluar', 'Hasil Akhir']),
    core.discharge_disposition, core.discharge_status, core.final_outcome, core.patient_outcome, core.outcome,
  )
  return {
    id: String(row.id),
    sourceKey: 'db:' + String(row.id),
    sourceRecordId: String(row.id),
    source: 'database',
    roomId,
    unit: textValue(core.unit_name, roomMap.get(Number(roomId)), 'Unit tidak diketahui'),
    name: textValue(core.patient_name, labelValue(form, ['Nama Pasien']), 'Nama belum tersedia'),
    rm: textValue(core.medical_record_no, core.rm, labelValue(form, ['No. Rekam Medis', 'No. RM'])),
    sex: textValue(core.sex, labelValue(form, ['Jenis Kelamin'])),
    age: textValue(core.age, labelValue(form, ['Umur', 'Usia'])),
    admit,
    discharge,
    caseDate: discharge || admit || String(row.record_date ?? ''),
    diagnosis: textValue(core.diagnosis, core.dx, labelValue(form, ['Diagnosa Tegak', 'Diagnosa', 'Diagnosis Medis', 'Diagnosa Pasien', 'Diagnosa IGD', 'Diagnosa Operasi'])),
    dpjp: textValue(core.dpjp, labelValue(form, ['DPJP', 'Dokter Penanggung Jawab Pelayanan'])),
    outcome,
    isDeath: isDeathOutcome(outcome),
    updatedAt: textValue(row.updated_at, row.created_at),
  }
}
function buildLocalEpisode(row: any, roomMap: Map<number, string>): Episode {
  const form = objectValue(row.formData ?? row.form_data)
  const roomId = Number(row.roomId ?? row.room_id) || null
  const admit = textValue(row.admit, row.admission_at, labelValue(form, ['Tanggal Masuk', 'Tanggal Masuk Rawat']), row.recordDate)
  const discharge = textValue(row.discharge, row.discharge_at, labelValue(form, ['Tanggal Keluar', 'Tanggal Pulang']))
  const outcome = textValue(
    row.outcome, row.dischargeDisposition, labelValue(form, ['Status Akhir', 'Status Pasien', 'Status Pulang', 'Kondisi Pulang', 'Cara Keluar', 'Keadaan Keluar', 'Outcome', 'Status Keluar', 'Hasil Akhir']),
  )
  const localId = String(row.id ?? row.recordId ?? [roomId, admit, row.rm].join(':'))
  return {
    id: localId,
    sourceKey: 'local:' + localId,
    sourceRecordId: null,
    source: 'local',
    roomId,
    unit: textValue(row.unit, roomMap.get(Number(roomId)), 'Unit tidak diketahui'),
    name: textValue(row.name, row.patient_name, labelValue(form, ['Nama Pasien']), 'Nama belum tersedia'),
    rm: textValue(row.rm, row.medical_record_no, labelValue(form, ['No. Rekam Medis', 'No. RM'])),
    sex: textValue(row.sex, labelValue(form, ['Jenis Kelamin'])),
    age: textValue(row.age, labelValue(form, ['Umur', 'Usia'])),
    admit,
    discharge,
    caseDate: discharge || admit || String(row.recordDate ?? ''),
    diagnosis: textValue(row.diagnosis, labelValue(form, ['Diagnosa Tegak', 'Diagnosa', 'Diagnosis Medis', 'Diagnosa Pasien', 'Diagnosa IGD', 'Diagnosa Operasi'])),
    dpjp: textValue(row.dpjp, labelValue(form, ['DPJP', 'Dokter Penanggung Jawab Pelayanan'])),
    outcome,
    isDeath: isDeathOutcome(outcome),
    updatedAt: textValue(row.updatedAt, row.updated_at),
  }
}
function phaseStatus(audit: AuditRow | undefined): string {
  if (!audit) return 'Belum ditelaah'
  if (audit.status === 'validated') return 'Tervalidasi'
  if (audit.status === 'submitted') return 'Menunggu telaah'
  if (audit.status === 'reopened') return 'Perlu perbaikan'
  if (audit.status === 'archived') return 'Diarsipkan'
  return 'Draf'
}
function reviewPeriod(episode: Episode): string {
  const value = episode.caseDate.slice(0, 4)
  return /^\d{4}$/.test(value) ? value : String(new Date().getFullYear())
}

export default function ClinicalDeathAuditWorkspace({ initialRoomId, rooms, isAdmin, isValidator = false }: Props) {
  const [auditType, setAuditType] = useState<AuditType>('clinical')
  const [roomFilter, setRoomFilter] = useState<number | null>(isAdmin ? null : initialRoomId ?? rooms[0]?.id ?? null)
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear())
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loadWarning, setLoadWarning] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null)
  const [activeAudit, setActiveAudit] = useState<AuditRow | null>(null)
  const [draft, setDraft] = useState<ReviewDraft>(() => makeDraft())
  const [teamStaff, setTeamStaff] = useState<StaffOption[]>([])
  const [auditStaffIds, setAuditStaffIds] = useState<Record<string, string>>({})
  const [dpjpStaffId, setDpjpStaffId] = useState('')
  const [savedDpjpStaffId, setSavedDpjpStaffId] = useState('')

  const roomMap = useMemo(() => new Map<number, string>(rooms.map((room) => [Number(room.id), room.name] as [number, string])), [rooms])
  const loadTeamStaff = useCallback(async () => {
    try {
      const { data: assignmentRows, error: assignmentError } = await q().from('staff_team_assignments')
        .select('staff_id,room_id').eq('assignment_status', 'active').eq('is_locked', true)
      if (assignmentError) throw assignmentError
      const roomByStaff = new Map<string, number>(((assignmentRows || []) as Array<{staff_id:string;room_id:number}>).map((row) => [String(row.staff_id), Number(row.room_id)]))
      const ids = Array.from(roomByStaff.keys())
      const next: StaffOption[] = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await q().from('staff_directory').select('id,employee_code,display_name,profession_group,position_title,directory_status').eq('directory_status', 'available').in('id', ids.slice(offset, offset + 100)).order('display_name')
        if (error) throw error
        next.push(...(data || []).map((row: any) => {
          const roomId = Number(roomByStaff.get(String(row.id)))
          return { ...row, id: String(row.id), room_id: roomId, room_name: roomMap.get(roomId) || '' }
        }).filter((staff: StaffOption) => staff.room_name))
      }
      setTeamStaff(next)
    } catch {
      setTeamStaff([])
    }
  }, [roomMap])

  useEffect(() => { void loadTeamStaff() }, [loadTeamStaff])
  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    setLoadWarning('')
    const readEpisodes = async () => {
      const rows: any[] = []
      let from = 0
      while (true) {
        const { data, error } = await q().from('quality_records')
          .select('id,room_id,profile_year,measurement_grain,record_date,subject_key,subject_json,core_data,status,created_at,updated_at')
          .eq('measurement_grain', 'patient_episode')
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .range(from, from + 499)
        if (error) return { data: null, error }
        rows.push(...(data ?? []))
        if ((data ?? []).length < 500) break
        from += 500
      }
      return { data: rows, error: null }
    }
    const readAudits = async () => {
      const rows: any[] = []
      let from = 0
      while (true) {
        const { data, error } = await q().from('clinical_death_audits')
          .select('*')
          .order('updated_at', { ascending: false })
          .range(from, from + 499)
        if (error) return { data: null, error }
        rows.push(...(data ?? []))
        if ((data ?? []).length < 500) break
        from += 500
      }
      return { data: rows, error: null }
    }
    const [episodeResult, auditResult] = await Promise.all([readEpisodes(), readAudits()])
    const databaseEpisodes: Episode[] = []
    if (episodeResult.error) {
      setLoadWarning('Data episode dari database belum dapat dibaca. Periksa koneksi dan hak akses; cache pada perangkat ini akan tetap diperiksa.')
    } else {
      ;(episodeResult.data ?? []).forEach((row: any) => databaseEpisodes.push(buildEpisode(row, roomMap)))
    }
    if (auditResult.error) {
      setMessage('Data telaah belum dapat dimuat: ' + auditResult.error.message)
    } else {
      const nextAudits = (auditResult.data ?? []) as AuditRow[]
      setAudits(nextAudits)
      const nextLinks: Record<string, string> = {}
      try {
        const auditIds = nextAudits.map((row) => String(row.id)).filter(Boolean)
        for (let offset = 0; offset < auditIds.length; offset += 100) {
          const { data: linkRows, error: linkError } = await q().from('staff_entity_attributions')
            .select('entity_id,staff_id,field_key').eq('entity_type', 'clinical_death_audit').eq('field_key', 'dpjp').in('entity_id', auditIds.slice(offset, offset + 100))
          if (linkError) throw linkError
          ;(linkRows || []).forEach((link: any) => { nextLinks[String(link.entity_id)] = String(link.staff_id) })
        }
        setAuditStaffIds(nextLinks)
      } catch {
        setAuditStaffIds({})
      }
    }
    const localRows = safeLocalRead().filter((row: any) => String(row.measurementGrain ?? row.measurement_grain ?? '') === 'patient_episode')
    const localEpisodes = localRows.map((row: any) => buildLocalEpisode(row, roomMap)).filter((episode) => {
      return !databaseEpisodes.some((dbEpisode) => dbEpisode.id === episode.id ||
        (dbEpisode.roomId === episode.roomId && dbEpisode.rm && episode.rm &&
          dbEpisode.rm === episode.rm && dbEpisode.admit.slice(0, 10) === episode.admit.slice(0, 10)))
    })
    setEpisodes([...databaseEpisodes, ...localEpisodes])
    setLoading(false)
  }, [roomMap])

  useEffect(() => { void load() }, [load])

  const filteredEpisodes = useMemo(() => {
    return episodes.filter((episode) => {
      if (roomFilter != null && Number(episode.roomId) !== Number(roomFilter)) return false
      if (yearFilter && episode.caseDate && episode.caseDate.slice(0, 4) && Number(episode.caseDate.slice(0, 4)) !== yearFilter) return false
      if (auditType === 'death' && !episode.isDeath) return false
      const dxTerm = norm(keyword)
      if (dxTerm && !norm(episode.diagnosis).includes(dxTerm)) return false
      const searchTerm = norm(search)
      if (searchTerm && !norm([episode.name, episode.rm, episode.diagnosis, episode.dpjp, episode.unit, episode.outcome].join(' ')).includes(searchTerm)) return false
      return true
    }).sort((a, b) => String(b.caseDate).localeCompare(String(a.caseDate)))
  }, [episodes, roomFilter, yearFilter, auditType, keyword, search])

  const existingFor = (episode: Episode): AuditRow | undefined => {
    return audits.find((audit) => audit.source_subject_key === episode.sourceKey &&
      audit.audit_type === auditType && audit.review_period === reviewPeriod(episode) && audit.status !== 'archived')
  }
  const startedCount = filteredEpisodes.filter((episode) => !!existingFor(episode)).length
  const pendingCount = filteredEpisodes.filter((episode) => {
    const audit = existingFor(episode)
    return !audit || ['draft', 'reopened'].includes(String(audit.status))
  }).length

  const openReview = (episode: Episode, audit?: AuditRow) => {
    const linkedStaffId = audit?.id ? (auditStaffIds[audit.id] || '') : ''
    setActiveEpisode(episode)
    setActiveAudit(audit ?? null)
    setDraft(makeDraft(audit?.review_json))
    setDpjpStaffId(linkedStaffId)
    setSavedDpjpStaffId(linkedStaffId)
    setMessage('')
    setEditorOpen(true)
  }
  const updatePhase = (phaseId: string, patch: Partial<PhaseReview>) => {
    setDraft((current) => ({
      ...current,
      phases: { ...current.phases, [phaseId]: { ...current.phases[phaseId], ...patch } },
    }))
  }

  const saveReview = async (nextStatus: 'draft' | 'submitted') => {
    if (isValidator) {
      setMessage('Mode baca saja: akun Validator dapat meninjau hasil, tetapi tidak mengubah penilaian klinis.')
      return
    }
    if (!activeEpisode || saving) return
    if (activeEpisode.roomId == null) {
      setMessage('Episode belum terpetakan ke unit yang valid. Telaah tidak dapat disimpan.')
      return
    }
    if (nextStatus === 'submitted' && activeEpisode.dpjp.trim() && !dpjpStaffId && !savedDpjpStaffId) {
      setMessage('Pilih identitas DPJP dari roster terkunci unit untuk menautkan nama sumber ke direktori AUREKA sebelum mengajukan telaah.')
      return
    }
    if (dpjpStaffId && dpjpStaffId !== savedDpjpStaffId && !teamStaff.some((staff) => staff.id === dpjpStaffId && Number(staff.room_id) === Number(activeEpisode.roomId))) {
      setMessage('Identitas DPJP baru harus berasal dari roster terkunci pada unit episode ini.')
      return
    }
    if (nextStatus === 'submitted') {
      if (draft.overallScore == null) {
        setMessage('Isi skor mutu pelayanan keseluruhan sebelum mengajukan telaah.')
        return
      }
      const rated = PHASES.filter((phase) => !draft.phases[phase.id]?.notApplicable && draft.phases[phase.id]?.score != null)
      if (!rated.length) {
        setMessage('Nilai setidaknya satu fase perawatan sebelum mengajukan telaah.')
        return
      }
      if (rated.some((phase) => String(draft.phases[phase.id]?.comment ?? '').trim().length < 10)) {
        setMessage('Setiap fase yang diberi skor wajib disertai alasan klinis singkat (minimal 10 karakter).')
        return
      }
      if (draft.careIssue === '') {
        setMessage('Tentukan apakah ditemukan masalah mutu pelayanan.')
        return
      }
      if (auditType === 'death' && draft.careIssue === 'yes' && draft.contribution === '') {
        setMessage('Pada audit kematian, tentukan apakah masalah pelayanan mungkin berkontribusi terhadap kematian.')
        return
      }
      if (draft.careIssue === 'yes' && String(draft.actions).trim().length < 10) {
        setMessage('Temuan masalah mutu harus disertai rencana tindak lanjut yang dapat dilaksanakan.')
        return
      }
    }
    setSaving(true)
    setMessage('')
    try {
      const { data: userData, error: userError } = await sb.auth.getUser()
      if (userError || !userData.user) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.')
      const period = reviewPeriod(activeEpisode)
      const reviewJson = {
        background: draft.background,
        phases: draft.phases,
        overall_score: draft.overallScore,
        care_issue_identified: draft.careIssue,
        contribution_to_death: auditType === 'death' ? draft.contribution : 'not_applicable',
        avoidability_score: auditType === 'death' ? draft.avoidabilityScore : null,
        learning_points: draft.learningPoints,
        recommended_actions: draft.actions,
      }
      let savedAuditId = activeAudit?.id ? String(activeAudit.id) : ''
      const payload: Record<string, any> = {
        room_id: activeEpisode.roomId,
        source_record_id: activeEpisode.sourceRecordId,
        source_subject_key: activeEpisode.sourceKey,
        audit_type: auditType,
        review_period: period,
        episode_snapshot: {
          source: activeEpisode.source,
          source_episode_id: activeEpisode.id,
          patient_name: activeEpisode.name,
          medical_record_no: activeEpisode.rm,
          sex: activeEpisode.sex,
          age: activeEpisode.age,
          admission_date: activeEpisode.admit,
          discharge_date: activeEpisode.discharge,
          diagnosis: activeEpisode.diagnosis,
          dpjp: activeEpisode.dpjp,
          unit_name: activeEpisode.unit,
          outcome: activeEpisode.outcome,
        },
        criteria_snapshot: {
          audit_type: auditType,
          review_period: period,
          room_id: roomFilter,
          unit_name: roomFilter == null ? 'Semua unit' : roomMap.get(Number(roomFilter)) ?? activeEpisode.unit,
          diagnosis_keyword: keyword.trim(),
          search_filter: search.trim(),
          selection_rule: auditType === 'death' ? 'Outcome episode secara eksplisit menunjukkan kematian' : 'Episode pasien sesuai filter audit klinis',
        },
        review_json: reviewJson,
        overall_care_score: draft.overallScore,
        care_issue_identified: draft.careIssue || null,
        contribution_to_outcome: auditType === 'death' ? draft.contribution || null : 'not_applicable',
        avoidability_score: auditType === 'death' ? draft.avoidabilityScore : null,
        status: nextStatus,
        updated_by: userData.user.id,
      }
      if (activeAudit?.id) {
        const { error } = await q().from('clinical_death_audits').update(payload).eq('id', activeAudit.id)
        if (error) throw error
      } else {
        const { data, error } = await q().from('clinical_death_audits').insert({
          ...payload,
          created_by: userData.user.id,
        }).select('*').single()
        if (error) throw error
        savedAuditId = String(data.id)
        setActiveAudit(data as AuditRow)
      }
      let identityWarning = ''
      if (savedAuditId && dpjpStaffId !== savedDpjpStaffId) {
        const { error: deleteLinkError } = await q().from('staff_entity_attributions').delete()
          .eq('entity_type', 'clinical_death_audit').eq('entity_id', savedAuditId).eq('field_key', 'dpjp')
        if (deleteLinkError) {
          identityWarning = 'Telaah tersimpan, tetapi tautan identitas DPJP tidak dapat diperbarui: ' + deleteLinkError.message
        } else if (dpjpStaffId) {
          const { error: insertLinkError } = await q().from('staff_entity_attributions').insert({
            entity_type: 'clinical_death_audit',
            entity_id: savedAuditId,
            staff_id: dpjpStaffId,
            field_key: 'dpjp',
            attribution_type: 'responsible_provider',
            created_by: userData.user.id,
            updated_by: userData.user.id,
          })
          if (insertLinkError) identityWarning = 'Telaah tersimpan, tetapi tautan identitas DPJP gagal disimpan: ' + insertLinkError.message
        }
      }
      await load()
      setEditorOpen(false)
      setActiveEpisode(null)
      setActiveAudit(null)
      setMessage(identityWarning || (nextStatus === 'submitted' ? 'Telaah diajukan dan tersimpan. Identitas DPJP tertaut pada direktori AUREKA.' : 'Draf telaah tersimpan.'))
      setDpjpStaffId('')
      setSavedDpjpStaffId('')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Kesalahan yang tidak diketahui.'
      setMessage(/duplicate key|unique constraint|clinical_death_audits_source/i.test(detail)
        ? 'Telaah untuk episode dan periode ini sudah ada. Muat ulang daftar untuk membukanya.'
        : 'Gagal menyimpan telaah: ' + detail)
    } finally {
      setSaving(false)
    }
  }

  const reviewAudit = async (audit: AuditRow, nextStatus: 'validated' | 'reopened') => {
    if ((!isValidator && !isAdmin) || saving) return
    setSaving(true)
    setMessage('')
    try {
      const { data: userData, error: userError } = await sb.auth.getUser()
      if (userError || !userData.user) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.')
      const now = new Date().toISOString()
      const { data: changed, error } = await q().from('clinical_death_audits').update({
        status: nextStatus,
        validated_by: nextStatus === 'validated' ? userData.user.id : null,
        validated_at: nextStatus === 'validated' ? now : null,
        updated_by: userData.user.id,
      }).eq('id', audit.id).eq('status', 'submitted').select('id').maybeSingle()
      if (error) throw error
      if (!changed) throw new Error('Status telaah sudah berubah. Muat ulang daftar sebelum melanjutkan.')
      await load()
      setEditorOpen(false)
      setActiveEpisode(null)
      setActiveAudit(null)
      setMessage(nextStatus === 'validated' ? 'Telaah berhasil divalidasi.' : 'Telaah dikembalikan untuk perbaikan.')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Kesalahan yang tidak diketahui.'
      setMessage('Gagal memperbarui status telaah: ' + detail)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="acd">
      <style>{CSS}</style>
      <section className="acdPanel acdHero">
        <div>
          <div className="acdEyebrow">AUREKA · QUALITY IMPROVEMENT</div>
          <h3>Audit Klinis dan Kematian</h3>
          <p>Penemuan kasus berbasis episode pasien, penilaian mutu pelayanan per fase, dan rekomendasi perbaikan. Penilaian bukan penetapan kesalahan individu atau kesimpulan otomatis bahwa kematian dapat dicegah.</p>
        </div>
        <div className="acdActions"><button type="button" className="acdBtn" disabled={loading || saving} onClick={() => void load()}>{loading ? 'Memuat…' : '↻ Muat ulang'}</button></div>
      </section>

      <div className="acdPanel acdMode" role="tablist" aria-label="Jenis audit">
        <button type="button" role="tab" aria-selected={auditType === 'clinical'} className={auditType === 'clinical' ? 'active' : ''} onClick={() => setAuditType('clinical')}>🩺 Audit klinis<span>Semua episode dalam ruang lingkup yang dipilih; gunakan kata kunci untuk topik audit tertentu.</span></button>
        <button type="button" role="tab" aria-selected={auditType === 'death'} className={auditType === 'death' ? 'active' : ''} onClick={() => setAuditType('death')}>♡ Audit kematian<span>Hanya episode dengan status akhir yang secara eksplisit menyatakan pasien meninggal.</span></button>
      </div>

      <section className="acdPanel acdFilters"><div className="acdFilterGrid">
        <div className="acdField"><label htmlFor="acd-room">Unit / instalasi</label><select id="acd-room" value={roomFilter ?? ''} disabled={!isAdmin} onChange={(event) => setRoomFilter(event.target.value ? Number(event.target.value) : null)}>{isAdmin && <option value="">Semua unit</option>}{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></div>
        <div className="acdField"><label htmlFor="acd-year">Tahun episode</label><select id="acd-year" value={yearFilter} onChange={(event) => setYearFilter(Number(event.target.value))}><option value={0}>Semua tahun</option>{[2024,2025,2026,2027,2028,2029,2030].map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
        <div className="acdField"><label htmlFor="acd-keyword">Kriteria diagnosis / topik (opsional)</label><input id="acd-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Contoh: stroke, STEMI, sepsis…" /></div>
        <div className="acdField"><label htmlFor="acd-search">Cari pasien, No. RM, DPJP atau unit</label><input id="acd-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kata kunci pencarian…" /></div>
      </div></section>

      <section className="acdKpis">
        <div className="acdPanel acdKpi"><span>Kandidat sesuai kriteria</span><strong>{filteredEpisodes.length}</strong><small>Episode yang saat ini tersedia di sumber AUREKA.</small></div>
        <div className="acdPanel acdKpi"><span>Sudah memiliki telaah</span><strong>{startedCount}</strong><small>Kasus dengan telaah aktif pada periode episode.</small></div>
        <div className="acdPanel acdKpi"><span>Belum diajukan / perlu perbaikan</span><strong>{pendingCount}</strong><small>Draf, dibuka kembali, atau belum ditelaah.</small></div>
      </section>

      <div className="acdInfo">Pemilihan kasus bersifat otomatis berdasarkan filter. Reviewer tetap wajib memeriksa kebenaran data episode dan catatan klinis sebelum memberi penilaian.</div>
      <div className="acdInfo warn">Sumber saat ini adalah logbook AUREKA dengan grain <b>patient_episode</b> dan cache pada perangkat ini. Bridging SIMRS Emesys belum diaktifkan; pasien yang belum ada dalam sumber episode tersebut belum akan muncul di daftar ini.</div>
      {loadWarning && <div className="acdInfo warn" role="status">{loadWarning}</div>}
      {message && !editorOpen && <div className="acdInfo" role="status">{message}</div>}

      <section className="acdPanel">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'15px 18px',borderBottom:'1px solid var(--line)',flexWrap:'wrap'}}>
          <div><strong style={{fontSize:15}}>Daftar kandidat audit</strong><div className="acdSmall">{auditType === 'death' ? 'Penyaringan kematian berdasarkan status akhir yang eksplisit.' : 'Penyaringan seluruh episode pasien yang tersedia dan memenuhi filter.'}</div></div>
          <span className="acdPill green">{filteredEpisodes.length} kasus</span>
        </div>
        <div className="acdTableWrap"><table className="acdTable">
          <thead><tr><th>No.</th><th>Pasien / No. RM</th><th>Diagnosis / DPJP</th><th>Unit</th><th>Admisi – keluar</th><th>Hasil akhir</th><th>Status audit</th><th>Tindakan</th></tr></thead>
          <tbody>
            {filteredEpisodes.map((episode, index) => {
              const previous = existingFor(episode)
              return <tr key={episode.sourceKey}>
                <td>{index + 1}</td>
                <td><div className="acdName">{episode.name}</div><div className="acdSmall">{episode.rm ? 'No. RM ' + episode.rm : 'No. RM belum tersedia'}</div></td>
                <td>{episode.diagnosis || 'Diagnosis belum tersedia'}<div className="acdSmall">DPJP: {episode.dpjp || 'Belum dipetakan'}</div></td>
                <td>{episode.unit}</td>
                <td>{episode.admit ? episode.admit.slice(0, 10) : '—'}<div className="acdSmall">Keluar: {episode.discharge ? episode.discharge.slice(0, 10) : 'Belum tercatat'}</div></td>
                <td>{episode.outcome || 'Belum dinyatakan'}{episode.isDeath && <div className="acdSmall"><span className="acdPill red">Kematian tercatat</span></div>}</td>
                <td><span className={'acdPill ' + (previous?.status === 'submitted' || previous?.status === 'validated' ? 'green' : previous?.status === 'reopened' ? 'amber' : '')}>{phaseStatus(previous)}</span></td>
                <td><button type="button" className="acdBtn primary" disabled={episode.roomId == null || (isValidator && (!previous || previous.status !== 'submitted'))} onClick={() => openReview(episode, previous)}>{previous ? 'Buka telaah' : 'Mulai telaah'}</button><span className="acdSource">{episode.source === 'local' ? 'Cache perangkat' : 'Database'}</span></td>
              </tr>
            })}
            {!filteredEpisodes.length && <tr><td colSpan={8}><div className="acdEmpty">{loading ? 'Memuat episode pasien…' : auditType === 'death' ? 'Tidak ditemukan episode dengan hasil akhir kematian yang eksplisit pada sumber dan filter ini. Pastikan status hasil akhir sudah tercatat; diagnosis atau status logbook tidak digunakan sebagai pengganti status kematian.' : 'Belum ada episode pasien yang sesuai. Pastikan catatan logbook menggunakan measurement grain patient_episode atau tunggu sumber episode SIMRS terhubung.'}</div></td></tr>}
          </tbody>
        </table></div>
      </section>

      {editorOpen && activeEpisode && <div className="acdDrawerBack" onClick={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false) }}>
        <section className="acdDrawer" role="dialog" aria-modal="true" aria-label={'Telaah kasus ' + activeEpisode.name}>
          <div className="acdDrawerHead"><div><div className="acdEyebrow">{auditType === 'death' ? 'STRUCTURED MORTALITY REVIEW' : 'STRUCTURED CLINICAL AUDIT'}</div><h4>{auditType === 'death' ? 'Telaah Kematian' : 'Telaah Klinis'}</h4><p>{activeEpisode.name} · {activeEpisode.rm ? 'No. RM ' + activeEpisode.rm + ' · ' : ''}{activeEpisode.unit} · Periode {reviewPeriod(activeEpisode)}</p></div><button type="button" className="acdClose" aria-label="Tutup telaah" disabled={saving} onClick={() => setEditorOpen(false)}>×</button></div>
          <div className="acdDrawerBody">
            <div className="acdEpisodeSummary">
              <div className="acdMetaBox"><span>Diagnosis</span><strong>{activeEpisode.diagnosis || 'Belum tersedia'}</strong></div>
              <div className="acdMetaBox"><span>DPJP</span><strong>{activeEpisode.dpjp || 'Belum dipetakan'}</strong></div>
              <div className="acdMetaBox"><span>Admisi</span><strong>{activeEpisode.admit || 'Belum tersedia'}</strong></div>
              <div className="acdMetaBox"><span>Keluar / hasil akhir</span><strong>{activeEpisode.discharge || activeEpisode.outcome || 'Belum tersedia'}</strong></div>
            </div>
            <div className="acdEditorField">
              <label htmlFor="acd-dpjp-staff">DPJP · Identitas direktori AUREKA</label>
              <select id="acd-dpjp-staff" value={dpjpStaffId} disabled={isValidator || saving} onChange={(event) => setDpjpStaffId(event.target.value)}>
                <option value="">Pilih identitas DPJP dari roster unit…</option>
                {teamStaff.filter((staff) => Number(staff.room_id) === Number(activeEpisode.roomId) && (/dokter/i.test(staff.profession_group) || /dokter/i.test(staff.position_title))).map((staff) => <option key={staff.id} value={staff.id}>{staff.display_name} — {staff.employee_code}</option>)}
              </select>
              <div className="acdSmall">Nama DPJP pada sumber episode: {activeEpisode.dpjp || 'Belum dipetakan'}. Pilih identitas yang benar-benar sesuai dengan sumber; nama snapshot tidak diubah.</div>
              {dpjpStaffId && <div className="acdSmall">ID tenaga AUREKA: {dpjpStaffId.slice(0,8).toUpperCase()} · identitas akan disimpan terpisah dari snapshot klinis.</div>}
            </div>
            <div className="acdSectionTitle"><div><h5>Ringkasan klinis</h5><p>Tulis ringkasan faktual dan relevan dari rekam medis; jangan menyalin seluruh catatan.</p></div></div>
            <div className="acdEditorField"><label htmlFor="acd-background">Riwayat singkat, perjalanan klinis dan konteks kasus</label><textarea id="acd-background" disabled={isValidator} value={draft.background} onChange={(event) => setDraft((current) => ({...current, background: event.target.value}))} placeholder="Keluhan awal, komorbiditas relevan, perubahan kondisi, intervensi penting, dan hasil akhir…" /></div>

            <div className="acdSectionTitle"><div><h5>Penilaian mutu per fase perawatan</h5><p>Skala penilaian internal AUREKA (1–5), bukan skor SJR resmi: 1 sangat buruk, 2 buruk, 3 adekuat, 4 baik, 5 sangat baik. Setiap skor harus disertai alasan klinis.</p></div></div>
            {PHASES.map((phase) => {
              const entry = draft.phases[phase.id] ?? {score:null,comment:'',notApplicable:false}
              return <article className="acdPhase" key={phase.id}>
                <div className="acdPhaseHead"><div><strong>{phase.label}</strong><p>{phase.hint}</p></div><label className="acdCheck"><input type="checkbox" disabled={isValidator} checked={entry.notApplicable} onChange={(event) => updatePhase(phase.id, {notApplicable:event.target.checked,score:event.target.checked ? null : entry.score})} /> Tidak relevan</label></div>
                {!entry.notApplicable && <div className="acdPhaseFields">
                  <div><label htmlFor={'acd-score-' + phase.id}>Skor mutu pelayanan</label><select id={'acd-score-' + phase.id} disabled={isValidator} value={entry.score ?? ''} onChange={(event) => updatePhase(phase.id, {score:event.target.value ? Number(event.target.value) : null})}><option value="">Belum dinilai</option>{CARE_SCORES.map((score) => <option key={score.value} value={score.value}>{score.label}</option>)}</select></div>
                  <div className="acdComment"><label htmlFor={'acd-comment-' + phase.id}>Komentar penilaian / bukti dari rekam medis</label><textarea id={'acd-comment-' + phase.id} disabled={isValidator} value={entry.comment} onChange={(event) => updatePhase(phase.id, {comment:event.target.value})} placeholder="Jelaskan apa yang berjalan baik, kesenjangan yang ditemukan, dan dasar pertimbangannya…" /></div>
                </div>}
              </article>
            })}

            <div className="acdSectionTitle"><div><h5>Kesimpulan reviewer</h5><p>Skor keseluruhan adalah penilaian profesional yang harus konsisten dengan komentar pada fase perawatan.</p></div></div>
            <div className="acdEditorGrid">
              <div className="acdEditorField"><label htmlFor="acd-overall">Skor mutu pelayanan keseluruhan</label><select id="acd-overall" disabled={isValidator} value={draft.overallScore ?? ''} onChange={(event) => setDraft((current) => ({...current, overallScore:event.target.value ? Number(event.target.value) : null}))}><option value="">Belum dinilai</option>{CARE_SCORES.map((score) => <option key={score.value} value={score.value}>{score.label}</option>)}</select></div>
              <div className="acdEditorField"><label htmlFor="acd-issue">Ditemukan masalah mutu pelayanan?</label><select id="acd-issue" disabled={isValidator} value={draft.careIssue} onChange={(event) => setDraft((current) => ({...current,careIssue:event.target.value as ReviewDraft['careIssue']}))}><option value="">Pilih kesimpulan</option><option value="yes">Ya, perlu ditindaklanjuti</option><option value="no">Tidak ditemukan masalah</option><option value="uncertain">Belum dapat disimpulkan</option></select></div>
              {auditType === 'death' && <>
                <div className="acdEditorField"><label htmlFor="acd-contribution">Kemungkinan kontribusi masalah terhadap kematian</label><select id="acd-contribution" disabled={isValidator} value={draft.contribution} onChange={(event) => setDraft((current) => ({...current,contribution:event.target.value as ReviewDraft['contribution']}))}><option value="">Belum dinilai</option><option value="yes">Ada indikasi kontribusi</option><option value="no">Tidak teridentifikasi kontribusi</option><option value="uncertain">Belum dapat dipastikan</option><option value="not_applicable">Tidak dapat dinilai / tidak relevan</option></select></div>
                <div className="acdEditorField"><label htmlFor="acd-avoidability">Penilaian keterhindaran kematian (opsional)</label><select id="acd-avoidability" disabled={isValidator} value={draft.avoidabilityScore ?? ''} onChange={(event) => setDraft((current) => ({...current,avoidabilityScore:event.target.value ? Number(event.target.value) : null}))}><option value="">Belum dinilai</option>{AVOIDABILITY.map((score) => <option key={score.value} value={score.value}>{score.label}</option>)}</select></div>
              </>}
              <div className="acdEditorField"><label htmlFor="acd-learning">Pelajaran / peluang perbaikan</label><textarea id="acd-learning" disabled={isValidator} value={draft.learningPoints} onChange={(event) => setDraft((current) => ({...current,learningPoints:event.target.value}))} placeholder="Apa yang perlu dipertahankan atau diperbaiki oleh tim / sistem?" /></div>
              <div className="acdEditorField"><label htmlFor="acd-actions">Rekomendasi atau rencana tindak lanjut</label><textarea id="acd-actions" disabled={isValidator} value={draft.actions} onChange={(event) => setDraft((current) => ({...current,actions:event.target.value}))} placeholder="Tindakan konkret, penanggung jawab, tenggat, serta ukuran keberhasilan bila tersedia." /></div>
            </div>
            {message && <div className="acdInfo error" role="alert" style={{marginTop:12}}>{message}</div>}
            <div className="acdInfo" style={{marginTop:12}}>Jika ditemukan masalah kompleks atau serius, telaah ini dapat diteruskan ke analisis sistem / RCA sesuai kriteria eskalasi rumah sakit. Formulir ini tidak otomatis menjalankan RCA dan tidak menyimpulkan keterhindaran kematian.</div>
          </div>
          <div className="acdDrawerFoot"><span className="acdFootNote">{isValidator ? 'Mode baca saja — periksa telaah yang diajukan sebelum memvalidasi atau mengembalikannya.' : 'Simpan sebagai draf untuk dilanjutkan, atau ajukan setelah penilaian dan bukti memadai.'}</span><div className="acdActions"><button type="button" className="acdBtn" disabled={saving} onClick={() => setEditorOpen(false)}>Tutup</button>{(isValidator || isAdmin) && activeAudit?.status === 'submitted' && <><button type="button" className="acdBtn" disabled={saving} onClick={() => void reviewAudit(activeAudit, 'reopened')}>Kembalikan</button><button type="button" className="acdBtn primary" disabled={saving} onClick={() => void reviewAudit(activeAudit, 'validated')}>Validasi telaah</button></>}{!isValidator && <><button type="button" className="acdBtn" disabled={saving} onClick={() => void saveReview('draft')}>{saving ? 'Menyimpan…' : 'Simpan draf'}</button><button type="button" className="acdBtn primary" disabled={saving} onClick={() => void saveReview('submitted')}>{saving ? 'Menyimpan…' : 'Ajukan telaah'}</button></>}</div></div>
        </section>
      </div>}
    </div>
  )
}
