'use client'

/** Shared presentation for specialized unit importers; never changes parsing or persistence. */
export const UNIT_IMPORT_FORMATS = {
  "complaint": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Informasi dan Pengaduan"
  },
  "it": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Informatika dan Teknologi"
  },
  "rekam-medis": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rekam Medis"
  },
  "timkordik": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Profil dipakai untuk metadata; Logbook untuk catatan operasional.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Tim Koordinasi Pendidikan"
  },
  "ambulance": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Ambulans"
  },
  "gizi": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu episode per baris Logbook; indikator 7.1 dan 7.2 dicocokkan terpisah.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Instalasi Gizi"
  },
  "laboratory": {
    "sheet": "Logbook",
    "header": "Baris 2",
    "firstData": "Baris 3",
    "limitMb": 15,
    "source": "Satu event per baris Logbook; respons dicocokkan dengan opsi master.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Instalasi Laboratorium"
  },
  "igd": {
    "sheet": "Logbook + audit konsultasi",
    "header": "Baris 3 untuk Logbook",
    "firstData": "Baris 4 untuk Logbook",
    "limitMb": 25,
    "source": "Alur dua tahap: episode IGD, lalu audit konsultasi DPJP; berkas konsultasi memiliki header terdeteksi.",
    "review": "Semua episode menunggu validasi mutu klinis.",
    "unit": "Instalasi Gawat Darurat"
  },
  "pharmacy": {
    "sheet": "Beberapa sheet indikator",
    "header": "Baris 10 (sheet harian)",
    "firstData": "Baris 11 (sheet harian)",
    "limitMb": 15,
    "source": "Parser Farmasi memproses beberapa sheet; bukan sebuah Logbook tunggal.",
    "review": "Pemetaan harus sesuai indikator Farmasi.",
    "unit": "Instalasi Farmasi"
  },
  "outpatient": {
    "sheet": "Matriks tanggal / tabel observasi",
    "header": "Deteksi format sumber",
    "firstData": "Sesuai baris dokter/observasi",
    "limitMb": 15,
    "source": "Matriks klinik-dokter dibuka menjadi observasi harian sebelum impor.",
    "review": "Laporan PIC diperiksa dalam validasi bulanan terpisah.",
    "unit": "Instalasi Rawat Jalan"
  },
  "rehab": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rehabilitasi Medik"
  },
  "icu": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Logbook menjadi sumber episode; formula rekap diabaikan.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Intensive Care Unit"
  },
  "perinatology": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Perinatologi"
  },
  "nicu": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Neonatal Intensive Care Unit"
  },
  "nifas": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Nifas"
  },
  "ponek": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "PONEK"
  },
  "pediatric-inpatient": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rawat Inap Anak"
  },
  "surgical-inpatient": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rawat Inap Bedah"
  },
  "isolasi-inpatient": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rawat Inap Isolasi"
  },
  "saraf-inpatient": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rawat Inap Saraf"
  },
  "penyakit-dalam-inpatient": {
    "sheet": "Logbook",
    "header": "Deteksi dari Logbook",
    "firstData": "Setelah header terdeteksi",
    "limitMb": 15,
    "source": "Satu baris operasional per catatan. Dashboard dan sheet rekap tidak menjadi data sumber.",
    "review": "Perlu tinjauan sebelum validasi mutu.",
    "unit": "Rawat Inap Penyakit Dalam"
  },
  "hemodialysis": {
    "unit": "Instalasi Hemodialisa",
    "sheet": "Dipilih pada pemetaan; dapat berbeda per periode",
    "header": "Pilih setelah membaca worksheet",
    "firstData": "Setelah baris header yang dipilih",
    "limitMb": 25,
    "source": "Periksa worksheet Hemodialisa per periode dan cocokkan respons dengan master indikator sebelum impor. Jangan gabungkan catatan dengan kunci subjek yang sama tanpa pemeriksaan.",
    "review": "Pemetaan terarah: nilai indikator yang tidak cocok tetap perlu ditinjau; bukan validasi klinis otomatis."
  },
  "radiology": {
    "unit": "Instalasi Radiologi",
    "sheet": "Dipilih pada pemetaan workbook",
    "header": "Pilih setelah membaca worksheet",
    "firstData": "Setelah baris header yang dipilih",
    "limitMb": 25,
    "source": "Periksa kolom identitas, tanggal, dan respons indikator Radiologi. Format sumber tidak diasumsikan sama dengan Logbook pasien unit lain.",
    "review": "Pemetaan terarah: hasil tanpa kolom atau profil yang cocok tidak otomatis dinyatakan patuh."
  },
  "generic": {
    "unit": "Unit terpilih",
    "sheet": "Logbook / Profil",
    "header": "Pilih baris header pada pemetaan",
    "firstData": "Setelah header dipilih",
    "limitMb": 25,
    "source": "Pemetaan kolom fisik dan definisi indikator harus ditinjau untuk setiap workbook.",
    "review": "Impor bertahap, tidak menimpa master produksi tanpa keputusan eksplisit."
  }
} as const
export type QualityWorkbookImportUnit = keyof typeof UNIT_IMPORT_FORMATS
const IMPORT_LAYOUT_CSS = `
:is(.aq.aqPortal.aqAuditWorkspace .qiuBody, .episodeWorkbook.qiuBody) {
  display: grid !important;
  grid-template-columns: minmax(235px, 270px) minmax(0, 1fr) !important;
  align-items: start;
  align-content: start;
  min-width: 0;
  gap: 12px 16px;
}
.qiuBody > .qiuSidebar {
  min-width: 0;
  display: grid;
  gap: 10px;
}
.qiuBody > :not(.qiuSidebar) { min-width: 0; max-width: 100%; }
.qiuMain {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.qiuMain > * { min-width: 0; }
.qiuBody :is(.qiuSettings, .qiuDetails) {
  padding: 12px;
  border: 1px solid var(--aureka-dialog-edge);
  border-radius: 12px;
  background: var(--aureka-dialog-muted);
}
.qiuBody .qiuSettings {
  display: grid;
  grid-template-columns: minmax(0, 84px) minmax(0, 1fr);
  gap: 7px 9px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
.qiuSettings dt, .qiuDetails p { color: var(--aureka-color-foreground-secondary); }
.qiuSettings dd { margin: 0; font-weight: 650; overflow-wrap: anywhere; }
.qiuDetails { font-size: 12px; line-height: 1.55; }
.qiuDetails summary { min-height: 44px; align-content: center; cursor: pointer; font-weight: 750; }
.qiuDetails :is(p, ol) { margin: 8px 0 0; }
.qiuDetails ol { padding-inline-start: 20px; }
.qiuBody :is(input[type="file"], select) { max-width: 100%; }
.qiuMain [class$="Table"] { max-width: 100%; overflow-x: auto; scrollbar-gutter: stable; }
.qiuMain [class$="Stat"] { min-width: 0; }
.qiuMain [class$="Stat"] strong { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
@media(max-width:940px) {
  :is(.aq.aqPortal.aqAuditWorkspace .qiuBody, .episodeWorkbook.qiuBody) {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
@media(max-width:540px) {
  .qiuMain [class$="Stats"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`


