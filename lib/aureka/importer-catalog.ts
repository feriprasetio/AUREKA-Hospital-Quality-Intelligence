export type ImporterFieldDefinition = {
  fieldKey: string
  label: string
  defaultHeader: string
  required?: boolean
}
export type ImporterIndicatorMapping = {
  code: string
  title: string
  defaultHeader: string
}
export type UnitImporterDefinition = {
  roomId: number
  importerKey: string
  label: string
  workbookLabel: string
  sheetName: string
  headerRow: number
  dataStartRow: number
  fields: ImporterFieldDefinition[]
  indicators: ImporterIndicatorMapping[]
}

const commonEpisodeFields: ImporterFieldDefinition[] = [
  { fieldKey: 'No', label: 'Nomor baris sumber', defaultHeader: 'No', required: false },
  { fieldKey: 'No.', label: 'Nomor baris sumber', defaultHeader: 'No.', required: false },
  { fieldKey: 'Nama Pasien', label: 'Nama pasien', defaultHeader: 'Nama Pasien', required: false },
  { fieldKey: 'No. Rekam Medis', label: 'Nomor rekam medis', defaultHeader: 'No. Rekam Medis', required: false },
  { fieldKey: 'Tanggal', label: 'Tanggal pengamatan', defaultHeader: 'Tanggal', required: false },
  { fieldKey: 'DPJP', label: 'Dokter penanggung jawab', defaultHeader: 'DPJP', required: false },
]

