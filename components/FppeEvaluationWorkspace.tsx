'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { downloadAssessmentCsv, downloadAssessmentJson, openPrintableIndividualReport } from '@/lib/aureka/individual-assessment-export'

type Room = { id: number; name: string }
type Staff = {
  id: string
  employee_code: string
  display_name: string
  profession_group: string
  position_title: string
  directory_status: 'available'
  room_id: number
}
type FppeRecord = Record<string, any>
type FppeEvent = Record<string, any>
type FppeMessage = { type?: string; action?: 'draft' | 'submitted'; data?: any; summary?: any; height?: number }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draf',
  submitted: 'Menunggu validasi',
  validated: 'Tervalidasi',
  reopened: 'Perlu revisi',
  archived: 'Diarsipkan',
}
const STATUS_CLASS: Record<string, string> = {
  draft: 'fppeNeutral',
  submitted: 'fppeInfo',
  validated: 'fppeGood',
  reopened: 'fppeWarn',
  archived: 'fppeNeutral',
}
const esc = (value: unknown) => String(value ?? '').trim()
const isFppeEligible = (staff: Pick<Staff, 'profession_group' | 'position_title'>) => {
  const group = String(staff.profession_group || '').toLowerCase()
  const title = String(staff.position_title || '').toLowerCase()
  const clinicalGroup = /dokter|keperawatan|kebidanan|kefarmasian|laboratorium medis|tenaga gizi|tenaga radiologi|rehabilitasi medik/.test(group)
  const clinicalTitle = /dokter|spesialis|perawat|bidan|apoteker|farmasi|laboratorium|\banalis\b|atlm|radiografer|radiologi|nutrisionis|\bgizi\b|terapis|fisioterapis|psikolog|sanitarian|epidemiolog|elektromedis|perekam medis|rekam medis|refraksionis|penata anestesi|kesehatan kerja|penyuluh kesehatan|administrator kesehatan|tenaga teknis kefarmasian/.test(title)
  return clinicalGroup || clinicalTitle
}

