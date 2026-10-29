# Panduan tempel data Excel — Audit Indikator Mutu

## Alur kerja PIC

1. Masuk ke AUREKA, buka **Indikator Mutu**, lalu pilih unit dan tahun pelaporan yang benar.
2. Salin rentang dari Excel yang berisi **baris header dan data**. Jangan menambah, menggabungkan, atau mengganti nama header.
3. Pilih **Tempel dari Excel** dan tempel langsung dari clipboard. AUREKA memeriksa nama kolom terhadap header putih dan header indikator hijau yang aktif untuk unit tersebut.
4. Jika header tidak dikenali atau ada header ganda, perbaiki tabel sumber Excel. Sistem tidak akan menebak kolom.
5. Pilih **Gunakan semua baris** untuk membuat draf sementara. Periksa tiap draf, khususnya tanggal, identitas tenaga, dan indikator yang ditandai perlu verifikasi.
6. Buka setiap draf dari daftar, koreksi bila perlu, lalu **Simpan logbook**. Draf yang hanya ada di memori akan hilang saat halaman ditutup; pastikan setiap catatan berhasil tersimpan ke server.

## Aturan pemetaan

- Kolom putih adalah data logbook; kolom hijau adalah indikator mutu.
- Pencocokan header tidak menggunakan tebakan fuzzy. Kapitalisasi dan spasi berlebih boleh berbeda, tetapi nama dan makna kolom harus tetap sama.
- Tanggal dikenali sebagai ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, atau nomor serial tanggal Excel yang valid.
- Nilai indikator hanya dikonversi otomatis bila cocok dengan pilihan/ kode master atau format eksplisit yang didukung, misalnya pembilang/penyebut `N/D`. Nilai lain dipertahankan sebagai catatan verifikasi; nilai itu bukan capaian terverifikasi.
- Nama dokter/perawat/petugas harus dipetakan ke direktori tenaga kerja yang aktif dan terkunci pada unit. Teks nama saja tidak cukup untuk mengatribusikan kinerja profesional.
- Maksimal 500 baris per tempelan. Bagi data yang lebih banyak menjadi beberapa kelompok.

## Perlindungan data

Data tempelan diproses di memori browser dan **tidak disimpan kembali dalam localStorage**. Penyimpanan ke server dilakukan satu catatan pada satu waktu melalui fungsi database yang memvalidasi akses unit, master indikator, dan atribusi tenaga dalam satu transaksi. Bila penyimpanan gagal, draf tetap terbuka selama halaman berjalan; jangan menutup halaman sebelum berhasil menyimpan atau menyalin kembali sumbernya ke penyimpanan kerja yang disetujui rumah sakit.

Gunakan hanya perangkat dan akun yang diizinkan rumah sakit. Jangan menempelkan data pasien ke komputer publik atau spreadsheet cloud yang tidak disetujui.
