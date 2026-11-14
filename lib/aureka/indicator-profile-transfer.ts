import ExcelJS from 'exceljs-hardened'

export type IndicatorProfileTransferScope = {
  room_id: number | null
  unit_name: string
}

export type IndicatorProfileBackup = {
  format: 'AUREKA_INDICATOR_PROFILE_SET'
  schema_version: 1
  exported_at: string
  profile_year: number
  scope: IndicatorProfileTransferScope
  profiles: Array<Record<string, unknown> & {
    source_id: string
    source_code: string
    code: string
    room_id: number
    unit_name: string
    title: string
    measurement_grain: string
    schema_json: Record<string, unknown>
    options_json: unknown[]
  }>
}

const FORMAT = 'AUREKA_INDICATOR_PROFILE_SET'
const MEASUREMENT_GRAINS = new Set([
  'patient_episode',
  'provider_day',
  'daily_metric',
  'event',
  'activity',
  'aggregate',
])

const TRANSFER_FIELDS = [
  'code',
  'room_id',
  'unit_name',
  'title',
  'indicator_type',
  'category',
  'unit_of_measure',
  'target_text',
  'target_operator',
  'target_value',
  'numerator_definition',
  'denominator_definition',
  'measurement_grain',
  'schema_json',
  'options_json',
] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildIndicatorProfileBackup(input: {
  profileYear: number
  scopeRoomId: number | null
  scopeName: string
  profiles: Array<Record<string, any>>
}): IndicatorProfileBackup {
  if (!Number.isInteger(input.profileYear) || input.profileYear < 1900 || input.profileYear > 2200) {
    throw new Error('Tahun profil tidak valid.')
  }

  const activeProfiles = input.profiles.filter(
    (profile) => profile?.is_active === true && profile?.status === 'published',
  )

  if (!activeProfiles.length) {
    throw new Error('Tidak ada profil indikator aktif yang dapat diekspor pada cakupan ini.')
  }

  const profiles = activeProfiles.map((profile) => {
    const roomId = Number(profile.room_id)
    if (!Number.isInteger(roomId) || roomId < 1) {
      throw new Error('Ada profil dengan identitas unit yang tidak valid. Perbaiki profil sebelum ekspor.')
    }
    if (input.scopeRoomId !== null && roomId !== input.scopeRoomId) {
      throw new Error('Data profil yang dimuat tidak sesuai dengan unit yang dipilih.')
    }

    const row: Record<string, unknown> = {
      source_id: String(profile.id ?? ''),
      source_code: String(profile.code ?? ''),
    }
    for (const field of TRANSFER_FIELDS) {
      row[field] = profile[field] ?? null
    }
    row.room_id = roomId
    row.code = cleanText(profile.code)
    row.unit_name = cleanText(profile.unit_name)
    row.title = cleanText(profile.title)
    row.measurement_grain = cleanText(profile.measurement_grain) || 'activity'
    row.schema_json = isObject(profile.schema_json) ? profile.schema_json : {}
    row.options_json = Array.isArray(profile.options_json) ? profile.options_json : []
    return row as IndicatorProfileBackup['profiles'][number]
  })

  const duplicateCodes = new Set<string>()
  for (const profile of profiles) {
    const key = profile.code
    if (duplicateCodes.has(key)) {
      throw new Error('Terdapat kode indikator ganda dalam profil aktif. Perbaiki sebelum ekspor.')
    }
    duplicateCodes.add(key)
  }

  return {
    format: FORMAT,
    schema_version: 1,
    exported_at: new Date().toISOString(),
    profile_year: input.profileYear,
    scope: {
      room_id: input.scopeRoomId,
      unit_name: input.scopeName,
    },
    profiles,
  }
}

