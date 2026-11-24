import test from 'node:test'
import assert from 'node:assert/strict'
import { headerSimilarity, fuzzyFindHeader, pickBestBlock } from '../lib/aureka/smart-workbook-block.ts'

test('singkatan umum RS dikenali sebagai judul yang sama', () => {
  assert.ok(headerSimilarity('Tgl Masuk', 'Tanggal Masuk') >= 0.95)
  assert.ok(headerSimilarity('No.RM', 'No. RM') >= 0.95)
  assert.ok(headerSimilarity('NO RM', 'Nomor Rekam Medis') >= 0.95)
  assert.ok(headerSimilarity('Dx', 'Diagnosis') >= 0.95)
  assert.ok(headerSimilarity('Nama Pasien', 'Tanggal Masuk') < 0.4)
})

test('fuzzyFindHeader tidak menebak bila dua kolom sama-sama mirip', () => {
  assert.equal(fuzzyFindHeader(['No', 'Tgl Masuk', 'Nama Ps'], ['tanggal masuk'])?.header, 'Tgl Masuk')
  assert.equal(fuzzyFindHeader(['Tanggal Masuk', 'Tanggal Keluar'], ['tanggal']), null)
  assert.equal(fuzzyFindHeader(['Kolom A', 'Kolom B'], ['tanggal masuk']), null)
})

const row = (n, ...texts) => ({ rowNumber: n, cells: texts.map((text, i) => ({ index: i + 1, text })) })

test('memilih baris judul tabel di bawah judul laporan, bukan baris 1', () => {
  const sheet = { name: 'Rekap Nov', rows: [
    row(1, 'LAPORAN INDIKATOR MUTU RUANG ANGGREK'),
    row(2, 'Bulan November 2026'),
    row(4, 'No', 'Tgl Masuk', 'No. RM', 'Nama Pasien', 'Kepatuhan Identifikasi Pasien', 'Ket'),
    row(5, '1', '01/11/2026', '123456', 'A', 'Ya', ''),
    row(6, '2', '02/11/2026', '123457', 'B', 'Tidak', ''),
  ] }
  const targets = [['tanggal masuk', 'tanggal'], ['no rm', 'nomor rekam medis'], ['nama pasien'], ['Kepatuhan Identifikasi Pasien']]
  const pick = pickBestBlock([sheet], targets)
  assert.equal(pick?.headerRow, 4)
  assert.equal(pick?.matched, 4)
})

test('memilih sheet yang isinya cocok dengan form unit walau namanya bebas', () => {
  const cover = { name: 'Petunjuk', rows: [row(1, 'Cara mengisi', 'Contoh'), row(2, 'Isi tiap hari', 'Ya')] }
  const other = { name: 'Sheet2', rows: [row(1, 'Nama Barang', 'Jumlah', 'Harga'), row(2, 'Kasa', '10', '5000'), row(3, 'Spuit', '3', '2000')] }
  const real = { name: 'Sheet3', rows: [row(1, 'Tanggal', 'No RM', 'Waktu Tanggap (menit)'), row(2, '2026-11-01', '1', '4'), row(3, '2026-11-02', '2', '6')] }
  const pick = pickBestBlock([cover, other, real], [['tanggal'], ['nomor rekam medis'], ['waktu tanggap']])
  assert.equal(pick?.sheet, 'Sheet3')
})

test('kode angka tidak ditebak ke kolom hari 1..31', () => {
  assert.equal(fuzzyFindHeader(['1', '2', '3', 'Nama'], ['1.1']), null)
})
