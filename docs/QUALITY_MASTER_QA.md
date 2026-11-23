# Quality master data: unresolved items before automated interpretation

This note records data-quality defects found during the 29 October 2026 review. It is intentionally a **review queue**, not an automatic correction. Indicator definitions, inclusion criteria, targets, and numerator/denominator semantics are clinical governance decisions and must be approved by the indicator owner/Komite PMKP before being changed.

## Verified examples

| Source | Finding | Required action |
|---|---|---|
| 2026 profile chunks, code 7.1 and 7.2 | Master title is blank in the repository source profile. | Confirm the official indicator name and approved header before publishing a new profile version. |
| 2026 profile chunk 11, codes 26.1, 26.3, 26.11 | Master title is blank in the repository source profile. | Confirm the official name from the approved unit worksheet; do not infer it from the numerator definition alone. |
| 2026 profile chunk 4, code 12.2 | The source value for unit of measure contains narrative/definition text rather than only a measurement unit. | Restore the correct measurement unit and keep the operational definition in its dedicated field. |
| Live aureka_quality.indicator_profiles, code 14.4 (Kepatuhan Jam Visite Dokter Spesialis) | Several response options, including “Tidak Visite”, have numerator=true and code=1. | The indicator owner must confirm each option's numerator/denominator meaning and response code; otherwise automated rates can be biased. |
| Live profile family with the same header_label “Visite Spesialis” (e.g., codes 18.4, 19.8, 20.8, 22.7, 23.5, 24.8, 27.9, 37.6) | Some profiles have no unit of measure, no numeric target value, and no response options. | Confirm which rows are active templates versus legacy/placeholder duplicates, then retire or complete them through the versioned master-data workflow. |

## Release rule

- Do not silently rename clinical indicators, change targets, or recode options from inference.
- Publish corrected metadata as a new version with approver, effective date, source worksheet, and a regression case for its calculation.
- Keep ambiguous values in manual review; do not turn missing or unclassified data into a zero or an automatic pass.
- Reconcile repository source chunks with the live Supabase master before import or deployment. A source JSON file is not the authority for the currently published database profile.

## Salinan workbook dengan rumus yang dapat dipulihkan

Jalankan `python scripts/repair-pmkp-workbook.py --output /direktori/salinan /direktori/sumber/*.xlsx` dengan Python dan `openpyxl`. Skrip mendeteksi pola yang diperiksa pada template 2026, menyalin workbook yang perlu diperbaiki, dan melaporkan jumlah rumus yang diubah per workbook. Berkas sumber tetap utuh. Buka salinan di Excel agar rekap yang bergantung pada rumus tersebut dihitung ulang.

Pola yang ditangani mencakup durasi transfer IGD, rujukan diagnosis pada beberapa workbook rawat inap, rekap stase Timkordik, rujukan angka Laboratorium, dan rekap harian Rawat Jalan. Rekap Rawat Jalan menggunakan tanggal pengamatan dan baris dokter yang terpetakan. Sel dengan nilai sumber tanpa identitas dokter memerlukan konfirmasi dari unit.

Rekap Dashboard Bedah Sentral dan PONEK memiliki rujukan ke kolom petugas yang tidak tersedia dalam workbook terlampir. Pada Gizi, rekap lama di sheet 20 merujuk ke kolom indikator yang tidak tersedia. Skrip menandai rekap yang bergantung pada rujukan terhapus sebagai “Kolom sumber tidak tersedia”. Angka untuk rekap itu baru dapat dihitung setelah kolom asli dipulihkan.


## Rekonsiliasi produksi 23 November 2026

`scripts/reconcile-pmkp-2026.sql` menelusuri perubahan data master dan respons tanpa mengganti ID profil. Sebelas profil visite dengan instrumen sumber yang sama memakai Code 1 untuk visite sesuai waktu dan Code 3 untuk terlambat atau tidak visite. Opsi hari libur dan visite oleh spesialis lain tidak mempunyai kode pada sheet Profil ICU dan meminta telaah. Profil 38.1 memakai pemilik, N/D, dan target 100% dari baris 190 master tahunan. Unit baru tidak otomatis memberi penugasan akses pengguna.

