import test from 'node:test'
import assert from 'node:assert/strict'
import { qrMatrix, qrPdfCommands } from '../lib/aureka/qr-code.ts'
import { NATIONAL_INDICATORS } from '../lib/aureka/national-indicators.ts'

test('13 indikator nasional adalah katalog unik', () => {
  assert.equal(NATIONAL_INDICATORS.length,13)
  assert.equal(new Set(NATIONAL_INDICATORS.map(([code])=>code)).size,13)
})
test('QR v10-L menciptakan pola finder dan modul matriks yang benar', () => {
  const code='https://example.org/#cert/CERT-1234567890ABCDEF1234567890ABCDEF'
  const matrix=qrMatrix(code)
  assert.equal(matrix.length,57)
  assert.ok(matrix.every(row=>row.length===57))
  assert.equal(matrix[3][3],true)
  assert.equal(matrix[3][53],true)
  assert.equal(matrix[53][3],true)
  assert.equal(matrix[0][0],true)
  assert.equal(matrix[1][1],false)
  assert.ok(matrix.flat().filter(Boolean).length>700)
  const drawing=qrPdfCommands(code,710,350,110)
  assert.ok(drawing.length>100)
  assert.equal(drawing[0],'0 0 0 rg')
  assert.ok(drawing.at(-1).includes(' re f'))
})
test('QR tidak menerima payload lebih panjang dari kapasitas', () => {
  assert.doesNotThrow(()=>qrMatrix('A'.repeat(271)))
  assert.throws(()=>qrMatrix('A'.repeat(272)),/terlalu panjang/)
})