export default function QualityWorkbookImportSidebar({unitKey,year,unitName}:{unitKey:QualityWorkbookImportUnit;year:number|string;unitName?:string}) {
  const format = UNIT_IMPORT_FORMATS[unitKey]
  const displayUnit = unitName?.trim() || format.unit
  return <aside className="qiuSidebar" aria-label={'Pengaturan impor '+displayUnit}>
    <style>{IMPORT_LAYOUT_CSS}</style>
    <dl className="qiuSettings" aria-label="Sumber workbook">
      <dt>Unit</dt><dd>{displayUnit}</dd>
      <dt>Tahun</dt><dd>{year}</dd>
      <dt>Worksheet</dt><dd>{format.sheet}</dd>
      <dt>Baris header</dt><dd>{format.header}</dd>
      <dt>Mulai data</dt><dd>{format.firstData}</dd>
      <dt>Berkas</dt><dd>.xlsx · maks. {format.limitMb} MB</dd>
    </dl>
    <details className="qiuDetails">
      <summary>Panduan dan aturan impor</summary>
      <ol>
        <li>Pilih berkas workbook.</li>
        <li>Periksa pratinjau dan pesan validasi.</li>
        <li>Impor setelah pratinjau sesuai.</li>
      </ol>
      <p>{format.source}</p>
      <p><strong>Status</strong> {format.review}</p>
    </details>
  </aside>
}
