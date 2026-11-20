import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encodeQr, qrSvgPath } from '../lib/qr/qr.ts'

test('ukuran versi sesuai panjang teks dan pola pencari di tiga sudut', () => {
  const m = encodeQr('https://feriprasetio.github.io/AUREKA-Hospital-Quality-Intelligence/lapor/?t=Ab3dEf9hJk2mNp4qRs')
  const n = m.length
  assert.equal((n - 17) % 4, 0)
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.equal(m[y][x + i], true); assert.equal(m[y + 6][x + i], true) }
    assert.equal(m[y + 1][x + 1], false); assert.equal(m[y + 3][x + 3], true)
  }
  assert.equal(qrSvgPath(m).size, n + 8)
})

test('teks terlalu panjang ditolak', () => {
  assert.throws(() => encodeQr('x'.repeat(400)))
})


test('public incident QR form handles backend failures without exposing raw service errors', () => {
  const source = readFileSync(new URL('../components/patient-safety/PublicIncidentReport.tsx', import.meta.url), 'utf8')
  assert.match(source, /toUserFacingError/)
  assert.match(source, /state === 'unavailable'/)
  assert.match(source, /catch \(error\)/)
  assert.doesNotMatch(source, /setErr\(error\.message/)
})
