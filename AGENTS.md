# Aturan untuk agen AI (ChatGPT/Codex, Claude, Copilot, dll.)

Baca ini sebelum mengubah repo AUREKA.

## Tampilan (UI) — JANGAN diubah tanpa persetujuan Feri
- Tema baku: **Arktik** (`<html data-skin="arktik">`), dengan mode `terang`/`gelap` yang dipilih pengguna (disimpan di `localStorage['aureka-mode']`).
- **Jangan** mengganti ke tema Solid / "Solid Default", jangan memaksa mode terang, jangan menghidupkan lagi komponen atau dokumen desain lama yang sudah dihapus.
- Font: Plus Jakarta Sans (`next/font`, variabel `--font-aureka`).
- Urutan stylesheet didefinisikan oleh `app/aureka-global.css` (diimpor dari `app/layout.tsx`), bukan daftar import individual di layout. `dark-mode-mobile-fixes.css` **bukan** import terakhir: ada file navigasi setelahnya. Perbaiki aturan di file pemilik, audit dampak seluruh selector pada kedua mode, dan jangan menambah stylesheet penimpa baru. Jangan mengubah urutan CSS tanpa tes regresi dan pengujian visual.
- Arah gaya rinci ada di `DESIGN.md` (ukuran huruf, kontras, blur, bayangan, label, target sentuh). Baca sebelum mengubah tampilan.
- Prinsip: ringkas (minim scroll), form di popup, **satu registry tujuan navigasi** dengan penyajian berbeda per perangkat: sidebar desktop, rail tablet + drawer, dock bawah smartphone + drawer. Jangan menduplikasi hak akses atau rute. Animasi menghormati `prefers-reduced-motion`.

## Alur kerja
- Kerjakan di branch lalu buka Pull Request; **jangan push langsung ke `main`**.
- Pastikan CI hijau sebelum merge: `node --test tests/*.mjs` dan `npx tsc --noEmit`.
- Perubahan skema/RLS Supabase ditulis sebagai file di `supabase/migrations/` untuk dijalankan Feri; sebutkan urutan menjalankannya.
- Jangan menaruh API key di kode klien.
