import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Orientasi Mahasiswa is active under Pendidikan dan Pelatihan', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const home = read('components/HomeClient.tsx')
  assert.match(registry, /id:'student_orientation', label:'Orientasi Mahasiswa', moduleId:'staff', childId:'student-orientation', status:'available'/)
  assert.match(home, /id:'education-training',label:'Pendidikan dan Pelatihan'/)
  assert.match(home, /childId==='student-orientation'/)
  assert.match(home, /section==='student-orientation'/)
  assert.match(home, /staffTab==='student-orientation'/)
  assert.ok(home.includes("canManage={['ADMIN','PMKP','MANAGEMENT','KABID'].includes(role||'')}") )
})

test('student roster is queried live from Tim Koordinasi Pendidikan logbooks', () => {
  const workspace = read('components/StudentOrientationWorkspace.tsx')
  assert.ok(workspace.includes(".from('quality_records')"))
  assert.ok(workspace.includes(".eq('room_id', 30)"))
  assert.ok(workspace.includes(".eq('measurement_grain', 'activity')"))
  assert.ok(workspace.includes("form['Nama Mahasiswa']"))
  assert.ok(workspace.includes('source_quality_record_id'))
  assert.ok(workspace.includes(".from('education_participants')"))
  assert.ok(!workspace.includes(".from('student_orientation_records')"))
  assert.ok(!workspace.includes(".from('staff_directory')"))
})

test('orientation participant and certificate records reuse the existing AUREKA education domain', () => {
  const workspace = read('components/StudentOrientationWorkspace.tsx')
  const migration = read('supabase/migrations/20261121120000_student_orientation_workspace.sql')
  assert.ok(workspace.includes(".from('education_events')"))
  assert.ok(workspace.includes(".from('education_participants')"))
  assert.ok(workspace.includes(".from('education_certificates')"))
  assert.ok(workspace.includes("storage.from('aureka-exports')"))
  assert.ok(workspace.includes("reserve_student_orientation_certificate"))
  assert.ok(workspace.includes("complete_student_orientation_certificate"))
  assert.ok(workspace.includes('window.open'))
  assert.ok(migration.includes('alter table aureka_system.education_participants'))
  assert.ok(migration.includes('references aureka_quality.quality_records') || migration.includes('source_quality_record_id'))
  assert.ok(migration.includes('education_certificate_counters'))
  assert.ok(migration.includes('reserve_student_orientation_certificate'))
  assert.ok(migration.includes('complete_student_orientation_certificate'))
  assert.ok(migration.includes('can_manage_education()'))
  assert.ok(migration.includes('can_access_room_or_global(30)'))
  assert.ok(!migration.includes('create table if not exists aureka_quality.student_orientation_records'))
  assert.ok(!migration.includes('patient_index'))
})

test('certificate PDF is generated and saved to private export storage with SHA-256 verification', () => {
  const workspace = read('components/StudentOrientationWorkspace.tsx')
  const migration = read('supabase/migrations/20261121120000_student_orientation_workspace.sql')
  assert.ok(workspace.includes("createCertificatePdf"))
  assert.ok(workspace.includes("crypto.subtle.digest('SHA-256'"))
  assert.ok(workspace.includes("contentType: 'application/pdf'"))
  assert.ok(workspace.includes("createSignedUrl(objectPath, 600)"))
  assert.ok(migration.includes("bucket_id = 'aureka-exports'"))
  assert.ok(migration.includes("p_file_sha256"))
})


test('follow-up migration removes globally scoped orientation checks from shared education participants', () => {
  const migration = read('supabase/migrations/20261121130000_student_orientation_constraint_scope.sql')
  assert.ok(migration.includes('drop constraint if exists education_participants_orientation_role_check'))
  assert.ok(migration.includes('drop constraint if exists education_participants_orientation_materials_check'))
  assert.ok(migration.includes('drop constraint if exists education_participants_orientation_notes_check'))
})