export function parseIndicatorProfileBackup(value: unknown): IndicatorProfileBackup {
  if (!isObject(value) || value.format !== FORMAT || value.schema_version !== 1) {
    throw new Error('Format berkas tidak dikenali. Gunakan berkas ekspor Profil Indikator AUREKA versi 1.')
  }

  const year = Number(value.profile_year)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error('Tahun sumber di dalam berkas tidak valid.')
  }

  if (!isObject(value.scope)) {
    throw new Error('Informasi cakupan unit pada berkas tidak lengkap.')
  }

  const rawScopeRoomId = value.scope.room_id
  const scopeRoomId = rawScopeRoomId === null ? null : Number(rawScopeRoomId)
  if (scopeRoomId !== null && (!Number.isInteger(scopeRoomId) || scopeRoomId < 1)) {
    throw new Error('Cakupan unit pada berkas tidak valid.')
  }

  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    throw new Error('Berkas tidak memiliki profil indikator. Impor kosong ditolak agar profil aktif tidak terhapus.')
  }

  const seenCodes = new Set<string>()
  const seenSourceIds = new Set<string>()
  const profiles = value.profiles.map((raw, index) => {
    if (!isObject(raw)) {
      throw new Error('Baris profil ke-' + (index + 1) + ' bukan objek metadata yang valid.')
    }

    const code = cleanText(raw.code)
    const title = cleanText(raw.title)
    const roomId = Number(raw.room_id)
    const grain = cleanText(raw.measurement_grain) || 'activity'
    if (!code || !title) {
      throw new Error('Kode dan nama indikator wajib diisi pada baris ke-' + (index + 1) + '.')
    }
    if (!Number.isInteger(roomId) || roomId < 1) {
      throw new Error('Unit pemilik tidak valid pada indikator ' + code + '.')
    }
    if (scopeRoomId !== null && roomId !== scopeRoomId) {
      throw new Error('Indikator ' + code + ' tidak sesuai dengan cakupan unit pada berkas.')
    }
    if (!MEASUREMENT_GRAINS.has(grain)) {
      throw new Error('Metode pengukuran indikator ' + code + ' tidak dikenali.')
    }
    if (!isObject(raw.schema_json) || !Array.isArray(raw.options_json)) {
      throw new Error('Struktur instrumen indikator ' + code + ' tidak valid.')
    }
    if (seenCodes.has(code)) {
      throw new Error('Kode indikator ' + code + ' muncul lebih dari satu kali. Impor dibatalkan.')
    }
    seenCodes.add(code)

    const sourceId = cleanText(raw.source_id)
    if (sourceId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
        throw new Error('Identitas sumber indikator ' + code + ' tidak valid.')
      }
      if (seenSourceIds.has(sourceId.toLowerCase())) {
        throw new Error('Identitas sumber indikator ganda ditemukan pada berkas.')
      }
      seenSourceIds.add(sourceId.toLowerCase())
    }

    const targetValue = raw.target_value === null || raw.target_value === undefined || raw.target_value === ''
      ? null
      : Number(raw.target_value)
    if (targetValue !== null && !Number.isFinite(targetValue)) {
      throw new Error('Nilai target indikator ' + code + ' harus berupa angka atau kosong.')
    }

    return {
      source_id: sourceId,
      source_code: cleanText(raw.source_code) || code,
      code,
      room_id: roomId,
      unit_name: cleanText(raw.unit_name),
      title,
      indicator_type: cleanText(raw.indicator_type) || null,
      category: cleanText(raw.category) || null,
      unit_of_measure: cleanText(raw.unit_of_measure) || null,
      target_text: cleanText(raw.target_text) || null,
      target_operator: cleanText(raw.target_operator) || '=',
      target_value: targetValue,
      numerator_definition: cleanText(raw.numerator_definition) || null,
      denominator_definition: cleanText(raw.denominator_definition) || null,
      measurement_grain: grain,
      schema_json: raw.schema_json,
      options_json: raw.options_json,
    }
  })

  return {
    format: FORMAT,
    schema_version: 1,
    exported_at: cleanText(value.exported_at),
    profile_year: year,
    scope: {
      room_id: scopeRoomId,
      unit_name: cleanText(value.scope.unit_name) || (scopeRoomId === null ? 'Semua unit' : 'Unit ' + scopeRoomId),
    },
    profiles,
  }
}


