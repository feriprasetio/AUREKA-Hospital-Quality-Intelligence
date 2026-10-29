import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateInclusiveDurationDays, matchLogbookOption, summarizeOptionResponses } from '../lib/aureka/complaint-logbook.ts'

const responseOptions = [
  { label: 'Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau)', code: 1, numerator: true, denominator: true },
  { label: 'Respon Terlambat (Masalah Kompleks)', code: 2, numerator: false, denominator: true },
]
const comprehensionOptions = [
  { label: 'Pasien Mengerti (Verifikasi pemahaman/Teach-back berhasil)', code: 1, numerator: false, denominator: true },
  { label: 'Pasien Tidak Mengerti (Petugas menjelaskan terlalu cepat)', code: 3, numerator: true, denominator: true },
]

test('matches an Excel dropdown value when the source adds the Code suffix', () => {
  const option = matchLogbookOption('Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau) (Code 1)', responseOptions)
  assert.equal(option?.code, 1)
  assert.equal(option?.label, responseOptions[0].label)
})

test('does not choose an ambiguous label when duplicate labels have different codes', () => {
  const options = [
    { label: 'Status', code: 1 },
    { label: 'Status', code: 2 },
  ]
  assert.equal(matchLogbookOption('Status', options), null)
  assert.equal(matchLogbookOption('Status (Code 2)', options)?.code, 2)
})

test('duration follows the Excel inclusive timestamp formula, not rounded whole days', () => {
  const duration = calculateInclusiveDurationDays('2026-01-01T12:00', '2026-01-01T13:00')
  assert.ok(duration != null)
  assert.ok(Math.abs(duration - (1 + 1 / 24)) < 1e-9)
  assert.equal(calculateInclusiveDurationDays('2026-01-01', ''), null)
  assert.equal(calculateInclusiveDurationDays('not-a-date', '2026-01-02'), null)
})

test('summarizes numerator and denominator flags from indicator choice metadata', () => {
  const responseSummary = summarizeOptionResponses(
    Array.from({ length: 27 }, () => ({ answer: responseOptions[0].label, code: 1 })),
    responseOptions,
  )
  assert.equal(responseSummary.numerator, 27)
  assert.equal(responseSummary.denominator, 27)
  assert.equal(responseSummary.rate, 100)

  const comprehensionSummary = summarizeOptionResponses(
    Array.from({ length: 27 }, () => ({ answer: comprehensionOptions[0].label, code: 1 })),
    comprehensionOptions,
  )
  assert.equal(comprehensionSummary.numerator, 0)
  assert.equal(comprehensionSummary.denominator, 27)
  assert.equal(comprehensionSummary.rate, 0)
})
