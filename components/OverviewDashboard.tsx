'use client'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NavigateFn } from '@/lib/aureka/focus'

type Risk = {
  id: string; risk_code: string; unit_id: number | null; unit_name: string; risk_event: string
  likelihood: number; impact: number; risk_score: number; risk_level: string; status: string; due_date: string | null
}
type Plan = { id: string; status: string; target_date: string | null; owner_room_id: number | null }
type Incident = { id: string; incident_code: string; incident_date: string | null; unit_name: string; incident_type: string; summary: string; status: string; created_at: string }
type QualityRecord = { id: string; room_id: number | null; status: string | null; review_required: boolean | null; created_at: string }
type ClinicalPathwayAudit = { id: string; room_id: number; template_code: string; template_name: string; patient_name: string; status: string; calculation_json: Record<string, any>; created_at: string }
type Section<T> = { rows: T[]; error: string | null; incomplete?: boolean; total?: number; review?: number }

const LEVELS = ['Sangat Tinggi', 'Tinggi', 'Sedang', 'Rendah', 'Sangat Rendah'] as const
// Same bands as Manajemen Risiko (skor = kemungkinan × dampak).
const matrixBand = (score: number) => score >= 20 ? 'very-high' : score >= 15 ? 'high' : score >= 10 ? 'moderate' : score >= 5 ? 'low' : 'very-low'
const LEVEL_CLASS: Record<string, string> = {
  'Sangat Tinggi': 'very-high', Tinggi: 'high', Sedang: 'moderate', Rendah: 'low', 'Sangat Rendah': 'very-low',
}
const INCIDENT_STATUS: Record<string, string> = {
  draft: 'Draft', submitted: 'Dilaporkan', under_review: 'Ditinjau', investigation: 'Investigasi', closed: 'Selesai',
}
const PLAN_ACTIVE = ['approved', 'in_progress', 'evaluated']
const PLAN_PENDING = ['pending_kabid', 'pending_director', 'pending_board']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Cache di memori agar Ringkasan langsung tampil saat dibuka lagi, lalu diperbarui di latar.
const ovCache = new Map<string, any[]>()
async function fetchAll<T>(build: (from: number, to: number) => any, cap = 5000): Promise<Section<T>> {
  const pageSize = 1000
  const pageCount = Math.ceil(cap / pageSize)
  const first = await build(0, Math.min(pageSize, cap) - 1)
  if (first.error) return { rows: [], error: first.error.message || 'Gagal memuat data' }
  const rows: T[] = [...((first.data || []) as T[])]
  if (rows.length < pageSize || rows.length >= cap) {
    if (rows.length < cap) return { rows, error: null }
  } else {
    const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, k) => {
      const from = (k + 1) * pageSize
      return build(from, Math.min(cap - 1, from + pageSize - 1))
    }))
    for (const page of rest) {
      if (page.error) return { rows, error: page.error.message || 'Gagal memuat data' }
      rows.push(...((page.data || []) as T[]))
      if (!page.data || page.data.length < pageSize) break
    }
    if (rows.length < cap) return { rows, error: null }
  }

  // Probe one record beyond the internal page window. Never present a capped
  // partial result as a complete hospital-wide or unit-level aggregate.
  const sentinel = await build(cap, cap)
  if (sentinel.error) return { rows, error: sentinel.error.message || 'Gagal memverifikasi kelengkapan data' }
  const incomplete = Boolean(sentinel.data && sentinel.data.length > 0)
  return incomplete
    ? { rows, error: 'Rekap belum lengkap. Buka modul terkait untuk melihat seluruh data.', incomplete: true }
    : { rows, error: null, incomplete: false }
}

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || target === 0) { setValue(target); return }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, run])
  return value
}

function KpiIcon({ kind }: { kind: 'quality' | 'safety' | 'risk' | 'audit' }) {
  if (kind === 'quality') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h7l4 4v12.4H7z"/><path d="M14 3.8v4h4M9.5 13h6M9.5 16.5h4"/><path d="m4 7.8 1.5 1.5"/></svg>
  if (kind === 'safety') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.1c0 4.5-2.8 7.9-7 9.7-4.2-1.8-7-5.2-7-9.7V6z"/><path d="m8.7 12.1 2.1 2.1 4.6-4.7"/></svg>
  if (kind === 'risk') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 9 16H3z"/><path d="M12 9v4.5M12 17h.01"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5v-2h6v2M8.5 10h7M8.5 14h7M8.5 18h4"/></svg>
}