const XLSX_PROFILE_SHEET = 'Profil Indikator'
const XLSX_META_SHEET = 'Metadata'
const XLSX_HELP_SHEET = 'Petunjuk'
const XLSX_COLUMNS = [
  ['source_id', 'ID Sumber (jangan diubah)'],
  ['source_code', 'Kode Sumber (jangan diubah)'],
  ['code', 'Kode Indikator'],
  ['room_id', 'ID Unit'],
  ['unit_name', 'Nama Unit'],
  ['title', 'Nama Indikator'],
  ['indicator_type', 'Program'],
  ['category', 'Kategori'],
  ['unit_of_measure', 'Satuan'],
  ['target_text', 'Target'],
  ['target_operator', 'Operator Target'],
  ['target_value', 'Nilai Target'],
  ['numerator_definition', 'Definisi Pembilang'],
  ['denominator_definition', 'Definisi Penyebut'],
  ['measurement_grain', 'Grain Pengukuran'],
  ['schema_json', 'Konfigurasi Teknis JSON (jangan diubah bila tidak memahami)'],
  ['options_json', 'Opsi Instrumen JSON (jangan diubah bila tidak memahami)'],
] as const

function excelCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) {
      throw new Error('Berkas Excel tidak boleh berisi formula pada kolom data profil. Gunakan nilai tetap.')
    }
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('result' in value) return value.result
    throw new Error('Jenis isi sel Excel tidak didukung. Gunakan teks atau angka biasa.')
  }
  return value
}

function jsonCell(value: unknown, field: string, rowNumber: number): unknown {
  const raw = excelCellValue(value as ExcelJS.CellValue)
  if (raw === null || raw === undefined || raw === '') {
    throw new Error(field + ' wajib diisi pada baris Excel ' + rowNumber + '.')
  }
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(field + ' bukan JSON yang valid pada baris Excel ' + rowNumber + '.')
  }
}

export async function buildIndicatorProfileXlsx(backup: IndicatorProfileBackup): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AUREKA Hospital Quality Intelligence'
  workbook.subject = 'Transfer Profil Indikator Mutu'
  workbook.title = 'Profil Indikator AUREKA ' + backup.profile_year
  workbook.created = new Date()
  workbook.modified = new Date()

  const meta = workbook.addWorksheet(XLSX_META_SHEET)
  meta.columns = [{ header: 'Parameter', key: 'key', width: 28 }, { header: 'Nilai', key: 'value', width: 48 }]
  meta.addRows([
    ['Format', FORMAT],
    ['Versi Format', 1],
    ['Tahun Profil', backup.profile_year],
    ['ID Cakupan Unit', backup.scope.room_id ?? 'ALL'],
    ['Nama Cakupan', backup.scope.unit_name],
    ['Diekspor Pada', backup.exported_at],
    ['Jumlah Profil', backup.profiles.length],
  ])
  meta.getRow(1).font = { bold: true }
  meta.views = [{ state: 'frozen', ySplit: 1 }]

  const sheet = workbook.addWorksheet(XLSX_PROFILE_SHEET)
  sheet.columns = XLSX_COLUMNS.map(([key, header]) => ({
    header,
    key,
    width: key === 'title' || key.endsWith('_definition') ? 38
      : key.endsWith('_json') ? 54
        : header.length > 20 ? 30 : 20,
  }))
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A7E' } }
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
  sheet.autoFilter = { from: 'A1', to: String.fromCharCode(64 + XLSX_COLUMNS.length) + '1' }

  for (const profile of backup.profiles) {
    const row: Record<string, unknown> = {}
    for (const [key] of XLSX_COLUMNS) {
      const value = profile[key]
      row[key] = key === 'schema_json' || key === 'options_json'
        ? JSON.stringify(value ?? (key === 'schema_json' ? {} : []))
        : value ?? null
    }
    sheet.addRow(row)
  }

  const help = workbook.addWorksheet(XLSX_HELP_SHEET)
  help.columns = [{ header: 'Bagian', key: 'section', width: 28 }, { header: 'Petunjuk', key: 'instruction', width: 110 }]
  help.addRows([
    ['Tujuan', 'Workbook ini digunakan untuk impor dan ekspor Profil Indikator AUREKA. Simpan kembali sebagai .xlsx.'],
    ['Edit data', 'Satu baris pada sheet Profil Indikator mewakili satu indikator. Jangan mengubah nama sheet dan judul kolom.'],
    ['Wajib diisi', 'Kode Indikator, ID Unit, Nama Unit, Nama Indikator, dan Grain Pengukuran.'],
    ['Identitas sumber', 'Kolom ID Sumber dan Kode Sumber dipakai untuk pencocokan riwayat audit. Jangan diubah kecuali memahami dampaknya.'],
    ['Konfigurasi teknis', 'Kolom konfigurasi JSON menjaga metadata instrumen yang belum direpresentasikan sebagai kolom sederhana. Jangan dihapus atau dikosongkan.'],
    ['Target', 'Nilai Target harus berupa angka atau kosong. Target tekstual dapat ditulis pada kolom Target.'],
    ['Grain Pengukuran', 'Gunakan salah satu: patient_episode, provider_day, daily_metric, event, activity, aggregate.'],
    ['Penggantian', 'Impor mengganti seluruh profil aktif/draf pada tahun dan cakupan yang dipilih. Pastikan semua baris yang diperlukan ada.'],
    ['Data audit', 'Data audit tidak dihapus. Sistem melakukan pemetaan ulang identitas profil; konflik akan membatalkan transaksi.'],
    ['Keamanan', 'Jangan menambahkan formula pada sel data. Gunakan nilai teks/angka biasa. Impor kosong ditolak.'],
  ])
  help.getRow(1).font = { bold: true }
  help.views = [{ state: 'frozen', ySplit: 1 }]

  const output = await workbook.xlsx.writeBuffer()
  return new Uint8Array(output as ArrayBuffer)
}

