import test from 'node:test'
import assert from 'node:assert/strict'
import { isExcelSourceError, isMaterialWorkbookSourceRow } from '../lib/aureka/quality-import-row-filter.ts'

test('prefilled PMKP formula-only rows do not become patient or activity observations',()=>{
  const fields=['B: Nama Pasien','C: No. RM','D: Tanggal Masuk']
  const indicators=['N: Penilaian','O: Penilaian']
  assert.equal(isMaterialWorkbookSourceRow({
    'A: No.': 2001, 'N: Penilaian':'#VALUE!', 'O: Penilaian':'#REF!',
  },fields,indicators),false)
  assert.equal(isMaterialWorkbookSourceRow({
    'A: No.': 2002, 'N: Penilaian':'#DIV/0!',
  },fields,indicators),false)
  assert.equal(isMaterialWorkbookSourceRow({
    'A: No.': 2003, 'D: Tanggal Masuk':'2026-07-01', 'N: Penilaian':'#VALUE!',
  },fields,indicators),true)
  assert.equal(isMaterialWorkbookSourceRow({
    'A: No.': 2004, 'B: Nama Pasien':'Kasus simulasi', 'N: Penilaian':'#VALUE!',
  },fields,indicators),true)
})

test('zero measurements are valid observations but formula errors do not count as input',()=>{
  assert.equal(isMaterialWorkbookSourceRow({'N: Durasi':0},[],['N: Durasi']),true)
  assert.equal(isMaterialWorkbookSourceRow({'N: Durasi':'0'},[],['N: Durasi']),true)
  assert.equal(isMaterialWorkbookSourceRow({'N: Durasi':false},[],['N: Durasi']),true)
  assert.equal(isMaterialWorkbookSourceRow({'N: Durasi':'#SPILL!'},[],['N: Durasi']),false)
  assert.ok(isExcelSourceError('#NAME?'))
  assert.ok(isExcelSourceError('#N/A'))
  assert.ok(!isExcelSourceError('Keterangan #REF! bukan nilai Excel'))
  assert.ok(!isExcelSourceError('0'))
})
