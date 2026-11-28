# Pratinjau aksi massal risiko · S145

Register Risiko menampilkan daftar perubahan status sebelum mengirim update. Pratinjau memuat baris yang dipilih dan tetap cocok dengan filter, status, serta izin edit yang tersedia pada workspace. Pilihan yang tidak memenuhi kriteria ditampilkan sebagai jumlah yang dilewati. Dialog memakai kontrol fokus dan batal bersama.

Konfirmasi memeriksa ulang cakupan dan status pada data workspace. Request menggunakan ID yang ditinjau dan kondisi status asal. RLS tetap menjadi otorisasi database. Hasil sukses menghitung ID yang dikembalikan oleh database. Jika sebagian baris tidak dikonfirmasi atau request gagal, pengguna mendapat jumlah yang dikonfirmasi dan daftar dimuat ulang sebelum percobaan selanjutnya.

Pemeriksaan konflik dalam irisan ini mencakup status, bukan penanda versi untuk semua field. Update beberapa batch masih dapat menghasilkan hasil parsial. Cakupan produksi lintas role dan unit memerlukan penerimaan staging. Tidak ada perubahan skema, RLS atau rumus.

Verifikasi lokal menghasilkan 982 tes lulus, build statis lulus, serta 12 pemeriksaan browser lulus dengan 954 request sintetis dan tanpa exception runtime. Skenario register memverifikasi pilihan tersembunyi oleh filter, pembatalan tanpa PATCH, konfirmasi eksplisit, dan pesan hasil parsial yang tetap terlihat setelah daftar dimuat ulang.
