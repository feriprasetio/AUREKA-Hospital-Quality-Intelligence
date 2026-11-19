import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareSpmExcelImport } from '../lib/aureka/spm-excel-import.ts'

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function blankRow(width = 31) {
  return Array(width).fill(null)
}

function setHeader(grid, rowIndex, start, group) {
  grid[rowIndex - 1][start] = group
  const row = grid[rowIndex]
  row[start] = 'No.'
  row[start + 1] = 'Indikator'
  row[start + 2] = 'Parameter'
  MONTHS.forEach((month,index) => { row[start + 3 + index] = month })
}

function setIndicator(grid, rowIndex, start, number, title, numeratorLabel, numeratorValues, denominatorLabel, denominatorValues) {
  const numerator = grid[rowIndex]
  numerator[start] = number
  numerator[start + 1] = title
  numerator[start + 2] = numeratorLabel
  numeratorValues.forEach((value,index) => { numerator[start + 3 + index] = value })
  if (denominatorLabel != null) {
    const denominator = grid[rowIndex + 1]
    denominator[start + 2] = denominatorLabel
    denominatorValues.forEach((value,index) => { denominator[start + 3 + index] = value })
  }
}

test('SPM XLSX parser imports only populated months from the parent service block', () => {
  const grid = Array.from({length:6}, () => blankRow())
  setHeader(grid,1,0,'Instalasi Gawat Darurat')
  setIndicator(
    grid,2,0,1,
    'Kemampuan menangani life saving anak dan dewasa',
    'Jumlah kumulatif pasien yang mendapat pertolongan life saving di Gawat Darurat',
    [37,45,null,null,null,null,null,null,null,null,null,null],
    'Jumlah seluruh pasien yang membutuhkan penanganan life saving di Unit Gawat Darurat',
    [37,45,null,null,null,null,null,null,null,null,null,null],
  )
  const profile = [{
    id:'profile-001',profile_year:2026,code:'SPM-001',group_name:'Instalasi Gawat Darurat',
    title:'Kemampuan menangani life saving anak dan dewasa',
    numerator_definition:'Jumlah kumulatif pasien yang mendapat pertolongan life saving di Gawat Darurat',
    denominator_definition:'Jumlah seluruh pasien yang membutuhkan penanganan life saving di Unit Gawat Darurat',
    source_mode:'standalone',calculation_config:{method:'ratio'},
  }]
  const preview = prepareSpmExcelImport(grid,profile,2026,'SPM-2026.xlsx')
  assert.equal(preview.rows.length,2)
  assert.deepEqual(preview.rows.map(row => row.period_month),[1,2])
  assert.deepEqual(preview.rows[0].input_json,{numerator:37,denominator:37})
  assert.equal(preview.rows[0].notes.includes('SPM-2026.xlsx'),true)
})

test('SPM XLSX parser skips the old Jam Visite value and keeps only the patient-fall numerator', () => {
  const grid = Array.from({length:8}, () => blankRow())
  setHeader(grid,1,0,'Instalasi Rawat Inap')
  setIndicator(
    grid,2,0,4,
    'Jam Visite Dokter Spesialis',
    'Jumlah visite dokter spesialis antara jam 07.00 - 14.00 yang disurvei',
    [35,331],
    'Jumlah pelaksanaan visite dokter spesialis yang disurvei',
    [35,331],
  )
  setIndicator(
    grid,4,0,7,
    'Tidak adanya kejadian pasien jatuh yang berakibat kecacatan/kematian',
    'Jumlah pasien rawat inap dalam bulan tersebut dikurangi jumlah pasien yang jatuh dan berakibat kecacatan/kematian',
    [100,120],
    'Jumlah pasien rawat inap dalam bulan',
    [101,121],
  )
  const profiles = [
    {
      id:'profile-019',profile_year:2026,code:'SPM-019',group_name:'Instalasi Rawat Inap',
      title:'Jam Visite Dokter Spesialis',
      numerator_definition:'Jumlah visite dokter spesialis antara jam 06.00 - 14.00 yang disurvei',
      denominator_definition:'Jumlah pelaksanaan visite dokter spesialis yang disurvei',
      source_mode:'quality_linked',calculation_config:{method:'ratio'},
    },
    {
      id:'profile-022',profile_year:2026,code:'SPM-022',group_name:'Instalasi Rawat Inap',
      title:'Tidak adanya kejadian pasien jatuh yang berakibat kecacatan/kematian',
      numerator_definition:'Jumlah pasien dirawat dalam bulan tersebut dikurangi jumlah pasien yang jatuh dan berakibat kecacatan atau kematian',
      denominator_definition:'Jumlah pasien dirawat dalam bulan',
      source_mode:'quality_denominator_linked',calculation_config:{method:'no_event_rate'},
    },
  ]
  const preview = prepareSpmExcelImport(grid,profiles,2026,'SPM-2026.xlsx')
  assert.equal(preview.linked_indicators_skipped,1)
  assert.equal(preview.rows.length,2)
  assert.deepEqual(preview.rows[0].input_json,{numerator:100})
  assert.deepEqual(preview.rows[1].input_json,{numerator:120})
  assert.equal(preview.rows.some(row => row.code==='SPM-019'),false)
})

