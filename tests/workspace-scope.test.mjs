import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWorkspaceRoomId, resolveAdminWorkspaceRoomId } from '../lib/aureka/workspace-scope.ts'

const rooms = [{ id: 7, name: 'IGD' }, { id: 3, name: 'Farmasi' }, { id: 9, name: 'Laboratorium' }]

test('normalizes only positive safe room identifiers', () => {
  assert.equal(normalizeWorkspaceRoomId('7'), 7)
  assert.equal(normalizeWorkspaceRoomId(0), null)
  assert.equal(normalizeWorkspaceRoomId(-1), null)
  assert.equal(normalizeWorkspaceRoomId('not-a-room'), null)
  assert.equal(normalizeWorkspaceRoomId(Number.MAX_SAFE_INTEGER + 1), null)
})

test('prefers a valid selected room and rejects stale room ids', () => {
  assert.equal(resolveAdminWorkspaceRoomId(rooms, [999, '3', 7]), 3)
})

test('falls back to the first room when no candidate is valid', () => {
  assert.equal(resolveAdminWorkspaceRoomId(rooms, [null, 999]), 7)
  assert.equal(resolveAdminWorkspaceRoomId([], [7]), null)
})
