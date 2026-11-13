# Aturan untuk agen AI (ChatGPT/Codex, Claude, Copilot, dll.)

Baca ini sebelum mengubah repo AUREKA.

## Tampilan (UI) — JANGAN diubah tanpa persetujuan Feri
- Tema baku: **Arktik** (`<html data-skin="arktik">`), dengan mode `terang`/`gelap` yang dipilih pengguna (disimpan di `localStorage['aureka-mode']`).
- **Jangan** mengganti ke tema Solid / "Solid Default", jangan memaksa mode terang, jangan menghidupkan lagi komponen atau dokumen desain lama yang sudah dihapus.
- Font: Plus Jakarta Sans (`next/font`, variabel `--font-aureka`).
- Urutan CSS di `app/layout.tsx` penting: `typography.css` sebelum `motion.css`, dan `aureka-navigation-consolidated.css` paling akhir (dijaga tes `motion-regression`).
- Arah gaya rinci ada di `DESIGN.md` (ukuran huruf, kontras, blur, bayangan, label, target sentuh). Baca sebelum mengubah tampilan.
- Prinsip: ringkas (minim scroll), form di popup, satu navigasi (sidebar), animasi halus yang menghormati `prefers-reduced-motion`.

## Alur kerja
- Kerjakan di branch lalu buka Pull Request; **jangan push langsung ke `main`**.
- Pastikan CI hijau sebelum merge: `node --test tests/*.mjs` dan `npx tsc --noEmit`.
- Perubahan skema/RLS Supabase ditulis sebagai file di `supabase/migrations/` untuk dijalankan Feri; sebutkan urutan menjalankannya.
- Jangan menaruh API key di kode klien.
