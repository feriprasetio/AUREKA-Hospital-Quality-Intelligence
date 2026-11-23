import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyQualityWorkbookName, inspectQualityWorkbookRouting,
} from '../lib/aureka/quality-workbook-source-audit.ts'

// File descriptors only. No real patients, dates, cells, or file fingerprints
// are included in repository test fixtures.
const files = [
  ['Indikator Mutu Tahunan 2026(1).xlsx', null],
  ['PMKP - Ambulance - 2026.xlsx', 3],
  ['PMKP - Informasi dan Pengaduan - 2026.xlsx', 1],
  ['PMKP - Informatika dan Teknologi - 2026 (1).xlsx', 2],
  ['PMKP - Instalasi Radiologi 2026.xlsx', 10],
  ['PMKP - Instalasi Rekam Medis - 2026.xlsx', 13],
  ['PMKP - Timkordik - 2026.xlsx', 30],
  ['PMKP - Instalasi Bedah Sentral - 2026.xlsx', 4],
  ['PMKP - Instalasi Farmasi - 2026 (SEPTEMBER).xlsx', 5],
  ['PMKP - Instalasi Gawat Darurat - 2026.xlsx', 6],
  ['PMKP - Instalasi Gizi - 2026.xlsx', 7],
  ['PMKP - Instalasi Laboratorium - 2026.xlsx', 9],
  ['PMKP - Instalasi Rawat Jalan - 2026-2(1).xlsx', 11],
  ['PMKP - Instalasi Rehab Medik - 2026.xlsx', 12],
  ['PMKP - Intensive Care Unit - 2026.xlsx', 14],
  ['PMKP - Neonatal Intensive Care Unit - 2026.xlsx', 18],
  ['PMKP - Nifas - 2026 (8).xlsx', 19],
  ['PMKP - Pelayanan Keluarga Berencana Rumah Sakit - 2026 (1).xlsx', 32],
  ['PMKP - Pelayanan Keluarga Berencana Rumah Sakit - 2026.xlsx', 32],
  ['PMKP - Pelayanan Obstetri Neonatal Emergensi Komprehensi- 2026.xlsx', 33],
  ['PMKP - Perinatologi - 2026.xlsx', 20],
  ['PMKP - Promosi Kesehatan Rumah Sakit - 2026(1).xlsx', 21],
  ['PMKP - Rawat Inap Anak - 2026.xlsx', 22],
  ['PMKP - Rawat Inap Bedah - 2026 new.xlsx', 23],
  ['PMKP - Rawat Inap Penyakit Dalam - 2026.xlsx', 25],
  ['PMKP - Rawat Inap Saraf - 2026.xlsx', 26],
  ['PMKP - Rawat Inap VIP - 2026.xlsx', 27],
  ['PMKP - terbaru  Isolasi - 2026.xlsx', 24],
  ['PMKP - Tim Investigasi - 2026.xlsx', 29],
  ['PMKP - Tim Pelayanan HIV - 2026.xlsx', 31],
  ['PMKP - Tim Pelayanan Onkologi - 2026.xlsx', 34],
  ['PMKP - Verlos Kamer - OKTOBER-2026.xlsx', 37],
  ['PMKP FEB-MEI Hemodialisa - 2026.xlsx', 8],
]

test('all audited workbook names resolve to their canonical unit or master',()=>{
  assert.equal(files.length,33)
  assert.equal(new Set(files.map(([,room])=>room).filter(room=>room!==null)).size,31)
  for(const [name,room] of files){
    assert.equal(classifyQualityWorkbookName(name)?.roomId,room,name)
    if(room!==null && ![5,11].includes(room)){
      assert.deepEqual(inspectQualityWorkbookRouting(name,room,2026).blockers,[],name)
    }
  }
})

test('canonical source routing prevents wrong-unit/year and inappropriate generic parser use',()=>{
  assert.match(inspectQualityWorkbookRouting('PMKP - Instalasi Gizi - 2026.xlsx',14,2026).blockers[0],/Instalasi Gizi/)
  assert.match(inspectQualityWorkbookRouting('PMKP - Instalasi Gizi - 2026.xlsx',7,2025).blockers[0],/Tahun/)
  assert.match(inspectQualityWorkbookRouting('Indikator Mutu Tahunan 2026(1).xlsx',8,2026).blockers[0],/master/)
  assert.match(inspectQualityWorkbookRouting('PMKP - Instalasi Farmasi - 2026.xlsx',5,2026).blockers[0],/beberapa sheet/)
  assert.match(inspectQualityWorkbookRouting('PMKP - Instalasi Rawat Jalan - 2026.xlsx',11,2026).blockers[0],/matriks tanggal/)
  assert.equal(classifyQualityWorkbookName('PMKP - Instalasi Gawat Darurat - 2026.xlsx')?.headerRow,3)
  assert.equal(classifyQualityWorkbookName('PMKP - Neonatal Intensive Care Unit - 2026.xlsx')?.roomId,18)
})

test('KB source variants warn about overlap and unregistered workbooks still allow reviewed GUI mapping',()=>{
  const first=inspectQualityWorkbookRouting('PMKP - Pelayanan Keluarga Berencana Rumah Sakit - 2026 (1).xlsx',32,2026)
  const second=inspectQualityWorkbookRouting('PMKP - Pelayanan Keluarga Berencana Rumah Sakit - 2026.xlsx',32,2026)
  assert.equal(first.hint?.duplicateFamily,'kb-2026')
  assert.equal(second.hint?.duplicateFamily,'kb-2026')
  assert.match(first.notes.join(' '),/duplikasi/)
  const unknown=inspectQualityWorkbookRouting('worksheet.xlsx',8,2026)
  assert.equal(unknown.blockers.length,0)
  assert.match(unknown.notes.join(' '),/belum dikenali/)
})
