# Tahap 1 — Akses PIC per Ruangan

## Ringkasan perubahan

| Area | Perubahan |
|---|---|
| Menu & Overview | Role unit (PIC) tidak lagi melihat menu khusus pengelola (Metadata & Statistik). Overview PIC menampilkan unit, peran, dan pintasan ke modul input. Avatar memakai inisial nama pengguna (sebelumnya selalu "PF"). |
| Manajemen Risiko | PIC hanya melihat risiko, RTP, FMEA, dan konektor milik unitnya. Pilihan unit dikunci ke unit PIC. PIC tetap dapat **menambah dan mengedit** risiko unitnya. Akun tanpa unit mendapat peringatan dan tidak dapat menambah risiko. |
| Pengaturan → Manajemen User | Filter **Menunggu aktivasi**, **Aktif**, **Unit belum dipetakan**. Akun baru ditandai. Tombol *Aktifkan* otomatis memberi role PIC bila role kosong, dan meminta unit dipetakan dulu. |
| Pengaturan → Akun Saya | Unit utama hanya dapat diubah Super Admin (unit menentukan data yang boleh diakses). |
| Login | Akun yang belum aktif langsung di-logout dengan pesan yang jelas (sebelumnya sesi tetap tersimpan). |
| Bug | Memilih "Unit/Role belum dipetakan" di Manajemen User sebelumnya tidak tersimpan (nilai lama dipertahankan karena `??`). Diperbaiki. |
| Overview | Dashboard terhubung ke data: KPI risiko, RTP, insiden IKP, episode mutu; distribusi level risiko, peta 5×5, tren insiden 6 bulan, risiko prioritas, insiden terbaru, unit dengan risiko tinggi. Sesuai role (PIC = unitnya). |
| Metadata & Statistik | Kamus data, kelengkapan pengisian, distribusi, statistik deskriptif, dan ekspor CSV per dataset (khusus pengelola). |
| Manajemen Risiko | Form tambah/edit risiko & FMEA tampil sebagai jendela pop-up (tidak perlu scroll). |
| Manajemen User | Tombol **Hapus** dengan konfirmasi. Akun yang sudah memiliki data tidak dapat dihapus (data tetap utuh); gunakan Nonaktifkan. |
| Pengaturan non-admin | Menu Manajemen User disembunyikan. Tersedia **Ganti Password** (verifikasi password lama) dan **Data Saya untuk PMKP**. |
| Tampilan | Halaman awal, login, dan daftar akun didesain ulang (tombol lebih besar, panel identitas, layar sukses pendaftaran); animasi transisi, skeleton loading, dan angka beranimasi. |
| Bug | Empat komponen membuat client Supabase sendiri-sendiri (beberapa `GoTrueClient` berebut sesi). Kini memakai satu client bersama `lib/aureka/supabase.ts`. |

## Alur akun ruangan

1. Petugas ruangan membuka AUREKA → **Login Workspace → Daftar akun baru**, mengisi nama, unit, email, password.
2. Akun otomatis dibuat dengan role **PIC** dan status **nonaktif** (trigger `handle_new_user`).
3. Super Admin membuka **Pengaturan → Manajemen User / PIC Pelaporan → Menunggu aktivasi**, memeriksa unit, lalu klik **Aktifkan**.
4. PIC login dan hanya melihat data unitnya.

## Migration yang harus dijalankan di Supabase (oleh pemilik project)

Jalankan berurutan di **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/20261014090000_risk_unit_scoped_read.sql`
   — membatasi baca risk register / FMEA / konektor / RTP per unit untuk role non-pengelola.
2. `supabase/migrations/20261014091000_user_profile_privilege_guard.sql`
   — mencegah pengguna biasa mengubah role, status aktif, atau unit utamanya sendiri.
3. `supabase/migrations/20261014092000_admin_delete_user.sql`
   — fungsi hapus akun untuk Super Admin (menolak akun yang sudah memiliki data).
4. `supabase/migrations/20261014093000_user_lifecycle_and_room_admin.sql`
   — status akun **Nonaktif** (berbeda dari *Menunggu aktivasi*) dan kelola Unit & Instalasi
   (tambah, ubah nama/kode, nonaktifkan) oleh Super Admin.

Keempatnya idempoten (aman dijalankan ulang) dan sudah diuji pada PostgreSQL 16 dengan
seluruh migration repo (kecuali dua migration `aureka_quality` yang bergantung pada tabel
yang tidak ada di repo):

- PIC IGD hanya melihat risiko IGD; PIC Lab melihat risiko Lab termasuk risiko impor
  yang `unit_id`-nya kosong tetapi `unit_name` sama.
- Admin melihat semua; akun nonaktif tidak melihat apa pun.
- PIC dapat mengedit risiko unitnya; update ke risiko unit lain tidak berdampak.
- PIC yang mencoba mengubah `role_id` / `primary_room_id` sendiri ditolak; ubah nama tetap bisa;
  `admin_update_user_profile` oleh Super Admin tetap berjalan.
- Hapus akun: PIC ditolak, admin tidak dapat menghapus diri sendiri, akun yang memiliki data ditolak
  (`USER_HAS_DATA`) dan seluruh data tetap ada, akun kosong terhapus.
- Unit: PIC ditolak, nama/kode ganda ditolak, ganti nama unit ikut memperbarui `unit_name`
  di risk register unit tersebut, akun yang dinonaktifkan tercatat `deactivated_at`.

### Mengapa akun yang punya data tidak dihapus beserta datanya?
Risk register, laporan IKP, dan rekam mutu adalah dokumen unit/rumah sakit (jejak audit
akreditasi), bukan milik pribadi PIC. Akun cukup dinonaktifkan; akun nonaktif disembunyikan
dari daftar utama dan dapat dilihat lewat filter **Nonaktif**.

Tanpa migration ini, pembatasan tampilan tetap aktif di aplikasi, tetapi data unit lain
masih dapat dibaca lewat API.

## Catatan untuk tahap berikutnya

- Fungsi RPC berikut dipakai aplikasi tetapi **tidak ada di folder migrations**:
  `aureka_get_my_profile`, `aureka_update_my_profile`, `aureka_admin_list_user_profiles`,
  `aureka_admin_update_user_profile`, `aureka_list_active_roles`; begitu pula tabel inti
  `aureka_quality.indicator_profiles`, `quality_records`, `quality_record_responses`.
  Disarankan mengekspor definisinya dari Supabase ke migration agar database dapat dibangun ulang.
- Modul Indikator Mutu menyimpan episode pasien ke `localStorage` bila backend gagal
  (cache lokal). Pertimbangkan dampak privasi data pasien pada komputer bersama.
