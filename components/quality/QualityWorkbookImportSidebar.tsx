'use client'
import type { ReactNode } from 'react'

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
const IMPORT_LAYOUT_CSS = "\n.aq.aqPortal.aqAuditWorkspace .aqDrawer:has(.qiuBody){width:min(1460px,calc(100vw - 32px))!important;max-width:1460px!important}\n.aq.aqPortal.aqAuditWorkspace .qiuBody{display:grid!important;grid-template-columns:minmax(235px,270px) minmax(0,1fr)!important;gap:12px 16px!important;align-content:start!important;align-items:start!important;min-width:0!important;overflow-x:clip}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-column:1!important;grid-row:1!important;align-self:start!important;position:sticky;top:0;z-index:2;min-width:0;display:grid;gap:12px}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>:not(.qiuSidebar){grid-column:2!important;min-width:0!important;max-width:100%}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuCard{padding:15px;border:1px solid #dbe5e0;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(20,44,57,.035)}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuCard h5{font-size:13px;line-height:1.4;font-weight:750;letter-spacing:-.01em;color:#294459;margin:0 0 12px}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuSettings{display:grid;grid-template-columns:minmax(0,91px) minmax(0,1fr);gap:8px 9px;margin:0;font-size:12px;line-height:1.45}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuSettings dt{color:#6a7b86}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuSettings dd{margin:0;font-weight:650;color:#243c4d;overflow-wrap:anywhere}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuStep{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #edf1ee;font-size:12px;line-height:1.45;color:#40576a}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuStep:first-of-type{border-top:0;padding-top:0}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuNumber{display:inline-grid;place-items:center;flex:0 0 22px;height:22px;border-radius:7px;background:#eaf2f8;color:#245477;font-size:11px;font-weight:800}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuNote{font-size:12px;line-height:1.65;color:#617481;margin:0}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciTable,.oiTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$=\"Table\"]){max-width:100%;min-width:0;overflow-x:auto;scrollbar-gutter:stable}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStats,.oiStats,.iiStats,.niStats,.piStats,.paStats,[class$=\"Stats\"]){max-width:100%;min-width:0}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStat,.oiStat,.iiStat,.niStat,.piStat,.paStat,[class$=\"Stat\"]){min-width:0}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStat,.oiStat,.iiStat,.niStat,.piStat,.paStat,[class$=\"Stat\"]) strong{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}\n.aq.aqPortal.aqAuditWorkspace .qiuBody table{width:100%;border-collapse:separate;border-spacing:0}\n.aq.aqPortal.aqAuditWorkspace .qiuBody table :is(th,td){vertical-align:top}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(input[type=\"file\"],select){max-width:100%}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.qwpToolbar,.ciMessage,.ciPrivacy,.ciUpload,.ciFlowHint){max-width:100%;min-width:0}\n@media(max-width:940px){\n.aq.aqPortal.aqAuditWorkspace .qiuBody{grid-template-columns:minmax(0,1fr)!important;overflow-x:visible}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-column:1!important;grid-row:auto!important;position:static;grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>:not(.qiuSidebar){grid-column:1!important}\n}\n@media(max-width:540px){\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}\n.aq.aqPortal.aqAuditWorkspace .qiuSidebar .qiuCard{padding:12px}\n.aq.aqPortal.aqAuditWorkspace .qiuBody :is(.ciStats,.oiStats,.iiStats,.niStats,.piStats,.paStats,[class$=\"Stats\"]){grid-template-columns:repeat(2,minmax(0,1fr))}\n}\n.episodeWorkbook.qiuBody{display:grid!important;grid-template-columns:minmax(235px,270px) minmax(0,1fr)!important;gap:12px 16px!important;min-width:0!important;align-items:start}\n.episodeWorkbook.qiuBody>.qiuSidebar{grid-column:1!important;grid-row:1!important;align-self:start;position:sticky;top:0;z-index:2;min-width:0;display:grid;gap:12px}\n.episodeWorkbook.qiuBody>:not(.qiuSidebar){grid-column:2!important;min-width:0!important;max-width:100%}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuCard{padding:15px;border:1px solid #dbe5e0;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(20,44,57,.035)}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuCard h5{font-size:13px;line-height:1.4;font-weight:750;letter-spacing:-.01em;color:#294459;margin:0 0 12px}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuSettings{display:grid;grid-template-columns:minmax(0,91px) minmax(0,1fr);gap:8px 9px;margin:0;font-size:12px;line-height:1.45}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuSettings dt{color:#6a7b86}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuSettings dd{margin:0;font-weight:650;color:#243c4d;overflow-wrap:anywhere}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuStep{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #edf1ee;font-size:12px;line-height:1.45;color:#40576a}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuStep:first-of-type{border-top:0;padding-top:0}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuNumber{display:inline-grid;place-items:center;flex:0 0 22px;height:22px;border-radius:7px;background:#eaf2f8;color:#245477;font-size:11px;font-weight:800}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuNote{font-size:12px;line-height:1.65;color:#617481;margin:0}\n.episodeWorkbook.qiuBody .qiuSidebar .qiuCard{padding:12px}\n@media(max-width:940px){\n.episodeWorkbook.qiuBody{grid-template-columns:minmax(0,1fr)!important}\n.episodeWorkbook.qiuBody>.qiuSidebar{grid-column:1!important;grid-row:auto!important;position:static;grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}\n.episodeWorkbook.qiuBody>:not(.qiuSidebar){grid-column:1!important}\n}\n@media(max-width:540px){.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}}\n\n\n/* Prevent the historic one-grid-row-per-child overlaps. All non-sidebar content\n   is now a single normal-flow content column for EVERY specialized importer. */\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain,\n.episodeWorkbook.qiuBody>.qiuMain{\n  grid-column:2!important;grid-row:1!important;display:flex!important;\n  flex-direction:column!important;align-items:stretch!important;\n  align-self:start!important;gap:12px!important;min-width:0!important;\n  max-width:100%!important;min-height:0!important;position:relative!important;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain>*,\n.episodeWorkbook.qiuBody>.qiuMain>*{\n  flex:0 0 auto;min-width:0!important;max-width:100%;box-sizing:border-box;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain>:is([class$=\"Muted\"],[class$=\"Note\"],[class$=\"Privacy\"],[class$=\"Hint\"]),\n.episodeWorkbook.qiuBody>.qiuMain>:is([class$=\"Muted\"],[class$=\"Note\"],[class$=\"Privacy\"],[class$=\"Hint\"]){\n  position:relative!important;z-index:auto!important;clear:both!important;\n  line-height:1.55;overflow-wrap:anywhere;white-space:normal;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$=\"Table\"]),\n.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.qwiPreviewScroll,.qwpPreviewScroll){\n  display:block;position:relative!important;isolation:isolate;\n  flex:0 0 auto!important;min-height:0!important;max-height:min(48dvh,440px)!important;\n  overflow:auto!important;overscroll-behavior:contain;\n  width:100%;max-width:100%;scrollbar-gutter:stable;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$=\"Table\"]):has(.qwpToolbar){\n  max-height:none!important;overflow:visible!important;min-height:0!important;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,.giTable,.liTable,.paTable,.iqTable,.phTable,.rmTable,[class$=\"Table\"]):has(.qwpToolbar)>table{\n  display:block;max-height:min(48dvh,440px);overflow:auto;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain :is(th,td){box-sizing:border-box}\n.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.ciStats,.riStats,.iiStats,.niStats,.piStats,.giStats,.liStats,.paStats,[class$=\"Stats\"]){\n  min-width:0;max-width:100%;align-self:stretch;grid-auto-rows:minmax(0,auto);\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain :is(.ciError,.riError,.iiError,.niError,.piError,.oiError,.ciWarning,.riWarn,.iiWarn,.niWarn,.piWarn){\n  max-width:100%;overflow-wrap:anywhere;white-space:pre-line;max-height:min(25dvh,220px);overflow-y:auto;\n}\n.aq.aqPortal.aqAuditWorkspace .qiuMain .qwpToolbar{position:relative;z-index:1}\n.aq.aqPortal.aqAuditWorkspace .qiuMain>label{max-width:100%;min-width:0;overflow-wrap:anywhere}\n.aq.aqPortal.aqAuditWorkspace .qiuMain .qiuInlineMapping{width:100%;min-width:0}\n.qiuSidebar .qiuCard{min-width:0}\n.qiuSidebar .qiuField{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:700;color:#4e6579}\n.qiuSidebar .qiuField select{width:100%;min-width:0;min-height:36px;padding:7px 8px;border:1px solid #cfdeea;border-radius:9px;background:#f8fbfe;color:#183a55;font:inherit;font-size:12px;text-overflow:ellipsis}\n.qiuSidebar .qiuField select:focus-visible{outline:2px solid #16639b;outline-offset:1px}\n.qiuSidebar .qiuMappingFields{display:grid;gap:10px;min-width:0}\n.qiuSidebar .qiuMappingActions{display:flex;gap:8px;flex-wrap:wrap}\n.qiuSidebar .qiuMappingActions button{min-height:35px;min-width:0;flex:1 1 100px;background:#0b467a;color:#fff;border:1px solid #0b467a;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:750;cursor:pointer}\n.qiuSidebar .qiuMappingActions button:disabled{opacity:.65;cursor:not-allowed}\n.qiuSidebar .qiuMappingNotice{margin:0;font-size:11px;line-height:1.55;color:#5d7381;overflow-wrap:anywhere}\n.qiuSidebar .qiuMappingError{margin:0;padding:8px;background:#fff1ef;border-radius:7px;font-size:11px;line-height:1.5;color:#8b2b25}\n.qiuSidebar .qiuSettings{grid-template-columns:minmax(0,85px) minmax(0,1fr)}\n@media(max-width:940px){\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuMain,\n.episodeWorkbook.qiuBody>.qiuMain{grid-column:1!important;grid-row:auto!important}\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,\n.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}\n}\n@media(max-width:540px){\n.aq.aqPortal.aqAuditWorkspace .qiuBody>.qiuSidebar,\n.episodeWorkbook.qiuBody>.qiuSidebar{grid-template-columns:minmax(0,1fr)}\n.aq.aqPortal.aqAuditWorkspace .qiuMain>:is(.ciTable,.riTable,.iiTable,.niTable,.piTable,[class$=\"Table\"]){max-height:min(42dvh,340px)!important}\n}\n"

