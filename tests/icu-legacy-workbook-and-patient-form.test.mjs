import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ICU importer recognizes the uploaded legacy workbook headers in Logbook row 2', () => {
  const importer = read('components/IcuExcelImportDialog.tsx')
  assert.match(importer, /code: '14\.1',[^\n]*aliases: \[[^\]]*'Kekosongan Linen'/)
  assert.match(importer, /unassignedBhpLinen: \[[^\n]*'Kekosongan Linen'/)
  assert.match(importer, /code: '14\.4',[^\n]*aliases: \[[^\n]*'Jam Visite Dokter Spesialis'/)
  assert.match(importer, /findHeaderRow\(sheet\)/)
  assert.match(importer, /source_excel_row: row\.sourceRow|source_excel_row: row\.sourceRow/)
})

test('opening an existing patient refreshes stale published profiles before rendering the form', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(workspace, /const openPatient=async\(p:Patient\)/)
  assert.match(workspace, /\.eq\('room_id',selectedRoomId\)\.eq\('profile_year',year\)/)
  assert.match(workspace, /Profil indikator belum berhasil disegarkan dari master unit/)
  assert.match(workspace, /mappedProfiles\.forEach/)
})

test('unmatched ICU indicators are diagnostic notices rather than blank form cards', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(workspace, /selectedUnmatchedHeaders\.length>0&&<div className="aqNotice"/)
  assert.doesNotMatch(workspace, /selectedUnmatchedHeaders\.map\(\(header,i\)=>\s*<article className="aqInd aqUnmatchedInd"/)
})
