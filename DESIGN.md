# DESIGN.md · Arah tampilan AUREKA

Pegangan gaya untuk semua agen AI (ChatGPT/Codex, Claude, Copilot) dan pengembang. Dibaca bersama `AGENTS.md`. Perubahan arah di file ini butuh persetujuan Feri.

Dial: ENERGY 1 / RHYTHM 1 / MOTION 2

## Identitas

- **Produk:** aplikasi kerja internal RSUD Sultan Syarif Mohamad Alkadrie untuk mutu, keselamatan pasien, dan manajemen risiko.
- **Pengguna:** staf unit, PIC mutu, Komite PMKP, dan manajemen. Banyak yang bukan orang IT dan sering memakai HP.
- **Sifat:** tenang, jelas, dan bisa dipercaya. Data didahulukan, hiasan belakangan. Isian harus cepat ("sat-set").

## Tema: Arktik

- `<html data-skin="arktik">` dengan mode `terang` / `gelap` pilihan pengguna (`localStorage['aureka-mode']`). Kedua mode wajib sama-sama berfungsi.
- **Warna inti:**
  - navy `#0f2a44` / `#16507a`: aksen utama, tombol primer, item aktif
  - tinta `#0b1f33`: teks utama
  - `#2e4a66`: teks sekunder
- **Latar:** `#e9f1f8` dengan gradasi radial lembut. Mode gelap: latar `#070b16`, tinta `#eef2fa`.
- **Warna status (hanya untuk status):** hijau = baik/aktif, kuning = perlu perhatian, merah = tinggi/bahaya. Tidak dipakai sebagai hiasan.
- **Huruf:** Plus Jakarta Sans (`--font-aureka`).

## Aturan pakai

- **Ukuran huruf:** minimal 11px untuk teks apa pun. Isi tabel dan formulir 13 sampai 15px. Input di HP 16px supaya iOS tidak zoom.
- **Kontras:** teks normal minimal 4,5:1 dan teks besar 3:1, di kedua mode.
- **Label:** huruf biasa (sentence case), tanpa huruf kapital berjarak lebar. Singkatan resmi (PMKP, FMEA, OPPE, ICU) tetap kapital.
- **Blur (kaca):** hanya di header atas, panel menu samping HP, dan latar popup. Kartu dan panel di halaman memakai latar solid atau semi-solid tanpa blur.
- **Bayangan:** hanya untuk yang benar-benar melayang (popup, dropdown, toast). Kartu di halaman rata, dipisahkan dengan garis tipis.
- **Radius:** 10 sampai 12px untuk tombol, input, dan kartu; 16 sampai 20px untuk popup. Tidak semua elemen dibuat pil.
- **Panah (→ ↗):** hanya kalau menunjukkan arah yang nyata (Berikutnya, Lanjut, alur A → B). Tidak dipakai sebagai hiasan tombol.
- **Emoji:** tidak dipakai di UI. Pakai ikon yang relevan atau tidak sama sekali.
- **Em dash (—):** tidak dipakai di teks UI. Sel kosong diisi `-`.
- **Target sentuh di HP:** minimal 44 × 44px dengan jarak antar tombol.
- **Animasi:** halus (0,15 sampai 0,3 detik) untuk masuk halaman, hover, dan popup. Tidak ada animasi hiasan yang berulang terus. Semua berhenti saat `prefers-reduced-motion`.
- **Formulir:** di popup. Enter pindah kolom, Ctrl+S simpan, ada "Simpan & isi berikutnya" untuk input berulang.
- **Keadaan kosong / memuat / gagal:** selalu ada. Keadaan kosong menyebut penyebab dan satu langkah lanjut.
- **Navigasi:** satu navigasi utama (sidebar). Di HP: menu samping dan submenu ringkas di bawah judul.

## Yang tidak boleh

- Angka, testimoni, atau klaim yang tidak berasal dari data nyata.
- Kembali ke tema Solid / "Solid Default" atau menghidupkan lagi komponen lama yang sudah dihapus.
- Menambah file CSS penimpa baru. Perbaikan gaya ditulis di `app/typography.css` (atau file pemilik komponennya).
