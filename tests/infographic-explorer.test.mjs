import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../components/HomeLandingWorkspace.tsx', import.meta.url), 'utf8')

test('infographics expose selectable data metrics and compatible chart types', () => {
  for (const metric of ['activity','episodes','diagnosis','avg_los']) assert.ok(home.includes(`value="${metric}"`) || home.includes(`infoMetric==='${metric}'`))
  for (const chart of ['line','area','bar','doughnut']) assert.ok(home.includes(chart))
  // Ringkasan lintas domain kini dari dashboard terpadu (Ikhtisar)
  assert.match(home, /<InfographicsDashboard/)
})

test('all-unit comparison is not presented as patient-level detail', () => {
  // Infografis hanya menampilkan agregat; tidak ada daftar identitas pasien di Beranda/Infografis
  assert.doesNotMatch(home, /patient_name|no_rm|nama_pasien/i)
})
