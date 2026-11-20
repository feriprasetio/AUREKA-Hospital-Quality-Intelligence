import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const baseline = readFileSync(new URL('../docs/AUREKA_STANDARDS_BASELINE_V2.md', import.meta.url), 'utf8')
const survey = readFileSync(new URL('../components/patient-safety/SurveyWizard.tsx', import.meta.url), 'utf8')

test('AUREKA does not misrepresent its internal safety-culture instrument as AHRQ SOPS 2.0', () => {
  assert.match(survey, /instrumen internal/i)
  assert.match(survey, /belum dinyatakan sebagai AHRQ SOPS Hospital Survey 2\.0/i)
  assert.match(baseline, /tidak mengklaim bahwa instrumen tersebut adalah AHRQ SOPS Hospital Survey 2\.0/i)
})

test('international SOPS translation and use are gated by AHRQ permission and local validation', () => {
  assert.match(baseline, /izin menerjemahkan dan menggunakan survei di luar Amerika Serikat/i)
  assert.match(baseline, /validasi lokal/i)
  assert.match(baseline, /menunggu izin AHRQ/i)
})

test('internal privacy suppression threshold is distinguished from AHRQ database submission threshold', () => {
  assert.match(baseline, /n≥5 adalah kontrol privasi rumah sakit/i)
  assert.match(baseline, /setidaknya 10 survei lengkap per lokasi rumah sakit/i)
})