function Kpi({ label, value, sub, tone, loading, onClick, delay, formatted }: { label: string; value: number | null; sub?: string; tone?: string; loading: boolean; onClick?: () => void; delay: number; formatted?: string }) {
  const shown = useCountUp(value ?? 0, !loading && value !== null)
  const normalized = label.toLowerCase()
  const kind: 'quality' | 'safety' | 'risk' | 'audit' =
    normalized.includes('ikp') ? 'safety' :
    normalized.includes('risiko') ? 'risk' :
    normalized.includes('audit') ? 'audit' : 'quality'
  const displayValue = value === null ? '—' : formatted || shown.toLocaleString('id-ID')
  return (
    <button type="button" className={`ovKpi magicKpi ${tone || ''}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick} disabled={!onClick}>
      <span className="magicKpiGlow" aria-hidden="true" />
      <span className="ovKpiHeader"><span className="ovKpiLabel">{label}</span><span className={`ovKpiIcon ${kind}`}><KpiIcon kind={kind}/></span></span>
      {loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b className="magicKpiValue" aria-label={`${label}: ${displayValue}`}>{displayValue}</b>}
      {sub && !loading && <small>{sub}</small>}
      <span className="magicKpiSweep" aria-hidden="true" />
    </button>
  )
}

function Panel({ title, eyebrow, children, delay, action }: { title: string; eyebrow?: string; children: ReactNode; delay: number; action?: ReactNode }) {
  return (
    <section className="ovPanel magicPanel" style={{ animationDelay: `${delay}ms` }}>
      <header className="ovPanelHead">
        <div>{eyebrow && <span className="ovEyebrow">{eyebrow}</span>}<h4>{title}</h4></div>
        {action}
      </header>
      {children}
    </section>
  )
}

const SectionError = ({ error }: { error: string }) => (
  <div className="ovEmpty">
    <b>{error.startsWith('Rekap belum lengkap') ? 'Rekap belum lengkap' : 'Data belum dapat dimuat'}</b>
    <span>{error}</span>
  </div>
)

export default function OverviewDashboard({
  supabase, role, roomId, roomName, manager, userName, onNavigate,
}: {
  supabase: SupabaseClient
  role: string | null
  roomId: number | null
  roomName: string | null
  manager: boolean
  userName: string
  onNavigate: NavigateFn
}) {
  const [loading, setLoading] = useState(true)
  const [risks, setRisks] = useState<Section<Risk>>({ rows: [], error: null })
  const [plans, setPlans] = useState<Section<Plan>>({ rows: [], error: null })
  const [incidents, setIncidents] = useState<Section<Incident>>({ rows: [], error: null })
  const [quality, setQuality] = useState<Section<QualityRecord>>({ rows: [], error: null })
  const [clinicalPathway, setClinicalPathway] = useState<Section<ClinicalPathwayAudit>>({ rows: [], error: null })
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const year = new Date().getFullYear()

  useEffect(() => {
    let cancelled = false
    const sb = supabase as any
    const cacheKey = ['overview-v3', userName, manager, roomId, roomName, year].join('|')
    const apply = ([r, p, i, q, cp]: any[]) => {
      if (cancelled) return
      // Role unit (PIC) melihat data unitnya saja, selaras dengan modul Manajemen Risiko.
      const norm = (v?: string | null) => String(v || '').trim().toLowerCase()
      const mine = (unitId: number | null, unitName?: string | null) =>
        manager || (roomId != null && (unitId === roomId || (unitId == null && !!roomName && norm(unitName) === norm(roomName))))
      setRisks({ ...r, rows: (r.rows as Risk[]).filter(x => mine(x.unit_id, x.unit_name)) })
      setPlans({ ...p, rows: (p.rows as Plan[]).filter(x => manager || (roomId != null && x.owner_room_id === roomId)) })
      setIncidents(i)
      setQuality(q)
      // Hanya 3 nilai ringkas dari calculation_json yang diambil (bukan seluruh isi audit) agar Ringkasan cepat.
      const cpRows = (cp.rows as any[]).map(x => x.calculation_json ? x : { ...x, calculation_json: { included: x.cj_included, section_d_pass: x.cj_section_d, compliance_pct: x.cj_compliance } }) as ClinicalPathwayAudit[]
      setClinicalPathway({ ...cp, rows: cpRows.filter(x => manager || (roomId != null && x.room_id === roomId)) })
      setRefreshedAt(new Date())
      setLoading(false)
    }
    let cached = ovCache.get(cacheKey)
    if (!cached) { try { const raw = sessionStorage.getItem('aureka-ov:' + cacheKey); if (raw) cached = JSON.parse(raw) } catch { /* abaikan */ } }
    if (cached) apply(cached)
    else setLoading(true)
    Promise.all([
      fetchAll<Risk>((f, t) => sb.schema('aureka_risk').from('risk_register')
        .select('id,risk_code,unit_id,unit_name,risk_event,likelihood,impact,risk_score,risk_level,status,due_date')
        .order('risk_score', { ascending: false }).order('id', { ascending: true }).range(f, t)),
      fetchAll<Plan>((f, t) => sb.schema('aureka_risk').from('mitigation_plans')
        .select('id,status,target_date,owner_room_id').order('id', { ascending: true }).range(f, t)),
      fetchAll<Incident>((f, t) => sb.schema('aureka_patient_safety').from('incidents')
        .select('id,incident_code,incident_date,unit_name,incident_type,summary,status,created_at')
        .order('created_at', { ascending: false }).range(f, t)),
      // Kartu episode mutu hanya butuh jumlah: hitung di database (count), jangan tarik ribuan baris.
      (async (): Promise<Section<QualityRecord>> => {
        const base = () => {
          let q = sb.schema('aureka_quality').from('quality_records').select('id', { count: 'exact', head: true }).eq('profile_year', year).is('archived_at', null)
          if (!manager) q = roomId != null ? q.eq('room_id', roomId) : q.eq('room_id', -1)
          return q
        }
        const [all, review] = await Promise.all([base(), base().eq('review_required', true)])
        const err = all.error || review.error
        if (err) return { rows: [], error: err.message || 'Gagal memuat data' }
        return { rows: [], error: null, total: all.count ?? 0, review: review.count ?? 0 }
      })(),
      fetchAll<ClinicalPathwayAudit>((f, t) => sb.schema('aureka_quality').from('clinical_pathway_audits')
        .select('id,room_id,status,created_at,cj_included:calculation_json->included,cj_section_d:calculation_json->section_d_pass,cj_compliance:calculation_json->compliance_pct')
        .gte('created_at', String(year) + '-01-01T00:00:00.000Z')
        .lt('created_at', String(year + 1) + '-01-01T00:00:00.000Z')
        .neq('status', 'archived').order('created_at', { ascending: false }).range(f, t)),
    ]).then(results => {
      if (!results.some((x: any) => x.error)) {
        ovCache.set(cacheKey, results)
        try { sessionStorage.setItem('aureka-ov:' + cacheKey, JSON.stringify(results)) } catch { /* penyimpanan penuh: abaikan */ }
      }
      apply(results)
    }).catch(() => {
      if (cancelled) return
      // Preserve cached rows but mark every affected source as stale/unavailable after a rejected request.
      const safeFailure = 'Data belum dapat diperbarui. Periksa koneksi lalu coba muat ulang.'
      setRisks(current => ({ ...current, error: current.error || safeFailure }))
      setPlans(current => ({ ...current, error: current.error || safeFailure }))
      setIncidents(current => ({ ...current, error: current.error || safeFailure }))
      setQuality(current => ({ ...current, error: current.error || safeFailure }))
      setClinicalPathway(current => ({ ...current, error: current.error || safeFailure }))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [supabase, manager, roomId, roomName, year, reloadKey, userName])

  const stats = useMemo(() => {
    const now = new Date()
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    const byLevel = Object.fromEntries(LEVELS.map(l => [l, 0])) as Record<string, number>
    const matrix: number[][] = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0])
    const unitHigh = new Map<string, number>()
    let overdue = 0, overdueHigh = 0, highNoTarget = 0
    for (const r of risks.rows) {
      byLevel[r.risk_level] = (byLevel[r.risk_level] || 0) + 1
      if (r.likelihood >= 1 && r.likelihood <= 5 && r.impact >= 1 && r.impact <= 5) matrix[5 - r.likelihood][r.impact - 1]++
      if (r.risk_level === 'Tinggi' || r.risk_level === 'Sangat Tinggi') {
        if (!r.due_date && r.status !== 'Controlled' && r.status !== 'Accepted') highNoTarget++
        const key = r.unit_name?.trim() || 'Tanpa unit'
        unitHigh.set(key, (unitHigh.get(key) || 0) + 1)
      }
      if (r.due_date && r.due_date < today && r.status !== 'Controlled' && r.status !== 'Accepted') {
        overdue++
        if (r.risk_level === 'Tinggi' || r.risk_level === 'Sangat Tinggi') overdueHigh++
      }
    }
    const months: { label: string; key: string; count: number }[] = []
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      months.push({ label: MONTHS[d.getMonth()], key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 })
    }
    let incidentsYear = 0, incidentsMonth = 0, incidentsOpen = 0
    const thisMonth = months[months.length - 1].key
    for (const i of incidents.rows) {
      const key = (i.incident_date || i.created_at || '').slice(0, 7)
      const m = months.find(x => x.key === key)
      if (m) m.count++
      if (key.startsWith(String(now.getFullYear()))) incidentsYear++
      if (key === thisMonth) incidentsMonth++
      if (i.status !== 'closed' && i.status !== 'draft') incidentsOpen++
    }
    return {
      byLevel, matrix, overdue, overdueHigh, highNoTarget, months, incidentsYear, incidentsMonth, incidentsOpen,
      high: (byLevel['Tinggi'] || 0) + (byLevel['Sangat Tinggi'] || 0),
      needsMitigation: (byLevel['Sedang'] || 0) + (byLevel['Tinggi'] || 0) + (byLevel['Sangat Tinggi'] || 0),
      plansActive: plans.rows.filter(p => PLAN_ACTIVE.includes(p.status)).length,
      plansPending: plans.rows.filter(p => PLAN_PENDING.includes(p.status)).length,
      qualityTotal: quality.total ?? 0,
      qualityReview: quality.review ?? 0,
      auditPending: (quality.review ?? 0) + clinicalPathway.rows.filter(x => x.status === 'submitted').length,
      cpAuditTotal: clinicalPathway.rows.length,
      cpReviewedTotal: clinicalPathway.rows.filter(x => x.status === 'submitted' || x.status === 'validated').length,
      cpEligibleTotal: clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true).length,
      cpSectionDPass: clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true && x.calculation_json?.section_d_pass === true).length,
      cpAverageCompliance: (() => { const vals = clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true && typeof x.calculation_json?.compliance_pct === 'number').map(x => x.calculation_json.compliance_pct as number); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null })(),
      topUnits: Array.from(unitHigh.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
      maxMatrix: Math.max(1, ...matrix.flat()),
      maxMonth: Math.max(1, ...months.map(m => m.count)),
    }
  }, [risks.rows, incidents.rows, plans.rows, quality.total, quality.review, clinicalPathway.rows])

  const totalRisk = risks.rows.length
  const maxLevel = Math.max(1, ...LEVELS.map(l => stats.byLevel[l] || 0))
  const topRisks = risks.rows.slice(0, 5)
  const recentIncidents = incidents.rows.slice(0, 5)
  const sourceError = Boolean(risks.error || plans.error || incidents.error || quality.error || clinicalPathway.error)

  return (
    <div className="ovRoot">
      <WorkspaceModuleHeader
        className="ovHero"
        title={`Selamat datang, ${userName.trim().split(/\s+/)[0] || 'Pengguna'}`}
        description={manager
            ? 'Ringkasan terpadu indikator mutu, keselamatan pasien, audit klinis, dan pengendalian risiko rumah sakit.'
            : `Ruang kerja mutu untuk ${roomName || 'unit Anda'} · input dan tindak lanjut sesuai hak akses.`}
        actions={<div className="ovHeroMeta">
          <span className="ovHeroDate">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Pontianak' }).format(new Date())}</span>
          <button type="button" className="ovRefresh" onClick={() => setReloadKey(k => k + 1)} disabled={loading} aria-label="Muat ulang data">
            <span className={loading ? 'ovSpin' : ''}>↻</span> {loading ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>}
      />

      {!manager && roomId == null && <div className="ovNotice">Akun Anda belum terhubung ke ruangan/unit kerja, sehingga data unit belum dapat ditampilkan. Hubungi Super Admin untuk memetakan unit utama akun Anda.</div>}


      <>
      <section className="ovBento" aria-label="Ringkasan utama">
        <div className="ovBentoMap">
          <header className="ovBentoMapHead">
            <div><span className="ovEyebrow">PETA RISIKO</span><h3>Peta risiko rumah sakit</h3></div>
            <button type="button" className="ovBentoTotal" onClick={() => onNavigate('risk', {})} title="Buka register risiko">
              <b>{risks.error || loading ? '—' : totalRisk.toLocaleString('id-ID')}</b><small>risiko</small>
            </button>
          </header>
          {risks.error ? <SectionError error={risks.error} /> : loading ? <div className="ovSkeletonBlock" /> :
            <div className="ovBentoMatrix">
              <div className="ovBentoGrid" role="table" aria-label="Jumlah risiko per kemungkinan dan dampak">
                {stats.matrix.map((row, ri) => <div className="ovBentoRow" role="row" key={ri}>
                  <span className="ovBentoAxis" role="rowheader">{5 - ri}</span>
                  {row.map((count, ci) => (
                    <button type="button" key={`${ri}-${ci}`} role="cell" className="ovCell" disabled={!count} data-band={matrixBand((5 - ri) * (ci + 1))}
                      onClick={() => onNavigate('risk', { likelihood: 5 - ri, impact: ci + 1 })}
                      title={`Kemungkinan ${5 - ri} × Dampak ${ci + 1}: ${count} risiko${count ? ' — klik untuk melihat daftarnya' : ''}`}
                      style={{ ['--heat' as any]: count ? 0.18 + 0.82 * (count / stats.maxMatrix) : 0 }}>
                      {count ? count.toLocaleString('id-ID') : '–'}
                    </button>
                  ))}
                </div>)}
                <div className="ovBentoRow ovBentoCols" aria-hidden="true"><span className="ovBentoAxis" />{[1, 2, 3, 4, 5].map(n => <span key={n} className="ovBentoAxis">{n}</span>)}</div>
              </div>
              <div className="ovBentoLegend"><span>↑ kemungkinan · → dampak</span>{LEVELS.map(l => <span key={l}><i style={{ background: `rgb(var(--risk-${LEVEL_CLASS[l]}))` }} />{l}</span>)}</div>
            </div>}
        </div>
        <div className="ovBentoKpis ovKpis">
        <Kpi delay={0} loading={loading} label={`Episode mutu ${year}`} value={quality.error ? null : stats.qualityTotal} sub={quality.incomplete ? 'Rekap belum lengkap' : quality.error ? 'Tidak tersedia' : `${stats.qualityReview} perlu review`} onClick={() => onNavigate('quality')} />
        <Kpi delay={60} loading={loading} tone="warn" label="IKP perlu tindak lanjut" value={incidents.error ? null : stats.incidentsOpen} sub={incidents.incomplete ? 'Rekap belum lengkap' : incidents.error ? 'Tidak tersedia' : 'Insiden belum ditutup'} onClick={() => onNavigate('safety')} />
        <Kpi delay={120} loading={loading} tone="danger" label="Risiko tinggi / sangat tinggi" value={risks.error ? null : stats.high} sub={risks.incomplete ? 'Rekap belum lengkap' : risks.error ? 'Tidak tersedia' : stats.overdueHigh ? `${stats.overdueHigh} melewati target RTP` : stats.highNoTarget ? `${stats.highNoTarget.toLocaleString('id-ID')} belum punya target RTP` : 'Tidak ada yang melewati target'} onClick={() => onNavigate('risk')} />
        <Kpi delay={180} loading={loading} label="Audit menunggu validasi" value={quality.error || clinicalPathway.error ? null : stats.auditPending} sub={quality.incomplete || clinicalPathway.incomplete ? 'Rekap belum lengkap' : quality.error || clinicalPathway.error ? 'Tidak tersedia' : 'Logbook dan Clinical Pathway'} onClick={() => onNavigate('quality')} />
        </div>
      </section>

      <nav className="ovBentoTodo" aria-label="Perlu tindakan">
        <button type="button" onClick={() => onNavigate('quality')}><span><b>Validasi logbook</b><small>Laporan PIC siap ditinjau</small></span><strong>{loading || quality.error ? '—' : (quality.review ?? 0).toLocaleString('id-ID')}</strong></button>
        <button type="button" onClick={() => onNavigate('risk')}><span><b>Susun RTP</b><small>Risiko tinggi tanpa target RTP</small></span><strong>{loading || risks.error ? '—' : stats.highNoTarget.toLocaleString('id-ID')}</strong></button>
        <button type="button" onClick={() => onNavigate('risk')}><span><b>RTP lewat tenggat</b><small>Risiko tinggi melewati target</small></span><strong>{loading || risks.error ? '—' : stats.overdueHigh.toLocaleString('id-ID')}</strong></button>
        <button type="button" onClick={() => onNavigate('safety')}><span><b>Laporan IKP</b><small>Insiden belum ditutup</small></span><strong>{loading || incidents.error ? '—' : stats.incidentsOpen.toLocaleString('id-ID')}</strong></button>
      </nav>

      <section className="ovContextBar" aria-label="Periode dan status data">
        <div><span>PERIODE PELAPORAN</span><b>{`1 Jan–${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Pontianak' })} ${year} · Tahun berjalan`}</b></div>
        <div><span>UNIT</span><b>{manager ? 'Seluruh rumah sakit' : roomName || 'Unit belum dipetakan'}</b></div>
        <div><span>PEMUTAKHIRAN DATA</span><b>{loading ? 'Memuat data…' : refreshedAt ? `Dicek ${refreshedAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Pontianak' })}, ${refreshedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Pontianak' })} WIB` : 'Belum diperbarui'}</b></div>
        <div className="ovContextStatus"><span>STATUS SUMBER</span><b className={sourceError ? 'error' : loading ? 'loading' : 'ok'}>{loading ? 'Memuat' : sourceError ? 'Perlu pemeriksaan' : 'Pembacaan selesai'}</b></div>
      </section>
      <p className="ovScopeNote">Cakupan: episode mutu dan Clinical Pathway mengikuti tahun laporan; risiko dihitung dari register yang dapat diakses; IKP perlu tindak lanjut menghitung laporan yang belum ditutup tanpa batasan tahun. Ini bukan satu periode filter yang diterapkan ke seluruh modul.</p>

      <div className="ovGrid">
        <Panel delay={120} eyebrow="MANAJEMEN RISIKO" title="Distribusi level risiko" action={<button type="button" className="ovLink" onClick={() => onNavigate('risk')}>Buka register →</button>}>
          {risks.error ? <SectionError error={risks.error} /> : loading ? <div className="ovSkeletonBlock" /> : !totalRisk ? <div className="ovEmpty"><b>Belum ada risiko</b><span>Tambahkan risiko melalui modul Manajemen Risiko.</span></div> :
            <div className="ovBars" role="list">
              {LEVELS.map((l, idx) => {
                const v = stats.byLevel[l] || 0
                return <button type="button" key={l} className="ovBarRow ovClickable" role="listitem" disabled={!v} onClick={() => onNavigate('risk', { level: l })} title={`${l}: ${v} risiko (${Math.round(v / totalRisk * 100)}%) — klik untuk melihat daftarnya`}>
                  <span className={`rmBadge ${LEVEL_CLASS[l]}`}>{l}</span>
                  <div className="ovBarTrack"><div className={`ovBarFill lvl-${LEVEL_CLASS[l]}`} style={{ width: `${(v / maxLevel) * 100}%`, animationDelay: `${200 + idx * 70}ms` }} /></div>
                  <b>{v.toLocaleString('id-ID')}</b>
                </button>
              })}
            </div>}
        </Panel>

        <Panel delay={240} eyebrow="KESELAMATAN PASIEN" title="Tren laporan insiden 6 bulan" action={<button type="button" className="ovLink" onClick={() => onNavigate('safety')}>Buka IKP →</button>}>
          {incidents.error ? <SectionError error={incidents.error} /> : loading ? <div className="ovSkeletonBlock" /> :
            <div className="ovColumns" role="list">
              {stats.months.map((m, idx) => (
                <div key={m.key} className="ovColumn" role="listitem" title={`${m.label}: ${m.count} insiden`}>
                  <span className="ovColumnValue">{m.count || ''}</span>
                  <div className="ovColumnTrack"><div className="ovColumnFill" style={{ height: `${(m.count / stats.maxMonth) * 100}%`, animationDelay: `${260 + idx * 60}ms` }} /></div>
                  <span className="ovColumnLabel">{m.label}</span>
                </div>
              ))}
            </div>}
        </Panel>

        <Panel delay={300} eyebrow="PRIORITAS" title="Risiko dengan skor tertinggi" action={<button type="button" className="ovLink" onClick={() => onNavigate('risk', {})}>Lihat semua →</button>}>
          {risks.error ? <SectionError error={risks.error} /> : loading ? <div className="ovSkeletonBlock" /> : !topRisks.length ? <div className="ovEmpty"><b>Belum ada risiko</b><span>Data akan tampil setelah risiko dicatat.</span></div> :
            <ol className="ovList">
              {topRisks.map(r => (
                <li key={r.id}>
                  <button type="button" onClick={() => onNavigate('risk', { riskId: r.id })} aria-label={`Buka risiko ${r.risk_code}`}>
                    <strong className="ovScore">{r.risk_score}</strong>
                    <span className="ovListText" title={`${r.risk_event} · ${r.unit_name}`}><b>{r.risk_event}</b><small>{r.risk_code} · {r.unit_name}</small></span>
                    <span className={`rmBadge ${LEVEL_CLASS[r.risk_level] || ''}`}>{r.risk_level}</span>
                  </button>
                </li>
              ))}
            </ol>}
        </Panel>

        <Panel delay={360} eyebrow="KESELAMATAN PASIEN" title="Laporan insiden terbaru" action={<button type="button" className="ovLink" onClick={() => onNavigate('safety', { tab: 'overview' })}>Lihat semua →</button>}>
          {incidents.error ? <SectionError error={incidents.error} /> : loading ? <div className="ovSkeletonBlock" /> : !recentIncidents.length ? <div className="ovEmpty"><b>Belum ada laporan</b><span>Laporan IKP yang dibuat akan tampil di sini.</span></div> :
            <ol className="ovList">
              {recentIncidents.map(i => (
                <li key={i.id}>
                  <button type="button" onClick={() => onNavigate('safety', { incidentId: i.id })} aria-label={`Buka laporan ${i.incident_code}`}>
                    <span className="ovDot" data-status={i.status} aria-hidden="true" />
                    <span className="ovListText" title={i.summary || i.incident_type || i.incident_code}><b>{i.summary || i.incident_type || i.incident_code}</b><small>{i.incident_code} · {i.unit_name || 'Unit belum diisi'} · {(i.incident_date || i.created_at).slice(0, 10)}</small></span>
                    <span className="ovStatus">{INCIDENT_STATUS[i.status] || i.status}</span>
                  </button>
                </li>
              ))}
            </ol>}
        </Panel>

        {manager && <Panel delay={420} eyebrow="UNIT KERJA" title="Unit dengan risiko tinggi terbanyak" action={<button type="button" className="ovLink" onClick={() => onNavigate('risk', {})}>Lihat semua →</button>}>
          {risks.error ? <SectionError error={risks.error} /> : loading ? <div className="ovSkeletonBlock" /> : !stats.topUnits.length ? <div className="ovEmpty"><b>Tidak ada risiko tinggi</b><span>Belum ada unit dengan risiko Tinggi/Sangat Tinggi.</span></div> :
            <div className="ovBars" role="list">
              {stats.topUnits.map(([unit, count], idx) => (
                <button type="button" key={unit} className="ovBarRow ovBarRowUnit ovClickable" role="listitem" onClick={() => onNavigate('risk', { unitName: unit })} title={`${unit}: ${count} risiko tinggi — klik untuk membuka register unit ini`}>
                  <span className="ovUnitName">{unit}</span>
                  <div className="ovBarTrack"><div className="ovBarFill lvl-accent" style={{ width: `${(count / stats.topUnits[0][1]) * 100}%`, animationDelay: `${440 + idx * 70}ms` }} /></div>
                  <b>{count}</b>
                </button>
              ))}
            </div>}
        </Panel>}

        {!manager && <Panel delay={420} eyebrow="AKSI CEPAT" title="Mulai input data unit">
          <div className="ovQuick">
            <button type="button" onClick={() => onNavigate('risk')}><b>Register risiko</b><span>Tambah atau perbaiki risiko unit</span></button>
            <button type="button" onClick={() => onNavigate('safety')}><b>Lapor insiden</b><span>Laporan IKP keselamatan pasien</span></button>
            <button type="button" onClick={() => onNavigate('quality')}><b>Indikator mutu</b><span>Input episode / capaian unit</span></button>
          </div>
        </Panel>}
      </div>
      <p className="ovFoot">Angka dihitung langsung dari database AUREKA sesuai hak akses {role === 'ADMIN' ? 'Super Admin' : 'akun Anda'}. Klik kartu, baris, atau sel peta untuk langsung membuka datanya.</p>
      </> {manager && <section className="ovExecutive" aria-label="Ringkasan manajemen terpadu">
        <div className="ovExecGrid">
          <Panel delay={120} eyebrow="EARLY WARNING" title="Peringatan prioritas manajemen">
            <div className="ovExecutiveAlerts">
              {sourceError && <div className="ovExecutiveAlert danger"><b>Data belum lengkap</b><span>Satu atau lebih sumber data gagal dimuat. Periksa status sumber sebelum menggunakan ringkasan ini.</span></div>}
              {!risks.error && stats.overdueHigh > 0 && <button type="button" className="ovExecutiveAlert danger" onClick={() => onNavigate('risk')}><b>{stats.overdueHigh} risiko tinggi terlambat</b><span>Target pengendalian telah terlewati dan perlu perhatian manajemen.</span></button>}
              {!incidents.error && stats.incidentsOpen > 0 && <button type="button" className="ovExecutiveAlert warning" onClick={() => onNavigate('safety')}><b>{stats.incidentsOpen} laporan IKP belum ditutup</b><span>Pantau investigasi, rekomendasi, dan penyelesaian tindak lanjut.</span></button>}
              {!quality.error && !clinicalPathway.error && stats.auditPending > 0 && <button type="button" className="ovExecutiveAlert warning" onClick={() => onNavigate('quality')}><b>{stats.auditPending} audit menunggu validasi</b><span>Logbook indikator dan Clinical Pathway memerlukan telaah.</span></button>}
              {!sourceError && stats.overdueHigh === 0 && stats.incidentsOpen === 0 && stats.auditPending === 0 && <div className="ovExecutiveAlert success"><b>Tidak ada prioritas terbuka pada sumber yang dibaca</b><span>Ini bukan pernyataan bahwa seluruh risiko atau insiden rumah sakit telah terkendali.</span></div>}
            </div>
          </Panel>
          
          <Panel delay={240} eyebrow="AUDIT KLINIS" title="Kinerja Clinical Pathway">
            {clinicalPathway.error ? <SectionError error={clinicalPathway.error} /> : loading ? <div className="ovSkeletonBlock" /> :
              <div className="ovExecPerformance">
                <div className="ovExecHeadline"><strong className="magicKpiValue">{stats.cpAverageCompliance === null ? '—' : stats.cpAverageCompliance.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'}</strong><span>Rerata kepatuhan pada episode eligible yang memiliki nilai kepatuhan numerik.</span></div>
                <div className="ovExecMetric"><span>Episode audit</span><b>{stats.cpAuditTotal.toLocaleString('id-ID')}</b></div>
                <div className="ovExecMetric"><span>Episode masuk perhitungan</span><b>{stats.cpEligibleTotal.toLocaleString('id-ID')}</b></div>
                <div className="ovExecMetric"><span>Lulus komponen Section D</span><b>{stats.cpEligibleTotal ? stats.cpSectionDPass.toLocaleString('id-ID') + ' / ' + stats.cpEligibleTotal.toLocaleString('id-ID') : '—'}</b></div>
              </div>}
          </Panel>
          <Panel delay={360} eyebrow="PENGENDALIAN" title="Status rencana tindak pengendalian">
            {plans.error ? <SectionError error={plans.error} /> : loading ? <div className="ovSkeletonBlock" /> :
              <div className="ovExecRtp">
                <div><span>Aktif / berjalan / dievaluasi</span><b>{stats.plansActive.toLocaleString('id-ID')}</b></div>
                <div><span>Menunggu persetujuan</span><b>{stats.plansPending.toLocaleString('id-ID')}</b></div>
                <div><span>Lewat target (semua level)</span><b>{stats.overdue.toLocaleString('id-ID')}</b></div>
                <button type="button" className="ovLink" onClick={() => onNavigate('risk')}>Buka RTP →</button>
              </div>}
          </Panel>
          
        </div>
        <p className="ovFoot">Bagian ringkasan manajemen melengkapi panel operasional pada halaman yang sama; setiap angka tetap mengikuti cakupan sumber dan hak akses. Angka lintas-modul tidak boleh ditafsirkan sebagai satu skor mutu rumah sakit atau sebagai indikator nasional yang telah tervalidasi.</p>
      </section>}
    </div>
  )
}
