import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('operational records display reverse RTL references without creating a second action',()=>{
 for(const p of ['components/RiskManagementWorkspace.tsx','components/PatientSafetyWorkspace.tsx','components/ClinicalPathwayWorkspace.tsx','components/ClinicalDeathAuditWorkspace.tsx']) assert.match(read(p),/<SourceLinkedActionsPanel/)
 const panel=read('components/governance/SourceLinkedActionsPanel.tsx')
 assert.match(panel,/aureka_source_linked_actions/)
 assert.doesNotMatch(panel,/\.insert\(|\.update\(|aureka_gov_save_action/)
})
