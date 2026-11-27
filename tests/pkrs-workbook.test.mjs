import assert from 'node:assert/strict'
import test from 'node:test'
import Excel from 'exceljs-hardened'
import { PKRS_PROFESSIONS, readPkrsWorkbookGroups, readPkrsEducation } from '../lib/aureka/pkrs-workbook.ts'

test('keeps identical topic labels separate across merged PKRS professions', () => {
  const sheet = new Excel.Workbook().addWorksheet('Logbook')
  PKRS_PROFESSIONS.forEach((profession, index) => {
    const col = 7 + index * 2
    sheet.mergeCells(1, col, 1, col + 1)
    sheet.getRow(1).getCell(col).value = profession
    sheet.getRow(2).getCell(col).value = 'Topik sama'
    sheet.getRow(2).getCell(col + 1).value = 'Topik tambahan'
  })
  const groups = readPkrsWorkbookGroups(sheet, 2)
  assert.equal(groups.length, 8)
  const fields = ['Petugas Admisi (layout lama)']
  const { education, formFields } = readPkrsEducation(groups, col => ({7:'Sudah', 9:'Tidak Dilakukan'})[col], fields)
  assert.equal(education[0].topics[0].answer, 'Sudah')
  assert.equal(education[1].topics[0].answer, 'Tidak Dilakukan')
  assert.equal(education[1].topics[1].answer, null)
  assert.equal(formFields[fields[0]], 'Topik sama – Sudah')
  assert.equal(readPkrsWorkbookGroups(sheet, 1).length, 0)
})
