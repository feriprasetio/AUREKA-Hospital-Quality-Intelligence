import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeOutpatientImportDate,
  parseOutpatientWaitingMinutes,
  makeOutpatientProviderDaySubjectKey,
} from '../lib/aureka/outpatient-excel-import.ts'

test('normalizes ISO, DMY, native Date, and Excel serial dates', () => {
  assert.equal(normalizeOutpatientImportDate('2026-10-30'), '2026-10-30')
  assert.equal(normalizeOutpatientImportDate('30/10/2026'), '2026-10-30')
  assert.equal(normalizeOutpatientImportDate(46325), '2026-10-30')
  assert.equal(normalizeOutpatientImportDate(new Date(Date.UTC(2026, 9, 30))), '2026-10-30')
  assert.equal(normalizeOutpatientImportDate('31/02/2026'), null)
})

test('parses decimal comma, decimal dot, and thousands separators safely', () => {
  assert.equal(parseOutpatientWaitingMinutes('45,5'), 45.5)
  assert.equal(parseOutpatientWaitingMinutes('45.5 menit'), 45.5)
  assert.equal(parseOutpatientWaitingMinutes('1.234,5'), 1234.5)
  assert.equal(parseOutpatientWaitingMinutes('1,234.5'), 1234.5)
  assert.equal(parseOutpatientWaitingMinutes('-5'), null)
  assert.equal(parseOutpatientWaitingMinutes('1441'), null)
})

test('uses the same canonical room/date/clinic/doctor key as manual AUREKA logbook saves', () => {
  assert.equal(
    makeOutpatientProviderDaySubjectKey('2026-10-30','Klinik Anak (Pediatri)','dr. Raden Yutta'),
    '11:2026-10-30:Klinik Anak (Pediatri):dr. Raden Yutta'
  )
})
