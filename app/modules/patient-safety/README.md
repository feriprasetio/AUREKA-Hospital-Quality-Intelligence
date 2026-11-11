# Modul Keselamatan Pasien AUREKA

Modul ini dijalankan sebagai workspace native di `components/PatientSafetyWorkspace.tsx` dan dimount dari `components/HomeClient.tsx` saat menu **Keselamatan Pasien** dibuka.

## Workspace

1. **Overview** — ringkasan insiden yang dapat diakses pengguna, status workflow, dan daftar insiden terbaru.
2. **Laporan IKP** — formulir mengikuti kontainer PDF revisi: Rincian Insiden, Kronologi Kejadian, Identitas Korban, Tindak Lanjut, dan Pembuat Laporan.
3. **Investigasi / RCA** — hasil investigasi yang terhubung ke satu laporan IKP, termasuk CMP/SDP, penyebab langsung, akar masalah, grading risk, faktor kontributor/mitigasi, rekomendasi dan tindakan.
4. **Survei Budaya** — instrumen budaya keselamatan pasien dan kesejahteraan staf. Mulai penerapan v2, setiap respons baru wajib memilih identitas dari Direktori Induk SDM, unit penugasan aktif, serta mencatat akun AUREKA yang mengirim secara terpisah. Identitas dan akun pengirim tidak disamakan.
5. **Rekapan Survei** — daftar seluruh respons dan ekspor Excel untuk role Admin/Superadmin yang diotorisasi. Respons historis sebelum v2 tetap ditandai legacy anonymous; identitas tidak ditebak atau direkayasa.

## Backend

Migration domain: `supabase/migrations/20261012045336_patient_safety_domain.sql`

Tabel berada di schema `aureka_patient_safety`:

- `incidents`
- `investigations`
- `culture_responses`
- `audit_log`

Penguatan izin fungsi dan optimasi kebijakan RLS/indeks: `supabase/migrations/20261012045431_patient_safety_security_performance_hardening.sql`.

Migrasi survei bernama v2 (additive, belum otomatis diterapkan ke produksi): `supabase/migrations/20261112010000_named_safety_culture_survey.sql`.

Row Level Security membatasi laporan sesuai pembuat/role, membatasi perubahan investigasi ke Admin, PMKP, dan Manajemen, dan memberi akses baca respons survei mentah hanya kepada Admin/Superadmin. Penulisan respons tetap append-only. Database memvalidasi direktori responden, kecocokan unit, penugasan staf aktif yang terkunci, konfirmasi identitas, dan akun submitter.

## Catatan penting

- Informasi pasien hanya dikirim ke Supabase; modul tidak menggunakan localStorage untuk menyimpan data IKP, investigasi, atau jawaban survei.
- Ekspor menggunakan Workbook XML berformat Excel `.xls` dengan sheet **Rekap Respons** dan **Jawaban Item**. Ekspor mengikuti filter yang aktif pada register.
- B17 bertanda `(R)` pada instrumen. Nilai mentah disimpan dan reverse scoring tidak diterapkan otomatis sampai formula resmi ditetapkan.
- Respons bernama adalah data personal SDM yang sensitif. Penggunaan untuk analisis organisasi harus memperhatikan tujuan pengumpulan, pembatasan akses, agregasi, dan perlindungan responden. Pemilihan identitas oleh operator akun bersama adalah pencatatan atribusi responden, bukan bukti biometrik bahwa individu tersebut secara fisik mengisi sendiri.
- Status dan analitik yang belum dihitung dari data operasional tidak diisi dengan angka contoh/fiktif.
