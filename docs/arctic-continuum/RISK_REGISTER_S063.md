# Register Risiko S063 · pilot P4

Baseline audit ae8c13875f6384e8e34020e266d5b8a15bb91e3f. Lokasi tetap PMKP → Manajemen Risiko → Daftar Risiko. Pengguna masuk melalui hash yang sama. Pada shell Arctic opsional, tabel disajikan lebih dulu, sedangkan matriks dan ringkasan dibuka lewat satu disclosure. Pada layar sempit tabel tetap semantik dan memakai area gulir existing. Permukaan sel memakai token terang atau gelap. Pilihan Layout lama tetap tersedia.

## Bukti aktual

- npm ci, 982 tes unit, validator 38 layout/unit, TypeScript, build statis, serta pemeriksaan kontras aset ekspor selesai dengan kode 0. Audit npm untuk dependensi produksi melaporkan 0 advisory saat diperiksa.
- Smoke Chromium pada ekspor lokal dengan Supabase sintetis lulus 12 pemeriksaan dan 939 request mock, tanpa exception runtime. Termasuk pembukaan via keyboard, filter dari sel matriks, CSV identik byte-for-byte antara dua layout pada fixture 19 risiko, serta kembali ke layout lama.
- Screenshot sintetis arctic-risk-1366-terang.png dan arctic-risk-390-gelap.png plus report.json disimpan oleh harness. Kedua ukuran menampilkan table-row dengan viewport tabel di dalam layar. Kontras terukur pada sampel nama risiko masing-masing 13,60:1 dan 12,95:1. Jumlah baris utuh yang terlihat tanpa menggulir masing-masing lima dan satu. Ukuran ini belum membuktikan target kepadatan ilustrasi 1600 × 900.
- Review visual awal menemukan aturan legacy yang mengubah baris menjadi kartu pada ponsel. Aturan tersebut sekarang mengecualikan tabel Arctic tanpa perubahan specificity untuk layout lama. Uji Chromium menegaskan baris tetap tabel pada kedua ukuran.

Perubahan ini memakai jalur filter, pagination, CSV, detail, editor, hak aksi, dan rumus penilaian existing. Tidak ada migrasi SQL, mutasi produksi atau perubahan frontend default. Sampel UI menguji ADMIN dan paritas menu delapan peran dengan mock. Uji negatif role dan unit pada izin database, dataset besar nyata, penilaian pengguna, dan WCAG lintas kontrol tetap menjadi bagian gate terbuka. Bukti blockers dan cakupan lintas modul ada di [audit baseline](AUDIT_V2_2026-11-28.md).
