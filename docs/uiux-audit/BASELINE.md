# Baseline UI/UX AUREKA

Baseline `dc2390ed4ae79465a8f0f596e6258d235ab8af8c`, sama dengan snapshot audit dan `origin/main` ketika diperiksa. Worktree awal bersih. Branch lokal `codex/aureka-uiux-master`.

| Pemeriksaan | Hasil |
| --- | --- |
| `npm ci` | Lulus. Instalasi dari lockfile. |
| `npm run ci` | Lulus. 962 tes, validasi 38 layout dan unit, TypeScript, build ekspor statis, dan pemeriksaan aset kontras. |
| Browser Chromium, ekspor statis lokal, fixture sintetis | Portal publik tampil. Setelah selector portal, form login, dan dasbor disesuaikan, login ADMIN dan pengukuran layout 1366 piksel lulus. Suite berhenti pada selector navigasi `.sidebarNavGroup > button[title="Mutu Klinis"]`. Navigasi saat ini dirender lewat `.sidebarDomainTrigger` dan `.sidebarDomainItem` di `components/HomeClient.tsx`. |
| Role, tema dan viewport lain | Verifikasi menyeluruh masih tertunda. |

`ROUTE_ROLE_MATRIX.json` mencatat registry, halaman publik, dan kandidat permukaan UI berdasarkan source. Matriks belum menegaskan status aktif, alias, atau hak akses runtime tiap permukaan. `CSS_OWNERSHIP.md` mencatat urutan stylesheet, dengan penelusuran aturan yang menang masih tertunda.

Reproduksi browser memakai `scripts/check-workspace-ui.mjs`, `AUREKA_UI_URL` yang menunjuk ekspor lokal, dan Chromium CDP lokal. Screenshot serta laporan sintetis berada di direktori kerja sementara. Permintaan backend browser diintersepsi oleh harness.

P00 belum memenuhi inventaris runtime dan gate browser. Perbaikan yang telah dilakukan terbatas pada harness dan dokumentasi baseline. Perubahan ini dapat dibatalkan dengan membalik commit preflight lokal. Tidak ada push, merge, deploy, atau mutasi produksi.
