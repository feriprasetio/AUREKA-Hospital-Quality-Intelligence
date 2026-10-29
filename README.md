# AUREKA — Hospital Quality Intelligence

Aplikasi kerja Komite Peningkatan Mutu dan Keselamatan Pasien (PMKP) UPT RSUD Sultan Syarif Mohamad Alkadrie.

AUREKA mengelompokkan pekerjaan ke dalam tujuh area: **Ringkasan**, **Mutu Klinis**, **Keselamatan Pasien**, **Manajemen Risiko**, **Tenaga Klinis**, **Analitik & Laporan**, dan **Administrasi**. Hak akses operasional tetap ditentukan oleh autentikasi, role, RLS, dan validasi RPC di Supabase; tidak ditentukan oleh menu yang terlihat di browser.

## Arsitektur dan deployment

- **Frontend:** Next.js + React, diekspor menjadi situs statis melalui `output: 'export'` di `next.config.mjs`.
- **Hosting frontend:** GitHub Pages — [workflow deploy](.github/workflows/deploy-pages.yml).
- **Backend:** Supabase untuk autentikasi, PostgreSQL, RLS, RPC, dan storage.
- **Sumber kebenaran operasional:** profil indikator, catatan audit, respons, identitas tenaga, dan status workflow pada Supabase. Berkas JSON di `data/` digunakan sebagai layout/fixture yang secara eksplisit dibaca oleh aplikasi, bukan sebagai pengganti diam-diam master produksi.
- **Registry modul:** `lib/aureka/module-registry.ts` menjadi referensi label, kelompok, status pilot, pemilik, dan hash navigasi area utama serta kartu Mutu Klinis.

## Persiapan lokal

Persyaratan: Node.js 22 atau versi kompatibel dengan Next.js yang tercantum pada `package.json`.

1. Salin `.env.example` menjadi `.env.local` jika akan menggunakan konfigurasi Supabase selain fallback proyek produksi yang tercantum dalam kode.
2. Instal dependensi: `npm install`.
3. Jalankan pengembangan: `npm run dev`.
4. Periksa TypeScript: `npx tsc --noEmit`.
5. Jalankan regresi yang tersedia: `node --experimental-strip-types --test tests/*.test.mjs`.
6. Buat build production: `npm run build`.

Catatan engineering: repo saat ini masih perlu menambahkan dan mengunci `package-lock.json` lalu beralih ke `npm ci` agar instalasi transitive dependencies dapat direproduksi. Perintah di atas mencerminkan skrip yang tersedia sekarang, bukan klaim bahwa seluruh test integration/RLS/browser telah dibuat.

## Pengembangan fitur dan rilis

- Kerjakan perubahan melalui branch dan pull request.
- Pull request yang menyentuh alur OPPE/indikator dijalankan melalui workflow validasi build.
- Deploy frontend production terjadi setelah push ke `main`, menggunakan workflow GitHub Pages.
- Migrasi SQL harus direview bersama kode yang memakainya. Jangan menyatakan migrasi produksi selesai hanya karena file SQL berada di repository.
- Data master klinis, target indikator, aturan skoring, dan tanggal efektif harus disetujui pemilik indikator/Komite PMKP sebelum dipakai sebagai dasar hasil resmi.

## Perlindungan data

- Jangan menulis nama pasien, nomor rekam medis, diagnosis, atau isi formulir klinis mentah ke `localStorage`.
- Kegagalan menyimpan harus dilaporkan sebagai belum tersimpan; draf memori browser bukan pengganti catatan server.
- Analitik hanya mengambil kolom yang dibutuhkan. Pembatasan tampilan pada UI bukan pengganti RLS/RPC.
- Jangan menaruh kredensial server/service-role pada frontend. Publishable key hanya aman dipakai bersama kebijakan database yang benar.

## Status produk dan batasan

AUREKA masih berada pada tahap penguatan/pilot. Status `beta` di registry bukan pernyataan lulus uji klinis atau keamanan secara menyeluruh. Lihat [arsitektur](docs/ARCHITECTURE.md), [catatan redesain dari audit](docs/REDESAIN-UI-AUDIT-MENYELURUH.md), dan [QA master indikator](docs/QUALITY_MASTER_QA.md) untuk cakupan, kriteria penerimaan, serta pekerjaan tata kelola yang belum selesai.

Pemelihara awal: Fery Prastio, S.Stat.
