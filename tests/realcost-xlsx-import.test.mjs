import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { REALCOST_COST_COMPONENTS } from '../lib/aureka/realcost-engine.ts'
import {
  extractRealcostBillingGroup,
  prepareRealcostImport,
  realcostDate,
  realcostNumber,
} from '../lib/aureka/realcost-xlsx-import.ts'

if (!globalThis.crypto) globalThis.crypto = webcrypto

function makeGrid() {
  const headers = [
    'NAMA_PASIEN','MRN','SEP','DPJP','NOKARTU','CODER_ID','C1','ADMISSION_DATE',
    'DISCHARGE_DATE','INACBG','DESKRIPSI_INACBG','TARIF_INACBG','TARIF_RS',
    'TOTAL_TARIF','TARIF_POLI_EKS','LOS','KELAS_RAWAT','ICU_INDIKATOR',
    'ICU_LOS','VENT_HOUR','DISCHARGE_STATUS','DIAGLIST','PROCLIST','C2',
    ...REALCOST_COST_COMPONENTS.map(item => item.key),
  ]
  const costs = Object.fromEntries(REALCOST_COST_COMPONENTS.map(item => [item.key, 0]))
  costs.KAMAR_AKOMODASI = 60
  costs.OBAT = 40
  const billing = Object.fromEntries(REALCOST_COST_COMPONENTS.map(item => [item.billingKey, String(costs[item.key])]))
  const c2 = 'prefix#{"total_tarif_rs":"100","billing_group":' + JSON.stringify(billing) + '}'
  const row = [
    'Pasien Contoh','00-00-01','SEP-001','dr. Contoh','KARTU-01','CODER-1','C1-001',
    new Date('2025-01-01T00:00:00Z'),new Date('2025-01-03T00:00:00Z'),
    'A-4-10-I','Contoh INA-CBG',80,100,80,0,2,'3','0',0,0,'1','A00.1;B00.2','PROC01',c2,
    ...REALCOST_COST_COMPONENTS.map(item => costs[item.key]),
  ]
  const second = [...row]
  second[0] = 'Nama Sama'
  second[1] = '00-00-01'
  second[2] = 'SEP-002'
  second[6] = 'C1-002'
  return [headers, row, second]
}

test('locale-aware numeric and date parsing preserves Indonesian workbook values', () => {
  assert.equal(realcostNumber('1.234.567'), 1234567)
  assert.equal(realcostNumber('1.234,56'), 1234.56)
  assert.equal(realcostNumber('(2.500,00)'), -2500)
  assert.equal(realcostDate('2025-02-28'), '2025-02-28')
  assert.equal(realcostDate('31/02/2025'), null)
})

test('C2 parser extracts nested billing_group and TARIF_RS total', () => {
  const result = extractRealcostBillingGroup('x#{"total_tarif_rs":"100","billing_group":{"room_amt":"60","drug_amt":"40"}}')
  assert.equal(result.total_tarif_rs, 100)
  assert.equal(result.billing_group.room_amt, 60)
  assert.equal(result.billing_group.drug_amt, 40)
})

test('workbook import separates patient identities and never deduplicates repeated MRN episodes', async () => {
  const result = await prepareRealcostImport(makeGrid(), 'Raw')
  assert.equal(result.findings.source_rows, 2)
  assert.equal(result.findings.valid_rows, 2)
  assert.equal(result.findings.invalid_rows, 0)
  assert.equal(result.episodes.length, 2)
  assert.equal(result.identities.length, 2)
  assert.equal(result.identities[0].medical_record_number, '00-00-01')
  assert.equal(result.identities[1].medical_record_number, '00-00-01')
  assert.notEqual(result.episodes[0].episode_key_hash, result.episodes[1].episode_key_hash)
  assert.equal('NAMA_PASIEN' in (result.episodes[0].source_payload ?? {}), false)
  assert.equal('MRN' in (result.episodes[0].source_payload ?? {}), false)
  assert.equal('SEP' in (result.episodes[0].source_payload ?? {}), false)
  assert.equal('C2' in (result.episodes[0].source_payload ?? {}), false)
})

test('duplicate episode SEP is rejected rather than silently counted twice', async () => {
  const grid = makeGrid()
  grid[2][2] = grid[1][2]
  const result = await prepareRealcostImport(grid, 'Raw')
  assert.equal(result.findings.valid_rows, 1)
  assert.equal(result.findings.duplicate_episode_keys, 1)
  assert.equal(result.findings.invalid_rows, 1)
})
