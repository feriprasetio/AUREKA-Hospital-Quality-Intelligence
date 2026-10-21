'use client'

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
type Section<T> = { rows: T[]; error: string | null }

const LEVELS = ['Sangat Tinggi', 'Tinggi', 'Sedang', 'Rendah', 'Sangat Rendah'] as const
const LEVEL_CLASS: Record<string, string> = {
  'Sangat Tinggi': 'very-high', Tinggi: 'high', Sedang: 'moderate', Rendah: 'low', 'Sangat Rendah': 'very-low',
}
const INCIDENT_STATUS: Record<string, string> = {
  draft: 'Draft', submitted: 'Dilaporkan', under_review: 'Ditinjau', investigation: 'Investigasi', closed: 'Selesai',
}
const PLAN_ACTIVE = ['approved', 'in_progress', 'evaluated']
const PLAN_PENDING = ['pending_kabid', 'pending_director', 'pending_board']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

async function fetchAll<T>(build: (from: number, to: number) => any, cap = 5000): Promise<Section<T>> {
  const rows: T[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) return { rows, error: error.message || 'Gagal memuat data' }
    rows.push(...((data || []) as T[]))
    if (!data || data.length < 1000) break
  }
  return { rows, error: null }
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

function Kpi({ label, value, sub, tone, loading, onClick, delay, formatted }: { label: string; value: number | null; sub?: string; tone?: string; loading: boolean; onClick?: () => void; delay: number; formatted?: string }) {
  const shown = useCountUp(value ?? 0, !loading && value !== null)
  return (
    <button type="button" className={`ovKpi ${tone || ''}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick} disabled={!onClick}>
      <span className="ovKpiLabel">{label}</span>
      {loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{value === null ? '—' : formatted || shown.toLocaleString('id-ID')}</b>}
      {sub && !loading && <small>{sub}</small>}
    </button>
  )
}

function Panel({ title, eyebrow, children, delay, action }: { title: string; eyebrow?: string; children: ReactNode; delay: number; action?: ReactNode }) {
  return (
    <section className="ovPanel" style={{ animationDelay: `${delay}ms` }}>
      <header className="ovPanelHead">
        <div>{eyebrow && <span className="ovEyebrow">{eyebrow}</span>}<h4>{title}</h4></div>
        {action}
      </header>
      {children}
    </section>
  )
}

const SectionError = ({ error }: { error: string }) => (
  <div className="ovEmpty"><b>Data belum dapat dimuat</b><span>{error}</span></div>
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
    setLoading(true)
    Promise.all([
      fetchAll<Risk>((f, t) => sb.schema('aureka_risk').from('risk_register')
        .select('id,risk_code,unit_id,unit_name,risk_event,likelihood,impact,risk_score,risk_level,status,due_date')
        .order('risk_score', { ascending: false }).order('id', { ascending: true }).range(f, t)),
      fetchAll<Plan>((f, t) => sb.schema('aureka_risk').from('mitigation_plans')
        .select('id,status,target_date,owner_room_id').order('id', { ascending: true }).range(f, t)),
      fetchAll<Incident>((f, t) => sb.schema('aureka_patient_safety').from('incidents')
        .select('id,incident_code,incident_date,unit_name,incident_type,summary,status,created_at')
        .order('created_at', { ascending: false }).range(f, t)),
      fetchAll<QualityRecord>((f, t) => sb.schema('aureka_quality').from('quality_records')
        .select('id,room_id,status,review_required,created_at').eq('profile_year', year)
        .order('created_at', { ascending: false }).range(f, t)),
      fetchAll<ClinicalPathwayAudit>((f, t) => sb.schema('aureka_quality').from('clinical_pathway_audits')
        .select('id,room_id,template_code,template_name,patient_name,status,calculation_json,created_at')
        .gte('created_at', String(year) + '-01-01T00:00:00.000Z')
        .lt('created_at', String(year + 1) + '-01-01T00:00:00.000Z')
        .neq('status', 'archived').order('created_at', { ascending: false }).range(f, t)),
    ]).then(([r, p, i, q, cp]) => {
      if (cancelled) return
      // Role unit (PIC) melihat data unitnya saja, selaras dengan modul Manajemen Risiko.
      const norm = (v?: string | null) => String(v || '').trim().toLowerCase()
      const mine = (unitId: number | null, unitName?: string | null) =>
        manager || (roomId != null && (unitId === roomId || (unitId == null && !!roomName && norm(unitName) === norm(roomName))))
      setRisks({ ...r, rows: r.rows.filter(x => mine(x.unit_id, x.unit_name)) })
      setPlans({ ...p, rows: p.rows.filter(x => manager || (roomId != null && x.owner_room_id === roomId)) })
      setIncidents(i)
      setQuality({ ...q, rows: q.rows.filter(x => manager || (roomId != null && x.room_id === roomId)) })
      setClinicalPathway({ ...cp, rows: cp.rows.filter(x => manager || (roomId != null && x.room_id === roomId)) })
      setRefreshedAt(new Date())
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [supabase, manager, roomId, roomName, year, reloadKey])

  const stats = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const byLevel = Object.fromEntries(LEVELS.map(l => [l, 0])) as Record<string, number>
    const matrix: number[][] = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0])
    const unitHigh = new Map<string, number>()
    let overdue = 0, overdueHigh = 0
    for (const r of risks.rows) {
      byLevel[r.risk_level] = (byLevel[r.risk_level] || 0) + 1
      if (r.likelihood >= 1 && r.likelihood <= 5 && r.impact >= 1 && r.impact <= 5) matrix[5 - r.likelihood][r.impact - 1]++
      if (r.risk_level === 'Tinggi' || r.risk_level === 'Sangat Tinggi') {
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
      byLevel, matrix, overdue, overdueHigh, months, incidentsYear, incidentsMonth, incidentsOpen,
      high: (byLevel['Tinggi'] || 0) + (byLevel['Sangat Tinggi'] || 0),
      needsMitigation: (byLevel['Sedang'] || 0) + (byLevel['Tinggi'] || 0) + (byLevel['Sangat Tinggi'] || 0),
      plansActive: plans.rows.filter(p => PLAN_ACTIVE.includes(p.status)).length,
      plansPending: plans.rows.filter(p => PLAN_PENDING.includes(p.status)).length,
      qualityTotal: quality.rows.length,
      qualityReview: quality.rows.filter(q => q.review_required).length,
      cpAuditTotal: clinicalPathway.rows.length,
      cpReviewedTotal: clinicalPathway.rows.filter(x => x.status === 'submitted' || x.status === 'validated').length,
      cpEligibleTotal: clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true).length,
      cpSectionDPass: clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true && x.calculation_json?.section_d_pass === true).length,
      cpAverageCompliance: (() => { const vals = clinicalPathway.rows.filter(x => (x.status === 'submitted' || x.status === 'validated') && x.calculation_json?.included === true && typeof x.calculation_json?.compliance_pct === 'number').map(x => x.calculation_json.compliance_pct as number); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null })(),
      topUnits: Array.from(unitHigh.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
      maxMatrix: Math.max(1, ...matrix.flat()),
      maxMonth: Math.max(1, ...months.map(m => m.count)),
    }
  }, [risks.rows, incidents.rows, plans.rows, quality.rows, clinicalPathway.rows])

  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam'
  const totalRisk = risks.rows.length
  const maxLevel = Math.max(1, ...LEVELS.map(l => stats.byLevel[l] || 0))
  const topRisks = risks.rows.slice(0, 5)
  const recentIncidents = incidents.rows.slice(0, 5)
  const firstName = userName.split(/\s|,/)[0] || userName

  return (
    <div className="ovRoot">
      <section className="ovHero">
        <div>
          <span className="ovEyebrow">{manager ? 'RINGKASAN RUMAH SAKIT' : 'RINGKASAN UNIT'}</span>
          <h3>{greeting}, {firstName}</h3>
          <p>{manager ? 'Pantauan mutu, keselamatan pasien, Clinical Pathway, dan manajemen risiko seluruh unit kerja.' : `Pantauan data unit ${roomName || 'Anda'}: register risiko, laporan insiden, indikator mutu, dan audit Clinical Pathway.`}</p>
        </div>
        <div className="ovHeroMeta">
          <span className="ovChip">{manager ? 'Seluruh unit' : roomName || 'Unit belum dipetakan'}</span>
          <button type="button" className="ovRefresh" onClick={() => setReloadKey(k => k + 1)} disabled={loading} aria-label="Muat ulang data">
            <span className={loading ? 'ovSpin' : ''}>↻</span> {loading ? 'Memuat…' : refreshedAt ? `Diperbarui ${refreshedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Muat ulang'}
          </button>
        </div>
      </section>

      {!manager && roomId == null && <div className="ovNotice">Akun Anda belum terhubung ke ruangan/unit kerja, sehingga data unit belum dapat ditampilkan. Hubungi Super Admin untuk memetakan unit utama akun Anda.</div>}

      <div className="ovKpis">
        <Kpi delay={0} loading={loading} label="Risiko terdaftar" value={risks.error ? null : totalRisk} sub={risks.error ? 'Tidak tersedia' : `${stats.needsMitigation.toLocaleString('id-ID')} perlu mitigasi`} onClick={() => onNavigate('risk')} />
        <Kpi delay={60} loading={loading} tone="danger" label="Risiko tinggi & sangat tinggi" value={risks.error ? null : stats.high} sub={stats.overdueHigh ? `${stats.overdueHigh} lewat target penyelesaian` : 'Tidak ada yang lewat target'} onClick={() => onNavigate('risk')} />
        <Kpi delay={120} loading={loading} label="RTP berjalan" value={plans.error ? null : stats.plansActive} sub={plans.error ? 'Tidak tersedia' : `${stats.plansPending} menunggu persetujuan`} onClick={() => onNavigate('risk')} />
        <Kpi delay={180} loading={loading} label={`Insiden ${year}`} value={incidents.error ? null : stats.incidentsYear} sub={incidents.error ? 'Tidak tersedia' : `${stats.incidentsMonth} bulan ini`} onClick={() => onNavigate('safety')} />
        <Kpi delay={240} loading={loading} tone="warn" label="Insiden dalam proses" value={incidents.error ? null : stats.incidentsOpen} sub="Belum ditutup" onClick={() => onNavigate('safety')} />
        <Kpi delay={300} loading={loading} label={`Episode mutu ${year}`} value={quality.error ? null : stats.qualityTotal} sub={quality.error ? 'Tidak tersedia' : `${stats.qualityReview} perlu review`} onClick={() => onNavigate('quality')} />
        <Kpi delay={360} loading={loading} label={`Audit Clinical Pathway ${year}`} value={clinicalPathway.error ? null : stats.cpAuditTotal} sub={clinicalPathway.error ? 'Tidak tersedia' : `${stats.cpReviewedTotal} diajukan / tervalidasi`} onClick={() => onNavigate('clinicalPathway')} />
        <Kpi delay={420} loading={loading} tone="warn" label="CP memenuhi Bagian D" value={clinicalPathway.error ? null : stats.cpSectionDPass} sub={clinicalPathway.error ? 'Tidak tersedia' : `${stats.cpEligibleTotal} audit memenuhi kriteria inklusi`} onClick={() => onNavigate('clinicalPathway')} />
        <Kpi delay={480} loading={loading} label="Rata-rata kepatuhan CP" value={clinicalPathway.error || stats.cpAverageCompliance == null ? null : Math.round(stats.cpAverageCompliance)} formatted={clinicalPathway.error || stats.cpAverageCompliance == null ? undefined : stats.cpAverageCompliance.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'} sub={clinicalPathway.error ? 'Tidak tersedia' : stats.cpAverageCompliance == null ? 'Belum ada audit yang dapat dinilai' : `Dari ${stats.cpEligibleTotal} audit masuk inklusi dan diajukan`} onClick={() => onNavigate('clinicalPathway')} />
      </div>

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

        <Panel delay={180} eyebrow="PETA RISIKO" title="Sebaran kemungkinan × dampak" action={<button type="button" className="ovLink" onClick={() => onNavigate('risk', {})}>Lihat semua →</button>}>
          {risks.error ? <SectionError error={risks.error} /> : loading ? <div className="ovSkeletonBlock" /> :
            <div className="ovMatrixWrap">
              <span className="ovAxisY">Kemungkinan</span>
              <div className="ovMatrix" role="table" aria-label="Jumlah risiko per kemungkinan dan dampak">
                {stats.matrix.map((row, ri) => row.map((count, ci) => (
                  <button type="button" key={`${ri}-${ci}`} role="cell" className="ovCell" disabled={!count}
                    onClick={() => onNavigate('risk', { likelihood: 5 - ri, impact: ci + 1 })}
                    title={`Kemungkinan ${5 - ri} × Dampak ${ci + 1}: ${count} risiko${count ? ' — klik untuk melihat daftarnya' : ''}`}
                    style={{ ['--heat' as any]: count ? 0.18 + 0.82 * (count / stats.maxMatrix) : 0 }}>
                    {count || ''}
                  </button>
                )))}
              </div>
              <span className="ovAxisX">Dampak →</span>
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
    </div>
  )
}
