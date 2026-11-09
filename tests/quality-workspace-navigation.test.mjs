import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('quality audit navigation keeps audit areas in the sidebar and moves views into workspace tabs', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /quality:\s*\[\s*\{id:'audit-indicators',label:'Audit Indikator Mutu'\}/)
  assert.doesNotMatch(home, /id:'result-indicators'|id:'logbook-indicators'/)
  assert.match(home, /aria-label="Tampilan audit mutu"/)
  assert.match(home, />Form Logbook<\/button>/)
  assert.match(home, />Hasil Capaian<\/button>/)
  assert.match(home, /setQualityResultsView\(mode\)/)
  assert.match(home, /if\(moduleId==='quality'\)return qualityResultsView==='pathway'\|\|clinicalPathwayOpen\?'audit-pathway'/)
})

test('every non-validator unit logbook exposes a guarded add-note action', () => {
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(quality, /!isValidator&&roomId!=null&&<button[^>]*aqAddButton/)
  assert.doesNotMatch(quality, /!\(roomId===7\)|\[1,3,4,9,11,12\]/)
  assert.match(quality, /const newPatient=\(requestedRoomId\?:number/)
  assert.match(quality, /if\(!layout\)\{\s*setMessage\('Template logbook untuk unit ini belum tersedia/)
})

test('Solid White sidebar is compact on desktop while mobile remains single-column', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /grid-template-columns:\s*248px minmax\(0, 1fr\) !important/)
  assert.match(css, /\.workspaceRoot:not\(\.sidebarIsCollapsed\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/)
  assert.match(css, /\.qualityWorkspaceTabs/)
})

test('selected quality unit is shared by Form Logbook and Hasil Capaian', () => {
  const home = read('components/HomeClient.tsx')
  const logbook = read('components/QualityIndicatorWorkspace.tsx')
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.match(home, /selectedQualityRoomId,setSelectedQualityRoomId/)
  assert.match(home, /effectiveQualityRoomId/)
  assert.match(home, /initialRoomId=\{effectiveQualityRoomId\}/g)
  assert.match(home, /onRoomChange=\{setSelectedQualityRoomId\}/g)
  assert.match(logbook, /onRoomChange\?:\(roomId:number\|null\)=>void/)
  assert.match(logbook, /onRoomChange\?\.\(roomId\)/)
  assert.ok(logbook.indexOf('const initial=normalizeRoomIdValue(initialRoomId)') < logbook.indexOf('if(isAdmin){'))
  assert.match(results, /onRoomChange\?: \(roomId: number \| null\) => void/)
  assert.match(results, /onRoomChange\?\.\(roomId\)/)
  assert.ok(results.indexOf('const initial = normalizeRoom(initialRoomId)') < results.indexOf('if (canViewAllRooms)'))
})
