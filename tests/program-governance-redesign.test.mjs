import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('annual Program presents priority areas and new indicator proposals as first-class cards', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = read('components/governance/AnnualProgramWorkspace.tsx')
  assert.match(home, /\{id:'programs',label:'Program Kerja Tahunan'\}/)
  assert.match(home, /AnnualProgramWorkspace/)
  assert.doesNotMatch(home, /\{id:'proposals',label:'Usulan Indikator Baru'\}/)
  assert.match(workspace, /Area Prioritas/)
  assert.match(workspace, /Usulan Indikator Baru/)
  assert.match(workspace, /aureka_gov_save_priority_area/)
  assert.match(workspace, /IndicatorProposalWorkspace/)
})

test('recommendations and follow-up are one stakeholder-filtered workflow', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = read('components/governance/GovernanceProgramWorkspace.tsx')
  assert.match(home, /Rekomendasi dan Rencana Tindak Lanjut/)
  assert.match(workspace, /DEWAN_PENGAWAS/)
  assert.match(workspace, /DIREKTUR/)
  assert.match(workspace, /KETUA_PMKP/)
  assert.match(workspace, /KABID/)
  assert.match(workspace, /issued_by_level/)
  assert.match(workspace, /Pemberi rekomendasi/)
  assert.doesNotMatch(home, /\{id:'rtl',label:'Rencana Tindak Lanjut \(RTL\)'\}/)
})

test('each new follow-up captures a complete PDCA or PDSA cycle and evidence-based evaluation', () => {
  const workspace = read('components/governance/GovernanceProgramWorkspace.tsx')
  const migration = read('supabase/migrations/20261113060000_program_priority_and_pdsa_pdca.sql')
  const cycleGuard = read('supabase/migrations/20261113064000_enforce_pdsa_pdca_cycle_completeness.sql')
  assert.match(workspace, /PDSA/)
  assert.match(workspace, /PDCA/)
  assert.match(workspace, /cycle_plan/)
  assert.match(workspace, /cycle_do/)
  assert.match(workspace, /cycle_study_check/)
  assert.match(workspace, /cycle_act/)
  assert.match(workspace, /Dasar penilaian \(bukti, data sebelum–sesudah\)/)
  assert.match(migration, /check \(improvement_method in \('PDSA','PDCA'\)\)/)
  assert.match(migration, /aureka_gov_save_action/)
  assert.match(cycleGuard, /Lengkapi seluruh tahap Plan, Do, Study\/Check, dan Act/)
  assert.match(workspace, /pasien\|klinis\|clinical\|indikator/)
})

test('annual priority areas are audited and protected behind a server-side management gate', () => {
  const migration = read('supabase/migrations/20261113060000_program_priority_and_pdsa_pdca.sql')
  assert.match(migration, /create table if not exists aureka_governance\.annual_priority_areas/)
  assert.match(migration, /alter table aureka_governance\.annual_priority_areas enable row level security/)
  assert.match(migration, /Pengelolaan area prioritas hanya oleh Komite PMKP\/Super Admin/)
  assert.match(migration, /write_audit\('create','annual_priority_area'/)
  assert.match(migration, /'priority_areas'/)
})
