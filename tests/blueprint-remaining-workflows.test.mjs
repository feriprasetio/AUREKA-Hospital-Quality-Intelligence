import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Clinical Pathway retrieves patient-episode candidates from linked logbooks and carries source provenance',()=>{
  const workspace=read('components/ClinicalPathwayWorkspace.tsx')
  const migration=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  assert.match(workspace,/aureka_clinical_pathway_patient_candidates/)
  assert.match(workspace,/Kandidat pasien dari logbook/)
  assert.match(workspace,/Perlu verifikasi klinis/)
  assert.match(workspace,/source_quality_record_id: form\.source_quality_record_id/)
  assert.match(migration,/add column if not exists source_quality_record_id uuid/)
  assert.match(migration,/measurement_grain='patient_episode'/)
  assert.match(migration,/has_quality_room_access\(qr\.room_id\)/)
  assert.match(migration,/requires_clinical_review/)
  assert.match(migration,/grant execute on function public\.aureka_clinical_pathway_patient_candidates/)
})

test('Reactive FMEA is linked one-to-one to the source incident and writes through guarded RPCs',()=>{
  const home=read('components/HomeClient.tsx')
  const workspace=read('components/ReactiveFmeaWorkspace.tsx')
  const migration=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  const writeGuard=read('supabase/migrations/20261122130000_complete_workflow_write_guard.sql')
  assert.match(home,/ReactiveFmeaWorkspace/)
  assert.match(home,/active==='safety'&&safetyTab==='fmea-reactive'/)
  assert.match(workspace,/aureka_reactive_fmea_save/)
  assert.match(workspace,/aureka_reactive_fmea_update_status/)
  assert.match(workspace,/source_incident_id/)
  assert.match(migration,/fmea_analyses_source_incident_unique/)
  assert.match(migration,/fmea_reactive_manager_guard/)
  assert.match(migration,/aureka_patient_safety\.can_manage_workflow\(\)/)
  assert.match(writeGuard,/password_rotation_complete\(\)/)
  assert.match(writeGuard,/Insiden ini sudah memiliki analisis FMEA Reaktif/)
  assert.match(writeGuard,/revoke all on function public\.aureka_reactive_fmea_save\(jsonb\) from public,anon/)
})

test('Secretariat distributes in-app invitations to active PIC accounts with response capture',()=>{
  const home=read('components/HomeClient.tsx')
  const workspace=read('components/governance/SecretariatInvitationWorkspace.tsx')
  const migration=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  const writeGuard=read('supabase/migrations/20261122130000_complete_workflow_write_guard.sql')
  assert.match(home,/SecretariatInvitationWorkspace/)
  assert.match(workspace,/aureka_pmkp_list_pic_recipients/)
  assert.match(workspace,/aureka_pmkp_send_meeting_invitation/)
  assert.match(workspace,/aureka_pmkp_respond_meeting_invitation/)
  assert.match(workspace,/Kotak Masuk Undangan/)
  assert.match(workspace,/tidak dilakukan/)
  assert.match(migration,/delivery_status='sent'/)
  assert.match(migration,/invited_user_id/)
  assert.match(writeGuard,/response_status/)
  assert.match(writeGuard,/invited_user_id=auth\.uid\(\)/)
  assert.match(writeGuard,/invitation_response/)
})

test('Staff directory offers permission-scoped cross-module profile without attributing anonymous survey responses',()=>{
  const directory=read('components/StaffDirectoryWorkspace.tsx')
  const panel=read('components/StaffCrossModuleProfilePanel.tsx')
  const migration=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  assert.match(directory,/Profil lintas modul/)
  assert.match(directory,/StaffCrossModuleProfilePanel/)
  assert.match(panel,/aureka_staff_cross_module_profile/)
  assert.match(panel,/Respons anonim tidak ditautkan/)
  assert.match(migration,/aureka_staff_cross_module_profile/)
  assert.match(migration,/identity_mode='named'/)
  assert.match(migration,/staff_team_assignments/)
  assert.match(migration,/oppe_fppe_evaluations/)
  assert.match(migration,/patient_safety_incident/)
})

test('Annual program includes an editable month-based Gantt timeline over governed activity records',()=>{
  const home=read('components/governance/AnnualProgramWorkspace.tsx')
  const migration=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  assert.match(home,/Timeline kegiatan tahunan/)
  assert.match(home,/annualTimelineTrack/)
  assert.match(home,/aureka_gov_program_activity_list/)
  assert.match(home,/aureka_gov_program_activity_save/)
  assert.match(migration,/annual_program_activities/)
  assert.match(migration,/annual_program_activities_rpc_only/)
  assert.match(migration,/Rentang kegiatan harus berada dalam tahun program/)
})

test('new blueprint workflow RPCs are authenticated-only',()=>{
  const first=read('supabase/migrations/20261122100000_complete_blueprint_workflows.sql')
  const second=read('supabase/migrations/20261122130000_complete_workflow_write_guard.sql')
  for(const fn of [
    'aureka_clinical_pathway_patient_candidates',
    'aureka_gov_program_activity_list',
    'aureka_gov_program_activity_save',
    'aureka_pmkp_list_pic_recipients',
    'aureka_pmkp_send_meeting_invitation',
    'aureka_staff_cross_module_profile'
  ]) assert.ok(first.includes('revoke all on function public.'+fn))
  for(const fn of [
    'aureka_pmkp_respond_meeting_invitation',
    'aureka_reactive_fmea_save',
    'aureka_reactive_fmea_update_status'
  ]) assert.ok(second.includes('revoke all on function public.'+fn))
})
