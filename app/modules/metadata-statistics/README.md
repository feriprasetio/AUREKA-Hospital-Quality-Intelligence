# Metadata dan Statistik AUREKA

Workspace aktif: `components/MetadataStatisticsWorkspace.tsx`.

## Domain yang saat ini terintegrasi

- **Program Kerja** — rencana/program kerja PMKP dan tindak lanjut yang tersedia pada modul.
- **Profil Indikator** — metadata, definisi, klasifikasi, target, opsi, dan versi profil indikator mutu.
- **Direktori Induk SDM** — daftar tenaga kerja kanonik yang menjadi rujukan identitas untuk atribusi mutu klinis, keselamatan pasien, OPPE/FPPE, dan penugasan tim.
- **Tim dan Penugasan** — relasi tenaga kerja terhadap unit/tim dengan status penugasan terkunci dan histori perubahan.

## Statistik dan profil pasien

- Register Pasien mengambil episode dari catatan operasional dengan `measurement_grain = 'patient_episode'`.
- Indeks pasien longitudinal yang ada berada pada `aureka_quality.patient_index`, dengan No. RM sebagai key bisnis sekaligus primary key saat ini. Tabel ini telah digunakan oleh data historis; jangan mengganti key tanpa rencana backfill, mapping identifier, rekonsiliasi foreign key, uji beban, dan rollback.
- Penelusuran pasien menggunakan No. RM; episode yang tidak cocok tidak boleh dipaksakan untuk ditautkan.
- Infografis menampilkan agregat catatan/episode yang tersedia dan bukan otomatis pasien unik atau sensus tempat tidur.
- Analisis pasien harus memisahkan episode, pasien unik, indikator, numerator/denominator, periode, dan versi definisi. Data tidak boleh digunakan untuk melabeli pasien baik/buruk atau menyimpulkan hubungan kausal dari asosiasi insiden.

## Rencana pengembangan berikutnya

- Profil longitudinal pasien yang menggabungkan riwayat episode, observasi mutu, outcome, dan insiden yang memang memiliki tautan valid.
- Engine statistik dengan audit sumber data, missingness, definisi variabel, serta case-mix yang valid.
- Ekstraksi XLSX berfilter dengan hak akses sesuai unit dan sensitivitas data.

Belum seluruh kapabilitas rencana pengembangan di atas tersedia sebagai fitur; dokumen ini membedakan fungsi aktif dan roadmap agar tidak menimbulkan klaim implementasi yang keliru.
