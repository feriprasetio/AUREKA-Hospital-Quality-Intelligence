import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('patient directory displays room-scoped indicator answers and role-protected incident history', () => {
  const page = read('components/patient-registry/PatientIndexTab.tsx')
  const migration = read('supabase/migrations/20261121140000_patient_linked_history.sql')

  assert.match(page, /aureka_patient_linked_history/)
  assert.match(page, /Jejak layanan lintas modul/)
  assert.match(page, /item\.indicators\?\.length/)
  assert.match(page, /indicator\.answer/)
  assert.match(page, /incidents_visible/)
  assert.match(migration, /security definer/i)
  assert.match(migration, /has_quality_room_access/)
  assert.match(migration, /can_manage_workflow/)
  assert.match(migration, /indicator_profiles/)
  assert.match(migration, /entry_value\s*->>\s*'answer'/)
  assert.match(migration, /limit 100/i)
  assert.match(migration, /revoke all on function public\.aureka_patient_linked_history/)
  assert.match(migration, /grant execute on function public\.aureka_patient_linked_history\(text\) to authenticated/)
})

test('In House Training is wired to the existing education domain and private PDF certificate flow', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const workspace = read('components/InHouseTrainingWorkspace.tsx')
  const migration = read('supabase/migrations/20261121150000_in_house_training_certificates.sql')

  assert.match(app, /InHouseTrainingWorkspace/)
  assert.match(app, /staffTab==='training'/)
  assert.match(app, /canAccessInHouseTraining/)
  assert.match(registry, /id:'in_house_training'.*status:'available'/)
  assert.match(workspace, /Lihat In House Training/)
  assert.match(workspace, /education_events/)
  assert.match(workspace, /education_participants/)
  assert.match(workspace, /staff_directory/)
  assert.match(workspace, /education_attendance/)
  assert.match(workspace, /Terbitkan Sertifikat PDF/)
  assert.match(workspace, /application\/pdf/)
  assert.match(workspace, /SHA-256/)
  assert.match(migration, /reserve_in_house_training_certificate/)
  assert.match(migration, /complete_in_house_training_certificate/)
  assert.match(migration, /can_manage_education/)
  assert.match(migration, /file_sha256/)
  assert.doesNotMatch(migration, /create table/i)
})

test('Secretariat opens with a Visual Intelligence landing and does not claim PIC invitations were sent', () => {
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  const registry = read('lib/aureka/module-registry.ts')

  assert.match(workspace, /VISUAL INTELLIGENCE · SEKRETARIAT/)
  assert.match(workspace, /Lihat Register Kegiatan/)
  assert.match(workspace, /Undangan, Materi, Absensi Digital, Notulensi, dan Gambar/)
  assert.match(workspace, /Pengiriman undangan langsung ke PIC unit belum diaktifkan/)
  assert.match(registry, /id:'secretariat'.*status:'beta'/)
})
