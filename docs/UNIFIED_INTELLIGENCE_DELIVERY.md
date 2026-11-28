# AUREKA Unified Intelligence

## Baseline rilis

Audit baca-saja membandingkan `main` pada `065f453e2f4729221465974149e18eaf0a3ed889` dengan metadata Supabase. Terdapat 110 tabel pada enam skema AUREKA. RPC analitik rekam medis mengembalikan tahun, cakupan unit, 12 bucket bulanan dan jumlah catatan LOS. RPC readmisi mengembalikan hasil berpaginasi. Cabang Supabase yang terlihat hanya `main`, dengan status migrasi `MIGRATIONS_FAILED` pada metadata cabang. Status cabang tersebut tidak menetapkan apakah RPC lama berfungsi untuk setiap peran.

| Jalur | Sumber dan batas kontrak |
| --- | --- |
| ICD-10 dan LOS | Logbook dengan grain `patient_episode` → RPC analitik rekam medis yang sudah ada → validasi bentuk, tahun dan unit → tampilan cakupan. Grain tetap catatan sumber sampai relasi episode kanonik diverifikasi. |
| Readmisi | RPC pencarian direktori pasien yang sudah ada → filter readmisi, periode, unit dan halaman → daftar serta status permintaan. Jendela 30 hari mengikuti implementasi yang sudah tersedia. Sumber SIMRS dan eksklusi klinis masih perlu validasi. |
| Publikasi | Snapshot dan persetujuan domain yang sudah ada → portal publik. Server masih menyediakan alur draf manual. Otomatisasi memerlukan versi metrik resmi yang dapat direproduksi, definisi agregat keselamatan dan risiko, serta kebijakan suppression dan differencing yang disetujui. |

## Perubahan yang diuji

- Pola Perawatan memisahkan data yang gagal dimuat, kohort kosong, dan nol yang benar-benar diamati. Cakupan LOS menunjukkan jumlah catatan yang dapat dihitung dibandingkan dengan jumlah catatan rawat inap yang memiliki tanggal keluar.
- Permintaan lama dibatalkan saat filter berubah. Hasil ditampilkan sesuai filter dan halaman aktif. Gagal memuat readmisi tidak ditampilkan sebagai nol. Muat ulang mengambil ulang data tab aktif.
- Validasi kontrak berada di `lib/aureka/patient-record-analytics.ts`. Jalankan `node --test tests/patient-record-analytics.test.mjs` dan `npm test`. Smoke Chromium pada `scripts/check-workspace-ui.mjs` menggunakan respons sintetis untuk variasi periode, LOS parsial, sumber gagal, dan readmisi pulih.
- Rilis ini memakai RPC dan hak akses yang ada. Rollback frontend dilakukan dengan revert PR melalui pipeline Pages. Data historis dan snapshot publik berada di Supabase.

## Validasi pelaporan dan publikasi

- Pembaca status pelaporan bersama memvalidasi ID unit, bulan, jumlah positif dan keunikan per unit dan bulan. Respons cacat ditampilkan sebagai sumber tidak tersedia. Daftar kosong dari RPC tetap merupakan hasil yang sah.
- Konsol publikasi menunggu konfirmasi dari RPC sebelum menampilkan keberhasilan persetujuan atau penarikan. Register yang gagal dimuat menampilkan pesan kesalahan.
- Bukti kontrak pelaporan dapat diulang dengan `node --test tests/reporting-status-contract.test.mjs`. Validasi ini mencakup satu sumber Dashboard dan Infografis. Otomatisasi draf serta penerimaan lintas domain masih terbuka.

## Penerimaan integrasi

Status di bawah berlaku untuk pekerjaan ini. Kolom baseline berasal dari blueprint dan masih memerlukan validasi masing-masing. `Diuji parsial` mencakup kontrak dan antarmuka dengan data sintetis. Penerimaan penuh memerlukan UAT pemilik domain, uji akses per peran dan unit, rekonsiliasi sumber dan bukti rilis. Penerimaan penuh pada tahap ini **0/100**.

