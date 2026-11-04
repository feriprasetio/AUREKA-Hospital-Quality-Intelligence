import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const warnings = []

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
  } catch (error) {
    failures.push(`${relativePath}: JSON tidak valid atau tidak dapat dibaca (${error instanceof Error ? error.message : String(error)})`)
    return null
  }
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const layouts = await readJson('data/quality-audit-layout-2026.json')
if (!Array.isArray(layouts) || layouts.length === 0) {
  failures.push('data/quality-audit-layout-2026.json: harus berupa array layout tidak kosong.')
} else {
  const roomIds = new Set()
  for (const [index, layout] of layouts.entries()) {
    const prefix = `data/quality-audit-layout-2026.json[${index}]`
    if (!Number.isInteger(layout?.roomId) || layout.roomId <= 0) {
      failures.push(`${prefix}.roomId: harus integer positif.`)
    } else if (roomIds.has(layout.roomId)) {
      failures.push(`${prefix}.roomId: duplikat ${layout.roomId}.`)
    } else {
      roomIds.add(layout.roomId)
    }

    for (const key of ['fields', 'indicators']) {
      const headers = layout?.[key]
      if (!Array.isArray(headers)) {
        failures.push(`${prefix}.${key}: harus berupa array.`)
        continue
      }
      const seen = new Set()
      for (const header of headers) {
        if (typeof header !== 'string' || !header.trim()) {
          failures.push(`${prefix}.${key}: ditemukan header kosong/bukan string.`)
          continue
        }
        const normalized = normalizeHeader(header)
        if (seen.has(normalized)) failures.push(`${prefix}.${key}: header duplikat setelah normalisasi: "${header}".`)
        seen.add(normalized)
      }
    }

    if (Array.isArray(layout?.fields) && Array.isArray(layout?.indicators)) {
      const fieldSet = new Set(layout.fields.map(normalizeHeader))
      for (const header of layout.indicators) {
        if (fieldSet.has(normalizeHeader(header))) {
          failures.push(`${prefix}: "${header}" muncul sebagai field dan indikator sekaligus.`)
        }
      }
    }
  }
}

const localProfiles = await readJson('data/quality_indicators_2026.json')
if (localProfiles !== null && !Array.isArray(localProfiles)) {
  failures.push('data/quality_indicators_2026.json: harus array; array kosong sah karena master runtime berasal dari Supabase.')
}
if (Array.isArray(localProfiles)) {
  for (const [index, item] of localProfiles.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      failures.push(`data/quality_indicators_2026.json[${index}]: profil harus berupa objek.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Validasi fixture profil master per chunk (data/quality-profile-2026).
// Fixture ini adalah korpus QA pemetaan indikator. Aturan yang diperiksa:
//   1. Struktur dasar tiap profil (profile_year, code, room_id, target).
//   2. Keunikan kombinasi room_id + code lintas seluruh chunk.
//   3. Setiap indikator berbasis opsi wajib punya minimal satu opsi numerator:true.
//      Tanpa itu, capaian indikator selalu 0%/100% semu — pernah terjadi pada
//      keluarga indikator "kekosongan" (chunk-03/04/11) sebelum perbaikan 2026-11.
// ---------------------------------------------------------------------------
const profileDir = path.join(root, 'data', 'quality-profile-2026')
let chunkFiles = []
try {
  chunkFiles = (await readdir(profileDir)).filter((name) => /^chunk-\d+\.json$/.test(name)).sort()
} catch {
  warnings.push('data/quality-profile-2026: direktori fixture tidak ditemukan; validasi chunk dilewati.')
}

const seenProfileKeys = new Map()
let profileCount = 0
for (const file of chunkFiles) {
  const relativePath = `data/quality-profile-2026/${file}`
  const chunks = await readJson(relativePath)
  if (!Array.isArray(chunks)) {
    failures.push(`${relativePath}: harus berupa array profil.`)
    continue
  }
  for (const [index, profile] of chunks.entries()) {
    const prefix = `${relativePath}[${index}]`
    profileCount += 1
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      failures.push(`${prefix}: profil harus berupa objek.`)
      continue
    }
    if (!Number.isInteger(profile.profile_year) || profile.profile_year < 2020 || profile.profile_year > 2200) {
      failures.push(`${prefix}.profile_year: harus integer tahun yang valid.`)
    }
    if (typeof profile.code !== 'string' || !profile.code.trim()) {
      failures.push(`${prefix}.code: kode indikator wajib ada.`)
    }
    if (!Number.isInteger(profile.room_id) || profile.room_id <= 0) {
      failures.push(`${prefix}.room_id: harus integer positif.`)
    }
    const hasTargetText = typeof profile.target_text === 'string' && profile.target_text.trim()
    const hasTargetValue = profile.target_value !== null && profile.target_value !== undefined && profile.target_value !== ''
    if (!hasTargetText && !hasTargetValue) {
      failures.push(`${prefix}: profil tanpa target (target_text/target_value) tidak dapat dinilai.`)
    }
    if (typeof profile.title !== 'string') {
      warnings.push(`${prefix}.title: bukan string.`)
    }

    const key = `${profile.room_id}|${profile.code}`
    if (seenProfileKeys.has(key)) {
      failures.push(`${prefix}: kombinasi room_id+code "${key}" duplikat dengan ${seenProfileKeys.get(key)}.`)
    } else {
      seenProfileKeys.set(key, relativePath)
    }

    const options = Array.isArray(profile.options_json) ? profile.options_json : []
    const scoreable = options.filter((option) => option && typeof option === 'object' && !option.review_required)
    for (const [optionIndex, option] of scoreable.entries()) {
      if (typeof option.label !== 'string' || !option.label.trim()) {
        failures.push(`${prefix}.options_json[${optionIndex}]: opsi tanpa label.`)
      }
      if (typeof option.denominator !== 'boolean') {
        warnings.push(`${prefix}.options_json[${optionIndex}]: denominator bukan boolean.`)
      }
    }
    if (scoreable.length >= 2 && !scoreable.some((option) => option.numerator === true)) {
      failures.push(`${prefix}: tidak ada opsi numerator:true — capaian indikator "${String(profile.code)}" akan selalu 0% (kepatuhan palsu).`)
    }
  }
}

// Kesenjangan penomoran chunk hanya menjadi peringatan (bukan kegagalan) karena
// repo memang hanya menyimpan sebagian korpus fixture.
if (chunkFiles.length > 0) {
  const numbers = chunkFiles.map((name) => Number(name.match(/^chunk-(\d+)\.json$/)[1]))
  const missing = []
  for (let i = numbers[0]; i <= numbers[numbers.length - 1]; i++) {
    if (!numbers.includes(i)) missing.push(i)
  }
  if (missing.length > 0) {
    warnings.push(`data/quality-profile-2026: chunk ${missing.join(', ')} tidak ada di repo (hanya informasi).`)
  }
}

for (const warning of warnings) console.warn(`! ${warning}`)

if (failures.length > 0) {
  console.error('Validasi metadata/layout AUREKA gagal:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Validasi AUREKA lulus: ${layouts.length} layout, ${new Set(layouts.map((item) => item.roomId)).size} unit unik, ` +
      `${Array.isArray(localProfiles) ? localProfiles.length : 0} profil fixture lokal, dan ${profileCount} profil master ` +
      `pada ${chunkFiles.length} chunk (${seenProfileKeys.size} kombinasi room+code unik).`,
  )
}
