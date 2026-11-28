import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261118050000_quality_reconciliation_center.sql')
const verifiedSourceMigration = read('supabase/migrations/20261118053000_quality_reconciliation_verified_source_warning.sql')
const workspace = read('components/QualityReconciliationWorkspace.tsx')
const home = read('components/HomeClient.tsx')

test('reconciliation queue is role-scoped, room-scoped, and groups pending responses by source pattern', () => {
  assert.match(migration, /quality_reconciliation_list\(\s*p_profile_year integer DEFAULT 2026,\s*p_room_id bigint DEFAULT NULL/)
  assert.match(migration, /COALESCE\(v_role,''\) NOT IN \('ADMIN','PMKP'\)/)
  assert.match(migration, /has_quality_room_access\(p_room_id\)/)
  assert.match(migration, /rr\.review_status = 'pending'/)
  assert.match(migration, /jsonb_agg/)
  assert.match(migration, /auto_fixable/)
})

test('bulk response mapping requires an exact unique target and preserves original source values', () => {
  assert.match(migration, /quality_reconciliation_apply_bulk/)
  assert.match(migration, /p_action NOT IN \('auto_exact','manual'\)/)
  assert.match(migration, /v_normalized_matches <> 1/)
  assert.match(migration, /source_master_conflict/)
  assert.match(migration, /original_source_code/)
  assert.match(migration, /UPDATE aureka_quality\.quality_record_responses/)
  assert.match(migration, /ARRAY\['indicator_values', v_profile_code\]/)
  assert.match(migration, /quality_reconciliation_audit/)
  assert.match(migration, /classified_by = v_user_id/)
})

test('clinical conflicts and null-coded master options are not auto-fixed', () => {
  assert.match(migration, /AND \(g\.source_code IS NULL OR g\.source_code = candidate\.target_code::text\)/)
  assert.match(migration, /g\.mapping_status NOT IN \('source_master_conflict','source_code_conflict','ambiguous_master','not_in_master'\)/)
  assert.match(workspace, /auto_fixable_group_count/)
  assert.match(workspace, /Perlu konfirmasi sebelum respons dapat dipetakan\./)
  assert.match(workspace, /applyResponseGroup\(item, 'manual'\)/)
})

test('non-clinical source warnings can only be accepted when a deterministic derived result is documented', () => {
  assert.match(migration, /accept_derived_value/)
  assert.match(migration, /cache formula\|formula\.\*error\|los\.\*berbeda/)
  assert.match(migration, /nilai turunan\|memakai tanggal/)
  assert.match(migration, /needs_source_correction/)
  assert.match(migration, /Telaah massal warning/)
  assert.match(workspace, /Terima hasil hitung ulang/)
  assert.match(workspace, /Tandai perlu koreksi sumber/)
})

test('stale ICU BHP/Linen warning can close only after every affected episode has verified 14.1 provenance', () => {
  assert.match(verifiedSourceMigration, /quality_reconciliation_list_v2/)
  assert.match(verifiedSourceMigration, /safe_existing_data/)
  assert.match(verifiedSourceMigration, /indicator_values'->'14\.1'->>'source_value'/)
  assert.match(verifiedSourceMigration, /form_fields'->>'Kekosongan BHP\/Linen'/)
  assert.match(verifiedSourceMigration, /source_bhp_linen'->>'source_value'/)
  assert.match(verifiedSourceMigration, /source_indicator_columns'->>'14\.1'/)
  assert.match(verifiedSourceMigration, /v_verified <> v_total/)
  assert.match(workspace, /Konfirmasi data sumber telah pulih/)
  assert.match(workspace, /quality_reconciliation_accept_verified_warning/)
})

test('reconciliation is available only to Admin/PMKP inside the Indikator Mutu module', () => {
  assert.match(home, /qualityReconciliationOpen/)
  assert.match(home, /role==='ADMIN'\|\|role==='PMKP'\?\[\{id:'quality-reconciliation',label:'Validasi dan Rekonsiliasi'\}\]/)
  assert.match(home, /if\(section==='quality-reconciliation'&&!admin&&role!=='PMKP'\)return null/)
  assert.match(home, /const accepted=authorizedWorkspaceSection\(moduleId,section\)\s+if\(accepted===null\)return false/)
  assert.match(home, /authorizedWorkspaceSection\(destination.module,destination.section\)===destination.section/)
  assert.match(home, /QualityReconciliationWorkspace/)
  assert.match(workspace, /role === 'ADMIN' \|\| role === 'PMKP'/)
})

test('warning review and bulk resolution require a confirmation, decision reason, and audit history', () => {
  assert.match(workspace, /await aurekaConfirm\(/)
  assert.match(workspace, /draft\?\.reason/)
  assert.match(workspace, /reason\.length < 10/)
  assert.match(workspace, /Riwayat rekonsiliasi/)
  assert.match(workspace, /recent_audit/)
})
