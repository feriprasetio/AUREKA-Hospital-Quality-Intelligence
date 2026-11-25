import test from 'node:test'
import assert from 'node:assert/strict'
import { LEGACY_HEADERS, detectMapping, excelDate, excelTime, isLegacyHeader, normalizeRow, mergeMissing } from '../lib/patient-safety/incident-excel-import.ts'
const fields=[
 {code:'A1',label:'Insiden yang Terjadi',type:'textarea'},
 {code:'A2',label:'Tanggal Insiden',type:'date'},
 {code:'A3',label:'Jam Insiden',type:'time'},
 {code:'A7',label:'Jenis Insiden',type:'radio',options:['Kejadian Tidak Diharapkan (KTD)','Kejadian Potensial Cedera Signifikan (KPCs)']},
 {code:'A8',label:'Akibat dari Insiden',type:'textarea'},
 {code:'C1',label:'Nama Pasien (Korban)',type:'text'},
 {code:'C2',label:'No. Rekam Medis',type:'text'},
 {code:'C3',label:'Usia',type:'text'},
 {code:'C4',label:'Jenis Kelamin',type:'radio',options:['Laki-Laki','Perempuan']},
 {code:'C5',label:'Penanggung Biaya',type:'radio',options:['BPJS Kesehatan (JKN)']},
 {code:'C7',label:'Jam Masuk Rumah Sakit',type:'time'},
 {code:'D5',label:'Kejadian yang Sama Pernah Terjadi di Ruangan Lain',type:'radio',options:['Ya','Tidak','Kurang Tahu']},
 {code:'D7',label:'Dampak pada Pasien (Tingkat Cedera)',type:'radio',options:['Tidak signifikan (tidak ada cedera)']},
 {code:'E1',label:'Nama Pembuat Laporan',type:'text'},
 {code:'E2',label:'Unit Kerja',type:'select'},
]
test('date and time parsing are deterministic and reject invalid values',()=>{
 assert.equal(excelDate(46286),'2026-09-21')
 assert.equal(excelDate('31/02/2026'),'')
 assert.equal(excelDate('2026-02-28'),'2026-02-28')
 assert.equal(excelTime(0.28125),'06:45')
 assert.equal(excelTime('25:30'),'')
 assert.equal(excelTime('1899-12-30T21:21:00.000Z'),'21:21')
})
test('legacy sheet with shifted patient identity columns is mapped without data loss',()=>{
 assert.equal(isLegacyHeader(LEGACY_HEADERS),true)
 const cells=['','Contoh jatuh',46286,0.28125,'Ruang Anak','','','KTD','Tidak Ada','','Pasien contoh','000123','17 tahun','Perempuan','JKN',46283,0.8895833333,'Keluarga pasien lain','Paramedis (Perawat)','TTV','Sangat Jarang','Ya','Edukasi','Pelapor contoh','Rawat Inap Anak','Lengkap']
 const p=normalizeRow({row:47,cells},LEGACY_HEADERS,detectMapping(LEGACY_HEADERS,fields),fields,[{id:22,name:'Rawat Inap Anak'}])
 assert.equal(p.shifted,true);assert.equal(p.blocked,false);assert.equal(p.data.C1,'Pasien contoh');assert.equal(p.data.C2,'000123');assert.equal(p.data.C7,'21:21');assert.equal(p.data.C4,'Perempuan');assert.equal(p.data.E1,'Pelapor contoh');assert.equal(p.roomId,22)
 assert.equal(p.data.D5,'');assert.ok(p.warnings.some(w=>w.includes('KTD tanpa cedera')))
})
test('normal import header and code mapping',()=>{
 const headers=['Kode Insiden','A1 Insiden yang Terjadi','A2 Tanggal Insiden','A7 Jenis Insiden']
 const m=detectMapping(headers,fields)
 assert.equal(m.A1,1);assert.equal(m.A2,2);assert.equal(m.A7,3)
 assert.equal(normalizeRow({row:2,cells:['','Contoh','2026-01-01','KPC']},headers,m,fields,[]).blocked,false)
})
test('invalid primary fields block import; unknown values are not fabricated',()=>{
 const p=normalizeRow({row:2,cells:['','Contoh','','','','','','Tidak dikenal']},LEGACY_HEADERS,detectMapping(LEGACY_HEADERS,fields),fields,[])
 assert.equal(p.blocked,true);assert.equal(p.data.A7,'')
})
test('reconciliation fills blanks without overwriting validated text',()=>{
 assert.deepEqual(mergeMissing({A1:'Narasi lama',C7:''},{A1:'Narasi baru',C7:'21:21',_import_raw_json:'{}'}),{A1:'Narasi lama',C7:'21:21',_import_raw_json:'{}'})
})
