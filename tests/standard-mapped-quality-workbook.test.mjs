import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyQualityWorkbookName, isStandardUnitWorkbook } from '../lib/aureka/quality-workbook-source-audit.ts'
import { exactWorkbookColumn, getIncidentReportElapsedMinutes, readCodedWorkbookChoice } from '../lib/aureka/standard-mapped-quality-workbook.ts'

test('recognizes the unit template using both its workbook name and sheets', () => {
  const nicu = classifyQualityWorkbookName('PMKP - Neonatal Intensive Care Unit - 2026.xlsx')
  assert.equal(isStandardUnitWorkbook(nicu, 18, ['Profil', 'Logbook']), true)
  assert.equal(isStandardUnitWorkbook(nicu, 18, ['Logbook']), false)
  assert.equal(isStandardUnitWorkbook(nicu, 14, ['Profil', 'Logbook']), false)
  const pharmacy = classifyQualityWorkbookName('PMKP - Instalasi Farmasi - 2026.xlsx')
  assert.equal(isStandardUnitWorkbook(pharmacy, 5, ['Dashboard', 'Copy Resep Rajal', 'Copy Resep Ranap']), true)
})

test('reads repeated and incomplete code suffixes without accepting contradictions', () => {
  assert.deepEqual(readCodedWorkbookChoice('Lengkap (Code 1) (Code 1'), {
    label: 'Lengkap', sourceCode: 1, conflictingCodes: false,
  })
  assert.deepEqual(readCodedWorkbookChoice('Lengkap (Code 1) (Code 3)'), {
    label: 'Lengkap', sourceCode: null, conflictingCodes: true,
  })
  assert.equal(exactWorkbookColumn([{ header: 'Oksigen Transfer IGD', key: 'N' }], 'Transfer IGD'), '')
})

test('computes the incident reporting interval only with both valid timestamps', () => {
  assert.equal(getIncidentReportElapsedMinutes('2026-01-04', '12.30', '2026-01-06', 0.5), 2850)
  assert.equal(getIncidentReportElapsedMinutes('2026-01-04', '12:00', '2026-01-06', '12:00'), 2880)
  assert.equal(getIncidentReportElapsedMinutes('2026-01-04', null, '2026-01-06', '12:00'), null)
  assert.equal(getIncidentReportElapsedMinutes('2026-01-04', '12:00', '2026-01-04', '11:00'), null)
})