test('SPM XLSX parser does not mistake a secondary parameter row for the indicator numerator', () => {
  const grid = Array.from({length:6}, () => blankRow())
  setHeader(grid,1,0,'Instalasi Gawat Darurat')
  setIndicator(
    grid,2,0,7,
    'Kematian Pasien ≤ 24 jam di Gawat Darurat',
    'Jumlah pasien yang meninggal dalam periode ≤ 24 jam sejak pasien datang',
    [15,25],
    'Jumlah seluruh yang ditangani di Gawat Darurat',
    [1629,1298],
  )
  const duplicate = grid[4]
  duplicate[0] = 7
  duplicate[1] = 'Kematian Pasien ≤ 24 jam di Gawat Darurat'
  duplicate[2] = 'Batas Atas Kematian'
  duplicate[3] = 3.258
  duplicate[4] = 2.596

  const profile = [{
    id:'profile-007',profile_year:2026,code:'SPM-007',group_name:'Instalasi Gawat Darurat',
    title:'Kematian Pasien ≤ 24 jam di Gawat Darurat',
    numerator_definition:'Jumlah pasien yang meninggal dalam periode ≤ 24 jam sejak pasien datang',
    denominator_definition:'Jumlah seluruh yang ditangani di Gawat Darurat',
    source_mode:'standalone',calculation_config:{method:'ratio'},
  }]
  const preview = prepareSpmExcelImport(grid,profile,2026,'SPM-2026.xlsx')
  assert.equal(preview.rows.length,2)
  assert.deepEqual(preview.rows[0].input_json,{numerator:15,denominator:1629})
  assert.equal(preview.warnings.some(item => item.includes('Batas Atas Kematian')),false)
})

test('SPM XLSX parser preserves the average satisfaction score and respondent count', () => {
  const grid = Array.from({length:5}, () => blankRow())
  setHeader(grid,1,0,'Instalasi Rehab Medik')
  setIndicator(
    grid,2,0,3,
    'Kepuasan Pelanggan',
    'Jumlah kumulatif hasil penilaian kepuasan pasien dari pasien yang disurvei (dalam prosen)',
    [null,null,3.498,null,null,3.599],
    'Jumlah total pasien yang disurvei (n minimal 50)',
    [null,null,25,null,null,25],
  )
  const profile = [{
    id:'profile-059',profile_year:2026,code:'SPM-059',group_name:'Instalasi Rehab Medik',
    title:'Kepuasan Pelanggan',
    numerator_definition:'Jumlah kumulatif hasil penilaian kepuasan pasien dari pasien yang disurvei (dalam prosen)',
    denominator_definition:'Jumlah total pasien yang disurvei (n minimal 50)',
    source_mode:'standalone',calculation_config:{method:'score_to_percent',scale_max:4},
  }]
  const preview = prepareSpmExcelImport(grid,profile,2026,'SPM-2026.xlsx')
  assert.equal(preview.rows.length,2)
  assert.deepEqual(preview.rows[0].input_json,{score_mean:3.498,respondents:25})
  assert.deepEqual(preview.rows[1].input_json,{score_mean:3.599,respondents:25})
})

