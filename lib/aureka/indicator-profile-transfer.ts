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
