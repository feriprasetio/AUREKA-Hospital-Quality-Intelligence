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
})

test('student names are read from Tim Koordinasi Pendidikan quality logbooks', () => {
  const workspace = read('components/StudentOrientationWorkspace.tsx')
  assert.match(workspace, /from\\('quality_records'\\)/)
  assert.match(workspace, /\\.eq\\('room_id', 30\\)/)
  assert.match(workspace, /\\.eq\\('measurement_grain', 'activity'\\)/)
  assert.match(workspace, /Nama Mahasiswa/)
  assert.match(workspace, /source_quality_record_id/)
  assert.match(workspace, /onConflict: 'source_quality_record_id'/)
  assert.doesNotMatch(workspace, /\\.from\\('staff_directory'\\)/)
})

test('orientation certificates use a guarded database number and browser PDF print flow', () => {
  const workspace = read('components/StudentOrientationWorkspace.tsx')
  const migration = read('supabase/migrations/20261121120000_student_orientation_workspace.sql')
  assert.match(workspace, /issue_student_orientation_certificate/)
  assert.match(workspace, /window\\.print\\(\\)/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /issue_student_orientation_certificate/)
  assert.match(migration, /REVOKE ALL ON FUNCTION/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION .* TO authenticated/i)
  assert.match(migration, /current_role_code\\(\\)/i)
  assert.match(migration, /has_quality_room_access\\(30\\)/i)
})

test('orientation metadata remains linked to non-patient source records', () => {
  const migration = read('supabase/migrations/20261121120000_student_orientation_workspace.sql')
  assert.match(migration, /references aureka_quality\\.quality_records\\(id\\)/i)
  assert.match(migration, /source\\.room_id = 30/i)
  assert.match(migration, /measurement_grain = 'activity'/i)
  assert.match(migration, /guard_student_orientation_source/)
  assert.doesNotMatch(migration, /patient_index/i)
})
