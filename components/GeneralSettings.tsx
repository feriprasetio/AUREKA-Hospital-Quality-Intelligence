'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { readAllPages } from '@/lib/aureka/pagination'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import AurekaModal from '@/components/ui/AurekaModal'
import { SystemConfigPanel, PermissionMatrixPanel } from '@/components/governance/SettingsGovernancePanels'

function SettingsIcon({ kind }: { kind: 'settings' | 'lock' | 'data' | 'users' | 'profile' | 'unit' | 'palette' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'palette' ? <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></>
      : kind === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>
      : kind === 'profile' ? <><circle cx="12" cy="8" r="3.2" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>
      : kind === 'unit' ? <><path d="M4 21V4h16v17M9 21v-5h6v5M8 8h2m4 0h2M8 12h2m4 0h2M2 21h20" /></>
      : kind === 'users' ? <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>
      : kind === 'data' ? <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" /></>
      : <><path d="m12 3 2 2 3-.1.7 2.7 2.3 1.8-1.2 2.6.4 2.9-2.6 1.3-1.5 2.5-2.8-.6-2.8.6L8 16.2l-2.6-1.3.4-2.9-1.2-2.6L7 7.6 7.7 5l3 .1L12 3Z" /><circle cx="12" cy="11.5" r="3" /></>}
  </svg>
}

