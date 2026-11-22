'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { useLatestWorkspaceRequest } from '@/lib/ui/use-latest-workspace-request'
import { readAllPages } from '@/lib/aureka/pagination'
import { EPISODE_WORKBOOK_IMPORTER, supportsEpisodeWorkbook } from '@/lib/aureka/patient-episode-workbook'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import QualityWorkbookImportPanel from '@/components/QualityWorkbookImportPanel'
import { classifyQualityWorkbookName } from '@/lib/aureka/quality-workbook-source-audit'
import QualityOptionEditor from '@/components/quality/QualityOptionEditor'
import { detectExcelHeaderColumns, resolveExcelSourceColumn, describeExcelSourceColumn, type ExcelHeaderColumn } from '@/lib/aureka/excel-column-picker'
import { proposeWorkbookIndicatorMappings, provisionalDraftStorageKey, parseProvisionalMappingDraft, type ProvisionalMappingDraft } from '@/lib/aureka/quality-workbook-mapping-draft'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'

type Room = { id: number; name: string }
type Profile = {
  id: string
  version?: number
  room_id: number
  profile_year: number
  code: string
  title: string
  category?: string | null
  unit_of_measure?: string | null
  target_text?: string | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  schema_json?: Record<string, any> | null
  options_json?: any[]
  status: string
  is_active: boolean
}
type Mapping = {
  id?: string
  room_id: number
  profile_year: number
  importer_key: string
  target_type: 'indicator' | 'field'
  target_key: string
  target_label: string
  source_header: string
  occurrence: number
  transform_json?: { source_sheet?: string; header_row?: number; column_index?: number; column_letter?: string } | null
  mapping_status: string
  ai_confidence?: number | null
  ai_rationale?: string | null
}
type Suggestion = { indicator_code: string; source_header: string | null; confidence: number; rationale: string }
type Importer = { key: string; label: string; room_id: number }
type HeaderCandidate = { row: number; columns: ExcelHeaderColumn[] }
type HeaderSheet = { name: string; recommendedRow: number; candidates: HeaderCandidate[] }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const importers: Importer[] = [
  { room_id: 1, key: 'complaint', label: 'Logbook Informasi & Pengaduan' },
  { room_id: 2, key: 'it', label: 'Logbook Informatika & Teknologi' },
  { room_id: 3, key: 'ambulance', label: 'Logbook Ambulance' },
  { room_id: 4, key: 'ibs', label: 'Logbook Instalasi Bedah Sentral' },
  { room_id: 5, key: 'pharmacy', label: 'Logbook Farmasi' },
  { room_id: 6, key: 'igd', label: 'Logbook IGD' },
  { room_id: 7, key: 'gizi', label: 'Logbook Gizi' },
  { room_id: 9, key: 'laboratory', label: 'Logbook Laboratorium' },
  { room_id: 11, key: 'outpatient', label: 'Logbook Rawat Jalan' },
  { room_id: 12, key: 'rehab-medik', label: 'Logbook Rehabilitasi Medik' },
  { room_id: 13, key: 'rekam-medis', label: 'Logbook Rekam Medis' },
  { room_id: 14, key: 'icu', label: 'Logbook ICU/HCU' },
  { room_id: 18, key: 'nicu', label: 'Logbook NICU/PICU' },
  { room_id: 19, key: 'nifas', label: 'Logbook Nifas/Obstetri' },
  { room_id: 20, key: 'perinatology', label: 'Logbook Perinatologi' },
  { room_id: 22, key: 'pediatric', label: 'Logbook Rawat Inap Anak' },
  { room_id: 23, key: 'surgical', label: 'Logbook Rawat Inap Bedah' },
  { room_id: 24, key: 'isolasi', label: 'Logbook Rawat Inap Isolasi' },
  { room_id: 25, key: 'internal-medicine', label: 'Logbook Penyakit Dalam' },
  { room_id: 26, key: 'saraf', label: 'Logbook Rawat Inap Saraf' },
  { room_id: 30, key: 'timkordik', label: 'Logbook Tim Koordinasi Pendidikan' },
  { room_id: 33, key: 'ponek', label: 'Logbook PONEK' },
]
const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim()
const profileKey = (code: string) => 'indicator:' + code
const draftKey = (importer: string, code: string) => importer + '|' + code
const numberLabel = (value: number) => Number(value || 0).toLocaleString('id-ID')

