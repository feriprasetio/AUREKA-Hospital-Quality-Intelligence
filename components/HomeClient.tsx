'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

const SUPABASE_URL = 'https://ktukmjscopggkzrkgnzp.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX'

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const OFFICIAL_LOGO = 'https://rsudssma.pontianak.go.id/storage/settings/October2023/8ODy7bT72ice4vVuuC9d.png'
const CURRENT_YEAR = new Date().getFullYear()

const FALLBACK_ROOMS = [
  'Informasi dan Pengaduan','Informatika dan Teknologi','Instalasi Ambulance','Instalasi Bedah Sentral','Instalasi Farmasi','Instalasi Gawat Darurat','Instalasi Gizi','Instalasi Hemodialisis','Instalasi Laboratorium','Instalasi Radiologi','Instalasi Rawat Jalan','Instalasi Rehab Medik','Instalasi Rekam Medis','Intensive Care Unit & High Care Unit','Komite Medik','Komite Pencegahan dan Pengendalian Infeksi','Manajemen rumah Sakit','Neonatal Intensive Care Unit & Pediatrics High Dependency Unit','Nifas Obstetrics & Gynecology','Perinatology & Neonatology','Promosi Kesehatan Rumah Sakit','Rawat Inap Anak','Rawat Inap Bedah','Rawat Inap Isolasi','Rawat Inap Penyakit Dalam','Rawat Inap Saraf','Rawat Inap VIP','Satuan Pengawas Intern','Tim Investigasi','Tim Koordinasi Pendidikan','Tim Pelayanan Human Immunodeficiency Virus','Tim Pelayanan Keluarga Berencana Rumah Sakit','Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif','Tim Pelayanan Onkologi','Tim Pencegahan Resistensi Antimikroba','Tim Peningkatan Kinerja Klinis','Verlos Kamer',
]

const MODULES = [
  ['quality', 'Indikator Mutu', 'Audit indikator, Clinical Pathway, klinis & kematian, OPPE'],
  ['safety', 'Keselamatan Pasien', 'Insiden, investigasi/RCA, dan budaya keselamatan'],
  ['risk', 'Manajemen Risiko', 'Risk Register dan FMEA'],
  ['analytics', 'Metadata dan Statistik', 'Analitik statistik dan Data Extraction'],
  ['settings', 'Pengaturan', 'Pengaturan umum dan manajemen user'],
] as const

const QUICK_MODULES = [
  { id: 'quality', label: 'Indikator Mutu', short: 'Quality', description: 'Overview capaian indikator mutu rumah sakit.' },
  { id: 'safety', label: 'Keselamatan Pasien', short: 'Safety', description: 'Overview insiden dan keselamatan pasien.' },
  { id: 'risk', label: 'Manajemen Risiko', short: 'Risk', description: 'Overview Risk Register dan pengendalian risiko.' },
] as const

type RoomOption = { id: number; name: string }
type Profile = { user_id: string; full_name: string; email: string; primary_room_id: number | null; role_id: string | null; is_active: boolean }

type OverviewModule = typeof QUICK_MODULES[number]

function Logo() {
  return (
    <img
      src="/assets/logo_rsud.png"
      alt="RSUD Sultan Syarif Mohamad Alkadrie"
      onError={(event) => {
        event.currentTarget.onerror = null
        event.currentTarget.src = OFFICIAL_LOGO
      }}
    />
  )
}

function ModuleIcon({ id }: { id: OverviewModule['id'] }) {
  if (id === 'quality') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3.5 19.5h17"/></svg>
  }
  if (id === 'safety') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.2c0 4.4-2.7 7.9-7 9.3-4.3-1.4-7-4.9-7-9.3V6l7-2.5Z"/><path d="m8.8 12.1 2.1 2.1 4.5-4.7"/></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v7.9l-7 4-7-4V7l7-4Z"/><path d="M5 7 12 11l7-4M12 11v8.7"/></svg>
}

