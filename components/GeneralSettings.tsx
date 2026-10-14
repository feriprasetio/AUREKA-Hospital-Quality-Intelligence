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
  deactivated_at?: string | null
  created_at?: string | null
  username?: string | null
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
  onRoomsChanged,
  openProfile,
}: {
  profile: Profile | null
  role: string | null
  rooms: Room[]
  onNavigate?: (moduleId: string) => void
  onRoomsChanged?: () => void
  /** Dibuka dari kartu nama di sidebar: langsung ke Akun Saya → Profil. */
  openProfile?: boolean
}) {
  const [section, setSection] = useState<'menu' | 'general' | 'users' | 'mydata'>(openProfile ? 'general' : 'menu')
  const [tab, setTab] = useState<'profile' | 'units' | 'appearance' | 'security'>('profile')
  const [me, setMe] = useState<Profile | null>(profile)
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [roleMeta, setRoleMeta] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'active' | 'inactive' | 'unmapped'>('all')
  const [lifecycleSupported, setLifecycleSupported] = useState(true)
  const [adminRooms, setAdminRooms] = useState<Room[] | null>(null)
  const [roomsSupported, setRoomsSupported] = useState(true)
  const [roomSearch, setRoomSearch] = useState('')
  const [roomEdit, setRoomEdit] = useState<{ id: number | null; name: string; code: string; is_active: boolean } | null>(null)
  const [showInactiveRooms, setShowInactiveRooms] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [myData, setMyData] = useState<{ risks: number | null; highRisks: number | null; incidents: number | null; openIncidents: number | null; quality: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [rowNote, setRowNote] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailIdent, setDetailIdent] = useState({ username: '', email: '', verify: true })
  const [myAccount, setMyAccount] = useState<{ username: string; email: string; supported: boolean }>({ username: '', email: '', supported: true })
  const [acctEdit, setAcctEdit] = useState({ username: '', email: '' })
  const [acctNote, setAcctNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [tempPw, setTempPw] = useState('')
  const [tempPwDone, setTempPwDone] = useState<{ id: string; pw: string } | null>(null)
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
    // v2 membedakan akun nonaktif vs menunggu aktivasi; fallback ke RPC lama bila migration belum dijalankan.
    const v3 = await sb.rpc('aureka_admin_list_users_v3')
    if (!v3.error) { setLifecycleSupported(true); setUsers((v3.data || []) as Profile[]); return }
    const v2 = await sb.rpc('aureka_admin_list_users_v2')
    if (!v2.error) { setLifecycleSupported(true); setUsers((v2.data || []) as Profile[]); return }
    setLifecycleSupported(false)
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

  const loadMyAccount = async () => {
    const { data, error } = await sb.rpc('aureka_get_my_account')
    const row = Array.isArray(data) ? data[0] : data
    const next = { username: row?.username || '', email: row?.email || me?.email || profile?.email || '', supported: !error }
    setMyAccount(next)
    setAcctEdit({ username: next.username, email: next.email })
  }
  useEffect(() => { loadMyAccount() }, [])

  const saveMyUsername = async () => {
    const un = acctEdit.username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(un)) return setAcctNote({ ok: false, text: 'Username 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Contoh: pic.isolasi' })
    setBusy(true)
    const { error } = await sb.rpc('aureka_set_my_username', { p_username: un })
    setBusy(false)
    if (error) return setAcctNote({ ok: false, text: /USERNAME_TAKEN/.test(error.message) ? 'Username sudah dipakai akun lain.' : error.code === 'PGRST202' ? 'Fitur username belum aktif di database (migration 20261014095000_username_login.sql).' : `Gagal: ${error.message}` })
    setAcctNote({ ok: true, text: `Username disimpan. Mulai sekarang Anda bisa login dengan “${un}”.` })
    loadMyAccount()
  }

  const saveMyEmail = async () => {
    const em = acctEdit.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setAcctNote({ ok: false, text: 'Format email tidak valid.' })
    if (em === (myAccount.email || '').toLowerCase()) return setAcctNote({ ok: false, text: 'Email baru sama dengan email saat ini.' })
    setBusy(true)
    const { error } = await sb.auth.updateUser({ email: em }, { emailRedirectTo: `${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/` })
    setBusy(false)
    if (error) return setAcctNote({ ok: false, text: /rate limit|too many/i.test(error.message) ? 'Terlalu banyak permintaan email. Coba lagi beberapa menit lagi.' : /already|registered/i.test(error.message) ? 'Email sudah dipakai akun lain.' : `Gagal mengubah email: ${error.message}` })
    setAcctNote({ ok: true, text: `Link konfirmasi dikirim ke ${em}. Email baru berlaku setelah Anda klik link tersebut (Supabase juga dapat mengirim konfirmasi ke email lama). Sampai saat itu, login tetap memakai email lama.` })
  }

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
        const matchesText = !q || [u.full_name, u.email || '', u.username || '', rooms.find((r) => r.id === u.primary_room_id)?.name || ''].join(' ').toLowerCase().includes(q)
        const deactivated = !u.is_active && !!u.deactivated_at
        const matchesStatus =
          (userFilter === 'all' && !deactivated) ||
          (userFilter === 'pending' && !u.is_active && !deactivated) ||
          (userFilter === 'active' && u.is_active) ||
          (userFilter === 'inactive' && deactivated) ||
          (userFilter === 'unmapped' && !u.primary_room_id && !deactivated)
        return matchesText && matchesStatus
      }).sort((a, b) => Number(a.is_active) - Number(b.is_active)),
    [users, search, userFilter, rooms]
  )
  const pendingCount = users.filter((u) => !u.is_active && !u.deactivated_at).length
  const inactiveCount = users.filter((u) => !u.is_active && !!u.deactivated_at).length
  const activeCount = users.filter((u) => u.is_active).length
  const unmappedCount = users.filter((u) => !u.primary_room_id && !(!u.is_active && u.deactivated_at)).length

  const loadRooms = async () => {
    if (!isAdmin) return
    const { data, error } = await sb.rpc('aureka_admin_list_rooms')
    if (error) { setRoomsSupported(false); setAdminRooms(null); return }
    setRoomsSupported(true)
    setAdminRooms((data || []) as Room[])
  }
  useEffect(() => { if (tab === 'units') loadRooms() }, [tab, isAdmin])

  const saveRoom = async () => {
    if (!roomEdit) return
    if (!roomEdit.name.trim()) { setMsg('Gagal: nama unit wajib diisi.'); return }
    setBusy(true)
    const { error } = await sb.rpc('aureka_admin_save_room', {
      p_id: roomEdit.id, p_name: roomEdit.name.trim(), p_code: roomEdit.code.trim() || null, p_is_active: roomEdit.is_active,
    })
    setBusy(false)
    if (error) {
      const t = error.message || ''
      setMsg(/DUPLICATE_ROOM/.test(t) ? 'Gagal: nama atau kode unit sudah dipakai unit lain.'
        : error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(t) ? 'Gagal: fitur kelola unit belum aktif. Jalankan migration 20261014093000_user_lifecycle_and_room_admin.sql di Supabase.'
        : `Gagal menyimpan unit: ${t}`)
      return
    }
    setMsg(roomEdit.id ? `Unit “${roomEdit.name.trim()}” diperbarui.` : `Unit “${roomEdit.name.trim()}” ditambahkan.`)
    setRoomEdit(null)
    await loadRooms()
    onRoomsChanged?.()
  }
  const toggleRoom = async (r: Room) => {
    setBusy(true)
    const { error } = await sb.rpc('aureka_admin_save_room', { p_id: r.id, p_name: r.name, p_code: r.code || null, p_is_active: !(r.is_active ?? true) })
    setBusy(false)
    if (error) { setMsg(`Gagal mengubah status unit: ${error.message}`); return }
    setMsg(r.is_active === false ? `Unit “${r.name}” diaktifkan kembali.` : `Unit “${r.name}” dinonaktifkan. Data lamanya tetap tersimpan.`)
    await loadRooms()
    onRoomsChanged?.()
  }
  const roomUserCount = (id: number) => users.filter((u) => u.primary_room_id === id && u.is_active).length
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

  const openDetail = (u: Profile) => {
    if (detailId === u.user_id) { setDetailId(null); return }
    setDetailId(u.user_id)
    setDetailName(u.full_name || '')
    setDetailIdent({ username: u.username || '', email: u.email || '', verify: true })
    setTempPw('')
    setTempPwDone(null)
    setConfirmDeleteId(null)
    setRowNote(null)
  }

  const generateTempPw = () => {
    // Tanpa karakter yang mudah tertukar (0/O, 1/l/I) agar mudah didiktekan ke PIC.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const buf = new Uint32Array(10)
    crypto.getRandomValues(buf)
    setTempPw(Array.from(buf, (n) => chars[n % chars.length]).join(''))
  }

  const setUserPassword = async (u: Profile) => {
    const pwd = tempPw.trim()
    if (pwd.length < 8) { setRowNote({ id: u.user_id, ok: false, text: 'Password sementara minimal 8 karakter.' }); return }
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_admin_set_user_password', { p_user_id: u.user_id, p_new_password: pwd })
    setBusy(false)
    if (error) {
      const t = error.message || ''
      let note = `Gagal menyetel password: ${t}`
      if (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(t)) note = 'Fitur reset password belum aktif di database. Minta pemilik Supabase menjalankan file supabase/migrations/20261014094000_admin_password_reset.sql di SQL Editor, lalu coba lagi.'
      else if (/PASSWORD_TOO_SHORT/.test(t)) note = 'Password sementara minimal 8 karakter.'
      setMsg(note)
      setRowNote({ id: u.user_id, ok: false, text: note })
      return
    }
    setTempPwDone({ id: u.user_id, pw: pwd })
    setTempPw('')
    // Tanpa toast agar password sementara di panel tidak tertutup notifikasi.
    const text = `Password ${u.full_name} sudah diganti. Berikan password sementara kepada yang bersangkutan dan minta ia menggantinya di Pengaturan → Keamanan & Password.`
    setRowNote({ id: u.user_id, ok: true, text })
  }

  const sendResetEmail = async (u: Profile) => {
    if (!u.email) { setRowNote({ id: u.user_id, ok: false, text: 'Akun ini tidak memiliki email.' }); return }
    setBusy(true)
    setMsg('')
    const redirectTo = `${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/`
    const { error } = await sb.auth.resetPasswordForEmail(u.email, { redirectTo })
    setBusy(false)
    const text = error
      ? `Gagal mengirim email reset: ${/rate limit|too many/i.test(error.message) ? 'terlalu banyak permintaan, coba lagi beberapa menit lagi.' : error.message}`
      : `Email reset password dikirim ke ${u.email}. Minta ${u.full_name} membuka tautan di email tersebut (cek juga folder Spam).`
    setMsg(text)
    setRowNote({ id: u.user_id, ok: !error, text })
  }

  const saveIdentity = async (u: Profile) => {
    const un = detailIdent.username.trim().toLowerCase()
    const em = detailIdent.email.trim().toLowerCase()
    if (un && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(un)) { setRowNote({ id: u.user_id, ok: false, text: 'Username 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.' }); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setRowNote({ id: u.user_id, ok: false, text: 'Format email tidak valid.' }); return }
    setBusy(true)
    setMsg('')
    const { data, error } = await sb.rpc('aureka_admin_set_user_identity', { p_user_id: u.user_id, p_username: un || null, p_email: em, p_require_verification: detailIdent.verify })
    if (error) {
      setBusy(false)
      const t = error.message || ''
      const note = error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(t) ? 'Fitur ubah username/email belum aktif di database. Minta pemilik Supabase menjalankan supabase/migrations/20261014095000_username_login.sql.'
        : /USERNAME_TAKEN/.test(t) ? 'Username sudah dipakai akun lain.' : /EMAIL_TAKEN/.test(t) ? 'Email sudah dipakai akun lain.' : /USERNAME_INVALID/.test(t) ? 'Username tidak valid.' : /EMAIL_INVALID/.test(t) ? 'Format email tidak valid.' : `Gagal menyimpan: ${t}`
      setMsg(note); setRowNote({ id: u.user_id, ok: false, text: note }); return
    }
    let text = 'Username & email disimpan.'
    if (data === 'verify') {
      const r = await sb.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: `${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/` } })
      text = r.error
        ? `Email diubah ke ${em}, tetapi email verifikasi gagal dikirim (${/rate limit|too many/i.test(r.error.message) ? 'batas pengiriman email, coba “Kirim ulang” nanti' : r.error.message}).`
        : `Email diubah ke ${em}. Link verifikasi dikirim; ${u.full_name} perlu klik link tersebut sebelum bisa login.`
    } else if (data === 'changed') text = `Email diubah ke ${em} tanpa verifikasi.`
    setBusy(false)
    setMsg(text); setRowNote({ id: u.user_id, ok: true, text })
    loadUsers()
  }

  const resendVerification = async (u: Profile) => {
    if (!u.email) return
    setBusy(true)
    const r = await sb.auth.resend({ type: 'signup', email: u.email, options: { emailRedirectTo: `${window.location.origin}/AUREKA-Hospital-Quality-Intelligence/` } })
    setBusy(false)
    const text = r.error ? (/already|confirmed/i.test(r.error.message) ? 'Email akun ini sudah terverifikasi.' : `Gagal mengirim: ${r.error.message}`) : `Email verifikasi dikirim ulang ke ${u.email}.`
    setRowNote({ id: u.user_id, ok: !r.error, text })
  }

  const fmtDate = (v?: string | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
        <div><button type="button" className="backBtn" onClick={() => setSection('menu')}>
          <span aria-hidden="true">←</span> Kembali ke menu Pengaturan
        </button></div>
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

            <div className="settingsTabs" role="tablist" aria-label="Bagian pengaturan">
              {([
                ['profile', 'Akun & Akses', '👤', 'Nama, role, unit'],
                ['units', 'Unit & Instalasi', '🏥', 'Daftar unit kerja'],
                ['appearance', 'Tampilan & Tone', '🎨', 'Warna aplikasi'],
                ['security', 'Keamanan & Password', '🔒', 'Ganti password'],
              ] as const).filter(([key]) => isAdmin || key !== 'units').map(([key, label, icon, hint]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  key={key}
                  className={tab === key ? 'settingsTab active' : 'settingsTab'}
                  onClick={() => setTab(key)}
                >
                  <span className="settingsTabIcon" aria-hidden="true">{icon}</span>
                  <span className="settingsTabText"><b>{label}</b><small>{hint}</small></span>
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

          {tab === 'profile' && (
            <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 4px' }}>Username & Email Login</h4>
              <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 12 }}>Login bisa memakai username atau email. Email dipakai untuk verifikasi dan reset password, jadi pastikan email aktif.</p>
              {!myAccount.supported && <div className="userRowNote error" style={{ marginBottom: 10 }}>Fitur username belum aktif di database. Minta pemilik Supabase menjalankan migration 20261014095000_username_login.sql.</div>}
              <div className="acctGrid">
                <div>
                  <label className="userDetailLabel" htmlFor="myUsername">Username</label>
                  <div className="userDetailInline">
                    <input id="myUsername" autoCapitalize="none" spellCheck={false} placeholder="contoh: pic.isolasi" value={acctEdit.username} onChange={(e) => setAcctEdit({ ...acctEdit, username: e.target.value.toLowerCase().replace(/\s+/g, '.') })} />
                    <button type="button" className="uBtn primary" disabled={busy || !myAccount.supported || !acctEdit.username.trim() || acctEdit.username.trim() === myAccount.username} onClick={saveMyUsername}>Simpan username</button>
                  </div>
                </div>
                <div>
                  <label className="userDetailLabel" htmlFor="myEmail">Email</label>
                  <div className="userDetailInline">
                    <input id="myEmail" type="email" placeholder="nama@email.com" value={acctEdit.email} onChange={(e) => setAcctEdit({ ...acctEdit, email: e.target.value })} />
                    <button type="button" className="uBtn outline" disabled={busy || !acctEdit.email.trim() || acctEdit.email.trim().toLowerCase() === (myAccount.email || '').toLowerCase()} onClick={saveMyEmail}>Ubah email</button>
                  </div>
                  <p className="userDetailHint">Email baru berlaku setelah Anda klik link konfirmasi yang dikirim ke email tersebut.</p>
                </div>
              </div>
              {acctNote && <div className={`userRowNote ${acctNote.ok ? 'ok' : 'error'}`} style={{ marginTop: 10 }}>{acctNote.text}</div>}
            </LiquidGlass>
          )}

          {tab === 'units' && (
            <LiquidGlass style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ margin: 0 }}>Unit & Instalasi</h4>
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                    {isAdmin ? 'Tambah, ubah nama/kode, atau nonaktifkan unit kerja. Unit tidak dihapus permanen karena masih dipakai data risiko dan akun.' : 'Daftar unit kerja aktif.'}
                  </p>
                </div>
                {isAdmin && roomsSupported && <button type="button" className="uBtn primary" onClick={() => setRoomEdit({ id: null, name: '', code: '', is_active: true })}><span aria-hidden="true">＋</span> Tambah unit</button>}
              </div>

              {isAdmin && !roomsSupported && <div className="userRowNote error" style={{ marginTop: 12 }}>Fitur tambah/edit unit belum aktif di database. Minta pemilik Supabase menjalankan <code>supabase/migrations/20261014093000_user_lifecycle_and_room_admin.sql</code> di SQL Editor.</div>}

              {roomEdit && (
                <div className="roomEditor">
                  <b>{roomEdit.id ? 'Edit unit' : 'Unit baru'}</b>
                  <div className="roomEditorGrid">
                    <label className="field"><span>Nama unit</span><input autoFocus value={roomEdit.name} onChange={(e) => setRoomEdit({ ...roomEdit, name: e.target.value })} placeholder="mis. Kamar Jenazah" /></label>
                    <label className="field"><span>Kode (opsional)</span><input value={roomEdit.code} onChange={(e) => setRoomEdit({ ...roomEdit, code: e.target.value.toUpperCase() })} placeholder="Otomatis dari nama" /></label>
                  </div>
                  <div className="userActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                    <button type="button" className="uBtn primary" disabled={busy} onClick={saveRoom}>{busy ? 'Menyimpan…' : 'Simpan unit'}</button>
                    <button type="button" className="uBtn ghost" onClick={() => setRoomEdit(null)}>Batal</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                <input placeholder="Cari unit…" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} style={{ maxWidth: 320, flex: '1 1 200px' }} />
                {isAdmin && adminRooms && <>
                  <span className="filterCount">{adminRooms.filter((r) => r.is_active !== false).length} aktif · {adminRooms.filter((r) => r.is_active === false).length} nonaktif</span>
                  <button type="button" className={showInactiveRooms ? 'filterChip active' : 'filterChip'} onClick={() => setShowInactiveRooms((v) => !v)}>{showInactiveRooms ? 'Sembunyikan unit nonaktif' : 'Tampilkan unit nonaktif'}</button>
                </>}
              </div>

              <div className="roomGrid">
                {(adminRooms || rooms)
                  .filter((r) => showInactiveRooms || r.is_active !== false)
                  .filter((r) => !roomSearch.trim() || `${r.name} ${r.code || ''}`.toLowerCase().includes(roomSearch.trim().toLowerCase()))
                  .map((r) => (
                  <div key={r.id} className={r.is_active === false ? 'roomCard off' : 'roomCard'}>
                    <div className="roomCardText">
                      <b>{r.name}</b>
                      <span>{r.code || `ROOM-${r.id}`} · {r.is_active === false ? 'Nonaktif' : 'Aktif'}{isAdmin && users.length ? ` · ${roomUserCount(r.id)} user aktif` : ''}</span>
                    </div>
                    {isAdmin && adminRooms && (
                      <div className="roomCardActions">
                        <button type="button" className="uBtn outline sm" onClick={() => setRoomEdit({ id: r.id, name: r.name, code: r.code || '', is_active: r.is_active !== false })}>Edit</button>
                        <button type="button" className={r.is_active === false ? 'uBtn primary sm' : 'uBtn danger sm'} disabled={busy} onClick={() => toggleRoom(r)}>{r.is_active === false ? 'Aktifkan' : 'Nonaktifkan'}</button>
                      </div>
                    )}
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
                <li><b>Lupa password</b><span>Klik “Lupa password?” di halaman login untuk menerima email reset, atau minta Super Admin menyetel password sementara.</span></li>
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
              <input placeholder="Cari nama / username / email / unit…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360, flex: '1 1 220px' }} />
              {([
                ['all', `Semua (${users.length - inactiveCount})`],
                ['pending', `Menunggu aktivasi (${pendingCount})`],
                ['active', `Aktif (${activeCount})`],
                ['inactive', `Nonaktif (${inactiveCount})`],
                ['unmapped', `Unit belum dipetakan (${unmappedCount})`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={userFilter === id ? 'filterChip active' : 'filterChip'} onClick={() => setUserFilter(id)}
                  style={id === 'inactive' && !lifecycleSupported ? { display: 'none' } : undefined}>
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
                <div key={u.user_id} className="userRow" style={{ padding: 12, border: u.is_active || u.deactivated_at ? '1px solid rgba(20,34,27,.08)' : '1px solid rgba(169,104,22,.45)', borderRadius: 16, background: u.is_active ? 'rgba(255,255,255,.18)' : u.deactivated_at ? 'rgba(20,34,27,.04)' : 'rgba(251,239,217,.55)' }}>
                  <div className="userRowGrid">
                    <div>
                      <b className="userName">{u.full_name} <span className={`userStatus ${u.is_active ? 'on' : u.deactivated_at ? 'off' : 'pending'}`}>{u.is_active ? 'Aktif' : u.deactivated_at ? 'Nonaktif' : 'Menunggu aktivasi'}</span></b>
                      <span className="userEmail">{u.username ? <b className="userHandle">@{u.username}</b> : null}{u.username ? ' · ' : ''}{u.email || '—'}</span>
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
                    <button type="button" className={detailId === u.user_id ? 'uBtn outline active' : 'uBtn outline'} aria-expanded={detailId === u.user_id}
                      title="Lihat & ubah data akun, reset password" onClick={() => openDetail(u)}>
                      <span aria-hidden="true">👤</span> {detailId === u.user_id ? 'Tutup detail' : 'Detail'}
                    </button>
                    {!u.is_active ? (
                      <button type="button" className="uBtn primary" disabled={busy || (!u.primary_room_id && (u.role_id === picRoleId || !u.role_id))}
                        title={!u.primary_room_id ? 'Pilih unit terlebih dahulu untuk akun PIC' : 'Aktifkan akun agar bisa login'}
                        onClick={() => updateUser(u, { is_active: true, role_id: u.role_id || picRoleId })}>
                        <span aria-hidden="true">✓</span> {u.deactivated_at ? 'Aktifkan kembali' : 'Aktifkan'}
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
                  {detailId === u.user_id && (
                    <div className="userDetail">
                      <div className="userDetailCol">
                        <h5>Data akun</h5>
                        <dl className="userDetailInfo">
                          <dt>Username</dt><dd>{u.username || '—'}</dd>
                          <dt>Email</dt><dd>{u.email || '—'}</dd>
                          <dt>Status</dt><dd>{u.is_active ? 'Aktif' : u.deactivated_at ? `Nonaktif sejak ${fmtDate(u.deactivated_at)}` : 'Menunggu aktivasi'}</dd>
                          <dt>Unit utama</dt><dd>{rooms.find((r) => r.id === u.primary_room_id)?.name || 'Belum dipetakan'}</dd>
                          <dt>Role</dt><dd>{friendlyRole(roles.find((r) => r.id === u.role_id))}</dd>
                          <dt>Terdaftar</dt><dd>{fmtDate(u.created_at)}</dd>
                        </dl>
                        <label className="userDetailLabel" htmlFor={`nm-${u.user_id}`}>Nama lengkap</label>
                        <div className="userDetailInline">
                          <input id={`nm-${u.user_id}`} value={detailName} onChange={(e) => setDetailName(e.target.value)} />
                          <button type="button" className="uBtn primary" disabled={busy || !detailName.trim() || detailName.trim() === u.full_name}
                            onClick={() => updateUser(u, { full_name: detailName.trim() })}>Simpan nama</button>
                        </div>
                        <label className="userDetailLabel" htmlFor={`un-${u.user_id}`} style={{ marginTop: 12 }}>Username & email</label>
                        <div className="userDetailInline">
                          <input id={`un-${u.user_id}`} placeholder="username, mis. pic.isolasi" autoCapitalize="none" value={detailIdent.username} onChange={(e) => setDetailIdent({ ...detailIdent, username: e.target.value.toLowerCase().replace(/\s+/g, '.') })} />
                          <input type="email" placeholder="email aktif" value={detailIdent.email} onChange={(e) => setDetailIdent({ ...detailIdent, email: e.target.value })} />
                        </div>
                        <label className="userDetailCheck"><input type="checkbox" checked={detailIdent.verify} onChange={(e) => setDetailIdent({ ...detailIdent, verify: e.target.checked })} /> Kirim email verifikasi bila email diganti (disarankan)</label>
                        <div className="userDetailInline" style={{ marginTop: 8 }}>
                          <button type="button" className="uBtn primary" disabled={busy || ((detailIdent.username.trim() || '') === (u.username || '') && detailIdent.email.trim().toLowerCase() === (u.email || '').toLowerCase())} onClick={() => saveIdentity(u)}>Simpan username & email</button>
                          <button type="button" className="uBtn outline" disabled={busy || !u.email} onClick={() => resendVerification(u)}>✉️ Kirim ulang verifikasi</button>
                        </div>
                        <p className="userDetailHint">Unit dan role diubah lewat pilihan di baris atas. User login memakai username atau email.</p>
                      </div>
                      <div className="userDetailCol">
                        <h5>Reset password <span>untuk user yang lupa password</span></h5>
                        <p className="userDetailHint" style={{ marginTop: 0 }}><b>Cara 1 — Password sementara.</b> Buat password baru, lalu sampaikan ke user (WA/langsung). Akun dan datanya tetap utuh.</p>
                        <div className="userDetailInline">
                          <input placeholder="Password sementara (min. 8 karakter)" value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="new-password" />
                          <button type="button" className="uBtn outline" onClick={generateTempPw} title="Buat password acak">🎲 Buat acak</button>
                        </div>
                        <button type="button" className="uBtn primary" style={{ marginTop: 8 }} disabled={busy || tempPw.trim().length < 8} onClick={() => setUserPassword(u)}>
                          {busy ? 'Menyimpan…' : '🔑 Setel password sementara'}
                        </button>
                        {tempPwDone?.id === u.user_id && (
                          <div className="userTempPw">
                            <span>Password baru {u.full_name}:</span>
                            <code>{tempPwDone.pw}</code>
                            <button type="button" className="uBtn ghost" onClick={() => { navigator.clipboard?.writeText(tempPwDone.pw); setRowNote({ id: u.user_id, ok: true, text: 'Password disalin.' }) }}>Salin</button>
                          </div>
                        )}
                        <p className="userDetailHint"><b>Cara 2 — Email reset.</b> User menerima tautan di email untuk membuat password sendiri.</p>
                        <button type="button" className="uBtn outline" disabled={busy || !u.email} onClick={() => sendResetEmail(u)}>✉️ Kirim email reset password</button>
                      </div>
                    </div>
                  )}
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
