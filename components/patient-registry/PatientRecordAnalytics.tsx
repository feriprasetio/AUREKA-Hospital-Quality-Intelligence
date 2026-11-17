'use client'

import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Room = { id: number; name: string }
type MonthCount = { month: number; count: number }
type DiagnosisCount = { code: string; diagnosis: string; count: number }
type LosBand = { band: string; count: number }
type Part = {
  allowed?: boolean; episodes?: number; active?: number; avg_los?: number | null; los_count?: number
  patients_unique?: number; icd10_coded?: number; icd10_uncoded?: number; diagnosis_missing?: number
  rm_invalid?: number; readmission_30?: number; months?: MonthCount[]; top?: DiagnosisCount[]; los_bands?: LosBand[]
}
type Snapshot = {
  episodes: number; active: number; avgLos: number | null; losCount: number; patientsUnique: number | null
  icd10Coded: number; icd10Uncoded: number; diagnosisMissing: number; rmInvalid: number; readmission30: number | null
  months: MonthCount[]; top: DiagnosisCount[]; losBands: LosBand[]; unitCount: number
}
type Props = { rooms: Room[]; initialRoomId: number | null; canViewAllRooms: boolean; lockRoomScope?: boolean }
const YEARS = [2025, 2026, 2027, 2028, 2029]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const EMPTY: Snapshot = { episodes: 0, active: 0, avgLos: null, losCount: 0, patientsUnique: null, icd10Coded: 0, icd10Uncoded: 0, diagnosisMissing: 0, rmInvalid: 0, readmission30: null, months: [], top: [], losBands: [], unitCount: 0 }
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const fmt = (v: number | null | undefined, digits = 0) => v == null ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v)
const percent = (v: number, total: number) => total > 0 ? Math.round(v / total * 100) : 0

