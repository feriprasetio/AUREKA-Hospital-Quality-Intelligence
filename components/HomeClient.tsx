'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Glass } from '@samasante/liquid-glass'

const SUPABASE_URL = 'https://ktukmjscopggkzrkgnzp.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX'

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const OFFICIAL_LOGO = 'https://rsudssma.pontianak.go.id/storage/settings/October2023/8ODy7bT72ice4vVuuC9d.png'

const ROOMS = [
  'Informasi dan Pengaduan','Informatika dan Teknologi','Instalasi Ambulance','Instalasi Bedah Sentral','Instalasi Farmasi','Instalasi Gawat Darurat','Instalasi Gizi','Instalasi Hemodialisis','Instalasi Laboratorium','Instalasi Radiologi','Instalasi Rawat Jalan','Instalasi Rehab Medik','Instalasi Rekam Medis','Intensive Care Unit & High Care Unit','Komite Medik','Komite Pencegahan dan Pengendalian Infeksi','Manajemen rumah Sakit','Neonatal Intensive Care Unit & Pediatrics High Dependency Unit','Nifas Obstetrics & Gynecology','Perinatology & Neonatology','Promosi Kesehatan Rumah Sakit','Rawat Inap Anak','Rawat Inap Bedah','Rawat Inap Isolasi','Rawat Inap Penyakit Dalam','Rawat Inap Saraf','Rawat Inap VIP','Satuan Pengawas Intern','Tim Investigasi','Tim Koordinasi Pendidikan','Tim Pelayanan Human Immunodeficiency Virus','Tim Pelayanan Keluarga Berencana Rumah Sakit','Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif','Tim Pelayanan Onkologi','Tim Pencegahan Resistensi Antimikroba','Tim Peningkatan Kinerja Klinis','Verlos Kamer',
]

const MODULES = [
  ['quality','Indikator Mutu','Audit indikator, Clinical Pathway, klinis & kematian, OPPE'],
  ['safety','Keselamatan Pasien','Insiden, investigasi/RCA, dan budaya keselamatan'],
  ['risk','Manajemen Risiko','Risk Register dan FMEA'],
  ['analytics','Metadata dan Statistik','Analitik statistik dan Data Extraction'],
  ['settings','Pengaturan','Pengaturan umum dan manajemen user'],
] as const

function Logo() {
  return <img src="/assets/logo_rsud.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = OFFICIAL_LOGO }} alt="RSUD Sultan Syarif Mohamad Alkadrie" />
}

function GlassButton({ children, onClick, className = '' }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <Glass className={`glassButton ${className}`} radius={16} optics={{ strength: 0.28, depth: 0.62, curvature: 0.28, dispersion: 0.08, sheen: 0.28, frost: 1.8 }}><button onClick={onClick}>{children}</button></Glass>
}

