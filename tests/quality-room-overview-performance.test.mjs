import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { aggregateRoomOverviewCounts } from '../lib/aureka/room-overview.ts'

test('quality overview sums all month and grain rows without per-room REST queries', () => {
  const rooms = [{ id: 6 }, { id: 11 }, { id: 20 }]
  const monthly = [
    { room_id: 6, total: '10', month: 1, measurement_grain: 'patient_episode' },
    { room_id: 6, total: 5, month: 2, measurement_grain: 'patient_episode' },
    { room_id: 6, total: '4', month: 2, measurement_grain: 'daily_metric' },
    { room_id: 11, total: '7', month: 3, measurement_grain: 'activity' },
  ]
  assert.deepEqual(aggregateRoomOverviewCounts(rooms, monthly), [
    { roomId: 6, records: 19 }, { roomId: 11, records: 7 }, { roomId: 20, records: 0 },
  ])
})

test('quality overview rejects invalid counts, rather than silently presenting zero', () => {
  assert.throws(() => aggregateRoomOverviewCounts([{ id: 1 }], [{ room_id: 1, total: -1 }]), /Invalid/)
  assert.throws(() => aggregateRoomOverviewCounts([{ id: 1 }], [{ room_id: 1, total: 'NaN' }]), /Invalid/)
  assert.throws(() => aggregateRoomOverviewCounts([{ id: 1 }], [{ room_id: 1, total: '9007199254740992' }]), /Invalid/)
})

test('admin overview uses a single existing authorized aggregate, avoiding N+1 REST calls', async () => {
  const source = await readFile(new URL('../components/QualityIndicatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /sb\.rpc\('aureka_quality_room_month_counts',\{p_year:year,p_grain:null\}\)/)
  assert.match(source, /aggregateRoomOverviewCounts\(rooms,data\?\?\[\]\)/)
  assert.doesNotMatch(source, /Promise\.all\(rooms\.map\(async room=>/)
  assert.doesNotMatch(source, /\.select\('id',\{count:'exact',head:true\}\)\s*\.eq\('room_id',room\.id\)/)
  assert.match(source, /records:null/)
})


test('overview refetches only when semantic room membership changes, not array identity', async () => {
  const source = await readFile(new URL('../components/QualityIndicatorWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /const roomKey=rooms\.map\(r=>r\.id\+':'\+r\.name\)\.join\('\|'\)/)
  assert.match(source, /\},\[isAdmin,initialRoomId,roomId,roomKey,year\]\)/)
  assert.doesNotMatch(source, /\},\[isAdmin,initialRoomId,roomId,rooms,year\]\)/)
})
