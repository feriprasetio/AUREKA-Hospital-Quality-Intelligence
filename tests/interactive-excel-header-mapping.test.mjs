import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveInteractiveExcelHeaderColumn,
  hydrateInteractiveExcelHeaderMappings,
  clearInteractiveExcelHeaderMappingScope,
} from '../lib/aureka/interactive-header-mapping.ts'

test('resolves a unique normalized header without prompting', () => {
  const columns = new Map([
    ['no. rm', 2],
    ['tanggal masuk', 4],
  ])
  const result = resolveInteractiveExcelHeaderColumn(columns, ['No. RM'], {
    importerKey: 'test',
    fieldKey: 'medicalRecordNo',
    chooseColumn: () => { throw new Error('must not prompt') },
  })
  assert.equal(result, 2)
})

test('prompts and resolves an unknown header by Excel column letter', () => {
  const columns = new Map([
    ['nomor', 1],
    ['no rekam medik pasien', 3],
  ])
  const result = resolveInteractiveExcelHeaderColumn(columns, ['No. Rekam Medis'], {
    importerKey: 'test',
    fieldKey: 'medicalRecordNo',
    chooseColumn: () => 'C',
  })
  assert.equal(result, 3)
})

test('prompts and resolves duplicate headers by physical column', () => {
  const columns = new Map([
    ['waktu tunggu', [6, 7]],
    ['tanggal', 1],
  ])
  const result = resolveInteractiveExcelHeaderColumn(columns, ['Waktu Tunggu'], {
    importerKey: 'test',
    fieldKey: 'consultationTime',
    chooseColumn: () => '7',
  })
  assert.equal(result, 7)
})

test('leaves an absent optional field unmapped', () => {
  const columns = new Map([['tanggal', 1]])
  const result = resolveInteractiveExcelHeaderColumn(columns, ['Catatan Tambahan'], {
    importerKey: 'test',
    fieldKey: 'notes',
    required: false,
    chooseColumn: () => { throw new Error('must not prompt') },
  })
  assert.equal(result, null)
})

test('cancellation does not silently map a column', () => {
  const columns = new Map([['custom header', 2]])
  assert.throws(
    () => resolveInteractiveExcelHeaderColumn(columns, ['No. Rekam Medis'], {
      importerKey: 'test',
      fieldKey: 'medicalRecordNo',
      chooseColumn: () => null,
    }),
    /belum diselesaikan/,
  )
})


test('server unit mapping overrides workbook header aliases and follows changed column order', () => {
  hydrateInteractiveExcelHeaderMappings(6, 2026, [{
    importer_key: 'igd',
    target_key: 'indicator:6.1',
    source_header: 'Kematian IGD ≤8h',
    occurrence: 1,
    mapping_status: 'approved',
  }])
  const columns = new Map([
    ['nama pasien', 2],
    ['kematian igd ≤8h', 17],
    ['tanggal masuk', 4],
  ])
  const result = resolveInteractiveExcelHeaderColumn(columns, ['Angka Kematian di IGD ≤ 8 Jam'], {
    importerKey: 'igd',
    fieldKey: 'indicator:6.1',
    fieldLabel: '6.1 · Kematian IGD ≤8h',
    chooseColumn: () => { throw new Error('saved unit mapping must resolve without prompting') },
  })
  assert.equal(result, 17)
  clearInteractiveExcelHeaderMappingScope()
})

test('missing configured unit header fails with a configuration-specific message instead of guessing', () => {
  hydrateInteractiveExcelHeaderMappings(6, 2026, [{
    importer_key: 'igd',
    target_key: 'indicator:6.1',
    source_header: 'Kematian IGD ≤8h',
    occurrence: 1,
    mapping_status: 'approved',
  }])
  const columns = new Map([['nama pasien', 2], ['tanggal masuk', 4]])
  assert.throws(
    () => resolveInteractiveExcelHeaderColumn(columns, ['Angka Kematian di IGD ≤ 8 Jam'], {
      importerKey: 'igd',
      fieldKey: 'indicator:6.1',
      fieldLabel: '6.1 · Kematian IGD ≤8h',
      chooseColumn: () => 'A',
    }),
    /Pusat Pemetaan Excel/,
  )
  clearInteractiveExcelHeaderMappingScope()
})
