'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

type Room = { id: number; name: string }
type RiskLevel = 'Sangat Rendah' | 'Rendah' | 'Sedang' | 'Tinggi' | 'Sangat Tinggi'
type RiskStatus = 'Open' | 'In Progress' | 'Controlled' | 'Accepted'
type RiskRow = {
  id: string; risk_code: string; unit_id: number | null; unit_name: string; category: string
  objective: string; risk_event: string; causes: string; impacts: string; existing_controls: string
  likelihood: number; impact: number; risk_score: number; risk_level: RiskLevel
  residual_likelihood: number | null; residual_impact: number | null; residual_score: number | null
  residual_level: RiskLevel | null; owner_name: string; due_date: string | null; status: RiskStatus
  created_by: string; created_at: string; updated_at: string
  source_sheet?: string | null; source_row_number?: number | null; source_record_no?: string | null
  source_risk_code?: string | null; source_risk_score?: number | null; source_risk_level?: string | null
  source_category_missing?: boolean; is_priority?: boolean; priority_rank?: number | null
}
type RiskForm = {
  risk_code: string; unit_id: string; category: string; objective: string; risk_event: string
  causes: string; impacts: string; existing_controls: string; likelihood: string; impact: string
  residual_likelihood: string; residual_impact: string; owner_name: string; due_date: string; status: RiskStatus
}
type FmeaRow = {
  id: string; risk_register_id: string | null; fmea_code: string; unit_name: string; process_name: string
  failure_mode: string; failure_effect: string; causes: string; existing_controls: string
  severity: number; occurrence: number; detection: number; rpn: number
  priority: 'Rendah' | 'Sedang' | 'Tinggi'; action_plan: string; owner_name: string
  target_date: string | null; status: string; created_by: string
}
type PlanRow = {
  id: string; plan_code: string; title: string; objective: string; action_plan: string
  expected_output: string; owner_name: string; owner_room_id: number | null; target_date: string | null
  target_likelihood: number | null; target_impact: number | null; status: string
  created_by: string; created_at: string; updated_at: string
}
type PlanRiskRow = { id: string; plan_id: string; risk_id: string; target_likelihood: number | null; target_impact: number | null }
type LinkRow = {
  id: string; source_risk_id: string; target_risk_id: string; relationship_type: string
  description: string; created_by: string; created_at: string
}
type WorkflowEvent = { id: string; plan_id: string; from_status: string; to_status: string; action: string; note: string; actor_name: string; created_at: string }

