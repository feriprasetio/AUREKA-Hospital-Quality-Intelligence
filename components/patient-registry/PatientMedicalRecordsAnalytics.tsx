'use client'

import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Room = { id: number; name: string }
type Analytics = {
  allowed: boolean
  episodes: number
  unique_patients: number
  inpatient_episodes: number
  discharged_inpatients: number
  active_inpatients: number
  valid_mrn: number
  invalid_mrn: number
  diagnosis_available: number
  diagnosis_missing: number
  icd10_coded: number
  diagnosis_uncoded: number
  los_count: number
  average_los: number | null
  monthly: { month: number; count: number }[]
  top_icd10: { code: string; diagnosis: string; count: number }[]
  los_bands: { label: string; count: number }[]
  units: { unit: string; episodes: number; inpatient: number; active: number; average_los: number | null }[]
}
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const fmt = (v: unknown, digits = 0) => (Number(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: digits })
const pct = (a: unknown, b: unknown) => Number(b) > 0 ? Number(a) / Number(b) * 100 : 0

export default function PatientMedicalRecordsAnalytics({
  rooms, initialRoomId, canViewAllRooms, lockRoomScope = false,
}: {
  rooms: Room[]; initialRoomId: number | null; canViewAllRooms: boolean; lockRoomScope?: boolean
}) {
  const initialScope = lockRoomScope || !canViewAllRooms ? String(initialRoomId ?? rooms[0]?.id ?? '') : ''
  const [room, setRoom] = useState(initialScope)
  const [year, setYear] = useState('2026')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: result, error: rpcError } = await aurekaSupabase.rpc('aureka_patient_record_analytics', {
        p_room: room ? Number(room) : null,
        p_year: Number(year),
      })
      if (rpcError) {
        if (rpcError.code === 'PGRST202' || /Could not find the function|schema cache/i.test(rpcError.message || '')) {
          throw new Error('Analisis Rekam Medis belum diaktifkan. Terapkan migration 20261118030000_patient_record_analytics.sql terlebih dahulu.')
        }
        throw rpcError
      }
      if (!(result as Analytics | null)?.allowed) throw new Error('Tidak ada akses ke data episode pada unit atau cakupan yang dipilih.')
      setData(result as Analytics)
    } catch (cause) {
      setData(null)
      setError(toUserFacingError(cause, { fallback: 'Analisis rekam medis belum dapat dimuat. Periksa koneksi dan hak akses.' }))
    } finally {
      setLoading(false)
    }
  }, [room, year])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (lockRoomScope && initialRoomId != null) setRoom(String(initialRoomId))
    else if (!canViewAllRooms && !room && rooms.length) setRoom(String(initialRoomId ?? rooms[0].id))
  }, [lockRoomScope, initialRoomId, canViewAllRooms, room, rooms])

  const total = Number(data?.episodes) || 0
  const icdRate = pct(data?.icd10_coded, total)
  const mrnRate = pct(data?.valid_mrn, total)
  const diagnosisRate = pct(data?.diagnosis_available, total)
  const monthlyMap = new Map((data?.monthly ?? []).map(x => [Number(x.month), Number(x.count)]))
  const monthly = MONTHS.map((label, i) => ({ label, count: monthlyMap.get(i + 1) ?? 0 }))
  const monthlyMax = Math.max(1, ...monthly.map(x => x.count))

  return (
    <section className="patientRecordAnalytics">
      <header>
        <h2>Analisis Rekam Medis</h2>
        <p>Analisis longitudinal dari episode yang sudah tercatat: LOS, diagnosis/ICD-10, kelengkapan identitas rekam medis, tren episode, dan pemanfaatan layanan. Halaman ini hanya membaca data agregat, bukan tempat input atau validasi logbook.</p>
      </header>

      <div className="prPanel prFilters">
        {canViewAllRooms && !lockRoomScope
          ? <label>Unit pelayanan
              <select value={room} onChange={e => setRoom(e.target.value)}>
                <option value="">Semua unit yang dapat diakses</option>
                {rooms.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
              </select>
            </label>
          : <label>Unit pelayanan
              <select value={room} disabled>
                {rooms.filter(r => String(r.id) === room).map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                {!rooms.some(r => String(r.id) === room) && <option value={room}>Unit penugasan</option>}
              </select>
            </label>}
        <label>Tahun profil
          <select value={year} onChange={e => setYear(e.target.value)}>
            {[2025,2026,2027,2028,2029].map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </label>
        <button type="button" className="prButton" disabled={loading} onClick={() => void load()}>{loading ? 'Memuat…' : 'Muat ulang'}</button>
      </div>

      {error && <div className="prAlert" role="alert">{error}</div>}
      {loading && !data ? <div className="prPanel prEmpty">Memuat ringkasan rekam medis…</div> : null}
      {data && <>
        <div className="pmaKpis">
          <article><span>Catatan episode pasien</span><strong>{fmt(data.episodes)}</strong><small>Record dengan grain patient_episode</small></article>
          <article><span>Pasien unik</span><strong>{fmt(data.unique_patients)}</strong><small>Berdasarkan No. RM valid</small></article>
          <article><span>Rata-rata LOS</span><strong>{data.average_los == null ? '—' : fmt(data.average_los, 2)}</strong><small>Hari · {fmt(data.los_count)} episode dapat dihitung</small></article>
          <article><span>Masih dirawat</span><strong>{fmt(data.active_inpatients)}</strong><small>Tanggal keluar belum terisi</small></article>
          <article><span>Episode berkode ICD-10</span><strong>{fmt(data.icd10_coded)}</strong><small>{fmt(icdRate, 1)}% dari catatan episode</small></article>
          <article><span>No. RM kosong / tidak valid</span><strong>{fmt(data.invalid_mrn)}</strong><small>{fmt(mrnRate, 1)}% No. RM valid</small></article>
        </div>

        <div className="pmaGrid">
          <section className="prPanel">
            <h3>Tren catatan episode per bulan</h3>
            <p>Jumlah record patient_episode berdasarkan tanggal pelayanan dalam tahun profil terpilih.</p>
            {total > 0 ? <div className="pmaTrend" aria-label="Tren catatan episode per bulan">
              {monthly.map(m => <div className="pmaMonth" key={m.label}>
                <div className="pmaTrack"><div className="pmaBar" style={{ height: (m.count / monthlyMax * 100) + '%' }} title={fmt(m.count) + ' catatan'} /></div>
                <b>{m.label}</b><small>{fmt(m.count)}</small>
              </div>)}
            </div> : <p className="prEmpty">Belum ada catatan episode pada periode ini.</p>}
          </section>

          <section className="prPanel">
            <h3>Distribusi LOS</h3>
            <p>LOS hanya dihitung pada episode rawat inap dengan tanggal masuk dan keluar yang dapat dihitung.</p>
            {(data.los_bands ?? []).map(b => <div className="pmaBand" key={b.label}>
              <span>{b.label}</span><progress max={Math.max(1, Number(data.los_count) || 0)} value={Number(b.count) || 0} /><b>{fmt(b.count)}</b>
            </div>)}
            {!data.los_count && <p className="prEmpty">Belum ada LOS yang dapat dihitung.</p>}
          </section>
        </div>

        <div className="pmaGrid">
          <section className="prPanel">
            <h3>Sepuluh diagnosis dengan kode ICD-10 terbanyak</h3>
            <p>Pengelompokan berdasarkan kode yang dikenali dari kolom kode/diagnosis; bukan validasi coding oleh coder.</p>
            {data.top_icd10?.length
              ? <div className="prTableWrap"><table className="prTable"><thead><tr><th>Kode ICD-10</th><th>Diagnosis pada catatan</th><th>Catatan</th></tr></thead>
                <tbody>{data.top_icd10.map(d => <tr key={d.code}><td><b>{d.code}</b></td><td>{d.diagnosis}</td><td>{fmt(d.count)}</td></tr>)}</tbody></table></div>
              : <p className="prEmpty">Belum ditemukan kode ICD-10 yang dapat dikenali.</p>}
          </section>

          <section className="prPanel">
            <h3>Kelengkapan dokumentasi rekam medis</h3>
            <p>Proporsi terhadap seluruh catatan episode pada filter aktif. Ini bukan pengganti audit kelengkapan rekam medis.</p>
            <div className="pmaQualityRow"><span>No. RM valid</span><b>{fmt(mrnRate,1)}% · {fmt(data.valid_mrn)}/{fmt(total)}</b><progress max="100" value={mrnRate} /></div>
            <div className="pmaQualityRow"><span>Diagnosis tercatat</span><b>{fmt(diagnosisRate,1)}% · {fmt(data.diagnosis_available)}/{fmt(total)}</b><progress max="100" value={diagnosisRate} /></div>
            <div className="pmaQualityRow"><span>Kode ICD-10 dikenali</span><b>{fmt(icdRate,1)}% · {fmt(data.icd10_coded)}/{fmt(total)}</b><progress max="100" value={icdRate} /></div>
            <p>Diagnosis tanpa kode: {fmt(data.diagnosis_uncoded)} · Diagnosis kosong: {fmt(data.diagnosis_missing)}</p>
          </section>
        </div>

        <section className="prPanel">
          <h3>Pemanfaatan layanan menurut unit</h3>
          <p>Jumlah catatan episode dan indikator LOS per unit yang termasuk cakupan akses saat ini.</p>
          {data.units?.length
            ? <div className="prTableWrap"><table className="prTable"><thead><tr><th>Unit</th><th>Catatan episode</th><th>Rawat inap</th><th>Masih dirawat</th><th>Rata-rata LOS</th></tr></thead>
              <tbody>{data.units.map(u => <tr key={u.unit}><td>{u.unit}</td><td>{fmt(u.episodes)}</td><td>{fmt(u.inpatient)}</td><td>{fmt(u.active)}</td><td>{u.average_los == null ? '—' : fmt(u.average_los,2)+' hari'}</td></tr>)}</tbody></table></div>
            : <p className="prEmpty">Belum ada ringkasan unit pada periode ini.</p>}
        </section>
      </>}

      <div className="pmaNote">
        <b>Catatan interpretasi:</b> Sumbernya adalah record patient_episode pada Form Logbook Indikator Mutu. Total menghitung record patient_episode, bukan deduplikasi Encounter ID; satu kunjungan yang tercatat di beberapa unit dapat muncul sebagai lebih dari satu record. LOS memakai nilai tersimpan atau selisih tanggal masuk-keluar; episode yang masih dirawat tidak masuk rata-rata LOS. Analisis hanya mengeluarkan agregat, bukan identitas pasien.
      </div>
    </section>
  )
}
