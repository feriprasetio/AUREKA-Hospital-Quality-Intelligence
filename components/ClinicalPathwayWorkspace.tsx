'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

type Policy = 'required' | 'conditional' | 'not_scheduled'
type CellStatus = 'done' | 'not_done' | 'not_applicable' | ''
type ScheduleCell = { day: string; policy: Policy }
type CPItem = {
  id: string; section: string; profession: string; choice: string; stage: string
  label: string; detail: string; schedule: ScheduleCell[]; oppe?: boolean
}
type Criterion = { id: string; label: string; type?: string; expected?: boolean }
type Template = {
  code: string; name: string; icd10: string; source_filename: string; status: string
  version: number; days: string[]; items: CPItem[]
  clinical_fields: { id: string; label: string; hint: string; code_label: string; additional_label: string }[]
  source_notes: string[]
  scoring_rules: {
    completion_threshold_pct: number; compliance_target_pct: number
    completion_definition: string; compliance_definition: string; variation_required: boolean
    variation_definition: string; inclusion_mode: string; inclusion_criteria: Criterion[]
    source_section_d: { item: string; standard: string; source_result: string }[]
  }
}
type CellAnswer = {
  status?: CellStatus; performer_name?: string; performer_profession?: string
  performed_at?: string; evidence?: string; note?: string
}
type Answers = Record<string, Record<string, CellAnswer>>
type Variation = { id: string; date: string; item_id?: string; variation: string; reason: string; justification: string }
type VariationState = { reviewed: boolean; items: Variation[] }
type AuditForm = {
  id?: string; room_id: number | null; template: Template; patient_name: string
  medical_record_no: string; sex: string; date_of_birth: string; admission_date: string
  discharge_date: string; unit_name: string; dpjp: string; clinical_data: Record<string, string>
  inclusion_json: Record<string, boolean | undefined>; answers_json: Answers
  variations_json: VariationState; status: string
}
type AuditRow = {
  id: string; room_id: number; template_code: string; template_name: string
  patient_name: string; medical_record_no: string; admission_date: string | null
  status: string; calculation_json: Record<string, any>; created_at: string
  unit_name?: string
}
type Room = { id: number; name: string }
type Props = { initialRoomId: number | null; rooms: Room[]; isAdmin: boolean; userName: string; onBack: () => void }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const BASE_PATH = '/AUREKA-Hospital-Quality-Intelligence'
const STATUS_LABEL: Record<string, string> = { draft: 'Draf', submitted: 'Diajukan', validated: 'Tervalidasi', archived: 'Diarsipkan' }

const CSS = ".cpRoot{display:grid;gap:14px;color:var(--ink)}.cpRoot .cpGlass{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.54),rgba(255,255,255,.22));border:1px solid rgba(255,255,255,.72);border-radius:24px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.78);backdrop-filter:blur(24px) saturate(165%);-webkit-backdrop-filter:blur(24px) saturate(165%)}.cpHead{padding:20px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.cpEyebrow{font-size:10px;font-weight:900;letter-spacing:.12em;color:var(--accent2);text-transform:uppercase}.cpHead h3{font-size:28px;letter-spacing:-.045em;margin:7px 0 5px}.cpHead p{font-size:12px;color:var(--muted);margin:0;max-width:780px;line-height:1.6}.cpActions{display:flex;gap:8px;flex-wrap:wrap}.cpBtn{min-height:40px;border:1px solid rgba(255,255,255,.82);background:rgba(255,255,255,.5);color:#214a39;border-radius:13px;padding:9px 13px;font-size:11px;font-weight:850;cursor:pointer}.cpBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border-color:transparent}.cpBtn:disabled{opacity:.5;cursor:not-allowed}.cpGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cpTile{padding:17px;text-align:left;width:100%;cursor:pointer;color:var(--ink);transition:transform .18s,border-color .18s}.cpTile:hover{transform:translateY(-2px);border-color:rgba(var(--accent-rgb),.35)}.cpTileTop{display:flex;justify-content:space-between;align-items:center;gap:8px}.cpTileIcon{width:39px;height:39px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent2);font-size:18px}.cpBadge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;background:#e8f7ef;color:#216b49;white-space:nowrap}.cpBadge.draft{background:#fff4d8;color:#835c15}.cpBadge.retired{background:#eceeed;color:#69746e}.cpTile h4{font-size:16px;line-height:1.35;margin:14px 0 4px}.cpTile p{font-size:11px;color:var(--muted);line-height:1.55;margin:0}.cpTileFoot{border-top:1px solid rgba(26,69,48,.09);display:flex;justify-content:space-between;gap:8px;margin-top:15px;padding-top:12px;font-size:10px;font-weight:850;color:var(--accent2)}.cpKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cpKpi{padding:14px 16px}.cpKpi span{display:block;color:var(--muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.cpKpi strong{display:block;font-size:23px;margin-top:5px;letter-spacing:-.03em}.cpKpi small{font-size:10px;color:var(--muted)}.cpToolbar{display:flex;gap:10px;flex-wrap:wrap;padding:14px 16px;align-items:end}.cpField{display:grid;gap:6px;min-width:0}.cpField label,.cpLabel{font-size:10px;font-weight:900;color:#68786f;letter-spacing:.035em}.cpField input,.cpField select,.cpField textarea,.cpInput{width:100%;min-height:42px;border:1px solid rgba(25,60,45,.14);border-radius:12px;background:rgba(255,255,255,.7);padding:10px 12px;color:var(--ink);outline:none;font-size:12px}.cpField textarea{min-height:72px;resize:vertical}.cpField input:focus,.cpField select:focus,.cpField textarea:focus,.cpInput:focus{border-color:rgba(var(--accent-rgb),.6);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.08)}.cpSearch{flex:1;min-width:210px}.cpSelect{min-width:170px}.cpNotice{padding:12px 15px;border-radius:14px;background:#fff7e5;border:1px solid #f2dfb4;color:#77591d;font-size:11px;line-height:1.55}.cpNotice.info{background:#edf7f3;border-color:#d6ebe1;color:#245d48}.cpNotice.error{background:#fff0ef;border-color:#f4d0cc;color:#8d332d}.cpPanel{padding:17px}.cpPanel h4{margin:0 0 12px;font-size:15px}.cpBack{border:0;background:transparent;color:var(--accent2);font-size:11px;font-weight:900;padding:6px 0;cursor:pointer}.cpRecordList{display:grid;gap:8px}.cpRecord{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(25,60,45,.1);border-radius:14px;background:rgba(255,255,255,.42)}.cpRecord b{display:block;font-size:12px}.cpRecord small{display:block;font-size:10px;color:var(--muted);margin-top:4px}.cpRecordRight{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cpFormGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.cpFormGrid .span2{grid-column:span 2}.cpSectionHead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0 9px}.cpSectionHead h4{font-size:16px;margin:0}.cpSectionHead p{font-size:10px;color:var(--muted);margin:4px 0 0}.cpTableWrap{max-width:100%;overflow:auto;max-height:68vh;border:1px solid rgba(25,60,45,.12);border-radius:15px;background:rgba(255,255,255,.55)}table.cpTable{width:100%;min-width:1140px;border-collapse:separate;border-spacing:0;font-size:11px}table.cpTable th,table.cpTable td{padding:9px 10px;border-bottom:1px solid rgba(25,60,45,.1);border-right:1px solid rgba(25,60,45,.07);vertical-align:middle;text-align:left}table.cpTable th{position:sticky;top:0;z-index:3;background:rgba(246,250,247,.97);font-size:9px;color:#69796f;text-transform:uppercase;letter-spacing:.035em;white-space:nowrap}table.cpTable th.cpDayCol{text-align:center;min-width:72px}table.cpTable td:nth-child(1){min-width:150px;max-width:190px;white-space:normal}table.cpTable td:nth-child(2){min-width:140px;max-width:190px;white-space:normal}table.cpTable td:nth-child(3){min-width:240px;white-space:normal}table.cpTable td:nth-child(4){min-width:230px;white-space:normal;color:#607168}table.cpTable .cpGroup td{background:rgba(var(--accent-rgb),.1);color:var(--accent2);font-size:10px;font-weight:950;position:sticky;left:0;z-index:1}.cpCell{min-width:72px;text-align:center!important;padding:5px!important}.cpCell.required{background:rgba(145,203,81,.25)}.cpCell.conditional{background:rgba(255,225,53,.28)}.cpCell.not_scheduled{background:rgba(255,255,255,.24);color:#b0b8b3}.cpCellControls{display:flex;align-items:center;justify-content:center;gap:5px}.cpMark{height:28px;min-width:28px;border:1px solid rgba(15,118,86,.2);border-radius:8px;background:rgba(255,255,255,.65);font-size:14px;font-weight:900;color:var(--accent2);cursor:pointer}.cpMark.done{background:#dff3e6;border-color:#8bc6a4;color:#12683e}.cpMark.not_done{background:#fff0ef;border-color:#e9b5af;color:#ac3932}.cpMark.not_applicable{background:#ececfb;border-color:#cbcbee;color:#48478b;font-size:10px}.cpCellEdit{border:0;background:transparent;color:#718177;cursor:pointer;font-size:13px;padding:4px}.cpSubtle{font-size:9px;color:var(--muted)}.cpCellDetail{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:10px;padding:14px;background:rgba(var(--accent-rgb),.06);border:1px solid rgba(var(--accent-rgb),.18);border-radius:15px;margin:10px 0}.cpCellDetail .cpWide{grid-column:1/-1}.cpScoreGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cpScore{padding:13px;border-radius:14px;background:rgba(255,255,255,.58);border:1px solid rgba(24,64,43,.1)}.cpScore span{display:block;font-size:9px;color:var(--muted);font-weight:900;text-transform:uppercase}.cpScore strong{display:block;font-size:23px;margin:4px 0}.cpScore small{display:block;color:var(--muted);font-size:9px;line-height:1.45}.cpPass{background:#e8f7ef;color:#216b49}.cpFail{background:#fff0ef;color:#8d332d}.cpPending{background:#fff6dd;color:#805d18}.cpCriterionList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cpCriterion{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(24,64,43,.1);border-radius:13px;padding:11px 12px;background:rgba(255,255,255,.45)}.cpCriterion label{font-size:11px;font-weight:800}.cpToggleGroup{display:flex;gap:5px;flex-wrap:wrap}.cpToggle{border:1px solid rgba(25,60,45,.13);background:#fff;border-radius:9px;padding:7px 9px;font-size:10px;font-weight:850;cursor:pointer}.cpToggle.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent2)}.cpVarList{display:grid;gap:10px}.cpVar{border:1px solid rgba(25,60,45,.13);background:rgba(255,255,255,.4);border-radius:14px;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cpVarHead{display:flex;justify-content:space-between;align-items:center;grid-column:1/-1}.cpVarHead b{font-size:11px}.cpVar .cpField.full{grid-column:1/-1}.cpFooter{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 18px;border-top:1px solid rgba(25,60,45,.1)}.cpEmpty{padding:22px;text-align:center;color:var(--muted);font-size:11px}.cpBuilderTable{max-height:62vh}.cpBuilderInput{min-width:180px}.cpBuilderDay{min-width:115px}.cpOppe{display:flex;align-items:center;gap:6px;font-size:10px}.cpSourceNotes{display:grid;gap:6px}.cpTiny{font-size:9px;color:var(--muted)}@media(max-width:1080px){.cpGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpKpis,.cpScoreGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpFormGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpCellDetail{grid-template-columns:1fr 1fr}}@media(max-width:650px){.cpGrid,.cpKpis,.cpScoreGrid,.cpCriterionList,.cpFormGrid{grid-template-columns:1fr}.cpHead h3{font-size:23px}.cpFormGrid .span2{grid-column:auto}.cpCellDetail,.cpVar{grid-template-columns:1fr}.cpCellDetail .cpWide,.cpVar .cpField.full,.cpVarHead{grid-column:auto}.cpRecord{grid-template-columns:1fr}.cpRecordRight{justify-content:flex-start}.cpSectionHead{align-items:flex-start}}"

