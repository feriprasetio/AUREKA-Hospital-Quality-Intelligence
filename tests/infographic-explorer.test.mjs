import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../components/HomeLandingWorkspace.tsx', import.meta.url), 'utf8')

test('infographics expose selectable data metrics and compatible chart types', () => {
  for (const metric of ['activity','episodes','diagnosis','avg_los','active']) assert.ok(home.includes(`value="${metric}"`) || home.includes(`infoMetric==='${metric}'`))
  for (const chart of ['line','area','bar','doughnut']) assert.ok(home.includes(chart))
  assert.match(home, /Pilih satu unit untuk menampilkan metrik episode pasien/)
})

test('all-unit comparison is not presented as patient-level detail', () => {
  assert.match(home, /ringkasan lintas unit saat ini hanya menyediakan agregat jumlah/)
  assert.match(home, /bukan otomatis jumlah pasien unik/)
  assert.match(home, /bukan pengganti sensus tempat tidur/)
})
