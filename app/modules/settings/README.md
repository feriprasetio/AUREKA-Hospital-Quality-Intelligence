# Module 5 — Pengaturan

Pengaturan adalah **global platform settings** AUREKA.

## Scope

- Akun Saya
- Manajemen Pengguna
- Unit & Instalasi (read-only; source of truth: public.master_rooms)
- Tampilan & Preferensi
- Keamanan

## Batasan arsitektur

Konfigurasi domain tidak ditempatkan di sini. Setiap container memiliki pengaturan domain sendiri:

- Audit Indikator Mutu → master indikator, target, definisi operasional, workflow mutu
- Audit Clinical Pathway → master pathway dan konfigurasi audit
- Audit Klinis & Kematian → instrumen dan workflow audit
- Audit OPPE → parameter, bobot, threshold, dan reviewer

Dengan demikian perubahan Pengaturan Umum tidak mengganggu konfigurasi modul mutu.
