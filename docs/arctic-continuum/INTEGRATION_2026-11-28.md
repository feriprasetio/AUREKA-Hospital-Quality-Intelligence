# Arctic Continuum — integrasi baseline 28 November 2026

Integrasi PR #659 pada main `95209f7be03a17b124ace747b541da0fd3f62e9c`, dengan mempertahankan pembaruan keamanan main. Navigasi kapsul adalah default; tata letak data-first tetap pilot terpisah, sekarang dapat diaktifkan/dinonaktifkan dari opsi navigasi. Kembali ke sidebar menghapus kedua flag pilot dan memulihkan tata letak stabil. Smoke harness memisahkan pemeriksaan default, pilot dan fallback, tetap menggunakan fixture sintetis. Register Risiko S063/S145 dibawa dari head PR `4ad5f35f9b31beb394846acdc4e7405e55e2c591` tanpa perubahan skema/rumus.

Bukti sebelumnya bukan bukti penerimaan commit ini. CI perlu dijalankan ulang. Dependency Review sebelumnya gagal karena Dependency Graph belum tersedia; jangan menonaktifkan gate atau mengklaim lulus. UAT, otorisasi DB lintas unit/peran, ekspor seluruh domain, staging dan migration drift tetap terbuka. Jangan deploy rilis penuh v2.0 sampai gate terpenuhi.
