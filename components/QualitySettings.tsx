'use client'

import AsyncStatePanel from '@/components/AsyncStatePanel'
import { prepareAnnualQualityCatalog, type AnnualCatalogPlan } from '@/lib/aureka/annual-quality-workbook'
import { readQualityReference2026 } from '@/lib/aureka/quality-reference-2026'
import { readAllPages } from '@/lib/aureka/pagination'
import { useLatestWorkspaceRequest } from '@/lib/ui/use-latest-workspace-request'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'
import { useCallback, useEffect, useMemo, useRef, useState, useId, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs'
import AurekaModal from '@/components/ui/AurekaModal'
import IndicatorCoveragePanel from '@/components/quality/IndicatorCoveragePanel'
import OptionsEditor from '@/components/quality/QualityOptionEditor'
const QualityExcelMappingWorkspace = dynamic(() => import('@/components/QualityExcelMappingWorkspace'), { ssr: false })
import { buildIndicatorProfileBackup, buildIndicatorProfileXlsx, parseIndicatorProfileXlsx, type IndicatorProfileBackup } from '@/lib/aureka/indicator-profile-transfer'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const grains = ['patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate']
const GRAIN_LABEL: Record<string, string> = { patient_episode: 'Per pasien (episode)', provider_day: 'Per petugas per hari', daily_metric: 'Angka harian', event: 'Per kejadian', activity: 'Per kegiatan / observasi', aggregate: 'Rekap agregat' }

const YEARS = Array.from({ length: 12 }, (_, i) => 2024 + i)

type Room = { id: number; name: string }
type Model = Record<string, any>
type MetadataTab = 'programs' | 'profiles'

function ProfileChoiceField({ label, value, choices, onChange }: {
  label: string
  value: string
  choices: string[]
  onChange: (value: string) => void
}) {
  const [custom, setCustom] = useState(false)
  const options = value && !choices.includes(value) && !custom ? [...choices, value] : choices
  return <div className="qualityProfileChoice">
    <label className="qualityProfileField">
      <span>{label}</span>
      <select value={custom ? 'custom' : value ? String(options.indexOf(value)) : ''}
        onChange={event => {
          const selection = event.target.value
          const isCustom = selection === 'custom'
          setCustom(isCustom)
          if (!isCustom) onChange(selection === '' ? '' : options[Number(selection)] ?? '')
        }}>
        <option value="">Belum ditentukan</option>
        {options.map((item, index) => <option key={item} value={index}>{item}</option>)}
        <option value="custom">Isi sendiri…</option>
      </select>
    </label>
    {custom && <label className="qualityProfileField">
      <span>{label} khusus</span>
      <input value={value} onChange={event => onChange(event.target.value)} />
    </label>}
  </div>
}

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
  _measurement_type: '',
  _indicator_direction: '',
  _schema_text: '{}',
  _options_text: JSON.stringify([{ label: 'Lainnya, tuliskan alasan/temuan', code: null, numerator: null, denominator: true, review_required: true }], null, 2),
  version: 1,
  status: 'published',
  is_active: true,
})

const editModel = (profile: Model): Model => ({
  ...profile,
  _measurement_type: profile.schema_json?.measurement_type || '',
  _indicator_direction: profile.schema_json?.indicator_direction || '',
  _schema_text: JSON.stringify(profile.schema_json || {}, null, 2),
  _options_text: JSON.stringify(profile.options_json || [], null, 2),
})

type ProfileViewFilter = 'active' | 'needs_review' | 'target_pending' | 'target_unavailable' | 'complete' | 'draft' | 'retired' | 'all'

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
const hasNeutralTargetStatus = (profile: Model): boolean => {
  const schema = profile.schema_json && typeof profile.schema_json === 'object' ? profile.schema_json : {}
  return schema.target_not_defined_in_source === true || schema.target_semantic_review_required === true
}
const neutralTargetExplanation = (profile: Model): string => {
  const schema = profile.schema_json && typeof profile.schema_json === 'object' ? profile.schema_json : {}
  return schema.target_semantic_review_required === true
    ? 'Standar sumber 0% tidak selaras dengan definisi numerator. Arah indikator sudah diidentifikasi, tetapi target dinonaktifkan sampai pemilik indikator mengklarifikasi definisinya.'
    : 'Standar target tidak dicantumkan pada dokumen sumber 2026. Profil tetap aktif untuk pencatatan; perbandingan target tidak dihitung sampai target ditetapkan.'
}
const isActivePublished = (profile: Model): boolean => profile.is_active === true && profile.status === 'published'

