import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRepoMigrations, reconcileMigrations } from '../scripts/audit-supabase-migration-ledger.mjs'

test('migration auditor distinguishes exact, timestamp aliases and unresolved entries without applying SQL', () => {
  const repo = parseRepoMigrations([
    '20261122140000_recommendation_code_sequence_integrity.sql',
    '20261122150000_signup_active_rooms_column_rls.sql',
    '20261122160000_admin_password_reset_server_rate_limit.sql',
    '20261122170000_quality_records_room_year_sort_performance.sql',
  ])
  const deployed = [
    { version: '20261121142958', name: 'recommendation_code_sequence_integrity' },
    { version: '20261122150000', name: 'signup_active_rooms_column_rls' },
    { version: '20261121143335', name: 'admin_password_reset_server_rate_limit' },
    { version: '20261121050000', name: 'untracked_function_patch' },
  ]
  const result = reconcileMigrations(repo, deployed)
  assert.deepEqual(result.summary, {
    exact: 1, renamedVersionCandidates: 2, ambiguous: 0,
    versionConflicts: 0, productionOnly: 1, repositoryOnly: 1,
  })
  assert.equal(result.renamedVersionCandidates[0].production.version, '20261121142958')
  assert.equal(result.productionOnly[0].name, 'untracked_function_patch')
  assert.equal(result.repositoryOnly[0].name, 'quality_records_room_year_sort_performance')
})

test('migration auditor refuses duplicate version IDs in either source', () => {
  assert.throws(() => reconcileMigrations(
    parseRepoMigrations(['20261121120000_first.sql', '20261121120000_second.sql']), [],
  ), /Duplicate repository migration version/)
  assert.throws(() => reconcileMigrations([], [
    { version: '20261121120000', name: 'first' },
    { version: '20261121120000', name: 'second' },
  ]), /Duplicate deployed version/)
})

test('one repository migration matching multiple deployed names is ambiguous, never silently treated as applied', () => {
  const result = reconcileMigrations(parseRepoMigrations(['20261122100000_shared_name.sql']), [
    { version: '20261121100000', name: 'shared_name' },
    { version: '20261121100100', name: 'shared_name' },
  ])
  assert.equal(result.summary.ambiguous, 2)
  assert.equal(result.summary.repositoryOnly, 1)
  assert.equal(result.summary.renamedVersionCandidates, 0)
})

test('same timestamp but different name is a conflict, not a match', () => {
  const result = reconcileMigrations(parseRepoMigrations(['20261122100000_correct_migration.sql']), [
    { version: '20261122100000', name: 'different_migration' },
  ])
  assert.equal(result.summary.versionConflicts, 1)
  assert.equal(result.summary.exact, 0)
})

test('migration auditor rejects invalid filenames and ledger inputs', () => {
  assert.throws(() => parseRepoMigrations(['not_valid.sql']), /Invalid migration filename/)
  assert.throws(() => reconcileMigrations([], [{ version: '42', name: 'x' }]), /Invalid deployed migration entry/)
})
