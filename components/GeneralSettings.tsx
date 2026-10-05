'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

const sb = createClient(
  'https://ktukmjscopggkzrkgnzp.supabase.co',
  'sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)


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
}: {
  profile: Profile | null
  role: string | null
  rooms: Room[]
}) {
  const [section, setSection] = useState<'menu' | 'general' | 'users'>('menu')
  const [tab, setTab] = useState<'profile' | 'units' | 'appearance' | 'security'>('profile')
  const [me, setMe] = useState<Profile | null>(profile)
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [roleMeta, setRoleMeta] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
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
      p_primary_room_id: me.primary_room_id ? Number(me.primary_room_id) : null,
    })
    setBusy(false)
    setMsg(error ? `Gagal: ${error.message}` : 'Profil berhasil disimpan.')
  }

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const q = search.toLowerCase().trim()
        return !q || [u.full_name, u.email || ''].join(' ').toLowerCase().includes(q)
      }),
    [users, search]
  )

  const updateUser = async (u: Profile, patch: Partial<Profile>) => {
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_admin_update_user_profile', {
      p_user_id: u.user_id,
      p_full_name: patch.full_name ?? u.full_name,
      p_primary_room_id: patch.primary_room_id ?? u.primary_room_id,
      p_role_id: patch.role_id ?? u.role_id,
      p_is_active: patch.is_active ?? u.is_active,
    })
    setBusy(false)
    if (error) setMsg(error.message)
    else {
      setMsg('Perubahan pengguna disimpan.')
      loadUsers()
    }
  }

  const roleLabel = friendlyRole(roleMeta) !== '—' ? friendlyRole(roleMeta) : effectiveRole === 'ADMIN' ? 'Super Admin' : (role || '—')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
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

            <button
              type="button"
              className="placeholderCard glassPanel"
              onClick={() => isAdmin && setSection('users')}
              disabled={!isAdmin}
              style={{ textAlign: 'left', border: 0, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
            >
              <span style={{ fontSize: 28 }}>👥</span>
              <b style={{ display: 'block', marginTop: 8 }}>Manajemen User / PIC Pelaporan</b>
              <span>{isAdmin ? 'Kelola profil, role, unit utama, dan status pengguna.' : 'Khusus Super Admin.'}</span>
            </button>
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
                ['security', 'Keamanan'],
              ] as const).map(([key, label]) => (
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

          {msg && <div className="msg visible">{msg}</div>}

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
                    onChange={(e) => me && setMe({ ...me, primary_room_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Belum dipetakan</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
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

      {section === 'users' && isAdmin && (
        <>
          <LiquidGlass style={{ padding: 18 }}>
            <div className="eyebrow">MANAJEMEN USER</div>
            <h3 style={{ margin: '5px 0 4px', fontSize: 24 }}>User / PIC Pelaporan</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 10 }}>
              Super Admin dapat mengelola role, unit utama, dan status akun pengguna.
            </p>
            <input placeholder="Cari nama / email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginTop: 14, maxWidth: 360 }} />
          </LiquidGlass>

          <LiquidGlass style={{ padding: 14 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {filtered.map((u) => (
                <div key={u.user_id} style={{ padding: 12, border: '1px solid rgba(20,34,27,.08)', borderRadius: 16, background: 'rgba(255,255,255,.18)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <div>
                      <b style={{ display: 'block', fontSize: 11 }}>{u.full_name}</b>
                      <span style={{ display: 'block', marginTop: 3, fontSize: 9, color: 'var(--muted)' }}>{u.email || '—'}</span>
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

                    <button type="button" className="textButton" onClick={() => updateUser(u, { is_active: !u.is_active })}>
                      {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
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
