# Snapshot profil indikator mutu 2026

Direktori ini menyimpan snapshot metadata profil indikator 2026 yang digunakan sebagai bahan rekonstruksi dan audit sumber data.

- Snapshot direkonstruksi dari tabel produksi `aureka_quality.indicator_profiles` pada 19 November 2026.
- Total profil pada sumber produksi saat snapshot: **189 profil**.
- Snapshot dibagi menjadi `chunk-01.json` sampai `chunk-12.json`.
- File hanya memuat metadata profil indikator dan konfigurasi instrumen; tidak memuat identitas pasien, nomor rekam medis, atau data episode pasien.
- Field identitas teknis basis data (`id`, `created_by`, `updated_by`, `status`, `is_active`, `version`) tidak disertakan karena berkas chunk merupakan snapshot katalog, bukan salinan tabel operasional.
- Jika profil produksi berubah, snapshot perlu diperbarui dan jumlah/kode profil diverifikasi kembali sebelum digunakan untuk pemulihan atau seeding.

Snapshot ini tidak menggantikan backup database dan tidak boleh digunakan untuk menimpa profil produksi tanpa prosedur telaah serta versioning.