function combine(parts: Part[]): Snapshot {
  const out: Snapshot = { ...EMPTY, months: [], top: [], losBands: [], unitCount: parts.length }
  let losSum = 0
  const months = new Map<number, number>()
  const diagnoses = new Map<string, DiagnosisCount>()
  const bands = new Map<string, number>()
  for (const part of parts) {
    out.episodes += num(part.episodes)
    out.active += num(part.active)
    out.losCount += num(part.los_count)
    losSum += num(part.avg_los) * num(part.los_count)
    out.icd10Coded += num(part.icd10_coded)
    out.icd10Uncoded += num(part.icd10_uncoded)
    out.diagnosisMissing += num(part.diagnosis_missing)
    out.rmInvalid += num(part.rm_invalid)
    for (const item of part.months ?? []) months.set(num(item.month), (months.get(num(item.month)) ?? 0) + num(item.count))
    for (const item of part.top ?? []) {
      const code = String(item.code || 'Belum berkode')
      const diagnosis = String(item.diagnosis || 'Diagnosis belum dinormalisasi')
      const key = code === 'Belum berkode' ? 'dx:' + diagnosis.toLocaleLowerCase('id-ID') : code
      const prev = diagnoses.get(key)
      diagnoses.set(key, { code, diagnosis, count: (prev?.count ?? 0) + num(item.count) })
    }
    for (const item of part.los_bands ?? []) bands.set(String(item.band), (bands.get(String(item.band)) ?? 0) + num(item.count))
  }
  out.avgLos = out.losCount ? losSum / out.losCount : null
  out.months = [...months].sort(([a], [b]) => a - b).map(([month, count]) => ({ month, count }))
  out.top = [...diagnoses.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  out.losBands = ['0–1 hari', '2–3 hari', '4–7 hari', '8–14 hari', '≥15 hari'].map((band) => ({ band, count: bands.get(band) ?? 0 }))
  return out
}

export default function PatientRecordAnalytics({ rooms, initialRoomId, canViewAllRooms, lockRoomScope = false }: Props) {
  const defaultRoom = lockRoomScope ? String(initialRoomId ?? rooms[0]?.id ?? '') : canViewAllRooms ? '' : String(initialRoomId ?? rooms[0]?.id ?? '')
  const [roomFilter, setRoomFilter] = useState(defaultRoom)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [data, setData] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (lockRoomScope && initialRoomId != null && roomFilter !== String(initialRoomId)) setRoomFilter(String(initialRoomId))
  }, [initialRoomId, lockRoomScope, roomFilter])

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('')
    const targets = roomFilter ? rooms.filter((room) => String(room.id) === roomFilter) : rooms
    if (!targets.length) { setData(EMPTY); setError('Tidak ada unit yang dapat dianalisis pada cakupan akun ini.'); setLoading(false); return }
    try {
      const results: { data: Part | null; error: any }[] = []
      for (let i = 0; i < targets.length; i += 5) {
        const batch = await Promise.all(targets.slice(i, i + 5).map((room) => aurekaSupabase.rpc('aureka_patient_episode_stats', { p_room: room.id, p_year: Number(year) })))
        results.push(...batch.map((item) => ({ data: item.data as Part | null, error: item.error })))
      }
      const failed = results.filter((item) => item.error)
      const valid = results.filter((item) => !item.error && item.data && item.data.allowed !== false)
      if (!valid.length && failed.length) throw failed[0].error
      if (!valid.length) { setData(EMPTY); setNotice('Belum ada episode pasien yang dapat dianalisis pada unit dan tahun ini.'); return }
      if (failed.length) setNotice('Sebagian unit tidak dapat dibaca. Ringkasan hanya menggunakan ' + valid.length + ' unit yang berhasil dimuat.')
      const next = combine(valid.map((item) => item.data!))
      // Pasien unik dan readmisi tidak dijumlahkan lintas unit: pasien yang sama
      // dapat muncul di lebih dari satu unit. Tampilkan hanya untuk satu unit terpilih.
      if (roomFilter && valid.length === 1) {
        next.patientsUnique = valid[0].data?.patients_unique == null ? null : num(valid[0].data?.patients_unique)
        next.readmission30 = valid[0].data?.readmission_30 == null ? null : num(valid[0].data?.readmission_30)
      }
      setData(next)
    } catch (cause) {
      setData(EMPTY)
      setError(toUserFacingError(cause, { fallback: 'Analisis rekam medis belum dapat dimuat. Pastikan fungsi analitik episode pasien telah diterapkan di database.' }))
    } finally { setLoading(false) }
  }, [rooms, roomFilter, year, canViewAllRooms, lockRoomScope])

  useEffect(() => { void load() }, [load])
  const maxMonth = Math.max(1, ...data.months.map((v) => v.count))
  const maxLos = Math.max(1, ...data.losBands.map((v) => v.count))
  const codingCoverage = percent(data.icd10Coded, data.episodes)
  const diagnosisCoverage = percent(data.icd10Coded + data.icd10Uncoded, data.episodes)
  const losCoverage = percent(data.losCount, data.episodes)
  const unitLabel = roomFilter ? rooms.find((r) => String(r.id) === roomFilter)?.name ?? 'Unit terpilih' : 'Seluruh unit yang dapat diakses'

  return (
    <section className="prAnalytics">
      <style>{`
        .prAnalytics{display:grid;gap:16px;color:var(--ink,#18372b)}
        .praHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
        .praLead{margin:0;color:var(--muted,#718078);font-size:12px;line-height:1.6;max-width:780px}
        .praFilters{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
        .praFilters label{display:grid;gap:5px;color:var(--muted,#718078);font-size:11px;font-weight:750}
        .praFilters select{min-height:38px;min-width:148px;padding:8px 10px;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:10px;background:#fff;color:var(--ink,#18372b);font:inherit;font-size:12px}
        .praBtn{min-height:38px;padding:8px 12px;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:10px;background:#fff;color:#264438;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
        .praGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .praCard,.praPanel{min-width:0;border:1px solid var(--line,rgba(30,60,45,.13));border-radius:15px;background:var(--surface,#fff);padding:15px}
        .praCard span{display:block;color:var(--muted,#718078);font-size:11px;font-weight:700}
        .praCard strong{display:block;margin-top:7px;font-size:clamp(21px,2.5vw,28px);letter-spacing:-.035em;font-variant-numeric:tabular-nums}
        .praCard small{display:block;margin-top:5px;color:var(--muted,#718078);font-size:10px;line-height:1.45}
        .praPanels{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:12px}
        .praPanel h3{margin:0 0 5px;font-size:14px}
        .praPanel p{margin:0 0 13px;color:var(--muted,#718078);font-size:11px;line-height:1.5}
        .praBars{display:grid;gap:10px}
        .praBarRow{display:grid;grid-template-columns:minmax(75px,112px) minmax(0,1fr) 42px;align-items:center;gap:9px;font-size:11px}
        .praTrack{height:9px;border-radius:99px;background:var(--surface-secondary,#edf2f1);overflow:hidden}
        .praTrack i{display:block;height:100%;border-radius:99px;background:#397db5}
        .praCount{text-align:right;font-variant-numeric:tabular-nums;font-weight:750}
        .praTableWrap{overflow:auto}
        .praTable{width:100%;border-collapse:collapse;min-width:420px;font-size:11px}
        .praTable th,.praTable td{padding:9px 8px;border-bottom:1px solid var(--line,rgba(30,60,45,.1));text-align:left;vertical-align:top}
        .praTable th{color:var(--muted,#718078);font-size:10px;font-weight:800;white-space:nowrap}
        .praTable td:last-child,.praTable th:last-child{text-align:right;font-variant-numeric:tabular-nums}
        .praMuted{color:var(--muted,#718078);font-size:10px;line-height:1.5}
        .praFlag{padding:11px 13px;border:1px solid rgba(175,125,49,.2);border-radius:12px;background:rgba(226,177,91,.09);color:#76551d;font-size:11px;line-height:1.5}
        .praInfo{padding:11px 13px;border:1px solid var(--line,rgba(30,60,45,.13));border-radius:12px;background:var(--surface-secondary,#f7f9f8);font-size:11px;line-height:1.55;color:var(--muted,#718078)}
        .praEmpty{padding:28px 12px;text-align:center;color:var(--muted,#718078);font-size:12px}
        @media(max-width:900px){.praGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.praPanels{grid-template-columns:1fr}}
        @media(max-width:560px){.praFilters{display:grid;grid-template-columns:1fr 1fr;width:100%}.praFilters label:first-child{grid-column:1/-1}.praFilters select{min-width:0;width:100%}.praBtn{width:100%}.praCard,.praPanel{padding:12px}}
        html[data-mode="gelap"] .praFilters select,html[data-mode="gelap"] .praBtn{background:rgba(255,255,255,.05);color:#eef2f7;border-color:rgba(255,255,255,.14)}
        html[data-mode="gelap"] .praInfo{background:rgba(255,255,255,.04)}
        html[data-mode="gelap"] .praFlag{background:rgba(226,177,91,.08);color:#eacb8c}
      `}</style>
      <header className="praHead">
        <p className="praLead">Analisis baca-saja dari episode pasien yang dicatat melalui Form Logbook pada Modul Indikator Mutu. Tidak ada formulir input atau perubahan logbook di halaman ini.</p>
        <div className="praFilters">
          <label>Unit pelayanan
            <select value={roomFilter} disabled={lockRoomScope || !canViewAllRooms} onChange={(event) => setRoomFilter(event.target.value)}>
              {canViewAllRooms && !lockRoomScope && <option value="">Seluruh unit</option>}
              {rooms.map((room) => <option key={room.id} value={String(room.id)}>{room.name}</option>)}
            </select>
          </label>
          <label>Tahun data
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              {YEARS.map((value) => <option key={value} value={String(value)}>{value}</option>)}
            </select>
          </label>
          <button type="button" className="praBtn" disabled={loading} onClick={() => void load()}>{loading ? 'Memuat…' : 'Muat ulang'}</button>
        </div>
      </header>
      {error && <div className="praFlag" role="alert">{error}</div>}
      {notice && <div className="praInfo" role="status">{notice}</div>}
      {loading && !data.episodes
        ? <div className="praPanel"><div className="praEmpty">Memuat analisis episode dari {unitLabel.toLocaleLowerCase('id-ID')}…</div></div>
        : <>
          <div className="praGrid">
            <div className="praCard"><span>Total episode pelayanan</span><strong>{fmt(data.episodes)}</strong><small>{unitLabel} · tahun {year}</small></div>
            <div className="praCard"><span>Pasien unik</span><strong>{fmt(data.patientsUnique)}</strong><small>{roomFilter ? 'No. RM valid pada unit dan tahun terpilih' : 'Pilih satu unit agar pasien lintas unit tidak dihitung ganda'}</small></div>
            <div className="praCard"><span>Rata-rata LOS rawat inap</span><strong>{data.avgLos == null ? '—' : fmt(data.avgLos, 1) + ' hari'}</strong><small>{fmt(data.losCount)} episode pulang dengan LOS yang dapat dihitung</small></div>
            <div className="praCard"><span>Episode rawat inap terbuka</span><strong>{fmt(data.active)}</strong><small>Memiliki struktur tanggal keluar tetapi belum tercatat tanggal pulang</small></div>
            <div className="praCard"><span>Kode ICD-10 teridentifikasi</span><strong>{fmt(codingCoverage)}%</strong><small>{fmt(data.icd10Coded)} dari {fmt(data.episodes)} episode</small></div>
            <div className="praCard"><span>Readmisi ≤30 hari</span><strong>{fmt(data.readmission30)}</strong><small>Estimasi seluruh periode logbook; bukan pengganti indikator resmi SIMRS</small></div>
            <div className="praCard"><span>No. RM tidak valid / kosong</span><strong>{fmt(data.rmInvalid)}</strong><small>Episode yang belum dapat dihubungkan secara andal ke Database Pasien</small></div>
            <div className="praCard"><span>Diagnosis belum tercatat</span><strong>{fmt(data.diagnosisMissing)}</strong><small>Episode tanpa diagnosis yang dapat dibaca dari data sumber</small></div>
          </div>
          <div className="praPanels">
            <section className="praPanel">
              <h3>Distribusi Length of Stay</h3>
              <p>Hanya episode rawat inap yang sudah memiliki tanggal masuk dan tanggal keluar yang masuk distribusi dan rata-rata LOS. Episode yang masih dirawat tidak dimasukkan.</p>
              {data.losCount ? <div className="praBars">{data.losBands.map((item) => <div className="praBarRow" key={item.band}><span>{item.band}</span><div className="praTrack"><i style={{ width: (item.count / maxLos * 100) + '%' }}/></div><span className="praCount">{fmt(item.count)}</span></div>)}</div> : <div className="praEmpty">Belum ada LOS rawat inap yang dapat dihitung.</div>}
              <div className="praMuted" style={{ marginTop: 12 }}>Cakupan LOS: {fmt(losCoverage)}% dari episode pada filter aktif.</div>
            </section>
            <section className="praPanel">
              <h3>Kelengkapan pengodean diagnosis</h3>
              <p>Pengodean dihitung dari kode ICD-10 eksplisit atau pola kode yang dapat dikenali pada kolom diagnosis. Ini bukan validasi klinis koder.</p>
              <div className="praBars">
                <div className="praBarRow"><span>ICD-10 teridentifikasi</span><div className="praTrack"><i style={{ width: codingCoverage + '%' }}/></div><span className="praCount">{fmt(data.icd10Coded)}</span></div>
                <div className="praBarRow"><span>Diagnosis tanpa kode</span><div className="praTrack"><i style={{ width: percent(data.icd10Uncoded, data.episodes) + '%' }}/></div><span className="praCount">{fmt(data.icd10Uncoded)}</span></div>
                <div className="praBarRow"><span>Diagnosis kosong</span><div className="praTrack"><i style={{ width: percent(data.diagnosisMissing, data.episodes) + '%' }}/></div><span className="praCount">{fmt(data.diagnosisMissing)}</span></div>
              </div>
              <div className="praMuted" style={{ marginTop: 12 }}>Cakupan diagnosis tercatat: {fmt(diagnosisCoverage)}% dari episode pada filter aktif.</div>
            </section>
          </div>
          <div className="praPanels">
            <section className="praPanel">
              <h3>Diagnosis dan ICD-10 terbanyak</h3>
              <p>Distribusi episode berdasarkan kode yang teridentifikasi. Diagnosis tanpa kode ditampilkan sebagai teks sumber.</p>
              {data.top.length ? <div className="praTableWrap"><table className="praTable"><thead><tr><th>Kode / label</th><th>Diagnosis sumber</th><th>Episode</th></tr></thead><tbody>{data.top.map((item, index) => <tr key={item.code + ':' + item.diagnosis + ':' + index}><td><b>{item.code}</b></td><td>{item.diagnosis}</td><td>{fmt(item.count)}</td></tr>)}</tbody></table></div> : <div className="praEmpty">Belum ada diagnosis yang dapat dianalisis.</div>}
            </section>
            <section className="praPanel">
              <h3>Tren episode per bulan</h3>
              <p>Jumlah episode yang tercatat pada masing-masing bulan sesuai tahun dan unit terpilih.</p>
              {data.months.length ? <div className="praBars">{data.months.map((item) => <div className="praBarRow" key={item.month}><span>{MONTHS[item.month - 1] ?? item.month}</span><div className="praTrack"><i style={{ width: (item.count / maxMonth * 100) + '%' }}/></div><span className="praCount">{fmt(item.count)}</span></div>)}</div> : <div className="praEmpty">Belum ada tren untuk periode ini.</div>}
            </section>
          </div>
          <div className="praInfo">Analisis memakai data episode yang sudah tersimpan. No. RM, tanggal, diagnosis, dan LOS yang tidak lengkap tidak diisi dengan perkiraan. Estimasi readmisi 30 hari bersumber dari tanggal episode Logbook dan bukan pengganti rekonsiliasi SIMRS.</div>
        </>}
    </section>
  )
}
