import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('five domain registers reuse the opt-in summary contract; official sources remain wired',()=>{
 const domains=[
 ['components/QualityReportingMonitor.tsx','readAurekaQualityRoomReportingStatus'],
 ['components/PicPerformanceWorkspace.tsx','aureka_pic_performance_dashboard'],
 ['components/SpmWorkspace.tsx','calculateSpmMonthly'],
 ['components/governance/GovernanceProgramWorkspace.tsx','aureka_gov_program_list'],
 ['components/governance/AuditLogWorkspace.tsx','aureka_gov_audit_log']]
 for(const [path,source] of domains){const s=read(path);assert.ok(s.includes('ContinuumSummary'),path);assert.ok(s.includes('dataFirst'),path);assert.ok(s.includes(source),path)}
 assert.match(read('components/workspace/ContinuumSummary.tsx'),/enabled\?<details/)
 assert.match(read('components/SpmWorkspace.tsx'),/linkedUnsupported\?'Sumber per unit belum dipetakan'/)
 assert.match(read('components/governance/AuditLogWorkspace.tsx'),/if\(!isCurrent\(\)\)return/)
 assert.match(read('components/workspace/WorkspaceTableViewport.tsx'),/event.target!==event.currentTarget/)
})
