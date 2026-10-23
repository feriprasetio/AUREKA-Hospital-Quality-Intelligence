'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const grains = ['patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate']
const YEARS = Array.from({ length: 12 }, (_, i) => 2024 + i)

type Room = { id: number; name: string }
type Model = Record<string, any>
type MetadataTab = 'programs' | 'profiles' | 'review'

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
  options_json: [{ label: 'Lainnya — tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true }],
  _schema_text: '{}',
  _options_text: JSON.stringify([{ label: 'Lainnya — tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true }], null, 2),
  version: 1,
  status: 'published',
  is_active: true,
})

const editModel = (profile: Model): Model => ({
  ...profile,
  _schema_text: JSON.stringify(profile.schema_json || {}, null, 2),
  _options_text: JSON.stringify(profile.options_json || [], null, 2),
})

const payloadFrom = (model: Model): Model => {
  const {
    id, created_at, updated_at, created_by, updated_by,
    _schema_text, _options_text, ...fields
  } = model
  const options = JSON.parse(String(_options_text ?? JSON.stringify(model.options_json || [])))
  const schema = JSON.parse(String(_schema_text ?? JSON.stringify(model.schema_json || {})))
  return {
    ...fields,
    room_id: Number(fields.room_id),
    profile_year: Number(fields.profile_year),
    target_value: fields.target_value === '' || fields.target_value === null || fields.target_value === undefined ? null : Number(fields.target_value),
    schema_json: schema,
    options_json: options,
  }
}

export default function QualitySettings({ rooms }: { rooms: Room[] }) {
  const [year, setYear] = useState(2026)
  const [room, setRoom] = useState('')
  const [profiles, setProfiles] = useState<Model[]>([])
  const [pending, setPending] = useState<Model[]>([])
  const [edit, setEdit] = useState<Model | null>(null)
  const [newOne, setNewOne] = useState<Model | null>(null)
  const [tab, setTab] = useState<MetadataTab>('programs')
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let query = q().from('indicator_profiles').select('*')
      .eq('profile_year', year)
      .order('indicator_type', { ascending: true })
      .order('code', { ascending: true })
    if (room) query = query.eq('room_id', Number(room))
    const { data, error } = await query
    if (error) setMsg('Gagal memuat kamus indikator: ' + error.message)
    else setProfiles((data || []) as Model[])

    const { data: reviewData, error: reviewError } = await q()
      .from('quality_record_responses')
      .select('id,record_id,indicator_id,response_label,other_text,classification_note,created_at')
      .eq('review_status', 'pending')
      .order('created_at', { ascending: false })
    if (reviewError) setMsg((previous) => previous || ('Gagal memuat daftar klasifikasi: ' + reviewError.message))
    else setPending((reviewData || []) as Model[])
    setLoading(false)
  }, [year, room])

  useEffect(() => { void load() }, [load])

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

  const filteredProfiles = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id')
    return profiles.filter((profile) => {
      if (programFilter && String(profile.indicator_type || '') !== programFilter) return false
      if (!normalized) return true
      return [profile.code, profile.title, profile.indicator_type, profile.category, profile.unit_name]
        .some((value) => String(value || '').toLocaleLowerCase('id').includes(normalized))
    })
  }, [profiles, search, programFilter])

  const openNew = (programName = '') => {
    const selectedRoom = rooms.find((item) => String(item.id) === room) || rooms[0]
    setEdit(null)
    setMsg('')
    setNewOne(empty(selectedRoom, year, programName))
    setTab('profiles')
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
      setMsg('Metadata belum tersimpan: ' + (error instanceof Error ? error.message : 'JSON tidak valid.'))
      return
    }
    setSaving(true)
    const { data: userResult } = await sb.auth.getUser()
    if (!userResult.user) {
      setMsg('Sesi login tidak ditemukan. Silakan login ulang.')
      setSaving(false)
      return
    }
    const priorId = edit.id
    const next = {
      ...payload,
      version: Number(edit.version || 1) + 1,
      status: 'published',
      is_active: true,
      created_by: userResult.user.id,
      updated_by: userResult.user.id,
    }
    const { error: insertError } = await q().from('indicator_profiles').insert(next)
    if (insertError) {
      setMsg('Versi baru gagal dipublikasikan: ' + insertError.message)
      setSaving(false)
      return
    }
    const { error: retireError } = await q().from('indicator_profiles')
      .update({ status: 'retired', is_active: false, updated_by: userResult.user.id })
      .eq('id', priorId)
    setEdit(null)
    if (retireError) setMsg('Versi baru berhasil dibuat, tetapi versi sebelumnya belum berhasil dipensiunkan: ' + retireError.message)
    else setMsg('Versi baru dipublikasikan. Versi sebelumnya tetap tersimpan sebagai riwayat.')
    await load()
    setSaving(false)
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
      setMsg('Metadata belum tersimpan: ' + (error instanceof Error ? error.message : 'JSON tidak valid.'))
      return
    }
    setSaving(true)
    const { data: duplicate, error: duplicateError } = await q().from('indicator_profiles')
      .select('id').eq('profile_year', payload.profile_year).eq('room_id', payload.room_id)
      .eq('code', String(payload.code).trim()).eq('is_active', true).limit(1)
    if (duplicateError) {
      setMsg('Pemeriksaan duplikasi gagal: ' + duplicateError.message)
      setSaving(false)
      return
    }
    if (duplicate?.length) {
      setMsg('Kode indikator tersebut sudah aktif pada unit dan tahun yang sama. Gunakan Edit untuk menerbitkan versi baru.')
      setSaving(false)
      return
    }
    const { data: userResult } = await sb.auth.getUser()
    if (!userResult.user) {
      setMsg('Sesi login tidak ditemukan. Silakan login ulang.')
      setSaving(false)
      return
    }
    const { error } = await q().from('indicator_profiles').insert({
      ...payload,
      code: String(payload.code).trim(),
      title: String(payload.title).trim(),
      version: 1,
      status: 'published',
      is_active: true,
      created_by: userResult.user.id,
      updated_by: userResult.user.id,
    })
    if (error) setMsg('Indikator gagal ditambahkan: ' + error.message)
    else {
      setNewOne(null)
      setMsg('Indikator berhasil ditambahkan ke kamus.')
    }
    await load()
    setSaving(false)
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
    if (error) setMsg('Indikator gagal dipensiunkan: ' + error.message)
    else setMsg('Indikator dipensiunkan. Riwayat dan data capaian yang sudah ada tidak dihapus.')
    await load()
    setSaving(false)
  }

  const classify = async (id: string, code: number) => {
    const { data: userResult } = await sb.auth.getUser()
    if (!userResult.user) {
      setMsg('Sesi login tidak ditemukan. Silakan login ulang.')
      return
    }
    const { error } = await q().from('quality_record_responses').update({
      review_status: 'classified',
      classified_code: code,
      classified_by: userResult.user.id,
      classified_at: new Date().toISOString(),
      classification_note: 'Diklasifikasikan oleh Superadmin',
    }).eq('id', id)
    if (error) setMsg('Klasifikasi gagal disimpan: ' + error.message)
    else {
      setMsg('Klasifikasi tersimpan.')
      await load()
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'grid',
    gap: 5,
    fontSize: 10,
    color: 'var(--muted)',
  }
  const editor = (model: Model, setModel: (value: Model) => void, onSave: () => void) => (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.30)', border: '1px solid rgba(255,255,255,.68)' }}>
      <div className="eyebrow">{model.id ? 'EDIT · TERBITKAN VERSI BARU' : 'INDIKATOR BARU'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9, marginTop: 10 }}>
        <label className="field" style={fieldStyle}><span>Tahun metadata</span><select value={model.profile_year} onChange={(e) => setModel({ ...model, profile_year: Number(e.target.value) })}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field" style={fieldStyle}><span>Kode indikator</span><input required value={model.code || ''} onChange={(e) => setModel({ ...model, code: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Unit pemilik</span><select required value={model.room_id ?? ''} onChange={(e) => { const selected = rooms.find((item) => String(item.id) === e.target.value); setModel({ ...model, room_id: e.target.value ? Number(e.target.value) : '', unit_name: selected?.name || '' }) }}><option value="">Pilih unit</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field" style={fieldStyle}><span>Nama indikator</span><input required value={model.title || ''} onChange={(e) => setModel({ ...model, title: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Program kerja / jenis indikator</span><input value={model.indicator_type || ''} placeholder="Mis. INM, IMP-RS, IMP-Unit" onChange={(e) => setModel({ ...model, indicator_type: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Kategori</span><input value={model.category || ''} placeholder="Mis. Proses, Outcome, Struktur" onChange={(e) => setModel({ ...model, category: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Satuan</span><input value={model.unit_of_measure || ''} placeholder="Persentase (%), menit, angka" onChange={(e) => setModel({ ...model, unit_of_measure: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Target tertulis</span><input value={model.target_text || ''} placeholder="Mis. ≥ 85%" onChange={(e) => setModel({ ...model, target_text: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Operator target</span><select value={model.target_operator || '>='} onChange={(e) => setModel({ ...model, target_operator: e.target.value })}><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option><option value=">">&gt;</option><option value="<">&lt;</option></select></label>
        <label className="field" style={fieldStyle}><span>Nilai target numerik</span><input type="number" value={model.target_value ?? ''} onChange={(e) => setModel({ ...model, target_value: e.target.value })} /></label>
        <label className="field" style={fieldStyle}><span>Measurement grain</span><select value={model.measurement_grain || 'activity'} onChange={(e) => setModel({ ...model, measurement_grain: e.target.value })}>{grains.map((grain) => <option key={grain} value={grain}>{grain}</option>)}</select></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Definisi numerator</span><textarea value={model.numerator_definition || ''} onChange={(e) => setModel({ ...model, numerator_definition: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Definisi denominator</span><textarea value={model.denominator_definition || ''} onChange={(e) => setModel({ ...model, denominator_definition: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Struktur instrumen (JSON object)</span><textarea style={{ minHeight: 95, fontFamily: 'ui-monospace,monospace', fontSize: 10 }} value={model._schema_text ?? '{}'} onChange={(e) => setModel({ ...model, _schema_text: e.target.value })} /></label>
        <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}><span>Opsi / kamus respons (JSON array)</span><textarea style={{ minHeight: 150, fontFamily: 'ui-monospace,monospace', fontSize: 10 }} value={model._options_text ?? '[]'} onChange={(e) => setModel({ ...model, _options_text: e.target.value })} /></label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="textButton" disabled={saving} onClick={() => { setEdit(null); setNewOne(null) }}>Batal</button>
        <LiquidGlassButton onClick={onSave}>{saving ? 'Menyimpan…' : model.id ? 'Terbitkan versi baru' : 'Tambah indikator'}</LiquidGlassButton>
      </div>
      <div style={{ marginTop: 7, fontSize: 10, color: 'var(--muted)' }}>
        Perubahan pada indikator yang sudah terbit dibuat sebagai versi baru. Opsi JSON harus berupa array dan struktur instrumen harus berupa objek.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <LiquidGlass style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">METADATA · AKSES SUPERADMIN</div>
            <h3 style={{ margin: '4px 0', fontSize: 24 }}>Program Kerja &amp; Kamus Indikator</h3>
            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 820 }}>
              Kelola daftar program dari klasifikasi indikator, lalu ubah, tambah, atau pensiunkan profil indikator lintas unit. Metadata yang sudah dipakai tidak dihapus permanen sehingga riwayat capaian tetap terlindungi.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button type="button" className="textButton" onClick={() => setTab('programs')}>Program Kerja</button>
            <button type="button" className="textButton" onClick={() => setTab('profiles')}>Kamus Indikator</button>
            <button type="button" className="textButton" onClick={() => setTab('review')}>Review “Lainnya” {pending.length > 0 && `(${pending.length})`}</button>
          </div>
        </div>

        {msg && <div className="msg visible" role="status" style={{ color: /gagal|belum|tidak ditemukan|wajib|sudah aktif/i.test(msg) ? '#9c3f32' : '#0f7656', marginTop: 12 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--muted)' }}><span>Tahun metadata</span><select value={year} onChange={(e) => { setYear(Number(e.target.value)); setProgramFilter(''); setSearch('') }}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--muted)' }}><span>Unit pemilik</span><select value={room} onChange={(e) => { setRoom(e.target.value); setProgramFilter('') }}><option value="">Semua unit</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>{loading ? 'Memuat metadata…' : `${profiles.length.toLocaleString('id-ID')} profil indikator pada filter ini`}</div>
        </div>

        {tab === 'programs' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Nama program kerja mengikuti klasifikasi <code>Program kerja / jenis indikator</code>. Pilih satu program untuk meninjau dan mengelola seluruh indikator di dalamnya.</div>
              <LiquidGlassButton onClick={() => openNew()}>+ Tambah indikator / program</LiquidGlassButton>
            </div>
            {programStats.length === 0 ? (
              <div style={{ border: '1px dashed rgba(20,34,27,.18)', borderRadius: 15, padding: 18, color: 'var(--muted)', fontSize: 11 }}>Belum ada profil indikator pada tahun dan unit terpilih. Tambahkan indikator untuk mulai membentuk kamus program kerja.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(225px,1fr))', gap: 9 }}>
                {programStats.map((program) => (
                  <div key={program.name} style={{ padding: 13, border: '1px solid rgba(20,34,27,.09)', borderRadius: 16, background: 'rgba(255,255,255,.25)', minWidth: 0 }}>
                    <div style={{ fontWeight: 850, fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{program.name}</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '10px 0 12px', fontSize: 10, color: 'var(--muted)' }}>
                      <span>{program.total} profil</span><span>·</span><span>{program.active} aktif</span>{program.retired > 0 && <><span>·</span><span>{program.retired} dipensiunkan</span></>}
                    </div>
                    <button type="button" className="textButton" onClick={() => { setProgramFilter(program.name); setSearch(''); setTab('profiles') }}>Kelola indikator →</button>
                    <button type="button" className="textButton" style={{ marginLeft: 8 }} onClick={() => openNew(program.name)}>+ Tambah ke program</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'profiles' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input aria-label="Cari kode, nama indikator, program, kategori, atau unit" placeholder="Cari kode, indikator, program, kategori, unit…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 240px', minWidth: 180 }} />
              <select aria-label="Filter program kerja" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}><option value="">Semua program kerja</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select>
              <button type="button" className="textButton" onClick={() => { setSearch(''); setProgramFilter('') }}>Reset filter</button>
              <LiquidGlassButton onClick={() => openNew(programFilter)}>+ Tambah indikator</LiquidGlassButton>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {filteredProfiles.map((profile) => (
                <div key={profile.id} style={{ padding: 11, border: '1px solid rgba(20,34,27,.09)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', opacity: profile.is_active ? 1 : .62, background: 'rgba(255,255,255,.19)' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontSize: 11, fontWeight: 850, overflowWrap: 'anywhere' }}>{profile.code} · {profile.title || '(Tanpa nama)'}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {(profile.indicator_type || 'Tanpa program')} · {profile.unit_name || 'Unit belum ditentukan'} · {profile.category || 'Kategori belum diisi'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Target: {profile.target_text || '—'} · Satuan: {profile.unit_of_measure || '—'} · Grain: {profile.measurement_grain || '—'} · v{profile.version || 1} · {profile.status || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {profile.is_active && profile.status === 'published' && <button type="button" className="textButton" disabled={saving} onClick={() => { setEdit(editModel(profile)); setNewOne(null); setMsg('') }}>Edit versi</button>}
                    {profile.is_active && profile.status === 'published' && <button type="button" className="textButton" disabled={saving} onClick={() => void retire(profile)}>Pensiunkan</button>}
                  </div>
                </div>
              ))}
              {!filteredProfiles.length && <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>Tidak ada indikator yang cocok dengan filter ini.</div>}
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {pending.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', padding: 14 }}>Tidak ada jawaban “Lainnya” yang menunggu klasifikasi.</div>}
            {pending.map((item) => (
              <div key={item.id} style={{ padding: 12, border: '1px solid rgba(20,34,27,.09)', borderRadius: 15 }}>
                <b style={{ fontSize: 11 }}>{item.response_label || 'Respons lain'}</b>
                <div style={{ fontSize: 10, margin: '6px 0', color: 'var(--muted)' }}>{item.other_text || '—'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" disabled={saving} className="textButton" onClick={() => void classify(item.id, 1)}>Sesuai / patuh</button>
                  <button type="button" disabled={saving} className="textButton" onClick={() => void classify(item.id, 2)}>Pengecualian dibenarkan</button>
                  <button type="button" disabled={saving} className="textButton" onClick={() => void classify(item.id, 3)}>Tidak sesuai / kelalaian</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {edit && editor(edit, setEdit, () => void publish())}
        {newOne && editor(newOne, setNewOne, () => void add())}
      </LiquidGlass>
    </div>
  )
}
