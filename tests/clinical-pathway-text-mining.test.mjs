import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeClinicalPathwayText } from '../lib/clinical-pathway/text-mining.ts'

const item = (id, label, concept_type, aliases = [label], extra = {}) => ({
  id, label, profession: 'Perawat', stage: 'Asesmen', text_mining: {
    aliases, concept_type, requires_action_evidence: true, expected_assertion: 'presence', ...extra,
  },
})

test('completed procedure evidence is mapped to the correct dated inpatient day', () => {
  const items = [item('ct', 'CT scan kepala', 'radiology', ['CT scan kepala'])]
  const result = analyzeClinicalPathwayText({
    text: '10 November 2026, 09:15\nO: CT scan kepala telah dilakukan, hasil menunjukkan tidak tampak perdarahan.',
    admissionDate: '2026-11-10',
    days: ['1', '2', '3'],
    items,
  })
  assert.equal(result.suggestions.length, 1)
  assert.equal(result.suggestions[0].status, 'completed')
  assert.equal(result.suggestions[0].day, '1')
  assert.equal(result.suggestions[0].date, '2026-11-10')
})

test('future plan is not treated as completed implementation', () => {
  const items = [item('physio', 'Fisioterapi', 'clinical_activity', ['fisioterapi'])]
  const result = analyzeClinicalPathwayText({ text: '10 November 2026\nP: Fisioterapi direncanakan besok setelah kondisi stabil.', admissionDate: '2026-11-10', days: ['1', '2', '3'], items })
  assert.equal(result.suggestions[0].status, 'planned')
  assert.equal(result.suggestions[0].day, '1')
})

test('negated evidence is distinguished from a completed action', () => {
  const items = [item('ct', 'CT scan kepala', 'radiology', ['CT scan kepala'])]
  const result = analyzeClinicalPathwayText({ text: '10 November 2026\nCT scan kepala tidak dilakukan karena pasien menolak.', admissionDate: '2026-11-10', days: ['1', '2'], items })
  assert.equal(result.suggestions[0].status, 'negated')
})

test('an absence outcome is completed only when the chart documents the expected negative finding', () => {
  const items = [item('bleeding', 'Tidak ada perdarahan pervaginam', 'outcome', ['perdarahan pervaginam'], { expected_assertion: 'absence', requires_action_evidence: false })]
  const negative = analyzeClinicalPathwayText({ text: '10 November 2026\nO: Tidak ada perdarahan pervaginam.', admissionDate: '2026-11-10', days: ['1', '2'], items })
  const positive = analyzeClinicalPathwayText({ text: '10 November 2026\nO: Perdarahan pervaginam ditemukan.', admissionDate: '2026-11-10', days: ['1', '2'], items })
  assert.equal(negative.suggestions[0].status, 'completed')
  assert.equal(positive.suggestions[0].status, 'negated')
})

test('medication names require administration evidence', () => {
  const items = [item('drug', 'Ondansetron', 'medication', ['ondansetron'])]
  const mention = analyzeClinicalPathwayText({ text: '10 November 2026\nP: Terapi ondansetron bila mual.', admissionDate: '2026-11-10', days: ['1'], items })
  const given = analyzeClinicalPathwayText({ text: '10 November 2026\nO: Ondansetron diberikan 4 mg IV.', admissionDate: '2026-11-10', days: ['1'], items })
  assert.notEqual(mention.suggestions[0].status, 'completed')
  assert.equal(given.suggestions[0].status, 'completed')
})

test('explicit Indonesian date and explicit day headers are supported', () => {
  const items = [item('assessment', 'Asesmen awal', 'assessment', ['asesmen awal'])]
  const byDate = analyzeClinicalPathwayText({ text: '11 November 2026, 10:00\nAsesmen awal telah dilengkapi.', admissionDate: '2026-11-10', days: ['1', '2', '3'], items })
  const byDay = analyzeClinicalPathwayText({ text: 'Hari ke-3\nAsesmen awal telah dilengkapi.', days: ['1', '2', '3'], items })
  assert.equal(byDate.suggestions[0].day, '2')
  assert.equal(byDay.suggestions[0].day, '3')
})

test('absence of dates does not silently assign Day 1', () => {
  const items = [item('assessment', 'Asesmen awal', 'assessment', ['asesmen awal'])]
  const result = analyzeClinicalPathwayText({ text: 'S: Pasien sadar.\nO: Asesmen awal telah dilengkapi.', admissionDate: '2026-11-10', days: ['1', '2'], items })
  assert.equal(result.suggestions[0].day, null)
  assert.equal(result.undated_count, 1)
})

test('contradictory same-day evidence is demoted to manual review', () => {
  const items = [item('assessment', 'Asesmen awal', 'assessment', ['asesmen awal'])]
  const result = analyzeClinicalPathwayText({
    text: '10 November 2026\nAsesmen awal telah dilengkapi.\nAsesmen awal belum dilakukan ulang.',
    admissionDate: '2026-11-10', days: ['1', '2'], items,
  })
  assert.equal(result.suggestions[0].status, 'uncertain')
})
