'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { hydrateInteractiveExcelHeaderMappings } from '@/lib/aureka/interactive-header-mapping'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Room = { id: number; name: string }
type Profile = {
  id: string
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
  mapping_status: string
  ai_confidence?: number | null
  ai_rationale?: string | null
}
type Suggestion = { indicator_code: string; source_header: string | null; confidence: number; rationale: string }
type Importer = { key: string; label: string; room_id: number }
type HeaderSheet = { name: string; row: number; headers: string[] }

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
  { room_id: 22, key: 'pediatric-inpatient', label: 'Logbook Rawat Inap Anak' },
  { room_id: 23, key: 'surgical-inpatient', label: 'Logbook Rawat Inap Bedah' },
  { room_id: 24, key: 'isolasi-inpatient', label: 'Logbook Rawat Inap Isolasi' },
  { room_id: 25, key: 'penyakit-dalam-inpatient', label: 'Logbook Penyakit Dalam' },
  { room_id: 26, key: 'saraf-inpatient', label: 'Logbook Rawat Inap Saraf' },
  { room_id: 30, key: 'timkordik', label: 'Logbook Tim Koordinasi Pendidikan' },
  { room_id: 33, key: 'ponek', label: 'Logbook PONEK' },
]
const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim()
const profileKey = (code: string) => 'indicator:' + code
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
  const [activeTab, setActiveTab] = useState<'unit' | 'indicator'>('unit')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importerKey, setImporterKey] = useState('')
  const [sheets, setSheets] = useState<HeaderSheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [headerRow, setHeaderRow] = useState(1)
  const [workbookName, setWorkbookName] = useState('')
  const [draftHeaders, setDraftHeaders] = useState<Record<string, string>>({})
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileDraft, setProfileDraft] = useState({
    title: '', category: '', unit_of_measure: '', target_text: '',
    numerator_definition: '', denominator_definition: '', schema_text: '{}', options_text: '[]', reason: '',
  })

  const activeRoom = rooms.find(item => Number(item.id) === Number(roomId)) ?? null
  const availableImporters = useMemo(
    () => importers.filter(item => item.room_id === Number(roomId)),
    [roomId],
  )
  const selectedImporter = availableImporters.find(item => item.key === importerKey) ?? availableImporters[0] ?? null
  const selectedProfile = profiles.find(item => item.id === selectedProfileId) ?? profiles[0] ?? null
  const activeProfiles = useMemo(
    () => profiles.filter(item => item.is_active && item.status === 'published').sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [profiles],
  )
  const existingByCode = useMemo(() => {
    const map = new Map<string, Mapping>()
    for (const row of mappings) {
      if (row.importer_key === (selectedImporter?.key ?? importerKey) && row.target_type === 'indicator') {
        map.set(row.target_key.replace(/^indicator:/, ''), row)
      }
    }
    return map
  }, [mappings, selectedImporter?.key, importerKey])
  const headerOptions = useMemo(() => detectedHeaders, [detectedHeaders])

  useEffect(() => setRoomId(initialRoomId), [initialRoomId])
  useEffect(() => setProfileYear(year), [year])
  useEffect(() => {
    if (!availableImporters.some(item => item.key === importerKey)) setImporterKey(availableImporters[0]?.key ?? '')
  }, [availableImporters, importerKey])

  const load = useCallback(async () => {
    if (!canManage || roomId == null) {
      setProfiles([])
      setMappings([])
      return
    }
    setLoading(true); setError(''); setNotice('')
    try {
      const [profileResult, mappingResult] = await Promise.all([
        q().from('indicator_profiles').select('*').eq('room_id', roomId).eq('profile_year', profileYear).order('code'),
        q().rpc('quality_excel_header_mapping_list', {
          p_room_id: roomId,
          p_profile_year: profileYear,
          p_importer_key: null,
        }),
      ])
      if (profileResult.error) throw profileResult.error
      if (mappingResult.error) throw mappingResult.error
      const nextProfiles = (profileResult.data ?? []) as Profile[]
      const nextMappings = Array.isArray(mappingResult.data?.mappings) ? mappingResult.data.mappings as Mapping[] : []
      setProfiles(nextProfiles)
      setMappings(nextMappings)
      hydrateInteractiveExcelHeaderMappings(roomId, profileYear, nextMappings)
      if (!selectedProfileId || !nextProfiles.some(item => item.id === selectedProfileId)) {
        setSelectedProfileId(nextProfiles[0]?.id ?? '')
      }
      setDraftHeaders(current => {
        const next = { ...current }
        for (const profile of nextProfiles) {
          const mapping = nextMappings.find(item =>
            item.importer_key === (selectedImporter?.key ?? importerKey) &&
            item.target_key === profileKey(profile.code),
          )
          if (mapping && !next[profile.code]) next[profile.code] = mapping.source_header
          else if (!next[profile.code] && String(profile.schema_json?.header_label ?? '').trim()) {
            next[profile.code] = String(profile.schema_json?.header_label ?? '').trim()
          }
        }
        return next
      })
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Konfigurasi pemetaan Excel belum dapat dimuat. Pastikan migration Pusat Pemetaan Excel telah diterapkan.' }))
    } finally {
      setLoading(false)
    }
  }, [canManage, roomId, profileYear, importerKey, selectedImporter?.key, selectedProfileId])

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
    setError(''); setNotice(''); setAiSuggestions([]); setWorkbookName(file.name)
    if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Pilih workbook .xlsx dengan ukuran maksimal 25 MB.')
      return
    }
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const rows: HeaderSheet[] = []
      for (const sheet of workbook.worksheets.slice(0, 50)) {
        let bestRow = 1
        let bestHeaders: string[] = []
        for (let rowNumber = 1; rowNumber <= Math.min(12, sheet.rowCount); rowNumber++) {
          const row = sheet.getRow(rowNumber)
          const headers: string[] = []
          const limit = Math.min(200, Number(row.cellCount ?? row.actualCellCount ?? 0))
          for (let column = 1; column <= limit; column++) {
            const value = row.getCell(column).value
            const label = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
            if (label && !headers.some(item => normalize(item) === normalize(label))) headers.push(label)
          }
          if (headers.length > bestHeaders.length) { bestHeaders = headers; bestRow = rowNumber }
        }
        if (bestHeaders.length) rows.push({ name: sheet.name, row: bestRow, headers: bestHeaders })
      }
      if (!rows.length) throw new Error('Tidak ditemukan baris header pada 12 baris pertama workbook.')
      setSheets(rows)
      const chosen = rows.find(item => normalize(item.name) === 'logbook') ?? rows[0]
      setSelectedSheet(chosen.name)
      setHeaderRow(chosen.row)
      setDetectedHeaders(chosen.headers)
      setNotice('Workbook diperiksa pada struktur header saja. Baris data pasien tidak dibaca atau dikirim ke NARA.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook tidak dapat dibaca. Pastikan file .xlsx tidak rusak atau diproteksi password.' }))
    }
  }

  const changeSheet = (name: string) => {
    const sheet = sheets.find(item => item.name === name)
    setSelectedSheet(name)
    if (sheet) { setHeaderRow(sheet.row); setDetectedHeaders(sheet.headers) }
    setAiSuggestions([])
  }

  const runNaraBulk = async () => {
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
          if (item.source_header && item.confidence >= 0.6) next[item.indicator_code] = item.source_header
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
    if (!roomId || !selectedImporter || !activeProfiles.length) {
      setError('Unit dan jenis workbook harus dipilih.')
      return
    }
    const rules = activeProfiles.flatMap(profile => {
      const sourceHeader = String(draftHeaders[profile.code] ?? '').trim()
      if (!sourceHeader) return []
      const ai = aiSuggestions.find(item => item.indicator_code === profile.code && item.source_header === sourceHeader)
      return [{
        target_type: 'indicator',
        target_key: profileKey(profile.code),
        target_label: profile.code + ' · ' + profile.title,
        indicator_code: profile.code,
        source_header: sourceHeader,
        occurrence: 1,
        ai_confidence: ai?.confidence ?? null,
        ai_rationale: ai?.rationale ?? null,
      }]
    })
    if (!rules.length) { setError('Belum ada kolom sumber yang dipetakan.'); return }
    if (rules.some(item => detectedHeaders.length && !detectedHeaders.some(header => normalize(header) === normalize(item.source_header)))) {
      setError('Ada header sumber yang tidak ditemukan pada workbook contoh. Periksa kembali kolom yang dipilih.')
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
      const { data: refreshed, error: refreshError } = await q().rpc('quality_excel_header_mapping_list', {
        p_room_id: roomId, p_profile_year: profileYear, p_importer_key: null,
      })
      if (refreshError) throw refreshError
      const allMappings = Array.isArray(refreshed?.mappings) ? refreshed.mappings as Mapping[] : []
      setMappings(allMappings)
      hydrateInteractiveExcelHeaderMappings(roomId, profileYear, allMappings)
      setNotice(numberLabel(Number(data?.saved_count ?? rules.length)) + ' aturan berhasil disimpan. Unggahan berikutnya akan membaca mapping unit ini secara otomatis tanpa memilih kolom satu per satu.')
      window.dispatchEvent(new CustomEvent('aureka:excel-mappings-updated', { detail: { roomId, year: profileYear } }))
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Aturan pemetaan belum dapat disimpan. Tidak ada aturan yang diterapkan sebagian.' }))
    } finally {
      setSaving(false)
    }
  }

  const saveProfile = async () => {
    if (!selectedProfile) return
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
      .qemTabs{display:flex;gap:7px;border-bottom:1px solid #e7edf2;padding-bottom:8px}
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
      .qemGrid textarea{min-height:135px;resize:vertical;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px}
      .qemTableWrap{overflow:auto;border:1px solid #e3eaf0;border-radius:11px;background:#fff}
      .qemTable{width:100%;min-width:860px;border-collapse:collapse;font-size:12px}
      .qemTable th,.qemTable td{padding:9px 10px;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:top}
      .qemTable th{background:#f5f9fc;color:#657b8d;font-size:11px;position:sticky;top:0}
      .qemTable tr:last-child td{border-bottom:0}
      .qemTable strong{color:#213b50}
      .qemTable input{width:100%;min-width:210px;min-height:35px;padding:7px 8px;border:1px solid #d8e3eb;border-radius:8px;font-size:12px}
      .qemBadge{display:inline-flex;padding:4px 7px;border-radius:7px;background:#edf5f8;color:#32627a;font-size:10px;font-weight:800}
      .qemActions{display:flex;gap:8px;flex-wrap:wrap}
      @media(max-width:740px){.qemGrid{grid-template-columns:1fr}.qemHeader h3{font-size:17px}}
    `}</style>
    <header className="qemHeader">
      <div><span className="qemEyebrow">AUREKA · Data Governance</span><h3>Pemetaan Workbook Excel per Unit</h3><p>Atur kolom sumber per unit dan jenis workbook. Definisi indikator tetap terpisah; aturan ini hanya menentukan kolom Excel mana yang memasok setiap indikator.</p></div>
      <div className="qemTools">
        <label className="qemField">Unit
          <select value={roomId ?? ''} onChange={event => setRoomId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Pilih unit…</option>
            {rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="qemField">Tahun
          <select value={profileYear} onChange={event => setProfileYear(Number(event.target.value))}>
            {[2024,2025,2026,2027,2028,2029].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="qemButton" onClick={onClose}>Tutup</button>
      </div>
    </header>

    <div className="qemTabs" role="tablist" aria-label="Pengaturan pemetaan">
      <button type="button" role="tab" aria-selected={activeTab === 'unit'} onClick={() => setActiveTab('unit')}>Pengaturan per Unit</button>
      <button type="button" role="tab" aria-selected={activeTab === 'indicator'} onClick={() => setActiveTab('indicator')}>Pengaturan per Indikator</button>
    </div>

    {error && <div className="qemMessage error" role="alert">{error}</div>}
    {notice && <div className="qemMessage notice" role="status">{notice}</div>}
    {loading && <div className="qemMuted">Memuat profil indikator dan aturan pemetaan…</div>}

    {activeTab === 'unit' && <>
      {!roomId ? <div className="qemPanel"><h4>Pilih unit kerja</h4><p className="qemMuted">Pengaturan pemetaan setiap instalasi disimpan terpisah dan tidak mengubah pengaturan unit lain.</p></div> : !selectedImporter ? <div className="qemPanel"><h4>Belum ada importer khusus untuk unit ini</h4><p className="qemMuted">Profil indikator tetap dapat diedit pada tab Pengaturan per Indikator. Jenis workbook dapat ditambahkan setelah alur impor unit disediakan.</p></div> : <>
        <div className="qemPanel">
          <div className="qemTools">
            <label className="qemField">Jenis workbook
              <select value={selectedImporter.key} onChange={event => { setImporterKey(event.target.value); setAiSuggestions([]) }}>
                {availableImporters.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="qemField">Workbook contoh (header saja)
              <input type="file" accept=".xlsx" onChange={event => { const file = event.target.files?.[0]; if (file) void inspectWorkbook(file); event.currentTarget.value = '' }}/>
            </label>
            {sheets.length > 0 && <label className="qemField">Sheet header
              <select value={selectedSheet} onChange={event => changeSheet(event.target.value)}>
                {sheets.map(item => <option key={item.name} value={item.name}>{item.name} · baris {item.row}</option>)}
              </select>
            </label>}
          </div>
          <p className="qemMuted">AUREKA hanya membaca nama sheet, nomor baris, dan teks header. Baris data pasien tidak dianalisis untuk pemetaan dan tidak dikirim ke NARA.</p>
          {detectedHeaders.length > 0 && <div className="qemActions"><span className="qemBadge">{numberLabel(detectedHeaders.length)} kolom terdeteksi</span><span className="qemMuted">{workbookName} · sheet {selectedSheet} · kandidat baris header {headerRow}</span></div>}
          <div className="qemActions">
            <button type="button" className="qemButton ai" disabled={aiBusy || loading || !detectedHeaders.length || !activeProfiles.length} onClick={() => void runNaraBulk()}>
              {aiBusy ? 'NARA sedang menganalisis…' : 'NARA AI · Petakan massal'}
            </button>
            <button type="button" className="qemButton primary" disabled={saving || loading || !activeProfiles.length} onClick={() => void saveUnitMappings()}>
              {saving ? 'Menyimpan…' : 'Simpan aturan unit'}
            </button>
          </div>
        </div>
        <div className="qemTableWrap">
          <table className="qemTable">
            <thead><tr><th>Kode / indikator</th><th>Header master saat ini</th><th>Kolom sumber Excel</th><th>NARA</th></tr></thead>
            <tbody>
              {activeProfiles.map(profile => {
                const suggestion = aiSuggestions.find(item => item.indicator_code === profile.code)
                const mapping = existingByCode.get(profile.code)
                return <tr key={profile.id}>
                  <td><strong>{profile.code}</strong><span className="qemMuted" style={{ display: 'block', maxWidth: 290 }}>{profile.title}</span></td>
                  <td><span className="qemMuted">{String(profile.schema_json?.header_label ?? 'Belum ditetapkan pada profil master')}</span><button type="button" className="qemButton" style={{ display: 'block', marginTop: 6 }} onClick={() => { setSelectedProfileId(profile.id); setActiveTab('indicator') }}>Edit profil</button></td>
                  <td><input list="qem-detected-header-list" value={draftHeaders[profile.code] ?? mapping?.source_header ?? ''} placeholder="Pilih/ketik header sumber Excel" onChange={event => setDraftHeaders(current => ({ ...current, [profile.code]: event.target.value }))}/></td>
                  <td>{suggestion ? <><span className="qemBadge">{Math.round(suggestion.confidence * 100)}% yakin</span><span className="qemMuted" style={{ display: 'block' }}>{suggestion.rationale}</span></> : mapping ? <span className="qemBadge">Tersimpan · {mapping.mapping_status}</span> : <span className="qemMuted">Belum dipetakan</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
          <datalist id="qem-detected-header-list">{headerOptions.map((header,index) => <option key={index} value={header}/>)}</datalist>
        </div>
      </>}
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
            <label>Schema JSON (termasuk header_label dan excel_header_aliases)<textarea value={profileDraft.schema_text} onChange={event => setProfileDraft(current => ({ ...current, schema_text: event.target.value }))}/></label>
            <label>Opsi klasifikasi JSON<textarea value={profileDraft.options_text} onChange={event => setProfileDraft(current => ({ ...current, options_text: event.target.value }))}/></label>
            <label style={{ gridColumn: '1 / -1' }}>Alasan perubahan / catatan audit<textarea value={profileDraft.reason} onChange={event => setProfileDraft(current => ({ ...current, reason: event.target.value }))} placeholder="Jelaskan dasar perubahan definisi/header/opsi indikator (minimal 10 karakter)."/></label>
          </div>}
          <div className="qemActions"><button type="button" className="qemButton primary" disabled={saving || !selectedProfile || profileDraft.reason.trim().length < 10} onClick={() => void saveProfile()}>{saving ? 'Menyimpan profil…' : 'Simpan revisi profil indikator'}</button></div>
          <p className="qemMuted">Perubahan profil indikator dicatat dalam audit tersendiri. Jangan mengubah kode klasifikasi klinis hanya agar respons Excel cocok; koreksi opsi master harus disetujui pemilik indikator.</p>
        </div>
      </>}
    </>}
  </section>
}
