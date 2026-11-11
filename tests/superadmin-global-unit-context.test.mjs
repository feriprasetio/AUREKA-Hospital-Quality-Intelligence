import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeClient.tsx')
const landing = read('components/HomeLandingWorkspace.tsx')
const registry = read('components/PatientRegistryWorkspace.tsx')
const overview = read('components/OverviewDashboard.tsx')
const qualityInput = read('components/QualityIndicatorWorkspace.tsx')
const safety = read('components/PatientSafetyWorkspace.tsx')
const risk = read('components/RiskManagementWorkspace.tsx')
const oppe = read('components/OppeAuditWorkspace.tsx')
const fppe = read('components/FppeEvaluationWorkspace.tsx')
const pathway = read('components/ClinicalPathwayWorkspace.tsx')
const death = read('components/ClinicalDeathAuditWorkspace.tsx')
const metadata = read('components/MetadataStatisticsWorkspace.tsx')
const settings = read('components/QualitySettings.tsx')
const team = read('components/StaffTeamWorkspace.tsx')

test('Super Admin resolves one valid active unit and displays it in the workspace header', () => {
  assert.match(home, /resolveAdminWorkspaceRoomId\(roomsList,\[selectedQualityRoomId,room\?\.id\]\)/)
  assert.match(home, /const effectiveQualityRoomId=admin\?activeWorkspaceRoomId/)
  assert.match(home, /admin\?activeWorkspaceRoomName:manager\?'Seluruh rumah sakit'/)
  assert.match(home, /setSelectedQualityRoomId\(null\)/)
})

test('Welcome Page is the only Super Admin unit selector and persists the shared selection', () => {
  assert.match(home, /scopeToRoom=\{admin\} onRoomChange=\{updateSelectedQualityRoom\}/)
  assert.match(landing, /Unit kerja aktif untuk seluruh modul/)
  assert.match(landing, /value=\{roomId\?\?''\}/)
  assert.match(landing, /onRoomChange\?\.\(next\)/)
  assert.match(landing, /\{manager&&!scopeToRoom&&<div className="hlInfoFilter">/)
})

test('Welcome activity and infographic records use the active unit for Super Admin only', () => {
  assert.match(landing, /const infoRoomId = scopeToRoom \? roomId/)
  assert.match(landing, /if\(scopeToRoom&&!infoRoomId\)/)
  assert.match(landing, /scoped\(q\('aureka_quality','quality_records'[^\n]+,'room_id',roomId\)/)
  assert.match(landing, /'unit_name',roomName\|\|''\)/)
  assert.match(landing, /'unit_id',roomId\)/)
  assert.match(landing, /'owner_room_id',roomId\)/)
})

