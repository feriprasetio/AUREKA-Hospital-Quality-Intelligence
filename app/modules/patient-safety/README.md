# Modul Keselamatan Pasien AUREKA

Modul ini dijalankan sebagai workspace native di `components/PatientSafetyWorkspace.tsx` dan dimount dari `components/HomeClient.tsx` saat menu **Keselamatan Pasien** dibuka.

## Workspace

1. **Overview** — ringkasan insiden yang dapat diakses pengguna, status workflow, dan daftar insiden terbaru.
2. **Laporan IKP** — formulir mengikuti kontainer PDF revisi: Rincian Insiden, Kronologi Kejadian, Identitas Korban, Tindak Lanjut, dan Pembuat Laporan.
3. **Investigasi / RCA** — hasil investigasi yang terhubung ke satu laporan IKP, termasuk CMP/SDP, penyebab langsung, akar masalah, grading risk, faktor kontributor/mitigasi, rekomendasi dan tindakan.
4. **Survey Budaya** — instrumen budaya keselamatan pasien dan kesejahteraan staf. Setiap submit membuat response ID baru; respons tidak di-update atau ditimpa. Skema respons tidak menyimpan user ID atau email responden.
5. **Rekapan Survey** — daftar seluruh respons dan ekspor Excel untuk role Admin/Superadmin.

## Backend

Migration domain: `supabase/migrations/20261012120000_patient_safety_domain.sql`

Jalankan migration pada project Supabase sebelum menguji modul. Tabel berada di schema `aureka_patient_safety`:

- `incidents`
- `investigations`
- `culture_responses`
- `audit_log`

Row Level Security membatasi laporan sesuai pembuat/role, membatasi perubahan investigasi ke Admin, PMKP, dan Manajemen, dan memberi akses baca respons survey mentah hanya kepada Admin/Superadmin. Respons survey bersifat insert-only bagi pengguna biasa; tidak terdapat kolom yang mengaitkan respons ke akun pengirim.

## Catatan penting

- Informasi pasien hanya dikirim ke Supabase; modul tidak menggunakan localStorage untuk menyimpan data IKP, investigasi, atau jawaban survey.
- Ekspor menggunakan Workbook XML berformat Excel `.xls` dengan sheet **Rekap Respons** dan **Jawaban Item**. Ekspor mengikuti filter yang aktif pada register.
- B17 bertanda `(R)` pada instrumen. Nilai mentah disimpan dan reverse scoring tidak diterapkan otomatis sampai formula resmi ditetapkan.
- Status dan analitik yang belum dihitung dari data operasional tidak diisi dengan angka contoh/fiktif.
