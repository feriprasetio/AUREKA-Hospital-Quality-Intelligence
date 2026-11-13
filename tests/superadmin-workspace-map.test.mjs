import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
const map = readFileSync(new URL('../components/workspace/WorkspaceModuleMap.tsx', import.meta.url), 'utf8')
const results = readFileSync(new URL('../components/QualityResultsWorkspace.tsx', import.meta.url), 'utf8')
const audit = readFileSync(new URL('../components/QualityIndicatorWorkspace.tsx', import.meta.url), 'utf8')
const patientRegistry = readFileSync(new URL('../components/PatientRegistryWorkspace.tsx', import.meta.url), 'utf8')

test('Superadmin starts with whole-hospital scope and can choose any room', () => {
  assert.match(home, /const \[allRoomsScope,setAllRoomsScope\]=useState\(true\)/)
  assert.match(home, /if\(raw==='all'\)\{updateWorkspaceRoom\(null\);return\}/)
  assert.match(home, /lockRoomScope=\{admin&&!allRoomsScope\}/)
})

test('every workspace sub-tab retains its navigation map, including modules with no explicit nodes', () => {
  assert.match(home, /const mapNodes=nodes\.length\?nodes:/)
  assert.match(home, /return <WorkspaceModuleMap/)
  assert.match(map, /PETA KERJA · NAVIGASI MODUL/)
  assert.match(map, /@media \(max-width: 760px\)/)
  assert.match(map, /:global\(html\[data-mode="gelap"\]\)/)
})

test('Superadmin logbook opens a privacy-safe index of every active room', () => {
  assert.match(audit, /if\(isAdmin\)return null/)
  assert.match(audit, /Logbook semua ruangan/)
  assert.match(audit, /select\('id',\{count:'exact',head:true\}\)/)
  assert.match(audit, /onRoomChange\?\.\(nextRoomId\)/)
  assert.match(audit, /data individual tidak ditampilkan/)
})

test('hospital-wide quality results include source fields required by operational indicators', () => {
  assert.match(results, /selectedRoom == null \|\| selectedRoom === 5 \|\| selectedRoom === 11/)
  assert.match(results, /calculateIndicatorResultsForProfiles/)
})

test('patient-entry workspace does not silently choose the first room', () => {
  assert.match(patientRegistry, /initialRoomId\|\|null/)
  assert.doesNotMatch(patientRegistry, /initialRoomId\|\|firstRoomWithData\|\|null/)
})
