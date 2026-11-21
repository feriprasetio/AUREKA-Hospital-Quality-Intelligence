# AUREKA · Matriks penerimaan rilis

Dokumen ini adalah **rencana uji dan kriteria lulus**, bukan klaim bahwa pengujian interaktif selesai. Jalankan dengan akun uji fiktif pada staging, jangan gunakan identitas pasien riil.

## Gate wajib untuk setiap rilis

1. `npm test`, produksi `npm run build`, `npm audit --audit-level=high`, dan alur GitHub CI sukses.
2. Schema, RLS, RPC grants, dan Edge Function versi produksi cocok dengan source yang disetujui. Catat drift migrasi, jangan memaksa `db reset`.
3. Uji persona × unit: anonim, PIC unit A, Validator unit A, PIC unit B, PMKP, Management, KABID, Direktur, Dewan Pengawas, Admin; aktif/nonaktif dan token kedaluwarsa. Pengujian lintas unit harus menolak akses tidak sah (403/empty sesuai kontrak) dan tetap mengizinkan operasi sah.
4. Gunakan dataset sintetis untuk seluruh alur ekspor, impor dan pengujian denial. Periksa audit trail, penanganan retry, dan tidak ada simpan ganda.
5. Tidak ada kesalahan P0/P1 yang tidak dimitigasi. Ukur latency p50/p95/p99, LCP, INP, CLS pada rilis nyata sesuai baseline yang disetujui.

## Acceptance matrix per modul

| Modul/area | Uji fungsional minimum | Batas keamanan dan integritas |
| --- | --- | --- |
| Dashboard/Visual Intelligence | KPI, filter periode/unit, tren dan empty state | Angka berasal dari query agregat yang benar; tidak ada angka rekaan |
| NARA AI | 14 skill, prompt singkat, lintas domain, fallback provider, error, rate limit | JWT/RLS, DLP identifier, n<5 suppression, tanpa data pasien ke provider |
| Register Pasien | Tambah/edit, import rekam pasien, deduplikasi, readmisi, episode | Identitas dan relasi hanya untuk role/unit sah; audit akses |
| Indikator Mutu | Profil, N/D, grain, target, logbook, impor Excel, validasi, hasil | Versi definisi, provenance, audit, tidak ada double counting |
| Peningkatan Kinerja Klinis | Clinical Pathway, audit kematian, konsultasi IGD | Data klinis, status reviewer dan langkah persetujuan tidak dilewati |
| Keselamatan Pasien | Insiden, investigasi/RCA, survei, laporan QR anonim | Batasi token publik, privasi pelapor, deny cross-unit |
| Manajemen Risiko | Register, level, skor, FMEA, rencana tindak | Kriteria risiko tervalidasi, role scoped, provenance |
| Program & RTL | Rekomendasi, prioritas, assignment, PDSA/PDCA, evaluasi | State transition dan otorisasi pemilik aksi |
| Sekretariat | Dokumen dan undangan, upload, file-reader, notifikasi | Storage path/private assets dan akses unit |
| Sumber Daya Manusia | Master staf, tim, OPPE, FPPE, status evaluasi | Akses evaluasi per orang, persetujuan profesional |
| Pengaturan | Akun, unit, rotasi password, preferensi, audit log | Admin-only RPC; password lemah/bocor ditolak bila layanan mendukung |

## Device and accessibility matrix

| Lebar viewport | Mode | Pemeriksaan |
| --- | --- | --- |
| 320, 360, 390px | terang dan gelap | Tidak ada horizontal clipping; input >=16px; target sentuh >=44px; keyboard virtual |
| 720, 721, 760px | terang dan gelap | Boundary sidebar/tab tablet, dropdown overflow dan tabel dapat di-scroll |
| 768, 1024px | terang dan gelap | Tabel, modal, reflow dan navigasi dengan konten lebar |
| 1440px | terang dan gelap | Readability desktop, tabel padat, dialog tidak bertumpuk |
| Semua ukuran | reduced-motion, zoom 200%, keyboard-only | Fokus terlihat, Escape dan focus trap/restore, semantic labels, contrast >=4.5:1 normal |

Jalankan uji pembaca layar dan pengujian browser berbasis screenshot di staging. Tes source regex dan build saja tidak membuktikan tidak ada elemen saling menimpa.

## Penilaian dan bukti yang wajib dicatat

Untuk setiap skenario: build SHA, nama modul, persona/unit uji, dataset sintetis, resolusi/mode, langkah, hasil yang diharapkan/aktual, status lulus/gagal, screenshot/log tanpa data sensitif, pemilik perbaikan, dan retest pascarelease.

Penilaian wajib memisahkan **tidak diuji**, **gagal**, **lulus**, dan **tidak berlaku**. Jangan mengonversi `tidak diuji` menjadi `lulus`.
