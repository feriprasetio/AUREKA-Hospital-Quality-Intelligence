'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Room = { id: number; name: string }
type Profile = {
  id: string
  room_id: number
  profile_year: number
  code: string
  title: string
  target_text: string | null
  numerator_definition: string | null
  denominator_definition: string | null
  schema_json: Record<string, any>
  options_json: Array<Record<string, any>>
  version: number
  status: string
  is_active: boolean
}
type HeaderMapping = {
  source_header: string
  occurrence: number
  resolver_keys: string[]
  confidence: number | null
  method: 'manual' | 'exact' | 'nara'
}
type Config = {
  id?: string
  room_id: number
  profile_year: number
  importer_key: string
  sheet_name: string
  header_row: number
  data_start_row: number
  field_mappings: Record<string, HeaderMapping>
  indicator_mappings: Record<string, HeaderMapping>
  workbook_name_hint?: string | null
}
type HeaderOption = { label: string; column: number; letter: string; occurrence: number }
type Suggestion = { target_key: string; target_label: string; source_header: string; confidence: number; rationale: string }
type Props = { rooms: Room[]; initialRoomId: number | null; role: string | null }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const IMPORTERS: Record<number, { key: string; label: string } | null> = {
  1: { key: 'complaint', label: 'Informasi dan Pengaduan' },
  2: { key: 'it', label: 'Informatika dan Teknologi' },
  3: { key: 'ambulance', label: 'Instalasi Ambulance' },
  4: { key: 'ibs', label: 'Instalasi Bedah Sentral' },
  5: { key: 'pharmacy', label: 'Instalasi Farmasi' },
  6: { key: 'igd', label: 'Instalasi Gawat Darurat' },
  7: { key: 'gizi', label: 'Instalasi Gizi' },
  9: { key: 'laboratory', label: 'Instalasi Laboratorium' },
  11: { key: 'outpatient', label: 'Instalasi Rawat Jalan' },
  12: { key: 'rehab', label: 'Instalasi Rehab Medik' },
  13: { key: 'rekam-medis', label: 'Instalasi Rekam Medis' },
  14: { key: 'icu', label: 'ICU & HCU' },
  18: { key: 'nicu', label: 'NICU & PHDP' },
  19: { key: 'nifas', label: 'Nifas Obstetrics & Gynecology' },
  20: { key: 'perinatology', label: 'Perinatologi & Neonatologi' },
  22: { key: 'pediatric-inpatient', label: 'Rawat Inap Anak' },
  23: { key: 'surgical-inpatient', label: 'Rawat Inap Bedah' },
  24: { key: 'isolasi-inpatient', label: 'Rawat Inap Isolasi' },
  25: { key: 'penyakit-dalam-inpatient', label: 'Rawat Inap Penyakit Dalam' },
  26: { key: 'saraf-inpatient', label: 'Rawat Inap Saraf' },
  30: { key: 'timkordik', label: 'Tim Koordinasi Pendidikan' },
  33: { key: 'ponek', label: 'PONEK' },
}
const FIELD_DEFINITIONS = [
  { key: 'sourceNo', label: 'Nomor urut sumber', aliases: ['No', 'No.', 'No Urut', 'Nomor'] },
  { key: 'patientName', label: 'Nama pasien', aliases: ['Nama Pasien', 'Column1', 'Pasien'] },
  { key: 'medicalRecordNo', label: 'Nomor rekam medis', aliases: ['No. Rekam Medis', 'No RM', 'No. RM', 'Nomor Rekam Medis'] },
  { key: 'diagnosis', label: 'Diagnosis', aliases: ['Diagnosa', 'Diagnosis', 'Diagnosa IGD', 'Diagnosa Tegak', 'Diagnosa Primer'] },
  { key: 'admissionDate', label: 'Tanggal / waktu masuk', aliases: ['Waktu Masuk', 'Tanggal Masuk', 'Tanggal Masuk RS', 'Tanggal Registrasi'] },
  { key: 'dischargeDate', label: 'Tanggal / waktu keluar', aliases: ['Waktu Keluar', 'Tanggal Keluar', 'Tanggal Pulang', 'Tanggal Discharge'] },
  { key: 'dpjp', label: 'DPJP', aliases: ['DPJP', 'DPJP Utama', 'Dokter Penanggung Jawab'] },
  { key: 'nurse', label: 'Perawat / bidan', aliases: ['Perawat', 'Perawat Penerima', 'Bidan', 'Nutrisionis'] },
  { key: 'origin', label: 'Asal ruangan', aliases: ['Asal Ruangan', 'Ruangan Asal', 'Asal'] },
  { key: 'destination', label: 'Tujuan / ruangan', aliases: ['Tujuan', 'Tujuan Ruangan', 'Ruangan Tujuan'] },
  { key: 'status', label: 'Status / kondisi pulang', aliases: ['Status', 'Status Pulang', 'Keadaan Keluar', 'Discharge Status'] },
] as const

