'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { UNIT_IMPORTER_CATALOG, getImporterForRoom } from '@/lib/aureka/importer-catalog'
import { primeInteractiveExcelHeaderMappings } from '@/lib/aureka/interactive-header-mapping'

type Room = { id: number; name: string }
type Profile = {
  id: string
  room_id: number
  profile_year: number
  code: string
  title: string
  status: string
  is_active: boolean
  options_json?: unknown[]
  schema_json?: Record<string, any>
}
type ImportMapping = {
  workbook: { worksheet: string; header_row: number; data_start_row: number; header_scan_max_column?: number }
  fields: Record<string, string>
  indicators: Record<string, { source_header: string; occurrence: number }>
}
type WorkbookHeader = { column_index: number; column_letter: string; label: string }
type AiSuggestion = {
  type: 'field' | 'indicator'
  field_key?: string
  indicator_code?: string
  label: string
  source_header: string
  column_index: number
  column_letter?: string
  confidence: number
  rationale: string
}

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const DEFAULT_REASON = 'Konfigurasi awal mapping unit dan indikator berdasarkan struktur workbook yang dipilih.'
const keyForRoom = (roomId: number) => getImporterForRoom(roomId)?.importerKey ?? ('planned-room-' + roomId)
const clean = (value: unknown) => String(value ?? '').trim()
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const columnLetter = (number: number) => {
  let value = number
  let result = ''
  while (value > 0) {
    const digit = (value - 1) % 26
    result = String.fromCharCode(65 + digit) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}
const blankMapping = (roomId: number, profiles: Profile[]): ImportMapping => {
  const importer = getImporterForRoom(roomId)
  return {
    workbook: {
      worksheet: importer?.sheetName ?? 'Logbook',
      header_row: importer?.headerRow ?? 1,
      data_start_row: importer?.dataStartRow ?? 2,
      ...(roomId === 6 ? { header_scan_max_column: 100 } : {}),
    },
    fields: Object.fromEntries((importer?.fields ?? []).map(field => [field.fieldKey, field.defaultHeader])),
    indicators: Object.fromEntries(profiles.map(profile => {
      const catalogDefault = importer?.indicators.find(item => item.code === profile.code)?.defaultHeader
      const profileDefault = clean(profile.schema_json?.excel_mapping?.indicator_header ?? profile.schema_json?.header_label)
      return [profile.code, { source_header: catalogDefault || profileDefault, occurrence: 1 }]
    })),
  }
}
const mergeMapping = (base: ImportMapping, saved: any): ImportMapping => ({
  workbook: { ...base.workbook, ...(saved?.workbook && typeof saved.workbook === 'object' ? saved.workbook : {}) },
  fields: { ...base.fields, ...(saved?.fields && typeof saved.fields === 'object' ? saved.fields : {}) },
  indicators: { ...base.indicators, ...(saved?.indicators && typeof saved.indicators === 'object' ? saved.indicators : {}) },
})

export default function QualityImportMappingManager({
  rooms,
  initialRoomId,
  role,
}: {
  rooms: Room[]
  initialRoomId: number | null
  role: string | null
}) {
  const [mode, setMode] = useState<'unit' | 'indicator' | 'nara'>('unit')
  const [roomId, setRoomId] = useState<number | null>(initialRoomId ?? rooms[0]?.id ?? null)
  const [year, setYear] = useState(2026)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reason, setReason] = useState(DEFAULT_REASON)
  const [mappingSource, setMappingSource] = useState<'saved' | 'profile-default' | 'draft'>('draft')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([])
  const [aiSelected, setAiSelected] = useState<Record<number, boolean>>({})
  const [workbookHeaders, setWorkbookHeaders] = useState<WorkbookHeader[]>([])
  const [workbookSheet, setWorkbookSheet] = useState('')
  const [workbookHeaderRow, setWorkbookHeaderRow] = useState(1)
  const [sourceFileName, setSourceFileName] = useState('')

  const canManage = role === 'ADMIN' || role === 'PMKP'
  const room = useMemo(() => rooms.find(item => Number(item.id) === Number(roomId)) ?? null, [rooms, roomId])
  const importer = useMemo(() => roomId == null ? null : getImporterForRoom(roomId), [roomId])
  const importerKey = useMemo(() => roomId == null ? '' : keyForRoom(roomId), [roomId])
  const profileIndicators = useMemo(() => profiles
    .filter(item => item.is_active && item.status === 'published')
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [profiles])
  const defaultFields = importer?.fields ?? []
  const currentMapping = mapping ?? (roomId == null ? null : blankMapping(roomId, profiles))
  const configuredCount = currentMapping
    ? Object.values(currentMapping.fields).filter(Boolean).length +
      Object.values(currentMapping.indicators).filter(item => clean(item?.source_header)).length
    : 0
  const mappedIndicatorCount = currentMapping
    ? profileIndicators.filter(profile => clean(currentMapping.indicators[profile.code]?.source_header)).length
    : 0

  useEffect(() => {
    if (initialRoomId != null) setRoomId(initialRoomId)
  }, [initialRoomId])

  const load = useCallback(async () => {
    if (roomId == null) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const [profileResult, configResult] = await Promise.all([
        q().from('indicator_profiles')
          .select('id,room_id,profile_year,code,title,status,is_active,options_json,schema_json')
          .eq('room_id', roomId).eq('profile_year', year)
          .eq('status', 'published').eq('is_active', true).order('code'),
        q().rpc('quality_import_mapping_list_for_room', {
          p_room_id: roomId,
          p_profile_year: year,
        }),
      ])
      if (profileResult.error) throw profileResult.error
      if (configResult.error) throw configResult.error
      const nextProfiles = (profileResult.data ?? []) as Profile[]
      setProfiles(nextProfiles)
      const base = blankMapping(roomId, nextProfiles)
      const rows = Array.isArray(configResult.data) ? configResult.data : []
      const existing = rows.find((item: any) => item.importer_key === keyForRoom(roomId))
      setMapping(existing ? mergeMapping(base, existing.mapping_json) : base)
      setSavedVersion(Number(existing?.version ?? 0))
      setMappingSource(existing ? 'saved' : nextProfiles.some(item => item.schema_json?.excel_mapping || item.schema_json?.header_label) ? 'profile-default' : 'draft')
      setReason(DEFAULT_REASON)
      setAiSuggestions([]); setAiSelected({}); setAiStatus('')
      // Keep the import resolver's in-memory view synchronized with the persisted mapping.
      primeInteractiveExcelHeaderMappings(rows as any[])
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Konfigurasi mapping unit belum dapat dimuat.' }))
      setMapping(null)
    } finally {
      setLoading(false)
    }
  }, [roomId, year])

  useEffect(() => { void load() }, [load])

  const updateWorkbook = (patch: Partial<ImportMapping['workbook']>) => {
    setMapping(current => current ? { ...current, workbook: { ...current.workbook, ...patch } } : current)
    setMappingSource('draft')
  }
  const updateField = (key: string, value: string) => {
    setMapping(current => current ? { ...current, fields: { ...current.fields, [key]: value } } : current)
    setMappingSource('draft')
  }
  const updateIndicator = (code: string, value: string) => {
    setMapping(current => current ? {
      ...current,
      indicators: { ...current.indicators, [code]: { ...(current.indicators[code] ?? { occurrence: 1 }), source_header: value } },
    } : current)
    setMappingSource('draft')
  }

  const save = async () => {
    if (!canManage || roomId == null || !mapping || !importerKey) return
    if (reason.trim().length < 10) {
      setError('Alasan penyimpanan mapping minimal 10 karakter.')
      return
    }
    const invalid = Object.entries(mapping.indicators).find(([code, value]) => clean(value?.source_header) === '')
    if (invalid) {
      setError('Kolom sumber indikator ' + invalid[0] + ' belum diisi. Isi kolom tersebut atau keluarkan indikator dari cakupan profil aktif.')
      return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      const payload = {
        workbook: {
          worksheet: clean(mapping.workbook.worksheet),
          header_row: Number(mapping.workbook.header_row),
          data_start_row: Number(mapping.workbook.data_start_row),
          ...(mapping.workbook.header_scan_max_column ? { header_scan_max_column: Number(mapping.workbook.header_scan_max_column) } : {}),
        },
        fields: Object.fromEntries(Object.entries(mapping.fields).map(([key, value]) => [key, clean(value)]).filter(([, value]) => value)),
        indicators: Object.fromEntries(Object.entries(mapping.indicators).map(([code, value]) => [
          code,
          { source_header: clean(value?.source_header), occurrence: Math.max(1, Number(value?.occurrence ?? 1)) },
        ])),
      }
      const { data, error: rpcError } = await q().rpc('quality_import_mapping_save', {
        p_room_id: roomId,
        p_profile_year: year,
        p_importer_key: importerKey,
        p_mapping_json: payload,
        p_reason: reason.trim(),
      })
      if (rpcError) throw rpcError
      setSavedVersion(Number((data as any)?.version ?? savedVersion + 1))
      setMappingSource('saved')
      setSuccess('Konfigurasi ' + (importer?.label ?? room?.name ?? 'unit') + ' tersimpan sebagai versi ' + Number((data as any)?.version ?? savedVersion + 1) + '. Mapping akan digunakan saat uploader membuka workbook berikutnya.')
      setReason('Perubahan mapping kolom berdasarkan pemeriksaan workbook unit.')
      // Refresh the resolver without requiring a full page reload.
      primeInteractiveExcelHeaderMappings([{
        importer_key: importerKey,
        mapping_json: payload,
      }])
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Konfigurasi mapping belum berhasil disimpan.' }))
    } finally {
      setSaving(false)
    }
  }

  const parseWorkbookHeaders = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('NARA hanya menerima workbook .xlsx.')
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('Ukuran workbook harus di atas 0 dan maksimal 25 MB.')
    const module = await import('exceljs-hardened')
    const ExcelJS: any = (module as any).default ?? module
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0 || workbook.worksheets.length > 80) {
      throw new Error('Workbook tidak memiliki sheet atau jumlah sheet melebihi batas pemeriksaan.')
    }
    const desiredSheet = clean(currentMapping?.workbook.worksheet) || importer?.sheetName || ''
    const worksheet = workbook.getWorksheet(desiredSheet) ?? workbook.worksheets[0]
    if (!worksheet) throw new Error('Sheet workbook tidak dapat dibaca.')
    const configuredRow = Number(currentMapping?.workbook.header_row ?? importer?.headerRow ?? 1)
    let bestRow = Math.max(1, Math.min(20, configuredRow))
    let bestScore = -1
    for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber++) {
      let score = 0
      const maxColumn = Math.min(120, Number(worksheet.getRow(rowNumber).cellCount ?? 120))
      for (let column = 1; column <= maxColumn; column++) {
        const text = String(worksheet.getRow(rowNumber).getCell(column).text ?? worksheet.getRow(rowNumber).getCell(column).value ?? '').trim()
        if (text) score++
      }
      const preference = rowNumber === configuredRow ? 0.15 : 0
      if (score + preference > bestScore) { bestScore = score + preference; bestRow = rowNumber }
    }
    const headerRow = worksheet.getRow(configuredRow > 0 && configuredRow <= worksheet.rowCount ? configuredRow : bestRow)
    const headers: WorkbookHeader[] = []
    for (let column = 1; column <= Math.min(120, Number(headerRow.cellCount ?? 120)); column++) {
      const cell = headerRow.getCell(column)
      const raw = cell?.value
      // Only header-cell text is read. No patient/episode data rows are accessed or transmitted.
      const label = String(cell?.text ?? (typeof raw === 'string' || typeof raw === 'number' ? raw : '') ?? '').trim()
      if (!label) continue
      headers.push({ column_index: column, column_letter: columnLetter(column), label: label.slice(0, 160) })
    }
    if (!headers.length) throw new Error('Baris header tidak memiliki nama kolom yang dapat dipetakan.')
    setWorkbookHeaders(headers)
    setWorkbookSheet(worksheet.name)
    setWorkbookHeaderRow(configuredRow > 0 && configuredRow <= worksheet.rowCount ? configuredRow : bestRow)
    setSourceFileName(file.name)
    updateWorkbook({ worksheet: worksheet.name, header_row: configuredRow > 0 && configuredRow <= worksheet.rowCount ? configuredRow : bestRow })
    return { worksheet: worksheet.name, headerRow: configuredRow > 0 && configuredRow <= worksheet.rowCount ? configuredRow : bestRow, headers }
  }

  const requestNaraSuggestions = async (file: File) => {
    if (!canManage || roomId == null || !importer) {
      setError('Usulan NARA memerlukan unit dengan importer aktif dan hak Admin/PMKP.')
      return
    }
    if (!profileIndicators.length) {
      setError('Profil indikator aktif belum tersedia. Muat profil unit terlebih dahulu.')
      return
    }
    setAiBusy(true); setError(''); setSuccess(''); setAiStatus('Membaca nama sheet dan header saja; baris data pasien tidak diproses.')
    try {
      const inspected = await parseWorkbookHeaders(file)
      const fields = importer.fields.map(field => ({
        field_key: field.fieldKey,
        label: field.label,
        current_source_header: clean(mapping?.fields[field.fieldKey] ?? field.defaultHeader),
      }))
      const indicators = profileIndicators.slice(0, 100).map(profile => ({
        code: profile.code,
        title: profile.title.slice(0, 160),
        current_source_header: clean(mapping?.indicators[profile.code]?.source_header),
      }))
      const { data, error: invokeError } = await sb.functions.invoke('aureka-tanya', {
        body: {
          task: 'import_mapping_suggest',
          question: 'Buat usulan pemetaan struktur header workbook ke field umum dan profil indikator untuk unit terpilih. Hasil harus berupa usulan yang akan diperiksa manusia.',
          page: 'Pusat Rekonsiliasi · Pemetaan Excel',
          mapping_request: {
            room_id: roomId,
            profile_year: year,
            importer_key: importerKey,
            worksheet: inspected.worksheet,
            header_row: inspected.headerRow,
            headers: inspected.headers,
            fields,
            indicators,
          },
        },
      })
      if (invokeError) throw invokeError
      const items = Array.isArray((data as any)?.items) ? (data as any).items : []
      const parsed: AiSuggestion[] = items.map((item: any) => ({
        type: item.type === 'indicator' ? 'indicator' : 'field',
        field_key: String(item.field_key ?? ''),
        indicator_code: String(item.indicator_code ?? ''),
        label: String(item.label ?? item.indicator_code ?? item.field_key ?? 'Field'),
        source_header: String(item.source_header ?? ''),
        column_index: Number(item.column_index ?? 0),
        column_letter: String(item.column_letter ?? ''),
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0))),
        rationale: String(item.rationale ?? '').slice(0, 500),
      })).filter((item: AiSuggestion) => item.source_header && item.column_index > 0)
      if (!parsed.length) {
        const explanation = String((data as any)?.answer ?? (data as any)?.error ?? 'NARA tidak menemukan pemetaan yang cukup kuat.')
        setAiStatus(explanation)
        setAiSuggestions([])
      } else {
        setAiSuggestions(parsed)
        setAiSelected(Object.fromEntries(parsed.map((item, index) => [index, item.confidence >= 0.75])))
        setAiStatus('NARA menghasilkan ' + parsed.length + ' usulan dari ' + inspected.headers.length + ' header. Periksa setiap usulan sebelum menerapkan dan menyimpan.')
      }
    } catch (cause) {
      setAiStatus('')
      setError(toUserFacingError(cause, { fallback: 'NARA belum dapat menyusun usulan mapping. Konfigurasi manual tetap dapat digunakan.' }))
    } finally {
      setAiBusy(false)
    }
  }

  const applyAiSuggestions = () => {
    const chosen = aiSuggestions.filter((_, index) => aiSelected[index])
    if (!chosen.length) {
      setError('Pilih minimal satu usulan NARA yang telah diperiksa.')
      return
    }
    setMapping(current => {
      if (!current) return current
      const next: ImportMapping = {
        ...current,
        fields: { ...current.fields },
        indicators: { ...current.indicators },
      }
      for (const item of chosen) {
        if (item.type === 'indicator' && item.indicator_code && next.indicators[item.indicator_code]) {
          next.indicators[item.indicator_code] = { ...next.indicators[item.indicator_code], source_header: item.source_header }
        } else if (item.type === 'field' && item.field_key) {
          next.fields[item.field_key] = item.source_header
        }
      }
      return next
    })
    setMappingSource('draft')
    setSuccess(chosen.length + ' usulan NARA diterapkan ke draf. Tekan Simpan Konfigurasi untuk mengaktifkan mapping.')
    setMode('indicator')
  }

  const openProfileEditor = (code: string) => {
    window.location.hash = '#indikator-mutu/profil-indikator'
    window.dispatchEvent(new CustomEvent('aureka:workspace-search', { detail: { query: code } }))
  }

  const tabs = [
    { id: 'unit', label: 'Pengaturan per Unit' },
    { id: 'indicator', label: 'Pengaturan per Indikator' },
    { id: 'nara', label: 'Bantuan NARA AI' },
  ] as const

  return <section className="qimWorkspace">
    <style>{`
      .qimWorkspace{display:grid;gap:14px;min-width:0;color:#1d3448}
      .qimHero{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .qimHero h3{margin:3px 0;font-size:21px;letter-spacing:-.03em}
      .qimHero p{margin:0;color:#718495;line-height:1.5;font-size:12px;max-width:800px}
      .qimEyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#638097;font-weight:850}
      .qimToolbar{display:flex;gap:9px;align-items:end;flex-wrap:wrap}
      .qimField{display:grid;gap:5px;font-size:11px;color:#6d8090;font-weight:800}
      .qimField input,.qimField select,.qimField textarea{min-height:38px;border:1px solid #dbe4ea;background:#fff;color:#223b4e;border-radius:9px;padding:8px 10px;font:inherit;min-width:150px}
      .qimField textarea{min-width:260px;min-height:64px;resize:vertical}
      .qimTabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #e5edf1;padding-bottom:8px}
      .qimTab{border:1px solid #dce6ec;border-radius:9px;background:#fff;padding:9px 12px;color:#586e7e;font-size:12px;font-weight:800;cursor:pointer}
      .qimTab.active{background:#e8f1f8;border-color:#c4d8e8;color:#174e73}
      .qimPanel{border:1px solid #e3eaef;border-radius:12px;background:#fff;overflow:hidden}
      .qimPanelHead{padding:13px 15px;border-bottom:1px solid #e9eff3;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .qimPanelHead strong{font-size:14px}
      .qimPanelHead p{margin:3px 0 0;color:#718495;font-size:11px;line-height:1.5}
      .qimPanelBody{padding:14px;display:grid;gap:12px}
      .qimFields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .qimFields .qimField input,.qimFields .qimField select{width:100%;min-width:0}
      .qimTableWrap{overflow:auto}
      .qimTable{width:100%;min-width:680px;border-collapse:separate;border-spacing:0;font-size:12px}
      .qimTable th,.qimTable td{padding:9px 10px;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:middle}
      .qimTable th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;background:#f8fafc;color:#6e8190}
      .qimTable tr:last-child td{border-bottom:0}
      .qimTable input{width:100%;min-height:36px;border:1px solid #d9e3e9;border-radius:8px;padding:7px 9px;background:#fff;color:#244054;font-size:12px}
      .qimMuted{display:block;color:#7a8c99;font-size:10px;line-height:1.45;margin-top:3px}
      .qimBadge{display:inline-flex;padding:4px 7px;border-radius:7px;background:#edf3f7;color:#4d687c;font-size:10px;font-weight:800}
      .qimBadge.good{background:#e7f5eb;color:#246c46}
      .qimBadge.warn{background:#fff4dd;color:#84601a}
      .qimBtn{border:1px solid #d6e1e8;background:#fff;color:#24465d;border-radius:9px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer}
      .qimBtn:disabled{opacity:.5;cursor:not-allowed}
      .qimBtn.primary{background:#194d71;border-color:#194d71;color:#fff}
      .qimBtn.ai{background:#f0eaff;border-color:#d9c9ff;color:#5737a2}
      .qimMessage{border-radius:9px;padding:10px 12px;font-size:12px;line-height:1.5}
      .qimMessage.error{background:#fff1ef;color:#8e3a30;border:1px solid #f0d3cf}
      .qimMessage.success{background:#edf8f0;color:#246c46;border:1px solid #cde8d5}
      .qimMessage.info{background:#f1f6f9;color:#516c7f;border:1px solid #dfe8ee}
      .qimSuggestion{display:grid;grid-template-columns:26px minmax(0,1fr) 90px;gap:9px;align-items:start;padding:10px 12px;border-bottom:1px solid #edf1f4}
      .qimSuggestion:last-child{border-bottom:0}
      .qimSuggestion strong{display:block;font-size:12px}
      .qimSuggestion p{margin:3px 0 0;color:#718495;font-size:11px;line-height:1.4}
      .qimFoot{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      @media(max-width:850px){.qimFields{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.qimFields{grid-template-columns:1fr}.qimSuggestion{grid-template-columns:24px 1fr}.qimSuggestion .qimBadge{grid-column:2}}
    `}</style>

    <header className="qimHero">
      <div>
        <span className="qimEyebrow">Excel Import Governance · Unit & Indicator Mapping</span>
        <h3>Pengaturan Pemetaan Workbook</h3>
        <p>Atur hubungan kolom Excel dengan data episode dan indikator sekali saja per unit. Konfigurasi tersimpan di server, mempunyai versi, dan digunakan kembali saat uploader membuka workbook berikutnya.</p>
      </div>
      <div className="qimToolbar">
        <label className="qimField">Unit rumah sakit
          <select value={roomId ?? ''} onChange={event => setRoomId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Pilih unit…</option>
            {rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="qimField">Tahun profil
          <select value={year} onChange={event => setYear(Number(event.target.value))}>
            {[2025,2026,2027,2028,2029].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
    </header>

    <nav className="qimTabs" role="tablist" aria-label="Pengaturan mapping workbook">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={mode===tab.id} className={'qimTab '+(mode===tab.id?'active':'')} onClick={() => setMode(tab.id)}>{tab.label}</button>)}
    </nav>

    {error && <div className="qimMessage error" role="alert">{error}</div>}
    {success && <div className="qimMessage success" role="status">{success}</div>}
    {loading && <div className="qimMessage info">Memuat profil indikator dan konfigurasi sumber unit…</div>}

    {!roomId ? <div className="qimPanel"><div className="qimPanelBody">Pilih unit terlebih dahulu untuk menampilkan mapping workbook.</div></div> : currentMapping && <>
      <section className="qimPanel">
        <div className="qimPanelHead">
          <div>
            <strong>{room?.name ?? 'Unit '+roomId} · {importer?.workbookLabel ?? 'Konfigurasi sumber Excel'}</strong>
            <p>{importer ? 'Importer tersedia: '+importer.importerKey+'. Mapping dapat diterapkan pada alur unggah unit yang mendukung resolver terpusat.' : 'Unit ini belum memiliki importer workbook khusus. Anda tetap dapat mendokumentasikan rancangan mapping, tetapi konfigurasi belum akan dipakai oleh uploader sampai importer unit dibuat.'}</p>
          </div>
          <div className="qimFoot">
            <span className={'qimBadge '+(importer?'good':'warn')}>{importer?'Importer tersedia':'Belum ada importer khusus'}</span>
            <span className="qimBadge">{mappingSource==='saved'?'Tersimpan v'+savedVersion:mappingSource==='profile-default'?'Default profil':'Draf baru'}</span>
          </div>
        </div>

        {mode === 'unit' && <div className="qimPanelBody">
          <div className="qimFields">
            <label className="qimField">Nama sheet / worksheet
              <input value={currentMapping.workbook.worksheet} onChange={event => updateWorkbook({worksheet:event.target.value})} placeholder="Logbook"/>
            </label>
            <label className="qimField">Baris header
              <input type="number" min={1} max={999} value={currentMapping.workbook.header_row} onChange={event => updateWorkbook({header_row:Number(event.target.value)})}/>
            </label>
            <label className="qimField">Baris awal data
              <input type="number" min={2} max={9999} value={currentMapping.workbook.data_start_row} onChange={event => updateWorkbook({data_start_row:Number(event.target.value)})}/>
            </label>
          </div>
          <div><strong style={{fontSize:13}}>Kolom data utama</strong><span className="qimMuted">Setiap kolom tujuan menunjukkan field yang dibaca oleh importer. Nama kolom sumber boleh berbeda dari template bawaan.</span></div>
          {defaultFields.length ? <div className="qimTableWrap"><table className="qimTable">
            <thead><tr><th>Field tujuan AUREKA</th><th>Kunci importer</th><th>Kolom sumber Excel</th></tr></thead>
            <tbody>{defaultFields.map(field => <tr key={field.fieldKey}>
              <td><strong>{field.label}</strong>{field.required && <span className="qimMuted">Wajib</span>}</td>
              <td><code>{field.fieldKey}</code></td>
              <td><input value={currentMapping.fields[field.fieldKey] ?? ''} onChange={event => updateField(field.fieldKey,event.target.value)} placeholder={field.defaultHeader}/></td>
            </tr>)}</tbody>
          </table></div> : <div className="qimMessage info">Importer unit ini belum menyediakan daftar field dasar otomatis. Profil indikator di bawah tetap dapat dipetakan.</div>}
          <div className="qimFoot">
            <span className="qimMuted">Kolom utama terisi: {count(Object.values(currentMapping.fields).filter(Boolean).length)} · Indikator terpetakan: {count(mappedIndicatorCount)}/{count(profileIndicators.length)}</span>
            <button type="button" className="qimBtn" disabled={loading||saving} onClick={() => setMode('indicator')}>Lanjut ke pengaturan indikator</button>
          </div>
        </div>}

        {mode === 'indicator' && <div className="qimPanelBody">
          <div><strong style={{fontSize:13}}>Kolom sumber per indikator</strong><span className="qimMuted">Kolom Excel dipetakan ke kode dan profil indikator yang sudah aktif. Ketidakcocokan nama kolom tidak lagi dianggap kesalahan profil.</span></div>
          {profileIndicators.length ? <div className="qimTableWrap"><table className="qimTable">
            <thead><tr><th>Kode</th><th>Profil indikator</th><th>Kolom sumber Excel</th><th>Profil</th></tr></thead>
            <tbody>{profileIndicators.map(profile => {
              const source = currentMapping.indicators[profile.code]?.source_header ?? ''
              return <tr key={profile.id}>
                <td><strong>{profile.code}</strong></td>
                <td><strong>{profile.title}</strong><span className="qimMuted">ID master: {profile.id.slice(0,8)}</span></td>
                <td><input value={source} onChange={event => updateIndicator(profile.code,event.target.value)} placeholder="Nama kolom pada workbook"/></td>
                <td><button type="button" className="qimBtn" onClick={() => openProfileEditor(profile.code)}>Buka profil indikator</button></td>
              </tr>
            })}</tbody>
          </table></div> : <div className="qimMessage info">Belum ada profil indikator aktif pada unit dan tahun ini.</div>}
          <div className="qimFoot"><span className="qimMuted">Jumlah profil aktif: {profileIndicators.length}. Klasifikasi jawaban dan definisi numerator/denominator tidak diubah oleh mapping ini.</span></div>
        </div>}

        {mode === 'nara' && <div className="qimPanelBody">
          <div className="qimMessage info">
            NARA hanya membaca nama sheet dan baris header Excel. Tidak ada baris pasien, nama, nomor rekam medis, diagnosis, atau nilai pengamatan yang dikirim ke provider AI. Hasil NARA berupa usulan dan tidak langsung disimpan.
          </div>
          <label className="qimField">Pilih workbook contoh (.xlsx)
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={aiBusy||!importer} onChange={event => {
              const file = event.target.files?.[0]
              if (file) void requestNaraSuggestions(file)
              event.currentTarget.value = ''
            }}/>
          </label>
          {sourceFileName && <span className="qimMuted">Workbook yang diperiksa: {sourceFileName} · sheet {workbookSheet} · baris header {workbookHeaderRow} · {workbookHeaders.length} kolom header</span>}
          {aiBusy && <div className="qimMessage info">{aiStatus || 'NARA sedang menyusun usulan pemetaan…'}</div>}
          {!aiBusy && aiStatus && <div className="qimMessage info">{aiStatus}</div>}
          {aiSuggestions.length > 0 && <>
            <div className="qimPanelHead" style={{padding:'10px 0',border:0}}>
              <div><strong>Usulan pemetaan NARA</strong><p>Pilih usulan yang benar. Nilai confidence membantu prioritas, bukan pengganti pemeriksaan.</p></div>
              <span className="qimBadge">{aiSuggestions.filter((_,index)=>aiSelected[index]).length}/{aiSuggestions.length} dipilih</span>
            </div>
            <div className="qimPanel">
              {aiSuggestions.map((item,index)=><label className="qimSuggestion" key={index}>
                <input type="checkbox" checked={!!aiSelected[index]} onChange={event => setAiSelected(current=>({...current,[index]:event.target.checked}))}/>
                <div>
                  <strong>{item.label} ← kolom {item.column_letter || columnLetter(item.column_index)} · {item.source_header}</strong>
                  <p>{item.rationale}</p>
                </div>
                <span className="qimBadge">{Math.round(item.confidence*100)}%</span>
              </label>)}
            </div>
            <div className="qimFoot"><button type="button" className="qimBtn ai" onClick={applyAiSuggestions}>Terapkan pilihan ke draf</button></div>
          </>}
        </div>}

        <footer className="qimPanelHead">
          <label className="qimField" style={{flex:1,minWidth:240}}>Alasan perubahan
            <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Contoh: Penyesuaian nama header sesuai workbook unit."/>
          </label>
          <div className="qimFoot">
            <button type="button" className="qimBtn" disabled={loading||saving} onClick={() => void load()}>Muat ulang</button>
            <button type="button" className="qimBtn primary" disabled={!canManage||loading||saving||reason.trim().length<10} onClick={() => void save()}>{saving?'Menyimpan…':'Simpan Konfigurasi Unit'}</button>
          </div>
        </footer>
      </section>
    </>}
  </section>
}
