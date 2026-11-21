import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorDropdownOptions,
  findIndicatorDropdownSelection,
  shouldUseIndicatorDropdown,
} from '../lib/aureka/indicator-dropdown.ts'

const choices = [
  { label: 'Sesuai standar', code: 1, numerator: true, denominator: true },
  { label: 'Pengecualian klinis', code: 2, numerator: false, denominator: true },
  { label: 'Tidak sesuai', code: 3, numerator: false, denominator: true },
]

test('uses dropdown for categorical master options, including multi-choice occurrence indicators', () => {
  assert.equal(shouldUseIndicatorDropdown({ title: 'Kepatuhan', options_json: choices }), true)
  assert.equal(shouldUseIndicatorDropdown({
    title: 'Dead Stock',
    schema_json: { measurement_type: 'occurrence' },
    options_json: choices,
  }), true)
})

test('keeps ratio, numeric, visit, door and time measurements on their dedicated controls', () => {
  const placeholder = [{ label: 'Lainnya — tuliskan alasan/temuan', code: null, review_required: true }]
  for (const measurement_type of ['ratio', 'numeric', 'visit_window', 'door_to_decision', 'minutes']) {
    assert.equal(shouldUseIndicatorDropdown({
      title: 'Measurement',
      schema_json: { measurement_type },
      options_json: [...choices, ...placeholder],
    }), false)
  }
})

test('a single review placeholder is not rendered as a misleading dropdown', () => {
  assert.equal(shouldUseIndicatorDropdown({
    title: 'Numeric ratio',
    schema_json: { measurement_type: 'ratio' },
    options_json: [{ label: 'Lainnya — tuliskan alasan/temuan', code: null, review_required: true }],
  }), false)
  assert.equal(shouldUseIndicatorDropdown({ title: 'No options', options_json: [] }), false)
})

test('maps source Excel choices with an explicit Code suffix to the canonical master option', () => {
  const options = buildIndicatorDropdownOptions(
    { title: 'Test', options_json: choices },
    ['Sesuai standar (Code 1)', 'Pengecualian klinis (Code 2)'],
  )
  assert.equal(options[0].answer, 'Sesuai standar')
  assert.equal(options[0].code, 1)
  assert.equal(options[0].source_only, false)
  assert.equal(options[1].code, 2)
  assert.equal(options[1].source_only, false)
})

test('does not guess codes for Excel-only values and retains source labels for review', () => {
  const options = buildIndicatorDropdownOptions(
    { title: 'Test', options_json: choices },
    ['Sesuai standar (Code 1)', 'Other exception category'],
  )
  assert.equal(options[1].label, 'Other exception category')
  assert.equal(options[1].answer, 'Other exception category')
  assert.equal(options[1].code, null)
  assert.equal(options[1].source_only, true)
  assert.equal(options[1].review_required, true)
})

test('preserves master-only choices such as Lainnya when workbook validation omits them', () => {
  const options = buildIndicatorDropdownOptions(
    { title: 'Test', options_json: [...choices, { label: 'Lainnya — tuliskan alasan/temuan', code: null, review_required: true }] },
    ['Sesuai standar (Code 1)'],
  )
  assert.ok(options.some(option => option.answer === 'Lainnya — tuliskan alasan/temuan'))
})

test('restores an imported unmatched source value into the visible dropdown selection', () => {
  const options = buildIndicatorDropdownOptions(
    { title: 'Test', options_json: choices },
    ['Sesuai standar (Code 1)', 'Other exception category'],
  )
  assert.equal(findIndicatorDropdownSelection(options, {
    answer: '',
    code: null,
    source_value: 'Other exception category',
    match_status: 'unmatched',
  }), 1)
  assert.equal(findIndicatorDropdownSelection(options, {
    answer: 'Sesuai standar',
    code: 1,
  }), 0)
})


test('uses the master 1/2/3 category dropdown for patient-episode profiles even when aggregation type is ratio', () => {
  const profile = {
    title: 'Kelengkapan Laporan Operasi <24 Jam',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'positive' },
    options_json: choices,
  }
  assert.equal(shouldUseIndicatorDropdown(profile), true)
})

test('does not infer per-patient categorical entry for an aggregate ratio profile', () => {
  const profile = {
    title: 'Kepatuhan Hand Hygiene',
    measurement_grain: 'daily_metric',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'positive' },
    options_json: choices,
  }
  assert.equal(shouldUseIndicatorDropdown(profile), false)
})

test('does not infer category entry without a published indicator direction', () => {
  const profile = {
    title: 'Unclassified patient indicator',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio' },
    options_json: choices,
  }
  assert.equal(shouldUseIndicatorDropdown(profile), false)
})


test('keeps explicitly numeric patient-episode measurements on numeric controls', () => {
  const profile = {
    title: 'Waktu tanggap',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'minutes', indicator_direction: 'positive' },
    options_json: choices,
  }
  assert.equal(shouldUseIndicatorDropdown(profile), false)
})