const MATRIX: Record<number, Record<number, number>> = {
  5: { 1: 8, 2: 14, 3: 17, 4: 23, 5: 25 },
  4: { 1: 5, 2: 10, 3: 16, 4: 19, 5: 24 },
  3: { 1: 4, 2: 9, 3: 13, 4: 18, 5: 22 },
  2: { 1: 2, 2: 7, 3: 11, 4: 15, 5: 21 },
  1: { 1: 1, 2: 3, 3: 6, 4: 12, 5: 20 },
}
const IMPACT_LABELS = ['Tidak signifikan', 'Kecil', 'Sedang', 'Besar', 'Katastropik']
const LIKELIHOOD_LABELS = ['Jarang', 'Kemungkinan kecil', 'Kemungkinan sedang', 'Kemungkinan besar', 'Hampir pasti terjadi']
const CATEGORIES = ['Klinis', 'Non-Klinis', 'Operasional', 'Finansial', 'K3RS', 'Keselamatan Pasien', 'Kepatuhan Regulasi', 'Fasilitas Rumah Sakit', 'Infeksius', 'Legalitas Hukum', 'Kerugian Keuangan', 'Reputasi', 'Fraud/Kecurangan', 'Lainnya']
const LEVELS: RiskLevel[] = ['Sangat Rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi']
const RELATION_TYPES = [
  { value: 'shared_cause', label: 'Penyebab bersama' },
  { value: 'shared_control', label: 'Pengendalian bersama' },
  { value: 'upstream_dependency', label: 'Risiko hulu / prasyarat' },
  { value: 'downstream_effect', label: 'Risiko hilir / dampak lanjutan' },
  { value: 'reinforcing', label: 'Saling memperkuat' },
  { value: 'duplicate', label: 'Potensi duplikasi' },
]
const PLAN_STATUS: Record<string, string> = {
  draft: 'Draft unit', pending_kabid: 'Menunggu Kabid', pending_director: 'Menunggu Direktur',
  pending_board: 'Menunggu Dewan Pengawas', approved: 'Disetujui', in_progress: 'Dalam pelaksanaan',
  evaluated: 'Menunggu penutupan', closed: 'Selesai', returned_unit: 'Revisi unit',
  returned_kabid: 'Revisi setelah Kabid', returned_director: 'Revisi setelah Direktur',
}
const emptyRiskForm = (roomId: number | null): RiskForm => ({
  risk_code: '', unit_id: roomId == null ? '' : String(roomId), category: 'Operasional',
  objective: '', risk_event: '', causes: '', impacts: '', existing_controls: '',
  likelihood: '3', impact: '3', residual_likelihood: '', residual_impact: '',
  owner_name: '', due_date: '', status: 'Open',
})
const emptyFmea = (roomName: string): Partial<FmeaRow> => ({
  risk_register_id: null, unit_name: roomName, process_name: '', failure_mode: '',
  failure_effect: '', causes: '', existing_controls: '', severity: 3, occurrence: 3,
  detection: 3, action_plan: '', owner_name: '', target_date: '', status: 'Open',
})
const levelFor = (score: number): RiskLevel => score >= 20 ? 'Sangat Tinggi' : score >= 15 ? 'Tinggi' : score >= 10 ? 'Sedang' : score >= 5 ? 'Rendah' : 'Sangat Rendah'
const riskScore = (likelihood: number, impact: number) => MATRIX[likelihood]?.[impact] ?? 1
const scoreBand = (level: string) => level === 'Sangat Tinggi' ? 'very-high' : level === 'Tinggi' ? 'high' : level === 'Sedang' ? 'moderate' : level === 'Rendah' ? 'low' : 'very-low'
const fmeaPriority = (severity: number, rpn: number) => severity >= 4 || rpn >= 30 ? 'Tinggi' : rpn >= 15 ? 'Sedang' : 'Rendah'
const fmtDate = (value?: string | null) => value ? new Date(value + (value.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const sourceUnitLabel = (risk: Pick<RiskRow, 'unit_name'>) => risk.unit_name?.trim() || '[Tanpa nama unit]'
const CONNECTOR_STOP_WORDS = new Set(['adalah', 'agar', 'akan', 'atau', 'bahwa', 'belum', 'bisa', 'dalam', 'dan', 'dapat', 'dari', 'dengan', 'dilakukan', 'diperlukan', 'guna', 'hingga', 'hanya', 'harus', 'jika', 'juga', 'karena', 'kedua', 'ketika', 'kondisi', 'kurang', 'lebih', 'melalui', 'menjadi', 'menyebabkan', 'meningkat', 'mungkin', 'pada', 'paling', 'para', 'perlu', 'saat', 'salah', 'sama', 'sebagai', 'sehingga', 'selama', 'sering', 'setiap', 'sudah', 'tanpa', 'terhadap', 'terjadi', 'terkait', 'terlalu', 'tidak', 'untuk', 'yang', 'unit', 'rumah', 'sakit', 'pelayanan', 'risiko', 'resiko', 'pasien', 'petugas', 'pegawai', 'tenaga'])
const riskTokens = (value: unknown) => new Set(String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !CONNECTOR_STOP_WORDS.has(token)))
const fetchAllPages = async (buildQuery: (from: number, to: number) => any) => {
  const allRows: any[] = []
  const batchSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + batchSize - 1)
    if (error) return { data: null, error }
    const batch = (data || []) as any[]
    allRows.push(...batch)
    if (batch.length < batchSize) break
    from += batchSize
  }
  return { data: allRows, error: null }
}
const escapeCsv = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
// Form ditampilkan sebagai jendela di atas halaman agar tidak perlu scroll ke bawah tabel.
// Sengaja tidak menutup saat klik di luar / tombol Esc supaya isian tidak hilang tanpa sengaja.
function RmModal({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="rmModalBackdrop" role="dialog" aria-modal="true" aria-label={label}>
      <div className="rmModalSheet">
        {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
        {children}
      </div>
    </div>
  )
}

const roleLabel = (role: string | null) => ({
  ADMIN: 'Super Admin', PIC: 'PIC Unit', PMKP: 'Komite PMKP', MANAGEMENT: 'Manajemen',
  KABID: 'Kepala Bidang', DIREKTUR: 'Direktur', DEWAN_PENGAWAS: 'Dewan Pengawas',
}[role || ''] || role || 'Pengguna')

export default function RiskManagementWorkspace({
  supabase, rooms, initialRoomId, role, userId, userName,
}: {
  supabase: SupabaseClient
  rooms: Room[]
  initialRoomId: number | null
  role: string | null
  userId: string
  userName: string
}) {
  const db = useMemo(() => (supabase as any).schema('aureka_risk'), [supabase])
  const [tab, setTab] = useState<'overview' | 'register' | 'mitigation' | 'connections' | 'fmea'>('overview')
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [planRisks, setPlanRisks] = useState<PlanRiskRow[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [fmeas, setFmeas] = useState<FmeaRow[]>([])
  const [events, setEvents] = useState<WorkflowEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [matrixFilter, setMatrixFilter] = useState<{ likelihood: number; impact: number } | null>(null)
  const [page, setPage] = useState(0)
  const [selectedRiskId, setSelectedRiskId] = useState('')
  const [selectedRiskIds, setSelectedRiskIds] = useState<string[]>([])
  const [riskEditorOpen, setRiskEditorOpen] = useState(false)
  const [editingRiskId, setEditingRiskId] = useState('')
  const [riskForm, setRiskForm] = useState<RiskForm>(() => emptyRiskForm(initialRoomId))
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const [planForm, setPlanForm] = useState({
    title: '', objective: '', action_plan: '', expected_output: '', owner_name: userName,
    target_date: '', target_likelihood: '2', target_impact: '2',
  })
  const [decisionNote, setDecisionNote] = useState('')
  const [linkForm, setLinkForm] = useState({ source: '', target: '', type: 'shared_cause', description: '' })
  const [fmeaEditorOpen, setFmeaEditorOpen] = useState(false)
  const [editingFmeaId, setEditingFmeaId] = useState('')
  const [fmeaForm, setFmeaForm] = useState<Partial<FmeaRow>>(() => emptyFmea(rooms.find(r => r.id === initialRoomId)?.name || ''))
  const [registerDetailExpanded, setRegisterDetailExpanded] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ kind: 'delete-risk' | 'delete-link' | 'delete-fmea'; id: string } | null>(null)

  const roleCode = role || ''
  const privilegedRoles = ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS']
  const canManageAll = privilegedRoles.includes(roleCode)
  const currentRoom = rooms.find(r => r.id === initialRoomId)
  // PIC/unit users only see their own unit's register; managers see the whole hospital.
  const scopedToUnit = !canManageAll
  const unitMissing = scopedToUnit && initialRoomId == null
  const belongsToMyUnit = useCallback((risk: Pick<RiskRow, 'unit_id' | 'unit_name'>) =>
    initialRoomId != null && (risk.unit_id === initialRoomId ||
      (risk.unit_id == null && !!currentRoom?.name && risk.unit_name?.trim().toLowerCase() === currentRoom.name.trim().toLowerCase())),
  [initialRoomId, currentRoom?.name])
  const activeRisk = risks.find(r => r.id === selectedRiskId) || null
  const activePlan = plans.find(p => p.id === selectedPlanId) || null
  const activeFmea = fmeas.find(f => f.id === editingFmeaId) || null
  const canEditRisk = (risk: RiskRow) => canManageAll || risk.unit_id === initialRoomId
  const canEditPlan = (plan: PlanRow) => plan.created_by === undefined ? false : plan.created_by.length > 0 && (plan.owner_room_id === initialRoomId || canManageAll)
  const isWorkflowOwner = (plan: PlanRow) => plan.created_by !== '' && (plan.created_by === undefined ? false : plan.owner_room_id === initialRoomId || canManageAll)
  const unitOptions = useMemo(() => rooms.length ? rooms : [], [rooms])
  const sourceUnitOptions = useMemo(() => Array.from(new Set(risks.map(sourceUnitLabel))).sort((a, b) => a.localeCompare(b, 'id')), [risks])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const queries = await Promise.all([
      fetchAllPages((from, to) => db.from('risk_register').select('*').order('risk_score', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => db.from('mitigation_plans').select('*').order('updated_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => db.from('mitigation_plan_risks').select('*').order('id', { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => db.from('risk_relationships').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => db.from('fmea_analyses').select('*').order('rpn', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => db.from('risk_workflow_events').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    ])
    const firstError = queries.find(q => q.error)
    if (firstError?.error) {
      setError('Data Manajemen Risiko belum dapat dimuat. Pastikan migration Manajemen Risiko sudah diterapkan pada Supabase. Detail: ' + firstError.error.message)
    } else {
      let incomingRisks = (queries[0].data || []) as RiskRow[]
      let incomingPlans = (queries[1].data || []) as PlanRow[]
      let incomingPlanRisks = (queries[2].data || []) as PlanRiskRow[]
      let incomingLinks = (queries[3].data || []) as LinkRow[]
      let incomingFmeas = (queries[4].data || []) as FmeaRow[]
      let incomingEvents = (queries[5].data || []) as WorkflowEvent[]
      if (scopedToUnit) {
        incomingRisks = incomingRisks.filter(belongsToMyUnit)
        const myRiskIds = new Set(incomingRisks.map(r => r.id))
        const linkedPlanIds = new Set(incomingPlanRisks.filter(pr => myRiskIds.has(pr.risk_id)).map(pr => pr.plan_id))
        incomingPlans = incomingPlans.filter(p => (initialRoomId != null && p.owner_room_id === initialRoomId) || linkedPlanIds.has(p.id))
        const myPlanIds = new Set(incomingPlans.map(p => p.id))
        incomingPlanRisks = incomingPlanRisks.filter(pr => myPlanIds.has(pr.plan_id))
        incomingLinks = incomingLinks.filter(l => myRiskIds.has(l.source_risk_id) || myRiskIds.has(l.target_risk_id))
        incomingFmeas = incomingFmeas.filter(f => (f.risk_register_id && myRiskIds.has(f.risk_register_id)) ||
          (!!currentRoom?.name && f.unit_name?.trim().toLowerCase() === currentRoom.name.trim().toLowerCase()))
        incomingEvents = incomingEvents.filter(e => myPlanIds.has(e.plan_id))
      }
      setRisks(incomingRisks)
      setUnitFilter(current => {
        if (scopedToUnit) return currentRoom?.name || (incomingRisks.length ? sourceUnitLabel(incomingRisks[0]) : '')
        if (current && current !== 'all' && incomingRisks.some(risk => sourceUnitLabel(risk) === current)) return current
        if (currentRoom?.name && incomingRisks.some(risk => sourceUnitLabel(risk) === currentRoom.name)) return currentRoom.name
        return incomingRisks.length ? sourceUnitLabel(incomingRisks[0]) : ''
      })
      setPlans(incomingPlans)
      setPlanRisks(incomingPlanRisks)
      setLinks(incomingLinks)
      setFmeas(incomingFmeas)
      setEvents(incomingEvents)
      setSelectedRiskId(current => incomingRisks.some(r => r.id === current) ? current : (incomingRisks[0]?.id || ''))
      setSelectedPlanId(current => incomingPlans.some(p => p.id === current) ? current : (incomingPlans[0]?.id || ''))
    }
    setLoading(false)
  }, [db, currentRoom?.name, scopedToUnit, belongsToMyUnit, initialRoomId])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    setRiskForm(current => current.unit_id ? current : { ...current, unit_id: initialRoomId == null ? '' : String(initialRoomId) })
    setFmeaForm(current => ({ ...current, unit_name: current.unit_name || currentRoom?.name || '' }))
    setPlanForm(current => ({ ...current, owner_name: current.owner_name || userName }))
  }, [initialRoomId, currentRoom?.name, userName])

  const filteredRisks = useMemo(() => risks.filter(risk => {
    const q = search.trim().toLowerCase()
    const matchesText = !q || [risk.risk_code, risk.risk_event, risk.unit_name, risk.causes, risk.category].join(' ').toLowerCase().includes(q)
    return matchesText && (unitFilter === 'all' || sourceUnitLabel(risk) === unitFilter) &&
      (levelFilter === 'all' || risk.risk_level === levelFilter) &&
      (categoryFilter === 'all' || risk.category === categoryFilter) &&
      (statusFilter === 'all' || risk.status === statusFilter) &&
      (!matrixFilter || (risk.likelihood === matrixFilter.likelihood && risk.impact === matrixFilter.impact))
  }), [risks, search, unitFilter, levelFilter, categoryFilter, statusFilter, matrixFilter])
  const pageSize = 15
  const pageCount = Math.max(1, Math.ceil(filteredRisks.length / pageSize))
  const pageRisks = filteredRisks.slice(page * pageSize, (page + 1) * pageSize)
  useEffect(() => { if (page >= pageCount) setPage(Math.max(0, pageCount - 1)) }, [page, pageCount])

  const counts = useMemo(() => ({
    total: risks.length,
    high: risks.filter(r => r.risk_level === 'Tinggi' || r.risk_level === 'Sangat Tinggi').length,
    needsMitigation: risks.filter(r => ['Sedang', 'Tinggi', 'Sangat Tinggi'].includes(r.risk_level)).length,
    accepted: risks.filter(r => ['Sangat Rendah', 'Rendah'].includes(r.risk_level)).length,
    residualComplete: risks.filter(r => r.residual_score !== null && r.residual_score !== undefined).length,
    overdue: risks.filter(r => r.due_date && new Date(r.due_date + 'T23:59:59') < new Date() && r.status !== 'Controlled' && r.status !== 'Accepted').length,
    sourceScoreDiff: risks.filter(r => r.source_risk_score != null && r.source_risk_score !== r.risk_score).length,
    unitUnmapped: risks.filter(r => r.unit_id == null).length,
    sourceCategoryMissing: risks.filter(r => r.source_category_missing === true).length,
  }), [risks])
  const selectedForPlan = useMemo(() => risks.filter(r => selectedRiskIds.includes(r.id)), [risks, selectedRiskIds])
  const activePlanRisks = useMemo(() => {
    if (!activePlan) return []
    return planRisks.filter(pr => pr.plan_id === activePlan.id).map(pr => ({ ...pr, risk: risks.find(r => r.id === pr.risk_id) })).filter(x => x.risk)
  }, [activePlan, planRisks, risks])
  const activeEvents = useMemo(() => activePlan ? events.filter(e => e.plan_id === activePlan.id) : [], [activePlan, events])
  const activeLinks = useMemo(() => links.filter(l => l.source_risk_id === selectedRiskId || l.target_risk_id === selectedRiskId), [links, selectedRiskId])
  const primaryRisksInUnit = useMemo(() => risks.filter(risk => risk.risk_level === 'Sangat Tinggi' && (unitFilter === 'all' || sourceUnitLabel(risk) === unitFilter)), [risks, unitFilter])
  useEffect(() => {
    setLinkForm(current => {
      if (primaryRisksInUnit.some(risk => risk.id === current.source)) return current
      const next = primaryRisksInUnit[0]
      return { ...current, source: next?.id || '', target: next && current.target === next.id ? '' : current.target }
    })
  }, [primaryRisksInUnit])
  const connectorPrimary = primaryRisksInUnit.find(risk => risk.id === linkForm.source) || primaryRisksInUnit[0] || null
  const visibleLinks = useMemo(() => links.filter(link => {
    const source = risks.find(risk => risk.id === link.source_risk_id)
    return !!source && source.risk_level === 'Sangat Tinggi' && (unitFilter === 'all' || sourceUnitLabel(source) === unitFilter)
  }), [links, risks, unitFilter])
  const relatedRiskIds = useMemo(() => {
    if (!connectorPrimary) return []
    const ids = new Set<string>([connectorPrimary.id])
    visibleLinks.filter(link => link.source_risk_id === connectorPrimary.id || link.target_risk_id === connectorPrimary.id).forEach(link => {
      ids.add(link.source_risk_id); ids.add(link.target_risk_id)
    })
    return Array.from(ids)
  }, [connectorPrimary, visibleLinks])
  const connectorSuggestions = useMemo(() => {
    if (!connectorPrimary || risks.length < 2) return []
    const documentFrequency = new Map<string, number>()
    risks.forEach(risk => {
      const tokens = new Set([...riskTokens(risk.risk_event), ...riskTokens(risk.causes), ...riskTokens(risk.impacts), ...riskTokens(risk.existing_controls), ...riskTokens(risk.objective), ...riskTokens(risk.category)])
      tokens.forEach(token => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1))
    })
    const idf = (token: string) => Math.log(1 + risks.length / (1 + (documentFrequency.get(token) || 0))) + 0.25
    const fieldGroups = [
      { key: 'event', label: 'peristiwa risiko', weight: 4 },
      { key: 'causes', label: 'penyebab', weight: 3 },
      { key: 'impacts', label: 'dampak', weight: 3 },
      { key: 'controls', label: 'pengendalian', weight: 2 },
      { key: 'objective', label: 'sasaran/kategori', weight: 1.25 },
    ] as const
    const readField = (risk: RiskRow, key: typeof fieldGroups[number]['key']) => key === 'event' ? risk.risk_event : key === 'causes' ? risk.causes : key === 'impacts' ? risk.impacts : key === 'controls' ? risk.existing_controls : [risk.objective, risk.category].filter(Boolean).join(' ')
    return risks.filter(target => target.id !== connectorPrimary.id && !links.some(link => (link.source_risk_id === connectorPrimary.id && link.target_risk_id === target.id) || (link.source_risk_id === target.id && link.target_risk_id === connectorPrimary.id))).map(target => {
      let weightedScore = 0
      let denominator = 0
      const evidence: string[] = []
      const sharedTokens = new Set<string>()
      fieldGroups.forEach(group => {
        const sourceTokens = riskTokens(readField(connectorPrimary, group.key))
        const targetTokens = riskTokens(readField(target, group.key))
        if (!sourceTokens.size || !targetTokens.size) return
        denominator += group.weight
        const overlap = Array.from(sourceTokens).filter(token => targetTokens.has(token))
        if (!overlap.length) return
        const overlapMass = overlap.reduce((sum, token) => sum + idf(token), 0)
        const sourceMass = Array.from(sourceTokens).reduce((sum, token) => sum + idf(token), 0)
        const targetMass = Array.from(targetTokens).reduce((sum, token) => sum + idf(token), 0)
        const normalizer = Math.max(0.01, Math.min(sourceMass, targetMass))
        weightedScore += group.weight * Math.min(1, overlapMass / normalizer)
        evidence.push(group.label)
        overlap.forEach(token => sharedTokens.add(token))
      })
      const score = denominator ? Math.round(weightedScore / denominator * 100) : 0
      const matchWords = Array.from(sharedTokens).sort((a, b) => idf(b) - idf(a)).slice(0, 6)
      const recommendedType = evidence.includes('penyebab') ? 'shared_cause' : evidence.includes('pengendalian') ? 'shared_control' : evidence.includes('dampak') && evidence.includes('peristiwa risiko') ? 'downstream_effect' : 'reinforcing'
      return { risk: target, score, evidence, matchWords, recommendedType }
    }).filter(item => item.score >= 15 && item.matchWords.length >= 2).sort((a, b) => b.score - a.score).slice(0, 8)
  }, [connectorPrimary, risks, links])
  const highCountForCell = (p: number, d: number) => risks.filter(r => r.likelihood === p && r.impact === d).length

  const clearMessages = () => { setMessage(''); setError('') }
  const openNewRisk = () => {
    setEditingRiskId('')
    setRiskForm(emptyRiskForm(initialRoomId))
    setRiskEditorOpen(true)
    setTab('register')
    clearMessages()
  }
  const openRiskEditor = (risk: RiskRow) => {
    setEditingRiskId(risk.id)
    setSelectedRiskId(risk.id)
    setRiskForm({
      risk_code: risk.risk_code || '', unit_id: risk.unit_id == null ? '' : String(risk.unit_id),
      category: risk.category || 'Operasional', objective: risk.objective || '', risk_event: risk.risk_event || '',
      causes: risk.causes || '', impacts: risk.impacts || '', existing_controls: risk.existing_controls || '',
      likelihood: String(risk.likelihood), impact: String(risk.impact),
      residual_likelihood: risk.residual_likelihood == null ? '' : String(risk.residual_likelihood),
      residual_impact: risk.residual_impact == null ? '' : String(risk.residual_impact),
      owner_name: risk.owner_name || '', due_date: risk.due_date || '', status: risk.status || 'Open',
    })
    setRiskEditorOpen(true)
    setTab('register')
    clearMessages()
  }
  const saveRisk = async () => {
    if (saving) return
    if (!riskForm.unit_id || !riskForm.risk_event.trim() || !riskForm.category) {
      setError('Unit kerja, kategori, dan pernyataan risiko wajib diisi.')
      return
    }
    if ((riskForm.residual_likelihood && !riskForm.residual_impact) || (!riskForm.residual_likelihood && riskForm.residual_impact)) {
      setError('Penilaian residual harus mencakup kemungkinan dan dampak sekaligus.')
      return
    }
    setSaving(true); clearMessages()
    const unit = rooms.find(r => r.id === Number(riskForm.unit_id))
    const payload: Record<string, unknown> = {
      unit_id: Number(riskForm.unit_id), unit_name: unit?.name || '',
      category: riskForm.category, objective: riskForm.objective.trim(), risk_event: riskForm.risk_event.trim(),
      causes: riskForm.causes.trim(), impacts: riskForm.impacts.trim(), existing_controls: riskForm.existing_controls.trim(),
      likelihood: Number(riskForm.likelihood), impact: Number(riskForm.impact),
      residual_likelihood: riskForm.residual_likelihood ? Number(riskForm.residual_likelihood) : null,
      residual_impact: riskForm.residual_impact ? Number(riskForm.residual_impact) : null,
      owner_name: riskForm.owner_name.trim(), due_date: riskForm.due_date || null, status: riskForm.status,
    }
    if (riskForm.risk_code.trim()) payload.risk_code = riskForm.risk_code.trim()
    try {
      let result: any
      if (editingRiskId) result = await db.from('risk_register').update(payload).eq('id', editingRiskId).select('id,risk_code').single()
      else result = await db.from('risk_register').insert(payload).select('id,risk_code').single()
      if (result.error) throw result.error
      setMessage((editingRiskId ? 'Risiko diperbarui. ' : 'Risiko baru dicatat. ') + 'Kode: ' + result.data.risk_code)
      setSelectedRiskId(result.data.id)
      setRiskEditorOpen(false)
      await loadData()
    } catch (e) {
      setError('Risiko belum tersimpan. Periksa hak akses, koneksi, dan kelengkapan data. ' + (e instanceof Error ? e.message : 'Kesalahan tidak diketahui.'))
    } finally { setSaving(false) }
  }
  const deleteRisk = async (id: string) => {
    setSaving(true); clearMessages()
    try {
      const result = await db.from('risk_register').delete().eq('id', id)
      if (result.error) throw result.error
      setMessage('Risiko dihapus.')
      setPendingAction(null)
      setSelectedRiskIds(current => current.filter(x => x !== id))
      if (selectedRiskId === id) setSelectedRiskId('')
      await loadData()
    } catch (e) { setError('Risiko tidak dapat dihapus. Risiko yang telah terhubung dengan FMEA atau mitigasi harus dipertahankan untuk jejak audit. ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  const openFmea = (row?: FmeaRow) => {
    if (row) {
      setEditingFmeaId(row.id)
      setFmeaForm({ ...row })
    } else {
      setEditingFmeaId('')
      setFmeaForm({ ...emptyFmea(currentRoom?.name || ''), risk_register_id: selectedRiskId || null })
    }
    setFmeaEditorOpen(true)
    setTab('fmea')
    clearMessages()
  }
  const saveFmea = async () => {
    if (saving) return
    if (!String(fmeaForm.failure_mode || '').trim() || !String(fmeaForm.unit_name || '').trim()) {
      setError('Unit dan modus kegagalan wajib diisi untuk analisis FMEA.')
      return
    }
    setSaving(true); clearMessages()
    const relatedRisk = risks.find(r => r.id === String(fmeaForm.risk_register_id || ''))
    const payload = {
      risk_register_id: fmeaForm.risk_register_id || null,
      unit_name: String(fmeaForm.unit_name || '').trim(),
      process_name: String(fmeaForm.process_name || '').trim(),
      failure_mode: String(fmeaForm.failure_mode || '').trim(),
      failure_effect: String(fmeaForm.failure_effect || '').trim(),
      causes: String(fmeaForm.causes || '').trim(),
      existing_controls: String(fmeaForm.existing_controls || '').trim(),
      severity: Number(fmeaForm.severity || 1), occurrence: Number(fmeaForm.occurrence || 1),
      detection: Number(fmeaForm.detection || 1), action_plan: String(fmeaForm.action_plan || '').trim(),
      owner_name: String(fmeaForm.owner_name || '').trim(), target_date: fmeaForm.target_date || null,
      status: String(fmeaForm.status || 'Open'),
      ...(relatedRisk ? { unit_name: relatedRisk.unit_name } : {}),
    }
    try {
      const result = editingFmeaId
        ? await db.from('fmea_analyses').update(payload).eq('id', editingFmeaId).select('id,fmea_code,rpn').single()
        : await db.from('fmea_analyses').insert(payload).select('id,fmea_code,rpn').single()
      if (result.error) throw result.error
      setMessage('Analisis FMEA tersimpan. RPN dihitung oleh engine dari S × O × D (' + result.data.rpn + ').')
      setFmeaEditorOpen(false)
      setEditingFmeaId('')
      await loadData()
    } catch (e) { setError('FMEA tidak dapat disimpan. Pastikan Anda memiliki akses pada unit terkait. ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  const beginPlanForSelection = () => {
    if (!selectedRiskIds.length) { setError('Pilih satu atau lebih risiko pada register terlebih dahulu.'); return }
    setPlanFormOpen(true)
    setTab('mitigation')
    setPlanForm(current => ({ ...current, title: selectedRiskIds.length > 1 ? 'Mitigasi terintegrasi ' + selectedRiskIds.length + ' risiko' : 'Mitigasi ' + (risks.find(r => r.id === selectedRiskIds[0])?.risk_code || 'risiko'), owner_name: current.owner_name || userName }))
    clearMessages()
  }
  const createPlan = async () => {
    if (saving) return
    if (!planForm.title.trim() || !planForm.action_plan.trim() || !planForm.target_date || !selectedRiskIds.length) {
      setError('Judul, tindakan mitigasi, target waktu, dan sekurang-kurangnya satu risiko wajib ditentukan.')
      return
    }
    setSaving(true); clearMessages()
    const planRoom = initialRoomId ?? selectedForPlan[0]?.unit_id ?? null
    try {
      const insertResult = await db.from('mitigation_plans').insert({
        title: planForm.title.trim(), objective: planForm.objective.trim(),
        action_plan: planForm.action_plan.trim(), expected_output: planForm.expected_output.trim(),
        owner_name: planForm.owner_name.trim() || userName, owner_room_id: planRoom,
        target_date: planForm.target_date,
        target_likelihood: planForm.target_likelihood ? Number(planForm.target_likelihood) : null,
        target_impact: planForm.target_impact ? Number(planForm.target_impact) : null,
        status: 'draft',
      }).select('id,plan_code').single()
      if (insertResult.error) throw insertResult.error
      const joinRows = selectedRiskIds.map(riskId => ({
        plan_id: insertResult.data.id, risk_id: riskId,
        target_likelihood: planForm.target_likelihood ? Number(planForm.target_likelihood) : null,
        target_impact: planForm.target_impact ? Number(planForm.target_impact) : null,
      }))
      const joinResult = await db.from('mitigation_plan_risks').insert(joinRows)
      if (joinResult.error) {
        await db.from('mitigation_plans').delete().eq('id', insertResult.data.id)
        throw joinResult.error
      }
      setMessage('Rencana mitigasi gabungan ' + insertResult.data.plan_code + ' dibuat sebagai draft. Kirim ke Kabid setelah ditinjau unit.')
      setSelectedPlanId(insertResult.data.id)
      setPlanFormOpen(false)
      setDecisionNote('')
      await loadData()
    } catch (e) {
      setError('Rencana mitigasi belum tersimpan. Periksa akses dan pastikan seluruh risiko masih tersedia. ' + (e instanceof Error ? e.message : ''))
    } finally { setSaving(false) }
  }

  const transitionPlan = async (plan: PlanRow, action: string) => {
    if (saving) return
    if (['return', 'evaluate', 'approve', 'close'].includes(action) && !decisionNote.trim()) {
      setError(action === 'return' ? 'Tuliskan alasan pengembalian agar unit dapat memperbaiki rencana.' : action === 'evaluate' ? 'Tuliskan hasil evaluasi pelaksanaan mitigasi.' : action === 'close' ? 'Tuliskan alasan penutupan setelah residual diverifikasi.' : 'Tuliskan catatan persetujuan untuk jejak keputusan.')
      return
    }
    setSaving(true); clearMessages()
    try {
      const result = await db.rpc('transition_mitigation_plan', {
        p_plan_id: plan.id, p_action: action, p_note: decisionNote.trim(),
      })
      if (result.error) throw result.error
      setMessage('Tahap rencana diperbarui: ' + (PLAN_STATUS[String(result.data)] || String(result.data)) + '.')
      setDecisionNote('')
      await loadData()
    } catch (e) {
      setError('Perubahan tahap tidak berhasil. Hak akses dan urutan persetujuan divalidasi di server. ' + (e instanceof Error ? e.message : ''))
    } finally { setSaving(false) }
  }

  const addLink = async () => {
    if (saving) return
    const sourceRisk = risks.find(risk => risk.id === linkForm.source)
    if (!sourceRisk || sourceRisk.risk_level !== 'Sangat Tinggi') {
      setError('Risiko sumber konektor wajib berlevel Sangat Tinggi. Risiko dengan level lain hanya dapat menjadi risiko terkait.')
      return
    }
    if (!linkForm.source || !linkForm.target || linkForm.source === linkForm.target) {
      setError('Pilih dua risiko yang berbeda untuk membentuk hubungan.')
      return
    }
    if (links.some(link => (link.source_risk_id === linkForm.source && link.target_risk_id === linkForm.target) || (link.source_risk_id === linkForm.target && link.target_risk_id === linkForm.source))) {
      setError('Hubungan antara kedua risiko sudah terdaftar. Periksa graf relasi terlebih dahulu.')
      return
    }
    setSaving(true); clearMessages()
    try {
      const result = await db.from('risk_relationships').insert({
        source_risk_id: linkForm.source, target_risk_id: linkForm.target,
        relationship_type: linkForm.type, description: linkForm.description.trim(),
      })
      if (result.error) throw result.error
      setMessage('Konektor risiko berhasil dicatat.')
      setLinkForm(current => ({ ...current, description: '' }))
      await loadData()
    } catch (e) { setError('Hubungan risiko tidak tersimpan. Periksa izin dan pastikan pasangan ini belum tercatat. ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }
  const prepareIntegratedPlan = () => {
    if (!connectorPrimary) { setError('Pilih risiko utama Sangat Tinggi terlebih dahulu.'); return }
    if (relatedRiskIds.length < 2) { setError('Hubungkan risiko utama dengan sedikitnya satu risiko terkait sebelum menyiapkan RTP gabungan.'); return }
    const ids = relatedRiskIds
    setSelectedRiskIds(ids)
    setPlanForm(current => ({ ...current, title: 'RTP terpadu ' + connectorPrimary.risk_code + ' (' + ids.length + ' risiko)', objective: current.objective || 'Pengendalian terintegrasi untuk risiko utama ' + connectorPrimary.risk_code, owner_name: current.owner_name || userName }))
    setPlanFormOpen(true)
    setTab('mitigation')
    clearMessages()
    setMessage('RTP terpadu disiapkan dari ' + ids.length + ' risiko pada konektor aktif. Periksa kembali daftar risiko dan lengkapi tindakan, target, serta penanggung jawab sebelum menyimpan.')
  }

  const deleteLink = async (id: string) => {
    setSaving(true); clearMessages()
    try {
      const result = await db.from('risk_relationships').delete().eq('id', id)
      if (result.error) throw result.error
      setPendingAction(null); setMessage('Konektor dihapus.'); await loadData()
    } catch (e) { setError('Konektor tidak dapat dihapus. ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  const exportCsv = () => {
    const rows = [
      ['Kode Risiko', 'Unit', 'Kategori', 'Sasaran', 'Peristiwa Risiko', 'Penyebab', 'Dampak', 'Kontrol Saat Ini', 'Kemungkinan', 'Dampak Level', 'Skor', 'Level', 'Residual Kemungkinan', 'Residual Dampak', 'Skor Residual', 'Level Residual', 'PIC', 'Target', 'Status', 'Sheet Sumber', 'Baris Sumber', 'Kode Sumber', 'Skor Sumber'],
      ...filteredRisks.map(r => [r.risk_code, r.unit_name, r.category, r.objective, r.risk_event, r.causes, r.impacts, r.existing_controls, r.likelihood, r.impact, r.risk_score, r.risk_level, r.residual_likelihood, r.residual_impact, r.residual_score, r.residual_level, r.owner_name, r.due_date, r.status, r.source_sheet, r.source_row_number, r.source_risk_code, r.source_risk_score]),
    ]
    const csv = '\ufeff' + rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'AUREKA_Risk_Register_' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    setMessage('Ekspor CSV dibuat dari ' + filteredRisks.length + ' risiko sesuai filter aktif.')
  }

  const mayApprove = (plan: PlanRow) =>
    (plan.status === 'pending_kabid' && roleCode === 'KABID') ||
    (plan.status === 'pending_director' && roleCode === 'DIREKTUR') ||
    (plan.status === 'pending_board' && roleCode === 'DEWAN_PENGAWAS')
  const mayReturn = mayApprove
  const canSubmitPlan = (plan: PlanRow) =>
    (plan.created_by === userId || plan.owner_room_id === initialRoomId || ['ADMIN', 'PMKP'].includes(roleCode)) &&
    ['draft', 'returned_unit', 'returned_kabid', 'returned_director'].includes(plan.status)
  const mayStartPlan = (plan: PlanRow) => plan.status === 'approved' &&
    (plan.owner_room_id === initialRoomId || ['PMKP', 'KABID', 'DIREKTUR'].includes(roleCode))
  const mayEvaluatePlan = (plan: PlanRow) => plan.status === 'in_progress' &&
    (plan.owner_room_id === initialRoomId || ['PMKP', 'KABID', 'DIREKTUR'].includes(roleCode))
  const mayClosePlan = (plan: PlanRow) => plan.status === 'evaluated' &&
    ['PMKP', 'KABID', 'DIREKTUR'].includes(roleCode)
  const canOwnPlan = (plan: PlanRow) => plan.owner_room_id === initialRoomId || plan.created_by && canManageAll

  const renderRiskBadge = (level: string) => <span className={'rmBadge ' + scoreBand(level)}>{level || 'Belum dinilai'}</span>
  const renderStatus = (status: string) => <span className={'rmStatus ' + status.toLowerCase().replace(/\s+/g, '-')}>{status}</span>
  const renderRiskOption = (risk: RiskRow) => <option key={risk.id} value={risk.id}>{risk.risk_code} · {risk.risk_event}</option>
  const renderSourceUnitOption = (unitName: string) => {
    const unitRisks = risks.filter(risk => sourceUnitLabel(risk) === unitName)
    const veryHighCount = unitRisks.filter(risk => risk.risk_level === 'Sangat Tinggi').length
    return <option key={unitName} value={unitName}>{unitName} · {unitRisks.length} record · {veryHighCount} Sangat Tinggi</option>
  }

  const renderMatrix = (large = false) => (
    <div className={'rmMatrixWrap' + (large ? ' large' : '')}>
      <div className="rmMatrixYAxis"><span>LEVEL KEMUNGKINAN</span><b>Hampir pasti → Jarang</b></div>
      <div className="rmMatrix">
        <div className="rmMatrixHeader"><span></span>{IMPACT_LABELS.map((label, i) => <span key={label}><b>{i + 1}</b><small>{label}</small></span>)}</div>
        {[5, 4, 3, 2, 1].map(p => (
          <div className="rmMatrixRow" key={p}>
            <div className="rmMatrixLikelihood"><b>{p}</b><small>{LIKELIHOOD_LABELS[p - 1]}</small></div>
            {[1, 2, 3, 4, 5].map(d => {
              const score = riskScore(p, d)
              const matching = risks.filter(r => r.likelihood === p && r.impact === d && (unitFilter === 'all' || sourceUnitLabel(r) === unitFilter))
              return <button type="button" key={d} className={'rmMatrixCell ' + scoreBand(levelFor(score))} onClick={() => { setTab('register'); setPage(0); setLevelFilter('all'); setSearch(''); setCategoryFilter('all'); setStatusFilter('all'); setMatrixFilter({ likelihood: p, impact: d }); setSelectedRiskIds([]); setError(''); setMessage('Filter matriks P' + p + ' × D' + d + ' aktif: skor ' + score + ', ' + levelFor(score) + '. ' + matching.length + ' risiko terdaftar.'); }} title={'P' + p + ', D' + d + ' — skor ' + score}>
                <b>{score}</b><small>{matching.length ? matching.length + ' risiko' : '—'}</small>
              </button>
            })}
          </div>
        ))}
      </div>
      <div className="rmMatrixAxisFoot">LEVEL DAMPAK → · Angka dalam sel = besaran risiko berdasarkan lookup Kepmenkes HK.01.07/MENKES/1354/2024</div>
    </div>
  )

  return (
    <div className="rmWorkspace">
      <LiquidGlass className="rmHero">
        <div>
          <div className="rmEyebrow">AUREKA · MODUL 03 · PMKP</div>
          <h3>Manajemen Risiko</h3>
          <p>Identifikasi, pemetaan selera risiko, analisis HFMEA, konektor antar-risiko, dan rencana mitigasi dengan alur persetujuan berjenjang.</p>
        </div>
        <div className="rmHeroActions">
          <span className="rmRoleChip">{roleLabel(role)}{scopedToUnit && currentRoom ? ' · ' + currentRoom.name : ''}</span>
          <button type="button" className="rmButton primary" onClick={openNewRisk} disabled={unitMissing}>＋ Risiko baru</button>
        </div>
      </LiquidGlass>

      {unitMissing && <div className="rmNotice error" role="alert">
        <span>Unit belum dipetakan</span><p>Akun Anda belum terhubung ke ruangan/unit kerja, sehingga register risiko unit belum dapat ditampilkan atau diisi. Hubungi Super Admin untuk memetakan unit utama akun Anda di menu Pengaturan.</p>
      </div>}
      {scopedToUnit && !unitMissing && <div className="rmNotice" role="status">
        <span>Mode unit</span><p>Anda melihat dan mengelola risiko unit {currentRoom?.name || 'Anda'} saja. Risiko yang salah input dapat diperbaiki melalui tombol Edit pada register.</p>
      </div>}

      {(message || error) && <div className={'rmNotice' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>
        <span>{error ? 'Perlu perhatian' : 'Informasi'}</span><p>{error || message}</p>
        <button type="button" onClick={clearMessages} aria-label="Tutup pesan">Tutup</button>
      </div>}

      <nav className="rmTabs" aria-label="Bagian Manajemen Risiko">
        {[
          ['overview', '◫', 'Ikhtisar'], ['register', '▤', 'Risk Register'],
          ['mitigation', '↗', 'RTP Terintegrasi'], ['connections', '⌘', 'Konektor Risiko'], ['fmea', '◎', 'FMEA / HFMEA'],
        ].map(([key, icon, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key as typeof tab); clearMessages(); }}>
          <span>{icon}</span>{label}
        </button>)}
      </nav>

      {loading && <div className="rmPanel rmLoading"><span className="rmSpinner"></span>Memuat data risiko dan riwayat pengendalian…</div>}
      {!loading && error.startsWith('Data Manajemen Risiko') && <div className="rmPanel rmEmpty">
        <div className="rmEmptyIcon">DB</div><h4>Backend belum siap</h4><p>Modul memerlukan migration aureka_risk. Terapkan migration yang tersedia pada repositori sebelum menguji penyimpanan operasional.</p>
      </div>}

      {!loading && !error.startsWith('Data Manajemen Risiko') && tab === 'overview' && <>
        <div className="rmKpis">
          <LiquidGlass className="rmKpi"><span>Risiko terdaftar</span><strong>{counts.total.toLocaleString('id-ID')}</strong><small>Seluruh unit kerja</small></LiquidGlass>
          <LiquidGlass className="rmKpi"><span>Risiko utama · perlu mitigasi</span><strong>{counts.needsMitigation.toLocaleString('id-ID')}</strong><small>Sedang, Tinggi, Sangat Tinggi</small></LiquidGlass>
          <LiquidGlass className="rmKpi"><span>Risiko Tinggi / Sangat Tinggi</span><strong>{counts.high.toLocaleString('id-ID')}</strong><small>Prioritas perhatian manajemen</small></LiquidGlass>
          <LiquidGlass className="rmKpi"><span>Residual telah dinilai</span><strong>{counts.residualComplete.toLocaleString('id-ID')}</strong><small>{counts.total ? Math.round(counts.residualComplete / counts.total * 100) : 0}% register</small></LiquidGlass>
        </div>
        {(counts.sourceScoreDiff > 0 || counts.unitUnmapped > 0 || counts.sourceCategoryMissing > 0) && <div className="rmNotice" role="status">
          <span>Rekonsiliasi impor</span>
          <p>Data workbook telah diimpor tanpa menghapus nilai sumber. {counts.sourceScoreDiff.toLocaleString('id-ID')} skor sumber berbeda dari kalkulasi matriks engine; kedua nilai dipertahankan untuk audit. {counts.unitUnmapped.toLocaleString('id-ID')} risiko masih belum terhubung ke ID unit master AUREKA, sehingga penetapan akses PIC unit memerlukan pemetaan unit. {counts.sourceCategoryMissing.toLocaleString('id-ID')} entri sheet Profesi memang tidak memiliki kategori pada sumber.</p>
        </div>}
        <div className="rmOverviewGrid">
          <LiquidGlass className="rmPanel"><div className="rmSectionHead"><div><span className="rmEyebrow">PROFIL RISIKO</span><h4>Peta risiko dan selera risiko</h4><p>Area Rendah/Sangat Rendah dapat diterima; level Sedang ke atas menjadi risiko utama yang perlu mitigasi.</p></div><button type="button" className="rmButton subtle" onClick={() => setTab('register')}>Lihat register →</button></div>{renderMatrix()}</LiquidGlass>
          <LiquidGlass className="rmPanel"><div className="rmSectionHead"><div><span className="rmEyebrow">PENGENDALIAN</span><h4>Status tindak pengendalian</h4><p>Ringkasan untuk membantu penentuan prioritas dan pemantauan.</p></div></div>
            <div className="rmProgressList">
              {[
                ['Perlu mitigasi', counts.needsMitigation, counts.total, 'moderate'],
                ['Tenggat terlewati', counts.overdue, counts.total, 'high'],
                ['Residual belum dinilai', Math.max(0, counts.total - counts.residualComplete), counts.total, 'low'],
              ].map(([label, value, total, band]) => <div className="rmProgressItem" key={String(label)}>
                <div><span>{label}</span><b>{Number(value).toLocaleString('id-ID')}</b></div><div className="rmProgressTrack"><i className={'rmProgressBar ' + band} style={{ width: (Number(total) ? Math.min(100, Number(value) / Number(total) * 100) : 0) + '%' }} /></div>
              </div>)}
            </div>
            <div className="rmCallout"><b>Aturan keputusan</b><p>Skor 1–9: area penerimaan risiko. Skor 10–25: risiko utama sesuai selera risiko Kepmenkes dan harus direncanakan mitigasinya.</p></div>
            <div className="rmMiniSummary"><div><b>{plans.filter(p => p.status.startsWith('pending_')).length}</b><span>Menunggu persetujuan</span></div><div><b>{plans.filter(p => p.status === 'in_progress').length}</b><span>Mitigasi berjalan</span></div><div><b>{links.length}</b><span>Konektor risiko</span></div></div>
            <button type="button" className="rmButton primary wide" onClick={() => { setSelectedRiskIds(risks.filter(r => ['Sedang', 'Tinggi', 'Sangat Tinggi'].includes(r.risk_level)).map(r => r.id)); setTab('register'); setMessage('Risiko utama terpilih. Tinjau daftar dan gunakan RTP Terintegrasi untuk membuat rencana gabungan.'); }}>Siapkan mitigasi risiko utama</button>
          </LiquidGlass>
        </div>
      </>}

      {!loading && !error.startsWith('Data Manajemen Risiko') && tab === 'register' && <>
        <LiquidGlass className="rmPanel">
          <div className="rmSectionHead"><div><span className="rmEyebrow">REGISTER TERKENDALI</span><h4>Risk Register</h4><p>Menampilkan record asli dari satu ruangan/kelompok sumber setiap kali. Teks sumber dan nomor baris dipertahankan untuk penelusuran; pindah ruangan melalui filter di bawah.</p></div>
            <div className="rmActions"><button type="button" className="rmButton subtle" onClick={exportCsv}>Ekspor CSV</button><button type="button" className="rmButton primary" onClick={openNewRisk} disabled={unitMissing}>＋ Tambah risiko</button></div>
          </div>
          <div className="rmFilterGrid">
            <label className="rmSearch">⌕ <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Cari kode, risiko, unit, atau penyebab…" /></label>
            <select aria-label="Ruangan atau kelompok sumber" value={unitFilter} disabled={scopedToUnit} onChange={e => { setUnitFilter(e.target.value); setPage(0); setSelectedRiskIds([]); }}><option value="">Pilih ruangan/kelompok sumber</option>{sourceUnitOptions.map(renderSourceUnitOption)}</select>
            <select aria-label="Filter level risiko" value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(0); }}><option value="all">Semua level</option>{LEVELS.map(x => <option key={x}>{x}</option>)}</select>
            <select aria-label="Filter kategori" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }}><option value="all">Semua kategori</option>{Array.from(new Set([...CATEGORIES, ...risks.map(r => r.category)])).map(x => <option key={x}>{x}</option>)}</select>
            <select aria-label="Filter status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}><option value="all">Semua status</option>{['Open', 'In Progress', 'Controlled', 'Accepted'].map(x => <option key={x}>{x}</option>)}</select>
          </div>
          {matrixFilter && <div className="rmSelectionBar"><div><b>Filter matriks aktif · P{matrixFilter.likelihood} × D{matrixFilter.impact}</b><span>Register hanya menampilkan risiko pada kombinasi ini.</span></div><button type="button" className="rmButton subtle" onClick={() => setMatrixFilter(null)}>Hapus filter matriks</button></div>}
          {selectedRiskIds.length > 0 && <div className="rmSelectionBar"><div><b>{selectedRiskIds.length} risiko dipilih</b><span>Satukan pengendalian jika penyebab, kontrol, atau proses saling terkait.</span></div><button type="button" className="rmButton primary" onClick={beginPlanForSelection}>Rencanakan mitigasi gabungan →</button><button type="button" className="rmButton subtle" onClick={() => setSelectedRiskIds([])}>Batalkan pilihan</button></div>}
          <div className="rmTableWrap"><table className="rmTable"><thead><tr><th><input type="checkbox" aria-label="Pilih semua pada halaman" checked={pageRisks.length > 0 && pageRisks.every(r => selectedRiskIds.includes(r.id))} onChange={e => setSelectedRiskIds(current => e.target.checked ? Array.from(new Set([...current, ...pageRisks.map(r => r.id)])) : current.filter(id => !pageRisks.some(r => r.id === id)))} /></th><th>Risiko / Kode</th><th>Unit</th><th>Skor</th><th>Level risiko</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{pageRisks.map(risk => <tr key={risk.id} className={selectedRiskId === risk.id ? 'selected' : ''}>
                <td><input type="checkbox" checked={selectedRiskIds.includes(risk.id)} aria-label={'Pilih ' + risk.risk_code} onChange={e => setSelectedRiskIds(current => e.target.checked ? [...current, risk.id] : current.filter(id => id !== risk.id))} /></td>
                <td><button type="button" className="rmRiskName" onClick={() => { setSelectedRiskId(risk.id); setRegisterDetailExpanded(true); clearMessages(); }}><b>{risk.risk_event}</b><small>{risk.risk_code} · {risk.category}{risk.is_priority ? ' · PRIORITAS #' + (risk.priority_rank ?? '—') : ''}{risk.source_sheet ? ' · Sumber: ' + risk.source_sheet + (risk.source_row_number ? ' baris ' + risk.source_row_number : '') : ''}</small></button></td>
                <td>{risk.unit_name || '—'}</td><td><strong className="rmScore">{risk.risk_score}</strong></td><td>{renderRiskBadge(risk.risk_level)}</td><td>{renderStatus(risk.status)}</td>
                <td><div className="rmActions"><button type="button" className="rmIconButton" aria-label="Lihat detail" title="Lihat detail" onClick={() => { setSelectedRiskId(risk.id); setRegisterDetailExpanded(v => !v); }}>↗</button><button type="button" className="rmIconButton" disabled={!canEditRisk(risk)} aria-label="Edit risiko" title={canEditRisk(risk) ? 'Edit risiko' : 'Hanya unit terkait atau role pengelola yang dapat mengubah'} onClick={() => openRiskEditor(risk)}>✎</button></div></td>
              </tr>)}
                {!pageRisks.length && <tr><td colSpan={7}><div className="rmEmptySmall">Tidak ada risiko yang sesuai filter. Ubah filter atau tambahkan risiko baru.</div></td></tr>}
              </tbody></table></div>
          <div className="rmTableFooter"><span>Menampilkan {filteredRisks.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filteredRisks.length)} dari {filteredRisks.length.toLocaleString('id-ID')} risiko</span><div className="rmActions"><button type="button" className="rmButton subtle" disabled={page === 0} onClick={() => setPage(v => Math.max(0, v - 1))}>← Sebelumnya</button><span className="rmPage">Halaman {page + 1} / {pageCount}</span><button type="button" className="rmButton subtle" disabled={page + 1 >= pageCount} onClick={() => setPage(v => Math.min(pageCount - 1, v + 1))}>Berikutnya →</button></div></div>
        </LiquidGlass>

        {riskEditorOpen && <RmModal label={editingRiskId ? "Edit risiko" : "Risiko baru"} error={error}><LiquidGlass className="rmPanel rmEditor">
          <div className="rmSectionHead"><div><span className="rmEyebrow">{editingRiskId ? 'PEMUTAKHIRAN DATA' : 'IDENTIFIKASI RISIKO'}</span><h4>{editingRiskId ? 'Edit Risk Register' : 'Risiko baru'}</h4><p>Isi berdasarkan sasaran organisasi, kejadian risiko, penyebab, dampak, dan kontrol saat ini. Skor dihitung otomatis.</p></div><button type="button" className="rmButton subtle" onClick={() => { setRiskEditorOpen(false); clearMessages(); }}>Tutup panel</button></div>
          <div className="rmFormGrid">
            <label>Kode risiko <input value={riskForm.risk_code} onChange={e => setRiskForm(f => ({ ...f, risk_code: e.target.value }))} placeholder="Dibuat otomatis jika kosong" /></label>
            <label>Unit kerja <select value={riskForm.unit_id} disabled={!canManageAll && initialRoomId != null} onChange={e => setRiskForm(f => ({ ...f, unit_id: e.target.value }))}><option value="">Pilih unit</option>{unitOptions.map(r => <option value={String(r.id)} key={r.id}>{r.name}</option>)}</select></label>
            <label>Kategori risiko <select value={riskForm.category} onChange={e => setRiskForm(f => ({ ...f, category: e.target.value }))}>{Array.from(new Set(CATEGORIES)).map(c => <option key={c}>{c}</option>)}</select></label>
            <label>Sasaran organisasi / proses <input value={riskForm.objective} onChange={e => setRiskForm(f => ({ ...f, objective: e.target.value }))} placeholder="Sasaran yang dapat terdampak" /></label>
            <label className="full">Pernyataan kejadian risiko <textarea rows={2} value={riskForm.risk_event} onChange={e => setRiskForm(f => ({ ...f, risk_event: e.target.value }))} placeholder="Peristiwa yang berpotensi menghambat sasaran…" /></label>
            <label className="full">Penyebab / faktor kontributor <textarea rows={2} value={riskForm.causes} onChange={e => setRiskForm(f => ({ ...f, causes: e.target.value }))} placeholder="Akar penyebab, kondisi, atau faktor pemicu" /></label>
            <label className="full">Dampak terhadap sasaran / pelayanan <textarea rows={2} value={riskForm.impacts} onChange={e => setRiskForm(f => ({ ...f, impacts: e.target.value }))} placeholder="Dampak klinis, operasional, finansial, legal, reputasi, atau pencapaian sasaran" /></label>
            <label className="full">Pengendalian yang sudah berjalan <textarea rows={2} value={riskForm.existing_controls} onChange={e => setRiskForm(f => ({ ...f, existing_controls: e.target.value }))} placeholder="Pengendalian aktual, bukan rencana yang belum dilaksanakan" /></label>
          </div>
          <div className="rmSubhead"><b>Analisis baseline · matriks Kepmenkes 5 × 5</b><span>Besaran skor dihitung dari lookup resmi, bukan P × D sederhana.</span></div>
          <div className="rmFormGrid three">
            <label>Level kemungkinan <select value={riskForm.likelihood} onChange={e => setRiskForm(f => ({ ...f, likelihood: e.target.value }))}>{[1,2,3,4,5].map(n => <option value={String(n)} key={n}>{n} · {LIKELIHOOD_LABELS[n - 1]}</option>)}</select></label>
            <label>Level dampak <select value={riskForm.impact} onChange={e => setRiskForm(f => ({ ...f, impact: e.target.value }))}>{[1,2,3,4,5].map(n => <option value={String(n)} key={n}>{n} · {IMPACT_LABELS[n - 1]}</option>)}</select></label>
            <div className="rmScorePreview"><span>Skor baseline</span><strong>{riskScore(Number(riskForm.likelihood), Number(riskForm.impact))}</strong>{renderRiskBadge(levelFor(riskScore(Number(riskForm.likelihood), Number(riskForm.impact))))}</div>
          </div>
          <div className="rmSubhead"><b>Penanggung jawab dan pemantauan</b><span>Penanggung jawab harus individu/jabatan yang dapat menindaklanjuti risiko.</span></div>
          <div className="rmFormGrid three">
            <label>Pemilik risiko / PIC <input value={riskForm.owner_name} onChange={e => setRiskForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Nama atau jabatan" /></label>
            <label>Tenggat mitigasi <input type="date" value={riskForm.due_date} onChange={e => setRiskForm(f => ({ ...f, due_date: e.target.value }))} /></label>
            <label>Status risiko <select value={riskForm.status} onChange={e => setRiskForm(f => ({ ...f, status: e.target.value as RiskStatus }))}>{['Open', 'In Progress', 'Controlled', 'Accepted'].map(s => <option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="rmSubhead"><b>Evaluasi risiko residual</b><span>Diisi setelah tindakan pengendalian berjalan dan efektivitasnya dievaluasi.</span></div>
          <div className="rmFormGrid three">
            <label>Residual kemungkinan <select value={riskForm.residual_likelihood} onChange={e => setRiskForm(f => ({ ...f, residual_likelihood: e.target.value }))}><option value="">Belum dinilai</option>{[1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n} · {LIKELIHOOD_LABELS[n - 1]}</option>)}</select></label>
            <label>Residual dampak <select value={riskForm.residual_impact} onChange={e => setRiskForm(f => ({ ...f, residual_impact: e.target.value }))}><option value="">Belum dinilai</option>{[1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n} · {IMPACT_LABELS[n - 1]}</option>)}</select></label>
            <div className="rmScorePreview"><span>Skor residual</span><strong>{riskForm.residual_likelihood && riskForm.residual_impact ? riskScore(Number(riskForm.residual_likelihood), Number(riskForm.residual_impact)) : '—'}</strong>{riskForm.residual_likelihood && riskForm.residual_impact ? renderRiskBadge(levelFor(riskScore(Number(riskForm.residual_likelihood), Number(riskForm.residual_impact)))) : <span className="rmMuted">Belum dinilai</span>}</div>
          </div>
          <div className="rmFormFooter"><div className="rmFormNote">Peringkat Sedang ke atas berada di luar area penerimaan risiko dan membutuhkan keputusan mitigasi.</div><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => { setRiskEditorOpen(false); clearMessages(); }}>Batal</button><button type="button" className="rmButton primary" disabled={saving} onClick={saveRisk}>{saving ? 'Menyimpan…' : 'Simpan risk register'}</button></div></div>
        </LiquidGlass></RmModal>}

        {!riskEditorOpen && activeRisk && registerDetailExpanded && <LiquidGlass className="rmPanel">
          <div className="rmSectionHead"><div><span className="rmEyebrow">DETAIL RISIKO TERPILIH</span><h4>{activeRisk.risk_event}</h4><p>{activeRisk.risk_code} · {activeRisk.unit_name} · diperbarui {fmtDate(activeRisk.updated_at)}</p></div><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setRegisterDetailExpanded(false)}>Ringkas</button><button type="button" className="rmButton primary" disabled={!canEditRisk(activeRisk)} onClick={() => openRiskEditor(activeRisk)}>Edit detail</button></div></div>
          <div className="rmDetailGrid">
            <div><span>Kategori</span><b>{activeRisk.category}</b></div><div><span>Baseline · engine</span><b>{activeRisk.likelihood} × {activeRisk.impact} · {activeRisk.risk_score}</b>{renderRiskBadge(activeRisk.risk_level)}</div><div><span>Skor sumber workbook</span><b>{activeRisk.source_risk_score ?? '—'}{activeRisk.source_risk_level ? ' · ' + activeRisk.source_risk_level : ''}</b>{activeRisk.source_risk_score != null && activeRisk.source_risk_score !== activeRisk.risk_score ? <p>Berbeda dari skor engine; nilai sumber tetap dipertahankan.</p> : null}</div><div><span>Sumber data</span><b>{activeRisk.source_sheet || 'Input AUREKA'}{activeRisk.source_row_number ? ' · baris ' + activeRisk.source_row_number : ''}{activeRisk.source_record_no ? ' · record ' + activeRisk.source_record_no : ''}</b></div><div><span>Residual</span><b>{activeRisk.residual_score == null ? 'Belum dinilai' : activeRisk.residual_score + ' · ' + activeRisk.residual_level}</b>{activeRisk.residual_level ? renderRiskBadge(activeRisk.residual_level) : null}</div><div><span>Pemilik risiko</span><b>{activeRisk.owner_name || 'Belum ditetapkan'}</b></div>
            <div className="wide"><span>Sasaran</span><p>{activeRisk.objective || 'Belum diuraikan'}</p></div><div className="wide"><span>Penyebab</span><p>{activeRisk.causes || 'Belum diuraikan'}</p></div><div className="wide"><span>Dampak</span><p>{activeRisk.impacts || 'Belum diuraikan'}</p></div><div className="wide"><span>Pengendalian saat ini</span><p>{activeRisk.existing_controls || 'Belum diuraikan'}</p></div>
          </div>
          {activeLinks.length > 0 && <div className="rmRelated"><b>Terhubung dengan {activeLinks.length} relasi</b>{activeLinks.map(link => { const other = risks.find(r => r.id === (link.source_risk_id === activeRisk.id ? link.target_risk_id : link.source_risk_id)); return <button type="button" key={link.id} onClick={() => { if (other) setSelectedRiskId(other.id); }}><span>{RELATION_TYPES.find(x => x.value === link.relationship_type)?.label || link.relationship_type}</span><b>{other?.risk_code || 'Risiko terkait'} · {other?.risk_event || ''}</b></button> })}</div>}
          <div className="rmActions rmBottomActions"><button type="button" className="rmButton subtle" onClick={() => openFmea()}>＋ Tambahkan FMEA</button><button type="button" className="rmButton subtle" onClick={() => { setLinkForm(f => ({ ...f, source: activeRisk.id })); setTab('connections'); }}>Hubungkan risiko ↗</button><button type="button" className="rmButton subtle" onClick={() => { setSelectedRiskIds(current => current.includes(activeRisk.id) ? current : [...current, activeRisk.id]); setTab('mitigation'); setPlanFormOpen(true); }}>Masukkan ke RTP gabungan</button><button type="button" className="rmButton danger" disabled={!canEditRisk(activeRisk)} onClick={() => setPendingAction({ kind: 'delete-risk', id: activeRisk.id })}>Hapus</button></div>
        </LiquidGlass>}
        {pendingAction?.kind === 'delete-risk' && <div className="rmInlineConfirm"><div><b>Konfirmasi penghapusan risiko</b><p>Penghapusan akan ditolak apabila risiko memiliki referensi FMEA atau rencana mitigasi. Pertimbangkan mengubah status menjadi Controlled/Accepted agar jejak audit tetap terjaga.</p></div><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="rmButton danger" disabled={saving} onClick={() => void deleteRisk(pendingAction.id)}>Lanjutkan penghapusan</button></div></div>}
      </>}

      {!loading && !error.startsWith('Data Manajemen Risiko') && tab === 'mitigation' && <>
        <div className="rmKpis compact"><LiquidGlass className="rmKpi"><span>Rencana RTP</span><strong>{plans.length}</strong><small>Termasuk draft dan rencana berjalan</small></LiquidGlass><LiquidGlass className="rmKpi"><span>Menunggu persetujuan</span><strong>{plans.filter(p => p.status.startsWith('pending_')).length}</strong><small>Kabid → Direktur → Dewan Pengawas</small></LiquidGlass><LiquidGlass className="rmKpi"><span>Dalam pelaksanaan</span><strong>{plans.filter(p => p.status === 'in_progress').length}</strong><small>Rencana disetujui dan dikerjakan</small></LiquidGlass><LiquidGlass className="rmKpi"><span>Lewat tenggat</span><strong>{plans.filter(p => p.target_date && new Date(p.target_date + 'T23:59:59') < new Date() && !['closed'].includes(p.status)).length}</strong><small>Perlu eskalasi atau penyesuaian</small></LiquidGlass></div>
        <LiquidGlass className="rmPanel"><div className="rmSectionHead"><div><span className="rmEyebrow">MITIGASI TERINTEGRASI</span><h4>Rencana Tindak Pengendalian</h4><p>Satu rencana dapat menangani beberapa risiko yang berbagi penyebab, kontrol, atau proses. Semua tahap persetujuan dicatat.</p></div><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setTab('register')}>Pilih risiko</button><button type="button" className="rmButton primary" onClick={beginPlanForSelection}>＋ Rencana gabungan</button></div></div>
          {planFormOpen && <div className="rmPlanComposer">
            <div className="rmSectionHead"><div><span className="rmEyebrow">PENYUSUNAN RTP</span><h4>Rencana mitigasi untuk {selectedRiskIds.length} risiko</h4><p>Rencana lintas unit sebaiknya menyebutkan koordinator utama dan kontribusi tiap unit yang terlibat.</p></div><button type="button" className="rmButton subtle" onClick={() => setPlanFormOpen(false)}>Tutup formulir</button></div>
            <div className="rmSelectedRisks">{selectedForPlan.map(r => <span key={r.id}>{r.risk_code} · {r.unit_name}</span>)}</div>
            <div className="rmFormGrid">
              <label>Nama / judul rencana <input value={planForm.title} onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))} placeholder="Contoh: penguatan pelaporan hasil kritis" /></label>
              <label>Koordinator / PIC utama <input value={planForm.owner_name} onChange={e => setPlanForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Nama atau jabatan" /></label>
              <label className="full">Sasaran mitigasi <textarea rows={2} value={planForm.objective} onChange={e => setPlanForm(f => ({ ...f, objective: e.target.value }))} placeholder="Perubahan hasil yang hendak dicapai" /></label>
              <label className="full">Aktivitas pengendalian / rencana tindakan <textarea rows={3} value={planForm.action_plan} onChange={e => setPlanForm(f => ({ ...f, action_plan: e.target.value }))} placeholder="Tindakan spesifik, penanggung jawab pelaksana, mekanisme monitoring, dan titik verifikasi…" /></label>
              <label className="full">Indikator hasil / bukti implementasi <textarea rows={2} value={planForm.expected_output} onChange={e => setPlanForm(f => ({ ...f, expected_output: e.target.value }))} placeholder="Bukti yang dapat diverifikasi, ukuran keberhasilan, atau indikator proses/hasil" /></label>
            </div>
            <div className="rmFormGrid three">
              <label>Target waktu <input type="date" value={planForm.target_date} onChange={e => setPlanForm(f => ({ ...f, target_date: e.target.value }))} /></label>
              <label>Target residual kemungkinan <select value={planForm.target_likelihood} onChange={e => setPlanForm(f => ({ ...f, target_likelihood: e.target.value }))}>{[1,2,3,4,5].map(n => <option value={String(n)} key={n}>{n} · {LIKELIHOOD_LABELS[n - 1]}</option>)}</select></label>
              <label>Target residual dampak <select value={planForm.target_impact} onChange={e => setPlanForm(f => ({ ...f, target_impact: e.target.value }))}>{[1,2,3,4,5].map(n => <option value={String(n)} key={n}>{n} · {IMPACT_LABELS[n - 1]}</option>)}</select></label>
            </div>
            <div className="rmCallout"><b>Target hasil</b><p>Target residual yang dipilih menghasilkan skor {riskScore(Number(planForm.target_likelihood), Number(planForm.target_impact))} ({levelFor(riskScore(Number(planForm.target_likelihood), Number(planForm.target_impact)))}). Untuk risiko utama, target penerimaan sebaiknya didukung bukti efektivitas pengendalian dan pertimbangan pimpinan.</p></div>
            <div className="rmFormFooter"><span className="rmFormNote">Draft belum dikirim untuk persetujuan. Periksa cakupan lintas unit sebelum menyimpan.</span><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setPlanFormOpen(false)}>Batal</button><button type="button" className="rmButton primary" disabled={saving} onClick={() => void createPlan()}>{saving ? 'Menyimpan…' : 'Simpan draft RTP'}</button></div></div>
          </div>}
          <div className="rmPlanGrid">
            {plans.map(plan => <button type="button" key={plan.id} className={'rmPlanCard' + (selectedPlanId === plan.id ? ' selected' : '')} onClick={() => { setSelectedPlanId(plan.id); setDecisionNote(''); clearMessages(); }}>
              <div className="rmPlanTop"><span className="rmEyebrow">{plan.plan_code}</span><span className={'rmWorkflowPill ' + plan.status}>{PLAN_STATUS[plan.status] || plan.status}</span></div><b>{plan.title}</b><p>{plan.action_plan}</p><div className="rmPlanMeta"><span>{planRisks.filter(r => r.plan_id === plan.id).length} risiko terhubung</span><span>Target {fmtDate(plan.target_date)}</span></div>
            </button>)}
            {!plans.length && <div className="rmEmptySmall">Belum ada rencana mitigasi. Pilih beberapa risiko dari register, lalu susun rencana gabungan.</div>}
          </div>
        </LiquidGlass>
        {activePlan && <LiquidGlass className="rmPanel">
          <div className="rmSectionHead"><div><span className="rmEyebrow">{activePlan.plan_code} · ALUR PERSETUJUAN</span><h4>{activePlan.title}</h4><p>{activePlan.objective || 'Sasaran mitigasi belum dicantumkan.'}</p></div><span className={'rmWorkflowPill ' + activePlan.status}>{PLAN_STATUS[activePlan.status] || activePlan.status}</span></div>
          <div className="rmApprovalRail">
            {[['pending_kabid', 'Kepala Bidang'], ['pending_director', 'Direktur'], ['pending_board', 'Dewan Pengawas']].map(([stage, label], i) => {
              const sequence = ['pending_kabid', 'pending_director', 'pending_board', 'approved', 'in_progress', 'evaluated', 'closed']
              const currentIndex = sequence.indexOf(activePlan.status)
              const stepIndex = i
              const completed = activePlan.status === 'approved' || activePlan.status === 'in_progress' || activePlan.status === 'evaluated' || activePlan.status === 'closed' || currentIndex > stepIndex
              const current = activePlan.status === stage
              return <div className={'rmApprovalStep' + (completed ? ' completed' : '') + (current ? ' current' : '')} key={stage}><span>{completed ? '✓' : String(i + 1).padStart(2, '0')}</span><b>{label}</b><small>{completed ? 'Disetujui' : current ? 'Menunggu tindakan' : 'Tahap berikutnya'}</small></div>
            })}
          </div>
          <div className="rmPlanFacts"><div><span>Koordinator</span><b>{activePlan.owner_name || 'Belum ditetapkan'}</b></div><div><span>Tenggat</span><b>{fmtDate(activePlan.target_date)}</b></div><div><span>Risiko tercakup</span><b>{activePlanRisks.length}</b></div><div><span>Penilaian residual aktual</span><b>{activePlanRisks.filter(x => x.risk?.residual_score != null).length} / {activePlanRisks.length}</b></div></div>
          <div className="rmSectionHead compactHead"><div><h4>Risiko dalam rencana</h4><p>Hasil residual berasal dari register risiko, bukan sekadar target yang diharapkan.</p></div></div>
          <div className="rmTableWrap"><table className="rmTable"><thead><tr><th>Kode risiko</th><th>Unit</th><th>Baseline</th><th>Target residual</th><th>Residual aktual</th></tr></thead><tbody>
            {activePlanRisks.map(x => <tr key={x.id}><td><button className="rmTextLink" type="button" onClick={() => { if (x.risk) { setSelectedRiskId(x.risk.id); setTab('register'); setRegisterDetailExpanded(true); } }}>{x.risk?.risk_code}</button></td><td>{x.risk?.unit_name}</td><td>{x.risk?.risk_score} · {x.risk?.risk_level}</td><td>{x.target_likelihood && x.target_impact ? riskScore(x.target_likelihood, x.target_impact) + ' · ' + levelFor(riskScore(x.target_likelihood, x.target_impact)) : 'Belum ditetapkan'}</td><td>{x.risk?.residual_score == null ? 'Belum dinilai' : x.risk.residual_score + ' · ' + x.risk.residual_level}</td></tr>)}
          </tbody></table></div>
          <div className="rmWorkflowActions">
            <label className="full">Catatan / alasan tindakan <textarea rows={2} value={decisionNote} onChange={e => setDecisionNote(e.target.value)} placeholder="Wajib diisi untuk mengembalikan atau mencatat hasil evaluasi…" /></label>
            <div className="rmActions wrap">
              {canSubmitPlan(activePlan) && <button type="button" className="rmButton primary" disabled={saving} onClick={() => void transitionPlan(activePlan, 'submit')}>Kirim ke tahap berikutnya →</button>}
              {mayApprove(activePlan) && <button type="button" className="rmButton primary" disabled={saving} onClick={() => void transitionPlan(activePlan, 'approve')}>Setujui & teruskan →</button>}
              {mayReturn(activePlan) && <button type="button" className="rmButton subtle" disabled={saving} onClick={() => void transitionPlan(activePlan, 'return')}>Kembalikan untuk revisi</button>}
              {mayStartPlan(activePlan) && <button type="button" className="rmButton primary" disabled={saving} onClick={() => void transitionPlan(activePlan, 'start')}>Mulai pelaksanaan</button>}
              {mayEvaluatePlan(activePlan) && <button type="button" className="rmButton primary" disabled={saving} onClick={() => void transitionPlan(activePlan, 'evaluate')}>Catat evaluasi</button>}
              {mayClosePlan(activePlan) && <button type="button" className="rmButton primary" disabled={saving || activePlanRisks.some(x => !x.risk || x.risk.residual_score == null || x.risk.residual_score >= 10)} onClick={() => void transitionPlan(activePlan, 'close')}>Tutup rencana</button>}
              {saving && <span className="rmMuted">Menyimpan perubahan…</span>}
            </div>
          </div>
          <div className="rmHistory"><b>Riwayat keputusan</b>{activeEvents.length ? activeEvents.map(e => <div className="rmHistoryRow" key={e.id}><i></i><div><b>{PLAN_STATUS[e.to_status] || e.to_status}</b><p>{e.note || 'Tidak ada catatan'} · {e.actor_name || 'Pengguna'} · {fmtDate(e.created_at)}</p></div></div>) : <p className="rmMuted">Belum ada keputusan workflow.</p>}</div>
        </LiquidGlass>}
      </>}

      {!loading && !error.startsWith('Data Manajemen Risiko') && tab === 'connections' && <>
        <LiquidGlass className="rmPanel">
          <div className="rmSectionHead"><div><span className="rmEyebrow">GRAPH RISIKO</span><h4>Konektor risiko utama</h4><p>Hanya risiko Sangat Tinggi yang dapat menjadi sumber konektor. Sistem mengusulkan risiko terkait dari seluruh sumber berdasarkan kecocokan teks pada peristiwa, penyebab, dampak, kontrol, dan sasaran. Usulan tidak aktif sampai diverifikasi dan ditambahkan.</p></div></div>
          <div className="rmLinkComposer">
            <div className="rmFormGrid">
              <label>Ruangan / kelompok risiko utama <select aria-label="Unit risiko utama" value={unitFilter} disabled={scopedToUnit} onChange={e => { setUnitFilter(e.target.value); setSelectedRiskIds([]); setLinkForm(f => ({ ...f, source: '', target: '', description: '' })); }}><option value="">Pilih ruangan/kelompok sumber</option>{sourceUnitOptions.map(renderSourceUnitOption)}</select></label>
              <label>Risiko utama · Sangat Tinggi <select value={linkForm.source} onChange={e => setLinkForm(f => ({ ...f, source: e.target.value, target: f.target === e.target.value ? '' : f.target, description: '' }))}><option value="">Pilih risiko utama</option>{primaryRisksInUnit.map(renderRiskOption)}</select></label>
              <label>Risiko terkait <select value={linkForm.target} onChange={e => setLinkForm(f => ({ ...f, target: e.target.value }))}><option value="">Pilih target dari seluruh register</option>{risks.filter(r => !connectorPrimary || r.id !== connectorPrimary.id).map(renderRiskOption)}</select></label>
              <label>Jenis hubungan <select value={linkForm.type} onChange={e => setLinkForm(f => ({ ...f, type: e.target.value }))}>{RELATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
              <label className="full">Dasar / penjelasan relasi <input value={linkForm.description} onChange={e => setLinkForm(f => ({ ...f, description: e.target.value }))} placeholder="Tinjau bukti relasi atau gunakan salah satu kandidat berikut" /></label>
            </div>
            <div className="rmFormFooter"><span className="rmFormNote">Record sumber tidak diubah oleh sistem rekomendasi. Periksa mekanisme hubungan sebelum mengaktifkan konektor.</span><button type="button" className="rmButton primary" disabled={saving || !connectorPrimary || !linkForm.target} onClick={() => void addLink()}>＋ Aktifkan konektor</button></div>
          </div>
          {connectorPrimary ? <div className="rmSelectionBar">
            <div><b>Risiko utama: {connectorPrimary.risk_code} · {connectorPrimary.risk_level}</b><span>{connectorPrimary.risk_event} · {connectorPrimary.unit_name} · sumber {connectorPrimary.source_sheet || 'Input AUREKA'}{connectorPrimary.source_row_number ? ' baris ' + connectorPrimary.source_row_number : ''}</span></div>
            <button type="button" className="rmButton primary" disabled={relatedRiskIds.length < 2} onClick={prepareIntegratedPlan}>Siapkan RTP gabungan ({relatedRiskIds.length} risiko) →</button>
          </div> : <div className="rmEmptySmall">Tidak ada risiko Sangat Tinggi pada kelompok sumber ini. Pilih kelompok lain atau periksa nilai risiko pada register.</div>}
          <div className="rmSectionHead compactHead"><div><h4>Kandidat konektor yang disarankan</h4><p>{connectorPrimary ? 'Maksimal 8 kandidat teratas. Kecocokan dihitung dari kata-kata pada record, bukan bukti kausal otomatis.' : 'Pilih risiko utama untuk melihat kandidat.'}</p></div></div>
          <div className="rmGraphList">{connectorPrimary && connectorSuggestions.map(suggestion => {
            const relationshipLabel = RELATION_TYPES.find(type => type.value === suggestion.recommendedType)?.label || suggestion.recommendedType
            const generatedDescription = 'Usulan kecocokan teks ' + suggestion.score + '%; bidang yang cocok: ' + suggestion.evidence.join(', ') + '; kata kunci: ' + suggestion.matchWords.join(', ') + '. Verifikasi hubungan proses sebelum mengaktifkan.'
            return <div className="rmGraphLink" key={suggestion.risk.id}>
              <button type="button" className="rmGraphNode" onClick={() => setLinkForm(f => ({ ...f, target: suggestion.risk.id, type: suggestion.recommendedType, description: generatedDescription }))}>
                <span>{suggestion.risk.risk_code} · {suggestion.risk.unit_name}</span><b>{suggestion.risk.risk_event}</b><small>{suggestion.risk.source_sheet ? 'Sumber ' + suggestion.risk.source_sheet + (suggestion.risk.source_row_number ? ' · baris ' + suggestion.risk.source_row_number : '') : 'Record AUREKA'} · {suggestion.risk.risk_level}</small>
              </button>
              <div className="rmConnector"><span>Kecocokan teks {suggestion.score}%</span><i>→</i><small>{suggestion.evidence.join(', ')}<br />Kata kunci: {suggestion.matchWords.join(', ')}<br />Usulan: {relationshipLabel}</small></div>
              <button type="button" className="rmButton subtle" onClick={() => { setLinkForm(f => ({ ...f, target: suggestion.risk.id, type: suggestion.recommendedType, description: generatedDescription })); setMessage('Kandidat dimasukkan ke form. Verifikasi jenis dan dasar hubungan, lalu aktifkan konektor.'); }}>Gunakan kandidat</button>
            </div>
          })}{connectorPrimary && !connectorSuggestions.length && <div className="rmEmptySmall">Belum ada kandidat yang melewati ambang kecocokan teks. Hal ini tidak membuktikan tidak ada hubungan; tinjau record manual atau tambah kata kunci yang relevan.</div>}</div>
          <div className="rmSectionHead compactHead"><div><h4>Konektor aktif pada ruangan ini</h4><p>{visibleLinks.length} konektor · sumber setiap konektor dibatasi pada risiko utama Sangat Tinggi dalam kelompok sumber terpilih. Target dapat berasal dari unit lain.</p></div></div>
          <div className="rmGraphList">{visibleLinks.map(link => {
            const a = risks.find(r => r.id === link.source_risk_id), b = risks.find(r => r.id === link.target_risk_id)
            return <div className="rmGraphLink" key={link.id}>
              <button type="button" className="rmGraphNode" onClick={() => { if (a) { setUnitFilter(sourceUnitLabel(a)); setSelectedRiskId(a.id); setTab('register'); setRegisterDetailExpanded(true); } }}><span>{a?.risk_code || 'Risiko sumber'}</span><b>{a?.risk_event || 'Tidak ditemukan'}</b><small>{a?.unit_name} · Sangat Tinggi</small></button>
              <div className="rmConnector"><span>{RELATION_TYPES.find(t => t.value === link.relationship_type)?.label || link.relationship_type}</span><i>⟷</i><small>{link.description || 'Relasi belum dijelaskan'}</small></div>
              <button type="button" className="rmGraphNode" onClick={() => { if (b) { setUnitFilter(sourceUnitLabel(b)); setSelectedRiskId(b.id); setTab('register'); setRegisterDetailExpanded(true); } }}><span>{b?.risk_code || 'Risiko terkait'}</span><b>{b?.risk_event || 'Tidak ditemukan'}</b><small>{b?.unit_name} · {b?.risk_level}</small></button>
              <button type="button" className="rmIconButton dangerText" aria-label="Hapus konektor" onClick={() => setPendingAction({ kind: 'delete-link', id: link.id })}>×</button>
            </div>
          })}{!visibleLinks.length && <div className="rmEmptySmall">Belum ada konektor aktif pada kelompok sumber ini. Pilih kandidat, verifikasi dasarnya, lalu aktifkan konektor.</div>}</div>
          {pendingAction?.kind === 'delete-link' && <div className="rmInlineConfirm"><div><b>Konfirmasi penghapusan konektor</b><p>Data risiko tetap dipertahankan; hanya relasi yang dihapus.</p></div><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="rmButton danger" disabled={saving} onClick={() => void deleteLink(pendingAction.id)}>Hapus konektor</button></div></div>}
        </LiquidGlass>
      </>}

      {!loading && !error.startsWith('Data Manajemen Risiko') && tab === 'fmea' && <>
        <div className="rmKpis compact"><LiquidGlass className="rmKpi"><span>Analisis FMEA</span><strong>{fmeas.length}</strong><small>Modus kegagalan terdaftar</small></LiquidGlass><LiquidGlass className="rmKpi"><span>RPN ≥ 30 atau S ≥ 4</span><strong>{fmeas.filter(f => f.rpn >= 30 || f.severity >= 4).length}</strong><small>Prioritas penanganan tinggi</small></LiquidGlass><LiquidGlass className="rmKpi"><span>RPN maksimum</span><strong>{fmeas.length ? Math.max(...fmeas.map(f => f.rpn)) : '—'}</strong><small>Skor S × O × D</small></LiquidGlass><LiquidGlass className="rmKpi"><span>Target tindakan belum lewat</span><strong>{fmeas.filter(f => f.target_date && new Date(f.target_date + 'T23:59:59') < new Date() && f.status !== 'Closed').length}</strong><small>Perlu tindak lanjut pemilik</small></LiquidGlass></div>
        <LiquidGlass className="rmPanel"><div className="rmSectionHead"><div><span className="rmEyebrow">ANALISIS MODUS KEGAGALAN</span><h4>FMEA / HFMEA</h4><p>Engine FMEA dipisahkan dari baseline risk scoring. RPN = Severity × Occurrence × Detection; RPN bukan skor matriks kemungkinan–dampak.</p></div><button type="button" className="rmButton primary" onClick={() => openFmea()}>＋ Analisis FMEA</button></div>
          <div className="rmTableWrap"><table className="rmTable"><thead><tr><th>Kode FMEA</th><th>Unit / Proses</th><th>Modus kegagalan</th><th>S–O–D</th><th>RPN</th><th>Prioritas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{fmeas.map(f => <tr key={f.id}><td><b>{f.fmea_code}</b></td><td>{f.unit_name}<small className="rmCellSmall">{f.process_name}</small></td><td><b>{f.failure_mode}</b><small className="rmCellSmall">{f.risk_register_id ? risks.find(r => r.id === f.risk_register_id)?.risk_code || 'Risiko tertaut' : 'Belum ditautkan ke register'}</small></td><td>{f.severity}–{f.occurrence}–{f.detection}</td><td><strong className="rmScore">{f.rpn}</strong></td><td><span className={'rmBadge ' + (f.priority === 'Tinggi' ? 'very-high' : f.priority === 'Sedang' ? 'moderate' : 'low')}>{f.priority}</span></td><td>{renderStatus(f.status)}</td><td><button type="button" className="rmIconButton" onClick={() => openFmea(f)} disabled={!canManageAll && !risks.some(r => r.id === f.risk_register_id && canEditRisk(r))} aria-label="Edit FMEA">✎</button></td></tr>)}{!fmeas.length && <tr><td colSpan={8}><div className="rmEmptySmall">Belum ada analisis FMEA. Tambahkan analisis dan tautkan ke risk register bila relevan.</div></td></tr>}</tbody></table></div>
        </LiquidGlass>
        {fmeaEditorOpen && <RmModal label="Analisis FMEA" error={error}><LiquidGlass className="rmPanel rmEditor"><div className="rmSectionHead"><div><span className="rmEyebrow">FMEA / HFMEA</span><h4>{editingFmeaId ? 'Edit analisis FMEA' : 'Analisis FMEA baru'}</h4><p>Definisikan proses, failure mode, efek, penyebab, kontrol, dan tindakan pengurangan risiko.</p></div><button type="button" className="rmButton subtle" onClick={() => setFmeaEditorOpen(false)}>Tutup panel</button></div>
          <div className="rmFormGrid">
            <label>Hubungkan ke risiko <select value={String(fmeaForm.risk_register_id || '')} onChange={e => { const risk = risks.find(r => r.id === e.target.value); setFmeaForm(f => ({ ...f, risk_register_id: e.target.value || null, unit_name: risk?.unit_name || f.unit_name })); }}><option value="">Tidak ditautkan</option>{risks.map(renderRiskOption)}</select></label>
            <label>Unit kerja <select value={String(fmeaForm.unit_name || '')} onChange={e => setFmeaForm(f => ({ ...f, unit_name: e.target.value }))}>{unitOptions.map(r => <option key={r.id}>{r.name}</option>)}</select></label>
            <label>Nama proses <input value={String(fmeaForm.process_name || '')} onChange={e => setFmeaForm(f => ({ ...f, process_name: e.target.value }))} /></label>
            <label>Penanggung jawab <input value={String(fmeaForm.owner_name || '')} onChange={e => setFmeaForm(f => ({ ...f, owner_name: e.target.value }))} /></label>
            <label className="full">Modus kegagalan <textarea rows={2} value={String(fmeaForm.failure_mode || '')} onChange={e => setFmeaForm(f => ({ ...f, failure_mode: e.target.value }))} /></label>
            <label className="full">Dampak / efek kegagalan <textarea rows={2} value={String(fmeaForm.failure_effect || '')} onChange={e => setFmeaForm(f => ({ ...f, failure_effect: e.target.value }))} /></label>
            <label className="full">Penyebab potensial <textarea rows={2} value={String(fmeaForm.causes || '')} onChange={e => setFmeaForm(f => ({ ...f, causes: e.target.value }))} /></label>
            <label className="full">Kontrol yang sudah ada <textarea rows={2} value={String(fmeaForm.existing_controls || '')} onChange={e => setFmeaForm(f => ({ ...f, existing_controls: e.target.value }))} /></label>
          </div>
          <div className="rmFormGrid three">
            {[
              ['severity', 'Severity (S)'], ['occurrence', 'Occurrence (O)'], ['detection', 'Detection (D)'],
            ].map(([key, label]) => <label key={key}>{label}<select value={String((fmeaForm as any)[key] || 1)} onChange={e => setFmeaForm(f => ({ ...f, [key]: Number(e.target.value) }))}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>)}
            <div className="rmScorePreview"><span>RPN · S × O × D</span><strong>{Number(fmeaForm.severity || 1) * Number(fmeaForm.occurrence || 1) * Number(fmeaForm.detection || 1)}</strong><span className={'rmBadge ' + (fmeaPriority(Number(fmeaForm.severity || 1), Number(fmeaForm.severity || 1) * Number(fmeaForm.occurrence || 1) * Number(fmeaForm.detection || 1)) === 'Tinggi' ? 'very-high' : fmeaPriority(Number(fmeaForm.severity || 1), Number(fmeaForm.severity || 1) * Number(fmeaForm.occurrence || 1) * Number(fmeaForm.detection || 1)) === 'Sedang' ? 'moderate' : 'low')}>{fmeaPriority(Number(fmeaForm.severity || 1), Number(fmeaForm.severity || 1) * Number(fmeaForm.occurrence || 1) * Number(fmeaForm.detection || 1))}</span></div>
            <label className="full">Rencana tindakan / redesign proses <textarea rows={3} value={String(fmeaForm.action_plan || '')} onChange={e => setFmeaForm(f => ({ ...f, action_plan: e.target.value }))} /></label>
            <label>Target waktu <input type="date" value={String(fmeaForm.target_date || '')} onChange={e => setFmeaForm(f => ({ ...f, target_date: e.target.value }))} /></label>
            <label>Status tindakan <select value={String(fmeaForm.status || 'Open')} onChange={e => setFmeaForm(f => ({ ...f, status: e.target.value }))}>{['Open', 'In Progress', 'Evaluated', 'Closed'].map(s => <option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="rmFormFooter"><span className="rmFormNote">RPN tinggi atau Severity ≥ 4 memerlukan evaluasi prioritas dan pertimbangan RCA/redesign; keputusan klinis tetap memerlukan telaah tim terkait.</span><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setFmeaEditorOpen(false)}>Batal</button><button type="button" className="rmButton primary" disabled={saving} onClick={() => void saveFmea()}>{saving ? 'Menyimpan…' : 'Simpan FMEA'}</button></div></div>
          {pendingAction?.kind === 'delete-fmea' && <div className="rmInlineConfirm"><b>Hapus FMEA terpilih?</b><div className="rmActions"><button type="button" className="rmButton subtle" onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="rmButton danger" onClick={async () => { if (!pendingAction) return; const result = await db.from('fmea_analyses').delete().eq('id', pendingAction.id); if (result.error) setError(result.error.message); else { setMessage('FMEA dihapus.'); setPendingAction(null); await loadData(); } }}>Hapus</button></div></div>}
        </LiquidGlass></RmModal>}
      </>}

      <div className="rmFooterNote">Kerangka analisis menggunakan Kepmenkes HK.01.07/MENKES/1354/2024 untuk selera risiko. Tindakan dan persetujuan tidak menggantikan penetapan formal kebijakan manajemen risiko rumah sakit.</div>
    </div>
  )
}
