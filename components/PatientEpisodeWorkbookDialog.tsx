'use client'

import { useRef, useState } from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import unitAliases from '@/data/quality-audit-profile-aliases-2026.json'
import { inspectQualityWorkbookRouting } from '@/lib/aureka/quality-workbook-source-audit'
import {
  EPISODE_WORKBOOK_IMPORTER, buildEpisodeMappings, detectEpisodeFields, findEpisodeSourceColumn, inspectEpisodeWorkbook,
  overrideEpisodeLogbookHeader, prepareEpisodeImport, prepareMissingEpisodeProfiles, workbookSha256,
  type EpisodeColumn, type EpisodeFields, type EpisodeProfile, type EpisodeWorkbook, type EpisodeSourceRule, type ProfileMapping,
} from '@/lib/aureka/patient-episode-workbook'
import { toUserFacingError } from '@/lib/ui/error-feedback'

const quality = () => aurekaSupabase.schema('aureka_quality')
const fieldLabels: Record<keyof EpisodeFields, string> = {
  date: 'Tanggal episode', mrn: 'No. RM', episode: 'ID episode', name: 'Nama pasien',
  discharge: 'Tanggal keluar', diagnosis: 'Diagnosis', dpjp: 'DPJP',
}
const fileLimit = 25 * 1024 * 1024

type SavedMapping = EpisodeSourceRule & { target_type: string; target_key: string }
type OpenWorkbook = {
  name: string
  hash: string
  parsed: EpisodeWorkbook
  profiles: EpisodeProfile[]
  reference: EpisodeProfile[]
  saved: SavedMapping[]
}
type Preview = Awaited<ReturnType<typeof prepareEpisodeImport>>

async function fetchProfiles(roomId: number, year: number, admin: boolean) {
  const query = quality().from('indicator_profiles').select('*')
    .eq('room_id', roomId).eq('profile_year', year).eq('is_active', true)
  const { data, error } = await (admin ? query.in('status', ['published', 'draft']) : query.eq('status', 'published'))
    .order('code')
  if (error) throw error
  return (data ?? []) as EpisodeProfile[]
}

function sameProfileVersions(a: EpisodeProfile[], b: EpisodeProfile[]) {
  return a.length === b.length && a.every((profile, index) =>
    profile.id === b[index].id && profile.version === b[index].version && profile.updated_at === b[index].updated_at,
  )
}

function ColumnSelect({ label, columns, value, onChange }: {
  label: string; columns: EpisodeColumn[]; value: number; onChange: (value: number) => void;
}) {
  return <label>{label}<select value={value} onChange={event => onChange(Number(event.target.value))}>
    <option value={0}>Pilih kolom</option>
    {columns.map(column => <option key={column.index} value={column.index}>{column.letter} · {column.name}</option>)}
  </select></label>
}