async function loadRooms(): Promise<RoomOption[]> {
  const { data, error } = await supabase
    .from('master_rooms')
    .select('id,name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!error && data?.length) return data as RoomOption[]
  return FALLBACK_ROOMS.map((name, index) => ({ id: index + 1, name }))
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id,full_name,email,primary_room_id,role_id,is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as Profile | null) ?? null
}

export default function HomeClient() {
  const [view, setView] = useState<'public' | 'login' | 'signup' | 'workspace'>('public')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [systemOpen, setSystemOpen] = useState(false)
  const [overviewModule, setOverviewModule] = useState<OverviewModule | null>(null)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [room, setRoom] = useState<RoomOption | null>(null)
  const [active, setActive] = useState('home')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const hydrateSession = async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return false

    const nextProfile = await loadProfile(data.session.user.id)
    if (!nextProfile || !nextProfile.is_active) {
      await supabase.auth.signOut()
      return false
    }

    setUser(data.session.user)
    setProfile(nextProfile)
    if (nextProfile.primary_room_id) {
      const { data: nextRoom } = await supabase
        .from('master_rooms')
        .select('id,name')
        .eq('id', nextProfile.primary_room_id)
        .maybeSingle()
      setRoom(nextRoom ? (nextRoom as RoomOption) : null)
    } else {
      setRoom(null)
    }
    setView('workspace')
    return true
  }

  useEffect(() => {
    loadRooms().then(setRooms).catch(() => setRooms(FALLBACK_ROOMS.map((name, index) => ({ id: index + 1, name }))))
    hydrateSession().catch(() => undefined)

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      // Session hydration is handled explicitly so navigation stays deterministic.
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      if (!data.session) throw new Error('Sesi login tidak terbentuk.')

      const nextProfile = await loadProfile(data.session.user.id)
      if (!nextProfile) throw new Error('Profil AUREKA belum tersedia untuk akun ini.')
      if (!nextProfile.is_active) throw new Error('Akun belum aktif. Hubungi administrator.')

      setUser(data.session.user)
      setProfile(nextProfile)
      if (nextProfile.primary_room_id) {
        const { data: nextRoom } = await supabase
          .from('master_rooms')
          .select('id,name')
          .eq('id', nextProfile.primary_room_id)
          .maybeSingle()
        setRoom(nextRoom ? (nextRoom as RoomOption) : null)
      }
      setActive('home')
      setView('workspace')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login gagal.')
    } finally {
      setBusy(false)
    }
  }

  const signUp = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (!fullName.trim()) throw new Error('Nama lengkap wajib diisi.')
      if (!roomId) throw new Error('Silakan pilih ruangan/unit utama.')
      if (password.length < 8) throw new Error('Password minimal 8 karakter.')

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), primary_room_id: roomId },
        },
      })
      if (error) throw error

      if (data.session) {
        setMessage('Akun dibuat. Administrator perlu mengaktifkan akun sebelum workspace dapat digunakan.')
      } else {
        setMessage('Akun dibuat. Periksa email bila verifikasi email diaktifkan, lalu tunggu aktivasi administrator.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pendaftaran gagal.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setRoom(null)
    setActive('home')
    setMobileNavOpen(false)
    setView('public')
  }

  const title = useMemo(() => MODULES.find((item) => item[0] === active)?.[1] ?? 'Overview', [active])
  const moduleChildren: Record<string, string[]> = {
    quality: ['Audit Indikator Mutu', 'Audit Clinical Pathway', 'Audit Klinis dan Kematian', 'Audit OPPE'],
    safety: ['Insiden Keselamatan Pasien', 'Investigasi / Root Cause Analysis (RCA)', 'Survey Budaya Keselamatan Pasien'],
    risk: ['Risk Register', 'FMEA'],
    analytics: ['Statistical Analysis', 'Data Extraction → XLSX'],
    settings: ['Pengaturan Umum', 'Manajemen User / PIC Pelaporan'],
  }

  if (view === 'login' || view === 'signup') {
    const isLogin = view === 'login'
    return (
      <main className="authPage">
        <LiquidGlass className="authCard">
          <div className="authLogo"><Logo /></div>
          <div className="eyebrow">AUREKA WORKSPACE</div>
          <h1>{isLogin ? 'Masuk' : 'Daftar Akun'}</h1>
          <p>{isLogin ? 'Gunakan akun AUREKA sesuai role dan unit.' : 'Registrasi awal untuk calon PIC pelaporan.'}</p>

          {!isLogin && (
            <>
              <div className="field">
                <label htmlFor="fullName">Nama Lengkap</label>
                <input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="room">Ruangan / Unit Utama</label>
                <select id="room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                  <option value="">Pilih ruangan</option>
                  {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={8} />
          </div>

          <LiquidGlassButton className="wide" onClick={isLogin ? signIn : signUp} disabled={busy}>
            {busy ? 'Memproses…' : (isLogin ? 'Masuk' : 'Buat Akun')}
          </LiquidGlassButton>

          <div className={message ? 'msg visible' : 'msg'}>{message}</div>
          <button type="button" className="textButton" onClick={() => { setMessage(''); setView(isLogin ? 'signup' : 'login') }}>
            {isLogin ? 'Daftar akun baru' : 'Kembali ke login'}
          </button>
          <button type="button" className="textButton muted" onClick={() => { setMessage(''); setView('public') }}>
            ← Dashboard publik
          </button>
        </LiquidGlass>
      </main>
    )
  }

  if (view === 'workspace') {
    return (
      <main className="workspaceRoot">
        <button type="button" className="workspaceScrim" aria-label="Tutup menu" onClick={() => setMobileNavOpen(false)} data-open={mobileNavOpen} />
        <aside className={`sidebar glassPanel ${mobileNavOpen ? 'mobileOpen' : ''}`}>
          <div className="sideBrand"><Logo /><div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
          <div className="navLabel">Workspace</div>
          <button type="button" className={active === 'home' ? 'navActive' : ''} onClick={() => { setActive('home'); setMobileNavOpen(false) }}>Overview</button>
          {MODULES.map(([id, name]) => (
            <button type="button" key={id} className={active === id ? 'navActive' : ''} onClick={() => { setActive(id); setMobileNavOpen(false) }}>{name}</button>
          ))}
          <div className="profileChip"><b>{profile?.full_name || user?.email}</b><span>{room?.name || 'Unit belum dipetakan'}</span></div>
          <LiquidGlassButton onClick={signOut}>Logout</LiquidGlassButton>
        </aside>

        <section className="workspaceContent">
          <div className="workspaceTop">
            <button type="button" className="mobileMenuButton" onClick={() => setMobileNavOpen(true)} aria-label="Buka menu">☰</button>
            <div><div className="eyebrow">AUREKA</div><h2>{title}</h2><p>{profile?.full_name || user?.email}</p></div>
          </div>

          {active === 'home' ? (
            <div className="workspaceCards">
              <LiquidGlass className="metricCard"><span>Unit</span><b>{room?.name || 'Belum dipetakan'}</b></LiquidGlass>
              <LiquidGlass className="metricCard"><span>Laporan terakhir</span><b>—</b></LiquidGlass>
              <LiquidGlass className="metricCard"><span>Kepatuhan mutu</span><b>—</b></LiquidGlass>
              <LiquidGlass className="metricCard"><span>Action Required</span><b>0</b></LiquidGlass>
            </div>
          ) : (
            <div className="placeholderGrid">
              {(moduleChildren[active] ?? []).map((item) => (
                <LiquidGlass key={item} className="placeholderCard"><b>{item}</b><span>Container modul siap dikembangkan.</span></LiquidGlass>
              ))}
            </div>
          )}
        </section>
      </main>
    )
  }

  const selectedOverview = QUICK_MODULES.find((module) => module.id === overviewModule) ?? null

  return (
    <main className="publicRoot">
      <header className="topbar glassPanel">
        <div className="brand"><Logo /><div><b>AUREKA</b><small>Hospital Quality Intelligence</small></div></div>
        <LiquidGlassButton onClick={() => { setMessage(''); setView('login') }}>Login Workspace</LiquidGlassButton>
      </header>

      <section className="heroPublic">
        <div className="heroCopy">
          <div className="eyebrow">UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE</div>
          <h1>Alkadrie Unified Risk,<br /><em>Evaluation, Quality & Analytics.</em></h1>
          <p>AUREKA mengintegrasikan mutu, keselamatan pasien, manajemen risiko, analitik, dan reporting dalam satu workspace.</p>
        </div>

        <div className="quickDockWrap" aria-label="Shortcut modul utama">
          <div className="quickDockCaption">Quick overview</div>
          <nav className="quickDock glassPanel" aria-label="Modul utama AUREKA">
            {QUICK_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                className={`quickDockItem quickDock-${module.id}`}
                onClick={() => setOverviewModule(module.id)}
                aria-label={`Buka overview ${module.label}`}
              >
                <span className="quickDockIcon"><ModuleIcon id={module.id} /></span>
                <span className="quickDockText"><b>{module.label}</b><small>{module.short}</small></span>
              </button>
            ))}
          </nav>
        </div>
      </section>

      <div className="systemReveal">
        <button type="button" onClick={() => setSystemOpen((value) => !value)}>
          {systemOpen ? 'Sembunyikan status sistem' : 'Tampilkan status sistem'}
        </button>
      </div>

      {systemOpen && (
        <section className="systemPanel glassPanel">
          <div className="systemGrid">
            <LiquidGlass><strong>37</strong><span>Ruangan aktif</span></LiquidGlass>
            <LiquidGlass><strong>6</strong><span>Modul terintegrasi</span></LiquidGlass>
            <LiquidGlass><strong>Online</strong><span>Backend</span></LiquidGlass>
            <LiquidGlass><strong>Aktif</strong><span>Authentication</span></LiquidGlass>
          </div>
        </section>
      )}

      {selectedOverview && (
        <div className="overviewOverlay" role="presentation" onClick={() => setOverviewModule(null)}>
          <section className="overviewModal glassPanel" role="dialog" aria-modal="true" aria-labelledby="overviewTitle" onClick={(event) => event.stopPropagation()}>
            <header className="overviewHeader">
              <div>
                <div className="eyebrow">AUREKA · {CURRENT_YEAR}</div>
                <h2 id="overviewTitle">{selectedOverview.label}</h2>
                <p>{selectedOverview.description}</p>
              </div>
              <button type="button" className="overviewClose" aria-label="Tutup overview" onClick={() => setOverviewModule(null)}>×</button>
            </header>

            <div className="overviewStats">
              <LiquidGlass><span>Total data</span><b>—</b><small>Menunggu data modul</small></LiquidGlass>
              <LiquidGlass><span>Met target</span><b>—</b><small>Belum ada rekaman</small></LiquidGlass>
              <LiquidGlass><span>Belum met</span><b>—</b><small>Belum ada rekaman</small></LiquidGlass>
              <LiquidGlass><span>Kelengkapan</span><b>—</b><small>Belum tersedia</small></LiquidGlass>
            </div>

            <div className="overviewBody">
              <div className="overviewTrend">
                <div className="overviewSectionTitle"><b>Trend {CURRENT_YEAR}</b><span>Agregat rumah sakit</span></div>
                <div className="overviewEmpty"><span className="overviewEmptyIcon">∿</span><strong>Belum ada data untuk divisualisasikan</strong><small>Area ini disiapkan untuk trend bulanan, distribusi capaian, dan indikator prioritas setelah data modul mulai terisi.</small></div>
              </div>
              <aside className="overviewSide">
                <div className="overviewSectionTitle"><b>Snapshot {CURRENT_YEAR}</b><span>Status saat ini</span></div>
                <div className="overviewRows">
                  <div><span>Status data</span><b>Belum tersedia</b></div>
                  <div><span>Periode</span><b>Januari–Desember {CURRENT_YEAR}</b></div>
                  <div><span>Cakupan</span><b>Seluruh rumah sakit</b></div>
                  <div><span>Pembaruan terakhir</span><b>—</b></div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