| ID | Engine | Baseline blueprint | Status pekerjaan |
| --- | --- | --- | --- |
| I001 | E01/E04 | Parsial | Tertahan · kunci episode dan riwayat No. RM |
| I002 | E04/E06 | Parsial | Belum diverifikasi |
| I003 | E04/E06 | Parsial | Belum diverifikasi |
| I004 | E04/E06 | Parsial | Belum diverifikasi |
| I005 | E04/E08 | Parsial | Belum diverifikasi |
| I006 | E01/E07 | Usulan | Belum diverifikasi |
| I007 | E05/E06 | Usulan | Tertahan · pemetaan kejadian dan timestamp |
| I008 | E05 | Usulan | Tertahan · definisi visite dan waktu pemulangan |
| I009 | E04/E05 | Parsial | Diuji parsial · cakupan dan kegagalan filter. Episode unik dan UAT masih terbuka |
| I010 | E01/E04 | Usulan | Belum diverifikasi |
| I011 | E04/E06 | Usulan | Belum diverifikasi |
| I012 | E04/E06 | Usulan | Belum diverifikasi |
| I013 | E01/E04 | Usulan | Tertahan · pemetaan transfer dan episode |
| I014 | E02/E03 | Gap manual | Tertahan · kontrak metrik resmi dan kebijakan publikasi |
| I015 | E02/E14 | Parsial | Belum diverifikasi |
| I016 | E02/E11 | Parsial | Belum diverifikasi |
| I017 | E06/E15 | Usulan | Belum diverifikasi |
| I018 | E02/E10 | Usulan | Belum diverifikasi |
| I019 | E02/E09 | Usulan | Belum diverifikasi |
| I020 | E02/E13 | Usulan | Belum diverifikasi |
| I021 | E02/E12 | Usulan | Belum diverifikasi |
| I022 | E14 | Parsial | Belum diverifikasi |
| I023 | E02/E14 | Ada di kode | Belum diverifikasi |
| I024 | E02/E15 | Parsial | Belum diverifikasi |
| I025 | E02/E06 | Usulan | Belum diverifikasi |
| I026 | E06/E07 | Usulan | Belum diverifikasi |
| I027 | E05/E06 | Usulan | Tertahan · relasi episode kanonik |
| I028 | E05/E06 | Usulan | Tertahan · definisi transfer, kunjungan terencana dan tindak lanjut |
| I029 | E06/E08 | Usulan | Belum diverifikasi |
| I030 | E06/E09 | Usulan | Belum diverifikasi |
| I031 | E06/E10 | Usulan | Belum diverifikasi |
| I032 | E05/E11 | Usulan | Belum diverifikasi |
| I033 | E07 | Parsial | Belum diverifikasi |
| I034 | E05/E07 | Parsial | Belum diverifikasi |
| I035 | E06/E07 | Usulan | Belum diverifikasi |
| I036 | E06/E11 | Usulan | Belum diverifikasi |
| I037 | E08 | Ada di kode | Belum diverifikasi |
| I038 | E08 | Ada di skema | Belum diverifikasi |
| I039 | E08 | Ada di kode | Belum diverifikasi |
| I040 | E08/E09 | Usulan | Belum diverifikasi |
| I041 | E08/E09 | Parsial | Belum diverifikasi |
| I042 | E09/E10 | Usulan | Belum diverifikasi |
| I043 | E09/E10 | Gap model | Belum diverifikasi |
| I044 | E09/E10 | Usulan | Belum diverifikasi |
| I045 | E08/E09 | Usulan | Belum diverifikasi |
| I046 | E09/E16 | Usulan | Belum diverifikasi |
| I047 | E12/E16 | Usulan | Belum diverifikasi |
| I048 | E08/E13 | Usulan | Belum diverifikasi |
| I049 | E03/E09 | Gap manual | Tertahan · kontrak agregat, suppression dan differencing |
| I050 | E01/E11 | Parsial | Belum diverifikasi |
| I051 | E11 | Ada di kode | Belum diverifikasi |
| I052 | E11 | Usulan | Belum diverifikasi |
| I053 | E11 | Usulan | Belum diverifikasi |
| I054 | E11/E12 | Usulan | Belum diverifikasi |
| I055 | E11/E12 | Parsial | Belum diverifikasi |
| I056 | E01/E10 | Usulan | Belum diverifikasi |
| I057 | E01/E09 | Usulan | Belum diverifikasi |
| I058 | E11/E16 | Ada di skema | Belum diverifikasi |
| I059 | E14 | Parsial | Belum diverifikasi |
| I060 | E11/E13 | Usulan | Belum diverifikasi |
| I061 | E11 | Usulan | Belum diverifikasi |
| I062 | E06/E10 | Usulan | Belum diverifikasi |
| I063 | E10/E15 | Parsial | Belum diverifikasi |
| I064 | E10 | Parsial | Belum diverifikasi |
| I065 | E10 | Parsial | Belum diverifikasi |
| I066 | E10 | Parsial | Belum diverifikasi |
| I067 | E08/E10 | Usulan | Belum diverifikasi |
| I068 | E09/E10 | Gap model | Belum diverifikasi |
| I069 | E06/E10 | Usulan | Belum diverifikasi |
| I070 | E10/E13 | Usulan | Belum diverifikasi |
| I071 | E10/E15 | Parsial | Belum diverifikasi |
| I072 | E10/E13 | Usulan | Belum diverifikasi |
| I073 | E02/E09/E10 | Usulan | Belum diverifikasi |
| I074 | E10/E15 | Parsial | Belum diverifikasi |
| I075 | E12 | Ada di kode | Belum diverifikasi |
| I076 | E03/E12 | Parsial | Belum diverifikasi |
| I077 | E03/E12 | Ada di kode | Belum diverifikasi |
| I078 | E03/E12 | Ada di kode | Belum diverifikasi |
| I079 | E02/E12 | Usulan | Belum diverifikasi |
| I080 | E13 | Parsial | Belum diverifikasi |
| I081 | E13 | Usulan | Belum diverifikasi |
| I082 | E10/E13 | Usulan | Belum diverifikasi |
| I083 | E06/E13 | Usulan | Belum diverifikasi |
| I084 | E02/E13 | Usulan | Belum diverifikasi |
| I085 | E09/E13 | Usulan | Belum diverifikasi |
| I086 | E12/E13 | Usulan | Belum diverifikasi |
| I087 | E06/E13 | Usulan | Belum diverifikasi |
| I088 | E13 | Parsial | Belum diverifikasi |
| I089 | E02/E15 | Parsial | Diuji parsial · kontrak status pelaporan; penerimaan lintas domain masih terbuka |
| I090 | E16 | Parsial | Tertahan · persetujuan kebijakan pemrosesan dan akses lintas domain |
| I091 | E14/E16 | Usulan | Belum diverifikasi |
| I092 | E16 | Parsial | Belum diverifikasi |
| I093 | E14/E15 | Parsial | Belum diverifikasi |
| I094 | E02/E15 | Parsial | Diuji parsial · kontrak status pelaporan; penerimaan lintas domain masih terbuka |
| I095 | E15/E16 | Parsial | Belum diverifikasi |
| I096 | E10/E15 | Parsial | Belum diverifikasi |
| I097 | E15 | Parsial | Belum diverifikasi |
| I098 | E10/E15 | Parsial | Belum diverifikasi |
| I099 | E01/E15 | Parsial | Belum diverifikasi |
| I100 | E01/E16 | Parsial | Belum diverifikasi |
