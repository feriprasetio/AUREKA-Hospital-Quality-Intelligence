# Arsitektur AUREKA

## Keputusan deployment saat ini

Frontend AUREKA menggunakan Next.js dengan `output: 'export'` dan `basePath` untuk repository GitHub Pages. Karena frontend adalah static export, tidak ada server-side Next.js route yang dapat dipercaya untuk otorisasi atau transaksi bisnis.

- **Frontend:** GitHub Pages, dibangun dan dipublikasikan oleh `.github/workflows/deploy-pages.yml`.
- **Backend:** Supabase PostgreSQL, Auth, RLS, RPC, dan storage.
- **Source control / CI:** GitHub dengan workflow build dan regresi.
- **Hosting alternatif:** Vercel pernah disebut sebagai opsi pada dokumen lama, tetapi bukan jalur production yang dikonfigurasi oleh `next.config.mjs` dan workflow Pages saat ini.

## Lapisan domain

1. **UI:** input, pencarian, navigasi, umpan balik simpan, dan status workflow. UI tidak boleh menjadi kontrol keamanan.
2. **Domain service/RPC:** validasi role, akses unit, payload, transisi status, dan operasi multi-tabel.
3. **Database:** RLS, constraint, fungsi transaction-safe, audit event dan relasi antarobjek.
4. **Metadata & engine:** definisi indikator/CP/OPPE dan versi aturan yang disetujui pemilik domain.
5. **Analitik:** query dengan allowlist kolom/aggregat yang scoped sesuai hak akses; hindari memuat raw patient rows untuk membuat ringkasan di browser.
6. **Evidence/export:** storage private dengan pembatasan akses dan link yang masa berlakunya pendek jika file sensitif diperlukan.

## Navigasi dan registry

`lib/aureka/module-registry.ts` memuat label dan metadata area utama dan fitur Mutu Klinis. Menu utama tidak menggandakan Direktori/Tim/OPPE/FPPE di dalam Mutu Klinis: fungsi tersebut berada di **Tenaga Klinis**. Area operasional menggunakan hash yang stabil, misalnya `#ringkasan`, `#mutu-klinis`, `#mutu-klinis/audit-indikator`, `#mutu-klinis/clinical-pathway`, dan `#tenaga-klinis`.

Registry menyediakan status `beta` sebagai penanda tahap produk; hal ini bukan pemeriksaan health check. Aplikasi tidak boleh menampilkan status backend “online” kecuali konektivitas benar-benar diuji dengan hasil dan timestamp yang valid.

## Batasan dan kontrol yang perlu dibuktikan

- Static build tidak membuktikan RLS, RPC grant, ataupun otorisasi lintas-unit benar. Jalankan matriks persona × unit pada environment uji.
- Perubahan master indikator harus berversi, memiliki tanggal efektif dan pemilik. Jangan memperbaiki nama/target klinis secara otomatis berdasarkan heuristik.
- Snapshot hasil harus menyimpan sumber data, rule/profile version, engine version, N/D bila berlaku, hasil aktual, target, waktu, dan evaluator.
- Data sensitif tidak boleh disimpan persisten di browser. Status simpan hanya boleh menjadi “tersimpan” setelah respons server sukses.
- Setelah arsitektur/perilaku diubah, jalankan test build/engine yang tersedia dan catat test yang belum bisa dijalankan.

## Build & deployment

`npm run build` menjalankan static export. GitHub Actions mengunggah folder `out/` sebagai artefak GitHub Pages. Repository masih memerlukan lockfile dan pipeline integration/security/E2E yang terpadu sebelum perubahan dapat dinyatakan dapat direproduksi secara penuh.