## Koreksi teknis 64 profil

`scripts/reconcile-pmkp-2026-technical-profiles.sql` mencatat koreksi arah, tipe pengukuran, definisi, dan pemetaan opsi 64 profil aktif. Profil dengan pilihan berkode menghitung proporsi per observasi dan tetap menerima catatan agregat historis yang hanya berisi N/D. Farmasi, Rawat Jalan, dan Pertemuan Wajib memakai angka sesuai instrumen masing-masing.

Untuk IGD 6.4 serta Rekam Medis 13.1 dan 13.2, Code 2 dan Code 3 masuk pembilang sesuai rumus rekap unit. Pada Laboratorium 9.1, pembilang mengikuti definisi kantong yang dibatalkan/terbuang. Standar numerik 1% ditafsirkan sebagai batas atas sesuai arah kejadian. Pada IGD 6.1, DOA dikeluarkan dari pengukuran kematian setelah tiba. Target yang kosong dan target positif 0% yang tidak bermakna tetap tampil untuk peninjauan tanpa menilai kepatuhan.

## Opsi Rehab Medik dan target operasional 2026

Empat opsi berkode dari sheet Profil Rehab Medik ditambahkan ke master 12.1 dan 12.2. Impor dan dropdown memakai aturan pencocokan label yang sama. “Tersedia Namun Tidak Memadai” pada 12.6 masih disimpan untuk telaah karena kode tidak tersedia dan dampak terhadap sesi terapi belum diketahui.

Angka berikut adalah target operasional RS dengan definisi N/D yang sudah berlaku pada setiap profil. Rujukan nasional dan internasional digunakan jika definisinya sebanding. Persentase lokal dicatat bersama alasan pemilihannya pada profil.

| Profil | Target |
|---|---:|
| 6.7 Waktu tanggap dokter IGD ≤5 menit | ≥95% |
| 7.1 Asesmen PAGT hari pertama | ≥90% |
| 12.1 Efektivitas tindakan rehab | ≥80% |
| 12.2 Drop out program rehab | ≤50% |
| 12.3 Jatuh saat program rehab | ≤1% |
| 12.4 Salah tindakan rehab | 0% |
| 12.5 Kepatuhan durasi pelayanan rehab | ≥90% |
| 12.6 Gangguan sesi karena media terapi tidak tersedia | 0% |
| 26.5 Kekosongan obat Rawat Inap Saraf | 0% |
| 27.11 Pasien berisiko yang tidak diamputasi | ≥90% |
| 30.1 Kelengkapan administrasi mahasiswa | 100% |
| 30.2 Ketepatan atribut mahasiswa | 100% |
| 30.3 Ketepatan waktu hadir mahasiswa | ≥95% |
| 32.1 Bebas komplikasi penggunaan kontrasepsi | ≥98% |
| 36.1 Visitasi pasien high risk dan high cost | 100% |
| 37.1 Kembali tak terencana ke PONEK ≤24 jam | ≤2% |

Acuan [SPM RS Indonesia](https://rsudams.kaltimprov.go.id/documents/PMK-No-129-tahun-2008-tengan-SPM-RS-lengkap.pdf) menggunakan ambang waktu IGD 5 menit. Angka 95% menetapkan proporsi kasus yang harus mencapai ambang itu di AUREKA. Target drop out memakai batas pada SPM sebagai acuan historis, dengan populasi sesuai definisi profil lokal. Ukuran asesmen risiko gizi [CMS](https://data.cms.gov/provider-data/topics/hospitals/measures-and-current-data-collection-periods) dan prinsip keselamatan [AHRQ](https://psnet.ahrq.gov/primer/never-events) membantu memilih sasaran lokal. Sumber tersebut memakai definisi yang berbeda untuk sebagian populasi dan kejadian.