const sb = aurekaSupabase
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/AUREKA-Hospital-Quality-Intelligence'


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
  must_change_password?: boolean
}
type Role = { id: string; code: string; name: string; description?: string | null }

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
  initialTab,
  startAt,
}: {
  profile: Profile | null
  role: string | null
  rooms: Room[]
  onNavigate?: (moduleId: string) => void
  onRoomsChanged?: () => void
  /** Dibuka dari kartu nama di sidebar: langsung ke Akun Saya → Profil. */
  openProfile?: boolean
  /** Dibuka dari tombol "Ubah password": langsung ke Keamanan & Password. */
  initialTab?: 'security'
  /** Blueprint v2 §1: submenu Pengaturan di sidebar membuka bagian yang sesuai. */
  startAt?: 'profile' | 'security' | 'units' | 'users' | 'appearance' | 'system' | 'permissions' | 'mydata'
}) {
  const startSection = startAt === 'users' ? 'users' : startAt === 'appearance' ? 'appearance' : startAt === 'system' ? 'system' : startAt === 'permissions' ? 'permissions' : startAt === 'mydata' ? 'mydata' : 'general'
  const [section, setSection] = useState<'general' | 'users' | 'mydata' | 'appearance' | 'system' | 'permissions'>(startSection)
  void openProfile
  const [tab, setTab] = useState<'profile' | 'units' | 'security'>(initialTab === 'security' || startAt === 'security' ? 'security' : startAt === 'units' ? 'units' : 'profile')
  useEffect(() => { setSection(startSection); setTab(initialTab === 'security' || startAt === 'security' ? 'security' : startAt === 'units' ? 'units' : 'profile') }, [startAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pwShow, setPwShow] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  useEffect(() => {
    if (initialTab !== 'security') return
    const t = window.setTimeout(() => document.getElementById('aureka-password-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    return () => window.clearTimeout(t)
  }, [initialTab])
  const [me, setMe] = useState<Profile | null>(profile)
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [roleMeta, setRoleMeta] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  // Browser kadang mengisi kolom cari dengan email/username tersimpan (karena ada kolom password di halaman ini).
  // Bila isinya persis email/username akun sendiri dan bukan diketik, kosongkan agar daftar pengguna tidak tampak kosong.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const own = [profile?.email, (profile as { username?: string } | null)?.username].filter(Boolean).map((v) => String(v).toLowerCase())
      const active = document.activeElement as HTMLInputElement | null
      setSearch((v) => (own.includes(v.trim().toLowerCase()) && active?.name !== 'aureka-admin-user-filter' ? '' : v))
    }, 800)
    return () => window.clearTimeout(t)
  }, [profile])
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'active' | 'inactive' | 'unmapped'>('all')
  const [lifecycleSupported, setLifecycleSupported] = useState(true)
  const [adminRooms, setAdminRooms] = useState<Room[] | null>(null)
  const [roomsSupported, setRoomsSupported] = useState(true)
  const [roomSearch, setRoomSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; const query = String(detail?.query ?? ''); setSearch(query); setRoomSearch(query) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
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
  useEffect(() => { if (!detailId || typeof document === 'undefined') return; const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev } }, [detailId])
  const [detailName, setDetailName] = useState('')
  const [detailIdent, setDetailIdent] = useState({ username: '', email: '', verify: true })
  const [myAccount, setMyAccount] = useState<{ username: string; email: string; supported: boolean }>({ username: '', email: '', supported: true })
  const [acctEdit, setAcctEdit] = useState({ username: '', email: '' })
  const [acctNote, setAcctNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [tempPw, setTempPw] = useState('')
  const [tempPwDone, setTempPwDone] = useState<{ id: string; pw: string } | null>(null)
  useEffect(() => {
    const notify = (text: string, error = false, module = 'Administrasi') => {
      if (!text || typeof window === 'undefined') return
      window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message: text, type: error ? 'error' : 'success', module } }))
    }
    if (msg) notify(msg, /gagal|tidak dapat|belum aktif|error|forbidden|tidak ditemukan|tidak dihapus/i.test(msg), 'Administrasi')
    if (pwMsg?.text) notify(pwMsg.text, !pwMsg.ok, 'Keamanan akun')
    if (rowNote?.text) notify(rowNote.text, !rowNote.ok, 'Manajemen pengguna')
    if (acctNote?.text) notify(acctNote.text, !acctNote.ok, 'Akun')
  }, [msg, pwMsg, rowNote, acctNote])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 6000)
    return () => clearTimeout(t)
  }, [msg])
  const msgIsError = /gagal|tidak dapat|belum aktif|error|forbidden|tidak ditemukan|tidak dihapus/i.test(msg)
  const effectiveRole = roleMeta?.code ?? role
  const isAdmin = effectiveRole === 'ADMIN'

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
    if (error) setMsg(toUserFacingError(error, { fallback: 'Data belum dapat dimuat. Coba muat ulang.' }))
    else setUsers((data || []) as Profile[])
  }

  useEffect(() => {
    sb.rpc('aureka_list_active_roles').then(({ data, error }) => {
      if (error) setMsg(toUserFacingError(error, { fallback: 'Data belum dapat dimuat. Coba muat ulang.' }))
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
    if (error) return setAcctNote({ ok: false, text: /USERNAME_TAKEN/.test(error.message) ? 'Username sudah dipakai akun lain.' : error.code === 'PGRST202' ? 'Fitur username belum tersedia.' : `Gagal: ${toUserFacingError(error, { fallback: 'Data belum dapat disimpan. Periksa koneksi dan hak akses, lalu coba kembali.' })}` })
    setAcctNote({ ok: true, text: `Username disimpan. Mulai sekarang Anda bisa login dengan “${un}”.` })
    loadMyAccount()
  }

  const saveMyEmail = async () => {
    const em = acctEdit.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setAcctNote({ ok: false, text: 'Format email tidak valid.' })
    if (em === (myAccount.email || '').toLowerCase()) return setAcctNote({ ok: false, text: 'Email baru sama dengan email saat ini.' })
    setBusy(true)
    const { error } = await sb.auth.updateUser({ email: em }, { emailRedirectTo: `${window.location.origin}${BASE_PATH}/` })
    setBusy(false)
    if (error) return setAcctNote({ ok: false, text: /rate limit|too many/i.test(error.message) ? 'Terlalu banyak permintaan email. Coba lagi beberapa menit lagi.' : /already|registered/i.test(error.message) ? 'Email sudah dipakai akun lain.' : `Gagal mengubah email: ${toUserFacingError(error, { fallback: 'Email belum dapat diubah. Coba kembali.' })}` })
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
    setMsg(error ? `Gagal: ${toUserFacingError(error, { fallback: 'Data belum dapat disimpan. Periksa koneksi dan hak akses, lalu coba kembali.' })}` : 'Profil berhasil disimpan.')
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
        : `Gagal menyimpan unit: ${toUserFacingError(error, { fallback: 'Unit belum dapat disimpan.' })}`)
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
    if (error) { setMsg(`Gagal mengubah status unit: ${toUserFacingError(error, { fallback: 'Status unit belum dapat diubah.' })}`); return }
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
      setMsg(`Gagal menyimpan: ${toUserFacingError(error, { fallback: 'Perubahan akun belum dapat disimpan.' })}`)
      setRowNote({ id: u.user_id, ok: false, text: toUserFacingError(error, { fallback: 'Perubahan akun belum dapat disimpan.' }) })
    } else {
      const text = 'is_active' in patch ? (patch.is_active ? `${u.full_name} diaktifkan. Akun sudah bisa login.` : `${u.full_name} dinonaktifkan.`) : `Perubahan untuk ${u.full_name} disimpan.`
      setMsg(text)
      setRowNote({ id: u.user_id, ok: true, text })
      loadUsers()
    }
  }

  const deleteUser = async (u: Profile) => {
    // Single-account deletion remains available as a guarded fallback for existing admin workflows.
    setBusy(true)
    setMsg('')
    const { error } = await sb.rpc('aureka_admin_delete_user', { p_user_id: u.user_id })
    setBusy(false)
    setConfirmDeleteId(null)
    if (error) {
      const text = error.message || ''
      let note = `Gagal menghapus: ${toUserFacingError(error, { fallback: 'Akun belum dapat dihapus.' })}`
      if (/USER_HAS_DATA/.test(text)) note = 'Akun ini sudah memiliki data operasional sehingga tidak dihapus agar data tetap utuh. Gunakan “Nonaktifkan”.'
      else if (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(text)) note = 'Fitur hapus akun belum aktif di database.'
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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_-+'
    const buf = new Uint32Array(20)
    crypto.getRandomValues(buf)
    setTempPw(Array.from(buf, (n) => chars[n % chars.length]).join(''))
  }

  const setUserPassword = async (u: Profile) => {
    const pwd = tempPw.trim()
    if (pwd.length < 12) { setRowNote({ id: u.user_id, ok: false, text: 'Password sementara minimal 12 karakter.' }); return }
    setBusy(true)
    setMsg('')
    const { data: resetResult, error } = await sb.functions.invoke('aureka-admin-reset-unit-password', { body: { user_id: u.user_id, new_password: pwd } })
    setBusy(false)
    if (error) {
      // Edge Function mengirim rincian otorisasi/validasi di body respons, bukan selalu di error.message.
      let serverText = ''
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        try {
          const payload = await context.clone().json() as { error?: unknown }
          serverText = typeof payload.error === 'string' ? payload.error : ''
        } catch { /* respons tidak selalu JSON */ }
      }
      const detail = serverText || error.message || ''
      let note = serverText
        ? `Gagal menyetel password: ${serverText}`
        : `Gagal menyetel password: ${toUserFacingError(error, { fallback: 'Password sementara belum dapat disetel.' })}`
      if ((context && context.status === 404) || (error as { name?: string }).name === 'FunctionsFetchError') {
        note = 'Fitur reset password belum aktif di server. Minta pemilik Supabase men-deploy Edge Function "aureka-admin-reset-unit-password".'
      } else if (/PASSWORD_TOO_SHORT/.test(detail)) {
        note = 'Password sementara minimal 12 karakter.'
      }
      setMsg(note)
      setRowNote({ id: u.user_id, ok: false, text: note })
      return
    }
    setTempPwDone({ id: u.user_id, pw: pwd })
    setTempPw('')
    // Password reset server-side marks the account as must_change_password.
    const text = `Password sementara untuk ${u.full_name} sudah disetel. Pengguna wajib membuat password baru saat login berikutnya.`
    setRowNote({ id: u.user_id, ok: true, text })
  }

  const sendResetEmail = async (u: Profile) => {
    if (!u.email) { setRowNote({ id: u.user_id, ok: false, text: 'Akun ini tidak memiliki email.' }); return }
    setBusy(true)
    setMsg('')
    const redirectTo = `${window.location.origin}${BASE_PATH}/`
    const { error } = await sb.auth.resetPasswordForEmail(u.email, { redirectTo })
    setBusy(false)
    const text = error
      ? `Gagal mengirim email reset: ${/rate limit|too many/i.test(error.message) ? 'terlalu banyak permintaan, coba lagi beberapa menit lagi.' : toUserFacingError(error, { fallback: 'Email reset belum dapat dikirim.' })}`
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
        : /USERNAME_TAKEN/.test(t) ? 'Username sudah dipakai akun lain.' : /EMAIL_TAKEN/.test(t) ? 'Email sudah dipakai akun lain.' : /USERNAME_INVALID/.test(t) ? 'Username tidak valid.' : /EMAIL_INVALID/.test(t) ? 'Format email tidak valid.' : `Gagal menyimpan: ${toUserFacingError(error, { fallback: 'Identitas akun belum dapat disimpan.' })}`
      setMsg(note); setRowNote({ id: u.user_id, ok: false, text: note }); return
    }
    let text = 'Username & email disimpan.'
    if (data === 'verify') {
      const r = await sb.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: `${window.location.origin}${BASE_PATH}/` } })
      text = r.error
        ? `Email diubah ke ${em}, tetapi email verifikasi gagal dikirim (${/rate limit|too many/i.test(r.error.message) ? 'batas pengiriman email, coba “Kirim ulang” nanti' : toUserFacingError(r.error, { fallback: 'Email verifikasi belum dapat dikirim.' })}).`
        : `Email diubah ke ${em}. Link verifikasi dikirim; ${u.full_name} perlu klik link tersebut sebelum bisa login.`
    } else if (data === 'changed') text = `Email diubah ke ${em} tanpa verifikasi.`
    setBusy(false)
    setMsg(text); setRowNote({ id: u.user_id, ok: true, text })
    loadUsers()
  }

  const resendVerification = async (u: Profile) => {
    if (!u.email) return
    setBusy(true)
    const r = await sb.auth.resend({ type: 'signup', email: u.email, options: { emailRedirectTo: `${window.location.origin}${BASE_PATH}/` } })
    setBusy(false)
    const text = r.error ? (/already|confirmed/i.test(r.error.message) ? 'Email akun ini sudah terverifikasi.' : `Gagal mengirim: ${toUserFacingError(r.error, { fallback: 'Email verifikasi belum dapat dikirim.' })}`) : `Email verifikasi dikirim ulang ke ${u.email}.`
    setRowNote({ id: u.user_id, ok: !r.error, text })
  }

  const fmtDate = (v?: string | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const pwStrength = (v: string) => {
    if (!v) return 0
    let n = 0
    if (v.length >= 6) n++
    if (v.length >= 10) n++
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) n++
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) n++
    return Math.max(1, n)
  }
  const sendResetLink = async () => {
    setPwMsg(null)
    const { data: authUser } = await sb.auth.getUser()
    const email = authUser.user?.email || me?.email || profile?.email
    if (!email) return setPwMsg({ ok: false, text: 'Email akun tidak ditemukan. Hubungi Super Admin untuk reset password.' })
    setResetBusy(true)
    const redirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
    const { error } = await sb.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
    setResetBusy(false)
    if (error) return setPwMsg({ ok: false, text: `Link reset belum terkirim: ${toUserFacingError(error, { fallback: 'Coba lagi beberapa saat.' })}` })
    const masked = email.replace(/^(.{2}).*(@.*)$/, '$1•••$2')
    setPwMsg({ ok: true, text: `Link untuk membuat password baru sudah dikirim ke ${masked}. Cek kotak masuk/spam.` })
  }

  const changePassword = async () => {
    setPwMsg(null)
    if (pw.next.length < 6) return setPwMsg({ ok: false, text: 'Password baru minimal 6 karakter.' })
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'Konfirmasi password baru tidak sama.' })
    if (pw.next === pw.current) return setPwMsg({ ok: false, text: 'Password baru harus berbeda dari password saat ini.' })
    const { data: authUser } = await sb.auth.getUser()
    const email = authUser.user?.email || me?.email || profile?.email
    if (!email) return setPwMsg({ ok: false, text: 'Email akun tidak ditemukan.' })
    setBusy(true)
    // Verifikasi password saat ini sebelum mengganti, agar sesi yang tertinggal di komputer bersama tidak bisa dipakai mengganti password.
    const check = await sb.auth.signInWithPassword({ email, password: pw.current })
    if (check.error) { setBusy(false); return setPwMsg({ ok: false, text: 'Password saat ini salah.' }) }
    const { error } = await sb.auth.updateUser({ password: pw.next })
    setBusy(false)
    if (error) return setPwMsg({ ok: false, text: `Gagal mengganti password: ${toUserFacingError(error, { fallback: 'Password belum dapat diperbarui.' })}` })
    setPw({ current: '', next: '', confirm: '' })
    setPwMsg({ ok: true, text: 'Password berhasil diganti. Gunakan password baru saat login berikutnya.' })
  }

  useEffect(() => {
    if (section !== 'mydata') return
    let cancelled = false
    const roomId = me?.primary_room_id ?? null
    const roomName = rooms.find((r) => r.id === roomId)?.name || ''
    const anySb = sb as any
    const norm = (value: unknown) => String(value || '').trim().toLowerCase()
    const safeRead = async <T,>(promise: Promise<T>) => {
      try {
        return { data: await promise, error: null as unknown }
      } catch (error) {
        return { data: null as T | null, error }
      }
    }

    const riskPromise = roomId == null
      ? Promise.resolve([] as any[])
      : Promise.all([
          readAllPages<any>((from, to) => anySb.schema('aureka_risk').from('risk_register')
            .select('id,unit_id,unit_name,risk_level')
            .eq('unit_id', roomId)
            .order('id', { ascending: true })
            .range(from, to)),
          readAllPages<any>((from, to) => anySb.schema('aureka_risk').from('risk_register')
            .select('id,unit_id,unit_name,risk_level')
            .is('unit_id', null)
            .order('id', { ascending: true })
            .range(from, to)),
        ]).then(([unitRisks, legacyRisks]) => [
          ...unitRisks,
          ...legacyRisks.filter((risk) => norm(risk.unit_name) === norm(roomName)),
        ])

    void Promise.all([
      safeRead(riskPromise),
      safeRead(!me?.user_id ? Promise.resolve([] as any[]) : readAllPages<any>((from, to) => anySb.schema('aureka_patient_safety')
        .from('incidents')
        .select('id,status,created_by')
        .eq('created_by', me.user_id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to))),
      safeRead(roomId == null ? Promise.resolve([] as any[]) : readAllPages<any>((from, to) => anySb.schema('aureka_quality')
        .from('quality_records')
        .select('id,room_id')
        .eq('profile_year', new Date().getFullYear())
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to))),
    ]).then(([r, i, q]: any[]) => {
      if (cancelled) return
      const mineRisk = r.data || []
      setMyData({
        risks: r.error ? null : mineRisk.length,
        highRisks: r.error ? null : mineRisk.filter((x: any) => x.risk_level === 'Tinggi' || x.risk_level === 'Sangat Tinggi').length,
        incidents: i.error ? null : (i.data || []).length,
        openIncidents: i.error ? null : (i.data || []).filter((x: any) => x.status !== 'closed').length,
        quality: q.error ? null : (q.data || []).length,
      })
    })
    return () => { cancelled = true }
  }, [section, me?.primary_room_id, me?.user_id, rooms])

  const roleLabel = friendlyRole(roleMeta) !== '—' ? friendlyRole(roleMeta) : effectiveRole === 'ADMIN' ? 'Super Admin' : (role || '—')

  return (
    <div className="settingsWorkspace" style={{ display: 'grid', gap: 14 }}>
      {msg && (
        <div className={`aurToast ${msgIsError ? 'error' : 'ok'}`} role={msgIsError ? 'alert' : 'status'} aria-live={msgIsError ? 'assertive' : 'polite'}>
          <span className="aurToastIcon" aria-hidden="true">{msgIsError ? '!' : '✓'}</span>
          <span className="aurToastText">{msg}</span>
          <button type="button" onClick={() => setMsg('')} aria-label="Tutup notifikasi">×</button>
        </div>
      )}
      <div className="stLayout">
      <nav className="stNav" aria-label="Menu pengaturan">
        <div className="stNavProfile">
          <span className="stAvatar" aria-hidden="true">{(me?.full_name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
          <span className="stNavWho"><b>{me?.full_name || 'Akun AUREKA'}</b><small>{roleLabel}</small></span>
        </div>
        {([
          ['general', 'profile', 'Akun & Akses', 'profile', true],
          ['general', 'security', 'Keamanan & Password', 'lock', true],
          ['appearance', null, 'Tampilan', 'palette', true],
          ['general', 'units', 'Unit & Instalasi', 'unit', isAdmin],
          ['users', null, 'Pengguna & Role', 'users', isAdmin],
          ['permissions', null, 'Hak Akses Role', 'lock', ['ADMIN', 'DIREKTUR', 'PMKP'].includes(effectiveRole || '')],
          ['system', null, 'Konfigurasi Sistem', 'unit', isAdmin],
          ['mydata', null, 'Data Saya untuk PMKP', 'data', !isAdmin],
        ] as const).filter(item => item[4]).map(([sec, t, label, icon]) => {
          const current = section === sec && (t === null || tab === t)
          return <button key={label} type="button" id={t ? 'settings-tab-' + t : undefined} className={'stNavItem settingsDestination' + (current ? ' on' : '')} aria-current={current ? 'page' : undefined}
            onClick={() => { setSection(sec); if (t) setTab(t) }}>
            <span className="stNavIcon"><SettingsIcon kind={icon} /></span><span>{label}</span>
          </button>
        })}
      </nav>
      <div className="stMain">
      <WorkspaceModuleHeader title="Pengaturan" />
      {section === 'appearance' && <AppearancePanel />}
      {section === 'system' && <SystemConfigPanel />}
      {section === 'permissions' && <PermissionMatrixPanel />}

      {section === 'general' && (
        <>
          <LiquidGlass className="stHeroCard">
            <span className="stAvatar lg" aria-hidden="true">{(me?.full_name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
            <div className="stHeroText">
              <h3>{me?.full_name || 'Akun AUREKA'}</h3>
              <p>{me?.email || 'Akun AUREKA'}</p>
              <div className="stChips">
                <span className="stChip">{roleLabel}</span>
                <span className="stChip">{rooms.find((r) => r.id === me?.primary_room_id)?.name || 'Unit belum dipetakan'}</span>
                <span className={'stChip ' + (me?.is_active ? 'ok' : 'warn')}>{me?.is_active ? 'Akun aktif' : 'Akun nonaktif'}</span>
              </div>
            </div>
          </LiquidGlass>


          <div id="settings-active-panel" role="tabpanel" aria-labelledby={'settings-tab-' + tab} tabIndex={0} className="settingsActivePanel">
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
                </label>
              </div>
              <div style={{ marginTop: 14 }}>
                <LiquidGlassButton onClick={saveMe} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Profil'}</LiquidGlassButton>
              </div>
            </LiquidGlass>
          )}

          {tab === 'profile' && (<>
            <LiquidGlass className="pwShortcutCard" style={{ padding: 18 }}>
                <div className="pwHead" style={{ marginBottom: 12 }}>
                  <span className="pwHeadIcon" aria-hidden="true"><SettingsIcon kind="lock" /></span>
                  <div><h4>Password</h4><p>Ganti password akun Anda sendiri. Lupa password lama? Bisa kirim link reset ke email.</p></div>
                </div>
                <button type="button" className="uBtn primary" onClick={() => { setSection('general'); setTab('security'); window.setTimeout(() => document.getElementById('aureka-password-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}>Ubah password</button>
              </LiquidGlass>
              <LiquidGlass style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 4px' }}>Username & Email Login</h4>
              <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 12 }}>Login bisa memakai username atau email. Email dipakai untuk verifikasi dan reset password, jadi pastikan email aktif.</p>
              {!myAccount.supported && <div className="userRowNote error" style={{ marginBottom: 10 }}>Fitur username belum tersedia.</div>}
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
              {acctNote && <div className={`userRowNote ${acctNote.ok ? 'ok' : 'error'}`} role={acctNote.ok ? 'status' : 'alert'} aria-live={acctNote.ok ? 'polite' : 'assertive'} style={{ marginTop: 10 }}>{acctNote.text}</div>}
            </LiquidGlass>
          </>)}

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

              {isAdmin && !roomsSupported && <div className="userRowNote error" style={{ marginTop: 12 }}>Fitur tambah/edit unit belum tersedia.</div>}

              <AurekaModal open={Boolean(roomEdit)} size="md" title={roomEdit?.id ? 'Edit unit' : 'Unit baru'} subtitle="Unit dipakai untuk hak akses, logbook, dan laporan." closeDisabled={busy} onClose={() => setRoomEdit(null)}>
              {roomEdit && (
                <div className="roomEditor akModalEditor">
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
              </AurekaModal>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                <input className="adminLocalSearch" type="search" name="aureka-admin-room-filter" autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" aria-label="Cari unit kerja" placeholder="Cari unit…" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} style={{ maxWidth: 320, flex: '1 1 200px' }} />
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

          {tab === 'security' && (
            <LiquidGlass style={{ padding: 18 }}>
              <div id="aureka-password-form" className="pwHead">
                <span className="pwHeadIcon" aria-hidden="true"><SettingsIcon kind="lock" /></span>
                <div><h4>Ubah Password Saya</h4><p>Ganti password akun Anda sendiri kapan saja. Berlaku untuk login berikutnya.</p></div>
              </div>
              <div className="pwForm">
                <label className="field"><span>Password saat ini</span><input type={pwShow ? 'text' : 'password'} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
                <label className="field"><span>Password baru (min. 6 karakter)</span><input type={pwShow ? 'text' : 'password'} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
                <label className="field"><span>Ulangi password baru</span><input type={pwShow ? 'text' : 'password'} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
              </div>
              {pw.next && (() => { const lv = pwStrength(pw.next); const label = ['', 'Lemah', 'Cukup', 'Baik', 'Kuat'][lv]; return (
                <div className={'pwMeter lv' + lv} aria-live="polite"><span className="pwMeterBar"><i style={{ width: lv * 25 + '%' }} /></span><small>Kekuatan: {label}{pw.confirm && pw.confirm !== pw.next ? ' · konfirmasi belum sama' : pw.confirm ? ' · konfirmasi cocok ✓' : ''}</small></div>
              ) })()}
              <label className="pwShowToggle"><input type="checkbox" checked={pwShow} onChange={(e) => setPwShow(e.target.checked)} /> Tampilkan password</label>
              {pwMsg && <p className={pwMsg.ok ? 'pwMsg ok' : 'pwMsg'} role={pwMsg.ok ? 'status' : 'alert'} aria-live={pwMsg.ok ? 'polite' : 'assertive'}>{pwMsg.text}</p>}
              <div style={{ marginTop: 10, marginBottom: 18 }}>
                <LiquidGlassButton onClick={changePassword} disabled={busy || !pw.current || !pw.next || !pw.confirm}>{busy ? 'Memproses…' : 'Simpan password baru'}</LiquidGlassButton>
              </div>
              <p className="pwForgot">Lupa password saat ini? <button type="button" className="uBtn outline sm" disabled={resetBusy} onClick={sendResetLink}>{resetBusy ? 'Mengirim…' : 'Kirim link reset ke email saya'}</button></p>
              <h4 style={{ margin: '0 0 12px' }}>Keamanan & Session</h4>
              <div style={{ display: 'grid', gap: 9 }}>
                {[
                  ['Authentication', 'Supabase Auth'],
                  ['Session', 'Persistent session + automatic refresh'],
                  ['Authorization', `Role-based access · ${roleLabel}`],
                  ['Password', 'Dikelola oleh Supabase Auth, bukan disimpan di halaman Pengaturan.'],
                  ['Kepadatan tampilan', 'Gunakan tombol Nyaman / Ringkas di atas area kerja.'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: 11, borderRadius: 14, background: 'rgba(255,255,255,.22)', border: '1px solid rgba(255,255,255,.48)' }}>
                    <b style={{ fontSize: 10 }}>{label}</b>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </LiquidGlass>
          )}
          </div>
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
            <div className="eyebrow">Manajemen pengguna</div>
            <h3 style={{ margin: '5px 0 4px', fontSize: 24 }}>Pengguna dan akun unit</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 10 }}>
              Kelola role, unit utama, status, dan penggantian password untuk akun AUREKA.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <input className="adminLocalSearch" type="search" name="aureka-admin-user-filter" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" aria-label="Cari pengguna berdasarkan nama, username, email, atau unit" placeholder="Cari nama / username / email / unit…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360, flex: '1 1 220px' }} />
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
                      <span className="userEmail">{u.username ? <b className="userHandle">@{u.username}</b> : null}{u.username ? ' · ' : ''}{u.email || '—'}{u.must_change_password ? <b style={{ marginLeft: 6, color: '#946b20' }}>· Wajib ganti password</b> : null}</span>
                    </div>

                    <select
                      aria-label={`Unit utama untuk ${u.full_name || u.email || 'pengguna'}`}
                      value={u.primary_room_id || ''}
                      onChange={(e) => updateUser(u, { primary_room_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Unit belum dipetakan</option>
                      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>

                    <select aria-label={`Role untuk ${u.full_name || u.email || 'pengguna'}`} value={u.role_id || ''} onChange={(e) => updateUser(u, { role_id: e.target.value || null })}>
                      <option value="">Role belum dipetakan</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{friendlyRole(r)}</option>)}
                    </select>

                    <div className="userActions">
                    <button type="button" className={detailId === u.user_id ? 'uBtn outline active' : 'uBtn outline'} aria-expanded={detailId === u.user_id}
                      title="Lihat & ubah data akun, reset password" onClick={() => openDetail(u)}>
                        Detail
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
                        Hapus
                      </button>
                    ))}
                    </div>
                  </div>
                  {rowNote?.id === u.user_id && <div className={`userRowNote ${rowNote.ok ? 'ok' : 'error'}`} role={rowNote.ok ? 'status' : 'alert'} aria-live={rowNote.ok ? 'polite' : 'assertive'}>{rowNote.text}</div>}
                  {detailId === u.user_id && typeof document !== 'undefined' && createPortal(
                    <div className="moduleEnter settingsWorkspace aurModalLayer"><div className="rmModalBackdrop" role="presentation" onKeyDown={(e) => { if (e.key === 'Escape') setDetailId(null) }}>
                    <section className="rmModalSheet userDetailSheet" role="dialog" aria-modal="true" aria-label={`Detail akun ${u.full_name || u.email || ''}`}>
                    <div className="userDetailHead"><div><span>DETAIL AKUN</span><h4>{u.full_name || u.username || u.email || 'Pengguna'}</h4><p>{u.username ? '@' + u.username + ' · ' : ''}{u.email || 'Email belum diisi'}</p></div><button type="button" className="uBtn outline" autoFocus onClick={() => setDetailId(null)}>Tutup</button></div>
                    {rowNote?.id === u.user_id && <div className={`userRowNote ${rowNote.ok ? 'ok' : 'error'}`} role={rowNote.ok ? 'status' : 'alert'}>{rowNote.text}</div>}
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
                          <button type="button" className="uBtn outline" disabled={busy || !u.email} onClick={() => resendVerification(u)}>Kirim ulang verifikasi</button>
                        </div>
                        <p className="userDetailHint">Unit dan role diubah lewat pilihan di baris atas. User login memakai username atau email.</p>
                      </div>
                      <div className="userDetailCol">
                        <h5>Reset password <span>untuk user yang lupa password</span></h5>
                        <p className="userDetailHint" style={{ marginTop: 0 }}><b>Cara 1 — Password sementara.</b> Buat password baru, lalu sampaikan ke user (WA/langsung). Akun dan datanya tetap utuh.</p>
                        <div className="userDetailInline">
                          <input aria-label={`Password sementara untuk ${u.full_name || u.email || 'pengguna'}`} placeholder="Password sementara (min. 12 karakter)" value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="new-password" />
                          <button type="button" className="uBtn outline" onClick={generateTempPw} title="Buat password acak">Buat acak</button>
                        </div>
                        <button type="button" className="uBtn primary" style={{ marginTop: 8 }} disabled={busy || tempPw.trim().length < 12} onClick={() => setUserPassword(u)}>
                          {busy ? 'Menyimpan…' : 'Setel password sementara'}
                        </button>
                        {tempPwDone?.id === u.user_id && (
                          <div className="userTempPw">
                            <span>Password baru {u.full_name}:</span>
                            <code>{tempPwDone.pw}</code>
                            <button type="button" className="uBtn ghost" onClick={() => { navigator.clipboard?.writeText(tempPwDone.pw); setRowNote({ id: u.user_id, ok: true, text: 'Password disalin.' }) }}>Salin</button>
                          </div>
                        )}
                        <p className="userDetailHint"><b>Cara 2 — Email reset.</b> User menerima tautan di email untuk membuat password sendiri.</p>
                        <button type="button" className="uBtn outline" disabled={busy || !u.email} onClick={() => sendResetEmail(u)}>Kirim email reset password</button>
                      </div>
                    </div>
                    </section></div></div>,
                    document.querySelector('.workspaceRoot') || document.body
                  )}
                </div>
              ))}
              {!filtered.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 10 }}>Tidak ada pengguna yang cocok.</div>}
            </div>
          </LiquidGlass>
        </>
      )}
      </div>
      </div>
    </div>
  )
}


