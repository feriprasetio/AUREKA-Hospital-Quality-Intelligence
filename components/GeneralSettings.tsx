'use client'

import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

const sb = aurekaSupabase


type Room = { id: number; code?: string; name: string; is_active?: boolean }
type Profile = {
  user_id: string
  full_name: string
  email: string | null
  primary_room_id: number | null
  role_id: string | null
  is_active: boolean
}
type Role = { id: string; code: string; name: string; description?: string | null }

type Tone = {
  id: string
  name: string
  description: string
  accent: string
  accent2: string
  rgb: string
  soft: string
}

const TONES: Tone[] = [
  { id: 'emerald', name: 'Emerald', description: 'Hijau AUREKA saat ini', accent: '#0f7656', accent2: '#084f3a', rgb: '15,118,86', soft: '#e1f3eb' },
  { id: 'ocean', name: 'Ocean Blue', description: 'Biru profesional & tenang', accent: '#1769aa', accent2: '#0b3f70', rgb: '23,105,170', soft: '#e1effb' },
  { id: 'indigo', name: 'Indigo', description: 'Biru-indigo modern', accent: '#4f46b5', accent2: '#29216f', rgb: '79,70,181', soft: '#e9e7fb' },
  { id: 'teal', name: 'Teal', description: 'Turquoise klinis & segar', accent: '#087f8c', accent2: '#07505a', rgb: '8,127,140', soft: '#def4f5' },
  { id: 'violet', name: 'Violet', description: 'Elegan & kontemporer', accent: '#7c4d9e', accent2: '#4b2865', rgb: '124,77,158', soft: '#f0e5f6' },
  { id: 'amber', name: 'Amber', description: 'Hangat, premium & energik', accent: '#a96816', accent2: '#68400e', rgb: '169,104,22', soft: '#fbefd9' },
]

const friendlyRole = (r?: Role | null) => {
  if (!r) return '—'
  if (r.code === 'ADMIN') return 'Super Admin'
  return r.name || r.code
}

