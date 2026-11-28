import assert from 'node:assert/strict'
import test from 'node:test'
import { readAurekaQualityRoomReportingStatus } from '../lib/aureka/metric-contracts.ts'

const row = { room_id: '1', month: 11, total: '4', latest_report_at: null, latest_period: null }
const read = data => readAurekaQualityRoomReportingStatus({ rpc: async () => ({ data }) }, 2026)

test('accepts empty reporting and exact numeric strings from the RPC', async () => {
  assert.deepEqual((await read([])).data, [])
  assert.deepEqual((await read([row])).data, [{ ...row, room_id: 1, total: 4 }])
})

test('reports incomplete or duplicate response as unavailable', async () => {
  for (const data of [[row, null], [row, row], [{ ...row, month: 13 }], [{ ...row, total: '' }]]) {
    const result = await read(data)
    assert.equal(result.status, 'unavailable')
    assert.equal(result.data, null)
  }
})
