import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('the module-search button beside the workspace search bar is removed', () => {
  const source = read('components/HomeClient.tsx')
  assert.doesNotMatch(source, /CommandPalette|commandPaletteTrigger|commandItems/)
  assert.match(source, /Cari data dalam modul ini/)
  assert.match(source, /dispatchWorkspaceSearch\(e\.target\.value\)/)
})

test('workspace data search remains scoped to visible record-like content', () => {
  const source = read('components/HomeClient.tsx')
  assert.match(source, /\.moduleEnter\[data-workspace-container\]/)
  assert.match(source, /table tbody tr:not\(\.aqInlineEditorRow\)/)
  assert.match(source, /node\.closest\('\[aria-hidden="true"\]'\)/)
  assert.match(source, /searchResultsQuery===globalSearch\.trim\(\)/)
  assert.match(source, /jumpToSearchResult/)
})

test('Admin chat, AI chat and all-room announcements share one communication hub', () => {
  const source = read('components/HomeClient.tsx')
  assert.match(source, /workspaceCommunicationTrigger/)
  assert.match(source, /workspaceCommunicationTabs/)
  assert.match(source, />Chat Admin</)
  assert.match(source, />Chat AI</)
  assert.match(source, />Semua Ruangan</)
  assert.match(source, /TanyaAureka sb=\{sb\} page=\{currentContainer\} embedded/)
  assert.match(source, /sendMassAnnouncement/)
  assert.match(source, /roomsList\.map\(target=>\(\{room_id:target\.id/)
  assert.match(source, /Pengumuman berhasil dikirim ke/)
  assert.match(source, /if\(!admin\).*Pengumuman massal hanya dapat dikirim/)
})