export default function HomeClient() {
  const [view, setView] = useState<'public' | 'login' | 'signup' | 'workspace'>('public')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [message, setMessage] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [room, setRoom] = useState<any>(null)
  const [active, setActive] = useState('home')

  const login = async () => {
    setMessage('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return setMessage(error.message)
    if (!data.session) return setMessage('Sesi login tidak terbentuk.')
    const { data: p, error: pe } = await supabase.rpc('get_my_profile')
    if (pe) return setMessage(pe.message)
    if (!p?.is_active) return setMessage('Akun belum aktif. Hubungi administrator.')
    setUser(data.session.user); setProfile(p); setRoom(p?.primary_room_id ? { name: p.room_name } : null); setView('workspace')
  }

  const signup = async () => {
    setMessage('')
    if (!roomName) return setMessage('Silakan pilih ruangan/unit utama.')
    if (password.length < 8) return setMessage('Password minimal 8 karakter.')
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim(), room_name: roomName } } })
    if (error) return setMessage(error.message)
    setMessage(data.session ? 'Akun dibuat. Administrator perlu mengaktifkannya.' : 'Akun dibuat. Periksa email jika verifikasi email aktif.')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const { data: p } = await supabase.rpc('get_my_profile')
      if (p?.is_active) { setUser(data.session.user); setProfile(p); setRoom(p?.primary_room_id ? { name: p.room_name } : null); setView('workspace') }
    })
  }, [])

  const title = useMemo(() => MODULES.find((m) => m[0] === active)?.[1] ?? 'Overview', [active])

  if (view === 'login' || view === 'signup') return (
    <main className="authPage">
      <Glass className="authCard glassPanel" radius={30} optics={{ strength: 0.32, depth: 0.72, curvature: 0.34, dispersion: 0.1, sheen: 0.4, frost: 2.2 }}>
        <div className="authLogo"><Logo /></div>
        <h1>{view === 'login' ? 'AUREKA Workspace' : 'Daftar Akun AUREKA'}</h1>
        <p>{view === 'login' ? 'Masuk menggunakan akun AUREKA sesuai role dan unit.' : 'Registrasi awal untuk calon PIC pelaporan.'}</p>
        <div className="field"><label>Nama Lengkap</label>{view === 'signup' && <input value={fullName} onChange={(e)=>setFullName(e.target.value)} autoComplete="name" />}</div>
        {view === 'login' ? null : <div className="field"><label>Ruangan / Unit Utama</label><select value={roomName} onChange={(e)=>setRoomName(e.target.value)}><option value="">Pilih ruangan</option>{ROOMS.map((r)=><option key={r} value={r}>{r}</option>)}</select></div>}
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete={view === 'login' ? 'current-password' : 'new-password'} /></div>
        <GlassButton className="wide" onClick={view === 'login' ? login : signup}>{view === 'login' ? 'Masuk' : 'Buat Akun'}</GlassButton>
        <div className="msg">{message}</div>
        <button className="textButton" onClick={()=>{setMessage('');setView(view==='login'?'signup':'login')}}>{view === 'login' ? 'Daftar akun baru' : 'Kembali ke login'}</button>
        <button className="textButton muted" onClick={()=>setView('public')}>← Dashboard publik</button>
      </Glass>
    </main>
  )

  if (view === 'workspace') return (
    <main className="workspaceRoot">
      <aside className="sidebar glassPanel">
        <div className="sideBrand"><Logo /><div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
        <div className="navLabel">Workspace</div>
        <button className={active==='home'?'navActive':''} onClick={()=>setActive('home')}>Overview</button>
        {MODULES.map(([id,name])=><button key={id} className={active===id?'navActive':''} onClick={()=>setActive(id)}>{name}</button>)}
        <div className="profileChip"><b>{profile?.full_name || user?.email}</b><span>{room?.name || 'Unit belum dipetakan'}</span></div>
        <GlassButton onClick={async()=>{await supabase.auth.signOut();setView('public')}}>Logout</GlassButton>
      </aside>
      <section className="workspaceContent">
        <div className="workspaceTop"><div><div className="eyebrow">AUREKA</div><h2>{title}</h2><p>{profile?.full_name || user?.email}</p></div></div>
        {active==='home' ? <div className="workspaceCards"><Glass className="metricCard" radius={22}><span>Unit</span><b>{room?.name || 'Belum dipetakan'}</b></Glass><Glass className="metricCard" radius={22}><span>Laporan terakhir</span><b>—</b></Glass><Glass className="metricCard" radius={22}><span>Kepatuhan mutu</span><b>—</b></Glass><Glass className="metricCard" radius={22}><span>Action Required</span><b>0</b></Glass></div> : <div className="placeholderGrid">{(active==='quality'?['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian','Audit OPPE']:active==='safety'?['Insiden Keselamatan Pasien','Investigasi / RCA','Survey Budaya Keselamatan Pasien']:active==='risk'?['Risk Register','FMEA']:active==='analytics'?['Statistical Analysis','Data Extraction → XLSX']:['Pengaturan Umum','Manajemen User / PIC Pelaporan']).map((x)=><Glass key={x} className="placeholderCard" radius={22}><b>{x}</b><span>Container modul siap dikembangkan.</span></Glass>)}</div>}
      </section>
    </main>
  )

  return (
    <main>
      <header className="topbar glassPanel"><div className="brand"><Logo /><div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div><GlassButton onClick={()=>setView('login')}>Login Workspace</GlassButton></header>
      <section className="heroPublic">
        <div className="heroCopy"><div className="eyebrow">UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE</div><h1>Mutu rumah sakit,<br/><em>terlihat dalam data.</em></h1><p>AUREKA mengintegrasikan mutu, keselamatan pasien, manajemen risiko, analitik, dan reporting dalam satu workspace.</p></div>
        <Glass className="heroGlass" radius={30} optics={{ strength: 0.5, depth: 0.9, curvature: 0.46, dispersion: 0.16, sheen: 0.58, frost: 2 }}><div className="heroAureka">AUREKA</div><div className="heroSub">Hospital Quality Intelligence</div></Glass>
      </section>
      <div className="systemReveal"><button onClick={()=>setSystemOpen(v=>!v)}>{systemOpen ? 'Sembunyikan status sistem' : 'Tampilkan status sistem'}</button></div>
      {systemOpen && <section className="systemPanel glassPanel"><div className="systemGrid"><div>37<span>Ruangan</span></div><div>6<span>Modul</span></div><div>Online<span>Backend</span></div><div>Aktif<span>Auth</span></div></div></section>}
    </main>
  )
}
