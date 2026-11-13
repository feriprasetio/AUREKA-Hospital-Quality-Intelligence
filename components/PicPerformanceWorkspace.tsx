'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'

type PicRow = {
  user_id: string
  pic_name: string
  email: string | null
  room_id: number
  room_name: string
  records_total: number
  records_window: number
  records_draft: number
  records_ready: number
  records_validated: number
  records_archived: number
  last_created_at: string | null
  last_record_date: string | null
  last_status: string | null
}
type Dashboard = { role: string; window_days: number; generated_at: string; rows: PicRow[] }

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Pontianak' }) : 'Belum ada input'
const number = (value: number) => Number(value || 0).toLocaleString('id-ID')

export default function PicPerformanceWorkspace() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data: result, error: rpcError } = await aurekaSupabase.rpc('aureka_pic_performance_dashboard', { p_days: days })
    if (rpcError) setError('Monitoring kinerja PIC belum dapat dimuat: ' + rpcError.message)
    else setData(result as Dashboard)
    setLoading(false)
  }, [days])
  useEffect(() => { void load() }, [load])
  const rows = data?.rows || []
  const totals = useMemo(() => rows.reduce((acc, row) => ({
    pic: acc.pic + 1,
    total: acc.total + Number(row.records_total || 0),
    window: acc.window + Number(row.records_window || 0),
    draft: acc.draft + Number(row.records_draft || 0),
    ready: acc.ready + Number(row.records_ready || 0),
    validated: acc.validated + Number(row.records_validated || 0),
  }), { pic: 0, total: 0, window: 0, draft: 0, ready: 0, validated: 0 }), [rows])
  useEffect(() => {
    const message = error
    if (message) window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message, type: 'error', module: 'Kinerja PIC' } }))
  }, [error])

  return <section className="picPerf">
    <style>{`
      .picPerf{display:grid;gap:14px;min-width:0;color:var(--text,#20372d)}
      .ppPanel{background:#fff;border:1px solid var(--line,#e4ebe6);border-radius:15px;padding:16px;min-width:0}
      .ppHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .ppIntro{font-size:11px;color:var(--muted,#64756b);line-height:1.6;max-width:800px;margin:5px 0 0}
      .ppSelect{border:1px solid #dce6df;background:#fff;border-radius:9px;padding:9px 11px;color:var(--text,#20372d);font-size:12px;min-height:38px}
      .ppKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .ppKpi{border:1px solid #e5ece7;border-radius:12px;padding:13px;background:#fbfdfb;min-width:0}
      .ppKpi span{display:block;font-size:11px;color:#66766d;font-weight:750}
      .ppKpi strong{display:block;font-size:23px;line-height:1.2;margin-top:5px;font-variant-numeric:tabular-nums}
      .ppTableWrap{overflow:auto;max-width:100%}
      .ppTable{width:100%;border-collapse:collapse;min-width:760px;font-size:11px}
      .ppTable th,.ppTable td{padding:11px 10px;border-bottom:1px solid #edf1ee;text-align:left;vertical-align:top}
      .ppTable th{font-size:11px;color:#718078;text-transform:uppercase;letter-spacing:.06em;background:#f8faf8;white-space:nowrap}
      .ppTable td strong{display:block;font-size:11px;color:#24382d}
      .ppSub{display:block;color:#78867e;font-size:11px;margin-top:3px}
      .ppBadge{display:inline-flex;border-radius:999px;padding:4px 7px;background:#eef4ef;color:#46634f;font-size:11px;font-weight:800}
      .ppActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ppBtn{border:1px solid #dce6df;background:#fff;border-radius:9px;padding:8px 11px;font-size:11px;font-weight:750;color:#284235;min-height:36px;cursor:pointer}
      .ppEmpty{padding:28px;text-align:center;color:#738178;font-size:12px}
      @media(max-width:760px){.ppKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ppPanel{padding:13px}}
      @media(max-width:420px){.ppKpi strong{font-size:20px}}
    `}</style>
    <div className="ppPanel">
      <WorkspaceModuleHeader title="Monitoring Kinerja PIC" description="Pantau aktivitas penginputan logbook mutu berdasarkan akun PIC yang masih memiliki penugasan unit aktif. Angka menunjukkan catatan logbook yang dibuat akun tersebut, bukan penilaian kinerja klinis individual." actions={<div className="ppActions"><label className="ppSub" htmlFor="pp-days">Periode</label><select id="pp-days" className="ppSelect" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>30 hari</option><option value={90}>90 hari</option><option value={180}>180 hari</option><option value={365}>1 tahun</option></select><button className="ppBtn" type="button" onClick={()=>void load()} disabled={loading}>Muat ulang</button></div>} />
      <p className="ppIntro">Sumber data: logbook indikator mutu AUREKA (akun pembuat, unit, waktu pembuatan, dan status penyimpanan). Pengguna PIC hanya dapat melihat aktivitas akunnya sendiri. Monitoring ini tidak menghitung kualitas isi klinis atau ketepatan validasi.</p>
    </div>
    {loading && <AsyncStatePanel state="loading" title="Memuat aktivitas PIC" description="Mengambil data penugasan dan logbook dari server." compact/>}
    {error && <AsyncStatePanel state="error" title="Data monitoring belum tersedia" description={error} onRetry={()=>void load()} compact/>}
    {!loading && !error && <>
      <div className="ppKpis">
        <div className="ppKpi"><span>PIC dengan penugasan aktif</span><strong>{number(totals.pic)}</strong></div>
        <div className="ppKpi"><span>Logbook dibuat (seluruh periode)</span><strong>{number(totals.total)}</strong></div>
        <div className="ppKpi"><span>Logbook {days} hari terakhir</span><strong>{number(totals.window)}</strong></div>
        <div className="ppKpi"><span>Sudah tervalidasi</span><strong>{number(totals.validated)}</strong></div>
      </div>
      <div className="ppPanel">
        <div className="ppHead"><div><strong>Daftar PIC dan aktivitas terakhir</strong><p className="ppIntro">Satu baris mewakili akun PIC dan unit penugasan aktif. Jika PIC belum membuat logbook, kolom aktivitas terakhir akan menampilkan keterangan tersebut.</p></div><span className="ppBadge">Diperbarui {fmtDate(data?.generated_at)}</span></div>
        <div className="ppTableWrap"><table className="ppTable"><thead><tr><th>PIC</th><th>Unit</th><th>Total logbook</th><th>{days} hari</th><th>Draft / siap / tervalidasi / arsip</th><th>Data terakhir dibuat</th></tr></thead><tbody>
          {rows.map(row=><tr key={row.user_id+'-'+row.room_id}><td><strong>{row.pic_name}</strong><span className="ppSub">{row.email || row.user_id}</span></td><td>{row.room_name}</td><td>{number(row.records_total)}</td><td>{number(row.records_window)}</td><td>{number(row.records_draft)} / {number(row.records_ready)} / {number(row.records_validated)} / {number(row.records_archived)}</td><td><strong>{fmtDate(row.last_created_at)}</strong><span className="ppSub">{row.last_record_date ? 'Tanggal data: '+new Date(row.last_record_date+'T00:00:00').toLocaleDateString('id-ID') : 'Tanggal data belum tersedia'}{row.last_status ? ' · Status: '+row.last_status : ''}</span></td></tr>)}
          {rows.length===0&&<tr><td colSpan={6}><div className="ppEmpty">Belum ada akun PIC dengan penugasan aktif yang dapat ditampilkan.</div></td></tr>}
        </tbody></table></div>
      </div>
    </>}
  </section>
}
