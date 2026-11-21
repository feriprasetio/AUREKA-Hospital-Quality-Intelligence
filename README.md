# AUREKA · Hospital Quality Intelligence

**Sistem kerja peningkatan mutu, keselamatan pasien, manajemen risiko, dan intelijen operasional rumah sakit.** Antarmuka berbahasa Indonesia, responsif, dengan kontrol akses berbasis peran dan unit.

> Informasi dalam aplikasi adalah dukungan analitis dan pencatatan, bukan pengganti keputusan klinis atau validasi pejabat berwenang.

## Arsitektur produksi

| Layer | Implementasi |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, static export untuk GitHub Pages |
| Backend | Supabase PostgreSQL, Auth, Row-Level Security, RPC, Storage, Edge Functions |
| AI | NARA melalui Edge Function `aureka-tanya` dengan routing skill deterministik dan konteks agregat terotorisasi |
| Delivery | GitHub Actions: unit/data/typecheck, build, security checks, GitHub Pages, deploy Edge Functions |
| UI | Tema **Arktik Canvas v2**, konten internal cardless, mode terang/gelap, sembilan preferensi tampilan lokal (XS/S/M/L, density, kontras, header, lebar baca, tabel, motion); desktop dan tablet sidebar permanen (termasuk tablet wide-touch), smartphone bottom dock dan drawer (≤720px); registry akses/rute bersama |

Di produksi, `next.config.mjs` menggunakan `output: 'export'`. Karena **tidak ada Next.js server route tepercaya**, otorisasi dan transaksi sensitif wajib divalidasi oleh Supabase RLS/RPC/Edge Function, tidak hanya oleh tampilan.

## Area produk

Modul terdaftar di `lib/aureka/module-registry.ts`: Dashboard, NARA AI, Register Pasien, Indikator Mutu, Peningkatan Kinerja Klinis, Keselamatan Pasien, Manajemen Risiko, Visual Intelligence, Program & RTL, Sekretariat, Sumber Daya Manusia, dan Pengaturan. Beberapa berstatus *beta* dan perlu pengujian penerimaan sebelum dinyatakan siap produksi untuk seluruh alur.

NARA saat ini memiliki 14 keluarga skill dalam `supabase/functions/aureka-tanya/skills.ts`. Pemilihan skill adalah aturan server, **bukan izin baru**: data tetap dibatasi JWT/RLS serta proyeksi konteks minim. Verifikasi manusia tetap wajib untuk usulan ICD-10 dan kebijakan klinis.

## Pengembangan lokal

Persyaratan: Node.js 24 dan npm, disesuaikan dengan workflow CI.

```bash
npm ci
npm run dev
```

Contoh konfigurasi ada di `.env.example`. Gunakan nilai publik/publishable yang sesuai proyek pengembangan. **Jangan** menaruh `service_role`/secret API key pada file `NEXT_PUBLIC_*`, source browser, atau commit GitHub. Semua kunci layanan AI harus tetap di Supabase Secrets.

Pengujian sebelum PR:

```bash
npm test
npm run build
```

`npm test` menjalankan tes Node, validasi data dan pengecekan TypeScript. Workflow PR menambahkan `npm audit --audit-level=high` dan konfigurasi build produksi. Lulusnya CI tidak menggantikan verifikasi RLS lintas peran/unit dan uji browser nyata.

## Kontrak perubahan

- **Wajib branch dan pull request**; jangan push langsung ke `main`. CI harus lulus sebelum merge.
- Ikuti `AGENTS.md` dan `DESIGN.md`. Tema Arktik dan preferensi terang/gelap harus tetap bekerja. `app/aureka-canvas-preferences.css` adalah kebijakan terminal tunggal untuk permukaan dan header; hindari penambahan stylesheet override lain atau perubahan tanpa tes. Form/dialog dan aksesibilitas tetap terpisah dari kebijakan cardless.
- Kode migrasi ditempatkan di `supabase/migrations/` dan ditinjau sebagai perubahan data sensitif. **Jangan replay seluruh folder ke database produksi**. Lihat `docs/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-21.md` untuk riwayat drift versi.
- Setiap perubahan RLS/RPC wajib menguji minimal peran `anon`, staf unit, Validator/PIC, PMKP, manajemen, Super Admin; pastikan tidak ada pembacaan data lintas unit yang tidak sah.
- Audit nilai numerator/denominator, grain, target, versi profil, dan sumber data sebelum mengubah hasil indikator klinis.
- Backup, rollback, dan bukti pengujian harus tersedia sebelum migrasi yang dapat mengubah atau menghapus data.

## Referensi operasional

- `docs/ARCHITECTURE.md`: arsitektur dan batas keamanan
- `docs/QA_ACCEPTANCE_MATRIX.md`: pengujian berbasis peran, modul, UI/UX dan engine
- `docs/NARA_SECURITY_RUNBOOK.md`: kontrol dan alur NARA
- `docs/QUALITY_MASTER_QA.md`: pemeriksaan kualitas indikator
- `docs/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-21.md`: perbandingan histori migrasi dan prosedur aman
- [Audit lintas domain dan backlog](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/issues/586)

## Prinsip

Pelaporan harus dapat ditelusuri, angka tidak boleh direkayasa, dan keputusan klinis maupun pengesahan harus tetap pada manusia berwenang.

Semoga berkah untuk semua Komite PMKP Rumah Sakit se-Indonesia.
