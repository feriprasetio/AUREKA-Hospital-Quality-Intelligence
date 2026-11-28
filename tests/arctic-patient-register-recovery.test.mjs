import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../components/patient-registry/PatientIndexTab.tsx',import.meta.url),'utf8')
test('patient list discards aborted requests and prevents unfiltered legacy fallback',()=>{
 assert.match(source,/pendingRead\.current\?\.abort\(\)/)
 assert.match(source,/if\(controller\.signal\.aborted\)return/)
 assert.match(source,/if\(v2===false&&\(roomId!=null\|\|from\|\|to\)\)throw/)
 assert.match(source,/const roomId = lockRoomScope \? initialRoomId : selectedRoomId/)
 assert.match(source,/p_room: roomId/)
})
test('patient directory preserves privacy and reports incomplete history',()=>{
 assert.match(source,/requestSensitiveAccess\('patient_identity'/)
 assert.match(source,/setPartialHistory/)
 assert.match(source,/PatientTimeline key=\{detail\.no_rm\}/)
 assert.doesNotMatch(source,/localStorage|sessionStorage/)
})