const payloadFrom = (model: Model): Model => {
  const {
    id, created_at, updated_at, created_by, updated_by,
    _schema_text, _options_text, _measurement_type, _indicator_direction, ...fields
  } = model
  const options = JSON.parse(String(_options_text ?? JSON.stringify(model.options_json || [])))
  const schema = JSON.parse(String(_schema_text ?? JSON.stringify(model.schema_json || {})))
  const measurementType = String(_measurement_type ?? '').trim()
  const direction = String(_indicator_direction ?? '').trim()
  if (measurementType) schema.measurement_type = measurementType
  else delete schema.measurement_type
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


type UnitBatchDraft = Model & {
  _measurement_type: string
  _indicator_direction: string
  _excel_worksheet: string
  _excel_indicator_header: string
  _excel_date_header: string
  _excel_numerator_header: string
  _excel_denominator_header: string
  _excel_answer_header: string
  _excel_notes_header: string
  _options_text: string
}

const MEASUREMENT_TYPES = [
  { value: 'ratio', label: 'Rasio Numerator / Denominator' },
  { value: 'compliance', label: 'Kepatuhan / opsi kategori' },
  { value: 'visit', label: 'Waktu visite' },
  { value: 'door', label: 'Durasi antar waktu' },
  { value: 'minutes', label: 'Durasi dalam menit' },
  { value: 'numeric', label: 'Nilai numerik' },
  { value: 'occurrence', label: 'Kejadian' },
]

function toUnitBatchDraft(profile: Model): UnitBatchDraft {
  const schema = profile.schema_json && typeof profile.schema_json === 'object' ? profile.schema_json : {}
  const mapping = schema.excel_mapping && typeof schema.excel_mapping === 'object' ? schema.excel_mapping as Record<string, unknown> : {}
  return {
    ...profile,
    _measurement_type: String(schema.measurement_type ?? ''),
    _indicator_direction: String(schema.indicator_direction ?? ''),
    _excel_worksheet: String(mapping.worksheet ?? ''),
    _excel_indicator_header: String(mapping.indicator_header ?? ''),
    _excel_date_header: String(mapping.date_header ?? ''),
    _excel_numerator_header: String(mapping.numerator_header ?? ''),
    _excel_denominator_header: String(mapping.denominator_header ?? ''),
    _excel_answer_header: String(mapping.answer_header ?? ''),
    _excel_notes_header: String(mapping.notes_header ?? ''),
    _options_text: JSON.stringify(Array.isArray(profile.options_json) ? profile.options_json : [], null, 2),
  }
}

function unitBatchEditablePayload(model: UnitBatchDraft): Model {
  const schema = { ...(model.schema_json && typeof model.schema_json === 'object' ? model.schema_json : {}) }
  const measurementType = String(model._measurement_type ?? '').trim()
  const direction = String(model._indicator_direction ?? '').trim()
  if (measurementType) schema.measurement_type = measurementType
  else delete schema.measurement_type
  if (direction) schema.indicator_direction = direction
  else delete schema.indicator_direction

  const mapping = {
    worksheet: String(model._excel_worksheet ?? '').trim(),
    indicator_header: String(model._excel_indicator_header ?? '').trim(),
    date_header: String(model._excel_date_header ?? '').trim(),
    numerator_header: String(model._excel_numerator_header ?? '').trim(),
    denominator_header: String(model._excel_denominator_header ?? '').trim(),
    answer_header: String(model._excel_answer_header ?? '').trim(),
    notes_header: String(model._excel_notes_header ?? '').trim(),
  }
  if (Object.values(mapping).some(Boolean)) schema.excel_mapping = mapping
  else delete schema.excel_mapping

  let options: unknown
  try {
    options = JSON.parse(String(model._options_text ?? '[]'))
  } catch {
    throw new Error('JSON opsi jawaban indikator ' + model.code + ' belum valid.')
  }
  if (!Array.isArray(options)) throw new Error('Opsi jawaban indikator ' + model.code + ' harus berupa daftar JSON.')
  const target = model.target_value === '' || model.target_value === null || model.target_value === undefined
    ? null
    : Number(model.target_value)
  if (target !== null && !Number.isFinite(target)) throw new Error('Nilai target indikator ' + model.code + ' harus berupa angka.')
  return {
    profile_year: Number(model.profile_year),
    room_id: Number(model.room_id),
    unit_name: String(model.unit_name ?? ''),
    code: String(model.code ?? '').trim(),
    title: String(model.title ?? '').trim(),
    indicator_type: String(model.indicator_type ?? '').trim() || null,
    category: String(model.category ?? '').trim() || null,
    unit_of_measure: String(model.unit_of_measure ?? '').trim() || null,
    target_text: String(model.target_text ?? '').trim() || null,
    target_operator: String(model.target_operator ?? '=').trim() || '=',
    target_value: target,
    numerator_definition: String(model.numerator_definition ?? '').trim() || null,
    denominator_definition: String(model.denominator_definition ?? '').trim() || null,
    measurement_grain: String(model.measurement_grain ?? 'activity'),
    schema_json: schema,
    options_json: options,
  }
}

function stableProfileSignature(value: unknown): string {
  const normalize = (input: any): any => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object') {
      return Object.keys(input).sort().reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize(input[key])
        return result
      }, {})
    }
    return input
  }
  return JSON.stringify(normalize(value))
}

