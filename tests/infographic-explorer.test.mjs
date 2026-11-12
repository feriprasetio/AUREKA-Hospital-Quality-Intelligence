import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../components/governance/InfographicsDashboard.tsx', import.meta.url), 'utf8')

test('Infografis use a server-side aggregate and expose the approved KPI groups', () => {
  assert.ok(dashboard.includes('aureka_gov_infographics_summary_secure'))
  assert.ok(dashboard.includes('value={year}'))
  assert.ok(dashboard.includes('value={roomValue}'))
  assert.ok(dashboard.includes('canChooseRoom'))
  for (const label of [
    'Indikator aktif',
    'Data indikator',
    'Data tervalidasi',
    'Tren data indikator',
    'Tren insiden keselamatan pasien',
    'Distribusi kategori indikator',
    'Profil tingkat risiko',
    'Program, RTL, dan regulasi',
  ]) assert.ok(dashboard.includes(label), 'Missing Infografis item: ' + label)
})

test('Infografis remain aggregate and never present individual patient-level detail', () => {
  assert.ok(dashboard.includes('Tidak termasuk episode pasien'))
  assert.ok(dashboard.includes('tidak menampilkan identitas pelapor, pasien, atau rincian investigasi'))
  assert.ok(!dashboard.includes('medical_record_number'))
  assert.ok(!dashboard.includes('patient_name'))
  assert.ok(dashboard.includes('Ringkasan ini bukan pengganti laporan indikator terperinci'))
})