export default function QualityExcelMappingWorkspace({
  rooms,
  initialRoomId,
  year,
  role,
  onClose,
}: {
  rooms: Room[]
  initialRoomId: number | null
  year: number
  role: string | null
  onClose: () => void
}) {
  const canManage = role === 'ADMIN' || role === 'PMKP'
  const [roomId, setRoomId] = useState<number | null>(initialRoomId)
  const [profileYear, setProfileYear] = useState(year)
  const [activeTab, setActiveTab] = useState<'unit' | 'indicator' | 'import'>('unit')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const scope = JSON.stringify([roomId, profileYear, canManage])
  const beginLoad = useLatestWorkspaceRequest(scope)
  const [loadedScope, setLoadedScope] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const ready = loadedScope === scope && !loading && !loadError
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importerKey, setImporterKey] = useState('')
  const [sheets, setSheets] = useState<HeaderSheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [detectedColumns, setDetectedColumns] = useState<ExcelHeaderColumn[]>([])
  const [headerRow, setHeaderRow] = useState(1)
  const [workbookName, setWorkbookName] = useState('')
  // Original Excel files remain in browser memory only. The queue never uploads bytes.
  const [queuedWorkbooks, setQueuedWorkbooks] = useState<File[]>([])
  const [selectedQueuedIndex, setSelectedQueuedIndex] = useState<number | null>(null)
  const [queueError, setQueueError] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [headerConfirmed, setHeaderConfirmed] = useState(false)
  const [draftHeaders, setDraftHeaders] = useState<Record<string, string>>({})
  const [draftOccurrences, setDraftOccurrences] = useState<Record<string, number>>({})
  const [provisionalChoices, setProvisionalChoices] = useState<Record<string, number>>({})
  const [additionalColumns, setAdditionalColumns] = useState<number[]>([])
  const [newColumnIndex, setNewColumnIndex] = useState('')
  const [browserDraft, setBrowserDraft] = useState<ProvisionalMappingDraft['mappings']>([])
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const fileBusy = saving || inspecting || aiBusy
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileDraft, setProfileDraft] = useState({
    title: '', category: '', unit_of_measure: '', target_text: '',
    numerator_definition: '', denominator_definition: '', schema_text: '{}', options_text: '[]', reason: '',
  })
  const profileSchema = useMemo<Record<string, any>>(() => {
    try {
      const parsed = JSON.parse(profileDraft.schema_text)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { return {} }
  }, [profileDraft.schema_text])
  const updateProfileSchema = (patch: Record<string, unknown>) => {
    setProfileDraft(current => {
      let schema: Record<string, any> = {}
      try {
        const parsed = JSON.parse(current.schema_text)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) schema = parsed
      } catch { /* preserve untouched defaults */ }
      return { ...current, schema_text: JSON.stringify({ ...schema, ...patch }) }
    })
  }

  const activeSheet = sheets.find(sheet => sheet.name === selectedSheet)
  const activeRoom = rooms.find(item => Number(item.id) === Number(roomId)) ?? null
  const availableImporters = useMemo(() => {
    if (roomId == null) return []
    const configured = importers.filter(item => item.room_id === Number(roomId))
    return [
      { room_id: Number(roomId), key: 'unit-logbook', label: 'Tautkan kolom atau impor tabel' },
      ...(supportsEpisodeWorkbook(roomId) ? [{ room_id: roomId, key: EPISODE_WORKBOOK_IMPORTER, label: 'Workbook episode pasien' }] : []),
      ...configured,
    ]
  }, [roomId])
  const selectedImporter = availableImporters.find(item => item.key === importerKey) ?? availableImporters[0] ?? null
  const selectedProfile = !ready ? null : profiles.find(item => item.id === selectedProfileId) ?? profiles[0] ?? null
  const activeProfiles = useMemo(
    () => !ready ? [] : profiles.filter(item => item.is_active && item.status === 'published').sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [profiles, ready],
  )
  const suggestedProvisionalMappings = useMemo(
    () => activeProfiles.length || !ready ? [] : proposeWorkbookIndicatorMappings(roomId, detectedColumns, qualityAuditLayout2026),
    [activeProfiles.length, ready, roomId, detectedColumns],
  )
  const provisionalRows = useMemo(() => [
    ...suggestedProvisionalMappings,
    ...additionalColumns.flatMap(index => {
      const column = detectedColumns.find(item => item.index === index)
      if (!column || suggestedProvisionalMappings.some(item => normalize(item.indicatorLabel) === normalize(column.header))) return []
      return [{
        key: 'additional:' + index,
        indicatorLabel: column.header,
        columnIndex: index,
        sourceHeader: column.header,
        occurrence: column.occurrence,
      }]
    }),
  ], [suggestedProvisionalMappings, additionalColumns, detectedColumns])
  const provisionalColumn = (row: { key: string; columnIndex: number }) =>
    detectedColumns.find(item => item.index === (provisionalChoices[row.key] ?? row.columnIndex))
  const existingByCode = useMemo(() => {
    const map = new Map<string, Mapping>()
    for (const row of mappings) {
      if (row.importer_key === (selectedImporter?.key ?? importerKey) && row.target_type === 'indicator') {
        map.set(row.target_key.replace(/^indicator:/, ''), row)
      }
    }
    return map
  }, [mappings, selectedImporter?.key, importerKey])
  const sourceColumnFor = (key: string, mapping?: Mapping, fallback?: string, indicatorLabel?: string) => {
    const savedSheet = String(mapping?.transform_json?.source_sheet ?? '').trim()
    const savedRow = Number(mapping?.transform_json?.header_row)
    const manuallyChosen = Object.hasOwn(draftHeaders, key)
    if (!manuallyChosen && mapping?.mapping_status === 'needs_review') return null
    if (!manuallyChosen && ((savedSheet && normalize(savedSheet) !== normalize(selectedSheet)) || (savedRow > 0 && savedRow !== headerRow))) return null
    const provisional = browserDraft.find(row => normalize(row.indicatorLabel) === normalize(indicatorLabel))
    const wantedHeader = draftHeaders[key] ?? mapping?.source_header ?? provisional?.sourceHeader ?? fallback ?? indicatorLabel ?? ''
    // Retain the user's exact N/O selection when a worksheet contains duplicate headers.
    if (!manuallyChosen && mapping?.transform_json?.column_index) {
      const saved = detectedColumns.find(column => column.index === Number(mapping.transform_json?.column_index))
      if (saved && normalize(saved.header) === normalize(wantedHeader)) return saved
    }
    return resolveExcelSourceColumn(
      detectedColumns,
      wantedHeader,
      draftOccurrences[key] ?? mapping?.occurrence ?? provisional?.occurrence ?? 1,
    )
  }

  useEffect(() => setRoomId(initialRoomId), [initialRoomId])
  useEffect(() => setProfileYear(year), [year])
  useEffect(() => {
    if (!availableImporters.some(item => item.key === importerKey)) setImporterKey(availableImporters[0]?.key ?? '')
  }, [availableImporters, importerKey])

  useLayoutEffect(() => {
    setProfiles([]); setMappings([]); setSelectedProfileId('')
    setWorkbookName(''); setSheets([]); setSelectedSheet(''); setDetectedHeaders([]); setDetectedColumns([])
    setDraftHeaders({}); setDraftOccurrences({}); setAiSuggestions([]); setHeaderConfirmed(false)
    setProvisionalChoices({}); setAdditionalColumns([]); setNewColumnIndex(''); setBrowserDraft([])
    setError(''); setNotice('')
  }, [scope])

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    if (!isCurrent) return
    setLoadError('')
    if (!canManage || roomId == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [nextProfiles, mappingResult] = await Promise.all([
        readAllPages<Profile>((from, to) => q().from('indicator_profiles').select('*')
          .eq('room_id', roomId).eq('profile_year', profileYear).order('code').order('id').range(from, to)),
        q().rpc('quality_excel_header_mapping_list', {
          p_room_id: roomId,
          p_profile_year: profileYear,
          p_importer_key: null,
        }),
      ])
      if (mappingResult.error) throw mappingResult.error
      if (!isCurrent()) return
      setProfiles(nextProfiles)
      setMappings(Array.isArray(mappingResult.data?.mappings) ? mappingResult.data.mappings as Mapping[] : [])
      setSelectedProfileId(current => nextProfiles.some(item => item.id === current) ? current : nextProfiles[0]?.id ?? '')
      setLoadedScope(scope)
    } catch (cause) {
      if (isCurrent()) setLoadError(toUserFacingError(cause, { fallback: 'Konfigurasi pemetaan Excel belum dapat dimuat. Periksa koneksi dan hak akses.' }))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [beginLoad, canManage, roomId, profileYear, scope])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!selectedProfile) return
    const schema = selectedProfile.schema_json ?? {}
    setProfileDraft({
      title: selectedProfile.title ?? '',
      category: selectedProfile.category ?? '',
      unit_of_measure: selectedProfile.unit_of_measure ?? '',
      target_text: selectedProfile.target_text ?? '',
      numerator_definition: selectedProfile.numerator_definition ?? '',
      denominator_definition: selectedProfile.denominator_definition ?? '',
      schema_text: JSON.stringify(schema, null, 2),
      options_text: JSON.stringify(selectedProfile.options_json ?? [], null, 2),
      reason: '',
    })
  }, [selectedProfile?.id, selectedProfile?.version])

  const inspectWorkbook = async (file: File) => {
    if (fileBusy || !ready) return
    setError(''); setNotice(''); setWorkbookName('')
    setSheets([]); setSelectedSheet(''); setDetectedHeaders([]); setDetectedColumns([])
    setDraftHeaders({}); setDraftOccurrences({}); setAiSuggestions([]); setHeaderConfirmed(false)
    setProvisionalChoices({}); setAdditionalColumns([]); setNewColumnIndex(''); setBrowserDraft([])
    if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Pilih workbook .xlsx dengan ukuran maksimal 25 MB.')
      return
    }
    setInspecting(true)
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const rows: HeaderSheet[] = []
      for (const sheet of workbook.worksheets.slice(0, 50)) {
        const candidates: HeaderCandidate[] = []
        let recommended: HeaderCandidate | undefined
        for (let rowNumber = 1; rowNumber <= Math.min(12, sheet.rowCount); rowNumber++) {
          const row = sheet.getRow(rowNumber)
          const limit = Math.min(200, Number(row.cellCount ?? row.actualCellCount ?? 0))
          const columns = detectExcelHeaderColumns(Array.from({ length: limit }, (_, index) => ({
            index: index + 1,
            value: row.getCell(index + 1).value,
          })))
          if (!columns.length) continue
          const candidate = { row: rowNumber, columns }
          candidates.push(candidate)
          if (!recommended || candidate.columns.length > recommended.columns.length) recommended = candidate
        }
        if (recommended) rows.push({ name: sheet.name, recommendedRow: recommended.row, candidates })
      }
      if (!rows.length) throw new Error('Tidak ditemukan baris header pada 12 baris pertama workbook.')
      setWorkbookName(file.name)
      setSheets(rows)
      const chosen = rows.find(item => normalize(item.name) === 'logbook') ?? rows.find(item => /logbook/i.test(item.name)) ?? rows[0]
      setSelectedSheet(chosen.name)
      selectHeaderRow(chosen, chosen.recommendedRow)
      setNotice('Workbook berhasil diperiksa. Silakan klik dropdown huruf kolom dari sheet ' + chosen.name + '. Header kembar ditampilkan sebagai pilihan terpisah. Periksa baris yang terdeteksi dan pastikan isinya hanya judul kolom.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook tidak dapat dibaca. Pastikan file .xlsx tidak rusak atau diproteksi password.' }))
    } finally {
      setInspecting(false)
    }
  }

  const selectHeaderRow = (sheet: HeaderSheet, row: number) => {
    const candidate = sheet.candidates.find(item => item.row === row)
    if (!candidate) return
    setHeaderRow(row)
    setDetectedColumns(candidate.columns)
    setDetectedHeaders(candidate.columns.map(column => column.header))
    setDraftHeaders({})
    setDraftOccurrences({})
    setProvisionalChoices({})
    setAdditionalColumns([])
    setNewColumnIndex('')
    setBrowserDraft([])
    setAiSuggestions([])
    setHeaderConfirmed(false)
  }

  const changeSheet = (name: string) => {
    const sheet = sheets.find(item => item.name === name)
    if (!sheet) return
    setSelectedSheet(name)
    selectHeaderRow(sheet, sheet.recommendedRow)
  }

  useEffect(() => {
    if (!ready || !roomId || !selectedImporter || !selectedSheet || !detectedColumns.length) return
    try {
      const raw = window.localStorage.getItem(provisionalDraftStorageKey(roomId, profileYear, selectedImporter.key, selectedSheet))
      const stored = parseProvisionalMappingDraft(raw ? JSON.parse(raw) : null)
      if (!stored || stored.roomId !== roomId || stored.year !== profileYear ||
          stored.importerKey !== selectedImporter.key || normalize(stored.sourceSheet) !== normalize(selectedSheet) ||
          stored.headerRow !== headerRow) return
      const choices: Record<string, number> = {}
      const added: number[] = []
      for (const mapping of stored.mappings) {
        const col = resolveExcelSourceColumn(detectedColumns, mapping.sourceHeader, mapping.occurrence)
        if (!col) continue
        const proposal = suggestedProvisionalMappings.find(item => normalize(item.indicatorLabel) === normalize(mapping.indicatorLabel))
        if (proposal) choices[proposal.key] = col.index
        else added.push(col.index)
      }
      setProvisionalChoices(choices)
      setAdditionalColumns([...new Set(added)])
      setBrowserDraft(stored.mappings)
    } catch { /* local browser metadata may be absent or invalid */ }
  }, [ready, roomId, profileYear, selectedImporter?.key, selectedSheet, headerRow, detectedColumns, suggestedProvisionalMappings])

  const saveProvisionalDraft = () => {
    if (!roomId || !selectedImporter || !selectedSheet || !headerConfirmed || !provisionalRows.length) {
      setError('Pilih unit, konfirmasi baris header, dan pasangkan minimal satu calon indikator.')
      return
    }
    const mappings = provisionalRows.flatMap(row => {
      const source = provisionalColumn(row)
      return source ? [{ indicatorLabel: row.indicatorLabel, sourceHeader: source.header, occurrence: source.occurrence }] : []
    })
    if (!mappings.length) { setError('Pilih kolom sumber melalui dropdown terlebih dahulu.'); return }
    const draft: ProvisionalMappingDraft = {
      version: 1, roomId, year: profileYear, importerKey: selectedImporter.key,
      sourceSheet: selectedSheet, headerRow, mappings,
    }
    try {
      window.localStorage.setItem(
        provisionalDraftStorageKey(roomId, profileYear, selectedImporter.key, selectedSheet),
        JSON.stringify(draft),
      )
      setBrowserDraft(mappings)
      setError('')
      setNotice(mappings.length + ' pasangan indikator dan kolom disimpan sebagai draf di browser ini. Profil resmi belum diterbitkan, sehingga tidak ada perubahan master atau data pasien di Supabase.')
    } catch { setError('Browser tidak mengizinkan penyimpanan draf. Periksa pengaturan penyimpanan situs.') }
  }

  const runNaraBulk = async () => {
    if (!ready || fileBusy || !headerConfirmed) return
    if (!roomId || !selectedImporter || !detectedHeaders.length || !activeProfiles.length) {
      setError('Pilih unit, jenis workbook, dan unggah workbook contoh terlebih dahulu.')
      return
    }
    setAiBusy(true); setError(''); setNotice(''); setAiSuggestions([])
    try {
      const { data, error: invokeError } = await sb.functions.invoke('aureka-tanya', {
        body: {
          task: 'excel_mapping_suggest',
          room_id: roomId,
          profile_year: profileYear,
          importer_key: selectedImporter.key,
          headers: detectedHeaders.slice(0, 200),
        },
      })
      if (invokeError) {
        const context = (invokeError as unknown as { context?: unknown }).context
        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as { error?: string }
            if (payload?.error) throw new Error(payload.error)
          } catch (cause) {
            if (cause instanceof Error && cause.message !== invokeError.message) throw cause
          }
        }
        throw new Error(invokeError.message || 'NARA belum dapat menganalisis header workbook.')
      }
      if (typeof data?.error === 'string') throw new Error(data.error)
      const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : []) as Suggestion[]
      setAiSuggestions(suggestions)
      setDraftHeaders(current => {
        const next = { ...current }
        for (const item of suggestions) {
          // Recommendations are never silently accepted if a physical column is ambiguous.
          if (!item.source_header || item.confidence < 0.6) continue
          const matches = detectedColumns.filter(column => normalize(column.header) === normalize(item.source_header))
          if (matches.length === 1) next[draftKey(selectedImporter.key, item.indicator_code)] = matches[0].header
        }
        return next
      })
      setNotice(
        'NARA menganalisis ' + detectedHeaders.length + ' header dan menghasilkan ' + suggestions.filter(item => item.source_header).length +
        ' usulan pemetaan. Periksa setiap usulan sebelum menekan Simpan Aturan Unit.' +
        (data?.model ? ' Provider/model: ' + data.model : '')
      )
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'NARA belum menghasilkan pemetaan yang dapat ditinjau.' }))
    } finally {
      setAiBusy(false)
    }
  }

  const saveUnitMappings = async () => {
    if (!ready || fileBusy || !headerConfirmed) return
    if (!roomId || !selectedImporter || !activeProfiles.length) {
      setError('Unit dan jenis workbook harus dipilih.')
      return
    }
    if (!workbookName || !selectedSheet || !detectedColumns.length) {
      setError('Unggah workbook Excel lalu pilih sheet Logbook terlebih dahulu. Header tidak boleh diketik manual.')
      return
    }
    const rules = activeProfiles.flatMap(profile => {
      const key = draftKey(selectedImporter.key, profile.code)
      const column = sourceColumnFor(key, existingByCode.get(profile.code), profile.schema_json?.header_label, profile.title)
      if (!column) return []
      const ai = aiSuggestions.find(item => item.indicator_code === profile.code && normalize(item.source_header) === normalize(column.header))
      return [{
        target_type: 'indicator',
        target_key: profileKey(profile.code),
        target_label: profile.code + ' · ' + profile.title,
        indicator_code: profile.code,
        source_header: column.header,
        occurrence: column.occurrence,
        transform_json: { source_sheet: selectedSheet, header_row: headerRow, column_index: column.index, column_letter: column.letter },
        ai_confidence: ai?.confidence ?? null,
        ai_rationale: ai?.rationale ?? null,
      }]
    })
    if (!rules.length) { setError('Pilih minimal satu kolom sumber melalui dropdown Excel.'); return }
    if (rules.some(item => item.occurrence > 20)) {
      setError('Ada judul header berulang lebih dari 20 kali. Perbaiki workbook sumber.')
      return
    }
    if (!window.confirm('Simpan ' + numberLabel(rules.length) + ' aturan pemetaan untuk ' + activeRoom?.name + ' · ' + selectedImporter.label + '? Aturan hanya berlaku untuk unit, tahun, dan jenis workbook ini.')) return

    setSaving(true); setError(''); setNotice('')
    try {
      const { data, error: rpcError } = await q().rpc('quality_excel_header_mapping_upsert_bulk', {
        p_room_id: roomId,
        p_profile_year: profileYear,
        p_importer_key: selectedImporter.key,
        p_rules: rules,
        p_decision_note: 'Pemetaan diverifikasi Admin/PMKP pada Pusat Pemetaan Excel. ' + (workbookName ? 'Contoh workbook: ' + workbookName + '.' : ''),
      })
      if (rpcError) throw rpcError
      window.dispatchEvent(new CustomEvent('aureka:excel-mappings-updated', { detail: { roomId, year: profileYear } }))
      setNotice(numberLabel(Number(data?.saved_count ?? rules.length)) + ' aturan kolom dari sheet ' + selectedSheet + ' berhasil disimpan.')
      await load()
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Aturan pemetaan belum dapat disimpan. Tidak ada aturan yang diterapkan sebagian.' }))
    } finally {
      setSaving(false)
    }
  }

  const saveProfile = async () => {
    if (!selectedProfile || !ready || fileBusy) return
    if (profileDraft.reason.trim().length < 10) {
      setError('Alasan perubahan profil minimal 10 karakter.')
      return
    }
    let schema: Record<string, any>
    let options: any[]
    try {
      schema = JSON.parse(profileDraft.schema_text)
      options = JSON.parse(profileDraft.options_text)
      if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Array.isArray(options)) throw new Error('JSON schema/options tidak sesuai bentuk yang diperlukan.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON profil tidak valid.')
      return
    }
    if (!window.confirm('Simpan perubahan profil indikator ' + selectedProfile.code + ' pada ' + activeRoom?.name + '? Perubahan akan diaudit dan memengaruhi impor berikutnya.')) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { data, error: rpcError } = await q().rpc('quality_excel_indicator_profile_update', {
        p_profile_id: selectedProfile.id,
        p_patch: {
          title: profileDraft.title,
          category: profileDraft.category,
          unit_of_measure: profileDraft.unit_of_measure,
          target_text: profileDraft.target_text,
          numerator_definition: profileDraft.numerator_definition,
          denominator_definition: profileDraft.denominator_definition,
          schema_json: schema,
          options_json: options,
        },
        p_decision_note: profileDraft.reason.trim(),
      })
      if (rpcError) throw rpcError
      setNotice('Profil ' + selectedProfile.code + ' berhasil diperbarui ke versi ' + String(data?.version ?? '') + '. Master, opsi, dan aturan header sumber tersimpan terpisah.')
      await load()
      window.dispatchEvent(new CustomEvent('aureka:indicator-profiles-updated', { detail: { year: profileYear, scopeRoomId: roomId } }))
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Perubahan profil indikator gagal disimpan.' }))
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) return null

  return <section className="qemWorkspace">
    <style>{`
      .qemWorkspace{display:grid;gap:13px;padding:17px;border:1px solid #dce6ee;border-radius:16px;background:#fff;color:#24394b}
      .qemHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .qemEyebrow{font-size:10px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:#427b91}
      .qemHeader h3{margin:3px 0;font-size:19px;letter-spacing:-.025em}
      .qemHeader p{margin:0;max-width:780px;color:#718394;font-size:12px;line-height:1.5}
      .qemTools{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
      .qemField{display:grid;gap:4px;color:#687d8e;font-size:11px;font-weight:750}
      .qemField select,.qemField input{min-height:37px;min-width:130px;padding:7px 9px;border:1px solid #d8e3eb;border-radius:9px;background:#fff;color:#213b50;font:inherit;font-size:12px}
      .qemButton{border:1px solid #d8e3eb;border-radius:9px;padding:9px 12px;background:#fff;color:#27475f;font-size:12px;font-weight:750;cursor:pointer}
      .qemButton:disabled{opacity:.5;cursor:not-allowed}
      .qemButton.primary{background:#174f71;border-color:#174f71;color:#fff}
      .qemButton.ai{background:#eaf4fb;border-color:#c8dfef;color:#205879}
      .qemTabs{display:flex;flex-wrap:wrap;gap:7px;border-bottom:1px solid #e7edf2;padding-bottom:8px}
      .qemTabs button{border:1px solid #dbe5ec;border-radius:9px;padding:8px 12px;background:#fff;color:#5d7181;font-size:12px;font-weight:750;cursor:pointer}
      .qemTabs button[aria-selected="true"]{background:#173e59;color:#fff;border-color:#173e59}
      .qemMessage{padding:10px 12px;border-radius:9px;font-size:12px;line-height:1.5}
      .qemMessage.error{background:#fff1ef;border:1px solid #f0d0cc;color:#953e36}
      .qemMessage.notice{background:#eef7f2;border:1px solid #cfe6d8;color:#2d694a}
      .qemPanel{display:grid;gap:11px;padding:13px;border:1px solid #e4ebf0;border-radius:12px;background:#fbfdfe}
      .qemPanel h4{margin:0;font-size:14px}
      .qemMuted{font-size:11px;color:#748797;line-height:1.5}
      .qemGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .qemGrid label{display:grid;gap:5px;color:#6b7e8d;font-size:11px;font-weight:750}
      .qemGrid input,.qemGrid textarea,.qemGrid select{width:100%;min-width:0;min-height:37px;padding:8px 9px;border:1px solid #d8e3eb;border-radius:8px;background:#fff;color:#223b50;font:inherit;font-size:12px;font-weight:450}
      .qemGrid textarea{min-height:96px;resize:vertical;font-family:inherit;font-size:12px}
      .qemTableWrap{overflow:auto;border:1px solid #e3eaf0;border-radius:11px;background:#fff}
      .qemTable{width:100%;min-width:860px;border-collapse:collapse;font-size:12px}
      .qemTable th,.qemTable td{padding:9px 10px;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:top}
      .qemTable th{background:#f5f9fc;color:#657b8d;font-size:11px;position:sticky;top:0}
      .qemTable tr:last-child td{border-bottom:0}
      .qemTable strong{color:#213b50}
      .qemTable input,.qemTable select{width:100%;min-width:220px;max-width:520px;min-height:37px;padding:7px 8px;border:1px solid #d8e3eb;border-radius:8px;font-size:12px;background:#fff;color:#213b50}
      .qemTable select:disabled{background:#f0f3f4;color:#89959c}
      .qemTableWrap .qemActions{border-top:1px solid #e3eaf0}
      .qemMissing{display:block;font-size:11px;color:#9a583e;line-height:1.5;margin-top:5px}
      .qemBadge{display:inline-flex;padding:4px 7px;border-radius:7px;background:#edf5f8;color:#32627a;font-size:10px;font-weight:800}
      .qemActions{display:flex;gap:8px;flex-wrap:wrap}
      @media(max-width:740px){.qemGrid{grid-template-columns:1fr}.qemHeader h3{font-size:17px}}
    `}</style>
    <header className="qemHeader">
      <div><h3>Pemetaan Workbook Excel per Unit</h3><p>Atur kolom sumber per unit dan jenis workbook. Definisi indikator tetap terpisah; aturan ini hanya menentukan kolom Excel mana yang memasok setiap indikator.</p></div>
      <div className="qemTools">
        <label className="qemField">Unit
          <select value={roomId ?? ''} disabled={fileBusy} onChange={event => setRoomId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Pilih unit…</option>
            {rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="qemField">Tahun
          <select value={profileYear} disabled={fileBusy} onChange={event => setProfileYear(Number(event.target.value))}>
            {[2024,2025,2026,2027,2028,2029].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="qemButton" onClick={onClose}>Tutup</button>
      </div>
    </header>

    <div className="qemTabs" role="tablist" aria-label="Pengaturan pemetaan">
      <button type="button" role="tab" aria-selected={activeTab === 'unit'} onClick={() => setActiveTab('unit')}>Pengaturan per Unit</button>
      <button type="button" role="tab" aria-selected={activeTab === 'indicator'} onClick={() => setActiveTab('indicator')}>Pengaturan per Indikator</button>
      <button type="button" role="tab" aria-selected={activeTab === 'import'} onClick={() => setActiveTab('import')}>Impor Workbook</button>
    </div>

    {error && <div className="qemMessage error" role="alert">{error}</div>}
    {notice && <div className="qemMessage notice" role="status">{notice}</div>}
    {loading && <AsyncStatePanel state="loading" title="Memuat profil indikator dan aturan pemetaan" compact/>}
    {loadError && <AsyncStatePanel state="error" title="Pemetaan Excel belum dapat dimuat" description={loadError} onRetry={() => void load()} compact/>}

    {activeTab === 'unit' && <>
      {!roomId ? <div className="qemPanel"><h4>Pilih unit kerja</h4><p className="qemMuted">Pengaturan pemetaan setiap instalasi disimpan terpisah dan tidak mengubah pengaturan unit lain.</p></div> : !selectedImporter ? <div className="qemPanel"><h4>Belum ada importer khusus untuk unit ini</h4><p className="qemMuted">Profil indikator tetap dapat diedit pada tab Pengaturan per Indikator. Jenis workbook dapat ditambahkan setelah alur impor unit disediakan.</p></div> : <>
        <div className="qemPanel">
          <div className="qemTools">
            <label className="qemField">Jenis workbook
              <select value={selectedImporter.key} disabled={fileBusy} onChange={event => { setImporterKey(event.target.value); setAiSuggestions([]) }}>
                {availableImporters.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="qemField">Workbook contoh (header saja)
              <input type="file" accept=".xlsx" disabled={!ready || fileBusy} onChange={event => { const file = event.target.files?.[0]; if (file) void inspectWorkbook(file); event.currentTarget.value = '' }}/>
            </label>
            {sheets.length > 0 && <label className="qemField">Sheet header
              <select value={selectedSheet} disabled={fileBusy} onChange={event => changeSheet(event.target.value)}>
                {sheets.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>}
            {activeSheet && <label className="qemField">Baris header
              <select value={headerRow} disabled={fileBusy} onChange={event => selectHeaderRow(activeSheet, Number(event.target.value))}>
                {activeSheet.candidates.map(candidate => <option key={candidate.row} value={candidate.row}>Baris {candidate.row} · {candidate.columns.length} kolom</option>)}
              </select>
            </label>}
          </div>
          <p className="qemMuted"><strong>Langkah 1:</strong> Unggah workbook → pilih sheet dan baris header. <strong>Langkah 2:</strong> Pada tabel di bawah, klik dropdown tiap indikator dan pilih kolom seperti N atau O. <strong>Langkah 3:</strong> Konfirmasi baris header lalu simpan aturan. Kolom tidak perlu diketik. Workbook asli tetap di browser; hanya aturan pemetaan yang disimpan. Untuk unit tanpa importer khusus, alur unggah perlu dihubungkan ke importer sebelum digunakan otomatis.</p>
          {detectedColumns.length > 0 && <div className="qemActions"><span className="qemBadge">{numberLabel(detectedColumns.length)} kolom terdeteksi</span><span className="qemMuted">{workbookName} · sheet {selectedSheet} · baris header {headerRow}</span></div>}
          {detectedColumns.length > 0 && <div className="qemMuted">
            Sumber siap dipetakan: <strong>{provisionalRows.length > 0 && !activeProfiles.length ? provisionalRows.length + ' calon indikator' : activeProfiles.length + ' indikator aktif'}</strong>.
            Daftar lengkap seluruh judul kolom tersedia di bawah tabel pemetaan.
          </div>}
          {detectedColumns.length > 0 && <label className="qemMuted">
            <input type="checkbox" checked={headerConfirmed} disabled={fileBusy} onChange={event => setHeaderConfirmed(event.target.checked)}/> Baris ini hanya berisi judul kolom.
          </label>}
          {ready && activeProfiles.length === 0 && detectedColumns.length > 0 && <div className="qemMessage notice" role="status">
            Belum ada profil indikator aktif untuk unit/tahun ini. Pilihan calon indikator di bawah hanya usulan berdasarkan kecocokan nama pada format unit dan workbook; ini bukan impor master indikator. Anda tetap dapat memasangkan kolom dan menyimpan draf secara lokal.
          </div>}
          <div className="qemActions">
            <button type="button" className="qemButton ai" disabled={fileBusy || !headerConfirmed || !ready || !detectedHeaders.length || !activeProfiles.length} onClick={() => void runNaraBulk()}>
              {aiBusy ? 'NARA sedang menganalisis…' : 'NARA AI · Petakan massal'}
            </button>
            {activeProfiles.length > 0 ? <button type="button" className="qemButton primary" disabled={fileBusy || !headerConfirmed || !ready || !detectedColumns.length} onClick={() => void saveUnitMappings()}>
              {saving ? 'Menyimpan…' : 'Simpan aturan resmi'}
            </button> : <button type="button" className="qemButton primary" disabled={fileBusy || !headerConfirmed || !ready || !provisionalRows.length} onClick={saveProvisionalDraft}>
              Simpan draf di browser
            </button>}
          </div>
        </div>
        {activeProfiles.length === 0 && ready && detectedColumns.length > 0 && <div className="qemTableWrap" aria-label="Draf pemetaan indikator dan kolom workbook">
          <table className="qemTable">
            <thead><tr><th>Calon indikator (belum diterbitkan)</th><th>Pilih kolom sumber dari Excel</th><th>Keterangan</th></tr></thead>
            <tbody>
              {provisionalRows.map(row => {
                const chosen = provisionalColumn(row)
                return <tr key={row.key}>
                  <td><strong>{row.indicatorLabel}</strong><span className="qemMuted" style={{display:'block'}}>Draf pemetaan, bukan profil master</span></td>
                  <td><select aria-label={'Pilih kolom Excel untuk calon indikator ' + row.indicatorLabel}
                    value={chosen ? String(chosen.index) : ''}
                    onChange={event => setProvisionalChoices(current => ({...current, [row.key]: Number(event.target.value)}))}>
                    <option value="">— Pilih kolom sumber —</option>
                    {detectedColumns.map(column => <option key={column.index} value={String(column.index)}>{describeExcelSourceColumn(column)}</option>)}
                  </select></td>
                  <td><span className="qemBadge">{chosen ? 'Kolom ' + chosen.letter + ' · perlu profil resmi' : 'Belum dipetakan'}</span></td>
                </tr>
              })}
            </tbody>
          </table>
          <div className="qemActions" style={{padding:12,alignItems:'center'}}>
            <label className="qemField">Tambahkan calon indikator dari kolom lain
              <select value={newColumnIndex} onChange={event => setNewColumnIndex(event.target.value)}>
                <option value="">— Pilih kolom Excel —</option>
                {detectedColumns.filter(column => !provisionalRows.some(row => normalize(row.indicatorLabel) === normalize(column.header)))
                  .map(column => <option key={column.index} value={String(column.index)}>{describeExcelSourceColumn(column)}</option>)}
              </select>
            </label>
            <button type="button" className="qemButton" disabled={!newColumnIndex} onClick={() => {
              const index = Number(newColumnIndex)
              if (detectedColumns.some(column => column.index === index)) setAdditionalColumns(current => current.includes(index) ? current : [...current,index])
              setNewColumnIndex('')
            }}>Tambahkan ke pemetaan</button>
          </div>
          {provisionalRows.length === 0 && <div className="qemMuted" style={{padding:12}}>Belum ada nama indikator yang cocok otomatis. Pilih kolom Excel di atas untuk menambahkan calon indikator tanpa mengetik header.</div>}
        </div>}
        {activeProfiles.length > 0 && <div className="qemTableWrap" aria-label="Pilih kolom sumber Excel per indikator">
          <table className="qemTable">
            <thead><tr><th>Kode / indikator</th><th>Header master saat ini</th><th>Kolom sumber Excel</th><th>NARA</th></tr></thead>
            <tbody>
              {activeProfiles.map(profile => {
                const suggestion = aiSuggestions.find(item => item.indicator_code === profile.code)
                const mapping = existingByCode.get(profile.code)
                return <tr key={profile.id}>
                  <td><strong>{profile.code}</strong><span className="qemMuted" style={{ display: 'block', maxWidth: 290 }}>{profile.title}</span></td>
                  <td><span className="qemMuted">{String(profile.schema_json?.header_label ?? 'Belum ditetapkan pada profil master')}</span><button type="button" className="qemButton" style={{ display: 'block', marginTop: 6 }} onClick={() => { setSelectedProfileId(profile.id); setActiveTab('indicator') }}>Edit profil</button></td>
                  <td>{(() => {
                    const key = draftKey(selectedImporter.key, profile.code)
                    const selected = sourceColumnFor(key, mapping, profile.schema_json?.header_label, profile.title)
                    const wanted = draftHeaders[key] ?? mapping?.source_header ?? ''
                    return <>
                      <select aria-label={'Pilih kolom sumber Excel untuk ' + profile.code}
                        disabled={fileBusy || !ready || !detectedColumns.length}
                        value={selected ? String(selected.index) : ''}
                        onChange={event => {
                          const column = detectedColumns.find(item => item.index === Number(event.target.value))
                          setDraftHeaders(current => ({ ...current, [key]: column?.header ?? '' }))
                          setDraftOccurrences(current => ({ ...current, [key]: column?.occurrence ?? 1 }))
                        }}>
                        <option value="">{detectedColumns.length ? '— Pilih kolom dari Excel —' : '— Unggah workbook terlebih dahulu —'}</option>
                        {detectedColumns.map(column =>
                          <option key={column.index} value={String(column.index)}>{describeExcelSourceColumn(column)}</option>)}
                      </select>
                      {wanted && !selected && detectedColumns.length > 0 &&
                        <span className="qemMissing">Sumber sebelumnya ({wanted}{mapping?.transform_json?.source_sheet ? ' · sheet ' + mapping.transform_json.source_sheet : ''}) tidak cocok dengan sheet ini. Pilih kolom aktual melalui dropdown.</span>}
                      {selected && <span className="qemMuted">Kolom {selected.letter} · kemunculan header {selected.occurrence}</span>}
                    </>
                  })()}</td>
                  <td>{suggestion ? <><span className="qemBadge">{Math.round(suggestion.confidence * 100)}% yakin</span><span className="qemMuted" style={{ display: 'block' }}>{suggestion.rationale}</span></> : mapping ? <span className="qemBadge">Tersimpan · {mapping.mapping_status}</span> : <span className="qemMuted">Belum dipetakan</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
          {!detectedColumns.length && <div className="qemMuted" style={{padding:12}}>Unggah workbook contoh terlebih dahulu agar pilihan kolom muncul secara otomatis.</div>}
        </div>}
        {detectedColumns.length > 0 && <details className="qemMuted" style={{padding:'8px 12px',border:'1px solid #e3eaf0',borderRadius:9}}>
          <summary>Tinjau seluruh {detectedColumns.length} judul kolom pada baris {headerRow}</summary>
          <ol style={{maxHeight:180,overflow:'auto',marginTop:8}}>
            {detectedColumns.map(column => <li key={column.index}>{describeExcelSourceColumn(column)}</li>)}
          </ol>
        </details>}
      </>}
    </>}


    {activeTab === 'import' && <>
      <div className="qemPanel" aria-label="Antrean workbook lokal">
        <h4>Antrean workbook unit · hanya di browser</h4>
        <p className="qemMuted">Pilih sekaligus sampai 35 berkas .xlsx. Nama berkas dipakai sebagai petunjuk unit, bukan bukti kesesuaian klinis. Setiap workbook harus ditinjau dan diimpor satu per satu setelah validasi; tidak ada unggah otomatis maupun penggantian profil master.</p>
        <div className="qemTools">
          <label className="qemField">Pilih beberapa workbook
            <input type="file" accept=".xlsx" multiple disabled={fileBusy} onChange={event => {
              const inputFiles = Array.from(event.target.files ?? [])
              event.currentTarget.value = ''
              if (!inputFiles.length) return
              const invalid = inputFiles.find(file => !/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > 25 * 1024 * 1024)
              if (invalid) { setQueueError('File tidak didukung atau melebihi 25 MB: ' + invalid.name); return }
              const combined = [...queuedWorkbooks]
              const seen = new Set(combined.map(file => [file.name,file.size,file.lastModified].join('|')))
              for (const file of inputFiles) {
                const key = [file.name,file.size,file.lastModified].join('|')
                if (!seen.has(key)) { combined.push(file); seen.add(key) }
              }
              if (combined.length > 35 || combined.reduce((total,file) => total + file.size,0) > 256 * 1024 * 1024) {
                setQueueError('Antrean maksimal 35 workbook dengan total 256 MB. Pilih subset berkas yang lebih kecil.')
                return
              }
              setQueuedWorkbooks(combined)
              setQueueError('')
            }}/>
          </label>
          {queuedWorkbooks.length > 0 && <button type="button" className="qemButton" onClick={() => {
            setQueuedWorkbooks([]); setSelectedQueuedIndex(null); setQueueError('')
          }}>Kosongkan antrean</button>}
        </div>
        {queueError && <div className="qemMessage error" role="alert">{queueError}</div>}
        {queuedWorkbooks.length > 0 && <div className="qemTableWrap" style={{maxHeight:300,overflowY:'auto'}}>
          <table className="qemTable" aria-label="Daftar workbook yang dipilih">
            <thead><tr><th>Berkas</th><th>Unit terdeteksi</th><th>Tindakan</th></tr></thead>
            <tbody>{queuedWorkbooks.map((file,index) => {
              const hint = classifyQualityWorkbookName(file.name)
              const specialized = hint?.kind === 'pharmacy_multisheet' || hint?.kind === 'outpatient_matrix'
              const annual = hint?.kind === 'annual_master'
              const unit = rooms.find(item => item.id === hint?.roomId)
              const supported = !annual && !specialized && (!hint?.roomId || !!unit)
              return <tr key={[file.name,file.size,file.lastModified].join(':')}>
                <td><strong>{file.name}</strong><span className="qemMuted" style={{display:'block'}}>{(file.size/1048576).toFixed(1)} MB{selectedQueuedIndex===index?' · Dipilih':''}</span></td>
                <td>{hint?.unit ?? 'Belum dikenali · verifikasi manual'}{specialized && <span className="qemMissing">Memerlukan parser baku khusus unit pada menu Logbook.</span>}{annual && <span className="qemMissing">Master tahunan bukan data logbook.</span>}</td>
                <td>{supported ? <button type="button" className="qemButton" disabled={fileBusy} onClick={() => {
                  setSelectedQueuedIndex(index)
                  if (unit && unit.id !== roomId) setRoomId(unit.id)
                  setQueueError('')
                }}>{selectedQueuedIndex===index?'Periksa kembali':'Petakan dan pratinjau'}</button>
                : <span className="qemMuted">Gunakan alur khusus</span>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>}
        {selectedQueuedIndex != null && queuedWorkbooks[selectedQueuedIndex] &&
          <p className="qemMuted">Workbook dipilih: <strong>{queuedWorkbooks[selectedQueuedIndex].name}</strong>. Lakukan pemetaan di bawah, klik Periksa data, lalu impor hanya setelah lolos validasi. Workbook lain tetap berada di antrean browser.</p>}
      </div>
      {!roomId || !activeRoom ? (
        <div className="qemPanel"><h4>Pilih unit terlebih dahulu</h4><p className="qemMuted">Impor workbook selalu terikat pada unit dan tahun profil agar konfigurasi antar-ruangan tidak bercampur.</p></div>
      ) : !ready ? (
        <AsyncStatePanel state="loading" title="Menyiapkan profil dan pemetaan unit terpilih" compact/>
      ) : (
        <QualityWorkbookImportPanel
          key={roomId + ':' + profileYear + ':' + (selectedImporter?.key ?? 'unit-logbook') + ':' + String(selectedQueuedIndex ?? 'manual')}
          roomId={roomId}
          roomName={activeRoom.name}
          year={profileYear}
          importerKey={selectedImporter?.key ?? 'unit-logbook'}
          role={role}
          activeProfiles={activeProfiles}
          initialFile={selectedQueuedIndex == null ? null : queuedWorkbooks[selectedQueuedIndex] ?? null}
          onImported={() => {
            void load()
            window.dispatchEvent(new CustomEvent('aureka:indicator-profiles-updated', { detail: { year: profileYear, scopeRoomId: roomId } }))
          }}
        />
      )}
    </>}

    {activeTab === 'indicator' && <>
      {profiles.length === 0 ? <div className="qemPanel"><h4>Profil indikator belum tersedia</h4><p className="qemMuted">Pilih unit dengan profil indikator yang akan diperbaiki.</p></div> : <>
        <div className="qemPanel">
          <label className="qemField">Pilih indikator
            <select value={selectedProfile?.id ?? ''} onChange={event => setSelectedProfileId(event.target.value)}>
              {profiles.map(item => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
            </select>
          </label>
          {selectedProfile && <div className="qemGrid">
            <label>Judul indikator<input value={profileDraft.title} onChange={event => setProfileDraft(current => ({ ...current, title: event.target.value }))}/></label>
            <label>Kategori<input value={profileDraft.category} onChange={event => setProfileDraft(current => ({ ...current, category: event.target.value }))}/></label>
            <label>Satuan<input value={profileDraft.unit_of_measure} onChange={event => setProfileDraft(current => ({ ...current, unit_of_measure: event.target.value }))}/></label>
            <label>Target indikator<input value={profileDraft.target_text} onChange={event => setProfileDraft(current => ({ ...current, target_text: event.target.value }))}/></label>
            <label>Definisi numerator<textarea value={profileDraft.numerator_definition} onChange={event => setProfileDraft(current => ({ ...current, numerator_definition: event.target.value }))}/></label>
            <label>Definisi denominator<textarea value={profileDraft.denominator_definition} onChange={event => setProfileDraft(current => ({ ...current, denominator_definition: event.target.value }))}/></label>
            <label>Tipe pengukuran
              <select value={String(profileSchema.measurement_type ?? '')}
                onChange={event => updateProfileSchema({ measurement_type: event.target.value })}>
                <option value="">Pilih tipe pengukuran</option>
                {profileSchema.measurement_type && !['ratio','compliance','visit','door','minutes','numeric','occurrence'].includes(String(profileSchema.measurement_type)) &&
                  <option value={String(profileSchema.measurement_type)}>Tipe sebelumnya: {String(profileSchema.measurement_type)}</option>}
                <option value="ratio">Rasio Numerator / Denominator</option>
                <option value="compliance">Kepatuhan / kategori</option>
                <option value="visit">Waktu visite</option>
                <option value="door">Durasi antar waktu</option>
                <option value="minutes">Durasi menit</option>
                <option value="numeric">Nilai numerik</option>
                <option value="occurrence">Kejadian</option>
              </select>
            </label>
            <label>Arah penilaian indikator
              <select value={String(profileSchema.indicator_direction ?? '')}
                onChange={event => updateProfileSchema({ indicator_direction: event.target.value })}>
                <option value="">Pilih arah penilaian</option>
                <option value="positive">Positif · makin tinggi makin baik</option>
                <option value="negative">Negatif · makin rendah makin baik</option>
              </select>
            </label>
            <label>Ambang per pengamatan (contoh menit atau Kt/V)
              <input type="number" step="any"
                value={profileSchema.observation_target_value ?? ''}
                onChange={event => updateProfileSchema({
                  observation_target_value: event.target.value === '' ? null : Number(event.target.value),
                })} placeholder="Belum ditetapkan oleh PMKP"/>
            </label>
            <label>Operator ambang per pengamatan
              <select value={String(profileSchema.observation_target_operator ?? '')}
                onChange={event => updateProfileSchema({ observation_target_operator: event.target.value })}>
                <option value="">Belum ditetapkan</option>
                <option value=">=">≥ Lebih besar atau sama dengan</option>
                <option value="<=">≤ Lebih kecil atau sama dengan</option>
                <option value="=">= Sama dengan</option>
                <option value=">">&gt; Lebih besar dari</option>
                <option value="<">&lt; Lebih kecil dari</option>
              </select>
            </label>
            <p className="qemMuted" style={{gridColumn:'1 / -1'}}>
              Indikator waktu dan nilai numerik dengan target agregat dalam persen membutuhkan ambang per pengamatan
              yang disetujui PMKP sebelum persentase pemenuhan dapat dihitung. Misalnya Kt/V adalah nilai ukur,
              bukan langsung 100%. Jika ambang belum ditetapkan, capaian tetap tidak dapat dinilai—bukan 0%.
            </p>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 7 }}>
              <strong style={{ fontSize: 12 }}>Kode dan opsi jawaban logbook</strong>
              <QualityOptionEditor text={profileDraft.options_text}
                onChange={value => setProfileDraft(current => ({ ...current, options_text: value }))} />
            </div>
            <p className="qemMuted" style={{ gridColumn: '1 / -1' }}>Header sumber tidak perlu diisi sebagai kode atau teks. Untuk memilih kolom Excel, buka tab Pengaturan per Unit, unggah workbook, lalu pilih kolom melalui dropdown. Metadata instrumen lainnya dipertahankan otomatis.</p>
            <label style={{ gridColumn: '1 / -1' }}>Alasan perubahan / catatan audit<textarea value={profileDraft.reason} onChange={event => setProfileDraft(current => ({ ...current, reason: event.target.value }))} placeholder="Jelaskan dasar perubahan definisi/header/opsi indikator (minimal 10 karakter)."/></label>
          </div>}
          <div className="qemActions"><button type="button" className="qemButton primary" disabled={fileBusy || !ready || !selectedProfile || profileDraft.reason.trim().length < 10} onClick={() => void saveProfile()}>{saving ? 'Menyimpan profil…' : 'Simpan revisi profil indikator'}</button></div>
          <p className="qemMuted">Perubahan profil indikator dicatat dalam audit tersendiri. Jangan mengubah kode klasifikasi klinis hanya agar respons Excel cocok; koreksi opsi master harus disetujui pemilik indikator.</p>
        </div>
      </>}
    </>}
  </section>
}
