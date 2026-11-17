import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settings = await readFile(new URL('../components/QualitySettings.tsx', import.meta.url), 'utf8')

test('profile workspace treats missing source targets as neutral instead of technical or approval failures', () => {
  assert.match(settings, /const hasNeutralTargetStatus = \(profile: Model\): boolean/)
  assert.match(settings, /schema\.target_not_defined_in_source === true/)
  assert.match(settings, /schema\.target_semantic_review_required === true/)
  assert.match(settings, /value="target_unavailable"/)
  assert.match(settings, /hasNeutralTargetStatus\(profile\)/)
})

test('metadata-ready profiles with no target are not mislabeled as fully target-ready', () => {
  assert.match(settings, /profileViewFilter === 'complete'[\s\S]*?hasNeutralTargetStatus\(profile\)/)
  assert.match(settings, /perbandingan target tidak dihitung sampai target ditetapkan/i)
})

test('profile workspace keeps red, amber, and neutral statuses visually distinct', () => {
  assert.match(settings, /needsMetadataReview\(profile\) \? '1px solid rgba\(184,52,52,.48\)'/)
  assert.match(settings, /needsTargetApproval\(profile\) \? '1px solid rgba\(190,125,35,.48\)'/)
  assert.match(settings, /hasNeutralTargetStatus\(profile\) \? '1px solid rgba\(100,116,139,.28\)'/)
})