function normalizeCatalog(raw: any): Template[] {
  return (raw?.pathways || []).map((row: any[]) => {
    const [code, name, icd10, source_filename, status, version, days, rawItems, fields, notes, scoring_rules] = row
    return {
      code, name, icd10: icd10 || '', source_filename, status, version, days,
      items: (rawItems || []).map((it: any[]) => ({
        id: it[0], section: it[1] || '', profession: it[2] || '', choice: it[3] || '',
        stage: it[4] || '', label: it[5] || '', detail: it[6] || '',
        schedule: days.map((day: string, i: number) => ({
          day, policy: it[7]?.[i] === 'R' ? 'required' : it[7]?.[i] === 'C' ? 'conditional' : 'not_scheduled',
        })), oppe: false,
      })),
      clinical_fields: (fields || []).map((f: any[], i: number) => ({
        id: 'source_field_' + i, label: f[0] || ('Data klinis ' + (i + 1)),
        hint: f[1] || '', code_label: f[2] || '', additional_label: f[3] || '',
      })),
      source_notes: notes || [],
      scoring_rules: scoring_rules || {
        completion_threshold_pct: 85, compliance_target_pct: 100,
        completion_definition: 'Keterisian item wajib dan kondisional yang telah diputuskan.',
        compliance_definition: 'Item sesuai dibagi seluruh item yang telah dinilai, dikalikan 100%.',
        variation_required: true,
        variation_definition: 'Variasi wajib dilengkapi tanggal, alasan, dan justifikasi.',
        inclusion_mode: 'all', inclusion_criteria: [], source_section_d: [],
      },
    } as Template
  })
}