function UnitLiveProfileEditor({
  open,
  room,
  year,
  profiles,
  onClose,
  onSaved,
}: {
  open: boolean
  room: Room
  year: number
  profiles: Model[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [drafts, setDrafts] = useState<UnitBatchDraft[]>([])
  const [savingBatch, setSavingBatch] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (!open) return
    setDrafts(profiles.filter(isActivePublished).map(toUnitBatchDraft))
    setError('')
    setSummary('')
  }, [open, profiles])

  const updateDraft = (index: number, patch: Partial<UnitBatchDraft>) => {
    setDrafts((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
    setSummary('')
  }

  const changes = useMemo(() => {
    const originalById = new Map(profiles.filter(isActivePublished).map((profile) => [String(profile.id), profile]))
    return drafts.filter((draft) => {
      const original = originalById.get(String(draft.id))
      if (!original) return false
      try {
        return stableProfileSignature(unitBatchEditablePayload(draft)) !== stableProfileSignature({
          profile_year: Number(original.profile_year),
          room_id: Number(original.room_id),
          unit_name: String(original.unit_name ?? ''),
          code: String(original.code ?? '').trim(),
          title: String(original.title ?? '').trim(),
          indicator_type: String(original.indicator_type ?? '').trim() || null,
          category: String(original.category ?? '').trim() || null,
          unit_of_measure: String(original.unit_of_measure ?? '').trim() || null,
          target_text: String(original.target_text ?? '').trim() || null,
          target_operator: String(original.target_operator ?? '=').trim() || '=',
          target_value: original.target_value === '' || original.target_value == null ? null : Number(original.target_value),
          numerator_definition: String(original.numerator_definition ?? '').trim() || null,
          denominator_definition: String(original.denominator_definition ?? '').trim() || null,
          measurement_grain: String(original.measurement_grain ?? 'activity'),
          schema_json: (() => {
            const schema = { ...(original.schema_json && typeof original.schema_json === 'object' ? original.schema_json : {}) }
            const originalMapping = schema.excel_mapping
            const hasMapping = originalMapping && typeof originalMapping === 'object'
            if (!hasMapping) delete schema.excel_mapping
            return schema
          })(),
          options_json: Array.isArray(original.options_json) ? original.options_json : [],
        })
      } catch {
        return true
      }
    })
  }, [drafts, profiles])

  const save = async () => {
    if (savingBatch || !changes.length) return
    setSavingBatch(true)
    setError('')
    setSummary('')
    try {
      const p_profiles = changes.map((draft) => ({
        prior_id: String(draft.id),
        ...unitBatchEditablePayload(draft),
        version: Number(draft.version || 1) + 1,
        status: 'published',
        is_active: true,
      }))
      const { data, error: rpcError } = await q().rpc('publish_indicator_profile_batch', {
        p_profile_year: year,
        p_room_id: room.id,
        p_profiles,
      })
      if (rpcError) throw rpcError
      const result = data as Record<string, any> | null
      const updated = Number(result?.updated_profiles ?? 0)
      if (!result || updated !== p_profiles.length) {
        throw new Error('Jumlah profil yang dipublikasikan tidak sesuai dengan perubahan yang dikirim.')
      }
      setSummary(updated + ' profil berhasil diterbitkan sebagai versi baru. Profil yang tidak berubah tidak dibuatkan versi baru.')
      await onSaved()
      onClose()
    } catch (saveError) {
      setError(toUserFacingError(saveError, { fallback: 'Batch tidak tersimpan. Tidak ada perubahan parsial yang diterapkan.' }))
    } finally {
      setSavingBatch(false)
    }
  }

  const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 190px),1fr))', gap: 9 }
  const fieldStyle: CSSProperties = { display: 'grid', gap: 4, color: 'var(--muted)', fontSize: 12, minWidth: 0 }
  const textInputStyle: CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box' }
  const input = (label: string, value: unknown, onChange: (value: string) => void, opts: { type?: string; placeholder?: string } = {}) => (
    <label className="field" style={fieldStyle}>
      <span>{label}</span>
      <input type={opts.type ?? 'text'} value={String(value ?? '')} placeholder={opts.placeholder ?? ''} style={textInputStyle} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
  const select = (label: string, value: unknown, options: Array<{ value: string; label: string }>, onChange: (value: string) => void) => (
    <label className="field" style={fieldStyle}>
      <span>{label}</span>
      <select value={String(value ?? '')} style={textInputStyle} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
  const textarea = (label: string, value: unknown, onChange: (value: string) => void, placeholder = '') => (
    <label className="field" style={{ ...fieldStyle, gridColumn: '1/-1' }}>
      <span>{label}</span>
      <textarea rows={2} value={String(value ?? '')} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )

  return (
    <AurekaModal
      open={open}
      size="xl"
      closeDisabled={savingBatch}
      closeOnBackdrop={false}
      onClose={onClose}
      title={'Edit seluruh profil · ' + room.name}
      subtitle={'Tahun ' + year + ' · perubahan disimpan sekaligus sebagai versi baru; kode indikator dijaga tetap.'}
      footer={
        <>
          {error && <p className="qualityProfileError" role="alert">{error}</p>}
          <span className="qualityBatchCount" role="status">{changes.length} dari {drafts.length} profil berubah</span>
          <button type="button" className="akBtn akBtnGhost" disabled={savingBatch} onClick={onClose}>Batal</button>
          <button type="button" className="akBtn akBtnPrimary" disabled={savingBatch || changes.length === 0} onClick={() => void save()}>
            {savingBatch ? 'Menyimpan…' : 'Simpan semua perubahan'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <div style={{ border: '1px solid rgba(28,107,73,.20)', background: 'rgba(28,107,73,.055)', borderRadius: 11, padding: 10, fontSize: 12, lineHeight: 1.55 }}>
          Setiap kartu mewakili satu profil indikator. Untuk pemetaan Excel, gunakan nama judul kolom agar tetap sesuai jika urutan kolom berubah.
        </div>
        {drafts.map((model, index) => (
          <section key={String(model.id)} style={{ border: '1px solid var(--aureka-dialog-edge)', borderRadius: 12, padding: 12, background: 'var(--aureka-dialog-muted)', display: 'grid', gap: 10 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                <code style={{ color: 'var(--aureka-color-foreground-secondary)', fontWeight: 800 }}>{model.code}</code>
                <strong style={{ fontSize: 13 }}>{model.title}</strong>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>v{model.version} → v{Number(model.version || 1) + 1}</span>
            </header>
            <div style={gridStyle}>
              {input('Nama indikator', model.title, value => updateDraft(index, { title: value }))}
              {input('Program / jenis indikator', model.indicator_type, value => updateDraft(index, { indicator_type: value }))}
              {input('Kategori', model.category, value => updateDraft(index, { category: value }))}
              {input('Satuan', model.unit_of_measure, value => updateDraft(index, { unit_of_measure: value }))}
              {select('Tipe pengukuran', model._measurement_type, [{ value: '', label: 'Pilih tipe pengukuran' }, ...MEASUREMENT_TYPES], value => updateDraft(index, { _measurement_type: value }))}
              {select('Grain pengukuran', model.measurement_grain, grains.map(value => ({ value, label: GRAIN_LABEL[value] ?? value })), value => updateDraft(index, { measurement_grain: value }))}
              {select('Arah indikator', model._indicator_direction, [{ value: '', label: 'Pilih arah' }, { value: 'positive', label: 'Positif · semakin tinggi semakin baik' }, { value: 'negative', label: 'Negatif · semakin rendah semakin baik' }], value => updateDraft(index, { _indicator_direction: value }))}
              {input('Target tertulis', model.target_text, value => updateDraft(index, { target_text: value }), { placeholder: 'Mis. ≥ 80%' })}
              {select('Operator target', model.target_operator, [{ value: '>=', label: '≥' }, { value: '<=', label: '≤' }, { value: '=', label: '=' }, { value: '>', label: '>' }, { value: '<', label: '<' }], value => updateDraft(index, { target_operator: value }))}
              {input('Nilai target numerik', model.target_value, value => updateDraft(index, { target_value: value }), { type: 'number' })}
            </div>
            <details style={{ borderTop: '1px solid rgba(25,55,37,.1)', paddingTop: 9 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Definisi, pemetaan kolom Excel, dan opsi jawaban</summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                {textarea('Definisi numerator / pembilang', model.numerator_definition, value => updateDraft(index, { numerator_definition: value }))}
                {textarea('Definisi denominator / penyebut', model.denominator_definition, value => updateDraft(index, { denominator_definition: value }))}
                <div style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 9, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Pemetaan kolom sumber dilakukan melalui tombol <strong>Pilih Kolom dari Excel</strong> di Profil Indikator.
                  Unggah workbook, pilih sheet Logbook, lalu klik dropdown huruf kolom. Aturan header lama tetap dipertahankan ketika menyimpan perubahan definisi.
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Opsi jawaban / instrumen</span>
                  <OptionsEditor text={model._options_text} onChange={(value) => updateDraft(index, { _options_text: value })} />
                </div>
              </div>
            </details>
          </section>
        ))}
        {!drafts.length && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 18 }}>Unit ini belum memiliki profil aktif yang dapat diedit.</div>}
        {summary && <div role="status" style={{ color: '#176448', fontSize: 12 }}>{summary}</div>}
      </div>
    </AurekaModal>
  )
}

const EMPTY_MODELS: Model[] = []

export default function QualitySettings({ rooms, initialTab = 'programs', showTabs = true, onTabChange, initialRoomId = null, lockRoomScope = false, role = null }: { rooms: Room[]; initialTab?: MetadataTab; showTabs?: boolean; onTabChange?: (tab: MetadataTab) => void; initialRoomId?: number | null; lockRoomScope?: boolean; role?: string | null }) {
  const [year, setYear] = useState(2026)
  const [room, setRoom] = useState(lockRoomScope && initialRoomId != null ? String(initialRoomId) : '')
  useEffect(() => { if (lockRoomScope && initialRoomId != null) setRoom(String(initialRoomId)) }, [lockRoomScope, initialRoomId])
  const scope = JSON.stringify([year, room, role])
  const beginLoad = useLatestWorkspaceRequest(scope)
  const [snapshot, setSnapshot] = useState<{ scope: string; profiles: Model[] } | null>(null)
  const profiles = snapshot?.scope === scope ? snapshot.profiles : EMPTY_MODELS
  const editorInitialValue = useRef('')
  const [edit, setEdit] = useState<Model | null>(null)
  const [newOne, setNewOne] = useState<Model | null>(null)
  const [profileGrouping, setProfileGrouping] = useState<'all'|'category'|'unit'>('all')
  const [tab, setTab] = useState<MetadataTab>(initialTab)
  const [profileWorkspaceOpen, setProfileWorkspaceOpen] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [programFilter, setProgramFilter] = useState('')
  const [profileViewFilter, setProfileViewFilter] = useState<ProfileViewFilter>('active')
  const editorFormId = useId()
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<IndicatorProfileBackup | null>(null)
  const [annualImport, setAnnualImport] = useState<AnnualCatalogPlan | null>(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg || typeof window === 'undefined') return
    const type = /gagal|belum|tidak dapat|periksa|wajib|kesalahan/i.test(msg) ? 'error' : /berhasil|tersimpan|dikirim|dihapus|diperbarui/i.test(msg) ? 'success' : 'info'
    window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message: msg, type, module: 'Metadata' } }))
  }, [msg])
  const [reading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const loading = reading || (!loadError && snapshot?.scope !== scope)
  const [saving, setSaving] = useState(false)
  const [unitBatchOpen, setUnitBatchOpen] = useState(false)
  const [excelMappingOpen, setExcelMappingOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Model | null>(null)
  // Mutasi kamus profil hanya untuk Super Admin; role lain tetap dapat membaca profil dan memakai alur usulan yang memiliki otorisasi tersendiri.
  const canManageCatalog = role === 'ADMIN'

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    if (!isCurrent) return
    setLoading(true)
    setLoadError('')
    try {
      const nextProfiles = await readAllPages<Model>((from, to) => {
        let query = q().from('indicator_profiles').select('*')
          .eq('profile_year', year)
          .order('indicator_type').order('code').order('id')
        if (room) query = query.eq('room_id', Number(room))
        return query.range(from, to)
      })
      if (isCurrent()) setSnapshot({ scope, profiles: nextProfiles })
    } catch (error) {
      if (!isCurrent()) return
      setSnapshot(null)
      setLoadError(toUserFacingError(error, { fallback: 'Profil indikator belum dapat dimuat.' }))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [beginLoad, scope, year, room])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    setEdit(null); setNewOne(null); setUnitBatchOpen(false); setPendingDelete(null)
    setImportPreview(null); setAnnualImport(null); setReplaceConfirmed(false); setExcelMappingOpen(false)
  }, [scope])

  useEffect(() => { setTab(initialTab); setProfileWorkspaceOpen(false) }, [initialTab])
  useEffect(() => { if (tab !== 'profiles') { setProfileWorkspaceOpen(false); setExcelMappingOpen(false) } }, [tab])

  const programs = useMemo(() => {
    const values = new Set<string>()
    profiles.forEach((profile) => {
      const value = String(profile.indicator_type || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'id'))
  }, [profiles])

  const profileChoices = useMemo(() => {
    const sortedValues = (key: 'category' | 'unit_of_measure') =>
      Array.from(new Set(profiles.map(profile => String(profile[key] ?? '')).filter(value => value.trim())))
        .sort((a, b) => a.localeCompare(b, 'id'))
    return { categories: sortedValues('category'), units: sortedValues('unit_of_measure') }
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
  const activeTargetUnavailableCount = useMemo(
    () => profiles.filter((profile) => isActivePublished(profile) && hasNeutralTargetStatus(profile)).length,
    [profiles],
  )

  const filteredProfiles = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id')
    return profiles.filter((profile) => {
      const active = isActivePublished(profile)
      if (profileViewFilter === 'active' && !active) return false
      if (profileViewFilter === 'needs_review' && (!active || !needsMetadataReview(profile))) return false
      if (profileViewFilter === 'target_pending' && (!active || !needsTargetApproval(profile))) return false
      if (profileViewFilter === 'target_unavailable' && (!active || !hasNeutralTargetStatus(profile))) return false
      if (profileViewFilter === 'complete' && (!active || needsMetadataReview(profile) || needsTargetApproval(profile) || hasNeutralTargetStatus(profile))) return false
      if (profileViewFilter === 'draft' && profile.status !== 'draft') return false
      if (profileViewFilter === 'retired' && profile.status !== 'retired' && profile.is_active !== false) return false
      if (programFilter && String(profile.indicator_type || '') !== programFilter) return false
      if (!normalized) return true
      return [profile.code, profile.title, profile.indicator_type, profile.category, profile.unit_name]
        .some((value) => String(value || '').toLocaleLowerCase('id').includes(normalized))
    })
  }, [profiles, search, programFilter, profileViewFilter])

  const profileGroups = useMemo(() => {
    if (profileGrouping === 'all') return [['', filteredProfiles] as const]
    const groups = new Map<string, typeof filteredProfiles>()
    for (const profile of filteredProfiles) {
      const label = profileGrouping === 'category'
        ? profile.category || 'Kategori belum diisi'
        : profile.unit_name || rooms.find(item => Number(item.id) === Number(profile.room_id))?.name || 'Unit belum ditentukan'
      const group = groups.get(label)
      if (group) group.push(profile)
      else groups.set(label, [profile])
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b, 'id'))
  }, [filteredProfiles, profileGrouping, rooms])

  const openNew = (programName = '') => {
    const selectedRoom = rooms.find((item) => String(item.id) === room)
    setEdit(null)
    setMsg('')
    const draft = empty(selectedRoom, year, programName)
    editorInitialValue.current = JSON.stringify(draft)
    setNewOne(draft)
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
      if (!MEASUREMENT_TYPES.some((item) => item.value === payload.schema_json.measurement_type)) {
        throw new Error('Tipe pengukuran wajib dipilih sebelum menerbitkan profil.')
      }
      if (!['positive', 'negative'].includes(String(payload.schema_json.indicator_direction ?? ''))) {
        throw new Error('Arah indikator wajib dipilih sebelum menerbitkan profil.')
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
      if (!MEASUREMENT_TYPES.some((item) => item.value === payload.schema_json.measurement_type)) {
        throw new Error('Tipe pengukuran wajib dipilih sebelum menambahkan profil.')
      }
      if (!['positive', 'negative'].includes(String(payload.schema_json.indicator_direction ?? ''))) {
        throw new Error('Arah indikator wajib dipilih sebelum menambahkan profil.')
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

  const permanentlyDelete = async () => {
    if (!pendingDelete?.id || saving) return
    setSaving(true)
    setMsg('')
    try {
      const { data, error } = await q().rpc('delete_unused_indicator_profile', {
        p_profile_id: String(pendingDelete.id),
      })
      if (error) throw error
      if (!data || (data as Record<string, unknown>).deleted !== true) {
        throw new Error('Server belum mengonfirmasi penghapusan profil.')
      }
      const code = String((data as Record<string, unknown>).code ?? pendingDelete.code)
      const targetRoomId = Number(pendingDelete.room_id)
      setPendingDelete(null)
      window.dispatchEvent(new CustomEvent('aureka:indicator-profiles-updated', {
        detail: { year: Number(pendingDelete.profile_year), scopeRoomId: targetRoomId },
      }))
      await load()
      setMsg('Profil uji ' + code + ' berhasil dihapus permanen. Tidak ada data audit atau respons yang ikut dihapus.')
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? String((error as Record<string, unknown>).code ?? '')
        : ''
      if (errorCode === '42501') {
        setMsg('Penghapusan belum diizinkan. Pastikan akun yang digunakan memiliki peran Superadmin. Tidak ada data yang dihapus.')
      } else if (errorCode === 'PGRST301' || errorCode === '401') {
        setMsg('Sesi login telah berakhir. Masuk kembali ke AUREKA, lalu ulangi penghapusan.')
      } else {
        setMsg('Profil tidak dapat dihapus permanen: ' + toUserFacingError(error, { fallback: 'Profil mungkin masih dirujuk oleh respons, aturan OPPE, proposal, atau catatan audit.' }))
      }
    } finally {
      setSaving(false)
    }
  }

  // Template awal untuk tahun yang belum punya profil: profil aktif yang ada + profil bawaan 2026 yang ikut dalam aplikasi.
  const downloadStarterTemplate = async () => {
    try {
      const bundled = year === 2026 ? await readQualityReference2026() : []
      const active = profiles.filter((p) => p.is_active === true && p.status === 'published')
      const activeCodes = new Set(active.map((p) => String(p.code)))
      const merged = [...active, ...bundled.filter((p) => !activeCodes.has(String(p.code))).map((p) => ({ ...p, id: '', profile_year: year, is_active: true, status: 'published' }))]
      if (!merged.length) { setMsg('Belum ada profil bawaan untuk tahun ' + year + '. Gunakan + Tambah indikator, lalu Export XLSX sebagai template.'); return }
      const backup = buildIndicatorProfileBackup({ profileYear: year, scopeRoomId: null, scopeName: 'Semua unit', profiles: merged })
      const bytes = await buildIndicatorProfileXlsx(backup)
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'aureka-template-profil-indikator-' + year + '.xlsx'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Template berisi ' + merged.length + ' profil (' + active.length + ' yang sudah aktif + ' + (merged.length - active.length) + ' profil bawaan) diunduh. Periksa/ubah di Excel, tambah baris untuk unit lain, lalu tekan Import XLSX dengan pilihan Semua unit.')
    } catch (error) {
      setMsg('Template gagal dibuat: ' + toUserFacingError(error, { fallback: 'Coba lagi.' }))
    }
  }

  const exportProfileSet = async () => {
    try {
      const selectedRoom = rooms.find((item) => String(item.id) === room)
      const backup = buildIndicatorProfileBackup({
        profileYear: year,
        scopeRoomId: room ? Number(room) : null,
        scopeName: selectedRoom?.name || 'Semua unit',
        profiles,
      })
      const bytes = await buildIndicatorProfileXlsx(backup)
      const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const blob = new Blob([blobBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const scopePart = selectedRoom
        ? selectedRoom.name.toLocaleLowerCase('id').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'semua-unit'
      anchor.href = url
      anchor.download = 'aureka-profil-indikator-' + year + '-' + scopePart + '.xlsx'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Ekspor ' + backup.profiles.length.toLocaleString('id-ID') + ' profil aktif tahun ' + year + ' ke XLSX berhasil dibuat.')
    } catch (error) {
      setMsg('Profil indikator gagal diekspor: ' + toUserFacingError(error, { fallback: 'Periksa cakupan tahun dan unit.' }))
    }
  }

  const readProfileImportFile = async (file?: File) => {
    if (!file) return
    setMsg('')
    try {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new Error('Format impor harus .xlsx. Berkas JSON tidak lagi didukung.')
      }
      if (file.size > 25 * 1024 * 1024) throw new Error('Pilih workbook XLSX dengan ukuran maksimal 25 MB.')
      const bytes = await file.arrayBuffer()
      const Excel = (await import('exceljs-hardened')).default
      const workbook = new Excel.Workbook()
      await workbook.xlsx.load(bytes)
      if (workbook.getWorksheet('Indikator')) {
        const annual = prepareAnnualQualityCatalog(workbook, await readQualityReference2026())
        if (annual) {
          setAnnualImport(annual)
          setImportPreview(null)
          setReplaceConfirmed(false)
          return
        }
      }
      const parsed = await parseIndicatorProfileXlsx(bytes)
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
      setMsg('Workbook ' + file.name + ' tervalidasi. Periksa ringkasan dan konfirmasi sebelum penggantian profil.')
    } catch (error) {
      setImportPreview(null)
      setReplaceConfirmed(false)
      setMsg('Workbook profil indikator tidak dapat digunakan: ' + toUserFacingError(error, { fallback: 'Pastikan workbook sesuai template XLSX Profil Indikator AUREKA.' }))
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

  const selectedRoomForEditor = rooms.find((item) => String(item.id) === room) ?? null

  const closeEditor = async () => {
    const draft = edit ?? newOne
    if (saving || !draft) return
    if (JSON.stringify(draft) !== editorInitialValue.current && !await aurekaConfirm(
      'Perubahan profil indikator belum disimpan.',
      { title: 'Buang perubahan?', confirmLabel: 'Buang perubahan', cancelLabel: 'Lanjut edit', danger: true },
    )) return
    setEdit(null)
    setNewOne(null)
    setMsg('')
  }
  const editor = (model: Model, setModel: (value: Model) => void, onSave: () => void) => (
    <form id={editorFormId} className="qualityProfileForm" onSubmit={event => { event.preventDefault(); if (!saving) onSave() }}>
      <fieldset className="qualityProfileFields" disabled={saving}>
        <section className="qualityProfileSection">
          <h4>Identitas indikator</h4>
          <div className="qualityProfileGrid">
            <label className="qualityProfileField"><span>Tahun</span><select value={model.profile_year} onChange={(e) => setModel({ ...model, profile_year: Number(e.target.value) })}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="qualityProfileField"><span>Kode indikator</span><input required value={model.code || ''} onChange={(e) => setModel({ ...model, code: e.target.value })} /></label>
            <label className="qualityProfileField"><span>Unit pemilik</span><select required value={model.room_id ?? ''} disabled={lockRoomScope || saving} onChange={(e) => { const selected = rooms.find((item) => String(item.id) === e.target.value); setModel({ ...model, room_id: e.target.value ? Number(e.target.value) : '', unit_name: selected?.name || '' }) }}><option value="">Pilih unit</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="qualityProfileField qualityProfileWide"><span>Nama indikator</span><textarea rows={2} required value={model.title || ''} onChange={(e) => setModel({ ...model, title: e.target.value })} /></label>
            <ProfileChoiceField label="Program kerja / jenis indikator" value={String(model.indicator_type ?? '')} choices={programs} onChange={value => setModel({ ...model, indicator_type: value })} />
            <ProfileChoiceField label="Kategori" value={String(model.category ?? '')} choices={profileChoices.categories} onChange={value => setModel({ ...model, category: value })} />
            <ProfileChoiceField label="Satuan" value={String(model.unit_of_measure ?? '')} choices={profileChoices.units} onChange={value => setModel({ ...model, unit_of_measure: value })} />
          </div>
        </section>
        <section className="qualityProfileSection">
          <h4>Target dan pengukuran</h4>
          <div className="qualityProfileGrid">
            <label className="qualityProfileField"><span>Operator target</span><select value={model.target_operator || '>='} onChange={(e) => setModel({ ...model, target_operator: e.target.value })}><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option><option value=">">&gt;</option><option value="<">&lt;</option></select></label>
            <label className="qualityProfileField"><span>Nilai target numerik</span><input type="number" step="any" value={model.target_value ?? ''} onChange={(e) => setModel({ ...model, target_value: e.target.value })} /></label>
            <label className="qualityProfileField"><span>Tipe pengukuran</span><select required value={model._measurement_type || ''} onChange={(e) => setModel({ ...model, _measurement_type: e.target.value })}><option value="">Pilih tipe pengukuran</option>{MEASUREMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="qualityProfileField"><span>Satuan pencatatan</span><select value={model.measurement_grain || 'activity'} onChange={(e) => setModel({ ...model, measurement_grain: e.target.value })}>{grains.map((grain) => <option key={grain} value={grain}>{GRAIN_LABEL[grain] || grain}</option>)}</select></label>
            <label className="qualityProfileField"><span>Arah indikator</span><select value={model._indicator_direction || ''} onChange={(e) => setModel({ ...model, _indicator_direction: e.target.value })}><option value="">Pilih arah indikator</option><option value="positive">Positif (lebih tinggi lebih baik)</option><option value="negative">Negatif (lebih rendah lebih baik)</option></select></label>
            <label className="qualityProfileField qualityProfileWide"><span>Target tertulis</span><textarea rows={2} value={model.target_text || ''} placeholder="Mis. ≥ 85%" onChange={(e) => setModel({ ...model, target_text: e.target.value })} /></label>
          </div>
        </section>
        <section className="qualityProfileSection">
          <h4>Definisi operasional</h4>
          <div className="qualityProfileGrid">
            <label className="qualityProfileField qualityProfileWide"><span>Definisi numerator</span><textarea rows={4} value={model.numerator_definition || ''} onChange={(e) => setModel({ ...model, numerator_definition: e.target.value })} /></label>
            <label className="qualityProfileField qualityProfileWide"><span>Definisi denominator</span><textarea rows={4} value={model.denominator_definition || ''} onChange={(e) => setModel({ ...model, denominator_definition: e.target.value })} /></label>
          </div>
        </section>
        <section className="qualityProfileSection">
          <h4>Opsi jawaban di logbook</h4>
          <OptionsEditor text={model._options_text ?? '[]'} onChange={next => setModel({ ...model, _options_text: next })} />
        </section>
      </fieldset>
    </form>
  )

  return (
    <div className="qualitySettingsWorkspace" style={{ display: 'grid', gap: 14 }}>
      {loadError && <AsyncStatePanel state="error" title="Profil indikator belum dapat dimuat" description={loadError} onRetry={() => void load()} compact />}
      <LiquidGlass className="qualitySettingsSurface" style={{ padding: 14 }}>
        <WorkspaceModuleHeader
          title={tab === 'programs' ? 'Program Kerja' : 'Profil Indikator'}
          loading={loading}
          metrics={tab === 'profiles' && profileWorkspaceOpen ? [
            { label: 'Indikator aktif', value: activeProfileCount },
            { label: 'Perlu perbaikan teknis', value: activeReviewCount },
          ] : undefined}
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
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}><span>Tahun</span><select value={year} disabled={saving} onChange={(e) => { setYear(Number(e.target.value)); setProgramFilter(''); setSearch('') }}>{YEARS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field" style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}><span>Unit pemilik</span><select value={room} disabled={lockRoomScope || saving} onChange={(e) => { setRoom(e.target.value); setProgramFilter('') }}>{!lockRoomScope && <option value="">Semua unit</option>}{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{loading ? 'Memuat profil indikator…' : loadError ? 'Profil belum tersedia' : `${activeProfileCount.toLocaleString('id-ID')} indikator aktif · ${profiles.length.toLocaleString('id-ID')} versi tersimpan`}</div>
        </div>

        {!lockRoomScope && room === '' && <div style={{ marginTop: 12 }}><IndicatorCoveragePanel rooms={rooms} year={year} onCopied={() => void load()} onStarterTemplate={() => void downloadStarterTemplate()} onImport={() => { if (importFileRef.current) importFileRef.current.click(); else { setTab('profiles'); onTabChange?.('profiles'); window.setTimeout(() => importFileRef.current?.click(), 60) } }} /></div>}

        <div id="metadata-active-panel" className="workspaceActivePanel" role="tabpanel" aria-labelledby={'metadata-tab-' + tab} tabIndex={0}>
        {tab === 'programs' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Nama program kerja mengikuti klasifikasi <code>Program kerja / jenis indikator</code>. Pilih satu program untuk meninjau dan mengelola seluruh indikator di dalamnya.</div>
              {canManageCatalog && <LiquidGlassButton onClick={() => openNew()} disabled={saving}>+ Tambah indikator / program</LiquidGlassButton>}
            </div>
            {programStats.length === 0 ? (
              <div style={{ border: '1px dashed rgba(20,34,27,.18)', borderRadius: 15, padding: 18, color: 'var(--muted)', fontSize: 12 }}>Belum ada profil indikator pada tahun dan unit terpilih. Tambahkan indikator untuk mulai membentuk kamus program kerja.</div>
            ) : (
              <div className="metadataProgramGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(225px,1fr))', gap: 9 }}>
                {programStats.map((program) => (
                  <div key={program.name} style={{ padding: 13, border: '1px solid rgba(20,34,27,.09)', borderRadius: 16, background: 'rgba(255,255,255,.25)', minWidth: 0 }}>
                    <div style={{ fontWeight: 850, fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{program.name}</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '10px 0 12px', fontSize: 12, color: 'var(--muted)' }}>
                      <span>{program.total} profil</span><span>·</span><span>{program.active} aktif</span>{program.retired > 0 && <><span>·</span><span>{program.retired} dipensiunkan</span></>}
                    </div>
                    <div className="mpCardActions">
                      <button type="button" className="textButton" onClick={() => { setProgramFilter(program.name); setSearch(''); setTab('profiles'); onTabChange?.('profiles') }}>Kelola indikator</button>
                      {canManageCatalog && <button type="button" className="textButton" onClick={() => openNew(program.name)}>+ Tambah ke program</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'profiles' && excelMappingOpen && <QualityExcelMappingWorkspace rooms={rooms} initialRoomId={room ? Number(room) : initialRoomId} year={year} role={role} onClose={()=>setExcelMappingOpen(false)}/>}
        {tab === 'profiles' && !excelMappingOpen && !profileWorkspaceOpen && (
          <section className="qsProfileIntelligence" aria-label="Ringkasan Profil Indikator" style={{marginTop:12,display:'grid',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>
              <div className="qsProfileIntelligenceMetric"><span>Indikator aktif</span><strong>{activeProfileCount.toLocaleString('id-ID')}</strong></div>
              <div className="qsProfileIntelligenceMetric"><span>Perlu perbaikan teknis</span><strong>{activeReviewCount.toLocaleString('id-ID')}</strong></div>
              <div className="qsProfileIntelligenceMetric"><span>Target menunggu pengesahan</span><strong>{activeTargetPendingCount.toLocaleString('id-ID')}</strong></div>
              <div className="qsProfileIntelligenceMetric"><span>Target belum tersedia / klarifikasi</span><strong>{activeTargetUnavailableCount.toLocaleString('id-ID')}</strong></div>
            </div>
            <div style={{border:'1px solid var(--line,rgba(20,34,27,.12))',borderRadius:14,padding:16,display:'grid',gap:10}}>
              <div><strong>Status penyusunan profil</strong><p style={{margin:'5px 0 0',fontSize:12,lineHeight:1.55,color:'var(--muted)'}}>Ringkasan status kamus indikator untuk tahun dan cakupan unit yang dipilih. Angka dihitung dari profil yang berhasil dimuat; target yang belum disahkan tidak dianggap sebagai target resmi.</p></div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" className="textButton" onClick={()=>{setProfileWorkspaceOpen(true)}}>Lihat Profil Indikator</button>
                {(role === 'ADMIN' || role === 'PMKP') && <button type="button" className="textButton" onClick={()=>setExcelMappingOpen(true)}>Pilih Kolom dari Excel</button>}
              </div>
            </div>
          </section>
        )}
        {tab === 'profiles' && !excelMappingOpen && profileWorkspaceOpen && (
          <div style={{ marginTop: 12 }}>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
              <button type="button" className="textButton" onClick={()=>setProfileWorkspaceOpen(false)}>Kembali ke ringkasan</button>
            </div>
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
                <option value="target_unavailable">Target belum tersedia / perlu klarifikasi, netral ({activeTargetUnavailableCount})</option>
                <option value="complete">Metadata dan target siap digunakan</option>
                <option value="draft">Draf</option>
                <option value="retired">Riwayat versi (retired)</option>
                <option value="all">Semua versi</option>
              </select>
              <select aria-label="Kelompokkan profil indikator" value={profileGrouping} onChange={(e) => setProfileGrouping(e.target.value as typeof profileGrouping)}>
                <option value="all">Tampil semua</option>
                <option value="category">Kategori Indikator</option>
                <option value="unit">Unit Pelaksana</option>
              </select>
              <select aria-label="Filter program kerja" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}><option value="">Semua program kerja</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select>
              <button type="button" className="textButton" onClick={() => { setSearch(''); setProgramFilter(''); setProfileViewFilter('active'); setProfileGrouping('all') }}>Reset filter</button>
              {(role === 'ADMIN' || role === 'PMKP') && <LiquidGlassButton onClick={()=>setExcelMappingOpen(true)} disabled={saving || loading || !!loadError}>Pilih Kolom dari Excel</LiquidGlassButton>}
              {canManageCatalog && <LiquidGlassButton onClick={() => importFileRef.current?.click()} disabled={saving || loading || !!loadError}>Import XLSX Profil</LiquidGlassButton>}
              <LiquidGlassButton onClick={exportProfileSet} disabled={saving || loading || !!loadError || activeProfileCount === 0}>Export XLSX</LiquidGlassButton>
              {canManageCatalog && room !== '' && <LiquidGlassButton onClick={() => { setProgramFilter(''); setSearch(''); setProfileViewFilter('active'); setUnitBatchOpen(true) }} disabled={saving || loading || !!loadError || activeProfileCount === 0}>Edit seluruh profil unit</LiquidGlassButton>}
              {canManageCatalog && <LiquidGlassButton onClick={() => openNew(programFilter)} disabled={saving}>+ Tambah indikator</LiquidGlassButton>}
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Pilih workbook XLSX Profil Indikator AUREKA"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void readProfileImportFile(file)
              }}
            />
            <AurekaModal open={Boolean(annualImport)} title="Katalog Tahunan 2026" size="lg"
              onClose={() => setAnnualImport(null)}>
              {annualImport && <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                <p><strong>{annualImport.profiles.length.toLocaleString('id-ID')} profil cocok</strong> dengan kode dan unit AUREKA.</p>
                {annualImport.unresolved.length > 0 && <div role="status">
                  <strong>Perlu penetapan unit atau kode</strong>
                  <ul>{annualImport.unresolved.map(item => <li key={item.row}>Baris {item.row} · {item.owner} · {item.title}</li>)}</ul>
                </div>}
                <p>Gunakan katalog tahunan untuk memeriksa kecocokan sumber. Perubahan master mengikuti alur versi pada Profil Indikator.</p>
              </div>}
            </AurekaModal>
            <AurekaModal
              open={Boolean(importPreview)}
              title="Konfirmasi penggantian Profil Indikator"
              subtitle="Periksa tahun tujuan dan cakupan unit sebelum menerapkan seluruh isi berkas."
              closeDisabled={saving}
              onClose={() => { setImportPreview(null); setReplaceConfirmed(false); setMsg('') }}
              closeOnBackdrop={false}
              footer={<>
                {msg.startsWith('Impor tidak berhasil') && <p className="qualityProfileError" role="alert">{msg}</p>}
                <button type="button" className="akBtn akBtnGhost" disabled={saving} onClick={() => { setImportPreview(null); setReplaceConfirmed(false); setMsg('') }}>Batal</button>
                <button type="button" className="akBtn akBtnDanger" onClick={() => void replaceProfileSet()} disabled={saving || !replaceConfirmed}>
                  {saving ? 'Mengganti profil…' : 'Ganti seluruh profil'}
                </button>
              </>}
            >
              {importPreview && (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 150px),1fr))', gap: 8 }}>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tahun sumber</div>
                      <strong style={{ fontSize: 15 }}>{importPreview.profile_year}</strong>
                    </div>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tahun tujuan</div>
                      <strong style={{ fontSize: 15 }}>{year}</strong>
                    </div>
                    <div style={{ padding: 10, border: '1px solid var(--line, rgba(20,34,27,.12))', borderRadius: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Profil dalam berkas</div>
                      <strong style={{ fontSize: 15 }}>{importPreview.profiles.length.toLocaleString('id-ID')}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Cakupan: <strong style={{ color: 'var(--text, inherit)' }}>{importPreview.scope.unit_name}</strong>.
                    Seluruh profil aktif/draf pada tahun dan cakupan tujuan akan dipensiunkan, lalu diganti dengan isi berkas ini.
                  </div>
                  <div style={{ border: '1px solid rgba(190,125,35,.35)', background: 'rgba(190,125,35,.07)', borderRadius: 10, padding: 11, fontSize: 13, lineHeight: 1.6 }}>
                    Data audit tidak dihapus. Sistem akan menautkan ulang ID indikator dan mengganti kode pada nilai audit lama yang memiliki pasangan pemetaan. Jika pemetaan berpotensi menimpa nilai indikator lain, seluruh transaksi impor akan dibatalkan.
                  </div>
                  <label className="qoeCheck">
                    <input type="checkbox" disabled={saving} checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)} />
                    Saya memahami bahwa seluruh profil aktif dan draf pada tahun dan cakupan tujuan akan diganti dengan isi berkas.
                  </label>
                </div>
              )}
            </AurekaModal>
            {selectedRoomForEditor && (
              <UnitLiveProfileEditor
                open={unitBatchOpen}
                room={selectedRoomForEditor}
                year={year}
                profiles={profiles}
                onClose={() => setUnitBatchOpen(false)}
                onSaved={async () => {
                  window.dispatchEvent(new CustomEvent('aureka:indicator-profiles-updated', {
                    detail: { year, scopeRoomId: selectedRoomForEditor.id },
                  }))
                  await load()
                  setMsg('Perubahan profil unit berhasil disimpan. Setiap indikator yang berubah diterbitkan sebagai versi baru.')
                }}
              />
            )}
            <AurekaModal
              open={Boolean(pendingDelete)}
              title="Hapus profil indikator permanen?"
              subtitle={pendingDelete ? String(pendingDelete.code) + ' · ' + String(pendingDelete.title) : ''}
              closeDisabled={saving}
              role="alertdialog"
              size="md"
              onClose={() => { setPendingDelete(null); setMsg('') }}
              footer={<>
                {msg && <p className="qualityProfileError" role="alert">{msg}</p>}
                <button type="button" className="akBtn akBtnGhost" data-dialog-autofocus disabled={saving} onClick={() => { setPendingDelete(null); setMsg('') }}>Batal</button>
                <button type="button" className="akBtn akBtnDanger" disabled={saving} onClick={() => void permanentlyDelete()}>
                  {saving ? 'Memeriksa dan menghapus…' : 'Hapus permanen'}
                </button>
              </>}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Profil ini akan dihapus dari kamus indikator, bukan hanya disembunyikan. Aksi hanya diizinkan untuk profil <strong>retired/draf yang nonaktif</strong> dan tidak memiliki tautan ke respons, catatan audit, aturan OPPE, atau proposal.
                </div>
                <div style={{ border: '1px solid rgba(190,125,35,.34)', background: 'rgba(190,125,35,.07)', borderRadius: 10, padding: 11, fontSize: 12, lineHeight: 1.55 }}>
                  Riwayat versi ini akan hilang. Data audit tidak dihapus. Server memeriksa ulang seluruh referensi sebelum mengizinkan penghapusan.
                </div>
              </div>
            </AurekaModal>
            <AurekaModal
              open={Boolean(edit || newOne)}
              title={edit ? 'Edit indikator' : 'Tambah indikator'}
              subtitle={edit ? 'Perubahan diterbitkan sebagai versi baru. Versi lama tetap tersimpan.' : undefined}
              size="xl"
              closeDisabled={saving}
              closeOnBackdrop={false}
              onClose={closeEditor}
              footer={<>
                {msg && <p className="qualityProfileError" role="alert">{msg}</p>}
                <button type="button" className="akBtn akBtnGhost" disabled={saving} onClick={closeEditor}>Batal</button>
                <button type="submit" form={editorFormId} className="akBtn akBtnPrimary" disabled={saving}>
                  {saving ? 'Menyimpan…' : edit ? 'Terbitkan versi baru' : 'Tambah indikator'}
                </button>
              </>}
            >
              {edit ? editor(edit, setEdit, () => void publish()) : newOne ? editor(newOne, setNewOne, () => void add()) : null}
            </AurekaModal>
            <div style={{ display: 'grid', gap: 7 }}>
              {profileGroups.map(([label, group]) => <section key={label} style={{ display: 'grid', gap: 7 }}>
                {label && <h3>{label} ({group.length})</h3>}
                {group.map((profile) => (
                <div key={profile.id} style={{ padding: 11, border: needsMetadataReview(profile) ? '1px solid rgba(184,52,52,.48)' : needsTargetApproval(profile) ? '1px solid rgba(190,125,35,.48)' : hasNeutralTargetStatus(profile) ? '1px solid rgba(100,116,139,.28)' : '1px solid rgba(20,34,27,.09)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', opacity: profile.is_active ? 1 : .62, background: 'rgba(255,255,255,.19)' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontSize: 12, fontWeight: 850, overflowWrap: 'anywhere' }}>{profile.code} · {profile.title || '(Tanpa nama)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {(profile.indicator_type || 'Tanpa program')} · {profile.unit_name || 'Unit belum ditentukan'} · {profile.category || 'Kategori belum diisi'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Target: {profile.target_text || '-'} · Satuan: {profile.unit_of_measure || '-'} · Grain: {profile.measurement_grain || '-'} · Tipe: {profile.schema_json?.measurement_type || 'Belum ditetapkan'} · v{profile.version || 1} · {profile.status || '-'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                      Arah capaian: {profile.schema_json?.indicator_direction === 'positive' ? 'Positif' : profile.schema_json?.indicator_direction === 'negative' ? 'Negatif' : 'Belum ditetapkan'}
                    </div>
                    {profile.schema_json?.target_status === 'operational_hospital' && profile.schema_json?.target_basis && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                      {String(profile.schema_json.target_basis)}
                    </div>}
                    {profile.schema_json?.excel_mapping && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, overflowWrap: 'anywhere' }}>
                      Sumber Excel: {profile.schema_json.excel_mapping.worksheet || 'Worksheet belum ditetapkan'} · {profile.schema_json.excel_mapping.indicator_header || 'Header indikator belum dipetakan'}
                    </div>}
                    {needsMetadataReview(profile) && <div className="qsReviewNote">Perlu perbaikan teknis: {metadataReviewReasons(profile).join(', ')}.</div>}
                    {!needsMetadataReview(profile) && needsTargetApproval(profile) && <div style={{ marginTop: 5, color: '#9a6700', fontSize: 12, fontWeight: 750 }}>Perlu pengesahan pemilik indikator: {targetApprovalReasons(profile).join(', ')}. Indikator tetap dapat dipetakan dan dicatat; target belum dihitung sebagai target resmi.</div>}
                    {!needsMetadataReview(profile) && !needsTargetApproval(profile) && hasNeutralTargetStatus(profile) && <div style={{ marginTop: 5, padding: '7px 9px', borderRadius: 8, background: 'rgba(100,116,139,.08)', color: '#526170', fontSize: 12, lineHeight: 1.5 }}>{neutralTargetExplanation(profile)}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canManageCatalog && (profile.status === 'draft' || isActivePublished(profile)) && <button type="button" className="textButton" disabled={saving} onClick={() => { const draft = editModel(profile); editorInitialValue.current = JSON.stringify(draft); setEdit(draft); setNewOne(null); setMsg('') }}>{profile.status === 'draft' ? 'Tinjau / terbitkan' : 'Edit indikator'}</button>}
                    {canManageCatalog && isActivePublished(profile) && <button type="button" className="textButton" disabled={saving} onClick={() => void retire(profile)}>Pensiunkan</button>}
                    {(profile.status === 'retired' || profile.is_active === false) && <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>Riwayat versi · baca saja</span>}
                    {canManageCatalog && profile.is_active === false && (profile.status === 'retired' || profile.status === 'draft') && <button type="button" className="textButton" disabled={saving} onClick={() => { setMsg(''); setPendingDelete(profile) }} style={{ color: '#a23b31', fontWeight: 800 }}>Hapus permanen</button>}
                  </div>
                </div>
              ))}
              </section>)}
              {!filteredProfiles.length && <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Tidak ada indikator yang cocok dengan filter ini.</div>}
            </div>
          </div>
        )}





        </div>
      </LiquidGlass>
    </div>
  )
}
