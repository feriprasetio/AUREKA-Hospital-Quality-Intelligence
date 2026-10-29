# Implementasi redesain berdasarkan Audit Menyeluruh AUREKA

Dokumen ini memetakan mockup dan rekomendasi pada `AUREKA_Audit_Menyeluruh_UI_Engine_Arsitektur_2026-10-28.pdf` ke perubahan kode yang dikerjakan pada branch redesain.

## Perubahan UI yang diterapkan

- Menambahkan `app/clinical-ui.css` dengan token warna klinis: brand `#0F7656`, sidebar `#084F3A`, text `#172820`, muted `#63736A`, surface `#FFFFFF` dan `#F3F7F4`.
- Mengubah workspace terautentikasi menjadi sidebar solid, topbar putih, kartu putih dengan border tipis, kontrol form lebih terbaca, label/metadata minimum 12 px, focus-visible, dan reduced-motion. Area input/operasional tidak memakai blur/gradien sebagai surface utama; landing dan autentikasi boleh mempertahankan identitas visual sebelumnya.
- Menyesuaikan dashboard menjadi empat KPI operasional yang bersumber dari data yang sudah dibaca dashboard, ditambah bar periode, unit, timestamp pemutakhiran, serta status sumber. Error sumber tidak disamarkan sebagai angka nol.
- Menjadikan editor logbook indikator terbuka inline di bawah baris pilihan dan mempertahankan alur paste Excel sebagai draf yang harus ditinjau serta disimpan satu per satu.
- Menggabungkan direktori, tim/penugasan, OPPE dan FPPE dalam satu area **Tenaga Klinis**. Mutu Klinis hanya memuat Audit Indikator Mutu, Clinical Pathway, serta Audit Klinis dan Kematian.
- Menambahkan hash navigasi untuk area utama dan subarea mutu sehingga halaman dapat dibookmark dan lokasi area dapat dipulihkan setelah login.
- Menghapus panel status sistem publik yang menggunakan klaim tetap seperti jumlah modul, “Supabase”, dan “Terproteksi” tanpa health check yang terukur.
- Menjadikan `lib/aureka/module-registry.ts` referensi utama label, urutan dan deskripsi area sidebar serta kartu Mutu Klinis.

## Integritas data yang sudah ada dari perubahan sebelumnya

- Cache episode pasien/audit klinis tidak lagi ditulis ke `localStorage`; kegagalan simpan menyisakan draf di memori dan ditandai belum tersimpan.
- Penyimpanan logbook indikator memakai RPC transaksi atomik untuk parent, respons, dan atribusi tenaga.
- Query analitik menggunakan allowlist kolom sesuai dataset.
- Impor Excel menolak header yang tidak cocok dengan layout aktif, membuat draf, memberi peringatan nilai yang tidak bisa dipetakan dengan aman, dan mewajibkan pemeriksaan sebelum setiap penyimpanan.
- Tanggal dashboard menggunakan tanggal lokal, bukan tanggal UTC dari `toISOString()`.

## Kriteria penerimaan yang perlu dijalankan

- [ ] Buka aplikasi di viewport 1366, 1024, 768, dan 360 px; periksa tidak ada overflow yang menutupi aksi utama.
- [ ] Uji keyboard: menu, kartu modul, tabel, dialog, form, tombol simpan, dan navigasi kembali.
- [ ] Uji role ADMIN, PMKP, PIC, VALIDATOR dan akun yang tidak aktif; lakukan tes lintas unit pada database test.
- [ ] Uji hash route dari halaman publik → login → modul; gunakan tombol Back/Forward browser.
- [ ] Uji save sukses, RPC ditolak, sesi habis, dan child-data gagal agar status simpan tidak ambigu.
- [ ] Lakukan audit WCAG 2.2 AA dengan pengukuran kontras dan pengujian screen reader; CSS focus/reduced-motion saja bukan bukti kepatuhan penuh.
- [ ] Review visual bersama PIC, validator dan PMKP menggunakan tugas nyata. Mockup pada PDF adalah target konseptual, bukan data produksi.

## Rekomendasi audit yang masih memerlukan pekerjaan khusus

1. **ENG-01 — Engine indikator berbasis metadata.** Target dan format input tidak boleh ditentukan dari heuristik judul. Perubahan ini memerlukan kamus `measurement_schema` yang eksplisit, versi rule, owner indikator, dan boundary tests. Profil master saat ini diketahui memiliki ketidaklengkapan/ketidakseragaman; aturan klinis tidak diubah otomatis tanpa persetujuan pemilik indikator.
2. **SEC-02 — Matriks RLS/RPC/storage.** Build tidak membuktikan akses lintas-role atau lintas-unit. Diperlukan integration tests berautentikasi, termasuk anon, PIC Unit A versus Unit B, validator, session expired, dan ekspor.
3. **DATA-02 — Versioning serta validator master.** Terapkan effective date, draft/published/retired, definisi N/D, target/operator, grain, pemilik, dan rollback. Master invalid perlu laporan QA yang disetujui pemilik indikator.
4. **CI-01 — Lockfile dan gate terpadu.** Repository masih perlu `package-lock.json`, migrasi ke `npm ci`, serta unit/data/security/E2E/accessibility gates. Workflow yang ada belum setara dengan test matrix penuh pada PDF.
5. **PERF-01 — Agregasi server-side.** Dashboard saat ini menampilkan data ringkasan dari sumber yang telah ada, bukan seluruh set agregat mutu klinis. Persentase kepatuhan indikator tidak ditampilkan sebagai angka eksekutif sampai cohort, denominator, status validasi dan versi definisi dapat dihitung secara benar.
6. **Audit keamanan operasional.** Jalankan test storage browser saat gagal simpan/logout/sesi habis, dan tinjau storage policy untuk evidence serta ekspor.

Tidak ada klaim bahwa aplikasi bebas bug atau seluruh acceptance test telah lulus. Kode UI dan build adalah satu tahap; rilis pilot klinis tetap bergantung pada uji akses, validasi aturan oleh Komite PMKP, dan uji pengguna.
