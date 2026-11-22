'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { readLocalDocument, makeStructuredDocx, downloadBrowserBlob, printStructuredContent } from '@/lib/aureka/local-documents'
import type { SecretariatSection } from '@/lib/aureka/module-registry'

type Room = { id: number; name: string }
type Category = 'undangan' | 'materi' | 'absensi' | 'notulensi' | 'gambar'
type ExtractionStatus = 'pending' | 'completed' | 'metadata_only' | 'manual_review' | 'failed'
type MeetingRow = {
  id: string
  register_no: number
  meeting_code: string
  title: string
  meeting_type: string
  document_date: string
  document_number: string | null
  meeting_date: string
  room_id: number | null
  organizer: string
  status: string
  created_at: string
}
type MeetingDocument = {
  id: string
  meeting_id: string
  document_type: Category
  title: string
  bucket_id: string | null
  object_path: string | null
  mime_type: string | null
  file_size_bytes: number | null
  sha256: string | null
  uploaded_at: string
  uploaded_by: string
  original_filename: string | null
  extracted_text: string
  parsed_metadata: Record<string, unknown>
  extraction_engine: string | null
  extraction_status: ExtractionStatus
  document_date: string | null
  document_number: string | null
  document_title: string | null
  extraction_error: string | null
  preview_url?: string | null
}
type RegisterDraft = {
  title: string
  document_date: string
  document_number: string
  meeting_type: string
  room_id: string
}
type FileQueueItem = { id: string; file: File; category: Category; status: 'queued' | 'processing' | 'done' | 'error'; message?: string }
type ParserResult = {
  success: boolean
  extraction_engine: string
  extraction_status: ExtractionStatus
  extracted_text: string
  parsed_metadata: {
    document_date: string | null
    document_number: string | null
    document_title: string
    detected_headings: string[]
    extracted_line_count: number
    attendance_row_count: number | null
    page_count: number | null
    document_kind: string
    [key: string]: unknown
  }
  notes: string[]
}
const db = () => aurekaSupabase.schema('aureka_system')
const maxBytes = 15 * 1024 * 1024
const categories: Array<{ id: Category; label: string; hint: string }> = [
  { id: 'undangan', label: 'Undangan', hint: 'Surat undangan, nomor surat, tanggal, perihal, dan agenda' },
  { id: 'materi', label: 'Materi', hint: 'Bahan paparan, materi rapat, modul atau dokumen pendukung' },
  { id: 'absensi', label: 'Absensi Digital', hint: 'Daftar hadir dari XLSX, CSV, PDF atau DOCX' },
  { id: 'notulensi', label: 'Notulensi', hint: 'Pembahasan, keputusan, kesimpulan dan tindak lanjut' },
  { id: 'gambar', label: 'Gambar', hint: 'Foto kegiatan, dokumentasi, atau gambar pendukung' },
]
const registerTypes = ['Undangan', 'Kegiatan', 'Pelatihan', 'Rapat', 'Sosialisasi', 'Monitoring', 'Evaluasi', 'Benchmarking', 'Lainnya']
const managerRoles = ['ADMIN', 'PMKP', 'MANAGEMENT']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Pontianak' })
const emptyDraft = (roomId: number | null): RegisterDraft => ({
  title: '', document_date: today(), document_number: '', meeting_type: 'Kegiatan', room_id: roomId == null ? '' : String(roomId),
})
const safeName = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 110) || 'berkas'
const categoryLabel = (id: Category) => categories.find((item) => item.id === id)?.label || id
const fileMime = (file: File) => {
  if (file.type) return file.type
  const ext = file.name.toLowerCase().split('.').pop()
  const mimes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv', txt: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  }
  return mimes[ext || ''] || 'application/octet-stream'
}
const inferCategory = (file: File): Category => {
  const name = file.name.toLocaleLowerCase('id-ID')
  const mime = fileMime(file)
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name) || /(foto|gambar|dokumentasi)/i.test(name)) return 'gambar'
  if (/(absen|absensi|daftar[-_ ]?hadir|attendance|presensi)/i.test(name)) return 'absensi'
  if (/(notulen|notulensi|minutes|berita[-_ ]?acara)/i.test(name)) return 'notulensi'
  if (/(undangan|invitation|surat[-_ ]?panggilan)/i.test(name)) return 'undangan'
  return 'materi'
}
const dateLabel = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value + (value.length === 10 ? 'T00:00:00' : ''))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Pontianak' })
}
const statusLabel: Record<ExtractionStatus, string> = {
  pending: 'Menunggu pembacaan', completed: 'Teks berhasil dibaca', metadata_only: 'Metadata / pratinjau saja',
  manual_review: 'Perlu pemeriksaan manual', failed: 'Pembacaan gagal',
}

