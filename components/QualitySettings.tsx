'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs'
import AurekaModal from '@/components/ui/AurekaModal'
import { buildIndicatorProfileBackup, parseIndicatorProfileBackup, type IndicatorProfileBackup } from '@/lib/aureka/indicator-profile-transfer'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const grains = ['patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate']
const YEARS = Array.from({ length: 12 }, (_, i) => 2024 + i)

type Room = { id: number; name: string }
type Model = Record<string, any>
type MetadataTab = 'programs' | 'profiles'

const empty = (room: Room | undefined, year: number, indicatorType = ''): Model => ({
  profile_year: year,
  code: '',
  room_id: room?.id ?? '',
  unit_name: room?.name ?? '',
  title: '',
  indicator_type: indicatorType,
  category: '',
  unit_of_measure: 'Persentase (%)',
  target_text: '',
  target_operator: '>=',
  target_value: '',
  numerator_definition: '',
  denominator_definition: '',
  measurement_grain: 'activity',
  schema_json: {},
  options_json: [{ label: 'Lainnya, tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true }],
  _indicator_direction: '',
  _schema_text: '{}',
  _options_text: JSON.stringify([{ label: 'Lainnya, tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true }], null, 2),
  version: 1,
  status: 'published',
  is_active: true,
})

const editModel = (profile: Model): Model => ({
  ...profile,
  _indicator_direction: profile.schema_json?.indicator_direction || '',
  _schema_text: JSON.stringify(profile.schema_json || {}, null, 2),
  _options_text: JSON.stringify(profile.options_json || [], null, 2),
})

type ProfileViewFilter = 'active' | 'needs_review' | 'target_pending' | 'complete' | 'draft' | 'retired' | 'all'

const metadataReviewReasons = (profile: Model): string[] => {
  const schema = profile.schema_json && typeof profile.schema_json === 'object' ? profile.schema_json : {}
  const measurementType = String(schema.measurement_type ?? '').trim().toLowerCase()
  const supportedMeasurementTypes = ['ratio', 'compliance', 'visit', 'door', 'minutes', 'numeric', 'occurrence']
  const reasons: string[] = []

  if (!['positive', 'negative'].includes(String(schema.indicator_direction ?? ''))) reasons.push('arah indikator')
  if (!String(profile.unit_of_measure ?? '').trim()) reasons.push('satuan')
  if (!String(profile.numerator_definition ?? '').trim()) reasons.push('definisi numerator')
  if (!String(profile.denominator_definition ?? '').trim()) reasons.push('definisi denominator')
  if (!supportedMeasurementTypes.includes(measurementType)) reasons.push('tipe pengukuran')
  if (String(schema.excel_header_mapping_status ?? '') === 'unmatched_header'
      || String(schema.excel_header_mapping_status ?? '') === 'missing_header_label') reasons.push('pemetaan header Excel')

  return reasons
}

const targetApprovalReasons = (profile: Model): string[] => {
  const schema = profile.schema_json && typeof profile.schema_json === 'object' ? profile.schema_json : {}
  const reasons: string[] = []
  if (String(schema.target_review_required ?? '').toLowerCase() === 'true') reasons.push('target belum disahkan')
  if (String(schema.definition_review_required ?? '').toLowerCase() === 'true') reasons.push('definisi perlu validasi pemilik indikator')
  if (String(schema.survey_scale_requires_confirmation ?? '').toLowerCase() === 'true') reasons.push('skala/perhitungan survei perlu konfirmasi')
  if (String(schema.header_mapping_semantics_review_required ?? '').toLowerCase() === 'true') reasons.push('kecocokan makna header Excel perlu konfirmasi')
  if (String(schema.no_unit_workbook_layout ?? '').toLowerCase() === 'true') reasons.push('layout workbook khusus unit belum tersedia')
  return reasons
}

const needsMetadataReview = (profile: Model): boolean => metadataReviewReasons(profile).length > 0
const needsTargetApproval = (profile: Model): boolean => targetApprovalReasons(profile).length > 0
const isActivePublished = (profile: Model): boolean => profile.is_active === true && profile.status === 'published'

const payloadFrom = (model: Model): Model => {
  const {
    id, created_at, updated_at, created_by, updated_by,
    _schema_text, _options_text, _indicator_direction, ...fields
  } = model
  const options = JSON.parse(String(_options_text ?? JSON.stringify(model.options_json || [])))
  const schema = JSON.parse(String(_schema_text ?? JSON.stringify(model.schema_json || {})))
  const direction = String(_indicator_direction ?? '').trim()
  if (direction === 'positive' || direction === 'negative') schema.indicator_direction = direction
  else delete schema.indicator_direction
  return {
    ...fields,
    room_id: Number(fields.room_id),
    profile_year: Number(fields.profile_year),
    target_value: fields.target_value === '' || fields.target_value === null || fields.target_value === undefined ? null : Number(fields.target_value),
    schema_json: schema,
    options_json: options,
  }
}

export default function QualitySettings({ rooms, initialTab = 'programs', showTabs = true, onTabChange, initialRoomId = null, lockRoomScope = false }: { rooms: Room[]; initialTab?: MetadataTab; showTabs?: boolean; onTabChange?: (tab: MetadataTab) => void; initialRoomId?: number | null; lockRoomScope?: boolean }) {
  const [year, setYear] = useState(2026)
  const [room, setRoom] = useState(lockRoomScope && initialRoomId != null ? String(initialRoomId) : '')
  useEffect(() => { if (lockRoomScope && initialRoomId != null) setRoom(String(initialRoomId)) }, [lockRoomScope, initialRoomId])
  const [profiles, setProfiles] = useState<Model[]>([])
  const [edit, setEdit] = useState<Model | null>(null)
  const [newOne, setNewOne] = useState<Model | null>(null)
  const [tab, setTab] = useState<MetadataTab>(initialTab)
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [programFilter, setProgramFilter] = useState('')
  const [profileViewFilter, setProfileViewFilter] = useState<ProfileViewFilter>('active')
  const editorRef = useRef<HTMLDivElement | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<IndicatorProfileBackup | null>(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg || typeof window === 'undefined') return
    const type = /gagal|belum|tidak dapat|periksa|wajib|kesalahan/i.test(msg) ? 'error' : /berhasil|tersimpan|dikirim|dihapus|diperbarui/i.test(msg) ? 'success' : 'info'
    window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message: msg, type, module: 'Metadata' } }))
  }, [msg])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const editorOpen = Boolean(edit || newOne)
  useEffect(() => {
    if (!editorOpen) return
    const frame = window.requestAnimationFrame(() => {
      void editorRef.current
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editorOpen])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = q().from('indicator_profiles').select('*')
        .eq('profile_year', year)
        .order('indicator_type', { ascending: true })
        .order('code', { ascending: true })
      if (room) query = query.eq('room_id', Number(room))
      const { data, error } = await query
      if (error) throw error
      setProfiles((data || []) as Model[])

    } catch (error) {
      setMsg('Gagal memuat profil indikator: ' + toUserFacingError(error, { fallback: 'Profil indikator belum dapat dimuat.' }))
    } finally {
      setLoading(false)
    }
  }, [year, room])

  useEffect(() => { void load() }, [load])

  useEffect(() => { setTab(initialTab) }, [initialTab])

  const programs = useMemo(() => {
    const values = new Set<string>()
    profiles.forEach((profile) => {
      const value = String(profile.indicator_type || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'id'))
  }, [profiles])

  const programStats = useMemo(() => programs.map((name) => {
    const matching = profiles.filter((profile) => String(profile.indicator_type || '').trim() === name)
    return {
      name,
      total: matching.length,
      active: matching.filter((profile) => profile.is_active && profile.status === 'published').length,
      retired: matching.filter((profile) => !profile.is_active || profile.status === 'retired').length,
    }
  }), [programs, profiles])

  const activeProfileCount = useMemo(() => profiles.filter(isActivePublished).length, [profiles])
  const activeReviewCount = useMemo(
    () => profiles.filter((profile) => isActivePublished(profile) && needsMetadataReview(profile)).length,
    [profiles],
  )
  const activeTargetPendingCount = useMemo(
    () => profiles.filter((profile) => isActivePublished(profile) && needsTargetApproval(profile)).length,
    [profiles],
  )

  const filteredProfiles = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id')
    return profiles.filter((profile) => {
      const active = isActivePublished(profile)
      if (profileViewFilter === 'active' && !active) return false
      if (profileViewFilter === 'needs_review' && (!active || !needsMetadataReview(profile))) return false
      if (profileViewFilter === 'target_pending' && (!active || !needsTargetApproval(profile))) return false
      if (profileViewFilter === 'complete' && (!active || needsMetadataReview(profile))) return false
      if (profileViewFilter === 'draft' && profile.status !== 'draft') return false
      if (profileViewFilter === 'retired' && profile.status !== 'retired' && profile.is_active !== false) return false
      if (programFilter && String(profile.indicator_type || '') !== programFilter) return false
      if (!normalized) return true
      return [profile.code, profile.title, profile.indicator_type, profile.category, profile.unit_name]
        .some((value) => String(value || '').toLocaleLowerCase('id').includes(normalized))
    })
  }, [profiles, search, programFilter, profileViewFilter])

  const openNew = (programName = '') => {
    const selectedRoom = rooms.find((item) => String(item.id) === room)
    setEdit(null)
    setMsg('')
    setNewOne(empty(selectedRoom, year, programName))
    setTab('profiles')
    onTabChange?.('profiles')
  }

  const publish = async () => {
    if (!edit || saving) return
    setMsg('')
    if (!String(edit.code || '').trim() || !String(edit.title || '').trim() || !Number(edit.room_id)) {
      setMsg('Kode, nama indikator, dan unit pemilik wajib diisi.')
      return
    }

    let payload: Model
    try {
      payload = payloadFrom(edit)
      if (!Array.isArray(payload.options_json)) throw new Error('Opsi instrumen harus berupa array JSON.')
      if (!payload.schema_json || typeof payload.schema_json !== 'object' || Array.isArray(payload.schema_json)) {
        throw new Error('Struktur instrumen harus berupa objek JSON.')
      }
    } catch (error) {
      setMsg('Metadata belum tersimpan: ' + toUserFacingError(error, { fallback: 'JSON tidak valid.' }))
      return
    }

    setSaving(true)
    try {
      const { data: userResult, error: userError } = await sb.auth.getUser()
      if (userError) throw userError
      if (!userResult.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')

      const next = {
        ...payload,
        version: Number(edit.version || 1) + 1,
        status: 'published',
        is_active: true,
        created_by: userResult.user.id,
        updated_by: userResult.user.id,
      }
      const { data: publishedId, error: publishError } = await q().rpc('publish_indicator_profile_version', {
        p_prior_id: edit.id,
        p_profile: next,
      })
      if (publishError) throw publishError
      if (!publishedId) throw new Error('Server tidak mengembalikan identitas versi baru.')

      const { data: savedProfile, error: verifyError } = await q().from('indicator_profiles')
        .select('id,code,version,status,is_active')
        .eq('id', String(publishedId))
        .maybeSingle()
      if (verifyError) throw new Error('Versi baru sudah dikirim ke server, tetapi verifikasi baca gagal: ' + toUserFacingError(verifyError, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      if (!savedProfile || savedProfile.status !== 'published' || savedProfile.is_active !== true) {
        throw new Error('RPC mengembalikan ID, tetapi versi baru belum terbaca sebagai profil aktif. Mohon muat ulang dan periksa riwayat versi.')
      }

      setEdit(null)
      setNewOne(null)
      setProgramFilter('')
      setProfileViewFilter('active')
      setSearch(String(savedProfile.code || edit.code).trim())
      await load()
      setMsg(`Perubahan berhasil tersimpan dan diverifikasi sebagai versi aktif v${savedProfile.version} untuk indikator ${savedProfile.code}. Versi sebelumnya tetap tersimpan sebagai riwayat.`)
    } catch (error) {
      setMsg('Versi baru gagal dipublikasikan: ' + toUserFacingError(error, { fallback: 'Periksa hak akses dan metadata indikator.' }))
    } finally {
      setSaving(false)
    }
  }

  const add = async () => {
    if (!newOne || saving) return
    setMsg('')
    if (!String(newOne.code || '').trim() || !String(newOne.title || '').trim() || !Number(newOne.room_id)) {
      setMsg('Kode, nama indikator, dan unit pemilik wajib diisi.')
      return
    }

    let payload: Model
    try {
      payload = payloadFrom(newOne)
      if (!Array.isArray(payload.options_json)) throw new Error('Opsi instrumen harus berupa array JSON.')
      if (!payload.schema_json || typeof payload.schema_json !== 'object' || Array.isArray(payload.schema_json)) {
        throw new Error('Struktur instrumen harus berupa objek JSON.')
      }
    } catch (error) {
      setMsg('Metadata belum tersimpan: ' + toUserFacingError(error, { fallback: 'JSON tidak valid.' }))
      return
    }

    setSaving(true)
    try {
      const { data: duplicate, error: duplicateError } = await q().from('indicator_profiles')
        .select('id')
        .eq('profile_year', payload.profile_year)
        .eq('room_id', payload.room_id)
        .eq('code', String(payload.code).trim())
        .eq('is_active', true)
        .limit(1)
      if (duplicateError) throw duplicateError
      if (duplicate?.length) {
        setMsg('Kode indikator tersebut sudah aktif pada unit dan tahun yang sama. Gunakan Edit untuk menerbitkan versi baru.')
        return
      }

      const { data: userResult, error: userError } = await sb.auth.getUser()
      if (userError) throw userError
      if (!userResult.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')

      const { data: insertedProfile, error } = await q().from('indicator_profiles').insert({
        ...payload,
        code: String(payload.code).trim(),
        title: String(payload.title).trim(),
        version: 1,
        status: 'published',
        is_active: true,
        created_by: userResult.user.id,
        updated_by: userResult.user.id,
      }).select('id,code,version,status,is_active').single()
      if (error) throw error
      if (!insertedProfile || insertedProfile.status !== 'published' || insertedProfile.is_active !== true) {
        throw new Error('Data terkirim, tetapi profil baru belum terbaca sebagai profil aktif.')
      }

      setNewOne(null)
      setProgramFilter('')
      setProfileViewFilter('active')
      setSearch(String(insertedProfile.code || newOne.code).trim())
      await load()
      setMsg(`Indikator ${insertedProfile.code} berhasil ditambahkan dan diverifikasi sebagai versi aktif v${insertedProfile.version}.`)
    } catch (error) {
      setMsg('Indikator gagal ditambahkan: ' + toUserFacingError(error, { fallback: 'Periksa hak akses dan kelengkapan metadata.' }))
    } finally {
      setSaving(false)
    }
  }

  const retire = async (profile: Model) => {
    if (saving || !profile?.id) return
    setMsg('')
    setSaving(true)
    const { data: userResult } = await sb.auth.getUser()
    if (!userResult.user) {
      setMsg('Sesi login tidak ditemukan. Silakan login ulang.')
      setSaving(false)
      return
    }
    const { error } = await q().from('indicator_profiles')
      .update({ status: 'retired', is_active: false, updated_by: userResult.user.id })
      .eq('id', profile.id)
    if (error) setMsg('Indikator gagal dipensiunkan: ' + toUserFacingError(error, { fallback: 'Indikator belum dapat dipensiunkan.' }))
    else setMsg('Indikator dipensiunkan. Riwayat dan data capaian yang sudah ada tidak dihapus.')
    await load()
    setSaving(false)
  }

  const exportProfileSet = () => {
    try {
      const selectedRoom = rooms.find((item) => String(item.id) === room)
      const backup = buildIndicatorProfileBackup({
        profileYear: year,
        scopeRoomId: room ? Number(room) : null,
        scopeName: selectedRoom?.name || 'Semua unit',
        profiles,
      })
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const scopePart = selectedRoom
        ? selectedRoom.name.toLocaleLowerCase('id').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'semua-unit'
      anchor.href = url
      anchor.download = 'aureka-profil-indikator-' + year + '-' + scopePart + '.json'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Ekspor ' + backup.profiles.length.toLocaleString('id-ID') + ' profil aktif tahun ' + year + ' berhasil dibuat.')
    } catch (error) {
      setMsg('Profil indikator gagal diekspor: ' + toUserFacingError(error, { fallback: 'Periksa cakupan tahun dan unit.' }))
    }
  }

  const readProfileImportFile = async (file?: File) => {
    if (!file) return
    setMsg('')
    try {
      const parsed = parseIndicatorProfileBackup(JSON.parse(await file.text()))
      const selectedScopeRoomId = room ? Number(room) : null
      if (parsed.scope.room_id !== selectedScopeRoomId) {
        throw new Error(
          parsed.scope.room_id === null
            ? 'Berkas ini mencakup semua unit. Pilih Semua unit sebelum mengimpor.'
            : 'Berkas ini hanya untuk ' + parsed.scope.unit_name + '. Pilih unit tersebut sebelum mengimpor.',
        )
      }
      setImportPreview(parsed)
      setReplaceConfirmed(false)
      setMsg('Berkas ' + file.name + ' tervalidasi. Periksa ringkasan dan konfirmasi sebelum penggantian profil.')
    } catch (error) {
      setImportPreview(null)
      setReplaceConfirmed(false)
      setMsg('Berkas profil indikator tidak dapat digunakan: ' + toUserFacingError(error, { fallback: 'Pastikan berkas merupakan ekspor JSON Profil Indikator AUREKA.' }))
    }
  }

  const replaceProfileSet = async () => {
    if (!importPreview || !replaceConfirmed || saving) return
    setSaving(true)
    setMsg('')
    try {
      const { data, error } = await q().rpc('replace_indicator_profile_set', {
        p_profile_year: year,
        p_scope_room_id: room ? Number(room) : null,
        p_profiles: importPreview.profiles,
      })
      if (error) throw error
      if (!data || typeof data !== 'object') {
        throw new Error('Server tidak mengembalikan ringkasan hasil impor yang valid.')
      }
      const result = data as Record<string, unknown>
      const imported = Number(result.imported_profiles)
      if (!Number.isInteger(imported) || imported !== importPreview.profiles.length) {
        throw new Error('Jumlah profil yang diterbitkan tidak sesuai dengan berkas. Muat ulang dan periksa hasil impor.')
      }

      const auditRemapped = Number(result.relinked_responses || 0)
      const recordsRekeyed = Number(result.rekeyed_audit_records || 0)
      const retired = Number(result.retired_profiles || 0)
      const importedSourceYear = importPreview.profile_year
      const targetScopeRoomId = room ? Number(room) : null
      window.dispatchEvent(new CustomEvent('aureka:indicator-profiles-updated', {
        detail: { year, scopeRoomId: targetScopeRoomId },
      }))
      setImportPreview(null)
      setReplaceConfirmed(false)
      setSearch('')
      setProgramFilter('')
      setProfileViewFilter('active')
      await load()
      setMsg(
        'Penggantian profil tahun ' + year + ' berhasil: ' + imported.toLocaleString('id-ID') +
        ' profil diterbitkan dan ' + retired.toLocaleString('id-ID') + ' versi lama dipensiunkan. ' +
        auditRemapped.toLocaleString('id-ID') + ' respons audit ditautkan ulang dan ' +
        recordsRekeyed.toLocaleString('id-ID') + ' catatan audit disesuaikan kodenya. ' +
        (importedSourceYear !== year ? 'Sumber berkas tahun ' + importedSourceYear + ' diterapkan ke tahun tujuan ' + year + '. ' : '') +
        'Riwayat dan nilai audit tetap dipertahankan.',
      )
    } catch (error) {
      setMsg('Impor tidak berhasil. Tidak ada penggantian parsial yang diterapkan: ' + toUserFacingError(error, { fallback: 'Periksa validitas berkas, konflik kode, dan hak akses Superadmin.' }))
    } finally {
      setSaving(false)
    }
  }

    const fieldStyle: CSSProperties = {
    display: 'grid',
    gap: 5,
    fontSize: 11,
    color: 'var(--muted)',
  }
  const editor = (model: Model, setModel: (value: Model) => void, onSave: () => void) => (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.30)', border: '1px solid rgba(255,255,255,.68)' }}>
      <div className="eyebrow">{model.id ? 'EDIT · TERBITKAN VERSI BARU' : 'INDIKATOR BARU'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9, marginTop: 10 }}>
        <label className="field" style={fieldStyle}><span>Tahun metadata</span><select value={model.profile_year} onChange={(e) => setModel({ ...model, profile_year: Number(e.target.value) })}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field" style={fieldStyle}><span>Kode indikator</span><input required value={model.code || ''} onChange={(e) => setModel({ ...model, code: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Unit pemilik</span><select required value={model.room_id ?? ''} disabled={lockRoomScope} onChange={(e) => { const selected = rooms.find((item) => String(item.id) === e.target.value); setModel({ ...model, room_id: e.target.value ? Number(e.target.value) : '', unit_name: selected?.name || '' }) }}><option value="">Pilih unit</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field" style={fieldStyle}><span>Nama indikator</span><input required value={model.title || ''} onChange={(e) => setModel({ ...model, title: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Program kerja / jenis indikator</span><input value={model.indicator_type || ''} placeholder="Mis. INM, IMP-RS, IMP-Unit" onChange={(e) => setModel({ ...model, indicator_type: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Kategori</span><input value={model.category || ''} placeholder="Mis. Proses, Outcome, Struktur" onChange={(e) => setModel({ ...model, category: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Satuan</span><input value={model.unit_of_measure || ''} placeholder="Persentase (%), menit, angka" onChange={(e) => setModel({ ...model, unit_of_measure: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Target tertulis</span><input value={model.target_text || ''} placeholder="Mis. ≥ 85%" onChange={(e) => setModel({ ...model, target_text: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Operator target</span><select value={model.target_operator || '>='} onChange={(e) => setModel({ ...model, target_operator: e.target.value })}><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option><option value=">">&gt;</option><option value="<">&lt;</option></select></label>
        <label className="field" style={fieldStyle}><span>Nilai target numerik</span><input type="number" value={model.target_value ?? ''} onChange={(e) => setModel({ ...model, target_value: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Measurement grain</span><select value={model.measurement_grain || 'activity'} onChange={(e) => setModel({ ...model, measurement_grain: e.target.value })}>{grains.map((grain) => <option key={grain} value={grain}>{grain}</option>)}</select></label>
        <label className="field" style={fieldStyle}><span>Arah indikator</span><select value={model._indicator_direction || ''} onChange={(e) => setModel({ ...model, _indicator_direction: e.target.value })}><option value="">Pilih arah indikator</option><option value="positive">Positif, semakin tinggi semakin baik</option><option value="negative">Negatif, semakin rendah semakin baik</option></select></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Definisi numerator</span><textarea value={model.numerator_definition || ''} onChange={(e) => setModel({ ...model, numerator_definition: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Definisi denominator</span><textarea value={model.denominator_definition || ''} onChange={(e) => setModel({ ...model, denominator_definition: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Struktur instrumen (JSON object)</span><textarea style={{ minHeight: 95, fontFamily: 'ui-monospace,monospace', fontSize: 11 }} value={model._schema_text ?? '{}'} onChange={(e) => setModel({ ...model, _schema_text: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Opsi / kamus respons (JSON array)</span><textarea style={{ minHeight: 150, fontFamily: 'ui-monospace,monospace', fontSize: 11 }} value={model._options_text ?? '[]'} onChange={(e) => setModel({ ...model, _options_text: e.target.value })} /></label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="textButton" disabled={saving} onClick={() => { setEdit(null); setNewOne(null) }}>Batal</button>
        <LiquidGlassButton onClick={onSave} disabled={saving}>{saving ? 'Menyimpan…' : model.id ? 'Terbitkan versi baru' : 'Tambah indikator'}</LiquidGlassButton>
      </div>
      <div style={{ marginTop: 7, fontSize: 11, color: 'var(--muted)' }}>
        Perubahan pada indikator yang sudah terbit dibuat sebagai versi baru. Opsi JSON harus berupa array dan struktur instrumen harus berupa objek.
      </div>
    </div>
  )

  return (
    <div className="qualitySettingsWorkspace" style={{ display: 'grid', gap: 14 }}>
      <LiquidGlass className="qualitySettingsSurface" style={{ padding: 14 }}>
        <WorkspaceModuleHeader
          title={tab === 'programs' ? 'Program Kerja' : 'Profil Indikator'}
          description={tab === 'programs' ? 'Kelola klasifikasi program kerja yang menjadi dasar pengelompokan indikator mutu.' : 'Kelola definisi, target, metode pengukuran, dan versi profil indikator lintas unit.'}
          eyebrow="Metadata · Superadmin"
        />
{showTabs && (
          <WorkspaceTabs
            className="metadataTabs"
            idPrefix="metadata"
            label="Bagian metadata"
            value={tab}
            onChange={setTab}
            panelId="metadata-active-panel"
            items={[
              { value: 'programs', label: 'Program Kerja' },
              { value: 'profiles', label: 'Profil Indikator' },
            ] as const}
          />
        )}

        {msg && <div className="msg visible" role={/gagal|belum|tidak ditemukan|wajib|sudah aktif/i.test(msg) ? 'alert' : 'status'} aria-live={/gagal|belum|tidak ditemukan|wajib|sudah aktif/i.test(msg) ? 'assertive' : 'polite'} style={{ color: /gagal|belum|tidak ditemukan|wajib|sudah aktif/i.test(msg) ? '#9c3f32' : '#0f7656', marginTop: 12 }}>{msg}</div>}

        <div className="metadataScopeFilters" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--muted)' }}><span>Tahun metadata</span><select value={year} onChange={(e) => { setYear(Number(e.target.value)); setProgramFilter(''); setSearch('') }}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--muted)' }}><span>Unit pemilik</span><select value={room} disabled={lockRoomScope} onChange={(e) => { setRoom(e.target.value); setProgramFilter('') }}>{!lockRoomScope && <option value="">Semua unit</option>}{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{loading ? 'Memuat metadata…' : `${activeProfileCount.toLocaleString('id-ID')} indikator aktif · ${profiles.length.toLocaleString('id-ID')} versi tersimpan`}</div>
        </div>

        <div id="metadata-active-panel" className="workspaceActivePanel" role="tabpanel" aria-labelledby={'metadata-tab-' + tab} tabIndex={0}>
        {tab === 'programs' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Nama program kerja mengikuti klasifikasi <code>Program kerja / jenis indikator</code>. Pilih satu program untuk meninjau dan mengelola seluruh indikator di dalamnya.</div>
              <LiquidGlassButton onClick={() => openNew()} disabled={saving}>+ Tambah indikator / program</LiquidGlassButton>
            </div>
            {programStats.length === 0 ? (
              <div style={{ border: '1px dashed rgba(20,34,27,.18)', borderRadius: 15, padding: 18, color: 'var(--muted)', fontSize: 11 }}>Belum ada profil indikator pada tahun dan unit terpilih. Tambahkan indikator untuk mulai membentuk kamus program kerja.</div>
            ) : (
              <div className="metadataProgramGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(225px,1fr))', gap: 9 }}>
                {programStats.map((program) => (
                  <div key={program.name} style={{ padding: 13, border: '1px solid rgba(20,34,27,.09)', borderRadius: 16, background: 'rgba(255,255,255,.25)', minWidth: 0 }}>
                    <div style={{ fontWeight: 850, fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{program.name}</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '10px 0 12px', fontSize: 11, color: 'var(--muted)' }}>
                      <span>{program.total} profil</span><span>·</span><span>{program.active} aktif</span>{program.retired > 0 && <><span>·</span><span>{program.retired} dipensiunkan</span></>}
                    </div>
                    <div className="mpCardActions">
                      <button type="button" className="textButton" onClick={() => { setProgramFilter(program.name); setSearch(''); setTab('profiles'); onTabChange?.('profiles') }}>Kelola indikator</button>
                      <button type="button" className="textButton" onClick={() => openNew(program.name)}>+ Tambah ke program</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'profiles' && (
          <div style={{ marginTop: 12 }}>
            <div className="metadataProfileFilters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input className="qualitySettingsLocalSearch" aria-label="Cari kode, nama indikator, program, kategori, atau unit" placeholder="Cari kode, indikator, program, kategori, unit…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 240px', minWidth: 180 }} />
              <select
                aria-label="Filter kelengkapan dan status indikator"
                value={profileViewFilter}
                onChange={(e) => setProfileViewFilter(e.target.value as ProfileViewFilter)}
              >
                <option value="active">Indikator aktif ({activeProfileCount})</option>
                <option value="needs_review">Perlu perbaikan teknis, merah ({activeReviewCount})</option>
                <option value="target_pending">Target/definisi menunggu pengesahan, kuning ({activeTargetPendingCount})</option>
                <option value="complete">Metadata siap digunakan</option>
                <option value="draft">Draf</option>
                <option value="retired">Riwayat versi (retired)</option>
                <option value="all">Semua versi</option>
              </select>
              <select aria-label="Filter program kerja" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}><option value="">Semua program kerja</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select>
              <button type="button" className="textButton" onClick={() => { setSearch(''); setProgramFilter(''); setProfileViewFilter('active') }}>Reset filter</button>
              <LiquidGlassButton onClick={() => importFileRef.current?.click()} disabled={saving || loading}>Import profil</LiquidGlassButton>
              <LiquidGlassButton onClick={exportProfileSet} disabled={saving || loading || activeProfileCount === 0}>Export profil</LiquidGlassButton>
              <LiquidGlassButton onClick={() => openNew(programFilter)} disabled={saving}>+ Tambah indikator</LiquidGlassButton>
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              aria-label="Pilih berkas ekspor profil indikator AUREKA"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void readProfileImportFile(file)
              }}
            />
            <AurekaModal
              open={Boolean(importPreview)}
              title="Konfirmasi penggantian Profil Indikator"
              subtitle="Periksa tahun tujuan dan cakupan unit sebelum menerapkan seluruh isi berkas."
              closeDisabled={saving}
              onClose={() => { setImportPreview(null); setReplaceConfirmed(false) }}
            >
              {importPreview && (
                <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>Tahun sumber</div>
                      <strong style={{ fontSize: 15 }}>{importPreview.profile_year}</strong>
                    </div>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>Tahun tujuan</div>
                      <strong style={{ fontSize: 15 }}>{year}</strong>
                    </div>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>Profil dalam berkas</div>
                      <strong style={{ fontSize: 15 }}>{importPreview.profiles.length.toLocaleString('id-ID')}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Cakupan: <strong style={{ color: 'var(--text, inherit)' }}>{importPreview.scope.unit_name}</strong>.
                    Seluruh profil aktif/draf pada tahun dan cakupan tujuan akan dipensiunkan, lalu diganti dengan isi berkas ini.
                  </div>
                  <div style={{ border: '1px solid rgba(190,125,35,.35)', background: 'rgba(190,125,35,.07)', borderRadius: 10, padding: 11, fontSize: 10, lineHeight: 1.6 }}>
                    Data audit tidak dihapus. Sistem akan menautkan ulang ID indikator dan mengganti kode pada nilai audit lama yang memiliki pasangan pemetaan. Jika pemetaan berpotensi menimpa nilai indikator lain, seluruh transaksi impor akan dibatalkan.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, lineHeight: 1.5 }}>
                    <input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} style={{ marginTop: 2 }} />
                    Saya memahami bahwa seluruh profil aktif pada cakupan tahun tujuan akan diganti dengan isi berkas ini.
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="textButton" disabled={saving} onClick={() => { setImportPreview(null); setReplaceConfirmed(false) }}>Batal</button>
                    <LiquidGlassButton onClick={() => void replaceProfileSet()} disabled={saving || !replaceConfirmed}>
                      {saving ? 'Mengganti profil…' : 'Ganti seluruh profil'}
                    </LiquidGlassButton>
                  </div>
                </div>
              )}
            </AurekaModal>
            <AurekaModal
              open={Boolean(edit || newOne)}
              title={edit ? 'Edit indikator' : 'Tambah indikator'}
              subtitle={edit ? 'Perubahan diterbitkan sebagai versi baru; versi lama tetap tersimpan.' : 'Isi profil indikator mutu baru untuk unit dan tahun terpilih.'}
              closeDisabled={saving}
              onClose={() => { setEdit(null); setNewOne(null) }}
            >
              <div ref={editorRef} className="akModalEditor">
                {edit
                  ? editor(edit, setEdit, () => void publish())
                  : newOne
                    ? editor(newOne, setNewOne, () => void add())
                    : null}
              </div>
            </AurekaModal>
            <div style={{ display: 'grid', gap: 7 }}>
              {filteredProfiles.map((profile) => (
                <div key={profile.id} style={{ padding: 11, border: needsMetadataReview(profile) ? '1px solid rgba(184,52,52,.48)' : '1px solid rgba(20,34,27,.09)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', opacity: profile.is_active ? 1 : .62, background: 'rgba(255,255,255,.19)' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontSize: 11, fontWeight: 850, overflowWrap: 'anywhere' }}>{profile.code} · {profile.title || '(Tanpa nama)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {(profile.indicator_type || 'Tanpa program')} · {profile.unit_name || 'Unit belum ditentukan'} · {profile.category || 'Kategori belum diisi'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Target: {profile.target_text || '-'} · Satuan: {profile.unit_of_measure || '-'} · Grain: {profile.measurement_grain || '-'} · v{profile.version || 1} · {profile.status || '-'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Arah capaian: {profile.schema_json?.indicator_direction === 'positive' ? 'Positif' : profile.schema_json?.indicator_direction === 'negative' ? 'Negatif' : 'Belum ditetapkan'}
                    </div>
                    {needsMetadataReview(profile) && <div style={{ marginTop: 5, color: '#a83232', fontSize: 11, fontWeight: 750 }}>Perlu perbaikan teknis: {metadataReviewReasons(profile).join(', ')}.</div>}
                    {!needsMetadataReview(profile) && needsTargetApproval(profile) && <div style={{ marginTop: 5, color: '#9a6700', fontSize: 11, fontWeight: 750 }}>Perlu pengesahan pemilik indikator: {targetApprovalReasons(profile).join(', ')}. Indikator tetap dapat dipetakan dan dicatat; target belum dihitung sebagai target resmi.</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(profile.status === 'draft' || isActivePublished(profile)) && <button type="button" className="textButton" disabled={saving} onClick={() => { setEdit(editModel(profile)); setNewOne(null); setMsg('') }}>{profile.status === 'draft' ? 'Tinjau / terbitkan' : 'Edit indikator'}</button>}
                    {isActivePublished(profile) && <button type="button" className="textButton" disabled={saving} onClick={() => void retire(profile)}>Pensiunkan</button>}
                    {(profile.status === 'retired' || profile.is_active === false) && <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Riwayat versi · baca saja</span>}
                  </div>
                </div>
              ))}
              {!filteredProfiles.length && <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>Tidak ada indikator yang cocok dengan filter ini.</div>}
            </div>
          </div>
        )}



        </div>
      </LiquidGlass>
    </div>
  )
}