async function fetchCatalog(): Promise<Template[]> {
  const partNames = ['01', '02', '03', '04']
  const parts = await Promise.all(partNames.map(async (part) => {
    const response = await fetch(BASE_PATH + '/clinical-pathway-catalog-' + part + '.b64', { cache: 'force-cache' })
    if (!response.ok) throw new Error('Master CP ' + part + ' tidak dapat dimuat (HTTP ' + response.status + ').')
    return (await response.text()).trim()
  }))
  const compressed = Uint8Array.from(atob(parts.join('')), (c) => c.charCodeAt(0))
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const catalog = JSON.parse(await new Response(stream).text())
  return normalizeCatalog(catalog)
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function n(value: unknown): number { const x = Number(value); return Number.isFinite(x) ? x : 0 }
function fmtDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
function policyLabel(policy: Policy): string {
  return policy === 'required' ? 'Wajib' : policy === 'conditional' ? 'Kondisional' : 'Tidak dijadwalkan'
}
function cellKey(itemId: string, day: string): string { return itemId + '|' + day }
function cellStatus(form: AuditForm, itemId: string, day: string): CellStatus {
  return (form.answers_json[itemId]?.[day]?.status || '') as CellStatus
}
function calcClient(form: AuditForm) {
  let expected = 0, filled = 0, done = 0, notDone = 0, na = 0, oppeCells = 0, oppeMissing = 0
  form.template.items.forEach((item) => {
    item.schedule.forEach((sched) => {
      if (sched.policy !== 'not_scheduled') {
        expected++
        const ans = form.answers_json[item.id]?.[sched.day]
        if (ans?.status === 'done' || ans?.status === 'not_done' || ans?.status === 'not_applicable') {
          filled++
          if (ans.status === 'done') done++
          if (ans.status === 'not_done') notDone++
          if (ans.status === 'not_applicable') na++
        }
        if (item.oppe && ans && (ans.status === 'done' || ans.status === 'not_done')) {
          oppeCells++
          if (!String(ans.performer_name || '').trim()) oppeMissing++
        }
      }
    })
  })
  const completion = expected ? Math.round((filled / expected) * 10000) / 100 : null
  const evaluation = done + notDone
  const compliance = evaluation ? Math.round((done / evaluation) * 10000) / 100 : null
  const criteria = form.template.scoring_rules.inclusion_criteria || []
  const inclusionReady = criteria.every((c) => typeof form.inclusion_json[c.id] === 'boolean')
  const included = inclusionReady && criteria.every((c) => form.inclusion_json[c.id] === (c.expected !== false))
  const variations = form.variations_json.items || []
  const variationsReviewed = form.variations_json.reviewed === true
  const variationComplete = variationsReviewed && variations.every((v) =>
    !!v.date && !!String(v.variation || '').trim() && !!String(v.reason || '').trim() && !!String(v.justification || '').trim())
  const threshold = n(form.template.scoring_rules.completion_threshold_pct || 85)
  const target = n(form.template.scoring_rules.compliance_target_pct || 100)
  const completionPass = completion !== null && completion >= threshold
  const compliancePass = compliance !== null && compliance >= target
  const sectionDPass = inclusionReady && included && completionPass && compliancePass && variationComplete
  return { expected, filled, done, notDone, na, completion, evaluation, compliance, criteria, inclusionReady, included,
    variationCount: variations.length, variationsReviewed, variationComplete, threshold, target,
    completionPass, compliancePass, sectionDPass, oppeCells, oppeMissing }
}

function fromDatabase(row: any, fallback: Template, roomName: string): AuditForm {
  const t = row.template_snapshot && row.template_snapshot.items ? row.template_snapshot as Template : fallback
  return {
    id: row.id, room_id: Number(row.room_id), template: clone(t), patient_name: row.patient_name || '',
    medical_record_no: row.medical_record_no || '', sex: row.sex || '', date_of_birth: row.date_of_birth || '',
    admission_date: row.admission_date || '', discharge_date: row.discharge_date || '',
    unit_name: row.unit_name || roomName || '', dpjp: row.dpjp || '',
    clinical_data: row.clinical_data || {}, inclusion_json: row.inclusion_json || {},
    answers_json: row.answers_json || {}, variations_json: row.variations_json || { reviewed: false, items: [] },
    status: row.status || 'draft',
  }
}

export default function ClinicalPathwayWorkspace({ initialRoomId, rooms, isAdmin, userName, onBack }: Props) {
  const [catalog, setCatalog] = useState<Template[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [masterReady, setMasterReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info')
  const [screen, setScreen] = useState<'library' | 'diagnosis' | 'audit' | 'builder'>('library')
  const [selectedCode, setSelectedCode] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(initialRoomId)
  const [search, setSearch] = useState('')
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [form, setForm] = useState<AuditForm | null>(null)
  const [focusedCell, setFocusedCell] = useState<{ itemId: string; day: string } | null>(null)
  const [builder, setBuilder] = useState<Template | null>(null)

  const selectedTemplate = templates.find((x) => x.code === selectedCode) || catalog.find((x) => x.code === selectedCode) || null
  const roomNames = useMemo(() => new Map(rooms.map((r) => [Number(r.id), r.name])), [rooms])
  const score = useMemo(() => form ? calcClient(form) : null, [form])
  const filteredTemplates = useMemo(() => templates
    .filter((t) => t.status !== 'retired' || isAdmin)
    .filter((t) => (t.name + ' ' + t.icd10 + ' ' + t.code).toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'id')), [templates, search, isAdmin])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const source = await fetchCatalog()
      setCatalog(source)
      let remote: any[] = []
      let remoteError: any = null
      const first = await q().from('clinical_pathway_templates').select('*').order('name')
      remoteError = first.error
      remote = first.data || []
      if (!remoteError && isAdmin) {
        const codes = new Set(remote.map((r) => r.code))
        const missing = source.filter((t) => !codes.has(t.code))
        if (missing.length) {
          const user = await sb.auth.getUser()
          const actor = user.data.user?.id || null
          const { error: seedError } = await q().from('clinical_pathway_templates').insert(missing.map((t) => ({
            code: t.code, name: t.name, icd10: t.icd10, status: t.status, version: t.version,
            template_json: t, source_filename: t.source_filename, created_by: actor, updated_by: actor,
          })))
          if (seedError) {
            // Concurrent first-open is harmless if another Super Admin inserted the same master.
            const second = await q().from('clinical_pathway_templates').select('*').order('name')
            if (second.error) throw seedError
            remote = second.data || []
          } else {
            const second = await q().from('clinical_pathway_templates').select('*').order('name')
            if (second.error) throw second.error
            remote = second.data || []
          }
        }
      }
      const mapRow = (row: any): Template => ({
        ...(row.template_json || {}),
        code: row.code, name: row.name, icd10: row.icd10 || '',
        status: row.status, version: row.version,
        source_filename: row.source_filename || row.template_json?.source_filename || '',
      })
      if (remoteError) {
        setTemplates(source)
        setMasterReady(false)
        setMessage('Format master CP belum dapat diverifikasi di Supabase. Data audit belum dapat disimpan sampai koneksi master pulih.')
        setMessageKind('error')
      } else {
        const byCode = new Map(remote.map((r) => [r.code, mapRow(r)]))
        const shown = source.map((t) => byCode.get(t.code) || t).filter((t) => t.status !== 'retired' || isAdmin)
        setTemplates(shown)
        setMasterReady(source.every((t) => byCode.has(t.code)))
        if (!source.every((t) => byCode.has(t.code))) {
          setMessage('Sebagian master CP belum tersinkron di Supabase. Super Admin perlu membuka modul ini untuk menyinkronkan format sebelum audit disimpan.')
          setMessageKind('error')
        }
      }
    } catch (e: any) {
      setMessage(e?.message || 'Gagal memuat master Clinical Pathway.')
      setMessageKind('error')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  const loadAudits = useCallback(async (code: string) => {
    if (!code) { setAudits([]); return }
    setAuditLoading(true)
    try {
      let req: any = q().from('clinical_pathway_audits')
        .select('id,room_id,template_code,template_name,patient_name,medical_record_no,admission_date,status,calculation_json,created_at,unit_name')
        .eq('template_code', code).neq('status', 'archived')
        .order('created_at', { ascending: false }).limit(500)
      if (selectedRoomId != null) req = req.eq('room_id', selectedRoomId)
      const { data, error } = await req
      if (error) throw error
      setAudits((data || []) as AuditRow[])
    } catch (e: any) {
      setMessage('Gagal memuat daftar audit CP: ' + (e?.message || 'Kesalahan server.'))
      setMessageKind('error')
    } finally {
      setAuditLoading(false)
    }
  }, [selectedRoomId])

  useEffect(() => { void loadTemplates() }, [loadTemplates])
  useEffect(() => {
    if (screen === 'diagnosis' && selectedCode) void loadAudits(selectedCode)
  }, [screen, selectedCode, selectedRoomId, loadAudits])

  function chooseTemplate(t: Template) {
    setSelectedCode(t.code)
    setMessage('')
    setScreen('diagnosis')
  }

  function newAudit() {
    if (!selectedTemplate) return
    const roomId = selectedRoomId ?? (isAdmin ? null : initialRoomId)
    setForm({
      room_id: roomId, template: clone(selectedTemplate), patient_name: '', medical_record_no: '', sex: '',
      date_of_birth: '', admission_date: '', discharge_date: '',
      unit_name: roomNames.get(Number(roomId)) || (roomId == null ? '' : ''), dpjp: '',
      clinical_data: {}, inclusion_json: {}, answers_json: {}, variations_json: { reviewed: false, items: [] }, status: 'draft',
    })
    setFocusedCell(null)
    setMessage('')
    setScreen('audit')
  }

  async function openAudit(row: AuditRow) {
    setSaving(true)
    setMessage('')
    try {
      const { data, error } = await q().from('clinical_pathway_audits').select('*').eq('id', row.id).single()
      if (error) throw error
      const fallback = templates.find((x) => x.code === row.template_code) || catalog.find((x) => x.code === row.template_code)
      if (!fallback) throw new Error('Master CP untuk audit ini tidak ditemukan.')
      setForm(fromDatabase(data, fallback, roomNames.get(Number(data.room_id)) || ''))
      setSelectedCode(row.template_code)
      setFocusedCell(null)
      setScreen('audit')
    } catch (e: any) {
      setMessage('Tidak dapat membuka audit: ' + (e?.message || 'Kesalahan server.'))
      setMessageKind('error')
    } finally {
      setSaving(false)
    }
  }

  function patchForm(patch: Partial<AuditForm>) {
    setForm((current) => current ? { ...current, ...patch } : current)
  }

  function patchCell(item: CPItem, day: string, patch: Partial<CellAnswer>) {
    setForm((current) => {
      if (!current) return current
      const currentCell = current.answers_json[item.id]?.[day] || {}
      const nextCell = { ...currentCell, ...patch }
      const nextAnswers = { ...current.answers_json, [item.id]: { ...(current.answers_json[item.id] || {}), [day]: nextCell } }
      return { ...current, answers_json: nextAnswers }
    })
  }

  function toggleCell(item: CPItem, day: string) {
    if (!form) return
    const currentCell = form.answers_json[item.id]?.[day] || {}
    patchCell(item, day, currentCell.status === 'done' ? { status: '' } : {
      status: 'done', performed_at: currentCell.performed_at || new Date().toISOString(),
      performer_profession: currentCell.performer_profession || item.profession,
    })
  }

  function setInclusion(id: string, value: boolean) {
    patchForm({ inclusion_json: { ...(form?.inclusion_json || {}), [id]: value } })
  }

  function setVariationsReviewed(value: boolean) {
    if (!form) return
    patchForm({ variations_json: { ...form.variations_json, reviewed: value, items: value ? form.variations_json.items : [] } })
  }

  function addVariation() {
    if (!form) return
    const v: Variation = { id: 'var-' + Date.now(), date: form.admission_date || '', item_id: '', variation: '', reason: '', justification: '' }
    patchForm({ variations_json: { reviewed: true, items: [...form.variations_json.items, v] } })
  }

  function patchVariation(id: string, patch: Partial<Variation>) {
    if (!form) return
    patchForm({ variations_json: { reviewed: true, items: form.variations_json.items.map((v) => v.id === id ? { ...v, ...patch } : v) } })
  }

  function removeVariation(id: string) {
    if (!form) return
    const items = form.variations_json.items.filter((v) => v.id !== id)
    patchForm({ variations_json: { reviewed: true, items } })
  }

  async function saveAudit(nextStatus: 'draft' | 'submitted' | 'validated') {
    if (!form) return
    if (!masterReady) { setMessage('Audit belum dapat disimpan: master CP belum tersinkron di Supabase.'); setMessageKind('error'); return }
    if (!form.room_id) { setMessage('Pilih unit/ruangan sebelum menyimpan audit.'); setMessageKind('error'); return }
    if (!form.patient_name.trim()) { setMessage('Nama pasien wajib diisi.'); setMessageKind('error'); return }
    if (!isAdmin && form.id && form.status === 'validated') { setMessage('Audit yang sudah tervalidasi hanya dapat diubah oleh Super Admin.'); setMessageKind('error'); return }
    if (!isAdmin && form.room_id !== initialRoomId) { setMessage('Anda hanya dapat menyimpan audit pada unit yang ditetapkan di akun.'); setMessageKind('error'); return }
    setSaving(true)
    setMessage('')
    try {
      const auth = await sb.auth.getUser()
      if (auth.error || !auth.data.user) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.')
      const payload: any = {
        room_id: form.room_id, template_code: form.template.code, template_name: form.template.name,
        template_version: form.template.version, template_snapshot: form.template,
        patient_name: form.patient_name.trim(), medical_record_no: form.medical_record_no.trim(),
        sex: form.sex, date_of_birth: form.date_of_birth || null,
        admission_date: form.admission_date || null, discharge_date: form.discharge_date || null,
        unit_name: form.unit_name || roomNames.get(Number(form.room_id)) || '',
        dpjp: form.dpjp, clinical_data: form.clinical_data || {},
        inclusion_json: form.inclusion_json || {}, answers_json: form.answers_json || {},
        variations_json: form.variations_json || { reviewed: false, items: [] },
        status: nextStatus, updated_by: auth.data.user.id,
      }
      let result: any
      if (form.id) {
        result = await q().from('clinical_pathway_audits').update(payload).eq('id', form.id).select('*').single()
      } else {
        payload.created_by = auth.data.user.id
        result = await q().from('clinical_pathway_audits').insert(payload).select('*').single()
      }
      if (result.error) throw result.error
      const fallback = templates.find((x) => x.code === result.data.template_code) || form.template
      setForm(fromDatabase(result.data, fallback, roomNames.get(Number(result.data.room_id)) || ''))
      setSelectedCode(result.data.template_code)
      setMessage('Audit CP berhasil disimpan ke Supabase. Hasil Bagian D dihitung ulang oleh database.')
      setMessageKind('info')
      if (screen === 'diagnosis') await loadAudits(result.data.template_code)
    } catch (e: any) {
      setMessage('Gagal menyimpan audit ke Supabase: ' + (e?.message || 'Kesalahan server.'))
      setMessageKind('error')
    } finally {
      setSaving(false)
    }
  }

  function beginBuilder() {
    if (!isAdmin || !selectedTemplate) return
    setBuilder(clone(selectedTemplate))
    setScreen('builder')
    setMessage('')
  }

  function patchBuilder(patch: Partial<Template>) {
    setBuilder((current) => current ? { ...current, ...patch } : current)
  }

  function patchBuilderItem(id: string, patch: Partial<CPItem>) {
    setBuilder((current) => current ? {
      ...current, items: current.items.map((it) => it.id === id ? { ...it, ...patch } : it),
    } : current)
  }

  function patchBuilderSchedule(id: string, day: string, policy: Policy) {
    setBuilder((current) => current ? {
      ...current, items: current.items.map((it) => it.id === id ? {
        ...it, schedule: it.schedule.map((s) => s.day === day ? { ...s, policy } : s),
      } : it),
    } : current)
  }

  function addBuilderItem() {
    if (!builder) return
    const id = builder.code + '-custom-' + Date.now()
    patchBuilder({ items: [...builder.items, {
      id, section: 'A', profession: '', choice: '', stage: '', label: '', detail: '',
      schedule: builder.days.map((day) => ({ day, policy: 'not_scheduled' })), oppe: false,
    }] })
  }

  function removeBuilderItem(id: string) {
    if (!builder) return
    if (!window.confirm('Hapus item ini dari format master CP baru? Audit yang sudah tersimpan tetap menggunakan versi lamanya.')) return
    patchBuilder({ items: builder.items.filter((it) => it.id !== id) })
  }

  async function saveBuilder() {
    if (!isAdmin || !builder) return
    if (!builder.name.trim() || !builder.items.length || builder.items.some((i) => !i.label.trim())) {
      setMessage('Nama CP wajib terisi dan setiap item harus mempunyai nama item/tindakan.')
      setMessageKind('error')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const auth = await sb.auth.getUser()
      if (auth.error || !auth.data.user) throw new Error('Sesi login tidak tersedia.')
      const current = templates.find((t) => t.code === builder.code)
      const nextVersion = Math.max(1, (current?.version || builder.version || 1) + 1)
      const saved: Template = { ...builder, version: nextVersion }
      const { data, error } = await q().from('clinical_pathway_templates').upsert({
        code: saved.code, name: saved.name.trim(), icd10: saved.icd10 || '', status: saved.status,
        version: saved.version, template_json: saved, source_filename: saved.source_filename || '',
        created_by: auth.data.user.id, updated_by: auth.data.user.id,
      }, { onConflict: 'code' }).select('*').single()
      if (error) throw error
      const normalized: Template = { ...(data.template_json || saved), code: data.code, name: data.name, icd10: data.icd10 || '', status: data.status, version: data.version }
      setTemplates((old) => [...old.filter((t) => t.code !== normalized.code), normalized].sort((a, b) => a.name.localeCompare(b.name, 'id')))
      setCatalog((old) => old.map((t) => t.code === normalized.code ? normalized : t))
      setMasterReady(true)
      setSelectedCode(normalized.code)
      setBuilder(null)
      setScreen('diagnosis')
      setMessage('Format CP versi ' + nextVersion + ' berhasil disimpan. Audit terdahulu tetap memakai snapshot versi sebelumnya.')
      setMessageKind('info')
    } catch (e: any) {
      setMessage('Gagal menyimpan format CP: ' + (e?.message || 'Kesalahan server.'))
      setMessageKind('error')
    } finally {
      setSaving(false)
    }
  }

  const roomOption = (room: Room) => <option key={room.id} value={room.id}>{room.name}</option>
  const sectionCount = selectedTemplate?.items.length || 0
  const currentScore = score

  function renderScore() {
    if (!form || !currentScore) return null
    const c = currentScore
    const pct = (v: number | null) => v == null ? '—' : v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%'
    const passClass = (pass: boolean) => pass ? 'cpPass' : 'cpFail'
    return <div className="cpRoot">
      <div className="cpScoreGrid">
        <div className="cpGlass cpScore"><span>Keterisian CP</span><strong>{pct(c.completion)}</strong><small>{c.filled}/{c.expected} sel terjadwal sudah diputuskan · standar ≥{c.threshold}%</small><div className={'cpBadge ' + (c.completionPass ? '' : 'draft')}>{c.completionPass ? 'Memenuhi' : 'Belum memenuhi'}</div></div>
        <div className="cpGlass cpScore"><span>Kepatuhan CP</span><strong>{pct(c.compliance)}</strong><small>{c.done} sesuai dari {c.evaluation} sel yang dinilai · target {c.target}%</small><div className={'cpBadge ' + (c.compliancePass ? '' : 'draft')}>{c.compliancePass ? 'Memenuhi' : 'Belum memenuhi'}</div></div>
        <div className="cpGlass cpScore"><span>Inklusi penilaian</span><strong>{c.inclusionReady ? (c.included ? 'Ya' : 'Tidak') : '—'}</strong><small>{c.criteria.length} kriteria dari Bagian D harus diputuskan</small><div className={'cpBadge ' + (c.inclusionReady ? (c.included ? '' : 'draft') : 'draft')}>{!c.inclusionReady ? 'Belum lengkap' : c.included ? 'Layak dinilai' : 'Di luar inklusi'}</div></div>
        <div className="cpGlass cpScore"><span>Variasi pelayanan</span><strong>{c.variationCount}</strong><small>Justifikasi diperlukan untuk setiap variasi</small><div className={'cpBadge ' + (c.variationComplete ? '' : 'draft')}>{c.variationComplete ? 'Terdokumentasi' : 'Belum lengkap'}</div></div>
      </div>
      <div className="cpPanel cpGlass">
        <div className="cpSectionHead"><div><h4>Bagian D · Kepatuhan Clinical Pathway</h4><p>Perhitungan langsung mengikuti kriteria pada master CP dan direkalkulasi oleh Supabase saat disimpan.</p></div><span className={'cpBadge ' + (c.sectionDPass ? '' : 'draft')}>{c.sectionDPass ? 'Memenuhi seluruh kriteria' : 'Belum memenuhi seluruh kriteria'}</span></div>
        <div className="cpNotice info">{form.template.scoring_rules.completion_definition} {form.template.scoring_rules.compliance_definition}</div>
        <div className="cpTableWrap" style={{ maxHeight: 'none', marginTop: 12 }}>
          <table className="cpTable" style={{ minWidth: 760 }}>
            <thead><tr><th>Item Penilaian</th><th>Standar pada dokumen sumber</th><th>Hasil otomatis</th></tr></thead>
            <tbody>
              {(form.template.scoring_rules.source_section_d || []).map((item, i) => {
                let result = '—'
                if (/inklu|pasien dinyatakan/i.test(item.item)) result = c.inclusionReady ? (c.included ? 'Memenuhi' : 'Tidak memenuhi') : 'Belum dinilai'
                else if (/terisi/i.test(item.item) && /clinical pathway/i.test(item.item)) result = pct(c.completion) + ' (' + c.filled + '/' + c.expected + ')'
                else if (/kepatuhan pasien/i.test(item.item)) result = pct(c.compliance)
                else if (/variasi pelayanan/i.test(item.item)) result = c.variationComplete ? 'Terisi / lengkap' : 'Belum lengkap'
                return <tr key={item.item + i}><td>{item.item}</td><td>{item.standard}</td><td>{result}</td></tr>
              })}
            </tbody>
          </table>
        </div>
        <p className="cpTiny">Catatan: sel kosong berarti belum dinilai; bukan otomatis “tidak patuh”. Sel kondisional dapat diputuskan “Tidak berlaku”. Variasi yang terdokumentasi tidak otomatis mengubah item tidak sesuai menjadi patuh.</p>
      </div>
    </div>
  }

  if (loading) return <div className="cpRoot"><style>{CSS}</style><div className="cpGlass cpHead"><div><span className="cpEyebrow">AUREKA · AUDIT CLINICAL PATHWAY</span><h3>Menyiapkan master Clinical Pathway…</h3><p>Membaca format dari dokumen sumber dan menyelaraskan master di Supabase.</p></div></div></div>

  return <div className="cpRoot">
    <style>{CSS}</style>
    <section className="cpGlass cpHead">
      <div>
        <div className="cpEyebrow">AUREKA WORKSPACE · AUDIT CLINICAL PATHWAY</div>
        <h3>{screen === 'library' ? 'Audit Clinical Pathway' : screen === 'diagnosis' ? (selectedTemplate?.name || 'Clinical Pathway') : screen === 'builder' ? 'Edit Format CP' : 'Audit Pasien · ' + (form?.template.name || '')}</h3>
        <p>{screen === 'library' ? 'Kelola format CP per diagnosis, dokumentasikan pelayanan seluruh PPA dalam satu tabel checklist, dan hitung otomatis Bagian D.' : screen === 'diagnosis' ? 'Daftar audit pasien untuk diagnosis terpilih. Setiap audit menggunakan snapshot versi format CP yang dipakai saat pengisian.' : screen === 'builder' ? 'Penyuntingan master hanya tersedia bagi Super Admin. Item dan jadwal ditampilkan dalam format yang seragam.' : 'Checklist semua item beserta hari perawatan dalam satu tabel. Klik tanda pada sel untuk menandai sesuai; gunakan rincian untuk mencatat pengecualian, petugas, dan bukti.'}</p>
      </div>
      <div className="cpActions">
        <button type="button" className="cpBtn" onClick={onBack}>← Kembali ke kontainer mutu</button>
        {screen !== 'library' && <button type="button" className="cpBtn" onClick={() => { setMessage(''); setScreen(screen === 'audit' ? 'diagnosis' : 'library'); setFocusedCell(null); setForm(null); setBuilder(null) }}>← Kembali</button>}
        {screen === 'diagnosis' && isAdmin && <button type="button" className="cpBtn" onClick={beginBuilder}>⚙ Edit Form CP</button>}
        {screen === 'diagnosis' && <button type="button" className="cpBtn primary" onClick={newAudit}>＋ Audit pasien baru</button>}
        {screen === 'audit' && <button type="button" className="cpBtn" onClick={() => window.print()}>Cetak / PDF</button>}
      </div>
    </section>

    {message && <div className={'cpNotice ' + (messageKind === 'error' ? 'error' : 'info')} role="status">{message}</div>}
    {!masterReady && screen !== 'library' && <div className="cpNotice error">Master CP belum lengkap di Supabase. Audit tidak dapat disimpan sampai Super Admin membuka modul dan menyinkronkan format.</div>}

    {screen === 'library' && <>
      <div className="cpGrid">
        <LiquidGlass className="cpKpi"><span>Format CP tersedia</span><strong>{templates.filter((t) => t.status === 'published').length}</strong><small>Dari 6 diagnosis sumber</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Total item master</span><strong>{templates.filter((t) => t.status === 'published').reduce((a, t) => a + t.items.length, 0).toLocaleString('id-ID')}</strong><small>Item dan jadwal dari dokumen sumber</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Unit / ruangan</span><strong>{isAdmin ? rooms.length : (initialRoomId ? 1 : 0)}</strong><small>Disaring sesuai hak akses</small></LiquidGlass>
      </div>
      <div className="cpGlass cpToolbar">
        <div className="cpField cpSearch"><label>CARI DIAGNOSIS / KODE ICD-10</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: stroke, mastektomi, I63…" /></div>
        {isAdmin && <div className="cpField cpSelect"><label>UNIT UNTUK AUDIT BARU</label><select value={selectedRoomId == null ? '' : String(selectedRoomId)} onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}><option value="">Semua unit (pilih saat audit)</option>{rooms.map(roomOption)}</select></div>}
        <button type="button" className="cpBtn" onClick={() => void loadTemplates()}>↻ Muat ulang master</button>
      </div>
      <div className="cpGrid">
        {filteredTemplates.map((t) => <button key={t.code} type="button" className="cpGlass cpTile" onClick={() => chooseTemplate(t)}>
          <span className="cpTileTop"><span className="cpTileIcon">▤</span><span className={'cpBadge ' + (t.status === 'draft' ? 'draft' : t.status === 'retired' ? 'retired' : '')}>{t.status === 'published' ? 'Aktif' : t.status === 'draft' ? 'Draf' : 'Tidak aktif'}</span></span>
          <h4>{t.name}</h4><p>{t.icd10 ? 'ICD-10: ' + t.icd10 : 'Kode ICD-10 belum dicantumkan pada dokumen sumber'} · Versi {t.version}</p>
          <div className="cpTileFoot"><span>{t.items.length} item · {t.days.length} hari/tahap</span><span>Buka diagnosis →</span></div>
        </button>)}
      </div>
      {filteredTemplates.length === 0 && <div className="cpGlass cpEmpty">Tidak ada CP yang cocok dengan pencarian.</div>}
      <div className="cpNotice info">Format bersumber dari 6 dokumen CP yang diberikan. Penanda hijau pada sumber dipetakan sebagai wajib, kuning sebagai kondisional, dan sel tanpa penanda sebagai tidak dijadwalkan. Isi item dan catatan sumber tidak digantikan oleh template generik.</div>
    </>}

    {screen === 'diagnosis' && selectedTemplate && <>
      <div className="cpGrid">
        <LiquidGlass className="cpKpi"><span>Item dalam format</span><strong>{selectedTemplate.items.length}</strong><small>Baris checklist dari sumber</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Hari / tahap</span><strong>{selectedTemplate.days.length}</strong><small>{selectedTemplate.days.join(' · ')}</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Standar keterisian</span><strong>≥{selectedTemplate.scoring_rules.completion_threshold_pct}%</strong><small>Mengikuti Bagian D pada sumber</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Target kepatuhan</span><strong>{selectedTemplate.scoring_rules.compliance_target_pct}%</strong><small>Dihitung dari item yang telah dinilai</small></LiquidGlass>
      </div>
      {selectedTemplate.source_notes.length > 0 && <div className="cpGlass cpPanel cpSourceNotes"><h4>Catatan dari dokumen sumber</h4>{selectedTemplate.source_notes.map((note, i) => <div key={i} className="cpNotice">{note}</div>)}</div>}
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Audit pasien · {selectedTemplate.name}</h4><p>Daftar audit tersimpan langsung di Supabase. Pilih rekam audit untuk melanjutkan atau buat audit baru.</p></div><span className="cpBadge">{audits.length} rekam audit</span></div>
        {isAdmin && <div className="cpField cpSelect" style={{ marginBottom: 12 }}><label>FILTER UNIT / RUANGAN</label><select value={selectedRoomId == null ? '' : String(selectedRoomId)} onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}><option value="">Semua unit</option>{rooms.map(roomOption)}</select></div>}
        {auditLoading ? <div className="cpEmpty">Memuat audit…</div> : audits.length === 0 ? <div className="cpEmpty">Belum ada rekam audit untuk diagnosis ini pada ruang lingkup akses Anda.</div> :
          <div className="cpRecordList">{audits.map((a) => {
            const c = a.calculation_json || {}
            return <div key={a.id} className="cpRecord"><div><b>{a.patient_name || 'Pasien tanpa nama'} <span className="cpSubtle">· RM {a.medical_record_no || '—'}</span></b><small>{roomNames.get(Number(a.room_id)) || a.unit_name || 'Unit'} · Masuk {fmtDate(a.admission_date)} · Dibuat {fmtDate(a.created_at)}</small><small>Keterisian {c.completion_pct == null ? '—' : c.completion_pct + '%'} · Kepatuhan {c.compliance_pct == null ? '—' : c.compliance_pct + '%'} · Bagian D {c.section_d_pass ? 'Memenuhi' : 'Belum memenuhi'}</small></div><div className="cpRecordRight"><span className={'cpBadge ' + (a.status === 'draft' ? 'draft' : '')}>{STATUS_LABEL[a.status] || a.status}</span><button type="button" className="cpBtn" onClick={() => void openAudit(a)}>Buka / Edit</button></div></div>
          })}</div>}
      </div>
      {isAdmin && <div className="cpGlass cpPanel"><h4>Pengelolaan master</h4><p className="cpTiny">Menu edit format hanya tersedia bagi Super Admin dan dilindungi kebijakan RLS database.</p><button type="button" className="cpBtn" onClick={beginBuilder}>⚙ Edit Form CP · Super Admin</button></div>}
    </>}

    {screen === 'audit' && form && <>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Identitas pasien dan episode perawatan</h4><p>Petugas pengisi terekam otomatis dari akun AUREKA. Identitas pelaksana setiap item dapat diisi pada rincian sel.</p></div><span className={'cpBadge ' + (form.status === 'draft' ? 'draft' : '')}>{STATUS_LABEL[form.status] || form.status}</span></div>
        <div className="cpFormGrid">
          <div className="cpField span2"><label>Nama pasien *</label><input value={form.patient_name} onChange={(e) => patchForm({ patient_name: e.target.value })} placeholder="Nama sesuai rekam medis" /></div>
          <div className="cpField"><label>Nomor rekam medis</label><input value={form.medical_record_no} onChange={(e) => patchForm({ medical_record_no: e.target.value })} /></div>
          <div className="cpField"><label>Jenis kelamin</label><select value={form.sex} onChange={(e) => patchForm({ sex: e.target.value })}><option value="">Pilih</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option><option value="Tidak diketahui">Tidak diketahui</option></select></div>
          <div className="cpField"><label>Tanggal lahir</label><input type="date" value={form.date_of_birth} onChange={(e) => patchForm({ date_of_birth: e.target.value })} /></div>
          <div className="cpField"><label>Tanggal masuk</label><input type="date" value={form.admission_date} onChange={(e) => patchForm({ admission_date: e.target.value })} /></div>
          <div className="cpField"><label>Tanggal keluar</label><input type="date" value={form.discharge_date} onChange={(e) => patchForm({ discharge_date: e.target.value })} /></div>
          <div className="cpField"><label>DPJP</label><input value={form.dpjp} onChange={(e) => patchForm({ dpjp: e.target.value })} placeholder="Nama DPJP" /></div>
          <div className="cpField"><label>Unit / ruangan</label>{isAdmin ? <select value={form.room_id == null ? '' : String(form.room_id)} onChange={(e) => patchForm({ room_id: e.target.value ? Number(e.target.value) : null, unit_name: roomNames.get(Number(e.target.value)) || '' })}><option value="">Pilih unit</option>{rooms.map(roomOption)}</select> : <input value={form.unit_name || roomNames.get(Number(form.room_id)) || ''} readOnly />}</div>
          <div className="cpField"><label>Status audit</label><select value={form.status} onChange={(e) => patchForm({ status: e.target.value })} disabled={!isAdmin && form.status === 'validated'}><option value="draft">Draf</option><option value="submitted">Diajukan</option>{isAdmin && <option value="validated">Tervalidasi</option>}</select></div>
        </div>
        {form.template.clinical_fields.length > 0 && <>
          <div className="cpSectionHead"><div><h4>Data klinis dan administrasi khusus diagnosis</h4><p>Kolom sumber dipertahankan sebagai tambahan di luar identitas pasien yang seragam.</p></div></div>
          <div className="cpFormGrid">{form.template.clinical_fields.map((f) => <div key={f.id} className="cpField"><label>{f.label}</label><input value={form.clinical_data[f.id] || ''} onChange={(e) => patchForm({ clinical_data: { ...form.clinical_data, [f.id]: e.target.value } })} placeholder={f.hint || f.code_label || f.additional_label || 'Isi bila relevan'} />{(f.code_label || f.additional_label) && <small className="cpTiny">{[f.code_label, f.additional_label].filter(Boolean).join(' · ')}</small>}</div>)}</div>
        </>}
      </div>

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Inklusi penilaian · Bagian D</h4><p>Kriteria berbeda mengikuti dokumen masing-masing diagnosis. Belum diputuskan tidak dianggap memenuhi.</p></div><span className={'cpBadge ' + (currentScore?.inclusionReady && currentScore.included ? '' : 'draft')}>{currentScore?.inclusionReady ? (currentScore.included ? 'Termasuk inklusi' : 'Di luar inklusi') : 'Belum diputuskan'}</span></div>
        <div className="cpCriterionList">{form.template.scoring_rules.inclusion_criteria.map((c) => <div key={c.id} className="cpCriterion"><label>{c.label}</label><div className="cpToggleGroup"><button type="button" className={'cpToggle ' + (form.inclusion_json[c.id] === true ? 'active' : '')} onClick={() => setInclusion(c.id, true)}>Ya / Memenuhi</button><button type="button" className={'cpToggle ' + (form.inclusion_json[c.id] === false ? 'active' : '')} onClick={() => setInclusion(c.id, false)}>Tidak</button></div></div>)}</div>
        {form.template.code === 'soft-tissue-tumor' && <div className="cpNotice" style={{ marginTop: 10 }}>Catatan sumber Soft Tissue Tumor memuat ukuran &gt;5 cm, lokasi dekat sendi/pembuluh darah/organ penting, komorbid DM/HT tidak terkontrol, dan hasil Patologi Anatomi. Kriteria gabungannya tetap dikonfirmasi DPJP; isian ini merekam penetapan inklusi sesuai dokumen, tidak menafsirkan ulang logika klinis.</div>}
      </div>

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Checklist pelaksanaan CP · {form.template.name}</h4><p>Semua item dari dokumen sumber ditampilkan dalam satu tabel; hijau = wajib, kuning = kondisional, putih = tidak dijadwalkan.</p></div><span className="cpBadge">{form.template.items.length} item · {form.template.days.length} hari / tahap</span></div>
        {focusedCell && (() => {
          const item = form.template.items.find((it) => it.id === focusedCell.itemId)
          const sched = item?.schedule.find((s) => s.day === focusedCell.day)
          const answer = form.answers_json[focusedCell.itemId]?.[focusedCell.day] || {}
          if (!item || !sched) return null
          return <div className="cpCellDetail">
            <div className="cpWide"><b>{item.label}</b><div className="cpTiny">{item.profession} · {item.stage} · {focusedCell.day} · {policyLabel(sched.policy)}</div></div>
            <div className="cpField"><label>Status pelaksanaan</label><select value={answer.status || ''} onChange={(e) => {
              const st = e.target.value as CellStatus
              patchCell(item, focusedCell.day, {
                status: st,
                performed_at: st && !answer.performed_at ? new Date().toISOString() : answer.performed_at,
                performer_profession: answer.performer_profession || item.profession,
              })
            }}><option value="">Belum dinilai</option><option value="done">Sesuai standar</option><option value="not_done">Tidak sesuai / tidak dilakukan</option>{sched.policy === 'conditional' && <option value="not_applicable">Tidak berlaku (kondisional)</option>}</select></div>
            <div className="cpField"><label>Petugas pelaksana {item.oppe ? '· bukti OPPE' : ''}</label><input value={answer.performer_name || ''} onChange={(e) => patchCell(item, focusedCell.day, { performer_name: e.target.value })} placeholder="Nama petugas yang benar-benar melaksanakan" /></div>
            <div className="cpField"><label>Profesi pelaksana</label><input value={answer.performer_profession || item.profession || ''} onChange={(e) => patchCell(item, focusedCell.day, { performer_profession: e.target.value })} /></div>
            <div className="cpField"><label>Waktu pelaksanaan</label><input type="datetime-local" value={answer.performed_at ? new Date(answer.performed_at).toISOString().slice(0,16) : ''} onChange={(e) => patchCell(item, focusedCell.day, { performed_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>
            <div className="cpField"><label>Bukti / referensi</label><input value={answer.evidence || ''} onChange={(e) => patchCell(item, focusedCell.day, { evidence: e.target.value })} placeholder="Nomor dokumen / catatan" /></div>
            <div className="cpField cpWide"><label>Catatan item / alasan ketidaksesuaian</label><textarea value={answer.note || ''} onChange={(e) => patchCell(item, focusedCell.day, { note: e.target.value })} placeholder="Catatan pelaksanaan; untuk variasi, isi pula Bagian Variasi di bawah." /></div>
            <div className="cpWide" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="cpBtn" onClick={() => setFocusedCell(null)}>Tutup rincian</button>{item.oppe && !String(answer.performer_name || '').trim() && <span className="cpNotice">Item ini dipetakan ke OPPE; isi nama pelaksana agar bukti dapat diatribusikan.</span>}</div>
          </div>
        })()}
        <div className="cpTableWrap">
          <table className="cpTable">
            <thead><tr><th>PPA / Bagian</th><th>Pilihan</th><th>Kelompok / Tahap</th><th>Item / Tindakan dan keterangan</th>{form.template.days.map((day) => <th key={day} className="cpDayCol">{day}</th>)}</tr></thead>
            <tbody>{(() => {
              let previous = ''
              const rows: any[] = []
              form.template.items.forEach((item) => {
                const group = (item.section || '') + '|' + (item.profession || 'PPA belum ditentukan')
                if (group !== previous) {
                  rows.push(<tr key={'g-' + group + '-' + item.id} className="cpGroup"><td colSpan={4 + form.template.days.length}>{item.profession || 'PPA belum ditentukan'}{item.section ? ' · Bagian ' + item.section : ''}</td></tr>)
                  previous = group
                }
                rows.push(<tr key={item.id}>
                  <td>{item.profession || '—'}<div className="cpTiny">{item.section ? 'Bagian ' + item.section : ''}</div></td>
                  <td>{item.choice || '—'}</td>
                  <td>{item.stage || '—'}</td>
                  <td><b>{item.label || '(Nama item belum diisi)'}</b>{item.detail && <div className="cpSubtle" style={{ marginTop: 4 }}>{item.detail}</div>}{item.oppe && <div className="cpTiny">↗ Bukti OPPE</div>}</td>
                  {form.template.days.map((day) => {
                    const sched = item.schedule.find((s) => s.day === day) || { day, policy: 'not_scheduled' as Policy }
                    const status = cellStatus(form, item.id, day)
                    return <td key={day} className={'cpCell ' + sched.policy}>
                      {sched.policy === 'not_scheduled' ? <span className="cpTiny">—</span> : <div className="cpCellControls">
                        <button type="button" className={'cpMark ' + (status || '')} onClick={() => toggleCell(item, day)} aria-label={(status === 'done' ? 'Batalkan tanda sesuai' : 'Tandai sesuai') + ' · ' + item.label + ' · ' + day} title={status === 'done' ? 'Klik untuk menghapus tanda sesuai' : 'Klik untuk menandai sesuai'}>{status === 'done' ? '✓' : status === 'not_done' ? '×' : status === 'not_applicable' ? 'N/A' : '□'}</button>
                        <button type="button" className="cpCellEdit" onClick={() => setFocusedCell({ itemId: item.id, day })} aria-label={'Rincian ' + item.label + ' ' + day} title="Rincian petugas, waktu, bukti, atau ketidaksesuaian">⋯</button>
                      </div>}
                    </td>
                  })}
                </tr>)
              })
              return rows
            })()}</tbody>
          </table>
        </div>
        <div className="cpSectionHead"><div><h4>Ringkasan perhitungan otomatis</h4><p>Nilai pratinjau berubah saat sel checklist diubah; saat disimpan, database menghitung ulang dengan trigger.</p></div></div>
        {renderScore()}
      </div>

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Variasi perawatan / pelayanan</h4><p>Bagian D meminta variasi dan Justification For An Exception To Fair Opportunity diisi bila terjadi penyimpangan.</p></div><span className={'cpBadge ' + (currentScore?.variationComplete ? '' : 'draft')}>{currentScore?.variationComplete ? 'Terdokumentasi' : 'Belum lengkap'}</span></div>
        <div className="cpToggleGroup" style={{ marginBottom: 12 }}>
          <button type="button" className={'cpToggle ' + (form.variations_json.reviewed && form.variations_json.items.length === 0 ? 'active' : '')} onClick={() => patchForm({ variations_json: { reviewed: true, items: [] } })}>Tidak ada variasi</button>
          <button type="button" className={'cpToggle ' + (form.variations_json.items.length > 0 ? 'active' : '')} onClick={() => { if (!form.variations_json.items.length) addVariation(); else patchForm({ variations_json: { ...form.variations_json, reviewed: true } }) }}>Ada variasi</button>
          <button type="button" className="cpBtn" onClick={addVariation}>＋ Tambah variasi</button>
        </div>
        {form.variations_json.items.length > 0 ? <div className="cpVarList">{form.variations_json.items.map((v, i) => <div className="cpVar" key={v.id}>
          <div className="cpVarHead"><b>Variasi {i + 1}</b><button type="button" className="cpBtn" onClick={() => removeVariation(v.id)}>Hapus</button></div>
          <div className="cpField"><label>Tanggal</label><input type="date" value={v.date} onChange={(e) => patchVariation(v.id, { date: e.target.value })} /></div>
          <div className="cpField"><label>Item CP terkait (opsional)</label><select value={v.item_id || ''} onChange={(e) => patchVariation(v.id, { item_id: e.target.value })}><option value="">Pilih item</option>{form.template.items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</select></div>
          <div className="cpField full"><label>Ringkasan variasi *</label><textarea value={v.variation} onChange={(e) => patchVariation(v.id, { variation: e.target.value })} /></div>
          <div className="cpField full"><label>Alasan *</label><textarea value={v.reason} onChange={(e) => patchVariation(v.id, { reason: e.target.value })} /></div>
          <div className="cpField full"><label>Justification For An Exception To Fair Opportunity *</label><textarea value={v.justification} onChange={(e) => patchVariation(v.id, { justification: e.target.value })} /></div>
        </div>)}</div> : <div className="cpNotice info">Pilih “Tidak ada variasi” secara eksplisit bila memang tidak ditemukan variasi. Jika ada variasi, setiap catatan harus memiliki tanggal, ringkasan, alasan, dan justifikasi.</div>}
      </div>

      {form.template.source_notes.length > 0 && <div className="cpGlass cpPanel cpSourceNotes"><h4>Catatan sumber yang harus tetap diperhatikan</h4>{form.template.source_notes.map((note, i) => <div key={i} className="cpNotice">{note}</div>)}</div>}
      <div className="cpGlass cpFooter">
        <div><span className="cpTiny">Pengisi: {userName} · Petugas pelaksana dicatat pada rincian tiap item bila diperlukan.</span><div className="cpTiny">Snapshot CP versi {form.template.version} · Sistem tidak menggunakan cache lokal sebagai penyimpanan data audit.</div></div>
        <div className="cpActions"><button type="button" className="cpBtn" disabled={saving} onClick={() => void saveAudit('draft')}>{saving ? 'Menyimpan…' : 'Simpan draf'}</button><button type="button" className="cpBtn primary" disabled={saving} onClick={() => void saveAudit(isAdmin && form.status === 'submitted' ? 'validated' : 'submitted')}>{saving ? 'Menyimpan…' : isAdmin && form.status === 'submitted' ? 'Simpan & validasi' : form.status === 'validated' ? 'Perbarui audit tervalidasi' : 'Simpan / ajukan audit'}</button></div>
      </div>
    </>}

    {screen === 'builder' && builder && isAdmin && <>
      <div className="cpNotice info">Mode Super Admin. Perubahan disimpan sebagai versi master baru. Rekam audit yang sudah ada mempertahankan snapshot versi lamanya.</div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Identitas format master</h4><p>Kode internal dipertahankan agar tautan audit tidak putus; judul, ICD-10, status, dan ambang dapat dikelola.</p></div><span className="cpBadge">Versi sekarang {builder.version}</span></div>
        <div className="cpFormGrid">
          <div className="cpField span2"><label>Nama diagnosis / Clinical Pathway</label><input value={builder.name} onChange={(e) => patchBuilder({ name: e.target.value })} /></div>
          <div className="cpField"><label>Kode ICD-10</label><input value={builder.icd10} onChange={(e) => patchBuilder({ icd10: e.target.value })} /></div>
          <div className="cpField"><label>Status master</label><select value={builder.status} onChange={(e) => patchBuilder({ status: e.target.value })}><option value="published">Aktif / diterbitkan</option><option value="draft">Draf</option><option value="retired">Tidak aktif</option></select></div>
          <div className="cpField"><label>Standar keterisian (%)</label><input type="number" min="0" max="100" value={builder.scoring_rules.completion_threshold_pct} onChange={(e) => patchBuilder({ scoring_rules: { ...builder.scoring_rules, completion_threshold_pct: n(e.target.value) } })} /></div>
          <div className="cpField"><label>Target kepatuhan (%)</label><input type="number" min="0" max="100" value={builder.scoring_rules.compliance_target_pct} onChange={(e) => patchBuilder({ scoring_rules: { ...builder.scoring_rules, compliance_target_pct: n(e.target.value) } })} /></div>
        </div>
      </div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Editor item dan jadwal</h4><p>Setiap baris berasal dari dokumen sumber. Pilih Wajib, Kondisional, atau Tidak dijadwalkan pada masing-masing hari.</p></div><div className="cpActions"><span className="cpBadge">{builder.items.length} item</span><button type="button" className="cpBtn" onClick={addBuilderItem}>＋ Item baru</button></div></div>
        <div className="cpTableWrap cpBuilderTable"><table className="cpTable" style={{ minWidth: 1280 }}>
          <thead><tr><th>PPA / Bagian</th><th>Pilihan</th><th>Kelompok / Tahap</th><th>Item / Tindakan</th><th>Keterangan / dosis</th>{builder.days.map((day) => <th key={day} className="cpBuilderDay">{day}</th>)}<th>OPPE</th><th>Hapus</th></tr></thead>
          <tbody>{builder.items.map((item) => <tr key={item.id}>
            <td><input className="cpInput cpBuilderInput" value={item.profession} onChange={(e) => patchBuilderItem(item.id, { profession: e.target.value })} /></td>
            <td><input className="cpInput" value={item.choice} onChange={(e) => patchBuilderItem(item.id, { choice: e.target.value })} /></td>
            <td><input className="cpInput cpBuilderInput" value={item.stage} onChange={(e) => patchBuilderItem(item.id, { stage: e.target.value })} /></td>
            <td><input className="cpInput cpBuilderInput" value={item.label} onChange={(e) => patchBuilderItem(item.id, { label: e.target.value })} /></td>
            <td><input className="cpInput cpBuilderInput" value={item.detail} onChange={(e) => patchBuilderItem(item.id, { detail: e.target.value })} /></td>
            {builder.days.map((day) => <td key={day}><select className="cpInput cpBuilderDay" value={item.schedule.find((s) => s.day === day)?.policy || 'not_scheduled'} onChange={(e) => patchBuilderSchedule(item.id, day, e.target.value as Policy)}><option value="required">Wajib (hijau)</option><option value="conditional">Kondisional (kuning)</option><option value="not_scheduled">Tidak dijadwalkan</option></select></td>)}
            <td><label className="cpOppe"><input type="checkbox" checked={!!item.oppe} onChange={(e) => patchBuilderItem(item.id, { oppe: e.target.checked })} />Ya</label></td>
            <td><button type="button" className="cpBtn" onClick={() => removeBuilderItem(item.id)}>Hapus</button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="cpFooter"><span className="cpTiny">Hasil perubahan baru aktif setelah disimpan. Validasi klinis master tetap merupakan tanggung jawab pejabat/komite yang berwenang.</span><div className="cpActions"><button type="button" className="cpBtn" onClick={() => { setBuilder(null); setScreen('diagnosis') }}>Batal</button><button type="button" className="cpBtn primary" disabled={saving} onClick={() => void saveBuilder()}>{saving ? 'Menyimpan…' : 'Simpan versi master baru'}</button></div></div>
      </div>
    </>}
  </div>
}
