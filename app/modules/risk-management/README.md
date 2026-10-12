# Modul 3 — Manajemen Risiko AUREKA

Workspace native menggunakan pola visual LiquidGlass AUREKA, dengan alur ringkas untuk Risk Register, matriks selera risiko, konektor antar-risiko, rencana mitigasi bersama, dan FMEA/HFMEA.

## Workspace

1. **Ringkasan dan matriks** — distribusi baseline risk, profil risiko utama, serta matriks 5×5 berdasarkan nilai skor dan band dari Kepmenkes HK.01.07/MENKES/1354/2024.
2. **Risk Register** — daftar berhalaman, pencarian dan filter, detail sesuai risiko terpilih, input/edit baseline dan residual, impor CSV sheet Ruangan, dan ekspor CSV.
3. **Konektor risiko** — relasi penyebab bersama, proses terkait, kontrol bersama, risiko berantai, dan korelasi operasional. Hubungan perlu diverifikasi oleh pemilik risiko.
4. **Mitigasi bersama** — satu rencana dapat menghubungkan beberapa risiko, memiliki PIC dan tenggat, target residual, serta alur review berurutan Kabid → Direktur → Dewan Pengawas.
5. **FMEA/HFMEA** — engine RPN S×O×D terpisah dari matriks baseline, cut-off prioritas, dan residual RPN.
6. **Audit trail** — log perubahan untuk register, FMEA, konektor, dan status/rencana mitigasi.

## Backend

Migration domain:
- `supabase/migrations/20261012120000_risk_management_domain.sql`

Schema: `aureka_risk`.

Tabel utama: `risk_matrix_reference`, `risk_register`, `risk_fmea`, `risk_links`, `mitigation_plans`, `mitigation_plan_risks`, `risk_plan_approvals`, dan `risk_audit_log`.

Skor baseline dihitung oleh trigger melalui lookup matriks, bukan perkalian sederhana P×D. RPN FMEA dihitung secara terpisah oleh trigger. Transisi persetujuan dijalankan melalui fungsi backend `create_mitigation_plan`, `update_mitigation_plan` (untuk draft/rencana dikembalikan), `submit_mitigation_plan`, `review_mitigation_plan`, dan `advance_mitigation_plan`. Row Level Security diterapkan pada tabel operasional; peran review dicocokkan dengan role akun yang aktif. Penutupan rencana ditolak jika ada risiko terkait yang belum dievaluasi residualnya atau masih memiliki skor residual di luar area penerimaan (skor > 9), sehingga tindakan lanjutan/keputusan risiko tetap diperlukan.

## Role dan tata kelola

Migration menambahkan kode role `KABID`, `DIREKTUR`, dan `DEWAN_PENGAWAS` ke master role, tetapi **tidak menetapkan akun pengguna ke role tersebut**. Admin harus memetakan akun melalui pengaturan setelah kebijakan kewenangan internal ditetapkan. Workflow Kabid → Direktur → Dewan Pengawas adalah rancangan implementasi AUREKA dan tidak boleh dianggap sebagai penetapan kewenangan resmi sebelum disahkan RSUD.

PIC dibatasi berdasarkan pengguna/unit yang terpetakan; role pengelola dan reviewer mendapat cakupan akses lebih luas sesuai fungsi database. Reviewer pada tahap persetujuannya divalidasi server-side.

## Penerapan aman

- Jangan menerapkan migration ini ke Supabase produksi sebelum ditinjau dan diuji.
- Branch fitur disiapkan terlebih dahulu untuk review; branch belum digabungkan ke `main`.
- Impor CSV sumber menggunakan `source_key` untuk idempotensi dan tidak menimpa risiko yang telah diimpor pada proses sebelumnya.
- Tidak ada data risiko operasional contoh yang otomatis dibuat oleh migration.
