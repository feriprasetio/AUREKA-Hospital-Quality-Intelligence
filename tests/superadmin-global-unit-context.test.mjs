import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeClient.tsx')
const landing = read('components/HomeLandingWorkspace.tsx')
const overview = read('components/OverviewDashboard.tsx')
const qualityInput = read('components/QualityIndicatorWorkspace.tsx')
const qualityResults = read('components/QualityResultsWorkspace.tsx')
const safety = read('components/PatientSafetyWorkspace.tsx')
const risk = read('components/RiskManagementWorkspace.tsx')
const oppe = read('components/OppeAuditWorkspace.tsx')
const pathway = read('components/ClinicalPathwayWorkspace.tsx')
const qualitySettings = read('components/QualitySettings.tsx')
const metadata = read('components/MetadataStatisticsWorkspace.tsx')
const staffTeam = read('components/StaffTeamWorkspace.tsx')

test('Super Admin has one validated active room context for the entire workspace', () => {
  assert.match(home, /const validSelectedRoomId=selectedQualityRoomId!=null&&roomsList\.some\(item=>Number\(item\.id\)===Number\(selectedQualityRoomId\)\)\?selectedQualityRoomId:null/)
  assert.match(home, /const activeWorkspaceRoomId=admin\?\(validSelectedRoomId\?\?room\?\.id\?\?roomsList\[0\]\?\.id\?\?null\):\(room\?\.id\?\?null\)/)
  assert.match(home, /admin\?activeWorkspaceRoomName:manager\?'Seluruh rumah sakit'/)
  assert.match(home, /setSelectedQualityRoomId\(null\)/)
})

test('Welcome Page exposes a Super Admin-only unit selector and updates shared state', () => {
  assert.match(landing, /Unit kerja aktif untuk seluruh modul/)
  assert.match(landing, /value=\{roomId\?\?''\}/)
  assert.match(landing, /onRoomChange\(selected\)/)
  assert.match(home, /onRoomChange=\{updateSelectedQualityRoom\}/)
  assert.match(landing, /\{isAdmin\?/)
})

test('Welcome activity and infographic datasets follow the active unit', () => {
  assert.match(landing, /\.eq\('room_id',roomId\)/)
  assert.match(landing, /\.eq\('unit_id',roomId\)/)
  assert.match(landing, /\.eq\('owner_room_id',roomId\)/)
  assert.match(landing, /\.eq\('unit_name',roomName\|\|' '\)/)
})

test('all main operational workspaces receive the same room and are keyed by it', () => {
  assert.match(home, /PatientRegistryWorkspace key=\{'patient-registry-'\+activeWorkspaceRoomId\}[^\n]*initialRoomId=\{activeWorkspaceRoomId\}/)
  assert.match(home, /OppeAuditWorkspace key=\{'quality-oppe-fppe-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /ClinicalPathwayWorkspace key=\{'clinical-pathway-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /PatientSafetyWorkspace key=\{'safety-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /RiskManagementWorkspace key=\{'risk-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /MetadataStatisticsWorkspace key=\{'metadata-'\+activeWorkspaceRoomId\}[^\n]*initialRoomId=\{activeWorkspaceRoomId\}/)
})

test('quality input and results do not silently switch away from the selected Super Admin unit', () => {
  assert.match(home, /canViewAllRooms=\{role==='PMKP'\} onRoomChange=\{updateSelectedQualityRoom\} forceRoomScope=\{admin\}/)
  assert.match(home, /canViewAllRooms=\{role==='PMKP'\} onRoomChange=\{updateSelectedQualityRoom\}/)
  assert.match(qualityInput, /disabled=\{!isAdmin\|\|!rooms\.length\|\|forceRoomScope\}/)
  assert.match(qualityInput, /disabled=\{forceRoomScope\} onChange=\{\(e:any\)=>setUnitPickerRoomId/)
  assert.match(qualityResults, /if \(incoming != null && incoming !== roomId\) setRoomId\(incoming\)/)
})

test('Capaian Unit applies the active room to every operational sub-tab', () => {
  assert.match(landing, /roomId=\{isAdmin\?roomId:manager\?null:roomId\}/)
  assert.match(landing, /initialRoomId=\{isAdmin\?roomId:manager\?null:roomId\}/)
  assert.match(landing, /forceRoomScope=\{isAdmin\}/)
  assert.match(overview, /row\.room_id === roomId/)
  assert.match(overview, /norm\(row\.unit_name\) === norm\(roomName\)/)
})

test('patient safety scopes incidents, investigations, survey responses and input room options', () => {
  assert.match(safety, /visibleIncidents/)
  assert.match(safety, /visibleInvestigations/)
  assert.match(safety, /allResponses\.filter\(row => String\(row\.unit_name \|\| ''\)/)
  assert.match(safety, /const roomOptions = forceRoomScope/)
})

test('risk, OPPE and Clinical Pathway retain Super Admin permissions but lock unit scope', () => {
  assert.match(risk, /const scopedToUnit = forceRoomScope \|\| !canManageAll/)
  assert.match(risk, /disabled=\{forceRoomScope \|\| \(!canManageAll && initialRoomId != null\)\}/)
  assert.match(risk, /disabled=\{forceRoomScope\} onChange=\{e => setFmeaForm/)
  assert.match(oppe, /forceRoomScope \? \(initialRoomId \?\? initialRoom\) : canManage \? null/)
  assert.match(oppe, /disabled=\{forceRoomScope\}/)
  assert.match(pathway, /const roomId = forceRoomScope \? initialRoomId/)
  assert.match(pathway, /disabled=\{forceRoomScope\}/)
})

test('Metadata profile and team assignment subtabs inherit the selected unit', () => {
  assert.match(metadata, /initialRoomId=\{initialRoomId\} forceRoomScope=\{isSuperAdmin\}/)
  assert.match(metadata, /forceRoomScope=\{isSuperAdmin\}/)
  assert.match(qualitySettings, /if \(forceRoomScope\) setRoom\(initialRoomId == null \? '' : String\(initialRoomId\)\)/)
  assert.match(qualitySettings, /disabled=\{forceRoomScope\}/)
  assert.match(staffTeam, /if \(forceRoomScope && initialRoomId != null\) setRoomId\(Number\(initialRoomId\)\)/)
  assert.match(staffTeam, /disabled=\{loading \|\| busy \|\| forceRoomScope\}/)
})
