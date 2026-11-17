import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const gateway = read('supabase/functions/aureka-tanya/index.ts')

test('NARA keeps all five providers behind the server-side gateway', () => {
  for (const provider of ['gemini', 'groq', 'nvidia', 'deepseek', 'llm7']) {
    assert.match(gateway, new RegExp(provider + ': keysOf|'+provider+'\\s*:'), 'Missing provider adapter: ' + provider)
  }
  assert.match(gateway, /AI_PROVIDER_ORDER/)
  assert.match(gateway, /AI_ENABLE_DEEPSEEK/)
  assert.match(gateway, /AI_ENABLE_LLM7/)
})

test('NARA Privacy Guard blocks common direct identifiers before provider calls', () => {
  assert.match(gateway, /sensitivePatterns/)
  assert.match(gateway, /\\b\\d\{16\}\\b/)
  assert.match(gateway, /nomor\\s\*rekam\\s\*medis/)
  assert.match(gateway, /status: 422|reply\(422/)
})

test('external AI context excludes incident unit/month detail and free-text risk events', () => {
  assert.doesNotMatch(gateway, /contoh_risiko_skor_tertinggi/)
  assert.match(gateway, /catatan_disclosure/)
  assert.match(gateway, /safeCount/)
  assert.match(gateway, /per_jenis: safeCount/)
  assert.doesNotMatch(gateway, /per_unit: count\(incidents\.rows/)
  assert.doesNotMatch(gateway, /per_bulan: Object\.fromEntries\(Object\.entries\(count\(incidents/)
})

test('all five providers are included when their secrets exist; DeepSeek and LLM7 have explicit kill switches', () => {
  assert.match(gateway, /AI_PROVIDER_ORDER/)
  assert.match(gateway, /groq,nvidia,gemini,deepseek,llm7/)
  assert.match(gateway, /x === "deepseek" && Deno\.env\.get\("AI_ENABLE_DEEPSEEK"\) === "false"/)
  assert.match(gateway, /x === "llm7" && Deno\.env\.get\("AI_ENABLE_LLM7"\) === "false"/)
})


test('NARA identity and the single-entry UI are consistent', () => {
  assert.match(gateway, /NARA AI \(AUREKA Intelligence\)/)
  const home = read('components/HomeClient.tsx')
  const landing = read('components/HomeLandingWorkspace.tsx')
  assert.doesNotMatch(home, /Chat AI|supportTab==='ai'|workspaceCommunicationTrigger|TanyaAureka/)
  assert.match(home, /Pesan Admin/)
  assert.doesNotMatch(landing, /TanyaAureka|hlAi/)
  const nara = read('components/NaraAIWorkspace.tsx')
  assert.doesNotMatch(nara, /Diagnosis & ICD-10|NaraICD10Review|naraCodingToggle|naraCodingWorkspace/)
  assert.match(nara, /Ringkasan eksekutif/)
  assert.match(nara, /Analisis mutu/)
})

test('top disease ranking is calculated by a protected database function, not an external model', () => {
  assert.match(gateway, /isTopDiseaseQuery/)
  assert.match(gateway, /aureka_nara_clinical_summary/)
  assert.match(gateway, /model: "database:clinical-analytics"/)
  assert.match(gateway, /formatTopDiseaseAnswer/)
  assert.doesNotMatch(gateway, /patient_index.*select\(["']no_rm/)
})

test('clinical analytics uses internal MRN only for secure aggregation and logs accesses', () => {
  const migration = read('supabase/migrations/20261116180000_nara_clinical_intelligence.sql')
  assert.match(migration, /has_quality_room_access/)
  assert.match(migration, /normalize_no_rm/)
  assert.match(migration, /count\(distinct internal_no_rm\)/)
  assert.match(migration, /patients >= 5|count\(distinct internal_no_rm\) >= 5/)
  assert.match(migration, /nara_clinical_access_audit/)
  assert.match(migration, /revoke all on function public\.aureka_nara_clinical_summary/)
})

test('ICD-10 mapping governance requires a human validation reference and a reviewer identity', () => {
  const migration = read('supabase/migrations/20261116180000_nara_clinical_intelligence.sql')
  assert.match(migration, /mapping_status in \('proposed','validated','rejected'\)/)
  assert.match(migration, /validation_reference/)
  assert.match(migration, /validated_by/)
  assert.match(migration, /current_role_code\(\)/)
  assert.match(migration, /v_role not in \('ADMIN','PMKP'\)/)
})

test('logbook non-submission is calculated from raw counts before suppression', () => {
  assert.match(gateway, /Determine zero-submission units from raw internal counts before n<5 suppression/)
  assert.match(gateway, /return raw\.slice\(k \* 3, k \* 3 \+ 3\)\.reduce\(\(a, b\) => a \+ b, 0\) === 0/)
  assert.doesNotMatch(gateway, /logbookPerUnit\.filter\(\(u\) => !\(u\.per_triwulan/)
})


test('NARA aggregate context covers risk, FMEA, workforce, clinical audit, and IGD consultation metrics without direct identifiers', () => {
  assert.match(gateway, /analisis_fmea/)
  assert.match(gateway, /sumber_daya_manusia_agregat/)
  assert.match(gateway, /audit_klinis/)
  assert.match(gateway, /response_time_konsul_igd/)
  assert.match(gateway, /catatan_disclosure/)
  assert.doesNotMatch(gateway, /staff_directory.*select\(["']\*["']\)/)
  assert.doesNotMatch(gateway, /clinical_pathway_audits.*select\(["']\*["']\)/)
})

test('ICD-10 proposal backend retains human validation safeguards without an NARA review screen', () => {
  assert.match(gateway, /task === "icd10_suggest"/)
  assert.match(gateway, /aureka_nara_icd10_review_queue/)
  assert.match(gateway, /const payload = \{ code_set: "WHO ICD-10 Version 2019", items: safeRows\.map/)
  assert.match(gateway, /p_status: "proposed", p_validation_reference: null/)
  assert.match(gateway, /Wajib diverifikasi dengan WHO ICD-10 2019/)
  assert.doesNotMatch(gateway, /p_status: "validated".*icd10_suggest/)
  const workspace = read('components/NaraAIWorkspace.tsx')
  assert.doesNotMatch(workspace, /NaraICD10Review|Kamus diagnosis|Validasi ICD-10|icd10_suggest/)
})

test('NARA context includes secure diagnosis, indicator, safety, OPPE/FPPE, and governance aggregates', () => {
  assert.match(gateway, /db\.rpc\("aureka_nara_clinical_summary"/)
  assert.match(gateway, /analisis_diagnosis_klinis/)
  assert.match(gateway, /profil_indikator_mutu/)
  assert.match(gateway, /evaluasi_profesional/)
  assert.match(gateway, /tata_kelola_dan_prioritas/)
  assert.match(gateway, /per_profesi: safeCount/)
  assert.match(gateway, /catatan_disclosure/)
})

test('legacy assistant is absent from Beranda and NARA is the only embedded AI workspace', () => {
  const home = read('components/HomeClient.tsx')
  const landing = read('components/HomeLandingWorkspace.tsx')
  const nara = read('components/NaraAIWorkspace.tsx')
  assert.doesNotMatch(home, /TanyaAureka|workspaceCommunicationTrigger/)
  assert.doesNotMatch(landing, /TanyaAureka|hlAi/)
  assert.match(home, /Pesan Admin/)
  assert.match(nara, /TanyaAureka key=\{activeId\}[^>]*embedded/)
  assert.match(nara, /No\. RM hanya digunakan internal/)
})
