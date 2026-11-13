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
    'Indikator Mutu',
    'Keselamatan Pasien',
    'Manajemen Risiko',
    'Tren pengumpulan dan validasi indikator',
    'Tren laporan insiden keselamatan pasien',
    'Distribusi indikator menurut kategori',
    'Profil tingkat risiko',
    'Ringkasan program dan RTL',
  ]) assert.ok(dashboard.includes(label), 'Missing Infografis item: ' + label)
})

test('Infografis remain aggregate and never present individual patient-level detail', () => {
  assert.ok(dashboard.includes('Tidak menampilkan identitas atau data pasien individual'))
  assert.ok(dashboard.includes('Distribusi agregat patient_episode'))
  assert.ok(!dashboard.includes('medical_record_number'))
  assert.ok(!dashboard.includes('patient_name'))
})
