# Aturan untuk agen AI (ChatGPT/Codex, Claude, Copilot, dll.)

Baca ini sebelum mengubah repo AUREKA.

## Tampilan (UI) — JANGAN diubah tanpa persetujuan Feri
- Tema baku: **Arktik** (`<html data-skin="arktik">`), dengan mode `terang`/`gelap` yang dipilih pengguna (disimpan di `localStorage['aureka-mode']`).
- **Jangan** mengganti ke tema Solid / "Solid Default", jangan memaksa mode terang, jangan menghidupkan lagi komponen atau dokumen desain lama yang sudah dihapus.
- Font: Plus Jakarta Sans (`next/font`, variabel `--font-aureka`).
- Urutan stylesheet didefinisikan oleh `app/aureka-global.css` (diimpor dari `app/layout.tsx`), bukan daftar import individual di layout. **Kebijakan permukaan tunggal** untuk semua workspace adalah `app/aureka-canvas-preferences.css` di posisi terakhir setelah seluruh legacy navigation. Ini adalah pemilik desain Canvas v2, bukan tempat menumpuk patch. Perbaiki aturan komponen di file asal bila memungkinkan; perubahan sistem permukaan bersama hanya boleh melalui kebijakan ini, dengan tes regresi, mode terang/gelap dan verifikasi visual. Jangan menambah stylesheet override lain.
- Arah gaya rinci ada di `DESIGN.md` (ukuran huruf, kontras, blur, bayangan, label, target sentuh). Baca sebelum mengubah tampilan.
- Prinsip: **Canvas Arktik tanpa kartu solid untuk informasi, KPI dan panel baca**, form/dialog/konfirmasi dan input tetap memiliki permukaan serta batas yang jelas. Semua preferensi peramban diatur melalui Pengaturan > Preferensi Tampilan (`lib/ui/appearance-preferences.ts`), tanpa toggle Nyaman/Ringkas di header. Navigasi memakai satu registry tujuan dengan penyajian berbeda: sidebar permanen desktop dan tablet (tidak tersembunyi di drawer), dock bawah smartphone + drawer hanya untuk lebar hingga 720px. Jangan menduplikasi hak akses atau rute. Animasi menghormati `prefers-reduced-motion`.

## Alur kerja
- Kerjakan di branch lalu buka Pull Request; **jangan push langsung ke `main`**.
- Pastikan CI hijau sebelum merge: `node --test tests/*.mjs` dan `npx tsc --noEmit`.
- Perubahan skema/RLS Supabase ditulis sebagai file di `supabase/migrations/` untuk dijalankan Feri; sebutkan urutan menjalankannya.
- Jangan menaruh API key di kode klien.

## Standar engineering tambahan (Arctic Continuum)
Baca `docs/engineering/SKILL_GUIDED_ENGINEERING.md` dan `docs/engineering/skill-sources.json` untuk panduan eksternal yang dipatok pada commit. Gunakan prinsipnya, bukan installer atau hook otomatis. Standar AUREKA, kontrak klinis, perlindungan data dan spesifikasi Arctic Continuum yang disetujui tetap lebih tinggi. Uji perilaku pada interface publik, pertahankan rute/izin/rumus/ekspor, dan pisahkan kelulusan CI dari penerimaan produksi. Jangan menyimpan temuan keamanan rinci atau data klinis di repo publik.