export default function FppeEvaluationWorkspace({
  initialRoomId,
  rooms,
  teamStaff,
  canManage,
}: {
  initialRoomId: number | null
  rooms: Room[]
  teamStaff: Staff[]
  canManage: boolean
}) {
  const defaultRoom = initialRoomId ?? rooms[0]?.id ?? 0
  const frameRef = useRef<HTMLIFrameElement>(null)
  const activeRef = useRef<FppeRecord | null>(null)
  const roomRef = useRef<number>(defaultRoom)
  const rosterRef = useRef<any[]>([])
  const [roomId, setRoomId] = useState<number>(defaultRoom)
  const [frameReady, setFrameReady] = useState(false)
  const [frameHeight, setFrameHeight] = useState(1700)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [evaluations, setEvaluations] = useState<FppeRecord[]>([])
  const [activeEvaluation, setActiveEvaluation] = useState<FppeRecord | null>(null)
  const [events, setEvents] = useState<FppeEvent[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [reviewNote, setReviewNote] = useState('')

  const roomMap = useMemo(() => new Map(rooms.map((room) => [Number(room.id), room.name])), [rooms])
  const roster = useMemo(() => teamStaff
    .filter((staff) => Number(staff.room_id) === Number(roomId) && staff.directory_status === 'available' && isFppeEligible(staff))
    .map((staff) => ({
      ...staff,
      id: String(staff.id),
      room_id: Number(staff.room_id),
      room_name: roomMap.get(Number(staff.room_id)) || 'Unit belum dipetakan',
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'id')), [teamStaff, roomId, roomMap])

  activeRef.current = activeEvaluation
  roomRef.current = roomId
  rosterRef.current = roster

  const saveFromFrameRef = useRef<(message: FppeMessage) => Promise<void>>(async () => undefined)

  const postToFrame = useCallback((message: Record<string, any>) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin)
  }, [])

  const loadEvaluations = useCallback(async () => {
    if (!canManage || !roomId) return
    setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await q().from('oppe_fppe_evaluations')
        .select('*')
        .eq('room_id', roomId)
        .order('updated_at', { ascending: false })
        .limit(250)
      if (queryError) throw queryError
      const rows = (data || []) as FppeRecord[]
      setEvaluations(rows)
      const current = activeRef.current
      if (current?.id) {
        const refreshed = rows.find((row) => String(row.id) === String(current.id))
        if (refreshed) {
          setActiveEvaluation(refreshed)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riwayat FPPE gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [canManage, roomId])

  const loadEvents = useCallback(async (evaluationId: string) => {
    try {
      const { data, error: queryError } = await q().from('oppe_fppe_evaluation_events')
        .select('id,event_type,from_status,to_status,actor_id,summary_snapshot_json,created_at')
        .eq('evaluation_id', evaluationId)
        .order('created_at', { ascending: false })
      if (queryError) throw queryError
      setEvents((data || []) as FppeEvent[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riwayat proses FPPE gagal dimuat.')
    }
  }, [])

  useEffect(() => { void loadEvaluations() }, [loadEvaluations])
  useEffect(() => {
    if (activeEvaluation?.id) void loadEvents(String(activeEvaluation.id))
    else setEvents([])
  }, [activeEvaluation?.id, loadEvents])

  useEffect(() => {
    if (initialRoomId && !activeRef.current && rooms.some((room) => Number(room.id) === Number(initialRoomId))) {
      setRoomId(Number(initialRoomId))
    }
  }, [initialRoomId, rooms])

  useEffect(() => {
    if (!frameReady) return
    postToFrame({ type: 'AUREKA_FPPE_ROSTER', roster })
  }, [frameReady, roster, postToFrame])

  useEffect(() => {
    const onMessage = (event: MessageEvent<FppeMessage>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return
      const message = event.data || {}
      if (message.type === 'AUREKA_FPPE_READY') {
        setFrameReady(true)
        postToFrame({
          type: 'AUREKA_FPPE_INIT',
          roster: rosterRef.current,
          evaluation: activeRef.current || undefined,
          reset: !activeRef.current,
          readOnly: ['submitted', 'validated', 'archived'].includes(String(activeRef.current?.status || '')),
        })
      } else if (message.type === 'AUREKA_FPPE_RESIZE') {
        const height = Number(message.height)
        if (Number.isFinite(height)) setFrameHeight(Math.max(1300, Math.min(8000, height + 28)))
      } else if (message.type === 'AUREKA_FPPE_SAVE') {
        void saveFromFrameRef.current(message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // The ref keeps the bridge stable while save callbacks use current React state.
  }, [postToFrame])

  const staffForRecord = useCallback((record: FppeRecord) => {
    const current = teamStaff.find((staff) => String(staff.id) === String(record.staff_id))
    return {
      name: current?.display_name || String(record.staff_name_snapshot || 'Nama tidak tersedia'),
      code: current?.employee_code || String(record.staff_code_snapshot || '—'),
      title: current?.position_title || String(record.position_snapshot || record.profession_snapshot || '—'),
    }
  }, [teamStaff])

  const exportFileStem = (record: FppeRecord) => {
    const staff = staffForRecord(record)
    const id = String(record.id || '').slice(0, 8)
    return ['AUREKA-FPPE', staff.code, staff.name, id].filter(Boolean).join('-')
      .normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  }

  const exportFppePdf = (record: FppeRecord) => {
    const staff = staffForRecord(record)
    const form = record.form_json && typeof record.form_json === 'object' ? record.form_json : {}
    const meta = form.meta && typeof form.meta === 'object' ? form.meta : {}
    const evidence = form.evidence && typeof form.evidence === 'object' ? form.evidence : {}
    const summary = record.summary_json && typeof record.summary_json === 'object' ? record.summary_json : {}
    const competencyAnswers = form.competencyAnswers && typeof form.competencyAnswers === 'object' ? form.competencyAnswers : {}
    const competencyRows = Object.entries(competencyAnswers).map(([key, value], index) => {
      const parts = key.split('::')
      return [index + 1, parts.slice(2).join('::') || key, value]
    })
    const evidenceRows = [
      ['Observasi langsung', evidence.evidenceObservation],
      ['Telaah rekam medis', evidence.evidenceRecord],
      ['Logbook / data terstruktur', evidence.evidenceLogbook],
      ['Bukti lain', evidence.evidenceOther],
      ['Keputusan FPPE', evidence.overallDecision],
      ['Rencana tindak lanjut', evidence.actionPlan],
      ['Tanggal reassessment', evidence.reassessmentDate],
      ['Kesimpulan evaluator', evidence.conclusion],
    ]
    const signatoryRows = [
      ['Atasan langsung / evaluator', meta.directSupervisor, meta.directSupervisorNip],
      [meta.headDivisionRole || 'Kepala bidang', meta.headDivisionName, meta.headDivisionNip],
      ['Ketua subkomite', meta.subcommitteeName, meta.subcommitteeNip],
      ['Ketua komite profesi', meta.committeeName, meta.committeeNip],
    ]
    const opened = openPrintableIndividualReport({
      title: 'Focused Professional Practice Evaluation (FPPE)',
      subtitle: 'Rumah Sakit Umum Daerah Sultan Syarif Mohamad Alkadrie · Audit OPPE AUREKA',
      metadata: [
        ['Nama tenaga saat ini (Metadata)', staff.name],
        ['Nama pada snapshot penilaian', record.staff_name_snapshot],
        ['Kode tenaga AUREKA', staff.code],
        ['Jabatan Metadata', staff.title],
        ['Profesi / SMF / area praktik', record.profession_snapshot || meta.profession],
        ['Unit penilaian', roomMap.get(Number(record.room_id)) || record.unit_snapshot || '—'],
        ['Jenis FPPE', record.evaluation_type === 'triggered' ? 'FPPE Triggered' : 'FPPE Initial'],
        ['Status', STATUS_LABEL[String(record.status)] || record.status],
        ['Alasan / trigger', record.trigger_reason || meta.trigger],
        ['Uraian trigger', record.trigger_detail || meta.triggerDetail],
        ['Periode evaluasi', (record.period_start || meta.startDate || '—') + ' s.d. ' + (record.period_end || meta.endDate || '—')],
        ['Ruang lingkup / privilege', record.scope_text || meta.scope],
        ['Kompetensi dinilai', String(summary.assessed ?? 0) + ' / ' + String(summary.totalCompetencies ?? competencyRows.length)],
        ['Keputusan ringkas', summary.decision || evidence.overallDecision],
        ['Diajukan pada', record.submitted_at ? new Date(record.submitted_at).toLocaleString('id-ID') : '—'],
        ['Divalidasi pada', record.validated_at ? new Date(record.validated_at).toLocaleString('id-ID') : '—'],
      ],
      sections: [
        { title: 'Hasil kompetensi', columns: ['No.', 'Domain / kompetensi', 'Hasil'], rows: competencyRows },
        { title: 'Bukti dan keputusan evaluasi', columns: ['Komponen', 'Catatan'], rows: evidenceRows },
        { title: 'Pengesahan', columns: ['Peran', 'Nama', 'Nomor identitas / NIP'], rows: signatoryRows },
        { title: 'Ringkasan kompetensi', columns: ['Indikator', 'Jumlah'], rows: [
          ['Butir dinilai', summary.assessed ?? 0],
          ['Kompeten', summary.competent ?? 0],
          ['Kompeten dengan supervisi', summary.supervised ?? 0],
          ['Perlu remediasi', summary.remedial ?? 0],
          ['Belum kompeten', summary.notCompetent ?? 0],
        ] },
        { title: 'Catatan reviewer', columns: ['Catatan'], rows: [[record.review_note || '—']] },
      ],
      footer: 'Snapshot nama dan kode saat evaluasi dipertahankan untuk audit trail; identitas tenaga terkini diambil dari Metadata berdasarkan UUID tenaga.',
    })
    if (!opened) setError('Jendela ekspor diblokir browser. Izinkan pop-up untuk AUREKA lalu ulangi ekspor.')
  }

  const exportFppeJson = (record: FppeRecord) => {
    const staff = staffForRecord(record)
    downloadAssessmentJson(exportFileStem(record) + '.json', {
      ...record,
      current_metadata_identity: { id: String(record.staff_id || ''), name: staff.name, employee_code: staff.code, position_title: staff.title },
    })
  }

  const exportFppeListCsv = () => {
    downloadAssessmentCsv('AUREKA-FPPE-daftar-unit-' + roomId + '.csv',
      ['ID FPPE', 'Nama Metadata terkini', 'Nama snapshot', 'Kode AUREKA', 'Jabatan', 'Profesi / SMF', 'Unit', 'Jenis', 'Trigger', 'Periode mulai', 'Periode akhir', 'Status', 'Keputusan', 'Diajukan pada', 'Divalidasi pada'],
      filtered.map((record) => {
        const staff = staffForRecord(record)
        const form = record.form_json && typeof record.form_json === 'object' ? record.form_json : {}
        const evidence = form.evidence && typeof form.evidence === 'object' ? form.evidence : {}
        return [record.id, staff.name, record.staff_name_snapshot, staff.code, staff.title, record.profession_snapshot,
          roomMap.get(Number(record.room_id)) || record.unit_snapshot, record.evaluation_type === 'triggered' ? 'Triggered' : 'Initial',
          record.trigger_reason, record.period_start, record.period_end, STATUS_LABEL[String(record.status)] || record.status,
          record.summary_json?.decision || evidence.overallDecision, record.submitted_at, record.validated_at]
      }))
  }

  const saveFromFrame = async (message: FppeMessage) => {
    if (!canManage || busy) return
    const data = message.data
    const meta = data?.meta || {}
    const action = message.action === 'submitted' ? 'submitted' : 'draft'
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const staffId = String(meta.staffUuid || '')
      const selectedFromRoster = rosterRef.current.find((staff) => String(staff.id) === staffId)
      if (!staffId || !selectedFromRoster) throw new Error('Pilih tenaga dari Metadata yang tersedia dan telah dikunci pada unit ini.')
      const { data: canonical, error: staffError } = await q().from('staff_directory')
        .select('id,employee_code,display_name,profession_group,position_title,directory_status')
        .eq('id', staffId)
        .maybeSingle()
      if (staffError) throw staffError
      if (!canonical || canonical.directory_status !== 'available') throw new Error('Identitas tenaga tidak lagi tersedia di Metadata. Muat ulang roster dan periksa penetapan unit.')
      const { data: auth, error: authError } = await sb.auth.getUser()
      if (authError || !auth.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
      const userId = auth.user.id
      const existingId = String(meta.evaluationId || '')
      let existing: FppeRecord | null = null
      if (existingId) {
        const { data: row, error: existingError } = await q().from('oppe_fppe_evaluations')
          .select('id,status,created_by,room_id,staff_id')
          .eq('id', existingId)
          .maybeSingle()
        if (existingError) throw existingError
        if (!row) throw new Error('Rekaman FPPE tidak ditemukan. Muat ulang riwayat sebelum menyimpan.')
        existing = row as FppeRecord
        if (!['draft', 'reopened'].includes(String(existing.status))) {
          throw new Error('FPPE yang sudah diajukan/tervalidasi tidak dapat langsung diubah. Gunakan alur pengembalian untuk revisi.')
        }
      }
      const targetRoom = Number(selectedFromRoster.room_id)
      if (!targetRoom || targetRoom !== Number(roomRef.current)) {
        throw new Error('Unit identitas tenaga tidak sama dengan unit FPPE yang dipilih.')
      }
      const roomName = roomMap.get(targetRoom) || selectedFromRoster.room_name || ''
      const formSnapshot = JSON.parse(JSON.stringify(data || {}))
      formSnapshot.meta = {
        ...(formSnapshot.meta || {}),
        staffUuid: String(canonical.id),
        staffName: String(canonical.display_name),
        staffId: String(canonical.employee_code),
        profession: esc(formSnapshot.meta?.profession) || String(canonical.profession_group || ''),
        unit: roomName,
      }
      const summary = {
        ...(message.summary || {}),
        status: esc(message.summary?.status) || 'Belum ditetapkan',
        decision: esc(message.summary?.decision),
        assessed: Number(message.summary?.assessed || 0),
        totalCompetencies: Number(message.summary?.totalCompetencies || 0),
      }
      if (action === 'submitted') {
        if (!formSnapshot.meta.profession) throw new Error('Profesi/SMF wajib ditentukan pada form FPPE.')
        if (!formSnapshot.meta.startDate || !formSnapshot.meta.endDate) throw new Error('Periode evaluasi wajib diisi sebelum diajukan.')
        if (String(formSnapshot.meta.endDate) < String(formSnapshot.meta.startDate)) throw new Error('Tanggal akhir evaluasi tidak boleh mendahului tanggal mulai.')
        if (!String(formSnapshot.meta.scope || '').trim()) throw new Error('Ruang lingkup/privilege wajib diisi sebelum diajukan.')
        if (!String(formSnapshot.meta.directSupervisor || '').trim()) throw new Error('Evaluator/atasan langsung wajib diisi sebelum diajukan.')
        if (!String(formSnapshot.evidence?.overallDecision || '').trim()) throw new Error('Keputusan FPPE wajib dipilih.')
        if (Number(summary.assessed) < Number(summary.totalCompetencies) || Number(summary.totalCompetencies) <= 0) throw new Error('Seluruh kompetensi pada profil terpilih harus dinilai sebelum pengajuan.')
        if (!String(formSnapshot.evidence?.conclusion || '').trim()) throw new Error('Kesimpulan evaluator wajib diisi.')
      }
      const now = new Date().toISOString()
      const basePayload: Record<string, any> = {
        room_id: targetRoom,
        staff_id: String(canonical.id),
        staff_code_snapshot: String(canonical.employee_code),
        staff_name_snapshot: String(canonical.display_name),
        profession_snapshot: String(formSnapshot.meta.profession || canonical.profession_group || ''),
        position_snapshot: String(canonical.position_title || ''),
        unit_snapshot: roomName,
        evaluation_type: formSnapshot.meta.fppeType === 'triggered' ? 'triggered' : 'initial',
        trigger_reason: String(formSnapshot.meta.trigger || ''),
        trigger_detail: String(formSnapshot.meta.triggerDetail || ''),
        period_start: formSnapshot.meta.startDate || null,
        period_end: formSnapshot.meta.endDate || null,
        scope_text: String(formSnapshot.meta.scope || ''),
        status: action === 'submitted' ? 'submitted' : 'draft',
        form_json: formSnapshot,
        summary_json: summary,
        review_note: existing?.review_note || '',
        submitted_at: action === 'submitted' ? now : null,
        validated_by: null,
        validated_at: null,
        updated_by: userId,
      }
      let savedId = existingId
      if (existingId && existing) {
        const { error: updateError } = await q().from('oppe_fppe_evaluations')
          .update(basePayload)
          .eq('id', existingId)
        if (updateError) throw updateError
      } else {
        const initialPayload = action === 'submitted'
          ? { ...basePayload, status: 'draft', submitted_at: null }
          : basePayload
        const { data: inserted, error: insertError } = await q().from('oppe_fppe_evaluations')
          .insert({ ...initialPayload, created_by: userId })
          .select('id')
          .single()
        if (insertError) throw insertError
        savedId = String(inserted.id)
        if (action === 'submitted') {
          const { error: submitError } = await q().from('oppe_fppe_evaluations')
            .update({ ...basePayload, updated_by: userId })
            .eq('id', savedId)
          if (submitError) throw submitError
        }
      }
      const { data: saved, error: savedError } = await q().from('oppe_fppe_evaluations')
        .select('*').eq('id', savedId).single()
      if (savedError) throw savedError
      setActiveEvaluation(saved as FppeRecord)
      await loadEvaluations()
      postToFrame({
        type: 'AUREKA_FPPE_SAVE_RESULT',
        ok: true,
        id: savedId,
        status: action === 'submitted' ? 'submitted' : 'draft',
        message: action === 'submitted' ? 'FPPE berhasil diajukan dan menunggu validasi independen.' : 'Draf FPPE berhasil disimpan ke server AUREKA.',
      })
      setNotice(action === 'submitted' ? 'FPPE diajukan untuk validasi independen.' : 'Draf FPPE tersimpan di server.')
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'FPPE gagal disimpan.'
      setError(messageText)
      postToFrame({ type: 'AUREKA_FPPE_SAVE_RESULT', ok: false, message: messageText })
    } finally {
      setBusy(false)
    }
  }

  saveFromFrameRef.current = saveFromFrame

  const startNew = (nextRoom = roomId) => {
    setRoomId(nextRoom)
    setActiveEvaluation(null)
    setReviewNote('')
    setNotice('')
    setError('')
    if (frameReady) {
      const nextRoster = teamStaff
        .filter((staff) => Number(staff.room_id) === Number(nextRoom) && staff.directory_status === 'available' && isFppeEligible(staff))
        .map((staff) => ({ ...staff, id: String(staff.id), room_name: roomMap.get(Number(nextRoom)) || '' }))
      postToFrame({ type: 'AUREKA_FPPE_ROSTER', roster: nextRoster })
      postToFrame({ type: 'AUREKA_FPPE_NEW', roster: nextRoster })
    }
  }

  const openEvaluation = (record: FppeRecord) => {
    const nextRoom = Number(record.room_id)
    setRoomId(nextRoom)
    setActiveEvaluation(record)
    setReviewNote(String(record.review_note || ''))
    setNotice('')
    setError('')
    if (frameReady) {
      const nextRoster = teamStaff
        .filter((staff) => Number(staff.room_id) === nextRoom && staff.directory_status === 'available' && isFppeEligible(staff))
        .map((staff) => ({ ...staff, id: String(staff.id), room_name: roomMap.get(nextRoom) || '' }))
      postToFrame({ type: 'AUREKA_FPPE_ROSTER', roster: nextRoster })
      postToFrame({ type: 'AUREKA_FPPE_LOAD', evaluation: record })
    }
  }

  const validateEvaluation = async () => {
    if (!activeEvaluation?.id || activeEvaluation.status !== 'submitted' || busy) return
    if (!window.confirm('Validasi FPPE ini? Pastikan Anda bukan pembuat FPPE dan telah menelaah bukti/keputusan.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data: auth, error: authError } = await sb.auth.getUser()
      if (authError || !auth.user) throw new Error('Sesi login tidak ditemukan.')
      if (String(activeEvaluation.created_by) === String(auth.user.id)) throw new Error('Validasi independen: akun pembuat FPPE tidak boleh memvalidasi penilaian sendiri.')
      const { data: validated, error: updateError } = await q().from('oppe_fppe_evaluations')
        .update({ status: 'validated', validated_by: auth.user.id, validated_at: new Date().toISOString(), updated_by: auth.user.id })
        .eq('id', activeEvaluation.id)
        .eq('status', 'submitted')
        .select('*').single()
      if (updateError) throw updateError
      setActiveEvaluation(validated as FppeRecord)
      setNotice('FPPE telah divalidasi. Snapshot dan audit trail tersimpan.')
      postToFrame({ type: 'AUREKA_FPPE_LOAD', evaluation: validated })
      await loadEvaluations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validasi FPPE gagal.')
    } finally { setBusy(false) }
  }

  const returnForRevision = async () => {
    if (!activeEvaluation?.id || !['submitted', 'validated'].includes(String(activeEvaluation.status)) || busy) return
    const note = reviewNote.trim()
    if (note.length < 10) {
      setError('Catatan pengembalian wajib minimal 10 karakter agar alasan revisi dapat ditelusuri.')
      return
    }
    if (!window.confirm('Kembalikan FPPE untuk revisi? Formulir akan dibuka kembali untuk pengeditan.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data: auth, error: authError } = await sb.auth.getUser()
      if (authError || !auth.user) throw new Error('Sesi login tidak ditemukan.')
      const { data: updated, error: updateError } = await q().from('oppe_fppe_evaluations')
        .update({ status: 'reopened', review_note: note, validated_by: null, validated_at: null, updated_by: auth.user.id })
        .eq('id', activeEvaluation.id)
        .select('*').single()
      if (updateError) throw updateError
      setActiveEvaluation(updated as FppeRecord)
      setNotice('FPPE dikembalikan untuk revisi. Catatan pengembalian tersimpan.')
      postToFrame({ type: 'AUREKA_FPPE_LOAD', evaluation: updated })
      await loadEvaluations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FPPE gagal dikembalikan untuk revisi.')
    } finally { setBusy(false) }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return evaluations.filter((row) => {
      if (!term) return true
      const staff = staffForRecord(row)
      return [staff.name, staff.code, staff.title, row.profession_snapshot, row.trigger_reason, STATUS_LABEL[row.status] || row.status]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [evaluations, search, staffForRecord])

  if (!canManage) return <section className="fppeWorkspace"><div className="fppePanel">Akses FPPE hanya tersedia bagi Superadmin/Komite PMKP yang berwenang.</div></section>

  return (
    <section className="fppeWorkspace">
      <style>{CSS}</style>
      <div className="fppePanel fppeHeader">
        <div><div className="fppeEyebrow">AUREKA · FOCUSED PROFESSIONAL PRACTICE EVALUATION</div><h3>Evaluasi Praktik Profesional Terfokus (FPPE)</h3><p>FPPE terintegrasi di dalam Kontainer Audit OPPE. Identitas tenaga mengikuti Metadata dan roster Tim Tenaga Kerja. Pengajuan memerlukan validasi oleh akun yang berbeda dari pembuat.</p></div>
        <div className="fppeHeaderActions"><button type="button" onClick={() => void loadEvaluations()} disabled={loading || busy}>↻ Perbarui riwayat</button><button type="button" onClick={exportFppeListCsv} disabled={!filtered.length}>Ekspor daftar CSV</button><button type="button" className="fppePrimary" onClick={() => startNew()} disabled={busy}>＋ FPPE baru</button></div>
      </div>
      {error && <div className="fppeAlert fppeError" role="alert">{error}</div>}
      {notice && <div className="fppeAlert fppeSuccess" role="status">{notice}</div>}
      <div className="fppePanel fppeToolbar">
        <label><span>Unit FPPE</span><select value={roomId} disabled={busy} onChange={(e) => startNew(Number(e.target.value))}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <div className="fppeHelper"><strong>{roster.length}</strong> tenaga tersedia pada roster unit · <strong>{filtered.length}</strong> rekaman FPPE pada unit ini.</div>
        {activeEvaluation && <div className="fppeSelected"><span>Status FPPE: <b>{STATUS_LABEL[activeEvaluation.status] || activeEvaluation.status}</b></span><span>ID: <code>{String(activeEvaluation.id).slice(0, 8)}…</code></span></div>}
      </div>
      <div className="fppeLayout">
        <div className="fppeMain">
          <div className="fppePanel fppeFramePanel">
            <div className="fppeFrameHeader"><div><strong>Formulir FPPE</strong><span>Formulir tersimpan ke server AUREKA, bukan hanya di browser.</span></div>{activeEvaluation?.status && <span className={'fppeBadge ' + (STATUS_CLASS[activeEvaluation.status] || 'fppeNeutral')}>{STATUS_LABEL[activeEvaluation.status] || activeEvaluation.status}</span>}</div>
            <iframe
              ref={frameRef}
              title="Formulir FPPE AUREKA"
              src="/AUREKA-Hospital-Quality-Intelligence/fppe-digital.html"
              onLoad={() => {
                setFrameReady(true)
                postToFrame({
                  type: 'AUREKA_FPPE_INIT',
                  roster: rosterRef.current,
                  evaluation: activeRef.current || undefined,
                  reset: !activeRef.current,
                  readOnly: ['submitted', 'validated', 'archived'].includes(String(activeRef.current?.status || '')),
                })
              }}
              style={{ width: '100%', height: frameHeight, border: 0, display: 'block', background: '#edf2f5' }}
              sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
            />
            {!frameReady && <div className="fppeFrameLoading">Memuat formulir FPPE…</div>}
            {busy && <div className="fppeBusyOverlay">Menyimpan/validasi FPPE…</div>}
          </div>
          {activeEvaluation && (
            <div className="fppePanel fppeReviewPanel">
              <div><div className="fppeEyebrow">VALIDASI & REVISI</div><h4>Alur penelaahan</h4><p>FPPE yang diajukan hanya dapat divalidasi oleh pengguna selain pembuatnya. Pengembalian membutuhkan catatan alasan dan meninggalkan jejak audit.</p></div>
              <label><span>Catatan reviewer / alasan pengembalian</span><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Tuliskan temuan, kekurangan bukti, atau koreksi yang perlu dilakukan. Wajib minimal 10 karakter jika dikembalikan." disabled={activeEvaluation.status === 'archived'} /></label>
              <div className="fppeReviewActions">
                {activeEvaluation.status === 'submitted' && <button type="button" className="fppePrimary" onClick={() => void validateEvaluation()} disabled={busy}>✓ Validasi FPPE</button>}
                {['submitted','validated'].includes(String(activeEvaluation.status)) && <button type="button" className="fppeWarnButton" onClick={() => void returnForRevision()} disabled={busy}>Kembalikan untuk revisi</button>}
                <button type="button" onClick={() => openEvaluation(activeEvaluation)}>Muat kembali rekaman</button>
              </div>
            </div>
          )}
          {activeEvaluation && events.length > 0 && <div className="fppePanel fppeEvents"><div className="fppeEyebrow">AUDIT TRAIL</div><h4>Riwayat proses FPPE</h4><div className="fppeEventList">{events.map((event) => <div className="fppeEvent" key={String(event.id)}><span className="fppeDot" /><div><strong>{eventName(String(event.event_type))}</strong><small>{event.created_at ? new Date(event.created_at).toLocaleString('id-ID') : 'Waktu tidak tersedia'} · {event.actor_id ? 'Akun ' + String(event.actor_id).slice(0, 8) + '…' : 'Akun tidak tercatat'}</small><small>{event.from_status ? (STATUS_LABEL[String(event.from_status)] || event.from_status) + ' → ' : ''}{STATUS_LABEL[String(event.to_status)] || event.to_status} · {String(event.summary_snapshot_json?.decision || 'Ringkasan tersimpan')}</small></div></div>)}</div></div>}
        </div>
        <aside className="fppePanel fppeHistory">
          <div className="fppeHistoryHead"><div><div className="fppeEyebrow">ARSIP FPPE</div><h4>Riwayat evaluasi</h4></div><span>{filtered.length}</span></div>
          <input className="fppeLocalSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kode, jabatan, trigger…" />
          {loading ? <p className="fppeMuted">Memuat riwayat…</p> : <div className="fppeHistoryList">
            {filtered.map((record) => {
              const staff = staffForRecord(record)
              return <div className="fppeHistoryRecord" key={String(record.id)}>
                <button type="button" className={'fppeHistoryItem ' + (String(activeEvaluation?.id) === String(record.id) ? 'selected' : '')} onClick={() => openEvaluation(record)}>
                  <span className={'fppeBadge ' + (STATUS_CLASS[record.status] || 'fppeNeutral')}>{STATUS_LABEL[record.status] || record.status}</span>
                  <strong>{staff.name}</strong>
                  <small>{staff.code} · {staff.title}</small>
                  <small>{record.evaluation_type === 'triggered' ? 'Triggered FPPE' : 'Initial FPPE'} · {record.period_start || 'Tanggal belum diisi'} – {record.period_end || 'Tanggal belum diisi'}</small>
                  <small>Trigger: {record.trigger_reason || 'Belum ditentukan'}</small>
                </button>
                <div className="fppeHistoryExportActions">
                  <button type="button" onClick={() => exportFppePdf(record)} title={'Ekspor PDF FPPE ' + staff.name}>Ekspor PDF</button>
                  <button type="button" onClick={() => exportFppeJson(record)} title={'Unduh JSON FPPE ' + staff.name}>JSON</button>
                </div>
              </div>
            })}
            {!filtered.length && <div className="fppeEmpty">{search ? 'Tidak ada rekaman yang cocok.' : 'Belum ada rekaman FPPE pada unit ini. Gunakan FPPE baru untuk memulai.'}</div>}
          </div>}
        </aside>
      </div>
    </section>
  )
}

function eventName(type: string) {
  const labels: Record<string, string> = {
    created: 'Draf FPPE dibuat',
    draft_saved: 'Draf FPPE disimpan',
    submitted: 'FPPE diajukan untuk validasi',
    validated: 'FPPE divalidasi',
    reopened: 'FPPE dikembalikan untuk revisi',
    archived: 'FPPE diarsipkan',
    updated: 'Perubahan FPPE disimpan',
  }
  return labels[type] || 'Perubahan FPPE'
}

const CSS = `
.fppeWorkspace{display:grid;gap:12px;color:var(--ink);min-width:0}
.fppePanel{position:relative;min-width:0;background:linear-gradient(135deg,rgba(255,255,255,.58),rgba(255,255,255,.3));border:1px solid rgba(255,255,255,.75);border-radius:20px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.8);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);padding:15px}
.fppeHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.fppeEyebrow{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:var(--accent2)}
.fppeHeader h3{margin:5px 0;font-size:24px;letter-spacing:-.04em}
.fppeHeader p,.fppeReviewPanel p{margin:0;color:var(--muted);font-size:11px;line-height:1.65;max-width:900px}
.fppeHeaderActions,.fppeReviewActions{display:flex;gap:7px;flex-wrap:wrap}
.fppeWorkspace button{cursor:pointer;border:1px solid rgba(32,73,51,.12);border-radius:10px;background:rgba(255,255,255,.62);color:var(--ink);padding:9px 11px;font:inherit;font-size:10px;font-weight:850}
.fppeWorkspace button:disabled{opacity:.52;cursor:not-allowed}
.fppeWorkspace .fppePrimary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}
.fppeWorkspace .fppeWarnButton{background:#fff0dc;color:#865615;border-color:#efd6a7}
.fppeAlert{border-radius:12px;padding:10px 12px;font-size:10px;line-height:1.6}
.fppeError{background:#fff0ee;color:#903c34;border:1px solid #f0d1cc}
.fppeSuccess{background:#e8f7ee;color:#216a45;border:1px solid #cde9d8}
.fppeToolbar{display:grid;grid-template-columns:minmax(190px,300px) minmax(0,1fr);align-items:end;gap:12px}
.fppeToolbar label,.fppeReviewPanel label{display:grid;gap:5px;font-size:10px;font-weight:850;color:var(--muted)}
.fppeToolbar select,.fppeHistory input,.fppeReviewPanel textarea{width:100%;border:1px solid rgba(35,63,50,.15);border-radius:10px;background:rgba(255,255,255,.72);padding:10px 11px;color:var(--ink);font:inherit;font-size:11px}
.fppeHelper{font-size:10px;color:var(--muted);line-height:1.55}
.fppeSelected{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:9px;color:var(--muted);grid-column:1/-1}
.fppeLayout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(270px,.75fr);gap:12px;align-items:start}
.fppeMain{display:grid;gap:12px;min-width:0}
.fppeFramePanel{padding:0;overflow:hidden}
.fppeFrameHeader{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 15px;border-bottom:1px solid rgba(35,63,50,.1)}
.fppeFrameHeader>div{display:grid;gap:3px}.fppeFrameHeader strong{font-size:12px}.fppeFrameHeader span{font-size:9px;color:var(--muted)}
.fppeFrameLoading{padding:20px;text-align:center;color:var(--muted);font-size:11px}
.fppeBusyOverlay{position:absolute;inset:43px 0 0;z-index:4;background:rgba(255,255,255,.66);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;padding-top:40px;font-size:11px;font-weight:900;color:var(--accent2)}
.fppeBadge{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;line-height:1.25;white-space:nowrap}
.fppeNeutral{background:#edf0ee;color:#647269}.fppeInfo{background:#e8efff;color:#455c9a}.fppeGood{background:#e4f5eb;color:#216b49}.fppeWarn{background:#fff1dc;color:#8b5a12}
.fppeHistory{position:sticky;top:12px;display:grid;gap:10px;max-height:calc(100vh - 90px);overflow:hidden}
.fppeHistoryHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.fppeHistoryHead h4{margin:4px 0 0;font-size:16px}.fppeHistoryHead>span{font-size:11px;font-weight:900;background:rgba(255,255,255,.65);border-radius:999px;padding:5px 8px}
.fppeHistoryList{display:grid;gap:8px;overflow:auto;min-height:100px;padding-right:2px}
.fppeHistoryRecord{display:grid;gap:5px;min-width:0}
.fppeHistoryExportActions{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}
.fppeHistoryExportActions button{padding:6px 8px;font-size:9px;background:rgba(255,255,255,.55)}
.fppeHistoryItem{width:100%;display:grid;justify-items:start;gap:5px;text-align:left;border-radius:13px!important;padding:10px!important;border:1px solid rgba(35,63,50,.1)!important;background:rgba(255,255,255,.38)!important}
.fppeHistoryItem.selected{border-color:var(--accent)!important;background:rgba(255,255,255,.82)!important;box-shadow:0 0 0 2px rgba(var(--accent-rgb),.08)}
.fppeHistoryItem strong{font-size:11px;line-height:1.4;overflow-wrap:anywhere}
.fppeHistoryItem small{font-size:9px;color:var(--muted);line-height:1.45}
.fppeMuted,.fppeEmpty{font-size:10px;color:var(--muted);line-height:1.6}
.fppeReviewPanel{display:grid;gap:12px}
.fppeReviewPanel h4,.fppeEvents h4{margin:4px 0;font-size:16px}
.fppeReviewPanel label textarea{min-height:75px;resize:vertical}
.fppeEvents .fppeEventList{display:grid;gap:0;margin-top:10px}
.fppeEvent{display:grid;grid-template-columns:10px minmax(0,1fr);gap:10px;padding:9px 0;border-top:1px solid rgba(35,63,50,.09)}
.fppeDot{width:7px;height:7px;background:var(--accent);border-radius:99px;margin-top:5px}
.fppeEvent>div{display:grid;gap:4px}.fppeEvent strong{font-size:10px}.fppeEvent small{font-size:9px;line-height:1.45;color:var(--muted)}
.fppeEmpty{border:1px dashed rgba(35,63,50,.15);border-radius:12px;padding:14px;text-align:center}
@media(max-width:1050px){.fppeLayout{grid-template-columns:1fr}.fppeHistory{position:static;max-height:580px}}
@media(max-width:620px){.fppeToolbar{grid-template-columns:1fr}.fppeHeader h3{font-size:21px}}
`