function AppearancePanel() {
  const [mode, setMode] = useState<'terang' | 'gelap'>(() => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-mode') === 'gelap') ? 'gelap' : 'terang')
  const choose = (next: 'terang' | 'gelap') => {
    setMode(next)
    document.documentElement.setAttribute('data-mode', next)
    try { localStorage.setItem('aureka-mode', next) } catch { /* abaikan */ }
    window.dispatchEvent(new CustomEvent('aureka-mode-change', { detail: next }))
  }
  return (
    <LiquidGlass className="stPanel">
      <h4>Tampilan</h4>
      <p className="stPanelHint">Pilihan disimpan di perangkat ini.</p>
      <div className="stModeGrid" role="radiogroup" aria-label="Mode tampilan">
        {([['terang', 'Terang', 'Kaca es, cocok untuk siang hari'], ['gelap', 'Gelap', 'Kaca malam, nyaman di ruangan redup']] as const).map(([value, label, hint]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} className={'stMode ' + value + (mode === value ? ' on' : '')} onClick={() => choose(value)}>
            <span className="stModePreview" aria-hidden="true"><i /><i /><i /></span>
            <b>{label}</b><small>{hint}</small>
          </button>
        ))}
      </div>
      <PreferenceExtras />
    </LiquidGlass>
  )
}

