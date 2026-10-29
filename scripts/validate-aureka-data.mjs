import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

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

if (failures.length > 0) {
  console.error('Validasi metadata/layout AUREKA gagal:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Validasi AUREKA lulus: ${layouts.length} layout, ${new Set(layouts.map(item => item.roomId)).size} unit unik, dan ${Array.isArray(localProfiles) ? localProfiles.length : 0} profil fixture lokal.`)
}
