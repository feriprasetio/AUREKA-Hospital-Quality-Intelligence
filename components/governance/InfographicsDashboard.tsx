'use client'
import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { AUREKA_PRIMARY_NAV, type AurekaRole } from '@/lib/aureka/module-registry'
import type { NavigateFn } from '@/lib/aureka/focus'

type Room = { id: number; name: string }
type CountItem = { label: string; count: number }
type MonthItem = { month: number; total: number; validated?: number }
type Summary = {
  year: number; room_id: number | null; room_name: string
  quality: { active_indicators: number; records: number; validated: number; validation_rate: number; monthly: MonthItem[]; categories: CountItem[] }
  incidents: { total: number; open: number; closed: number; monthly: MonthItem[] }
  risk: { total: number; very_high: number; open: number; relationships: number; monthly: MonthItem[]; levels: CountItem[]; categories: CountItem[] }
  program: { recommendations: number; actions: number; open_actions: number; overdue_actions: number; completed_actions: number }
  regulation: { published: number; pending_approval: number; review_due: number }
}
type Props = { rooms: Room[]; role: string | null; mode?: 'full' | 'quality'; initialRoomId?: number | null; unitLocked?: boolean; onNavigate?: NavigateFn }
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const GLOBAL_ROLES = ['ADMIN','PMKP','MANAGEMENT','DIREKTUR','DEWAN_PENGAWAS']
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const fmt = (v: unknown) => n(v).toLocaleString('id-ID')
const pct = (v: unknown) => n(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'

const STYLES = [
'.infographicsDashboard{display:grid;gap:14px;color:var(--arktik-ink,#21374f)}',
'.ifHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
'.ifHead h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--arktik-ink,#21374f)}',
'.ifHead p,.ifSectionTitle p{margin:4px 0 0;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.5}',
'.ifFilters{display:flex;align-items:end;gap:9px;flex-wrap:wrap}',
'.ifFilters label{display:grid;gap:5px;color:var(--ak-muted,#73849a);font-size:10px;font-weight:750}',
'.ifFilters select{min-width:132px;min-height:36px;padding:7px 30px 7px 10px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;background:#fff;color:var(--arktik-ink,#21374f);font-size:11px}',
'.ifScope{padding:7px 10px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;background:var(--arktik-glass,#f6f9fc);color:var(--ak-muted,#73849a);font-size:10px;font-weight:750}',
'.ifCard{min-width:0;padding:14px 15px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(29,55,81,.035)}',
'.ifMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
'.ifMetric span,.ifMetric small{display:block;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.4}',
'.ifMetric strong{display:block;margin:6px 0 3px;color:var(--arktik-ink,#21374f);font-size:25px;font-weight:850;line-height:1.1;font-variant-numeric:tabular-nums}',
'.ifSectionTitle{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:11px}',
'.ifSectionTitle h3{margin:0;color:var(--arktik-ink,#21374f);font-size:13px;font-weight:800}',
'.ifSplit{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
'.ifMonthly{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:5px;align-items:end;min-height:130px;padding-top:5px}',
'.ifMonth{display:grid;grid-template-rows:95px auto;gap:5px;min-width:0;text-align:center}',
'.ifMonthTrack{display:flex;align-items:end;justify-content:center;position:relative;height:95px;border-radius:7px;background:rgba(112,139,166,.08);overflow:hidden}',
'.ifMonthTrack i{position:absolute;bottom:0;left:20%;right:20%;border-radius:5px 5px 0 0;background:#3c8bba;opacity:.82}',
'.ifMonthTrack b{position:absolute;bottom:0;left:38%;right:38%;border-radius:5px 5px 0 0;background:#276a91}',
'.ifMonth small{color:var(--ak-muted,#73849a);font-size:9px}',
'.ifLegend{display:flex;gap:12px;align-items:center;margin-top:9px;color:var(--ak-muted,#73849a);font-size:10px}',
'.ifLegend i,.ifLegend b{display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:2px;background:#3c8bba}.ifLegend b{background:#276a91}',
'.ifBarList{display:grid;gap:9px}',
'.ifBarRow{display:grid;grid-template-columns:minmax(100px,1.1fr) minmax(90px,2fr) auto;gap:9px;align-items:center;font-size:10px}',
'.ifBarRow>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ak-muted,#73849a)}',
'.ifBarTrack{height:9px;border-radius:99px;background:rgba(112,139,166,.12);overflow:hidden}.ifBarTrack i{display:block;height:100%;border-radius:99px;background:#4b8b75}',
'.ifBarRow b{color:var(--arktik-ink,#21374f);font-size:10px;font-variant-numeric:tabular-nums}',
'.ifEmpty{margin:0;padding:18px 8px;color:var(--ak-muted,#73849a);font-size:11px;text-align:center}',
'.ifLoading,.ifError{padding:12px 14px;border-radius:10px;font-size:11px}.ifLoading{background:rgba(112,139,166,.08);color:var(--ak-muted,#73849a)}.ifError{background:#fff5e8;color:#88591e}',
'.ifNote{margin:0;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.5}',
'.ifLinks{display:flex;gap:8px;flex-wrap:wrap}',
'.ifLink{border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;padding:8px 11px;background:#fff;color:var(--arktik-ink,#21374f);font-size:10px;font-weight:750;cursor:pointer}',
'.ifLink:hover{border-color:#6d9ab8;background:#f4f8fb}',
'@media(max-width:980px){.ifMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}',
'@media(max-width:620px){.ifHead{display:grid}.ifMetrics,.ifSplit{grid-template-columns:1fr}.ifMonth{grid-template-rows:75px auto}.ifMonthTrack{height:75px}.ifMonthly{gap:3px}.ifMonth small{font-size:8px}.ifFilters{width:100%}.ifFilters label{flex:1}.ifFilters select{width:100%;min-width:0}}'
].join('')

function Metric({ label, value, note }: { label: string; value: unknown; note?: string }) {
  return <article className="ifMetric"><span>{label}</span><strong>{fmt(value)}</strong>{note && <small>{note}</small>}</article>
}
function BarList({ items }: { items: CountItem[] }) {
  const max = Math.max(1, ...items.map((item) => n(item.count)))
  if (!items.length) return <p className="ifEmpty">Belum ada data pada periode ini.</p>
  return <div className="ifBarList">{items.map((item) => <div className="ifBarRow" key={item.label}>
    <span title={item.label}>{item.label}</span><div className="ifBarTrack"><i style={{ width: String(Math.max(0, n(item.count) / max * 100)) + '%' }} /></div><b>{fmt(item.count)}</b>
  </div>)}</div>
}
function MonthlyBars({ items, validated = false }: { items: MonthItem[]; validated?: boolean }) {
  const normalized = Array.from({ length: 12 }, (_, index) => {
    const item = items.find((candidate) => n(candidate.month) === index + 1)
    return { month: index + 1, total: n(item?.total), validated: n(item?.validated) }
  })
  const max = Math.max(1, ...normalized.map((item) => item.total))
  return <div className="ifMonthly">{normalized.map((item) => <div className="ifMonth" key={item.month}
    title={MONTHS[item.month - 1] + ': ' + fmt(item.total) + (validated ? ' · tervalidasi ' + fmt(item.validated) : '')}>
    <div className="ifMonthTrack">
      <i style={{ height: String(Math.max(item.total > 0 ? 3 : 0, item.total / max * 100)) + '%' }} />
      {validated && <b style={{ height: String(Math.max(item.validated > 0 ? 2 : 0, item.validated / max * 100)) + '%' }} />}
    </div><small>{MONTHS[item.month - 1]}</small>
  </div>)}</div>
}

export default function InfographicsDashboard({ rooms, role, mode = 'full', initialRoomId = null, unitLocked = false, onNavigate }: Props) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [roomValue, setRoomValue] = useState(unitLocked && initialRoomId != null ? String(initialRoomId) : '')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canChooseRoom = GLOBAL_ROLES.includes(role || '') && !unitLocked
  const roomId = roomValue ? Number(roomValue) : null
  const selectedRoomName = roomId == null ? 'Seluruh rumah sakit' : rooms.find((room) => Number(room.id) === roomId)?.name || 'Unit terpilih'

  useEffect(() => {
    if (unitLocked) setRoomValue(initialRoomId == null ? '' : String(initialRoomId))
  }, [unitLocked, initialRoomId])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.resolve(aurekaSupabase.rpc('aureka_gov_infographics_summary_secure', { p_year: Number(year), p_room: roomId }))
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError) {
          const missing = rpcError.code === 'PGRST202' || /Could not find the function|schema cache/i.test(rpcError.message || '')
          setSummary(null)
          setError(missing ? 'Ringkasan lintas domain belum aktif. Jalankan migrasi 20261112140000_aureka_infographics_aggregate.sql dan 20261112150000_infographics_permission_guard.sql pada database.' : rpcError.message || 'Infografis lintas domain belum dapat dimuat.')
        } else setSummary(data as Summary)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setSummary(null); setError(cause instanceof Error ? cause.message : 'Infografis lintas domain belum dapat dimuat.'); setLoading(false)
      })
    return () => { cancelled = true }
  }, [year, roomId])

  const validationRate = useMemo(() => n(summary?.quality.validation_rate), [summary])
  const years = Array.from({ length: 5 }, (_, index) => String(new Date().getFullYear() - index))
  const qualityOnly = mode === 'quality'
  const sourceLinks = [
    { id: 'quality', label: 'Indikator Mutu' },
    { id: 'safety', label: 'Keselamatan Pasien' },
    { id: 'risk', label: 'Manajemen Risiko' },
    { id: 'analytics', label: 'Program dan RTL' },
    { id: 'regulation', label: 'Regulasi' },
  ].filter((link) => AUREKA_PRIMARY_NAV.some((module) => module.id === link.id && module.requiredRoles.includes((role || '') as AurekaRole)))
  return <section className="infographicsDashboard" aria-label={qualityOnly ? 'Ringkasan indikator mutu' : 'Infografis kinerja rumah sakit'}>
    <style>{STYLES}</style>
    <header className="ifHead">
      <div><h2>{qualityOnly ? 'Hasil Capaian Indikator Mutu' : 'Ikhtisar Kinerja Mutu dan Keselamatan Rumah Sakit'}</h2>
        <p>{qualityOnly ? 'Tampilan agregat baca-saja untuk fungsi pengawasan; tidak menampilkan data pasien individual.' : 'Satu ringkasan baca-saja dari data indikator tervalidasi, insiden, risiko, program, RTL, dan regulasi.'}</p></div>
      <div className="ifFilters">
        <label>Periode<select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {canChooseRoom && <label>Unit<select value={roomValue} onChange={(event) => setRoomValue(event.target.value)}>
          <option value="">Seluruh rumah sakit</option>{rooms.map((room) => <option key={room.id} value={String(room.id)}>{room.name}</option>)}
        </select></label>}
        {!canChooseRoom && <span className="ifScope">{selectedRoomName}</span>}
      </div>
    </header>
    {error && <div className="ifError" role="alert">{error}</div>}
    {loading && <div className="ifLoading" role="status">Menghitung ringkasan tervalidasi sesuai ruang lingkup akses…</div>}
    {!loading && summary && <>
      <div className="ifMetrics">
        <Metric label="Indikator aktif" value={summary.quality.active_indicators} note="Master indikator pada periode terpilih"/>
        <Metric label="Data indikator" value={summary.quality.records} note="Tidak termasuk episode pasien"/>
        <Metric label="Data tervalidasi" value={summary.quality.validated} note={'Validasi ' + pct(validationRate)}/>
        {!qualityOnly && <Metric label="Insiden tercatat" value={summary.incidents.total} note={fmt(summary.incidents.open) + ' masih terbuka'}/>}
        {!qualityOnly && <Metric label="Risiko sangat tinggi" value={summary.risk.very_high} note={fmt(summary.risk.open) + ' risiko berstatus Open'}/>}
        {!qualityOnly && <Metric label="RTL belum selesai" value={summary.program.open_actions} note={fmt(summary.program.overdue_actions) + ' melewati tenggat'}/>}
        {!qualityOnly && <Metric label="Regulasi berlaku" value={summary.regulation.published} note={fmt(summary.regulation.review_due) + ' perlu ditinjau'}/>}
      </div>
      <div className="ifSplit">
        <section className="ifCard"><header className="ifSectionTitle"><div><h3>Tren data indikator</h3><p>Jumlah catatan indikator dan catatan tervalidasi per bulan.</p></div></header>
          <MonthlyBars items={summary.quality.monthly || []} validated/>
          <div className="ifLegend"><span><i/> Seluruh catatan</span><span><b/> Tervalidasi</span></div>
        </section>
        {!qualityOnly && <section className="ifCard"><header className="ifSectionTitle"><div><h3>Tren insiden keselamatan pasien</h3><p>Jumlah laporan berdasarkan tanggal kejadian.</p></div></header>
          <MonthlyBars items={summary.incidents.monthly || []}/>
          <p className="ifNote">Ringkasan insiden tidak menampilkan identitas pelapor, pasien, atau rincian investigasi.</p>
        </section>}
      </div>
      <div className="ifSplit">
        <section className="ifCard"><header className="ifSectionTitle"><div><h3>Distribusi kategori indikator</h3><p>Master indikator aktif menurut kategori yang tercatat.</p></div></header><BarList items={summary.quality.categories || []}/></section>
        {!qualityOnly && <section className="ifCard"><header className="ifSectionTitle"><div><h3>Profil tingkat risiko</h3><p>Distribusi risk register berdasarkan tingkat risiko.</p></div></header><BarList items={summary.risk.levels || []}/></section>}
      </div>
      {!qualityOnly && <div className="ifSplit">
        <section className="ifCard"><header className="ifSectionTitle"><div><h3>Kategori risiko</h3><p>Distribusi kategori risiko rumah sakit.</p></div></header><BarList items={summary.risk.categories || []}/></section>
        <section className="ifCard"><header className="ifSectionTitle"><div><h3>Program, RTL, dan regulasi</h3><p>Ringkasan tata kelola program tahun {summary.year}.</p></div></header>
          <div className="ifMetrics" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <Metric label="Rekomendasi aktif" value={summary.program.recommendations}/>
            <Metric label="Total RTL" value={summary.program.actions}/>
            <Metric label="RTL selesai" value={summary.program.completed_actions}/>
            <Metric label="Regulasi menunggu Direktur" value={summary.regulation.pending_approval}/>
          </div>
        </section>
      </div>}
    </>}
    {!qualityOnly && onNavigate && <nav className="ifLinks" aria-label="Buka ruang kerja sumber">{sourceLinks.map((link) => <button type="button" className="ifLink" key={link.id} onClick={() => onNavigate(link.id)}>{link.label} →</button>)}</nav>}
    <p className="ifNote">Sumber: agregasi server-side dari record domain AUREKA. Ringkasan ini bukan pengganti laporan indikator terperinci; angka mengikuti filter tahun/unit dan ruang lingkup akses pengguna.</p>
  </section>
}