# Modul 3 — Manajemen Risiko AUREKA

Workspace native berada di components/RiskManagementWorkspace.tsx dan dimount dari components/HomeClient.tsx pada menu Manajemen Risiko.

## Ruang lingkup

- Ikhtisar — profil risiko dan matriks 5×5 dengan lookup Kepmenkes HK.01.07/MENKES/1354/2024.
- Risk Register — daftar efisien dengan pencarian, filter, paginasi, panel detail inline, dan kalkulasi baseline/residual di server.
- RTP Terintegrasi — satu rencana pengendalian dapat menghubungkan beberapa risiko untuk dimitigasi secara kolektif.
- Konektor Risiko — relasi penyebab bersama, kontrol bersama, hulu/hilir, saling memperkuat, serta potensi duplikasi.
- FMEA/HFMEA — engine terpisah dengan RPN S × O × D; hasilnya tidak dicampur dengan skor matriks risiko.

## Tata kelola persetujuan

1. Unit/PIC menyusun draft dan mengirim rencana ke Kepala Bidang.
2. Kepala Bidang menyetujui atau mengembalikan untuk revisi; persetujuan meneruskan ke Direktur.
3. Direktur menyetujui atau mengembalikan untuk revisi; persetujuan meneruskan ke Dewan Pengawas.
4. Dewan Pengawas memberikan pengesahan tahap akhir; hanya setelah itu rencana dapat dimulai.
5. Setelah pelaksanaan, pemilik rencana mencatat evaluasi. Penutupan memerlukan residual seluruh risiko terkait telah dinilai dan berada di area penerimaan (skor 1–9).

Perubahan tahap menggunakan fungsi aureka_risk.transition_mitigation_plan; role saja pada sisi frontend tidak memberi hak untuk melewati tahap. Role KABID, DIREKTUR, dan DEWAN_PENGAWAS ditambahkan ke aureka_system.app_roles dan dapat ditetapkan oleh administrator melalui Pengaturan.

## Database

Migration domain: supabase/migrations/20261013100000_risk_management_domain.sql

Migration membuat schema aureka_risk dengan tabel:
- risk_register
- fmea_analyses
- risk_relationships
- mitigation_plans
- mitigation_plan_risks
- risk_workflow_events

Row Level Security berlaku pada semua tabel. Skor baseline dan residual dihitung oleh trigger database dari lookup matriks; skor FMEA dan prioritas juga dihitung ulang oleh trigger. Status Accepted dan Controlled dibatasi berdasarkan hasil penilaian baseline/residual. Persetujuan hanya melalui fungsi workflow, bukan pembaruan status langsung dari klien.

Deployment: terapkan migration pada project Supabase AUREKA sebelum uji penyimpanan operasional. Jangan mengisi angka contoh; halaman akan menampilkan status backend jika migration belum tersedia. Preview standalone tidak menggantikan database produksi.

## Catatan metodologis

- Skor matriks menggunakan lookup 5×5 dalam Kepmenkes HK.01.07/MENKES/1354/2024, bukan P × D sederhana.
- FMEA menggunakan RPN = Severity × Occurrence × Detection; tidak dapat dipertukarkan dengan skor matriks risiko.
- Risiko tingkat Sedang, Tinggi, dan Sangat Tinggi berada di luar area penerimaan yang digunakan untuk keputusan mitigasi.
- Penilaian dan penyelesaian RTP tetap memerlukan bukti implementasi dan keputusan pemilik risiko/manajemen rumah sakit.