const emptyConfig = (roomId: number, year: number, importerKey: string): Config => ({
  room_id: roomId,
  profile_year: year,
  importer_key: importerKey,
  sheet_name: 'Logbook',
  header_row: 3,
  data_start_row: 4,
  field_mappings: {},
  indicator_mappings: {},
})
const count = (value: unknown) => Number(value ?? 0).toLocaleString('id-ID')
function letter(column: number) {
  let n = column, result = ''
  while (n > 0) { const rem = (n - 1) % 26; result = String.fromCharCode(65 + rem) + result; n = Math.floor((n - 1) / 26) }
  return result
}
function normalizeHeader(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('id-ID')
}
function parseHeaders(sheet: any, rowNumber: number): HeaderOption[] {
  const row = sheet.getRow(rowNumber)
  const options: HeaderOption[] = []
  const seen = new Map<string, number>()
  const last = Math.min(Number(row.cellCount ?? row.actualCellCount ?? sheet.columnCount ?? 100), 200)
  for (let column = 1; column <= last; column++) {
    const cell = row.getCell(column)
    const raw = String(cell?.text ?? cell?.value ?? '').trim()
    if (!raw) continue
    const key = normalizeHeader(raw)
    const occurrence = (seen.get(key) ?? 0) + 1
    seen.set(key, occurrence)
    options.push({ label: raw, column, letter: letter(column), occurrence })
  }
  return options
}
const asMapping = (sourceHeader: string, resolverKeys: string[], method: HeaderMapping['method'] = 'manual', confidence: number | null = null, occurrence = 1): HeaderMapping => ({
  source_header: sourceHeader,
  occurrence: Math.max(1, occurrence),
  resolver_keys: resolverKeys,
  confidence,
  method,
})

