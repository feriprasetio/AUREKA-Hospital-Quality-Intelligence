'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka from '@/components/TanyaAureka'
import AsyncStatePanel from '@/components/AsyncStatePanel'

type Task = { id: string; module: string; title: string; detail: string; date: string; route: string }
type ActivityStamp = { module: string; value: string }

function datePartsInPontianak(date: Date) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Pontianak' }).format(date)
}
function getGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Pontianak' }).format(now))
  if (hour >= 5 && hour < 11) return 'Selamat pagi'
  if (hour >= 11 && hour < 15) return 'Selamat siang'
  if (hour >= 15 && hour < 19) return 'Selamat sore'
  return 'Selamat malam'
}
function latest(values: Array<string | null | undefined>) {
  const valid = values.filter((x): x is string => !!x && !Number.isNaN(new Date(x).getTime()))
  return valid.sort((a,b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
}
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4ece7', borderRadius: 18, minWidth: 0, boxShadow: '0 5px 22px rgba(18,50,35,.045)' }

export default function HomeWelcome({ supabase, userId, userName, roomName }: {
  supabase: SupabaseClient
  userId: string
  userName: string
  roomName: string | null
}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [lastWorked, setLastWorked] = useState<ActivityStamp | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const greeting = useMemo(() => getGreeting(), [])
  const firstName = userName.trim().split(/\\s+/)[0] || 'Pengguna'
  const initials = userName.trim().split(/\\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'A'

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    const sb = supabase as any
    const run = async () => {
      const results = await Promise.all([
        sb.schema('aureka_quality').from('quality_records').select('id,status,updated_at,created_at').eq('entered_by', userId).is('archived_at', null).order('updated_at', { ascending: false }).limit(30),
        sb.schema('aureka_patient_safety').from('incidents').select('id,incident_code,status,updated_at,created_at').eq('created_by', userId).order('updated_at', { ascending: false }).limit(30),
        sb.schema('aureka_patient_safety').from('investigations').select('id,investigation_code,status,updated_at,created_at').eq('created_by', userId).order('updated_at', { ascending: false }).limit(30),
        sb.schema('aureka_risk').from('risk_register').select('id,risk_code,risk_event,status,due_date,updated_at,created_at').eq('created_by', userId).order('updated_at', { ascending: false }).limit(30),
        sb.schema('aureka_quality').from('clinical_pathway_audits').select('id,patient_name,status,updated_at,created_at').eq('created_by', userId).order('updated_at', { ascending: false }).limit(30),
      ])
      if (cancelled) return
      const [quality, incidents, investigations, risks, pathways] = results
      const failures = results.filter(item => item.error).length
      if (failures === results.length) setNotice('Aktivitas dan pekerjaan belum dapat dibaca. Periksa kembali koneksi atau hak akses.')
      else if (failures) setNotice('Sebagian aktivitas tidak dapat dimuat; daftar di bawah hanya menampilkan sumber yang berhasil dibaca.')

      const stamps: Array<{ module: string; value: string }> = []
      const pushStamps = (module: string, rows: any[]) => rows.forEach(row => stamps.push({ module, value: String(row.updated_at ?? row.created_at ?? '') }))
      if (!quality.error) pushStamps('Mutu Klinis', quality.data ?? [])
      if (!incidents.error) pushStamps('Keselamatan Pasien', incidents.data ?? [])
      if (!investigations.error) pushStamps('Investigasi IKP', investigations.data ?? [])
      if (!risks.error) pushStamps('Manajemen Risiko', risks.data ?? [])
      if (!pathways.error) pushStamps('Clinical Pathway', pathways.data ?? [])
      const allDates = stamps.map(x => x.value)
      const latestDate = latest(allDates)
      setLastWorked(latestDate ? { module: stamps.find(x => x.value === latestDate)?.module ?? 'AUREKA', value: latestDate } : null)

      const pending: Task[] = []
      if (!quality.error) for (const row of quality.data ?? []) {
        if (['draft','reopened'].includes(String(row.status).toLowerCase())) pending.push({ id: String(row.id), module: 'Mutu Klinis', title: 'Lanjutkan input indikator mutu', detail: 'Catatan masih berupa draf atau dikembalikan untuk perbaikan', date: String(row.updated_at ?? row.created_at ?? ''), route: 'mutu-klinis/audit-indikator/form-logbook' })
      }
      if (!incidents.error) for (const row of incidents.data ?? []) {
        if (!['closed'].includes(String(row.status).toLowerCase()) && !['draft'].includes(String(row.status).toLowerCase())) pending.push({ id: String(row.id), module: 'Keselamatan Pasien', title: 'Tindak lanjut laporan IKP', detail: String(row.incident_code ?? 'Laporan insiden'), date: String(row.updated_at ?? row.created_at ?? ''), route: 'keselamatan-pasien/incidents' })
      }
      if (!investigations.error) for (const row of investigations.data ?? []) {
        if (!['closed'].includes(String(row.status).toLowerCase())) pending.push({ id: String(row.id), module: 'Investigasi / RCA', title: 'Selesaikan investigasi insiden', detail: String(row.investigation_code ?? 'Investigasi'), date: String(row.updated_at ?? row.created_at ?? ''), route: 'keselamatan-pasien/investigation' })
      }
      if (!risks.error) for (const row of risks.data ?? []) {
        if (['open','in progress'].includes(String(row.status).toLowerCase())) pending.push({ id: String(row.id), module: 'Manajemen Risiko', title: 'Perbarui pengendalian risiko', detail: String(row.risk_event ?? row.risk_code ?? 'Risk register'), date: String(row.updated_at ?? row.created_at ?? ''), route: 'manajemen-risiko/register' })
      }
      if (!pathways.error) for (const row of pathways.data ?? []) {
        if (['draft','submitted'].includes(String(row.status).toLowerCase())) pending.push({ id: String(row.id), module: 'Clinical Pathway', title: 'Lengkapi audit Clinical Pathway', detail: String(row.patient_name ?? 'Episode audit'), date: String(row.updated_at ?? row.created_at ?? ''), route: 'mutu-klinis/clinical-pathway/form-logbook' })
      }
      pending.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setTasks(pending.slice(0, 10))
      setLoading(false)
    }
    void run().catch(() => { if (!cancelled) { setNotice('Aktivitas belum dapat dimuat. Silakan muat ulang halaman.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [supabase, userId])

  return <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(340px,.92fr)', gap: 16, alignItems: 'stretch' }}>
    <article style={{ ...card, padding: 'clamp(18px,2.5vw,28px)', display: 'grid', alignContent: 'start', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: '#e9f5ee', color: '#176c49', fontSize: 17, fontWeight: 800 }}>{initials}</div>
        <div><div style={{ color: '#6c7b72', fontSize: 12, fontWeight: 700 }}>AUREKA · HALAMAN UTAMA</div><h2 style={{ margin: '3px 0 0', fontSize: 'clamp(21px,2.6vw,30px)', letterSpacing: '-.04em', color: '#183b2b' }}>{greeting}, {firstName}</h2><div style={{ marginTop: 3, color: '#74847a', fontSize: 12 }}>{roomName || 'Akun pengelola rumah sakit'}</div></div>
      </div>
      <div style={{ borderTop: '1px solid #edf1ee', paddingTop: 15, display: 'grid', gap: 5 }}>
        <div style={{ color: '#728077', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Aktivitas terakhir</div>
        <strong style={{ fontSize: 17, color: '#274c38' }}>{lastWorked ? datePartsInPontianak(new Date(lastWorked.value)) : 'Belum ada aktivitas tercatat'}</strong>
        <span style={{ color: '#7a887f', fontSize: 12 }}>{lastWorked ? `Terakhir bekerja pada ${lastWorked.module}` : 'Aktivitas akan muncul setelah Anda menyimpan data pada salah satu modul.'}</span>
      </div>
      <div style={{ borderTop: '1px solid #edf1ee', paddingTop: 15, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><div><h3 style={{ margin: 0, fontSize: 16, color: '#234632' }}>Pekerjaan belum selesai</h3><span style={{ color: '#7a887f', fontSize: 11 }}>Tugas dari modul yang Anda kerjakan</span></div><span style={{ borderRadius: 99, background: '#f1f5f2', padding: '5px 9px', fontWeight: 800, fontSize: 11, color: '#315542' }}>{tasks.length}</span></div>
        {notice && <p style={{ margin: 0, color: '#87632a', fontSize: 11 }}>{notice}</p>}
        {loading ? <AsyncStatePanel state="loading" title="Membaca aktivitas" description="Mengumpulkan pekerjaan lintas modul." compact/> :
          tasks.length ? <div style={{ display: 'grid', gap: 8 }}>{tasks.map(task => <button key={task.module + task.id} type="button" onClick={() => { if (typeof window !== 'undefined') window.location.hash = '#' + task.route }} style={{ border: '1px solid #e8eee9', background: '#fbfdfb', borderRadius: 11, padding: '10px 12px', textAlign: 'left', display: 'grid', gap: 3, cursor: 'pointer' }}>
            <span style={{ fontSize: 10, color: '#16815a', fontWeight: 800 }}>{task.module}</span><strong style={{ color: '#304a3a', fontSize: 12 }}>{task.title}</strong><span style={{ color: '#7c8a80', fontSize: 11 }}>{task.detail}</span>
          </button>)}</div> : <div style={{ border: '1px solid #e8eee9', borderRadius: 11, background: '#f8fbf9', padding: 14, color: '#627469', fontSize: 12 }}>{notice ? 'Daftar tugas belum lengkap.' : 'Tidak ada pekerjaan terbuka yang terdeteksi pada akun Anda.'}</div>}
      </div>
    </article>
    <article style={{ ...card, minHeight: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #edf1ee' }}><div style={{ color: '#16815a', fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>ASISTEN KERJA</div><h3 style={{ margin: '4px 0 0', color: '#234632', fontSize: 19 }}>Tanya AI</h3><p style={{ margin: '4px 0 0', fontSize: 11, color: '#78867d' }}>Ajukan pertanyaan dan baca jawabannya langsung di kartu ini.</p></div>
      <div style={{ flex: 1, minHeight: 440 }}><TanyaAureka sb={supabase} page="Halaman Utama · Welcome Page" embedded/></div>
    </article>
    <style jsx>{`@media(max-width:900px){section{grid-template-columns:1fr!important}} @media(max-width:560px){article{border-radius:14px!important}}`}</style>
  </section>
}
