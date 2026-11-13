# Implementasi Visual Intelligence AUREKA

Dokumen ini menjadi catatan implementasi bertahap dari Blueprint Visual Intelligence AUREKA. Perubahan dilakukan di branch fitur dan harus melewati CI sebelum digabung ke `main`.

## Prinsip implementasi

1. Data aktual saja: tidak membuat angka dummy, skor contoh, atau status sintetis pada dashboard produksi.
2. Tidak mengubah schema, migration, RLS, tabel operasional, formula indikator, dan alur persetujuan sebagai bagian dari pekerjaan visual.
3. Filter grafik, KPI, dan tabel harus menggunakan cakupan periode/unit dan hak akses yang sama.
4. Status kosong, belum dimuat, gagal, tidak diizinkan, dan nilai 0 harus dibedakan.
5. Pertahankan tema Arktik, Plus Jakarta Sans, satu navigasi sidebar, dan aturan mobile pada `DESIGN.md`.
6. Setiap visual harus memiliki definisi ukuran, denominator, grain data, dan timestamp pembaruan jika tersedia.

## Perubahan yang sudah diterapkan pada fase fondasi

- Global accent shell diarahkan dari hijau lama ke navy/biru Arktik (`#16507a`, `#0f2a44`), termasuk token aksen yang digunakan komponen workspace.
- Halaman Beranda/Infografis pada `HomeLandingWorkspace` menggunakan palet biru Arktik pada grafik, legend, panel, filter, dan state visual.
- Dashboard Infografis lintas domain menggunakan palet kategori biru yang konsisten; aksen insight dan pilihan grafik diselaraskan.
- Tidak ada perubahan query, definisi indikator, data pasien, data insiden, data risiko, maupun skema Supabase dalam fase ini.

## Peta visual per modul dan subtab

| Modul | Subtab/halaman | Visual yang harus dipakai | Sumber/kontrak |
|---|---|---|---|
| Beranda | Welcome | tugas/pengingat, shortcut, status kerja | aktivitas akun dan role terotorisasi |
| Beranda | Infografis | tren mutu, episode klinis, IKP, risiko, RTL | agregasi server-side yang sudah diotorisasi |
| Pasien | Register | volume episode, episode aktif/selesai, daftar terfilter | episode pelayanan; identitas hanya di daftar berizin |
| Pasien | Statistik | tren episode, diagnosis, LOS | episode dengan tanggal masuk/keluar valid |
| Pasien | Metadata | kelengkapan dan anomali metadata | agregasi kualitas data |
| Indikator Mutu | Form Logbook | jumlah catatan, kelengkapan, antrean validasi | logbook dan status review |
| Indikator Mutu | Hasil Unit | capaian per unit, tren, target | profil indikator + record tervalidasi |
| Indikator Mutu | Hasil Kategori | capaian menurut kategori indikator | taksonomi master indikator |
| Indikator Mutu | Profil Indikator | kelengkapan definisi, target, versi | master profil indikator |
| Peningkatan Kinerja Klinis | Clinical Pathway | keterisian, kepatuhan, variasi, PPA/tahap | episode eligible dan audit pathway |
| Peningkatan Kinerja Klinis | Audit Klinis/Kematian | distribusi telaah, ketercegahan, rekomendasi | instrumen audit klinis dan episode |
| Keselamatan Pasien | Ringkasan | tren laporan, grading, investigasi, RTL | register IKP dan workflow |
| Keselamatan Pasien | Register Insiden | tipe, grading, unit, status | data insiden; identitas disembunyikan pada grafik |
| Keselamatan Pasien | Investigasi/RCA | funnel investigasi, faktor kontribusi, rekomendasi | data investigasi terotorisasi |
| Keselamatan Pasien | Form Survei | partisipasi dan kelengkapan dimensi | instrumen dan respons survei |
| Keselamatan Pasien | Register Survei | agregat dimensi, status respons | respons; ambang privasi wajib |
| Manajemen Risiko | Daftar Risiko | matriks 5x5, level, daftar prioritas | risk register dan metodologi skor resmi |
| Manajemen Risiko | Konektor | network graph bertipe relasi | relasi risiko yang tervalidasi |
| Manajemen Risiko | Profil Risiko | kategori, unit, inheren vs residual | taksonomi risiko resmi |
| Manajemen Risiko | FMEA/HFMEA | process map, failure mode, prioritas | data FMEA dan skema penilaian |
| Manajemen Risiko | Mitigasi/RTP | timeline triwulan, progres, PIC | rencana pengendalian dan bukti |
| Manajemen Risiko | Evaluasi | skor sebelum/sesudah, efektivitas kontrol | evaluasi residual dan target |
| Program | Program Kerja | area prioritas, progres triwulan, status | program tahunan |
| Program | Rekomendasi/RTL | funnel, overdue, siklus PDSA/PDCA | rekomendasi dan tindakan |
| Program | Usulan Indikator | status telaah, backlog, waktu siklus | workflow usulan indikator |
| SDM | Direktori | komposisi profesi, kelengkapan | master tenaga kerja |
| SDM | Tim/Penugasan | roster, status penugasan | tim dan riwayat penugasan |
| SDM | Kinerja PIC | tren aktivitas logbook | aktivitas tercatat; bukan mutu klinis individu |
| SDM | OPPE | status evaluasi dan tindak lanjut | evaluasi OPPE terotorisasi |
| SDM | FPPE | trigger, rencana, bukti, keputusan | evaluasi FPPE terotorisasi |
| Pengaturan | Akun/Pengguna/Role | status akun dan matriks akses | administrasi pengguna |
| Pengaturan | Unit/Instalasi | hierarki dan status unit | master unit |
| Pengaturan | Keamanan/Preferensi | status kontrol dan preview tema | preferensi akun dan konfigurasi |
| Pengaturan | Konfigurasi/Audit Log | status sistem dan jejak aktivitas | konfigurasi aman dan audit log |

