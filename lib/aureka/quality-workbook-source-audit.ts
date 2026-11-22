/**
 * 2026 PMKP workbook routing hints. The filenames are non-clinical descriptors;
 * no workbook bytes, sheet content, patient identifiers or source hashes live
 * in the public repository. Hints are NOT evidence that an indicator is valid.
 */
export type QualityWorkbookKind = 'annual_master' | 'unit' | 'pharmacy_multisheet' | 'outpatient_matrix'

export type QualityWorkbookHint = {
  roomId: number | null
  kind: QualityWorkbookKind
  unit: string
  headerRow?: number
  duplicateFamily?: string
}

const normalize = (name: string) => name.normalize('NFKC')
  .toLocaleLowerCase('id-ID')
  .replace(/\.xlsx$/i, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const rules: Array<{ phrase: string; roomId: number; unit: string; kind?: QualityWorkbookKind; headerRow?: number; duplicateFamily?: string }> = [
  { phrase: 'informasi dan pengaduan', roomId: 1, unit: 'Informasi dan Pengaduan' },
  { phrase: 'ambulance', roomId: 3, unit: 'Instalasi Ambulance' },
  { phrase: 'instalasi bedah sentral', roomId: 4, unit: 'Instalasi Bedah Sentral' },
  { phrase: 'instalasi farmasi', roomId: 5, unit: 'Instalasi Farmasi', kind: 'pharmacy_multisheet' },
  { phrase: 'instalasi gawat darurat', roomId: 6, unit: 'Instalasi Gawat Darurat', headerRow: 3 },
  { phrase: 'instalasi gizi', roomId: 7, unit: 'Instalasi Gizi' },
  { phrase: 'hemodial', roomId: 8, unit: 'Instalasi Hemodialisis' },
  { phrase: 'instalasi laboratorium', roomId: 9, unit: 'Instalasi Laboratorium' },
  { phrase: 'instalasi rawat jalan', roomId: 11, unit: 'Instalasi Rawat Jalan', kind: 'outpatient_matrix' },
  { phrase: 'instalasi rehab medik', roomId: 12, unit: 'Instalasi Rehab Medik' },
  { phrase: 'neonatal intensive care unit', roomId: 18, unit: 'Neonatal Intensive Care Unit' },
  { phrase: 'intensive care unit', roomId: 14, unit: 'Intensive Care Unit' },
  { phrase: 'nifas', roomId: 19, unit: 'Nifas Obstetrics & Gynecology' },
  { phrase: 'perinatologi', roomId: 20, unit: 'Perinatology & Neonatology' },
  { phrase: 'promosi kesehatan rumah sakit', roomId: 21, unit: 'Promosi Kesehatan Rumah Sakit' },
  { phrase: 'rawat inap anak', roomId: 22, unit: 'Rawat Inap Anak' },
  { phrase: 'rawat inap bedah', roomId: 23, unit: 'Rawat Inap Bedah' },
  { phrase: 'isolasi', roomId: 24, unit: 'Rawat Inap Isolasi' },
  { phrase: 'rawat inap penyakit dalam', roomId: 25, unit: 'Rawat Inap Penyakit Dalam' },
  { phrase: 'rawat inap saraf', roomId: 26, unit: 'Rawat Inap Saraf' },
  { phrase: 'rawat inap vip', roomId: 27, unit: 'Rawat Inap VIP' },
  { phrase: 'tim investigasi', roomId: 29, unit: 'Tim Investigasi' },
  { phrase: 'tim pelayanan hiv', roomId: 31, unit: 'Tim Pelayanan Human Immunodeficiency Virus' },
  { phrase: 'pelayanan keluarga berencana rumah sakit', roomId: 32, unit: 'Tim Pelayanan Keluarga Berencana Rumah Sakit', duplicateFamily: 'kb-2026' },
  { phrase: 'pelayanan obstetri neonatal emergensi', roomId: 33, unit: 'Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif' },
  { phrase: 'tim pelayanan onkologi', roomId: 34, unit: 'Tim Pelayanan Onkologi' },
  { phrase: 'verlos kamer', roomId: 37, unit: 'Verlos Kamer' },
]

export function classifyQualityWorkbookName(fileName: string): QualityWorkbookHint | null {
  if (!/\.xlsx$/i.test(fileName)) return null
  const normalized = normalize(fileName)
  if (normalized.startsWith('indikator mutu tahunan')) {
    return { roomId: null, kind: 'annual_master', unit: 'Master Tahunan' }
  }
  // Filename is only a convenience hint. The user must still confirm headers,
  // official profile codes, inclusion criteria and clinical source provenance.
  const matches = rules.filter(rule => normalized.includes(rule.phrase))
  if (matches.length !== 1) return null
  const match = matches[0]
  return {
    roomId: match.roomId, kind: match.kind ?? 'unit', unit: match.unit,
    ...(match.headerRow ? {headerRow: match.headerRow} : {}),
    ...(match.duplicateFamily ? {duplicateFamily: match.duplicateFamily} : {}),
  }
}

export function inspectQualityWorkbookRouting(
  fileName: string, selectedRoomId: number, selectedYear: number,
) {
  const hint = classifyQualityWorkbookName(fileName)
  const blockers: string[] = []
  const notes: string[] = []
  const matchedYear = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(fileName)?.[1]
  if (matchedYear && Number(matchedYear) !== selectedYear) {
    blockers.push('Tahun pada nama workbook (' + matchedYear + ') berbeda dari tahun profil (' + selectedYear + ').')
  }
  if (hint?.kind === 'annual_master') {
    blockers.push('Workbook tahunan adalah referensi master indikator, bukan logbook pasien. Gunakan Pengaturan Profil Indikator.')
  } else if (hint?.roomId != null && hint.roomId !== selectedRoomId) {
    blockers.push('Workbook teridentifikasi untuk ' + hint.unit + ' (unit ' + hint.roomId +
      '), tetapi unit Aureka yang dipilih adalah ' + selectedRoomId + '. Pilih unit yang sesuai.')
  }
  if (hint?.kind === 'pharmacy_multisheet') {
    blockers.push('Workbook Farmasi memakai beberapa sheet Rawat Jalan/Rawat Inap. Gunakan Impor Excel → Workbook baku unit pada Logbook Farmasi.')
  } else if (hint?.kind === 'outpatient_matrix') {
    blockers.push('Workbook Rawat Jalan menggunakan matriks tanggal horizontal. Gunakan Impor Excel → Workbook baku unit pada Logbook Rawat Jalan.')
  }
  if (hint?.duplicateFamily) {
    notes.push('Terdapat beberapa versi sumber Pelayanan KB 2026. Periksa identitas episode dan duplikasi pada pratinjau sebelum commit.')
  }
  if (hint?.roomId === 7) {
    notes.push('Audit sumber Gizi menemukan metadata unit pada sheet Profil yang perlu diperiksa kembali terhadap master. Jangan mengubah owner indikator otomatis.')
  }
  if (hint?.headerRow) {
    notes.push('Baris header yang teramati pada sumber awal: ' + hint.headerRow + '. Tetap periksa header aktual.')
  }
  if (!hint) {
    notes.push('Format belum dikenali dari nama berkas. Verifikasi unit, sheet, header, dan indikator secara manual sebelum impor.')
  }
  return { hint, blockers, notes }
}