export async function parseIndicatorProfileXlsx(data: ArrayBuffer | Uint8Array): Promise<IndicatorProfileBackup> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data as unknown as Buffer)
  const meta = workbook.getWorksheet(XLSX_META_SHEET)
  const sheet = workbook.getWorksheet(XLSX_PROFILE_SHEET)
  if (!meta || !sheet) {
    throw new Error('Workbook harus memiliki sheet Metadata dan Profil Indikator. Gunakan template ekspor AUREKA.')
  }

  const metadata = new Map<string, unknown>()
  meta.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return
    const key = excelCellValue(row.getCell(1).value as ExcelJS.CellValue)
    const value = excelCellValue(row.getCell(2).value as ExcelJS.CellValue)
    if (typeof key === 'string' && key.trim()) metadata.set(key.trim(), value)
  })
  if (metadata.get('Format') !== FORMAT || Number(metadata.get('Versi Format')) !== 1) {
    throw new Error('Format workbook tidak dikenali. Gunakan template Profil Indikator AUREKA versi 1.')
  }
  const year = Number(metadata.get('Tahun Profil'))
  const rawScope = metadata.get('ID Cakupan Unit')
  const scopeRoomId = rawScope === 'ALL' || rawScope === null || rawScope === undefined || rawScope === ''
    ? null : Number(rawScope)
  const headers = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const value = excelCellValue(cell.value as ExcelJS.CellValue)
    if (typeof value === 'string' && value.trim()) headers.set(value.trim(), colNumber)
  })
  for (const [, header] of XLSX_COLUMNS) {
    if (!headers.has(header)) throw new Error('Kolom "' + header + '" tidak ditemukan pada sheet Profil Indikator.')
  }

  const rows: Array<Record<string, unknown>> = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values: Record<string, unknown> = {}
    for (const [key, header] of XLSX_COLUMNS) {
      const col = headers.get(header)!
      values[key] = excelCellValue(row.getCell(col).value as ExcelJS.CellValue)
    }
    if (Object.values(values).every((value) => value === null || value === undefined || value === '')) return
    values.schema_json = jsonCell(values.schema_json, 'Konfigurasi Teknis JSON', rowNumber)
    values.options_json = jsonCell(values.options_json, 'Opsi Instrumen JSON', rowNumber)
    rows.push(values)
  })

  const exportedAt = metadata.get('Diekspor Pada')
  return parseIndicatorProfileBackup({
    format: FORMAT,
    schema_version: 1,
    exported_at: typeof exportedAt === 'string' ? exportedAt : '',
    profile_year: year,
    scope: {
      room_id: scopeRoomId,
      unit_name: String(metadata.get('Nama Cakupan') || (scopeRoomId === null ? 'Semua unit' : 'Unit ' + scopeRoomId)),
    },
    profiles: rows,
  })
}