export default function GeneralSettings({
  profile,
  role,
  rooms,
  onNavigate,
}: {
  profile: Profile | null
  role: string | null
  rooms: Room[]
  onNavigate?: (moduleId: string) => void
}) {
  const [section, setSection] = useState<'menu' | 'general' | 'users' | 'mydata'>('menu')
  const [tab, setTab] = useState<'profile' | 'units' | 'appearance' | 'security'>('profile')
  const [me, setMe] = useState<Profile | null>(profile)
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [roleMeta, setRoleMeta] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'active' | 'unmapped'>('all')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [myData, setMyData] = useState<{ risks: number | null; highRisks: number | null; incidents: number | null; openIncidents: number | null; quality: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [rowNote, setRowNote] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 6000)
    return () => clearTimeout(t)
  }, [msg])
  const msgIsError = /gagal|tidak dapat|belum aktif|error|forbidden|tidak ditemukan|tidak dihapus/i.test(msg)
  const [toneId, setToneId] = useState(() =>
    typeof window === 'undefined' ? 'emerald' : localStorage.getItem('aureka-tone') || 'emerald'
  )

  const tone = TONES.find((item) => item.id === toneId) ?? TONES[0]
  const effectiveRole = roleMeta?.code ?? role
  const isAdmin = effectiveRole === 'ADMIN'

  const applyTone = (nextTone: Tone) => {
    setToneId(nextTone.id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('aureka-tone', nextTone.id)
      const root = document.documentElement
      root.style.setProperty('--accent', nextTone.accent)
      root.style.setProperty('--accent2', nextTone.accent2)
      root.style.setProperty('--accent-rgb', nextTone.rgb)
      root.style.setProperty('--accent-soft', nextTone.soft)
      root.dataset.tone = nextTone.id
    }
    setMsg(`Tone ${nextTone.name} diterapkan pada tampilan AUREKA di perangkat ini.`)
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('aureka-tone') || 'emerald' : 'emerald'
    const selected = TONES.find((item) => item.id === stored) ?? TONES[0]
    const root = document.documentElement
    root.style.setProperty('--accent', selected.accent)
    root.style.setProperty('--accent2', selected.accent2)
    root.style.setProperty('--accent-rgb', selected.rgb)
    root.style.setProperty('--accent-soft', selected.soft)
    root.dataset.tone = selected.id
  }, [])

  useEffect(() => {
    setMe(profile)
    sb.rpc('aureka_get_my_profile').then(({ data, error }) => {
      if (!error && Array.isArray(data) && data[0]) {
        const current = data[0] as Profile & { role_code?: string | null; role_name?: string | null; role_description?: string | null }
        setMe(current)
        setRoleMeta(current.role_id ? {
          id: current.role_id,
          code: current.role_code || '',
          name: current.role_name || current.role_code || '',
          description: current.role_description || null,
        } : null)
      }
    })
  }, [profile])

  const loadUsers = async () => {
    if (!isAdmin) return
    const { data, error } = await sb.rpc('aureka_admin_list_user_profiles')
    if (error) setMsg(error.message)
    else setUsers((data || []) as Profile[])
  }

  useEffect(() => {
    sb.rpc('aureka_list_active_roles').then(({ data, error }) => {
      if (error) setMsg(error.message)
      else setRoles((data || []) as Role[])
    })
    loadUsers()
  }, [isAdmin])

  const saveMe = async () => {
    if (!me?.user_id) return
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_update_my_profile', {
      p_full_name: me.full_name,
      // Unit utama menentukan data yang boleh diakses, jadi hanya Super Admin yang dapat mengubahnya.
      p_primary_room_id: isAdmin
        ? (me.primary_room_id ? Number(me.primary_room_id) : null)
        : (profile?.primary_room_id ?? null),
    })
    setBusy(false)
    setMsg(error ? `Gagal: ${error.message}` : 'Profil berhasil disimpan.')
  }

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const q = search.toLowerCase().trim()
        const matchesText = !q || [u.full_name, u.email || '', rooms.find((r) => r.id === u.primary_room_id)?.name || ''].join(' ').toLowerCase().includes(q)
        const matchesStatus = userFilter === 'all' ||
          (userFilter === 'pending' && !u.is_active) ||
          (userFilter === 'active' && u.is_active) ||
          (userFilter === 'unmapped' && !u.primary_room_id)
        return matchesText && matchesStatus
      }).sort((a, b) => Number(a.is_active) - Number(b.is_active)),
    [users, search, userFilter, rooms]
  )
  const pendingCount = users.filter((u) => !u.is_active).length
  const unmappedCount = users.filter((u) => !u.primary_room_id).length
  const picRoleId = roles.find((r) => r.code === 'PIC')?.id || null

  const updateUser = async (u: Profile, patch: Partial<Profile>) => {
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_admin_update_user_profile', {
      p_user_id: u.user_id,
      p_full_name: patch.full_name ?? u.full_name,
      // Pakai 'in' agar pilihan kosong (null) benar-benar mengosongkan unit/role.
      p_primary_room_id: 'primary_room_id' in patch ? patch.primary_room_id ?? null : u.primary_room_id,
      p_role_id: 'role_id' in patch ? patch.role_id ?? null : u.role_id,
      p_is_active: 'is_active' in patch ? !!patch.is_active : u.is_active,
    })
    setBusy(false)
    if (error) {
      setMsg(`Gagal menyimpan: ${error.message}`)
      setRowNote({ id: u.user_id, ok: false, text: error.message })
    } else {
      const text = 'is_active' in patch ? (patch.is_active ? `${u.full_name} diaktifkan. Akun sudah bisa login.` : `${u.full_name} dinonaktifkan.`) : `Perubahan untuk ${u.full_name} disimpan.`
      setMsg(text)
      setRowNote({ id: u.user_id, ok: true, text })
      loadUsers()
    }
  }

  const deleteUser = async (u: Profile) => {
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_admin_delete_user', { p_user_id: u.user_id })
    setBusy(false)
    setConfirmDeleteId(null)
    if (error) {
      const text = error.message || ''
      let note = `Gagal menghapus: ${text}`
      if (/USER_HAS_DATA/.test(text)) note = 'Akun ini sudah memiliki data (risiko/laporan/rekam mutu), sehingga tidak dihapus agar data tetap utuh. Gunakan “Nonaktifkan”.'
      else if (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(text)) note = 'Fitur hapus akun belum aktif di database. Minta pemilik Supabase menjalankan file supabase/migrations/20261014092000_admin_delete_user.sql di SQL Editor, lalu coba lagi.'
      setMsg(note)
      setRowNote({ id: u.user_id, ok: false, text: note })
      return
    }
    setMsg(`Akun ${u.full_name} berhasil dihapus.`)
    setRowNote(null)
    loadUsers()
  }

  const changePassword = async () => {
    setPwMsg(null)
    if (pw.next.length < 8) return setPwMsg({ ok: false, text: 'Password baru minimal 8 karakter.' })
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'Konfirmasi password baru tidak sama.' })
    if (pw.next === pw.current) return setPwMsg({ ok: false, text: 'Password baru harus berbeda dari password saat ini.' })
    const email = me?.email || profile?.email
    if (!email) return setPwMsg({ ok: false, text: 'Email akun tidak ditemukan.' })
    setBusy(true)
    // Verifikasi password saat ini sebelum mengganti, agar sesi yang tertinggal di komputer bersama tidak bisa dipakai mengganti password.
    const check = await sb.auth.signInWithPassword({ email, password: pw.current })
    if (check.error) { setBusy(false); return setPwMsg({ ok: false, text: 'Password saat ini salah.' }) }
    const { error } = await sb.auth.updateUser({ password: pw.next })
    setBusy(false)
    if (error) return setPwMsg({ ok: false, text: `Gagal mengganti password: ${error.message}` })
    setPw({ current: '', next: '', confirm: '' })
    setPwMsg({ ok: true, text: 'Password berhasil diganti. Gunakan password baru saat login berikutnya.' })
  }

  useEffect(() => {
    if (section !== 'mydata') return
    const roomId = me?.primary_room_id ?? null
    const roomName = rooms.find((r) => r.id === roomId)?.name || ''
    const anySb = sb as any
    Promise.all([
      anySb.schema('aureka_risk').from('risk_register').select('id,unit_id,unit_name,risk_level').range(0, 4999),
      anySb.schema('aureka_patient_safety').from('incidents').select('id,status,created_by').eq('created_by', me?.user_id || '').range(0, 4999),
      anySb.schema('aureka_quality').from('quality_records').select('id,room_id').eq('profile_year', new Date().getFullYear()).range(0, 4999),
    ]).then(([r, i, q]: any[]) => {
      const norm = (v: unknown) => String(v || '').trim().toLowerCase()
      const mineRisk = (r.data || []).filter((x: any) => roomId != null && (x.unit_id === roomId || (x.unit_id == null && norm(x.unit_name) === norm(roomName))))
      setMyData({
        risks: r.error ? null : mineRisk.length,
        highRisks: r.error ? null : mineRisk.filter((x: any) => x.risk_level === 'Tinggi' || x.risk_level === 'Sangat Tinggi').length,
        incidents: i.error ? null : (i.data || []).length,
        openIncidents: i.error ? null : (i.data || []).filter((x: any) => x.status !== 'closed').length,
        quality: q.error ? null : (q.data || []).filter((x: any) => roomId != null && x.room_id === roomId).length,
      })
    })
  }, [section, me?.primary_room_id, me?.user_id, rooms])

  const roleLabel = friendlyRole(roleMeta) !== '—' ? friendlyRole(roleMeta) : effectiveRole === 'ADMIN' ? 'Super Admin' : (role || '—')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {msg && (
        <div className={`aurToast ${msgIsError ? 'error' : 'ok'}`} role="status" aria-live="polite">
          <span className="aurToastIcon" aria-hidden="true">{msgIsError ? '!' : '✓'}</span>
          <span className="aurToastText">{msg}</span>
          <button type="button" onClick={() => setMsg('')} aria-label="Tutup notifikasi">×</button>
        </div>
      )}
      {section === 'menu' && (
        <LiquidGlass style={{ padding: 18 }}>
          <div className="eyebrow">PENGATURAN</div>
          <h3 style={{ margin: '5px 0 4px', fontSize: 26, letterSpacing: '-.04em' }}>Pengaturan AUREKA</h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 11, lineHeight: 1.65 }}>
            Konfigurasi umum aplikasi berada di sini. Konfigurasi domain mutu, clinical pathway, klinis & kematian,
            dan OPPE tetap dikelola di kontainer modul masing-masing.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 16 }}>
            <button
              type="button"
              className="placeholderCard glassPanel"
              onClick={() => setSection('general')}
              style={{ textAlign: 'left', border: 0, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 28 }}>⚙️</span>
              <b style={{ display: 'block', marginTop: 8 }}>Pengaturan Umum</b>
              <span>Profil akun, akses, unit, tampilan, tone warna, preferensi, dan keamanan.</span>
            </button>

            <button type="button" className="placeholderCard glassPanel" onClick={() => { setSection('general'); setTab('security') }} style={{ textAlign: 'left', border: 0, cursor: 'pointer' }}>
              <span style={{ fontSize: 28 }}>🔒</span>
              <b style={{ display: 'block', marginTop: 8 }}>Keamanan & Password</b>
              <span>Ganti password akun dan lihat informasi sesi login.</span>
            </button>

            {!isAdmin && (
              <button type="button" className="placeholderCard glassPanel" onClick={() => setSection('mydata')} style={{ textAlign: 'left', border: 0, cursor: 'pointer' }}>
                <span style={{ fontSize: 28 }}>📋</span>
                <b style={{ display: 'block', marginTop: 8 }}>Data Saya untuk PMKP</b>
                <span>Ringkasan data unit yang Anda laporkan, kewajiban PIC, dan kontak Komite PMKP.</span>
              </button>
            )}

            {isAdmin && (
              <button type="button" className="placeholderCard glassPanel" onClick={() => setSection('users')} style={{ textAlign: 'left', border: 0, cursor: 'pointer' }}>
                <span style={{ fontSize: 28 }}>👥</span>
                <b style={{ display: 'block', marginTop: 8 }}>Manajemen User / PIC Pelaporan</b>
                <span>Kelola profil, role, unit utama, aktivasi, dan penghapusan akun pengguna.</span>
              </button>
            )}
          </div>
        </LiquidGlass>
      )}

      {section !== 'menu' && (
        <button type="button" className="textButton" onClick={() => setSection('menu')}>
          ← Kembali ke Pengaturan
        </button>
      )}

      {section === 'general' && (
        <>
          <LiquidGlass style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">PENGATURAN UMUM</div>
                <h3 style={{ margin: '5px 0 4px', fontSize: 24, letterSpacing: '-.04em' }}>AUREKA Settings</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 10 }}>
                  {me?.email || 'Akun AUREKA'} · {roleLabel}
                </p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent2)', fontSize: 10, fontWeight: 850 }}>
                {me?.is_active ? 'AKUN AKTIF' : 'AKUN NONAKTIF'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, marginTop: 16 }}>
              {[
                ['Peran', roleLabel],
                ['Unit', rooms.find((r) => r.id === me?.primary_room_id)?.name || 'Belum dipetakan'],
                ['Authentication', 'Supabase Auth'],
                ['Tone', tone.name],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.28)', border: '1px solid rgba(255,255,255,.6)' }}>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 9 }}>{label}</span>
                  <b style={{ display: 'block', marginTop: 5, fontSize: 11 }}>{value}</b>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
              {([
                ['profile', 'Akun & Akses'],
                ['units', 'Unit & Instalasi'],
                ['appearance', 'Tampilan & Tone'],
                ['security', 'Keamanan & Password'],
              ] as const).filter(([key]) => isAdmin || key !== 'units').map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={tab === key ? 'textButton navActive' : 'textButton'}
                  onClick={() => setTab(key)}
                  style={{ padding: '8px 12px', borderRadius: 12, background: tab === key ? 'var(--accent-soft)' : 'transparent' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </LiquidGlass>


          {tab === 'profile' && (
            <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 12px' }}>Akun & Akses</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                <label className="field">
                  <span>Nama lengkap</span>
                  <input value={me?.full_name || ''} onChange={(e) => me && setMe({ ...me, full_name: e.target.value })} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input value={me?.email || ''} disabled />
                </label>
                <label className="field">
                  <span>Role AUREKA</span>
                  <input value={roleLabel} disabled />
                </label>
                <label className="field">
                  <span>Status akun</span>
                  <input value={me?.is_active ? 'Aktif' : 'Nonaktif'} disabled />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Unit utama</span>
                  <select
                    value={me?.primary_room_id || ''}
                    disabled={!isAdmin}
                    onChange={(e) => me && setMe({ ...me, primary_room_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Belum dipetakan</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {!isAdmin && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)', fontSize: 9 }}>Unit utama menentukan data yang dapat Anda akses dan hanya dapat diubah oleh Super Admin.</small>}
                </label>
              </div>
              <div style={{ marginTop: 14 }}>
                <LiquidGlassButton onClick={saveMe} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Profil'}</LiquidGlassButton>
              </div>
            </LiquidGlass>
          )}

          {tab === 'units' && (
            <LiquidGlass style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ margin: 0 }}>Unit & Instalasi</h4>
                  <p style={{ margin: '5px 0 0', fontSize: 10, color: 'var(--muted)' }}>
                    Master unit dibaca langsung dari public.master_rooms.
                  </p>
                </div>
                <div style={{ padding: '7px 10px', borderRadius: 12, background: 'rgba(255,255,255,.35)', fontSize: 10, fontWeight: 850 }}>
                  {rooms.length} unit aktif
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8, marginTop: 14 }}>
                {rooms.map((r, i) => (
                  <div key={r.id} style={{ padding: 11, border: '1px solid rgba(20,34,27,.08)', borderRadius: 15, background: 'rgba(255,255,255,.18)' }}>
                    <b style={{ display: 'block', fontSize: 10 }}>{String(i + 1).padStart(2, '0')} · {r.name}</b>
                    <span style={{ display: 'block', marginTop: 4, fontSize: 8, color: 'var(--muted)' }}>{r.code || `ROOM-${r.id}`} · Aktif</span>
                  </div>
                ))}
              </div>
            </LiquidGlass>
          )}

          {tab === 'appearance' && (
            <LiquidGlass style={{ padding: 18 }}>
              <div className="eyebrow">VISUAL TONE</div>
              <h4 style={{ margin: '5px 0 4px', fontSize: 18 }}>Tone Warna AUREKA</h4>
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>
                Pilih nuansa warna antarmuka tanpa mengubah struktur atau menggunakan dark mode.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 16 }}>
                {TONES.map((item) => {
                  const selected = tone.id === item.id
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => applyTone(item)}
                      style={{
                        textAlign: 'left',
                        border: selected ? `2px solid ${item.accent}` : '1px solid rgba(255,255,255,.65)',
                        borderRadius: 18,
                        padding: 12,
                        background: selected ? item.soft : 'rgba(255,255,255,.28)',
                        boxShadow: selected ? `0 12px 30px rgba(${item.rgb},.15)` : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ width: 32, height: 32, borderRadius: 11, display: 'block', background: `linear-gradient(135deg,${item.accent},${item.accent2})` }} />
                        <div>
                          <b style={{ display: 'block', fontSize: 11 }}>{item.name}</b>
                          <span style={{ display: 'block', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>{item.description}</span>
                        </div>
                      </div>
                      {selected && <span style={{ display: 'inline-block', marginTop: 8, fontSize: 8, fontWeight: 900, color: item.accent }}>✓ AKTIF</span>}
                    </button>
                  )
                })}
              </div>

              <div style={{ marginTop: 18, padding: 16, borderRadius: 18, background: 'linear-gradient(135deg,rgba(255,255,255,.38),rgba(255,255,255,.16))', border: '1px solid rgba(255,255,255,.62)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <b style={{ fontSize: 12 }}>Preview tone</b>
                    <div style={{ color: 'var(--muted)', fontSize: 9, marginTop: 3 }}>Contoh tombol dan aksen aktif.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <span style={{ width: 76, height: 32, borderRadius: 12, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${tone.accent},${tone.accent2})`, color: '#fff', fontSize: 9, fontWeight: 850 }}>AUREKA</span>
                    <span style={{ width: 54, height: 32, borderRadius: 12, display: 'block', background: tone.soft, border: `1px solid ${tone.accent}` }} />
                  </div>
                </div>
              </div>
            </LiquidGlass>
          )}

          {tab === 'security' && (
            <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 12px' }}>Ganti Password</h4>
              <div className="pwForm">
                <label className="field"><span>Password saat ini</span><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
                <label className="field"><span>Password baru (min. 8 karakter)</span><input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
                <label className="field"><span>Ulangi password baru</span><input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
              </div>
              {pwMsg && <p className={pwMsg.ok ? 'pwMsg ok' : 'pwMsg'} role="status">{pwMsg.text}</p>}
              <div style={{ marginTop: 10, marginBottom: 18 }}>
                <LiquidGlassButton onClick={changePassword} disabled={busy || !pw.current || !pw.next || !pw.confirm}>{busy ? 'Memproses…' : 'Simpan password baru'}</LiquidGlassButton>
              </div>
              <h4 style={{ margin: '0 0 12px' }}>Keamanan & Session</h4>
              <div style={{ display: 'grid', gap: 9 }}>
                {[
                  ['Authentication', 'Supabase Auth'],
                  ['Session', 'Persistent session + automatic refresh'],
                  ['Authorization', `Role-based access · ${roleLabel}`],
                  ['Password', 'Dikelola oleh Supabase Auth, bukan disimpan di halaman Pengaturan.'],
                  ['Preferensi tone', 'Disimpan lokal pada browser ini.'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: 11, borderRadius: 14, background: 'rgba(255,255,255,.22)', border: '1px solid rgba(255,255,255,.48)' }}>
                    <b style={{ fontSize: 10 }}>{label}</b>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </LiquidGlass>
          )}
        </>
      )}

      {section === 'mydata' && (
        <>
          <LiquidGlass style={{ padding: 18 }}>
            <div className="eyebrow">DATA SAYA UNTUK PMKP</div>
            <h3 style={{ margin: '5px 0 4px', fontSize: 24 }}>{rooms.find((r) => r.id === me?.primary_room_id)?.name || 'Unit belum dipetakan'}</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 10 }}>{me?.full_name} · {roleLabel} · {me?.email}</p>
            <div className="myDataGrid">
              {([
                ['Risiko unit terdaftar', myData?.risks, 'risk'],
                ['Risiko tinggi / sangat tinggi', myData?.highRisks, 'risk'],
                ['Laporan IKP yang saya buat', myData?.incidents, 'safety'],
                ['IKP belum ditutup', myData?.openIncidents, 'safety'],
                [`Episode mutu unit ${new Date().getFullYear()}`, myData?.quality, 'quality'],
              ] as const).map(([label, value, mod]) => (
                <button key={label} type="button" className="ovKpi" onClick={() => onNavigate?.(mod)} disabled={!onNavigate}>
                  <span className="ovKpiLabel">{label}</span>
                  {myData === null ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{value == null ? '—' : value.toLocaleString('id-ID')}</b>}
                </button>
              ))}
            </div>
          </LiquidGlass>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
            <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 10px' }}>Kewajiban PIC unit</h4>
              <ul className="myDataList">
                <li><b>Register risiko</b><span>Perbarui identifikasi, penilaian, dan pengendalian risiko unit secara berkala; koreksi data bila ada salah input.</span></li>
                <li><b>Laporan IKP</b><span>Laporkan insiden keselamatan pasien melalui modul Keselamatan Pasien segera setelah kejadian (maks. 2×24 jam).</span></li>
                <li><b>Indikator mutu</b><span>Input data indikator mutu unit sesuai periode pengumpulan yang ditetapkan Komite PMKP.</span></li>
                <li><b>RTP</b><span>Tindak lanjuti rencana pengendalian risiko unit dan catat evaluasinya.</span></li>
              </ul>
            </LiquidGlass>
            <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 10px' }}>Perlu bantuan Komite PMKP?</h4>
              <ul className="myDataList">
                <li><b>Ganti unit / role</b><span>Unit utama dan role ditetapkan Super Admin. Hubungi Komite PMKP bila Anda pindah unit atau perlu akses tambahan.</span></li>
                <li><b>Data salah input</b><span>Risiko unit dapat Anda edit sendiri. Laporan IKP yang sudah dikirim diperbaiki melalui Komite PMKP.</span></li>
                <li><b>Lupa password</b><span>Ganti password di menu Keamanan & Password, atau minta Super Admin membantu reset.</span></li>
              </ul>
            </LiquidGlass>
          </div>
        </>
      )}

      {section === 'users' && isAdmin && (
        <>
          <LiquidGlass style={{ padding: 18 }}>
            <div className="eyebrow">MANAJEMEN USER</div>
            <h3 style={{ margin: '5px 0 4px', fontSize: 24 }}>User / PIC Pelaporan</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 10 }}>
              Super Admin dapat mengelola role, unit utama, dan status akun pengguna.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <input placeholder="Cari nama / email / unit…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360, flex: '1 1 220px' }} />
              {([
                ['all', `Semua (${users.length})`],
                ['pending', `Menunggu aktivasi (${pendingCount})`],
                ['active', 'Aktif'],
                ['unmapped', `Unit belum dipetakan (${unmappedCount})`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className="textButton" onClick={() => setUserFilter(id)}
                  style={{ margin: 0, padding: '6px 10px', borderRadius: 999, background: userFilter === id ? 'rgba(var(--accent-rgb),.14)' : 'transparent', fontWeight: userFilter === id ? 900 : 700 }}>
                  {label}
                </button>
              ))}
            </div>
            {pendingCount > 0 && <p style={{ margin: '10px 0 0', fontSize: 10, color: '#9a6b13' }}>
              {pendingCount} akun baru menunggu aktivasi. Periksa unit dan role, lalu klik “Aktifkan”. Akun ruangan cukup diberi role PIC Pelaporan.
            </p>}
          </LiquidGlass>

          <LiquidGlass style={{ padding: 14 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {filtered.map((u) => (
                <div key={u.user_id} className="userRow" style={{ padding: 12, border: u.is_active ? '1px solid rgba(20,34,27,.08)' : '1px solid rgba(169,104,22,.45)', borderRadius: 16, background: u.is_active ? 'rgba(255,255,255,.18)' : 'rgba(251,239,217,.55)' }}>
                  <div className="userRowGrid">
                    <div>
                      <b className="userName">{u.full_name} <span className={`userStatus ${u.is_active ? 'on' : 'pending'}`}>{u.is_active ? 'Aktif' : 'Menunggu aktivasi'}</span></b>
                      <span className="userEmail">{u.email || '—'}</span>
                    </div>

                    <select
                      value={u.primary_room_id || ''}
                      onChange={(e) => updateUser(u, { primary_room_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Unit belum dipetakan</option>
                      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>

                    <select value={u.role_id || ''} onChange={(e) => updateUser(u, { role_id: e.target.value || null })}>
                      <option value="">Role belum dipetakan</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{friendlyRole(r)}</option>)}
                    </select>

                    <div className="userActions">
                    {!u.is_active ? (
                      <button type="button" className="uBtn primary" disabled={busy || (!u.primary_room_id && (u.role_id === picRoleId || !u.role_id))}
                        title={!u.primary_room_id ? 'Pilih unit terlebih dahulu untuk akun PIC' : 'Aktifkan akun agar bisa login'}
                        onClick={() => updateUser(u, { is_active: true, role_id: u.role_id || picRoleId })}>
                        <span aria-hidden="true">✓</span> Aktifkan
                      </button>
                    ) : (
                      <button type="button" className="uBtn outline" disabled={busy || u.user_id === me?.user_id}
                        title={u.user_id === me?.user_id ? 'Tidak dapat menonaktifkan akun sendiri' : 'Nonaktifkan akun (data tetap tersimpan)'}
                        onClick={() => updateUser(u, { is_active: false })}>
                        Nonaktifkan
                      </button>
                    )}
                    {u.user_id !== me?.user_id && (confirmDeleteId === u.user_id ? (
                      <span className="userDeleteConfirm">
                        <span>Hapus akun ini?</span>
                        <button type="button" className="uBtn danger solid" disabled={busy} onClick={() => deleteUser(u)}>{busy ? 'Menghapus…' : 'Ya, hapus'}</button>
                        <button type="button" className="uBtn ghost" onClick={() => setConfirmDeleteId(null)}>Batal</button>
                      </span>
                    ) : (
                      <button type="button" className="uBtn danger" disabled={busy} title="Hapus akun (hanya untuk akun yang belum memiliki data)" onClick={() => { setConfirmDeleteId(u.user_id); setRowNote(null) }}>
                        <span aria-hidden="true">🗑</span> Hapus
                      </button>
                    ))}
                    </div>
                  </div>
                  {rowNote?.id === u.user_id && <div className={`userRowNote ${rowNote.ok ? 'ok' : 'error'}`}>{rowNote.text}</div>}
                </div>
              ))}
              {!filtered.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>Tidak ada pengguna yang cocok.</div>}
            </div>
          </LiquidGlass>
        </>
      )}
    </div>
  )
}