export const UNIT_IMPORTER_CATALOG: readonly UnitImporterDefinition[] = [
  {
    roomId: 1, importerKey: 'complaint', label: 'Pengaduan / Informasi', workbookLabel: 'Logbook pengaduan',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3,
    fields: [...commonEpisodeFields, { fieldKey: 'Tanggal Pengaduan', label: 'Tanggal pengaduan', defaultHeader: 'Tanggal Pengaduan' }, { fieldKey: 'Isi Pengaduan', label: 'Isi pengaduan', defaultHeader: 'Isi Pengaduan' }],
    indicators: [],
  },
  {
    roomId: 2, importerKey: 'it', label: 'Informatika dan Teknologi', workbookLabel: 'Logbook layanan TI',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3,
    fields: [...commonEpisodeFields, { fieldKey: 'Tanggal Permintaan', label: 'Tanggal permintaan', defaultHeader: 'Tanggal Permintaan' }, { fieldKey: 'Jenis Permintaan', label: 'Jenis permintaan', defaultHeader: 'Jenis Permintaan' }],
    indicators: [],
  },
  {
    roomId: 3, importerKey: 'ambulance', label: 'Instalasi Ambulance', workbookLabel: 'Logbook layanan ambulans',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3,
    fields: [...commonEpisodeFields, { fieldKey: 'Tanggal Permintaan', label: 'Tanggal permintaan', defaultHeader: 'Tanggal Permintaan' }, { fieldKey: 'Waktu Permintaan', label: 'Waktu permintaan', defaultHeader: 'Waktu Permintaan' }, { fieldKey: 'Waktu Pengantaran', label: 'Waktu pengantaran', defaultHeader: 'Waktu Pengantaran' }],
    indicators: [],
  },
  {
    roomId: 4, importerKey: 'ibs', label: 'Instalasi Bedah Sentral', workbookLabel: 'Logbook operasi',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3,
    fields: [...commonEpisodeFields, { fieldKey: 'Tanggal Operasi', label: 'Tanggal operasi', defaultHeader: 'Tanggal Operasi' }, { fieldKey: 'Jenis Operasi', label: 'Jenis operasi', defaultHeader: 'Jenis Operasi' }],
    indicators: [],
  },
  {
    roomId: 5, importerKey: 'pharmacy', label: 'Instalasi Farmasi', workbookLabel: 'Logbook farmasi (multi-sheet)',
    sheetName: '', headerRow: 1, dataStartRow: 2,
    fields: [{ fieldKey: 'Tanggal', label: 'Tanggal', defaultHeader: 'Tanggal', required: true }],
    indicators: [],
  },
  {
    roomId: 6, importerKey: 'igd', label: 'Instalasi Gawat Darurat', workbookLabel: 'Logbook episode IGD',
    sheetName: 'Logbook', headerRow: 3, dataStartRow: 4,
    fields: [
      { fieldKey: 'No', label: 'Nomor sumber', defaultHeader: 'No' },
      { fieldKey: 'Nama Pasien', label: 'Nama pasien', defaultHeader: 'Nama Pasien' },
      { fieldKey: 'No. Rekam Medis', label: 'Nomor rekam medis', defaultHeader: 'No. Rekam Medis' },
      { fieldKey: 'Diagnosa IGD', label: 'Diagnosis IGD', defaultHeader: 'Diagnosa IGD' },
      { fieldKey: 'Waktu Masuk', label: 'Waktu masuk', defaultHeader: 'Waktu Masuk' },
      { fieldKey: 'Waktu Transfer', label: 'Waktu transfer', defaultHeader: 'Waktu Transfer' },
      { fieldKey: 'Tujuan', label: 'Tujuan transfer', defaultHeader: 'Tujuan' },
      { fieldKey: 'Perawat Penerima', label: 'Perawat penerima', defaultHeader: 'Perawat Penerima' },
      { fieldKey: 'Dokter Umum', label: 'Dokter umum', defaultHeader: 'Dokter Umum' },
      { fieldKey: 'DPJP', label: 'DPJP', defaultHeader: 'DPJP' },
    ],
    indicators: [
      { code: '6.1', title: 'Angka Kematian di IGD ≤ 8 Jam Sejak Datang', defaultHeader: 'Kematian IGD ≤8h' },
      { code: '6.2', title: 'Door-to-Decision Time', defaultHeader: 'Door-to-Decision' },
      { code: '6.3', title: 'DPJP On-Call Response Time', defaultHeader: 'Response Time DPJP' },
      { code: '6.4', title: 'Kejadian Antrian Pasien Rawat Inap', defaultHeader: 'Antrian Rawat Inap' },
      { code: '6.5', title: 'Kelengkapan Data Asesmen Awal Keperawatan', defaultHeader: 'Kelengkapan Assessment Keperawatan' },
      { code: '6.6', title: 'Ketidaksediaan Bed Karena Overcrowding', defaultHeader: 'Overcrowding Index' },
      { code: '6.7', title: 'Waktu Tanggap Pelayanan Dokter di Gawat Darurat', defaultHeader: 'Response Triage' },
    ],
  },
  {
    roomId: 7, importerKey: 'gizi', label: 'Instalasi Gizi', workbookLabel: 'Logbook gizi',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [],
  },
  {
    roomId: 9, importerKey: 'laboratory', label: 'Instalasi Laboratorium', workbookLabel: 'Logbook laboratorium',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [],
  },
  {
    roomId: 11, importerKey: 'outpatient', label: 'Instalasi Rawat Jalan', workbookLabel: 'Logbook rawat jalan',
    sheetName: 'Logbook', headerRow: 1, dataStartRow: 2, fields: commonEpisodeFields, indicators: [],
  },
  {
    roomId: 12, importerKey: 'rehab-medik', label: 'Instalasi Rehab Medik', workbookLabel: 'Logbook rehabilitasi medik',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [],
  },
  {
    roomId: 13, importerKey: 'rekam-medis', label: 'Instalasi Rekam Medis', workbookLabel: 'Logbook rekam medis',
    sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [],
  },
  {
    roomId: 14, importerKey: 'icu', label: 'Intensive Care Unit & High Care Unit', workbookLabel: 'Logbook episode ICU/HCU',
    sheetName: 'Logbook', headerRow: 1, dataStartRow: 2, fields: [
      { fieldKey: 'No', label: 'Nomor sumber', defaultHeader: 'No' },
      { fieldKey: 'Nama Pasien', label: 'Nama pasien', defaultHeader: 'Nama Pasien' },
      { fieldKey: 'No. Rekam Medis', label: 'Nomor rekam medis', defaultHeader: 'No. Rekam Medis' },
      { fieldKey: 'Tanggal Masuk', label: 'Tanggal masuk', defaultHeader: 'Tanggal Masuk' },
      { fieldKey: 'Tanggal Keluar', label: 'Tanggal keluar', defaultHeader: 'Tanggal Keluar' },
      { fieldKey: 'Status Pulang', label: 'Status pulang', defaultHeader: 'Status Pulang' },
      { fieldKey: 'Perawat Penerima', label: 'Perawat penerima', defaultHeader: 'Perawat Penerima' },
      { fieldKey: 'DPJP', label: 'DPJP', defaultHeader: 'DPJP' },
    ],
    indicators: [
      { code: '14.1', title: 'Kekosongan BHP, Linen dan Barang Penunjang Perawatan Pasien Lainnya', defaultHeader: 'Kekosongan BHP/Linen' },
      { code: '14.2', title: 'Kelengkapan Assessment Pengantar Transfer Pasien dari IGD', defaultHeader: 'Transfer IGD' },
      { code: '14.3', title: 'Identifikasi Pasien', defaultHeader: 'Identifikasi Pasien' },
      { code: '14.4', title: 'Kepatuhan Jam Visite Dokter Spesialis', defaultHeader: 'Visite Spesialis' },
      { code: '14.5', title: 'Kepatuhan Penggunaan APD', defaultHeader: 'APD' },
      { code: '14.6', title: 'Kepatuhan Upaya Pencegahan Risiko Cedera Akibat Pasien Jatuh', defaultHeader: 'Pencegahan Jatuh' },
      { code: '14.7', title: 'Komunikasi Interpersonal Dalam Perawatan Pasien', defaultHeader: 'Komunikasi Perawatan' },
      { code: '14.8', title: 'Tingkat Validitas Data Asesmen Awal Keperawatan terhadap Kondisi Aktual Pasien', defaultHeader: 'Validitas Asesmen' },
      { code: '14.9', title: 'Waktu Perawatan yang Panjang di ICU', defaultHeader: 'LOS ICU Panjang' },
    ],
  },
  {
    roomId: 18, importerKey: 'nicu', label: 'Neonatal Intensive Care Unit & Pediatrics High Dependency Unit', workbookLabel: 'Logbook episode NICU',
    sheetName: 'Logbook', headerRow: 1, dataStartRow: 2, fields: [
      { fieldKey: 'No', label: 'Nomor sumber', defaultHeader: 'No' },
      { fieldKey: 'Nama Pasien', label: 'Nama pasien', defaultHeader: 'Nama Pasien' },
      { fieldKey: 'No. Rekam Medis', label: 'Nomor rekam medis', defaultHeader: 'No. Rekam Medis' },
      { fieldKey: 'Tanggal Masuk', label: 'Tanggal masuk', defaultHeader: 'Tanggal Masuk' },
      { fieldKey: 'Perawat Penerima', label: 'Perawat penerima', defaultHeader: 'Perawat Penerima' },
      { fieldKey: 'DPJP', label: 'DPJP', defaultHeader: 'DPJP' },
    ], indicators: [],
  },
  { roomId: 19, importerKey: 'nifas', label: 'Nifas Obstetrics & Gynecology', workbookLabel: 'Logbook nifas', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 20, importerKey: 'perinatology', label: 'Perinatology & Neonatology', workbookLabel: 'Logbook perinatologi', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 22, importerKey: 'pediatric-inpatient', label: 'Rawat Inap Anak', workbookLabel: 'Logbook rawat inap anak', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 23, importerKey: 'surgical-inpatient', label: 'Rawat Inap Bedah', workbookLabel: 'Logbook rawat inap bedah', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 24, importerKey: 'isolasi-inpatient', label: 'Rawat Inap Isolasi', workbookLabel: 'Logbook rawat inap isolasi', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 25, importerKey: 'penyakit-dalam-inpatient', label: 'Rawat Inap Penyakit Dalam', workbookLabel: 'Logbook rawat inap penyakit dalam', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 26, importerKey: 'saraf-inpatient', label: 'Rawat Inap Saraf', workbookLabel: 'Logbook rawat inap saraf', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
  { roomId: 30, importerKey: 'timkordik', label: 'Tim Koordinasi Pendidikan', workbookLabel: 'Logbook tim koordinasi pendidikan', sheetName: 'Logbook', headerRow: 1, dataStartRow: 2, fields: [
    { fieldKey: 'No.', label: 'Nomor sumber', defaultHeader: 'No.' },
    { fieldKey: 'Nama Mahasiswa', label: 'Nama mahasiswa', defaultHeader: 'Nama Mahasiswa' },
    { fieldKey: 'Profesi/Prodi', label: 'Profesi / program studi', defaultHeader: 'Profesi/Prodi' },
    { fieldKey: 'Kampus', label: 'Kampus', defaultHeader: 'Kampus' },
    { fieldKey: 'Stase', label: 'Stase', defaultHeader: 'Stase' },
    { fieldKey: 'Tanggal Mulai Praktek', label: 'Tanggal mulai praktik', defaultHeader: 'Tanggal Mulai Praktek' },
    { fieldKey: 'Tanggal Selesai Praktek', label: 'Tanggal selesai praktik', defaultHeader: 'Tanggal Selesai Praktek' },
    { fieldKey: 'CI/Penanggung Jawab', label: 'CI / penanggung jawab', defaultHeader: 'CI/Penanggung Jawab' },
  ], indicators: [] },
  { roomId: 33, importerKey: 'ponek', label: 'Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif', workbookLabel: 'Logbook PONEK', sheetName: 'Logbook', headerRow: 2, dataStartRow: 3, fields: commonEpisodeFields, indicators: [] },
] as const

export function getImporterForRoom(roomId: number): UnitImporterDefinition | null {
  return UNIT_IMPORTER_CATALOG.find(item => item.roomId === Number(roomId)) ?? null
}

export function getImporterForKey(importerKey: string): UnitImporterDefinition | null {
  return UNIT_IMPORTER_CATALOG.find(item => item.importerKey === importerKey) ?? null
}

export function isImporterEnabled(roomId: number): boolean {
  return getImporterForRoom(roomId) !== null
}