export default function PatientEpisodeWorkbookDialog({
  roomId, roomName, year, admin, dateField, layoutFields, onClose, onLegacyImport, onImported,
}: {
  roomId: number; roomName: string; year: number; admin: boolean; dateField?: string; layoutFields: string[];
  onClose: () => void; onLegacyImport?: () => void; onImported: (message: string) => void;
}) {
  const [file, setFile] = useState<OpenWorkbook | null>(null)
  const [fields, setFields] = useState<EpisodeFields>(() => detectEpisodeFields([]))
  const [mappings, setMappings] = useState<ProfileMapping[]>([])
  const [applyProfiles, setApplyProfiles] = useState(false)
  const [matchingHeader, setMatchingHeader] = useState('')
  const [confirmedHeldRows,setConfirmedHeldRows] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [autofillNotice, setAutofillNotice] = useState('')
  const [sourceNotes, setSourceNotes] = useState<string[]>([])
  const running = useRef(false)
  const aliases = year === 2026 ? (unitAliases as Record<string, Record<string, string>>)[roomId] ?? {} : {}

  function invalidatePreview() { setPreview(null); setConfirmedHeldRows(false); setError('') }

  function initializeColumns(next: OpenWorkbook, useProfiles: boolean) {
    const columns = next.parsed.logbook.columns
    const nextFields = detectEpisodeFields(columns, dateField, roomId)
    for (const key of Object.keys(fieldLabels) as Array<keyof EpisodeFields>) {
      const rule = next.saved.find(item => item.target_type === 'field' && item.target_key === 'field:' + key)
      if (rule?.mapping_status !== 'needs_review' && rule) nextFields[key] = findEpisodeSourceColumn(next.parsed.logbook, rule)
    }
    setFields(nextFields)
    setMatchingHeader(String(next.parsed.logbook.header))
    setMappings(buildEpisodeMappings(next.parsed, next.profiles.filter(profile => profile.status !== 'draft'),
      next.reference, aliases, next.saved, useProfiles))
    invalidatePreview()
  }

  async function openFile(input: File) {
    if (running.current) return
    setFile(null)
    setMappings([])
    setAutofillNotice('')
    setSourceNotes([])
    invalidatePreview()
    const routing = inspectQualityWorkbookRouting(input.name, roomId, year)
    if (routing.blockers.length) {
      setError(routing.blockers.join(' '))
      return
    }
    setSourceNotes(routing.notes)
    if (!/\.xlsx$/i.test(input.name) || input.size === 0 || input.size > fileLimit) {
      setError('Pilih berkas .xlsx dengan ukuran maksimal 25 MB.')
      return
    }
    running.current = true
    setBusy('Membaca workbook…')
    try {
      const [module, bytes, profiles, reference, saved] = await Promise.all([
        import('exceljs-hardened'), input.arrayBuffer(), fetchProfiles(roomId, year, admin),
        Promise.resolve([] as EpisodeProfile[]),
        quality().rpc('quality_excel_header_mapping_list', {
          p_room_id: roomId, p_profile_year: year, p_importer_key: EPISODE_WORKBOOK_IMPORTER,
        }),
      ])
      const ExcelJS = module.default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes)
      const savedRules: SavedMapping[] = Array.isArray(saved.data?.mappings) ? saved.data.mappings : []
      const parsed = inspectEpisodeWorkbook(workbook, dateField, savedRules)
      const next = { name: input.name, hash: await workbookSha256(bytes), parsed, profiles, reference,
        saved: savedRules }
      // Missing profiles are created independently of Logbook validation.
      // Never switch to destructive whole-set replacement as a side effect of uploading.
      setApplyProfiles(false)
      setFile(next)
      initializeColumns(next, false)
      if (parsed.profileSheet && !parsed.entries.length) {
        setError('Sheet Profil belum terbaca. Periksa kolom nama, kode, dan sumber indikator.')
      } else if (parsed.entries.length > 0) {
        const withCodes = { ...parsed, entries: parsed.entries.filter(entry => entry.code) }
        const sourceProfiles = parsed.entries.length - withCodes.entries.length
        const plan = prepareMissingEpisodeProfiles(withCodes, profiles, reference, roomId, roomName, year)
        if (sourceProfiles > 0 && !withCodes.entries.length) {
          setAutofillNotice(sourceProfiles.toLocaleString('id-ID') + ' profil sumber terbaca. Nomor urut di workbook dipakai untuk penelusuran. Data dihubungkan ke kode master AUREKA yang aktif.')
        } else if (plan.issues.length) {
          setError('Master belum diubah: ' + plan.issues.slice(0, 5).map(issue =>
            issue.location + ': ' + issue.message).join(' | '))
        } else if (plan.profiles.length && admin) {
          // Reading a patient's workbook must never mutate the published indicator master.
          // Profiles are imported explicitly through Profil Indikator after review.
          setAutofillNotice(plan.profiles.length.toLocaleString('id-ID') +
            ' profil belum ada di master. Tidak ada profil yang dibuat. Periksa dan terbitkan melalui menu Profil Indikator sebelum mengimpor data pasien.')
        } else if (plan.profiles.length && !admin) {
          setAutofillNotice('Workbook memuat ' + plan.profiles.length +
            ' indikator belum tersedia. Hanya Superadmin yang dapat membuat master; minta Superadmin mengunggah workbook ini.')
        } else {
          setAutofillNotice('Semua ' + plan.skipped + ' profil dari workbook sudah ada di master; tidak ada profil yang ditimpa.')
        }
      }
      if (!parsed.hasLogbook) {
        setAutofillNotice(previous => previous + (previous ? ' ' : '') +
          'Workbook profil saja tidak mengubah master. Terbitkan profil melalui menu Profil Indikator.')
      }
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook belum dapat dibaca. Periksa berkas dan koneksi, lalu coba lagi.' }))
    } finally {
      running.current = false
      setBusy('')
    }
  }

  function updateMapping(key: string, patch: Partial<ProfileMapping>) {
    setMappings(previous => previous.map(mapping => mapping.key === key ? { ...mapping, ...patch } : mapping))
    invalidatePreview()
  }

  function changeHeader() {
    if (!file) return
    const row = Number(matchingHeader)
    if (!Number.isInteger(row) || row < 1 || row >= file.parsed.logbook.sheet.rowCount) {
      setError('Tentukan nomor baris header sebelum baris data pertama.')
      return
    }
    const next = { ...file, parsed: overrideEpisodeLogbookHeader(file.parsed, row) }
    if (!next.parsed.logbook.columns.length) { setError('Baris ini tidak berisi judul kolom.'); return }
    setFile(next)
    initializeColumns(next, applyProfiles)
  }

  async function buildPreview() {
    if (!file || !file.parsed.hasLogbook || running.current) return
    running.current = true
    invalidatePreview()
    setBusy('Memeriksa episode…')
    try {
      setPreview(await prepareEpisodeImport({
        parsed: file.parsed, fields, mappings, activeProfiles: file.profiles,
        includeProfiles: applyProfiles, roomId, roomName, year, layoutFields, allowReviewQueue: !applyProfiles,
      }))
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Pratinjau belum dapat dibuat. Periksa pemetaan dan nilai pada workbook.' }))
    } finally {
      running.current = false
      setBusy('')
    }
  }

  async function saveMappings(next?: Preview) {
    if (!file) return
    const columns = file.parsed.logbook.columns
    const provenance = { source_sheet: file.parsed.logbook.sheet.name, header_row: file.parsed.logbook.header }
    const sourceOf = (column: EpisodeColumn) => ({
      ...provenance, column_index: column.index, column_letter: column.letter,
    })
    const rules: Array<Record<string, unknown>> = []
    for (const key of Object.keys(fieldLabels) as Array<keyof EpisodeFields>) {
      const column = columns.find(item => item.index === fields[key])
      if (column) rules.push({ target_type: 'field', target_key: 'field:' + key, target_label: fieldLabels[key], source_header: column.name, occurrence: column.occurrence, transform_json: sourceOf(column) })
    }
    const profiles = next?.profiles.length ? next.profiles : file.profiles
    for (const mapping of mappings) {
      const column = columns.find(item => item.index === mapping.column)
      const profile = profiles.find(item => item.code.toUpperCase() === mapping.code.trim().toUpperCase())
      if (!column || !profile) continue
      rules.push({
        target_type: 'indicator', target_key: 'indicator:' + profile.code, target_label: profile.code + ' · ' + profile.title,
        indicator_code: profile.code, source_header: column.name, occurrence: column.occurrence, transform_json: sourceOf(column),
      })
    }
    if (!rules.length) throw new Error('Pilih kolom sumber sebelum menyimpan tautan.')
    for (let index = 0; index < rules.length; index += 200) {
      const { error } = await quality().rpc('quality_excel_header_mapping_upsert_bulk', {
        p_room_id: roomId, p_profile_year: year, p_importer_key: EPISODE_WORKBOOK_IMPORTER,
        p_rules: rules.slice(index, index + 200), p_decision_note: 'Pemetaan diperiksa saat impor workbook episode pasien.',
      })
      if (error) throw error
    }
  }

  async function saveLinks() {
    if (running.current || !file) return
    running.current = true
    setBusy('Menyimpan tautan…'); setError('')
    try {
      await saveMappings()
      setAutofillNotice('Tautan kolom tersimpan. Gunakan pratinjau untuk memeriksa data sebelum impor.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Tautan kolom belum tersimpan.' }))
    } finally { running.current = false; setBusy('') }
  }

  async function runImport() {
    if (!file || !preview || preview.issues.length || !preview.rows.length || running.current || (preview.heldRows > 0 && !confirmedHeldRows)) return
    running.current = true
    setError('')
    setBusy('Menyiapkan impor…')
    let batchId = ''
    let committed = false
    try {
      const latest = await fetchProfiles(roomId, year, admin)
      if (!sameProfileVersions(file.profiles, latest)) {
        const next = { ...file, profiles: latest }
        setFile(next)
        initializeColumns(next, applyProfiles)
        setError('Profil unit berubah. Periksa pemetaan terbaru dan buat pratinjau kembali.')
        return
      }
      const { data, error } = await quality().rpc('create_quality_import_batch', {
        p_room_id: roomId, p_profile_year: year, p_importer_key: EPISODE_WORKBOOK_IMPORTER,
        p_file_name: file.name, p_file_sha256: file.hash, p_import_mode: preview.profiles.length ? 'profiles_and_data' : 'data_only',
        p_data_mode: 'append', p_profiles: preview.profiles, p_expected_rows: preview.rows.length,
      })
      if (error) throw error
      batchId = String(data?.batch_id ?? '')
      if (!batchId) throw new Error('Impor belum dapat dibuat.')
      for (let offset = 0; offset < preview.rows.length; offset += 80) {
        setBusy('Menyiapkan episode ' + (offset + 1) + '–' + Math.min(offset + 80, preview.rows.length) + '…')
        const { error: stageError } = await quality().rpc('stage_quality_import_batch_rows', {
          p_batch_id: batchId, p_rows: preview.rows.slice(offset, offset + 80),
        })
        if (stageError) throw stageError
      }
      const checked = await quality().rpc('validate_quality_import_batch', { p_batch_id: batchId })
      if (checked.error) throw checked.error
      if (checked.data?.status !== 'validated') throw new Error('Validasi impor belum berhasil.')
      setBusy('Menyimpan episode…')
      const result = await quality().rpc('commit_quality_import_batch', { p_batch_id: batchId })
      if (result.error) throw result.error
      if (result.data?.status !== 'committed') throw new Error('Penyimpanan belum dikonfirmasi. Periksa daftar episode.')
      committed = true
      let message = Number(result.data.imported_rows ?? preview.rows.length).toLocaleString('id-ID') + ' episode berhasil diimpor.'
      if (preview.heldRows) message += ' ' + preview.heldRows.toLocaleString('id-ID') + ' baris masih perlu perbaikan sumber.'
      if (preview.profiles.length) message += ' Profil workbook tersimpan.'
      try { await saveMappings(preview) } catch {
        message += ' Pemetaan belum tersimpan untuk unggahan berikutnya.'
      }
      onImported(message)
    } catch (cause) {
      const duplicate = Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505')
      setError(duplicate ? 'Episode sudah ada dalam impor sebelumnya. Periksa No. RM, waktu kunjungan, atau ID episode.' :
        toUserFacingError(cause, { fallback: 'Impor belum berhasil. Periksa daftar episode sebelum mencoba kembali.' }))
    } finally {
      if (batchId && !committed) {
        try { await quality().rpc('cancel_quality_import_batch', { p_batch_id: batchId }) } catch { /* Pending batches expire through the existing retention process. */ }
      }
      running.current = false
      setBusy('')
    }
  }

  const columns = file?.parsed.logbook.columns ?? []
  const selectedCount = mappings.filter(mapping => mapping.column).length
  const labelImport = (preview ? preview.profiles.length > 0 : applyProfiles) ? 'Simpan profil dan impor' : 'Impor episode'
  return <AurekaModal open title="Impor workbook episode pasien" subtitle={roomName + ' · ' + year} size="xl"
    onClose={onClose} closeDisabled={!!busy}
    footer={<div className="episodeWorkbookActions">
      <button type="button" disabled={!!busy} onClick={onClose}>Tutup</button>
      {!!file?.parsed.hasLogbook && <button type="button" disabled={!!busy || selectedCount === 0} onClick={() => void saveLinks()}>Simpan tautan kolom</button>}
      <button type="button" disabled={!file?.parsed.hasLogbook || !!busy} onClick={() => void buildPreview()}>Pratinjau Logbook</button>
      <button type="button" className="episodeWorkbookPrimary" disabled={!!busy || !preview?.rows.length || !!preview?.issues.length || (Boolean(preview?.heldRows) && !confirmedHeldRows)} onClick={() => void runImport()}>{labelImport}</button>
    </div>}>
    <div className="episodeWorkbook">
      <fieldset disabled={!!busy}>
        <div className="episodeWorkbookFile">
          <label>Workbook .xlsx<input type="file" accept=".xlsx" onChange={event => {
            const workbook = event.currentTarget.files?.[0]
            if (workbook) void openFile(workbook)
            event.currentTarget.value = ''
          }}/></label>
          {!file && onLegacyImport && <button type="button" onClick={onLegacyImport}>Buka impor khusus unit</button>}
        </div>
        {file && <>
          <p className="episodeWorkbookMeta">{file.name} · {file.parsed.hasLogbook
            ? file.parsed.logbook.sheet.name + ' · header baris ' + file.parsed.logbook.header
            : 'Workbook Profil tanpa Logbook'}
            {file.parsed.profileSheet && <> · {file.parsed.profileSheet}: {file.parsed.entries.length} indikator episode</>}
          </p>
          {!!file.parsed.entries.length && <p className="episodeWorkbookMeta">Profil di workbook hanya digunakan untuk pratinjau. Upload ini tidak menambah atau mengganti master indikator.</p>}
          {file.parsed.hasLogbook && <details open={!fields.date || !(fields.mrn || fields.episode) || undefined}>
            <summary>Identitas episode dan header Logbook</summary>
            <div className="episodeWorkbookHeaderRow">
              <label>Baris judul kolom
                <select value={matchingHeader} onChange={event => setMatchingHeader(event.target.value)}>
                  {Array.from({length:Math.min(100,file.parsed.logbook.sheet.rowCount)},(_,index)=>index+1)
                    .map(row=><option key={row} value={row}>Baris {row}</option>)}
                </select>
              </label>
              <button type="button" onClick={changeHeader}>Terapkan baris</button>
            </div>
            <div className="episodeWorkbookFields">
              {(Object.keys(fieldLabels) as Array<keyof EpisodeFields>).map(key => <ColumnSelect key={key}
                label={fieldLabels[key]} value={fields[key]} columns={columns} onChange={value => {
                  setFields(current => ({ ...current, [key]: value }))
                  invalidatePreview()
                }}/>)}
            </div>
          </details>}
          {file.parsed.hasLogbook && <section className="episodeWorkbookMappings" aria-label="Pemetaan profil ke Logbook">
            <h4>Kolom respons 1, 2, 3 dan tanpa Code <span>{selectedCount} dari {mappings.length} dipetakan</span></h4>
            {!mappings.length && <p role="status">{admin ? 'Belum ada profil episode. Unggah workbook dengan sheet Profil yang memuat kode dan nama indikator.' : 'Belum ada profil episode aktif. Hubungi Superadmin untuk menerapkan profil workbook.'}</p>}
            {mappings.map(mapping => <div className="episodeWorkbookMapping" key={mapping.key}>
              <div className="episodeWorkbookIndicator">
                <strong>{mapping.title}</strong>
                {mapping.code && <span>{mapping.code}</span>}
              </div>
              {applyProfiles && !mapping.master && <label>Kode indikator<input value={mapping.code}
                onChange={event => updateMapping(mapping.key, { code: event.target.value })}/></label>}
              {applyProfiles && <label>Arah indikator<select value={mapping.direction}
                onChange={event => updateMapping(mapping.key, { direction: event.target.value as ProfileMapping['direction'] })}>
                <option value="">Pilih arah</option>
                <option value="positive">Positif · kode 1</option>
                <option value="negative">Negatif · numerator Code 3; Code 2 pengecualian</option>
              </select></label>}
              <ColumnSelect label={'Kolom Logbook · ' + (mapping.code || mapping.title)}
                value={mapping.column} columns={columns} onChange={value => updateMapping(mapping.key, { column: value })}/>
            </div>)}
          </section>}
        </>}
      </fieldset>
      {sourceNotes.length > 0 && <section className="episodeWorkbookMeta" role="status">
        {sourceNotes.map((note,index)=><p key={index}>{note}</p>)}
      </section>}
      {autofillNotice && <p className="episodeWorkbookSuccess" role="status">{autofillNotice}</p>}
      {!!busy && <p className="episodeWorkbookMeta" role="status">{busy}</p>}
      {error && <p className="episodeWorkbookError" role="alert">{error}</p>}
      {!!preview?.heldRows && <section className="episodeWorkbookError">
        <strong>{preview.heldRows.toLocaleString('id-ID')} baris ditahan untuk koreksi sumber</strong>
        <details><summary>Lihat temuan per baris</summary><ul>{preview.rowIssues.map((issue,index)=><li key={index}>{issue.location}: {issue.message}</li>)}</ul></details>
        {!!preview.rows.length && <label><input type="checkbox" checked={confirmedHeldRows} onChange={event=>setConfirmedHeldRows(event.target.checked)}/> Impor baris yang siap dan sisakan baris di atas untuk ditinjau.</label>}
      </section>}
      {preview && (preview.issues.length ? <div className="episodeWorkbookError" role="alert">
        <strong>Periksa {preview.issues.length} temuan sebelum impor</strong>
        <ul>{preview.issues.map((issue, index) => <li key={index}>{issue.location}: {issue.message}</li>)}</ul>
      </div> : <p className="episodeWorkbookSuccess" role="status">
        {preview.rows.length.toLocaleString('id-ID')} episode siap disimpan · {preview.rows.filter(row=>row.row_payload.record_payload.status==='draft').length.toLocaleString('id-ID')} draf memerlukan rekonsiliasi respons
      </p>)}
    </div>
  </AurekaModal>
}
