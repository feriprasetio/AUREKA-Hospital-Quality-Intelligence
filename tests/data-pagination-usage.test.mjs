import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('patient safety incident, investigation, attribution, roster, and survey reads are paginated', () => {
  const source = read('components/PatientSafetyWorkspace.tsx')
  assert.match(source, /readAllPages<IncidentRow>/)
  assert.match(source, /readAllPages<InvestigationRow>/)
  assert.match(source, /readAllPages<\{ staff_id: string; room_id: number \}>/)
  assert.match(source, /readAllPages<StaffEntityAttribution>/)
  assert.match(source, /readAllPages<CultureResponse>/)
  assert.doesNotMatch(source, /\.limit\(500\)/)
})

test('FPPE history no longer silently stops at 250 evaluations', () => {
  const source = read('components/FppeEvaluationWorkspace.tsx')
  assert.match(source, /readAllPages<FppeRecord>/)
  assert.doesNotMatch(source, /\.limit\(250\)/)
})

test('OPPE no longer contains fixed 20,000-row pagination stops', () => {
  const source = read('components/OppeAuditWorkspace.tsx')
  assert.match(source, /readAllPages<any>/)
  assert.match(source, /readAllPages<OppeResponseRow>/)
  assert.match(source, /readAllPages<\{ record_id: string; staff_id: string; field_key: string \}>/)
  assert.match(source, /Map<string, Set<number>>/)
  assert.doesNotMatch(source, /from < 20000/)
})

test('personal dashboard counts do not stop at 5,000 rows and retain unit scoping', () => {
  const source = read('components/GeneralSettings.tsx')
  assert.match(source, /readAllPages<any>/)
  assert.match(source, /\.eq\('unit_id', roomId\)/)
  assert.match(source, /\.is\('unit_id', null\)/)
  assert.doesNotMatch(source, /\.range\(0, 4999\)/)
})

test('indicator logbook roster lookup is scoped and paginated', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /readAllPages<\{staff_id:string;room_id:number\}>/)
  assert.match(source, /\.eq\('room_id',roomId\)/)
})