export default function QualityImportMappingWorkspace({ rooms, initialRoomId, role }: Props) {
  const canManage = role === 'ADMIN' || role === 'PMKP'
  const [roomId, setRoomId] = useState<number | null>(initialRoomId ?? rooms[0]?.id ?? null)
  const [year, setYear] = useState(2026)
  const [pane, setPane] = useState<'unit' | 'indicator'>('unit')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fileName, setFileName] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('Logbook')
  const [headerRows, setHeaderRows] = useState<number[]>([])
  const [headerRow, setHeaderRow] = useState(3)
  const [headers, setHeaders] = useState<HeaderOption[]>([])
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({})
  const [indicatorDrafts, setIndicatorDrafts] = useState<Record<string, string>>({})
  const [selectedIndicator, setSelectedIndicator] = useState('')
  const [profileTitle, setProfileTitle] = useState('')
  const [profileHeader, setProfileHeader] = useState('')
  const [profileAliases, setProfileAliases] = useState('')
  const [naraLoading, setNaraLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Record<string, boolean>>({})
  const [audit, setAudit] = useState<Array<Record<string, any>>>([])

  useEffect(() => {
    if (initialRoomId != null) setRoomId(initialRoomId)
  }, [initialRoomId])

  const room = rooms.find(item => item.id === roomId) ?? null
  const importer = roomId == null ? null : IMPORTERS[roomId] ?? null
  const selectedProfile = profiles.find(item => item.code === selectedIndicator) ?? null

  const loadSettings = useCallback(async () => {
    if (!canManage || roomId == null) return
    setLoading(true); setError(''); setNotice('')
    try {
      const [profileResult, mappingResult, auditResult] = await Promise.all([
        q().from('indicator_profiles').select('*').eq('room_id', roomId).eq('profile_year', year).eq('status', 'published').eq('is_active', true).order('code'),
        importer
          ? q().from('quality_import_mappings').select('*').eq('room_id', roomId).eq('profile_year', year).eq('importer_key', importer.key).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        q().from('quality_import_mapping_audit').select('id,action_type,target_key,decision_note,actor_id,created_at,importer_key').eq('room_id', roomId).eq('profile_year', year).order('created_at', { ascending: false }).limit(25),
      ])
      if (profileResult.error) throw profileResult.error
      if (mappingResult.error) throw mappingResult.error
      if (auditResult.error) throw auditResult.error
      const nextProfiles = (profileResult.data ?? []) as Profile[]
      setProfiles(nextProfiles)
      const existing = mappingResult.data as any
      const nextConfig: Config = existing ? {
        id: existing.id,
        room_id: Number(existing.room_id),
        profile_year: Number(existing.profile_year),
        importer_key: String(existing.importer_key),
        sheet_name: String(existing.sheet_name ?? 'Logbook'),
        header_row: Number(existing.header_row ?? 3),
        data_start_row: Number(existing.data_start_row ?? 4),
        field_mappings: existing.field_mappings ?? {},
        indicator_mappings: existing.indicator_mappings ?? {},
        workbook_name_hint: existing.workbook_name_hint,
      } : (importer ? emptyConfig(roomId, year, importer.key) : null)
      setConfig(nextConfig)
      setSheetName(nextConfig?.sheet_name ?? 'Logbook')
      setHeaderRow(nextConfig?.header_row ?? 3)
      setFieldDrafts(Object.fromEntries(Object.entries(nextConfig?.field_mappings ?? {}).map(([key,value]) => [key, value.source_header])))
      setIndicatorDrafts(Object.fromEntries(Object.entries(nextConfig?.indicator_mappings ?? {}).map(([key,value]) => [key, value.source_header])))
      setAudit((auditResult.data ?? []) as any[])
      setSuggestions([]); setAcceptedSuggestions({})
      const current = nextProfiles.find(item => item.code === selectedIndicator) ?? nextProfiles[0] ?? null
      setSelectedIndicator(current?.code ?? '')
      setProfileTitle(current?.title ?? '')
      setProfileHeader(String(current?.schema_json?.header_label ?? ''))
      setProfileAliases(Array.isArray(current?.schema_json?.import_aliases) ? current!.schema_json.import_aliases.join('\n') : '')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Konfigurasi pemetaan unit belum dapat dibaca.' }))
    } finally { setLoading(false) }
  }, [canManage, roomId, year, importer?.key, selectedIndicator])

  useEffect(() => { void loadSettings() }, [loadSettings])

  useEffect(() => {
    const p = selectedProfile
    if (!p) { setProfileTitle(''); setProfileHeader(''); setProfileAliases(''); return }
    setProfileTitle(p.title)
    setProfileHeader(String(p.schema_json?.header_label ?? ''))
    setProfileAliases(Array.isArray(p.schema_json?.import_aliases) ? p.schema_json.import_aliases.join('\n') : '')
  }, [selectedProfile?.id])

  const scanWorkbook = async (file?: File) => {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Pilih workbook .xlsx maksimal 25 MB.')
      return
    }
    setError(''); setNotice(''); setSuggestions([])
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0 || workbook.worksheets.length > 50) throw new Error('Jumlah worksheet tidak wajar.')
      const names = workbook.worksheets.map((sheet: any) => String(sheet.name))
      const preferred = names.includes(config?.sheet_name ?? 'Logbook') ? (config?.sheet_name ?? 'Logbook') : names[0]
      setFileName(file.name); setSheetNames(names); setSheetName(preferred)
      const sheet = workbook.getWorksheet(preferred)
      const candidates: Array<{ row: number; count: number; sample: string }> = []
      for (let row = 1; row <= Math.min(Number(sheet?.rowCount ?? 0), 20); row++) {
        const options = parseHeaders(sheet, row)
        if (options.length >= 2) candidates.push({ row, count: options.length, sample: options.slice(0, 4).map(x => x.label).join(' · ') })
      }
      if (!candidates.length) throw new Error('Tidak ditemukan baris header yang dapat dibaca pada 20 baris pertama.')
      setHeaderRows(candidates.map(x => x.row)); setHeaderRow(config?.header_row && candidates.some(x => x.row === config.header_row) ? config.header_row : candidates.sort((a,b) => b.count - a.count)[0].row)
      setNotice('Workbook dipindai di browser. Hanya nama sheet, nomor baris header, dan teks header yang digunakan untuk membuat pemetaan; isi episode tidak dikirim ke NARA.')
      refreshHeaders(workbook, preferred, config?.header_row && candidates.some(x => x.row === config.header_row) ? config.header_row : candidates.sort((a,b) => b.count - a.count)[0].row)
      ;(window as any).__aurekaMappingWorkbook = workbook
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook belum dapat dipindai.' }))
    }
  }

  const refreshHeaders = (workbook: any, selectedSheet: string, selectedRow: number) => {
    const sheet = workbook.getWorksheet(selectedSheet)
    if (!sheet) { setHeaders([]); return }
    setHeaders(parseHeaders(sheet, selectedRow))
  }

  const changeSheet = (name: string) => {
    const workbook = (window as any).__aurekaMappingWorkbook
    if (!workbook) return
    setSheetName(name)
    const sheet = workbook.getWorksheet(name)
    const candidates: number[] = []
    for (let row = 1; row <= Math.min(Number(sheet?.rowCount ?? 0), 20); row++) if (parseHeaders(sheet, row).length >= 2) candidates.push(row)
    setHeaderRows(candidates)
    const nextRow = candidates.includes(config?.header_row ?? headerRow) ? (config?.header_row ?? headerRow) : candidates[0] ?? 1
    setHeaderRow(nextRow); refreshHeaders(workbook, name, nextRow)
  }
  const changeHeaderRow = (row: number) => {
    setHeaderRow(row)
    refreshHeaders((window as any).__aurekaMappingWorkbook, sheetName, row)
  }

  const mappingFrom = (targetKey: string, sourceHeader: string, resolverKeys: string[] = []): HeaderMapping | null => {
    const header = headers.find(item => item.label === sourceHeader)
    if (!header) return null
    return {
      source_header: header.label,
      occurrence: header.occurrence,
      resolver_keys: [...new Set([targetKey, ...resolverKeys])],
      confidence: 1,
      method: 'manual',
    }
  }

  const saveUnitMappings = async () => {
    if (!canManage || !roomId || !importer || !config) return
    setSaving(true); setError(''); setNotice('')
    try {
      const currentUser = await sb.auth.getUser()
      if (currentUser.error || !currentUser.data.user) throw new Error('Sesi pengguna tidak ditemukan.')
      const nextFields: Record<string, HeaderMapping> = {}
      for (const field of FIELD_DEFINITIONS) {
        const source = fieldDrafts[field.key]
        if (!source) continue
        const mapping = mappingFrom(field.key, source, field.aliases)
        if (!mapping) throw new Error('Kolom sumber untuk ' + field.label + ' tidak ditemukan pada header hasil pemindaian.')
        nextFields[field.key] = mapping
      }
      const nextIndicators: Record<string, HeaderMapping> = {}
      for (const profile of profiles) {
        const source = indicatorDrafts[profile.code]
        if (!source) continue
        const aliases = [
          String(profile.schema_json?.header_label ?? ''),
          ...(Array.isArray(profile.schema_json?.import_aliases) ? profile.schema_json.import_aliases.map(String) : []),
          profile.code,
          profile.title,
        ].filter(Boolean)
        const mapping = mappingFrom('indicator:' + profile.code, source, aliases)
        if (!mapping) throw new Error('Kolom sumber indikator ' + profile.code + ' tidak ditemukan pada header hasil pemindaian.')
        nextIndicators[profile.code] = mapping
      }
      const row = {
        room_id: roomId,
        profile_year: year,
        importer_key: importer.key,
        sheet_name: sheetName,
        header_row: headerRow,
        data_start_row: Math.max(headerRow + 1, config.data_start_row ?? headerRow + 1),
        field_mappings: nextFields,
        indicator_mappings: nextIndicators,
        workbook_name_hint: fileName || config.workbook_name_hint || null,
        updated_by: currentUser.data.user.id,
        updated_at: new Date().toISOString(),
      }
      const { data: saved, error: saveError } = await q().from('quality_import_mappings').upsert(row, { onConflict: 'room_id,profile_year,importer_key' }).select('id').single()
      if (saveError) throw saveError
      const { error: auditError } = await q().from('quality_import_mapping_audit').insert({
        room_id: roomId,
        profile_year: year,
        importer_key: importer.key,
        action_type: 'unit_mapping_saved',
        decision_note: 'Pemetaan header workbook disimpan oleh Admin/PMKP.',
        before_json: { field_mappings: config.field_mappings, indicator_mappings: config.indicator_mappings, sheet_name: config.sheet_name, header_row: config.header_row },
        after_json: { field_mappings: nextFields, indicator_mappings: nextIndicators, sheet_name: sheetName, header_row: headerRow, mapping_id: saved.id },
        actor_id: currentUser.data.user.id,
      })
      if (auditError) throw auditError
      setNotice('Pengaturan pemetaan ' + importer.label + ' berhasil disimpan. Importer berikutnya akan memakai mapping ini meskipun susunan kolom berubah.')
      await loadSettings()
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Pemetaan unit belum berhasil disimpan.' }))
    } finally { setSaving(false) }
  }

  const saveProfileHeader = async () => {
    if (!canManage || !selectedProfile || !roomId) return
    const cleanHeader = profileHeader.trim()
    if (!cleanHeader) { setError('Header kanonis tidak boleh kosong.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const currentUser = await sb.auth.getUser()
      if (currentUser.error || !currentUser.data.user) throw new Error('Sesi pengguna tidak ditemukan.')
      const aliases = [...new Set(profileAliases.split(/\r?\n|;/).map(value => value.trim()).filter(Boolean))]
      const schema = {
        ...(selectedProfile.schema_json ?? {}),
        header_label: cleanHeader,
        import_aliases: aliases,
        import_mapping: {
          source_header: cleanHeader,
          importer_key: importer?.key ?? null,
          room_id: roomId,
          updated_at: new Date().toISOString(),
        },
      }
      const { data, error: updateError } = await q().from('indicator_profiles')
        .update({ title: profileTitle.trim() || selectedProfile.title, schema_json: schema, version: selectedProfile.version + 1, updated_by: currentUser.data.user.id, updated_at: new Date().toISOString() })
        .eq('id', selectedProfile.id)
        .eq('version', selectedProfile.version)
        .eq('status', 'published')
        .eq('is_active', true)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!data?.id) throw new Error('Profil berubah sejak dibuka. Muat ulang sebelum menyimpan perubahan.')
      const { error: auditError } = await q().from('quality_import_mapping_audit').insert({
        room_id: roomId,
        profile_year: year,
        importer_key: importer?.key ?? 'profile-metadata',
        action_type: 'indicator_profile_import_metadata_updated',
        target_key: selectedProfile.code,
        decision_note: 'Metadata profil indikator diperbarui untuk mendukung pengenalan header sumber Excel. Opsi klinis dan aturan numerator/denominator tidak diubah.',
        before_json: { title: selectedProfile.title, header_label: selectedProfile.schema_json?.header_label ?? null, import_aliases: selectedProfile.schema_json?.import_aliases ?? [] },
        after_json: { title: profileTitle.trim() || selectedProfile.title, header_label: cleanHeader, import_aliases: aliases, profile_version: selectedProfile.version + 1 },
        actor_id: currentUser.data.user.id,
      })
      if (auditError) throw auditError
      setNotice('Metadata header profil ' + selectedProfile.code + ' berhasil diperbarui. Opsi klasifikasi klinis tidak diubah.')
      await loadSettings()
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Metadata profil indikator belum dapat diperbarui.' }))
    } finally { setSaving(false) }
  }

  const askNaraBulk = async () => {
    if (!roomId || !importer || headers.length === 0) {
      setError('Pindai workbook terlebih dahulu agar NARA hanya menerima daftar header dan metadata indikator.')
      return
    }
    setNaraLoading(true); setError(''); setNotice('')
    try {
      const targets = [
        ...FIELD_DEFINITIONS.map(item => ({ target_key: 'field:' + item.key, kind: 'field', label: item.label, aliases: [...item.aliases] })),
        ...profiles.map(profile => ({
          target_key: 'indicator:' + profile.code,
          kind: 'indicator',
          code: profile.code,
          label: profile.title,
          canonical_header: String(profile.schema_json?.header_label ?? ''),
          aliases: Array.isArray(profile.schema_json?.import_aliases) ? profile.schema_json.import_aliases : [],
        })),
      ]
      const { data, error: invokeError } = await sb.functions.invoke('aureka-tanya', {
        body: {
          task: 'import_mapping_suggest',
          room_id: roomId,
          profile_year: year,
          importer_key: importer.key,
          sheet_name: sheetName,
          header_row: headerRow,
          headers: headers.map(item => ({ label: item.label, column: item.column, occurrence: item.occurrence })),
          targets,
        },
      })
      if (invokeError) throw invokeError
      const items = Array.isArray((data as any)?.suggestions) ? (data as any).suggestions as Suggestion[] : []
      setSuggestions(items)
      setAcceptedSuggestions(Object.fromEntries(items.map((item, index) => [String(index), true])))
      if (!items.length) setNotice('NARA tidak menemukan pemetaan dengan keyakinan memadai. Tidak ada perubahan yang disimpan.')
      else setNotice(items.length + ' usulan NARA tersedia. Periksa dan pilih yang akan diterapkan; NARA tidak mengubah konfigurasi secara otomatis.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'NARA belum dapat menganalisis header workbook. Pemetaan manual tetap tersedia.' }))
    } finally { setNaraLoading(false) }
  }

  const acceptNaraSuggestions = async () => {
    if (!config || !headers.length || !roomId || !importer) return
    const chosen = suggestions.filter((_, index) => acceptedSuggestions[String(index)] === true)
    if (!chosen.length) { setError('Pilih minimal satu usulan NARA.'); return }
    const nextFields = { ...fieldDrafts }
    const nextIndicators = { ...indicatorDrafts }
    for (const item of chosen) {
      const fieldKey = item.target_key.startsWith('field:') ? item.target_key.slice(6) : ''
      const indicatorCode = item.target_key.startsWith('indicator:') ? item.target_key.slice(10) : ''
      if (fieldKey && FIELD_DEFINITIONS.some(field => field.key === fieldKey)) nextFields[fieldKey] = item.source_header
      if (indicatorCode && profiles.some(profile => profile.code === indicatorCode)) nextIndicators[indicatorCode] = item.source_header
    }
    setFieldDrafts(nextFields); setIndicatorDrafts(nextIndicators)
    setSuggestions([])
    setNotice(chosen.length + ' saran NARA disalin ke draf pemetaan. Tekan Simpan Pengaturan Unit untuk menerapkan secara permanen.')
  }

  const mappingCount = Object.keys(config?.field_mappings ?? {}).length + Object.keys(config?.indicator_mappings ?? {}).length
  const supported = !!importer

  return <section className="qimRoot">
    <style>{`
      .qimRoot{display:grid;gap:14px;color:#21394d;min-width:0}
      .qimTop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .qimEyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#557b94;font-weight:850}
      .qimTop h3{font-size:21px;margin:4px 0;letter-spacing:-.035em}
      .qimTop p{font-size:12px;color:#708493;line-height:1.5;margin:0;max-width:720px}
      .qimBar{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
      .qimField{display:grid;gap:5px;font-size:11px;font-weight:750;color:#678092}
      .qimField select,.qimField input{height:37px;border:1px solid #d9e3ea;background:#fff;border-radius:9px;padding:6px 9px;color:#284258;min-width:150px;font-size:12px}
      .qimTabs{display:flex;gap:7px;flex-wrap:wrap}
      .qimTab{border:1px solid #dce6ed;background:#fff;color:#587183;border-radius:10px;padding:10px 13px;font-size:12px;font-weight:800;cursor:pointer}
      .qimTab.active{background:#eaf3fb;border-color:#b8d4ec;color:#1d557f}
      .qimCard{border:1px solid #e1e9ef;background:#fff;border-radius:13px;overflow:hidden}
      .qimCardHead{padding:13px 15px;border-bottom:1px solid #edf1f4;display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}
      .qimCardHead strong{font-size:14px}
      .qimCardHead p{font-size:11px;color:#76899a;margin:4px 0 0;line-height:1.5}
      .qimBody{padding:14px;display:grid;gap:12px}
      .qimGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .qimMapping{display:grid;grid-template-columns:minmax(170px, .8fr) minmax(200px,1.2fr);gap:10px;padding:9px 0;border-bottom:1px solid #edf2f5;align-items:center}
      .qimMapping:last-child{border:0}
      .qimMapping label{font-size:12px;font-weight:750;color:#304b61}
      .qimMapping small{display:block;font-size:10px;color:#8496a4;margin-top:3px;line-height:1.35}
      .qimMapping select,.qimInput,.qimText{width:100%;border:1px solid #dbe5eb;border-radius:8px;background:#fff;padding:8px 9px;min-height:36px;color:#244158;font-size:12px}
      .qimText{min-height:76px;resize:vertical}
      .qimBtn{border:1px solid #d8e3ea;border-radius:9px;background:#fff;padding:9px 12px;color:#31536a;font-size:12px;font-weight:800;cursor:pointer}
      .qimBtn:disabled{opacity:.5;cursor:not-allowed}
      .qimBtn.primary{background:#1e557e;color:#fff;border-color:#1e557e}
      .qimBtn.nara{background:#f1ecff;border-color:#d8cff5;color:#58468d}
      .qimBadge{display:inline-flex;padding:4px 7px;border-radius:7px;background:#edf4f8;color:#547184;font-size:10px;font-weight:800}
      .qimNotice{padding:10px 12px;border-radius:9px;background:#eff8f2;border:1px solid #d2ead9;color:#286646;font-size:12px;line-height:1.5}
      .qimWarn{padding:10px 12px;border-radius:9px;background:#fff7e8;border:1px solid #f0dfb6;color:#7f5b18;font-size:12px;line-height:1.5}
      .qimError{padding:10px 12px;border-radius:9px;background:#fff1f0;border:1px solid #edcecb;color:#8d352f;font-size:12px;line-height:1.5}
      .qimHeaderList{display:flex;gap:6px;flex-wrap:wrap}
      .qimHeader{border:1px solid #e0e8ef;border-radius:7px;padding:5px 8px;font-size:10px;color:#536d80;background:#f8fafc}
      .qimSuggest{display:grid;grid-template-columns:24px minmax(0,1fr) 80px;gap:9px;align-items:start;padding:10px;border-bottom:1px solid #edf2f5}
      .qimSuggest:last-child{border:0}
      .qimSuggest strong{font-size:12px}.qimSuggest p{font-size:11px;color:#748797;margin:3px 0 0;line-height:1.5}
      .qimAudit{display:grid;grid-template-columns:130px minmax(0,1fr);gap:9px;padding:9px 0;border-bottom:1px solid #eef2f5;font-size:11px}
      .qimAudit:last-child{border:0}
      @media(max-width:700px){.qimGrid{grid-template-columns:1fr}.qimMapping{grid-template-columns:1fr}.qimSuggest{grid-template-columns:24px 1fr}.qimSuggest .qimBadge{grid-column:2}.qimAudit{grid-template-columns:1fr}}
    `}</style>

    <div className="qimTop">
      <div><span className="qimEyebrow">Konfigurasi impor Excel · lintas unit</span><h3>Pemetaan Kolom Excel</h3><p>Atur satu kali sumber kolom dan indikator per unit. Importer berikutnya akan membaca mapping dari database, bukan meminta pengguna memilih ulang di setiap komputer.</p></div>
      <div className="qimBar">
        <label className="qimField">Unit kerja
          <select value={roomId ?? ''} onChange={event => setRoomId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Pilih unit…</option>
            {rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="qimField">Tahun profil
          <select value={year} onChange={event => setYear(Number(event.target.value))}>{[2025,2026,2027,2028,2029].map(value => <option key={value}>{value}</option>)}</select>
        </label>
      </div>
    </div>

    <div className="qimTabs">
      <button type="button" className={'qimTab '+(pane==='unit'?'active':'')} onClick={()=>setPane('unit')}>Pengaturan per Unit</button>
      <button type="button" className={'qimTab '+(pane==='indicator'?'active':'')} onClick={()=>setPane('indicator')}>Pengaturan per Indikator</button>
    </div>

    {error && <div className="qimError" role="alert">{error}</div>}
    {notice && <div className="qimNotice" role="status">{notice}</div>}

    {!roomId ? <div className="qimWarn">Pilih unit kerja untuk menampilkan pemetaan dan profil indikator.</div> :
    <>
      <div className="qimCard">
        <div className="qimCardHead">
          <div><strong>{room?.name}</strong><p>{count(profiles.length)} profil indikator aktif · {supported ? 'Importer Excel tersedia: '+importer?.label : 'Belum ada importer Excel khusus yang terhubung untuk unit ini'}</p></div>
          <span className="qimBadge">{loading ? 'Memuat…' : 'Mapping '+count(mappingCount)+' item'}</span>
        </div>
        {pane==='unit' && <div className="qimBody">
          {!supported && <div className="qimWarn">Unit ini belum memiliki alur import workbook khusus dalam AUREKA. Profil indikator tetap dapat diperiksa, tetapi konfigurasi ini belum dapat dipakai oleh importer yang belum tersedia.</div>}
          {supported && <>
            <div className="qimGrid">
              <label className="qimField">Workbook contoh (.xlsx)
                <input type="file" accept=".xlsx" onChange={event=>void scanWorkbook(event.target.files?.[0])}/>
              </label>
              <label className="qimField">Worksheet
                <select value={sheetName} onChange={event=>changeSheet(event.target.value)} disabled={!sheetNames.length}>{sheetNames.map(name=><option key={name}>{name}</option>)}</select>
              </label>
              <label className="qimField">Baris header
                <select value={headerRow} onChange={event=>changeHeaderRow(Number(event.target.value))} disabled={!headerRows.length}>{headerRows.map(row=><option key={row} value={row}>Baris {row}</option>)}</select>
              </label>
              <label className="qimField">Baris data pertama
                <input type="number" min={headerRow+1} max="101" value={config?.data_start_row ?? headerRow+1} onChange={event=>setConfig(current=>current?{...current,data_start_row:Number(event.target.value)}:current)} />
              </label>
            </div>
            {fileName && <div><span className="qimBadge">Header dipindai dari {fileName}</span><div className="qimHeaderList" style={{marginTop:8}}>{headers.map(item=><span className="qimHeader" key={item.column}>{item.letter} · {item.label}</span>)}</div></div>}
            <div className="qimCard">
              <div className="qimCardHead"><div><strong>Kolom data utama</strong><p>Field standar yang dipakai saat importer mengenali identitas dan konteks episode.</p></div></div>
              <div className="qimBody">
                {FIELD_DEFINITIONS.map(field=><div className="qimMapping" key={field.key}>
                  <div><label>{field.label}</label><small>Key: {field.key}</small></div>
                  <select value={fieldDrafts[field.key] ?? ''} onChange={event=>setFieldDrafts(current=>({...current,[field.key]:event.target.value}))} disabled={!headers.length}>
                    <option value="">Tidak dipetakan / kosong</option>
                    {headers.map(item=><option key={item.column} value={item.label}>{item.letter} · {item.label}{item.occurrence>1?' (kemunculan '+item.occurrence+')':''}</option>)}
                  </select>
                </div>)}
              </div>
            </div>
            <div className="qimCard">
              <div className="qimCardHead"><div><strong>Pemetaan indikator unit</strong><p>Setiap kode indikator harus menunjuk kolom sumbernya sendiri. Pemetaan tidak memakai urutan kolom.</p></div></div>
              <div className="qimBody">
                {profiles.map(profile=><div className="qimMapping" key={profile.id}>
                  <div><label>{profile.code} · {profile.title}</label><small>{String(profile.schema_json?.header_label ?? 'Header kanonis belum ditetapkan')}</small></div>
                  <select value={indicatorDrafts[profile.code] ?? ''} onChange={event=>setIndicatorDrafts(current=>({...current,[profile.code]:event.target.value}))} disabled={!headers.length}>
                    <option value="">Pilih kolom indikator…</option>
                    {headers.map(item=><option key={item.column} value={item.label}>{item.letter} · {item.label}</option>)}
                  </select>
                </div>)}
              </div>
            </div>
            <div className="qimCard">
              <div className="qimCardHead"><div><strong>Asisten NARA AI · pemetaan massal</strong><p>NARA hanya menerima daftar header dan metadata profil indikator. Isi episode, nama pasien, No. RM, dan nilai klinis tidak dikirim.</p></div><button type="button" className="qimBtn nara" disabled={!headers.length||naraLoading} onClick={()=>void askNaraBulk()}>{naraLoading?'Menganalisis…':'Analisis header secara massal'}</button></div>
              {suggestions.length>0 && <div className="qimBody">
                {suggestions.map((item,index)=><div className="qimSuggest" key={item.target_key}>
                  <input type="checkbox" checked={acceptedSuggestions[String(index)]===true} onChange={event=>setAcceptedSuggestions(current=>({...current,[String(index)]:event.target.checked}))}/>
                  <div><strong>{item.target_label} → {item.source_header}</strong><p>{item.rationale}</p></div>
                  <span className="qimBadge">{Math.round(item.confidence*100)}%</span>
                </div>)}
                <div style={{display:'flex',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}><button type="button" className="qimBtn" onClick={()=>setSuggestions([])}>Tolak semua</button><button type="button" className="qimBtn" onClick={()=>void acceptNaraSuggestions()}>Pakai saran terpilih</button></div>
              </div>}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span className="qimBadge">{count(Object.keys(fieldDrafts).filter(key=>fieldDrafts[key]).length+Object.keys(indicatorDrafts).filter(key=>indicatorDrafts[key]).length)} mapping terisi di draf</span>
              <button type="button" className="qimBtn primary" disabled={saving||!headers.length} onClick={()=>void saveUnitMappings()}>{saving?'Menyimpan…':'Simpan pengaturan unit'}</button>
            </div>
          </>}
        </div>}

        {pane==='indicator' && <div className="qimBody">
          {profiles.length===0 ? <div className="qimWarn">Belum ada profil indikator aktif pada unit/tahun ini.</div> : <>
            <div className="qimGrid">
              <label className="qimField">Indikator
                <select value={selectedIndicator} onChange={event=>setSelectedIndicator(event.target.value)}>{profiles.map(profile=><option key={profile.id} value={profile.code}>{profile.code} · {profile.title}</option>)}</select>
              </label>
              <label className="qimField">Judul profil
                <input value={profileTitle} onChange={event=>setProfileTitle(event.target.value)}/>
              </label>
            </div>
            <label className="qimField">Header kanonis untuk impor
              <input className="qimInput" value={profileHeader} onChange={event=>setProfileHeader(event.target.value)} placeholder="Nama header sumber utama"/>
            </label>
            <label className="qimField">Alias header (satu per baris)
              <textarea className="qimText" value={profileAliases} onChange={event=>setProfileAliases(event.target.value)} placeholder={'Contoh:\nKematian IGD ≤8h\nMeninggal ≤8 Jam'}/>
            </label>
            <div className="qimWarn">Perubahan ini hanya memperbarui metadata pengenalan kolom dan judul profil. Opsi jawaban, kode 1/2/3, definisi numerator/denominator, serta arah indikator klinis tidak diubah pada editor ini.</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span className="qimBadge">Versi profil {selectedProfile?.version ?? '-'}</span>
              <button type="button" className="qimBtn primary" disabled={saving||!selectedProfile} onClick={()=>void saveProfileHeader()}>{saving?'Menyimpan…':'Simpan metadata profil'}</button>
            </div>
          </>}
        </div>}
      </div>

      <div className="qimCard">
        <div className="qimCardHead"><div><strong>Riwayat perubahan pemetaan</strong><p>Audit konfigurasi yang disimpan untuk unit dan tahun ini.</p></div></div>
        <div className="qimBody">
          {audit.length===0 ? <span className="qimMuted">Belum ada perubahan konfigurasi.</span> : audit.map(item=><div className="qimAudit" key={item.id}>
            <strong>{new Date(item.created_at).toLocaleString('id-ID')}</strong>
            <span>{item.action_type} · {item.decision_note}</span>
          </div>)}
        </div>
      </div>
    </>}
  </section>
}