## Tahap berikutnya

### Fase 1 — Konsolidasi design system
- Audit token warna, kontras, typography, kartu, tabel, chart, dan empty states pada seluruh workspace.
- Konsolidasikan komponen grafik (bar, line, donut, heatmap, network, timeline) tanpa mengganti sumber datanya.
- Tambahkan visual regression untuk terang/gelap dan ukuran layar mobile.

### Fase 2 — Dashboard domain prioritas
- Mutu: hasil capaian per unit/kategori dan metadata indikator.
- Keselamatan pasien: ringkasan insiden dan investigasi.
- Risiko: matriks, profil kategori, konektor, dan evaluasi RTP.
- Program: progres program dan RTL.

### Fase 3 — Domain klinis dan SDM
- Pasien: episode, statistik, metadata, LOS.
- Clinical Pathway dan audit klinis/kematian.
- Direktori, tim, kinerja PIC, OPPE, FPPE.

### Fase 4 — Administrasi dan hardening
- Pengaturan, hak akses, audit log.
- Uji privasi, RLS, agregasi kelompok kecil, performa, aksesibilitas, dan GitHub Pages static export.

## Gerbang penerimaan

- `npm test` dan `npm run build` harus lulus pada CI.
- Tidak ada nilai sintetis pada data produksi.
- KPI, grafik, dan tabel konsisten pada filter yang sama.
- 0 observasi tidak ditampilkan sebagai 0% capaian.
- Rate memiliki denominator dan periode.
- Identitas pasien, pelapor IKP, dan responden survei tidak bocor pada visual agregat.
- Semua komponen diuji pada mode terang/gelap dan lebar mobile.
- Tidak ada migration atau perubahan data operasional dalam pekerjaan visual.

## Batas fase ini

Fase fondasi belum menyatakan semua visual pada seluruh subtab selesai diimplementasikan. Peta di atas adalah kontrak target dan daftar kerja. Setiap fase lanjutan harus menyentuh workspace dan kontrak data yang tepat, diuji, dan diajukan melalui PR terpisah bila risiko regresinya besar.