test('Main navigation propagates the same selected room to operational modules', () => {
  assert.match(home, /PatientRegistryWorkspace key=\{'patient-registry-'\+activeWorkspaceRoomId\}[^\n]*lockRoomScope=\{admin\}/)
  assert.match(home, /OppeAuditWorkspace key=\{'quality-oppe-fppe-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /ClinicalPathwayWorkspace key=\{'clinical-pathway-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /PatientSafetyWorkspace key=\{'safety-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /RiskManagementWorkspace key=\{'risk-'\+activeWorkspaceRoomId\}[^\n]*forceRoomScope=\{admin\}/)
  assert.match(home, /MetadataStatisticsWorkspace key=\{'metadata-'\+activeWorkspaceRoomId\}[^\n]*initialRoomId=\{activeWorkspaceRoomId\}/)
})

test('Register Pasien and all nested quality entry tabs cannot switch off the active unit', () => {
  assert.match(registry, /lockRoomScope = false/)
  assert.match(registry, /lockRoomScope \? String\(initialRoomId/)
  assert.match(registry, /canViewAllRooms && !lockRoomScope/)
  assert.match(registry, /forceRoomScope=\{lockRoomScope\}/)
  assert.match(qualityInput, /forceRoomScope\?:boolean/)
  assert.match(qualityInput, /disabled=\{!isAdmin\|\|!rooms\.length\|\|forceRoomScope\}/)
  assert.match(qualityInput, /disabled=\{forceRoomScope\} onChange=\{\(e:any\)=>setUnitPickerRoomId/)
  assert.match(qualityInput, /ClinicalDeathAuditWorkspace[^\n]*forceRoomScope=\{forceRoomScope\}/)
})

test('Capaian Unit overview and every subtab are scoped to the active unit', () => {
  assert.match(landing, /roomId=\{scopeToRoom\?roomId:manager\?null:roomId\}/)
  assert.match(landing, /initialRoomId=\{scopeToRoom\?roomId:manager\?null:roomId\}/)
  assert.match(landing, /forceRoomScope=\{scopeToRoom\}/)
  assert.match(overview, /row\.room_id === roomId/)
  assert.match(overview, /norm\(row\.unit_name\) === norm\(roomName\)/)
  assert.match(overview, /setIncidents\(\{ \.\.\.i, rows:/)
})

test('Patient Safety incident, investigation, survey and response tabs follow the selected unit', () => {
  assert.match(safety, /forceRoomScope = false/)
  assert.match(safety, /visibleIncidents/)
  assert.match(safety, /visibleInvestigations/)
  assert.match(safety, /allResponses\.filter\(row => String\(row\.unit_name/)
  assert.match(safety, /const roomOptions = forceRoomScope/)
  assert.match(safety, /disabled=\{forceRoomScope\}/)
})

test('Risk Register and FMEA keep Super Admin management permission but lock unit attribution', () => {
  assert.match(risk, /forceRoomScope = false/)
  assert.match(risk, /const scopedToUnit = forceRoomScope \|\| !canManageAll/)
  assert.match(risk, /disabled=\{forceRoomScope \|\| \(!canManageAll && initialRoomId != null\)\}/)
  assert.match(risk, /disabled=\{forceRoomScope\} onChange=\{e => setFmeaForm/)
})

test('OPPE and FPPE evaluation forms use the active selected unit', () => {
  assert.match(oppe, /forceRoomScope = false/)
  assert.match(oppe, /forceRoomScope \? initialRoom : canManage \? null/)
  assert.match(oppe, /disabled=\{forceRoomScope\}/)
  assert.match(oppe, /forceRoomScope=\{forceRoomScope\}/)
  assert.match(fppe, /forceRoomScope = false/)
  assert.match(fppe, /disabled=\{busy \|\| forceRoomScope\}/)
})

test('Clinical Pathway and Clinical Death subtabs cannot revert to all-unit scope', () => {
  assert.match(pathway, /forceRoomScope = false/)
  assert.match(pathway, /const roomId = forceRoomScope \? initialRoomId/)
  assert.match(pathway, /disabled=\{forceRoomScope\}/)
  assert.match(death, /forceRoomScope\?: boolean/)
  assert.match(death, /forceRoomScope \? initialRoomId/)
  assert.match(death, /disabled=\{!isAdmin \|\| forceRoomScope\}/)
})

test('Metadata indicator profiles and team assignment follow the active unit', () => {
  assert.match(metadata, /initialRoomId=\{initialRoomId\} forceRoomScope=\{isSuperAdmin\}/)
  assert.match(metadata, /forceRoomScope=\{isSuperAdmin\}/)
  assert.match(settings, /forceRoomScope = false/)
  assert.match(settings, /if \(forceRoomScope\) setRoom\(initialRoomId == null \? '' : String\(initialRoomId\)\)/)
  assert.match(settings, /disabled=\{forceRoomScope\}/)
  assert.match(team, /forceRoomScope = false/)
  assert.match(team, /if \(forceRoomScope && initialRoomId != null\) setRoomId\(Number\(initialRoomId\)\)/)
  assert.match(team, /disabled=\{loading \|\| busy \|\| forceRoomScope\}/)
})