test('SPM XLSX parser rejects a workbook year outside the supported range and ignores unmatched service groups', () => {
  const grid = Array.from({length:4}, () => blankRow())
  setHeader(grid,1,0,'Rawat Inap Anak')
  setIndicator(grid,2,0,1,'Pemberi pelayanan rawat inap','Parameter anak',[1], 'Denominator anak',[1])
  const profile = [{
    id:'profile-016',profile_year:2026,code:'SPM-016',group_name:'Instalasi Rawat Inap',
    title:'Pemberi pelayanan rawat inap',numerator_definition:'Parameter induk',
    denominator_definition:'Denominator induk',source_mode:'standalone',calculation_config:{method:'ratio'},
  }]
  assert.throws(() => prepareSpmExcelImport(grid,profile,2026,'SPM-2026.xlsx'), /Tidak ada nilai bulanan/)
})

test('SPM XLSX parser preserves six inpatient unit blocks as separate room-scoped records', () => {
  const grid = Array.from({length:5}, () => blankRow(120))
  grid[0][0] = 'Instalasi Rawat Inap'
  grid[0][16] = 'Rawat Inap Anak'
  setHeader(grid,1,0,'Instalasi Rawat Inap')
  setHeader(grid,1,16,'Rawat Inap Anak')
  setIndicator(grid,2,16,1,'Pemberi pelayanan rawat inap','Jumlah Tenaga Dokter dan Perawat sesuai ketentuan',[22,21], 'Jumlah seluruh tenaga yang bertugas',[30,30])
  const profile = [{
    id:'profile-016',profile_year:2026,code:'SPM-016',group_name:'Instalasi Rawat Inap',
    title:'Pemberi pelayanan rawat inap',
    numerator_definition:'Jumlah Tenaga Dokter dan Perawat sesuai ketentuan',
    denominator_definition:'Jumlah seluruh tenaga yang bertugas',
    source_mode:'standalone',calculation_config:{method:'ratio'},
  }]
  const preview = prepareSpmExcelImport(grid,profile,2026,'SPM-2026.xlsx',[{id:22,name:'Rawat Inap Anak',code:'RANAK'}])
  assert.equal(preview.rows.length,2)
  assert.deepEqual(preview.rows.map(row => row.room_id),[22,22])
  assert.deepEqual(preview.rows[0].input_json,{numerator:22,denominator:30})
})

test('SPM XLSX parser maps all six inpatient workbook subunits to existing AUREKA room codes', () => {
  const grid = Array.from({length:5}, () => blankRow(120))
  const units = [
    ['Rawat Inap Anak',22,'RANAK'],
    ['Rawat Inap Bedah',23,'RBEDAH'],
    ['Rawat Inap Isolasi',24,'RISOLASI'],
    ['Rawat Inap Penyakit Dalam',25,'RPENYDALAM'],
    ['Rawat Inap Saraf',26,'RSARAF'],
    ['Rawat Inap VIP',27,'RVIP'],
  ]
  grid[0][0] = 'Instalasi Rawat Inap'
  const rooms = units.map(([name,id,code]) => ({name,id,code}))
  const profiles = [{
    id:'profile-016',profile_year:2026,code:'SPM-016',group_name:'Instalasi Rawat Inap',
    title:'Pemberi pelayanan rawat inap',
    numerator_definition:'Jumlah tenaga dokter dan perawat sesuai ketentuan',
    denominator_definition:'Jumlah seluruh tenaga yang bertugas',
    source_mode:'standalone',calculation_config:{method:'ratio'},
  }]
  units.forEach(([name], index) => {
    const start = 16 + index * 16
    setHeader(grid,1,start,'Instalasi Rawat Inap')
    grid[0][start] = name
    setIndicator(grid,2,start,1,'Pemberi pelayanan rawat inap','Jumlah tenaga dokter dan perawat sesuai ketentuan',[10+index], 'Jumlah seluruh tenaga yang bertugas',[20+index])
  })
  setHeader(grid,1,0,'Instalasi Rawat Inap')
  const preview = prepareSpmExcelImport(grid,profiles,2026,'SPM-2026.xlsx',rooms)
  assert.equal(preview.rows.length,6)
  assert.deepEqual(preview.rows.map(row => row.room_id),[22,23,24,25,26,27])
  assert.deepEqual(preview.rows.map(row => row.room_name),units.map(([name]) => name))
  assert.deepEqual(preview.rows.map(row => row.input_json.numerator),[10,11,12,13,14,15])
})
