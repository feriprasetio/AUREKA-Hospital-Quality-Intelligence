'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const q = () => aurekaSupabase.schema('aureka_quality')

type Room = { id: number; name: string }
type DirectoryStaff = {
  id: string
  employee_code: string
  display_name: string
  profession_group: string
  position_title: string
  source_unit: string
  staff_group: string
  directory_status: 'available' | 'needs_review' | 'inactive'
  already_locked_here: boolean
}
type Assignment = {
  id: string
  staff_id: string
  room_id: number
  assignment_status: 'active' | 'released'
  is_locked: boolean
  assigned_at: string
  assigned_user_id: string
}

export default function StaffTeamWorkspace({
  initialRoomId,
  rooms,
  isSuperAdmin,
  canManageAllRooms,
}: {
  initialRoomId: number | null
  rooms: Room[]
  isSuperAdmin: boolean
  canManageAllRooms: boolean
}) {
  const canChooseRoom = isSuperAdmin || canManageAllRooms
  const canRelease = isSuperAdmin || canManageAllRooms
  const [roomId, setRoomId] = useState<number>(() => Number(initialRoomId || (canChooseRoom ? rooms[0]?.id : 0) || 0))
  const [directory, setDirectory] = useState<DirectoryStaff[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (canChooseRoom && !roomId && rooms[0]?.id) setRoomId(Number(rooms[0].id))
    else if (!canChooseRoom && initialRoomId) setRoomId(Number(initialRoomId))
  }, [canChooseRoom, initialRoomId, roomId, rooms])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    // Clear any previous unit's data before fetching a new scope.
    setDirectory([]); setAssignments([])
    try {
      if (!roomId) {
        setDirectory([])
        setAssignments([])
        throw new Error('Pilih unit kerja yang diizinkan untuk memuat roster.')
      }
      // The database RPC deliberately omits staff locked to other teams.
      const { data: directoryRows, error: directoryError } = await q().rpc('list_assignable_staff', { p_room_id: roomId })
      if (directoryError) throw new Error('Daftar tenaga yang dapat dipetakan: ' + directoryError.message)
      setDirectory((directoryRows || []) as DirectoryStaff[])
      const { data: assignmentRows, error: assignmentError } = await q().from('staff_team_assignments')
        .select('id,staff_id,room_id,assignment_status,is_locked,assigned_at,assigned_user_id')
        .eq('room_id', roomId)
        .eq('assignment_status', 'active')
        .order('assigned_at', { ascending: true })
      if (assignmentError) throw new Error('Daftar tim: ' + assignmentError.message)
      setAssignments((assignmentRows || []) as Assignment[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar tim.')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => { void load() }, [load])

  const roomName = rooms.find((room) => Number(room.id) === Number(roomId))?.name || 'Unit belum dipilih'
  const rosterIds = useMemo(() => new Set(assignments.map((item) => item.staff_id)), [assignments])
  const availableToChoose = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id')
    return directory.filter((staff) => {
      if (staff.directory_status !== 'available' || staff.already_locked_here || rosterIds.has(staff.id)) return false
      if (!term) return true
      return [staff.display_name, staff.employee_code, staff.profession_group, staff.position_title, staff.source_unit, staff.staff_group]
        .some((value) => String(value || '').toLocaleLowerCase('id').includes(term))
    })
  }, [directory, search, rosterIds])
  const roster = useMemo(() => {
    const index = new Map(directory.map((staff) => [staff.id, staff]))
    return assignments.map((assignment) => ({ assignment, staff: index.get(assignment.staff_id) }))
      .filter((item) => !!item.staff)
      .sort((a, b) => (a.staff?.display_name || '').localeCompare(b.staff?.display_name || '', 'id'))
  }, [assignments, directory])

  const addStaff = async () => {
    if (busy) return
    if (!roomId) { setError('Pilih unit kerja terlebih dahulu.'); return }
    if (!selectedStaffId) { setError('Pilih satu tenaga dari direktori AUREKA.'); return }
    const staff = directory.find((item) => item.id === selectedStaffId)
    if (!staff || staff.directory_status !== 'available') { setError('Tenaga ini belum siap ditetapkan. Periksa status verifikasinya.'); return }
    if (rosterIds.has(staff.id)) { setError('Tenaga sudah ada pada tim ini.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
      const { error: insertError } = await q().from('staff_team_assignments').insert({
        staff_id: staff.id,
        room_id: roomId,
        assigned_user_id: authData.user.id,
        assigned_by: authData.user.id,
        assignment_status: 'active',
        is_locked: true,
      })
      if (insertError) {
        if (insertError.code === '23505' || /staff_team_one_active_assignment_uq|duplicate key/i.test(insertError.message)) {
          throw new Error('Nama ini sudah terkunci pada tim lain atau sudah pernah ditetapkan. Pemetaan tidak diubah otomatis; minta Super Admin/Komite PMKP memeriksa penetapannya.')
        }
        throw new Error(insertError.message)
      }
      setMessage(`${staff.display_name} berhasil ditetapkan pada tim ${roomName}. Identitas dikunci agar tidak dapat diambil oleh unit lain.`)
      setSelectedStaffId('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Penetapan tenaga ke tim gagal.')
    } finally {
      setBusy(false)
    }
  }

  const releaseStaff = async (assignment: Assignment, staff?: DirectoryStaff) => {
    if (busy || !canRelease) return
    const name = staff?.display_name || assignment.staff_id
    if (!window.confirm(`Lepaskan ${name} dari tim ${roomName}? Tenaga ini baru dapat dipetakan ke tim lain setelah pelepasan tercatat.`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
      const { error: releaseError } = await q().from('staff_team_assignments').update({
        assignment_status: 'released',
        is_locked: false,
        released_at: new Date().toISOString(),
        released_by: authData.user.id,
        release_note: 'Pelepasan tim oleh pengelola yang berwenang.',
      }).eq('id', assignment.id).eq('assignment_status', 'active')
      if (releaseError) throw new Error(releaseError.message)
      setMessage(`${name} dilepaskan dari tim ${roomName}. Jejak perubahan tersimpan pada audit trail.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pelepasan tenaga gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staffTeam">
      <style>{`
        .staffTeam{display:grid;gap:14px;min-width:0}
        .stPanel{padding:18px 20px;border:1px solid rgba(255,255,255,.74);border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.56),rgba(255,255,255,.26));box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.8);backdrop-filter:blur(22px) saturate(150%)}
        .stEyebrow{font-size:9px;letter-spacing:.15em;text-transform:uppercase;font-weight:900;color:var(--accent,#0f7656)}
        .stTitle{font-size:23px;letter-spacing:-.04em;font-weight:950;margin:5px 0;color:var(--text,#20372d)}
        .stDesc{font-size:11px;line-height:1.6;color:var(--muted,#64756b);max-width:820px;margin:0}
        .stHead{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;flex-wrap:wrap}
        .stBtn{border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.56);color:var(--text,#20372d);border-radius:12px;padding:10px 13px;font-size:11px;font-weight:900;cursor:pointer;min-height:40px}
        .stBtn.primary{background:linear-gradient(135deg,var(--accent,#0f7656),var(--accent2,#084f3a));color:#fff;border-color:transparent}
        .stBtn:disabled{opacity:.55;cursor:wait}
        .stForm{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(260px,1.5fr) auto;gap:9px;margin-top:15px;align-items:end}
        .stField{display:grid;gap:6px;color:var(--muted,#64756b);font-size:10px;font-weight:850}
        .stField input,.stField select{width:100%;min-width:0;min-height:42px;border-radius:12px;border:1px solid rgba(35,63,50,.14);background:rgba(255,255,255,.76);padding:10px 12px;font-size:12px;color:var(--text,#20372d)}
        .stKpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}
        .stKpi{padding:12px;border:1px solid rgba(255,255,255,.74);background:rgba(255,255,255,.32);border-radius:15px}
        .stKpi span{font-size:9px;font-weight:850;color:var(--muted,#64756b);display:block}.stKpi strong{font-size:22px;color:var(--text,#20372d);display:block;margin-top:3px}
        .stNotice{padding:10px 12px;border-radius:12px;background:rgba(15,118,86,.08);border:1px solid rgba(15,118,86,.14);font-size:11px;line-height:1.5;color:var(--text,#20372d);margin-top:10px}
        .stError{padding:10px 12px;border-radius:12px;background:#fff0ef;border:1px solid #f3c6c1;color:#97372e;font-size:11px;line-height:1.5;margin-top:10px}
        .stRows{display:grid;gap:9px}.stRow{display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(150px,.75fr) minmax(190px,1.3fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.82);border-radius:15px;background:rgba(255,255,255,.38)}
        .stName{font-size:12px;font-weight:900;color:var(--text,#20372d)}.stSub{font-size:9px;line-height:1.45;color:var(--muted,#64756b);margin-top:3px}
        .stCode{display:inline-flex;border-radius:9px;padding:5px 7px;background:rgba(15,118,86,.09);color:var(--accent2,#084f3a);font-size:9px;font-weight:950}
        .stLock{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:900;border-radius:999px;padding:6px 8px;background:#dcf4e7;color:#16643e;white-space:nowrap}
        .stRelease{border:1px solid #e2c9c6;background:#fff5f4;color:#8c3931;border-radius:9px;padding:7px 9px;font-size:9px;font-weight:900;cursor:pointer}
        .stEmpty{padding:28px;text-align:center;color:var(--muted,#64756b);font-size:12px}
        @media(max-width:900px){.stForm{grid-template-columns:1fr 1fr}.stForm .stBtn{grid-column:1/-1}.stRow{grid-template-columns:1fr 1fr}.stRow > :last-child{justify-self:start}}
        @media(max-width:560px){.stPanel{padding:14px}.stForm{grid-template-columns:1fr}.stForm .stBtn{grid-column:auto}.stKpis{grid-template-columns:1fr}.stRow{grid-template-columns:1fr;gap:8px}.stTitle{font-size:21px}}
      `}</style>

      <div className="stPanel">
        <div className="stHead">
          <div>
            <div className="stEyebrow">AUREKA · Identitas Terpadu</div>
            <h3 className="stTitle">Tim Tenaga Kerja</h3>
            <p className="stDesc">Pilih tenaga dari master AUREKA untuk mengunci ke tim/unit kerja. Identitas tidak dapat ditetapkan ke dua tim aktif sekaligus. Nama dengan status perlu verifikasi belum dapat dipilih. Pelepasan atau perpindahan hanya dapat dilakukan Super Admin/Komite PMKP dan meninggalkan jejak audit.</p>
          </div>
          <button type="button" className="stBtn" onClick={() => void load()} disabled={loading || busy}>↻ Segarkan</button>
        </div>
        {canChooseRoom ? (
          <label className="stField" style={{maxWidth:520,marginTop:14}}>
            <span>Unit / tim yang dikelola</span>
            <select value={roomId || ''} disabled={loading || busy} onChange={(e) => {setSelectedStaffId('');setMessage('');setError('');setRoomId(e.target.value ? Number(e.target.value) : 0)}}>
              <option value="">Pilih unit</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="stNotice" style={{marginTop:14}}>Tim yang ditampilkan terikat pada unit akun Anda: <strong>{roomName}</strong>. Nama yang sudah terkunci pada unit lain tidak dapat diambil ulang.</div>
        )}
        <div className="stKpis">
          <div className="stKpi"><span>Anggota tim terkunci</span><strong>{assignments.length.toLocaleString('id-ID')}</strong></div>
          <div className="stKpi"><span>Kandidat yang belum terkunci</span><strong>{directory.filter((row) => row.directory_status === 'available' && !row.already_locked_here).length.toLocaleString('id-ID')}</strong></div>
          <div className="stKpi"><span>Perlindungan identitas</span><strong>Aktif</strong></div>
        </div>
        {message && <div className="stNotice" role="status">{message}</div>}
        {error && <div className="stError" role="alert">{error}</div>}
        {!loading && directory.length === 0 && <div className="stNotice">Master tenaga kerja belum tersedia pada unit ini. Super Admin perlu mengimpor CSV pada Metadata → Tenaga Kerja terlebih dahulu.</div>}
        {!loading && directory.length > 0 && availableToChoose.length === 0 && <div className="stNotice">Tidak ada kandidat yang cocok. Tenaga yang telah terkunci pada tim ini sudah tercatat di roster; tenaga yang terkunci pada unit lain sengaja tidak ditampilkan.</div>}
        <div className="stForm">
          <label className="stField stLocalSearch"><span>Cari tenaga</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama, kode, profesi, jabatan…"/></label>
          <label className="stField"><span>Tenaga yang akan ditambahkan</span>
            <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} disabled={loading || busy || !roomId}>
              <option value="">Pilih tenaga dari direktori…</option>
              {availableToChoose.map((staff) => <option key={staff.id} value={staff.id}>{staff.display_name} — {staff.employee_code} · {staff.profession_group}</option>)}
            </select>
          </label>
          <button type="button" className="stBtn primary" onClick={() => void addStaff()} disabled={loading || busy || !roomId || !selectedStaffId}>{busy ? 'Memproses…' : '＋ Kunci ke tim'}</button>
        </div>
      </div>

      <div className="stPanel">
        <div className="stHead" style={{alignItems:'center',marginBottom:13}}>
          <div><div className="stEyebrow">Daftar Tim Aktif</div><div style={{fontSize:13,fontWeight:900,marginTop:4}}>{roomName}</div></div>
          <span className="stLock">🔒 Identitas terkunci</span>
        </div>
        {loading ? <div className="stEmpty">Memuat daftar tim…</div> : roster.length ? (
          <div className="stRows">
            {roster.map(({assignment,staff}) => (
              <div className="stRow" key={assignment.id}>
                <div><div className="stName">{staff!.display_name}</div><div className="stSub"><span className="stCode">{staff!.employee_code}</span> · ID {staff!.id.slice(0,8).toUpperCase()}</div></div>
                <div><div className="stName">{staff!.profession_group}</div><div className="stSub">{staff!.staff_group || 'Kategori belum diisi'}</div></div>
                <div><div className="stName">{staff!.position_title || 'Jabatan belum dicantumkan'}</div><div className="stSub">{staff!.source_unit || 'Unit sumber belum dicantumkan'}</div></div>
                <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}><span className="stLock">🔒 Terkunci</span>{canRelease && <button type="button" className="stRelease" disabled={busy} onClick={() => void releaseStaff(assignment,staff)}>Lepaskan</button>}</div>
              </div>
            ))}
          </div>
        ) : <div className="stEmpty">Belum ada tenaga yang ditetapkan pada tim ini. Pilih tenaga di atas untuk membuat pemetaan pertama.</div>}
      </div>
    </section>
  )
}