export default function QualityWorkbookImportSidebar({unitKey,year,unitName,mapping}:{unitKey:QualityWorkbookImportUnit;year:number|string;unitName?:string;mapping?:ReactNode}) {
  const format = UNIT_IMPORT_FORMATS[unitKey]
  const displayUnit = unitName?.trim() || format.unit
  return <aside className="qiuSidebar" aria-label={'Pengaturan impor '+displayUnit}>
    <style>{IMPORT_LAYOUT_CSS}</style>
    <section className="qiuCard" aria-label="Pengaturan sumber workbook">
      <h5>1. Pengaturan sumber</h5>
      <dl className="qiuSettings">
        <dt>Unit</dt><dd>{displayUnit}</dd>
        <dt>Tahun aktif</dt><dd>{year}</dd>
        <dt>Worksheet</dt><dd>{format.sheet}</dd>
        <dt>Baris header</dt><dd>{format.header}</dd>
        <dt>Mulai data</dt><dd>{format.firstData}</dd>
        <dt>Berkas</dt><dd>.xlsx · maks. {format.limitMb} MB</dd>
      </dl>
    </section>
    <section className="qiuCard" aria-label={mapping ? 'Konfigurasi tautan kolom' : 'Ketentuan pemetaan sumber'}>
      <h5>2. {mapping ? 'Tautkan kolom Excel' : 'Pemetaan sumber'}</h5>
      {mapping ?? <p className="qiuNote">Format kolom mengikuti parser unit. Jika judul kolom berbeda, gunakan Pusat Pemetaan Excel untuk menetapkan kolom sebelum mengimpor. Tidak ada perubahan kolom otomatis dari panel ini.</p>}
    </section>
    <details className="qiuCard" aria-label="Ketentuan dan keamanan impor">
      <summary style={{cursor:'pointer',fontWeight:750,fontSize:12,color:'#294459'}}>Ketentuan dan keamanan data</summary>
      <p className="qiuNote" style={{marginTop:10}}>{format.source}</p>
      <p className="qiuNote" style={{marginTop:8}}>{format.review}</p>
    </details>
  </aside>
}