/** Preferensi per perangkat: ukuran teks & animasi (Blueprint v2 §1 · Preferensi Tampilan). */
function PreferenceExtras() {
  const read = (k: string, d: string) => { try { return localStorage.getItem(k) || d } catch { return d } }
  const [size, setSize] = useState(() => (typeof window === 'undefined' ? 'normal' : read('aureka-text-size', 'normal')))
  const [motion, setMotion] = useState(() => (typeof window === 'undefined' ? 'on' : read('aureka-motion', 'on')))
  const apply = (k: string, attr: string, v: string, def: string) => {
    try { localStorage.setItem(k, v) } catch { /* abaikan */ }
    if (v === def) document.documentElement.removeAttribute(attr); else document.documentElement.setAttribute(attr, v)
  }
  return (
    <div className="stPrefExtras">
      <div className="stPrefRow"><div><b>Ukuran teks</b><small>Memperbesar seluruh teks dan kontrol aplikasi di perangkat ini.</small></div>
        <div className="govSegment" role="radiogroup" aria-label="Ukuran teks">{([['normal', 'Normal'], ['besar', 'Besar'], ['sangat-besar', 'Sangat besar']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={size === v} className={size === v ? 'active' : ''} onClick={() => { setSize(v); apply('aureka-text-size', 'data-text-size', v, 'normal') }}>{l}</button>)}</div></div>
      <div className="stPrefRow"><div><b>Animasi</b><small>Matikan bila perangkat terasa lambat atau Anda lebih suka tampilan tanpa gerakan.</small></div>
        <div className="govSegment" role="radiogroup" aria-label="Animasi">{([['on', 'Aktif'], ['off', 'Nonaktif']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={motion === v} className={motion === v ? 'active' : ''} onClick={() => { setMotion(v); apply('aureka-motion', 'data-motion', v, 'on') }}>{l}</button>)}</div></div>
    </div>
  )
}
