import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const layouts = readJson('../data/quality-audit-layout-2026.json')
const aliases = readJson('../data/quality-audit-profile-aliases-2026.json')
const profiles = Array.from({ length: 12 }, (_, index) => {
  const file = '../data/quality-profile-2026/chunk-' + String(index + 1).padStart(2, '0') + '.json'
  return readJson(file)
}).flat()

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchingProfiles(roomId, header) {
  const roomProfiles = profiles.filter((profile) => Number(profile.room_id) === Number(roomId))
  const key = normalize(header)
  const explicitCode = aliases[String(roomId)]?.[key]
  if (explicitCode) return roomProfiles.filter((profile) => String(profile.code) === String(explicitCode))
  const stripDomain = (value) => value.replace(/^(stemi|snh)\s*/, '').trim()
  return roomProfiles.filter((profile) => {
    const label = String(profile.schema_json?.header_label ?? '').trim() || String(profile.title ?? '').trim()
    const normalizedLabel = normalize(label)
    return !!normalizedLabel && (key === normalizedLabel || stripDomain(key) === stripDomain(normalizedLabel))
  })
}

test('2026 profile alias registry points to an existing profile in the same unit', () => {
  assert.equal(profiles.length, 189)
  for (const [room, roomAliases] of Object.entries(aliases)) {
    const layout = layouts.find((item) => Number(item.roomId) === Number(room))
    assert.ok(layout, 'layout for room ' + room + ' must exist')
    for (const [header, code] of Object.entries(roomAliases)) {
      assert.ok(layout.indicators.some((item) => normalize(item) === header), 'alias header must exist in room ' + room + ': ' + header)
      const targets = profiles.filter((profile) => Number(profile.room_id) === Number(room) && String(profile.code) === String(code))
      assert.equal(targets.length, 1, 'alias target must resolve once: room ' + room + ', ' + header + ' -> ' + code)
    }
  }
})

test('each 2026 logbook template resolves uniquely except explicitly documented master gaps', () => {
  const expectedUnmatched = {
    18: ['Kekosongan Obat'],
    19: ['Kekosongan Obat'],
    20: ['Kekosongan Obat'],
    22: [
      'Demam 2–7H + Trombositopenia + ↑Ht',
      'DR ≥1×/Hari',
      'Kristaloid ≥500 cc/8J',
      'Tidak DSS',
    ],
  }
  const observedUnmatched = {}
  for (const layout of layouts) {
    const usedCodes = new Set()
    const unmatched = []
    for (const header of layout.indicators) {
      const matches = matchingProfiles(layout.roomId, header)
      assert.ok(matches.length <= 1, 'header must never match multiple profiles: room ' + layout.roomId + ', ' + header)
      if (!matches.length) {
        unmatched.push(header)
        continue
      }
      assert.ok(!usedCodes.has(String(matches[0].code)), 'one profile must not be reused for two template headings: room ' + layout.roomId + ', ' + matches[0].code)
      usedCodes.add(String(matches[0].code))
    }
    if (unmatched.length) observedUnmatched[layout.roomId] = unmatched
  }
  assert.deepEqual(observedUnmatched, expectedUnmatched)
})

test('aggregate activity profiles and omitted canonical pharmacy/isolation/AMS profiles have logbook controls', () => {
  const byRoom = new Map(layouts.map((layout) => [Number(layout.roomId), layout]))
  assert.deepEqual(byRoom.get(16).indicators, ['Kepatuhan Kebersihan Tangan'])
  assert.deepEqual(byRoom.get(17).indicators, ['Indeks Kepuasan Pasien'])
  assert.ok(byRoom.get(5).indicators.includes('Dead Stock'))
  assert.ok(byRoom.get(24).indicators.includes('Transfer IGD'))
  assert.ok(byRoom.get(35).indicators.includes('Ketepatan Penggunaan Antibiotik'))
})
