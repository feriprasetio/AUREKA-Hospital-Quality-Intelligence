import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSpoSections } from '../lib/aureka/local-documents.ts'

test('browser-only SPO parser retains section boundaries and numbered procedures', () => {
  const source = [
    'PENGERTIAN',
    'Tata cara pencegahan infeksi.',
    'TUJUAN',
    'Mengurangi risiko penularan.',
    'KEBIJAKAN',
    'Kebijakan mutu rumah sakit.',
    'PROSEDUR',
    '1. Petugas mencuci tangan.',
    '2. Gunakan alat pelindung sesuai risiko.',
    'UNIT TERKAIT',
    'IGD',
    'ICU',
  ].join('\n')
  const data = parseSpoSections(source)
  assert.equal(data.understanding, 'Tata cara pencegahan infeksi.')
  assert.equal(data.purpose, 'Mengurangi risiko penularan.')
  assert.equal(data.policy, 'Kebijakan mutu rumah sakit.')
  assert.deepEqual(data.procedure_steps.map(row => row.content),[
    'Petugas mencuci tangan.',
    'Gunakan alat pelindung sesuai risiko.',
  ])
  assert.deepEqual(data.related_units,['IGD','ICU'])
})

test('browser-only parser accepts inline headings without inventing missing content', () => {
  const data = parseSpoSections('Pengertian: Prinsip keselamatan\nTujuan: Menurunkan kejadian\nProsedur: Verifikasi identitas')
  assert.equal(data.understanding, 'Prinsip keselamatan')
  assert.equal(data.purpose, 'Menurunkan kejadian')
  assert.equal(data.procedure_steps[0].content, 'Verifikasi identitas')
  assert.equal(data.policy, '')
})
