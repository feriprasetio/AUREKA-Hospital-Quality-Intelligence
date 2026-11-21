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
- **Permukaan:** halaman workspace memakai **Canvas Arktik cardless**. Judul, deskripsi, KPI dan ringkasan dibaca langsung di atas latar AUREKA; gunakan whitespace, skala huruf, pemisah tipis, bukan panel putih solid. **Jangan** meratakan permukaan form, input, menu popup, konfirmasi, atau dialog keselamatan pasien. Preset `Samar` boleh menambah warna sangat tipis, tidak menjadikan kartu solid lagi. Blur tidak dipakai untuk panel isi.
- **Bayangan:** hanya untuk lapisan yang benar-benar melayang (popup, dropdown, toast). Konten biasa tanpa bayangan, border kartu ataupun latar putih; gunakan pemisah tipis bila diperlukan.
- **Radius:** 10 sampai 12px untuk kontrol form dan tombol; 16 sampai 20px untuk popup. Konten cardless tidak perlu radius; tidak semua kontrol dibuat pil.
- **Panah (→ ↗):** hanya kalau menunjukkan arah yang nyata (Berikutnya, Lanjut, alur A → B). Tidak dipakai sebagai hiasan tombol.
- **Emoji:** tidak dipakai di UI. Pakai ikon yang relevan atau tidak sama sekali.
- **Em dash (—):** tidak dipakai di teks UI. Sel kosong diisi `-`.
- **Target sentuh di HP/tablet:** minimal 44 × 44px dengan jarak antar tombol. Dock smartphone harus menghormati safe-area, keyboard virtual, gesture OS, dan `prefers-reduced-motion`; sidebar tablet tetap terlihat.
- **Animasi:** halus (0,15 sampai 0,3 detik) untuk masuk halaman, hover, dan popup. Tidak ada animasi hiasan yang berulang terus. Semua berhenti saat `prefers-reduced-motion`.
- **Formulir:** di popup. Enter pindah kolom, Ctrl+S simpan, ada "Simpan & isi berikutnya" untuk input berulang.
- **Keadaan kosong / memuat / gagal:** selalu ada. Keadaan kosong menyebut penyebab dan satu langkah lanjut.
- **Navigasi:** satu sumber modul dan otorisasi untuk tiga presentasi perangkat: **desktop dan tablet** sidebar kategori permanen dan selalu terlihat, **smartphone (≤720px)** dock bawah 3–5 tujuan penting + drawer untuk seluruh modul. Perangkat sentuh berlayar lebar tidak otomatis berubah ke mode smartphone. Submenu kontekstual tetap tersedia di area kerja. Jangan gandakan sumber rute atau akses.

## Yang tidak boleh

- Angka, testimoni, atau klaim yang tidak berasal dari data nyata.
- Kembali ke tema Solid / "Solid Default" atau menghidupkan lagi komponen lama yang sudah dihapus.
- Menambah CSS override acak setelah desain Canvas v2. `app/aureka-canvas-preferences.css` adalah **satu-satunya kebijakan terminal** permukaan dan header workspace; perbaikan komponen spesifik dilakukan di file komponen, bukan ditambal dengan stylesheet baru. Jangan memakai reset generik yang menghilangkan batas form, dialog atau tabel yang diperlukan.