export default function SecretariatWorkspace({
  section, rooms = [], initialRoomId = null, lockRoomScope = false, role = null, userId = '', userName = 'Pengguna AUREKA',
}: {
  section: SecretariatSection
  rooms?: Room[]
  initialRoomId?: number | null
  lockRoomScope?: boolean
  role?: string | null
  userId?: string
  userName?: string
}) {
  const canManage = managerRoles.includes(role || '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [showRegister, setShowRegister] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState<RegisterDraft>(() => ({ ...emptyDraft(initialRoomId), meeting_type: section === 'invitations' ? 'Undangan' : 'Kegiatan' }))
  const [activeMeeting, setActiveMeeting] = useState<MeetingRow | null>(null)
  const [metadataDraft, setMetadataDraft] = useState<RegisterDraft | null>(null)
  const [documents, setDocuments] = useState<MeetingDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category>('undangan')
  const [queue, setQueue] = useState<FileQueueItem[]>([])
  const [processingText, setProcessingText] = useState('')

  const loadRegister = useCallback(async () => {
    setLoading(true)
    let query = db().from('pmkp_meetings').select('*').order('document_date', { ascending: false }).order('register_no', { ascending: false })
    if (initialRoomId != null && lockRoomScope) query = query.eq('room_id', initialRoomId)
    const { data, error } = await query
    if (error) {
      setRows([])
      setNotice({ kind: 'error', text: 'Register Sekretariat belum dapat dimuat. Coba lagi atau hubungi administrator.' })
    } else setRows((data || []) as MeetingRow[])
    setLoading(false)
  }, [initialRoomId, lockRoomScope])

  useEffect(() => { void loadRegister() }, [loadRegister])

  useEffect(() => { setShowRegister(false) }, [section])

  useEffect(() => {
    if (!createOpen) setDraft({ ...emptyDraft(initialRoomId), meeting_type: section === 'invitations' ? 'Undangan' : 'Kegiatan' })
  }, [createOpen, initialRoomId])

  const filteredRows = useMemo(() => rows.filter((row) => {
    const haystack = [row.title, row.document_number || '', row.meeting_code, row.meeting_type, rooms.find((room) => room.id === row.room_id)?.name || ''].join(' ').toLocaleLowerCase('id-ID')
    const matchesSearch = haystack.includes(search.trim().toLocaleLowerCase('id-ID'))
    const matchesSection = section === 'invitations' ? /undangan/i.test(row.meeting_type) : true
    return matchesSearch && matchesSection
  }), [rows, rooms, search, section])

  const loadDocuments = useCallback(async (meetingId: string) => {
    setDocumentsLoading(true)
    const { data, error } = await db().from('pmkp_meeting_documents').select('*').eq('meeting_id', meetingId).order('uploaded_at', { ascending: false })
    if (error) {
      setDocuments([])
      setNotice({ kind: 'error', text: 'Daftar berkas UMANG belum dapat dimuat. ' + error.message })
      setDocumentsLoading(false)
      return
    }
    setDocuments((data || []) as MeetingDocument[])
    setDocumentsLoading(false)
  }, [])

  const openDocuments = async (row: MeetingRow) => {
    setActiveMeeting(row)
    setMetadataDraft({
      title: row.title || '', document_date: row.document_date || row.meeting_date || today(),
      document_number: row.document_number || '', meeting_type: row.meeting_type || 'Kegiatan',
      room_id: row.room_id == null ? '' : String(row.room_id),
    })
    setQueue([])
    setActiveCategory('undangan')
    setNotice(null)
    await loadDocuments(row.id)
  }

  const closeDocuments = () => {
    setActiveMeeting(null)
    setMetadataDraft(null)
    setDocuments([])
    setQueue([])
    setNotice(null)
  }

  const createDialogRef = useAccessibleDialog<HTMLElement>({ open: createOpen, onClose: () => setCreateOpen(false), closeOnEscape: !busy, lockScroll: true })
  const documentsDialogRef = useAccessibleDialog<HTMLElement>({ open: Boolean(activeMeeting && metadataDraft), onClose: closeDocuments, closeOnEscape: !busy, lockScroll: true })

  const createRegister = async () => {
    if (!canManage || !userId) return
        if (!draft.document_date) {
      setNotice({ kind: 'error', text: 'Tanggal dokumen wajib diisi.' })
      return
    }
    const selectedRoom = draft.room_id ? Number(draft.room_id) : null
    if (lockRoomScope && initialRoomId == null) {
      setNotice({ kind: 'error', text: 'Unit kerja belum dipilih untuk pencatatan Sekretariat.' })
      return
    }
    if (draft.room_id && !Number.isFinite(selectedRoom)) {
      setNotice({ kind: 'error', text: 'Unit kerja tidak valid.' })
      return
    }
    setBusy(true)
    try {
      const { data, error } = await db().from('pmkp_meetings').insert({
        title: draft.title.trim() || 'Dokumen Sekretariat',
        document_date: draft.document_date,
        document_number: draft.document_number.trim() || null,
        meeting_type: draft.meeting_type,
        meeting_date: draft.document_date,
        room_id: selectedRoom,
        organizer: userName,
        created_by: userId,
        status: 'planned',
      }).select('*').single()
      if (error) throw error
      const created = data as MeetingRow
      setCreateOpen(false)
      await loadRegister()
      await openDocuments(created)
      setNotice({ kind: 'success', text: 'Register berhasil dibuat. Unggah dokumen melalui pop-up Isi Dokumen.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Register Sekretariat gagal dibuat.' })
    } finally { setBusy(false) }
  }

  const saveMetadata = async () => {
    if (!activeMeeting || !metadataDraft || !canManage) return
    if (!metadataDraft.title.trim() || !metadataDraft.document_date) {
      setNotice({ kind: 'error', text: 'Judul dan tanggal dokumen wajib diisi.' })
      return
    }
    setBusy(true)
    try {
      const { data, error } = await db().from('pmkp_meetings').update({
        title: metadataDraft.title.trim(),
        document_date: metadataDraft.document_date,
        document_number: metadataDraft.document_number.trim() || null,
        meeting_type: metadataDraft.meeting_type,
        meeting_date: metadataDraft.document_date,
        updated_at: new Date().toISOString(),
      }).eq('id', activeMeeting.id).select('*').single()
      if (error) throw error
      setActiveMeeting(data as MeetingRow)
      await loadRegister()
      setNotice({ kind: 'success', text: 'Metadata register diperbarui.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Metadata register gagal disimpan.' })
    } finally { setBusy(false) }
  }

  const addFiles = (files: FileList | File[], category?: Category) => {
    const next: FileQueueItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, category: category || inferCategory(file), status: 'queued',
    }))
    if (!next.length) return
    setQueue((current) => [...current, ...next])
    setNotice({ kind: 'info', text: next.length === 1 ? '1 berkas ditambahkan ke antrean pembacaan.' : next.length + ' berkas ditambahkan. Periksa kategori otomatis sebelum memproses.' })
  }

  const processQueue = async () => {
    if (!activeMeeting || !metadataDraft || !canManage || !queue.some((item) => item.status === 'queued')) return
    setBusy(true)
    let registerMeta = { ...metadataDraft }
    let savedCount = 0
    let errors = 0
    const pending = queue.filter((item) => item.status === 'queued')
    for (const item of pending) {
      setQueue((current) => current.map((x) => x.id === item.id ? { ...x, status: 'processing', message: 'Membaca di browser…' } : x))
      setProcessingText('Memproses ' + item.file.name)
      try {
        const mime = fileMime(item.file)
        if (item.file.size < 1 || item.file.size > maxBytes) throw new Error('Ukuran berkas harus 1 byte sampai 15 MB.')
        const allowed = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain','image/png','image/jpeg','image/webp','image/gif']
        const extension = item.file.name.toLowerCase().split('.').pop() || ''
        if (!allowed.includes(mime) && !['pdf','docx','xlsx','csv','txt','png','jpg','jpeg','webp','gif'].includes(extension)) throw new Error('Format file tidak didukung.')
        const local = await readLocalDocument(item.file)
        const extracted = local.extractedText
        const rawLines = extracted.split('\n').map(line => line.trim()).filter(Boolean)
        const numberLine = rawLines.slice(0, 35).find(line => /(?:nomor|no\.|nomor surat)\s*:/i.test(line)) || ''
        const documentNumber = numberLine.match(/(?:nomor|no\.|nomor surat)\s*:\s*(.{2,100})/i)?.[1]?.trim() || null
        const metadata: ParserResult['parsed_metadata'] = {
          document_date: null,
          document_number: documentNumber,
          document_title: rawLines.find(line => line.length > 5 && line.length < 160) || local.title,
          detected_headings: rawLines.filter(line => line.length < 75 && /^[A-Z\s\d:.-]+$/.test(line)).slice(0, 30),
          extracted_line_count: rawLines.length,
          attendance_row_count: null,
          page_count: local.pageCount,
          document_kind: local.kind,
        }
        const extractionStatus: ExtractionStatus = local.status
        const insertPayload = {
          meeting_id:activeMeeting.id,
          document_type:item.category,
          title:metadata.document_title || item.file.name,
          bucket_id:null,
          object_path:null,
          source_mode:'data_only',
          mime_type:mime,
          file_size_bytes:item.file.size,
          sha256:local.sha256,
          uploaded_by:userId,
          original_filename:item.file.name,
          extracted_text:extracted,
          parsed_metadata:{...metadata,notes:local.notes,storage_mode:'data_only'},
          extraction_engine:'AUREKA Browser Local Document Parser v2',
          extraction_status:extractionStatus,
          document_date:metadata.document_date,
          document_number:metadata.document_number,
          document_title:metadata.document_title,
          extraction_error:null,
        }
        const { error: insertError } = await db().from('pmkp_meeting_documents').insert(insertPayload)
        if (insertError) throw insertError
        savedCount++
        if (metadata) {
          if (metadata.document_date && (!registerMeta.document_date || registerMeta.document_date === activeMeeting.document_date)) registerMeta.document_date = String(metadata.document_date)
          if (metadata.document_number && !registerMeta.document_number) registerMeta.document_number = String(metadata.document_number)
          const parsedTitle = String(metadata.document_title || '')
          if (parsedTitle && (['Dokumen Sekretariat','Register Dokumen','Kegiatan baru','Dokumen baru'].includes(registerMeta.title) || registerMeta.title === activeMeeting.title)) registerMeta.title = parsedTitle
        }
        setQueue((current) => current.map((x) => x.id === item.id ? { ...x, status: 'done', message: statusLabel[extractionStatus] } : x))
      } catch (error) {
        errors++
        setQueue((current) => current.map((x) => x.id === item.id ? { ...x, status: 'error', message: error instanceof Error ? error.message : 'Gagal diproses.' } : x))
      }
    }
    if (savedCount > 0 && (registerMeta.document_date !== metadataDraft.document_date || registerMeta.document_number !== metadataDraft.document_number || registerMeta.title !== metadataDraft.title)) {
      setMetadataDraft(registerMeta)
      const { data, error } = await db().from('pmkp_meetings').update({
        document_date: registerMeta.document_date, meeting_date: registerMeta.document_date,
        document_number: registerMeta.document_number.trim() || null, title: registerMeta.title,
        updated_at: new Date().toISOString(),
      }).eq('id', activeMeeting.id).select('*').single()
      if (!error && data) setActiveMeeting(data as MeetingRow)
      else if (error) setNotice({ kind: 'error', text: 'Data hasil ekstraksi tersimpan, tetapi metadata register belum diperbarui: ' + error.message })
    }
    await loadDocuments(activeMeeting.id)
    await loadRegister()
    setQueue(current=>current.filter(item=>item.status!=='done'))
    setProcessingText('')
    setBusy(false)
    setNotice({ kind: errors ? 'info' : 'success', text: savedCount + ' hasil ekstraksi tersimpan tanpa file asli. ' + errors + ' file gagal diproses. Tinjau teks hasil ekstraksi sebelum menggunakan metadata.' })
  }

  const documentSections = (doc:MeetingDocument) => [
    {heading:'Jenis Arsip',text:categoryLabel(doc.document_type)},
    {heading:'Nomor Dokumen',text:doc.document_number||'-'},
    {heading:'Tanggal Dokumen',text:doc.document_date||'-'},
    {heading:'Konten Terekstraksi',text:doc.extracted_text||'Tidak ada teks digital yang tersimpan. File asli tidak diarsipkan.'},
    {heading:'Jejak Ekstraksi',text:'SHA-256 file sumber: '+(doc.sha256||'-')},
  ]
  const downloadDocument = async (doc: MeetingDocument) => {
    try {
      const blob=await makeStructuredDocx(doc.document_title||doc.title,documentSections(doc))
      downloadBrowserBlob(safeName(doc.document_number||doc.title||'dokumen-sekretariat')+'.docx',blob)
      setNotice({kind:'success',text:'DOCX dibuat dari konten register, bukan salinan file asli.'})
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Dokumen tidak dapat dibangun.' })
    }
  }
  const printDocument = (doc:MeetingDocument) => {
    try { printStructuredContent(doc.document_title||doc.title,documentSections(doc)) }
    catch (error) { setNotice({kind:'error',text:error instanceof Error?error.message:'Pratinjau gagal.'}) }
  }

  const currentDocs = documents.filter((doc) => doc.document_type === activeCategory)
  const totalDocs = documents.length
  const currentType = categories.find((item) => item.id === activeCategory)

  return (
    <section className="secWorkspace" aria-label="Sekretariat">
      <WorkspaceModuleHeader
        title={section === 'invitations' ? 'Register Undangan' : 'Administrasi Kegiatan'}
      />
      {showRegister ? <>
      <div className="secToolbar">
        <div><span className="secEyebrow">{section === 'invitations' ? 'ADMINISTRASI UNDANGAN' : 'REGISTER DOKUMEN'}</span><h2>{section === 'invitations' ? 'Register Undangan' : 'Register Sekretariat'}</h2><p>Setiap baris mewakili satu dokumen/kegiatan. Isi dokumen dibuka melalui pop-up pada baris yang sama.</p></div>
        {canManage&&<button type="button" className="secPrimaryButton" onClick={()=>{setDraft({ ...emptyDraft(initialRoomId), meeting_type: section === 'invitations' ? 'Undangan' : 'Kegiatan' });setCreateOpen(true)}}>+ Tambah Register</button>}
      </div>
      {notice&&!activeMeeting&&<div className={'secNotice secNotice-'+notice.kind} role="status">{notice.text}<button type="button" aria-label="Tutup pesan" onClick={()=>setNotice(null)}>×</button></div>}
      <div className="secSummary"><div><span>Total Register</span><strong>{filteredRows.length}</strong></div><div><span>Undangan</span><strong>{rows.filter((row)=>/undangan/i.test(row.meeting_type)).length}</strong></div><div><span>Kegiatan / Pelatihan</span><strong>{rows.filter((row)=>!/undangan/i.test(row.meeting_type)).length}</strong></div></div>
      <div className="secTablePanel">
        <div className="secTableToolbar"><div><h3>Daftar Dokumen</h3><span>{section === 'invitations' ? 'Dokumen undangan' : 'Seluruh dokumen kegiatan sekretariat'}</span></div><input aria-label="Cari register sekretariat" type="search" placeholder="Cari judul, nomor atau jenis…" value={search} onChange={(event)=>setSearch(event.target.value)}/></div>
        {loading?<div className="secEmpty">Memuat register Sekretariat…</div>:filteredRows.length===0?<div className="secEmpty"><strong>Belum ada register.</strong><p>Gunakan Tambah Register untuk mulai mencatat dokumen dan kegiatan.</p></div>:<div className="secTableScroll"><table className="secTable"><thead><tr><th>No</th><th>Tanggal Dokumen</th><th>Nomor Dokumen</th><th>Judul Dokumen</th><th>Jenis Dokumen</th><th>Isi Dokumen</th></tr></thead><tbody>
          {filteredRows.map((row)=><tr key={row.id}>
            <td className="secNo">{row.register_no}</td>
            <td>{dateLabel(row.document_date)}</td>
            <td>{row.document_number||<span className="secMuted">Belum diekstrak</span>}</td>
            <td><strong>{row.title}</strong><small>{row.meeting_code}{row.room_id!=null?' · '+(rooms.find((room)=>room.id===row.room_id)?.name||'Unit '+row.room_id):' · Seluruh RS'}</small></td>
            <td><span className="secTypePill">{row.meeting_type}</span></td>
            <td><button type="button" className="secOpenButton" onClick={()=>void openDocuments(row)}>Buka Isi Dokumen</button></td>
          </tr>)}
        </tbody></table></div>}
      </div>

      {createOpen&&typeof document!=='undefined'&&createPortal(<div className="secModalBackdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)setCreateOpen(false)}}>
        <section ref={createDialogRef} tabIndex={-1} className="secModal secCreateModal" role="dialog" aria-modal="true" aria-labelledby="sec-create-title">
          <header className="secModalHeader"><div><span className="secEyebrow">SEKRETARIAT</span><h2 id="sec-create-title">Tambah Register Dokumen</h2></div><button type="button" aria-label="Tutup" onClick={()=>setCreateOpen(false)} disabled={busy}>×</button></header>
          <div className="secFormGrid">
            <label>Tanggal Dokumen<input type="date" value={draft.document_date} onChange={(e)=>setDraft((old)=>({...old,document_date:e.target.value}))}/></label>
            <label>Nomor Dokumen<input value={draft.document_number} onChange={(e)=>setDraft((old)=>({...old,document_number:e.target.value}))} placeholder="Diisi manual atau dibaca otomatis dari berkas"/></label>
            <label className="secSpan2">Judul Dokumen<input value={draft.title} onChange={(e)=>setDraft((old)=>({...old,title:e.target.value}))} placeholder="Boleh dikosongkan; judul akan dibaca dari berkas"/></label>
            <label>Jenis Dokumen<select value={draft.meeting_type} onChange={(e)=>setDraft((old)=>({...old,meeting_type:e.target.value}))}>{registerTypes.map((type)=><option key={type}>{type}</option>)}</select></label>
            {!lockRoomScope&&<label>Unit Kerja<select value={draft.room_id} onChange={(e)=>setDraft((old)=>({...old,room_id:e.target.value}))}><option value="">Seluruh Rumah Sakit</option>{rooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>}
            {lockRoomScope&&<label>Unit Kerja<input value={rooms.find((room)=>room.id===initialRoomId)?.name||'Unit aktif'} disabled/></label>}
          </div>
          <footer className="secModalFooter"><button type="button" className="secSecondaryButton" onClick={()=>setCreateOpen(false)} disabled={busy}>Batal</button><button type="button" className="secPrimaryButton" onClick={()=>void createRegister()} disabled={busy}>{busy?'Menyimpan…':'Simpan dan Isi Dokumen'}</button></footer>
        </section>
      </div>,document.body)}

      {activeMeeting&&metadataDraft&&typeof document!=='undefined'&&createPortal(<div className="secModalBackdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)closeDocuments()}}>
        <section ref={documentsDialogRef} tabIndex={-1} className="secModal secDocumentsModal" role="dialog" aria-modal="true" aria-labelledby="sec-document-title">
          <header className="secModalHeader"><div><span className="secEyebrow">MEETING ID · {activeMeeting.meeting_code}</span><h2 id="sec-document-title">Isi Dokumen — {activeMeeting.title}</h2></div><button type="button" aria-label="Tutup pop-up isi dokumen" onClick={closeDocuments} disabled={busy}>×</button></header>
          <div className="secMetadataEditor">
            <label>Tanggal Dokumen<input type="date" value={metadataDraft.document_date} disabled={!canManage||busy} onChange={(e)=>setMetadataDraft((old)=>old?({...old,document_date:e.target.value}):old)}/></label>
            <label>Nomor Dokumen<input value={metadataDraft.document_number} disabled={!canManage||busy} onChange={(e)=>setMetadataDraft((old)=>old?({...old,document_number:e.target.value}):old)} placeholder="Otomatis dari hasil pembacaan"/></label>
            <label>Judul Dokumen<input value={metadataDraft.title} disabled={!canManage||busy} onChange={(e)=>setMetadataDraft((old)=>old?({...old,title:e.target.value}):old)}/></label>
            <label>Jenis Dokumen<select value={metadataDraft.meeting_type} disabled={!canManage||busy} onChange={(e)=>setMetadataDraft((old)=>old?({...old,meeting_type:e.target.value}):old)}>{registerTypes.map((type)=><option key={type}>{type}</option>)}</select></label>
            {canManage&&<button type="button" className="secSecondaryButton" onClick={()=>void saveMetadata()} disabled={busy}>Simpan Metadata</button>}
          </div>
          {notice&&<div className={'secNotice secNotice-'+notice.kind} role="status">{notice.text}<button type="button" aria-label="Tutup pesan" onClick={()=>setNotice(null)}>×</button></div>}
          <div className="secUploadAll">
            <div><strong>Unggah banyak berkas sekaligus</strong><span>Pengenalan kategori awal memakai nama file/ekstensi. Periksa kategori sebelum memproses.</span></div>
            <button type="button" className="secPrimaryButton" onClick={()=>fileInputRef.current?.click()} disabled={!canManage||busy}>Pilih Beberapa Berkas</button>
            <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*" onChange={(e)=>{if(e.target.files)addFiles(e.target.files);e.currentTarget.value=''}}/>
          </div>
          {queue.length>0&&<div className="secQueue"><div className="secQueueHead"><strong>Antrean berkas ({queue.length})</strong><button type="button" className="secTextButton" onClick={()=>setQueue((old)=>old.filter((item)=>item.status==='processing'||item.status==='done'))} disabled={busy}>Hapus antrean belum diproses</button></div>
            {queue.map((item)=><div className="secQueueItem" key={item.id}><span className="secQueueStatus">{item.status==='done'?'✓':item.status==='error'?'!':item.status==='processing'?'…':'•'}</span><div><strong>{item.file.name}</strong><small>{(item.file.size/1024/1024).toFixed(2)} MB {item.message?' · '+item.message:''}</small></div><select aria-label={'Kategori '+item.file.name} value={item.category} onChange={(e)=>setQueue((old)=>old.map((x)=>x.id===item.id?{...x,category:e.target.value as Category}:x))} disabled={busy||item.status==='done'}>{categories.map((cat)=><option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></div>)}
            <div className="secQueueFooter"><span>{processingText||'Periksa kategori dokumen sebelum pembacaan.'}</span><button type="button" className="secPrimaryButton" onClick={()=>void processQueue()} disabled={busy||!queue.some((item)=>item.status==='queued')}>{busy?'Memproses…':'Unggah dan Baca '+queue.filter((item)=>item.status==='queued').length+' Berkas'}</button></div>
          </div>}
          <nav className="secCategoryTabs" role="tablist" aria-label="Kategori isi dokumen">
            {categories.map((cat)=>{const count=documents.filter((doc)=>doc.document_type===cat.id).length;return <button key={cat.id} type="button" role="tab" aria-selected={activeCategory===cat.id} className={activeCategory===cat.id?'active':''} onClick={()=>setActiveCategory(cat.id)}><span>{cat.label}</span><b>{count}</b></button>})}
          </nav>
          <section className="secCategoryPanel" aria-label={currentType?.label}>
            <div className="secCategoryHead"><div><h3>{currentType?.label}</h3><p>{currentType?.hint}</p></div><label className="secUploadButton">+ Tambah Berkas<input type="file" multiple hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*" disabled={!canManage||busy} onChange={(e)=>{if(e.target.files)addFiles(e.target.files,activeCategory);e.currentTarget.value=''}}/></label></div>
            {documentsLoading?<div className="secEmpty">Memuat isi dokumen…</div>:currentDocs.length===0?<div className="secEmpty">Belum ada berkas pada kategori {currentType?.label}. Unggah berkas di sini atau melalui pilihan beberapa berkas di atas.</div>:<div className="secDocumentList">{currentDocs.map((doc)=><article className="secDocumentCard" key={doc.id}>
              <div className="secDocumentTop"><div><strong>{doc.document_title||doc.title}</strong><small>{doc.original_filename||doc.title} · {(Number(doc.file_size_bytes||0)/1024/1024).toFixed(2)} MB · {dateLabel(doc.document_date||null)}</small></div><span className={'secExtractionStatus secStatus-'+doc.extraction_status}>{statusLabel[doc.extraction_status]||doc.extraction_status}</span></div>
              {doc.document_type==='gambar'&&doc.preview_url&&<img className="secImagePreview" src={doc.preview_url} alt={doc.document_title||doc.title} loading="lazy"/>}
              <div className="secDocumentMeta">{doc.document_number&&<span>Nomor: {doc.document_number}</span>}{doc.parsed_metadata?.attendance_row_count!=null&&<span>Baris peserta terdeteksi: {String(doc.parsed_metadata.attendance_row_count)}</span>}{doc.extraction_engine&&<span>{doc.extraction_engine}</span>}</div>
              {doc.extraction_error&&<p className="secWarningText">{doc.extraction_error}</p>}
              {Array.isArray(doc.parsed_metadata?.notes)&&<p className="secMuted">{(doc.parsed_metadata.notes as string[]).join(' ')}</p>}
              {doc.extracted_text&&<details className="secExtractedText"><summary>Lihat teks hasil pembacaan ({doc.extracted_text.length.toLocaleString('id-ID')} karakter)</summary><pre>{doc.extracted_text}</pre></details>}
              <div className="secDocumentActions"><button type="button" className="secTextButton" onClick={()=>void downloadDocument(doc)}>Unduh DOCX Arsip</button><button type="button" className="secTextButton" onClick={()=>printDocument(doc)}>Cetak / PDF</button><span>Diimpor {dateLabel(doc.uploaded_at)}</span></div>
            </article>)}</div>}
          </section>
          <footer className="secModalFooter"><span>{totalDocs} berkas terhubung ke Meeting ID ini</span><button type="button" className="secPrimaryButton" onClick={closeDocuments}>Selesai</button></footer>
        </section>
      </div>,document.body)}
      </> : <div className="secLanding">
        <div className="secSummary"><div><span>Total Kegiatan / Register</span><strong>{rows.length}</strong></div><div><span>Undangan Tercatat</span><strong>{rows.filter((row)=>/undangan/i.test(row.meeting_type)).length}</strong></div><div><span>Kategori UMANG</span><strong>5</strong></div></div>
        <section className="secTablePanel"><p>Ringkasan register kegiatan dan dokumentasi UMANG dalam satu Meeting ID. Pilih register untuk menelusuri nomor surat dan seluruh dokumen kegiatan.</p><div className="secToolbar"><div><strong>Administrasi Kegiatan Rumah Sakit</strong><p>Undangan, Materi, Absensi Digital, Notulensi, dan Gambar disimpan sebagai dokumen terstruktur.</p></div><button type="button" className="secPrimaryButton" onClick={()=>setShowRegister(true)}>Lihat Register Kegiatan</button></div>
          {section === 'invitations' && <div className="secNotice secNotice-info" role="status">Bagian ini saat ini menampilkan register dokumen undangan. Pengiriman undangan langsung ke PIC unit belum diaktifkan; tidak ada undangan yang dikirim otomatis.</div>}
        </section>
      </div>}
    </section>
  )
}