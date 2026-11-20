# AUREKA — Implementasi Baseline Standar dan Keputusan Teknis v2

Tanggal baseline: 20 November 2026  
Sumber keputusan: *AUREKA Hasil Riset Standar dan Keputusan Teknis v2.0* (dokumen kerja yang diberikan untuk implementasi).

Dokumen ini memisahkan implementasi teknis yang aman dari konfigurasi yang membutuhkan file, instrumen klinis, atau pengesahan rumah sakit. Tidak ada data klinis, target lokal, daftar diagnosis, atau keputusan pemilik proses yang dibuat oleh aplikasi.

## 1. Clinical Pathway: tiga metrik, tiga denominator

1. **INM kepatuhan pelayanan PPA**: pelayanan PPA yang sesuai CP dibagi seluruh pelayanan PPA pada CP yang diobservasi, dikali 100%; target INM ≥80%. Pengukuran ini tidak boleh diambil dari jumlah pasien atau jumlah kotak checklist.
2. **Kelengkapan komponen wajib**: komponen wajib yang telah diisi dan divalidasi dibagi seluruh komponen wajib yang seharusnya diisi. Pengecualian klinis hanya dikeluarkan dari denominator bila sudah divalidasi.
3. **Kepatuhan tingkat pasien/episode**: episode yang patuh dibagi episode yang memenuhi inklusi dan dapat dinilai. Ini metrik tambahan dan hanya digunakan setelah definisi cohort dan denominator disahkan.

AUREKA menyediakan kalkulator murni yang memisahkan ketiga grain pengukuran, menangani pending/verified exclusion, dan mengembalikan null untuk denominator kosong. Workspace Clinical Pathway saat ini masih memiliki perhitungan checklist dalam episode; layar secara eksplisit menandainya sebagai metrik internal dan menyatakan bahwa data tersebut bukan INM. Angka INM tidak ditampilkan sampai observasi pelayanan PPA tersedia sebagai sumber terpisah.

Yang masih memerlukan rumah sakit: CP yang disahkan, diagnosis/kode cohort, inklusi-eksklusi, komponen wajib/opsional per versi, dan definisi satu observasi pelayanan PPA. Variasi klinis harus menyimpan alasan, pencatat, waktu, dan reviewer. Stok kosong atau alat rusak bukan pengecualian klinis otomatis.

## 2. Audit klinis

Siklus minimal: (1) menentukan topik, (2) menentukan kriteria SMART, (3) mengumpulkan data dan mencatat metode sampling, (4) menganalisis kepatuhan/variasi, (5) menjalankan perubahan dengan owner dan tenggat, (6) re-audit memakai kriteria yang sama. Pedoman rujukan menyebut sekitar 6–10 kriteria audit; ukuran 30–100 rekam medis merupakan panduan praktis, bukan pengganti perhitungan sampel yang sesuai. Pengecualian harus evidence-based dan pembelajaran memakai prinsip no name, no shame, no blame.

Workspace audit kasus klinis/kematian tetap dibedakan dari siklus audit klinis tematik. Instrumen lokal, topik, kriteria, sampling, dan bukti re-audit belum dibuat otomatis karena memerlukan keputusan Komite Medik/PMKP dan file sumber.

## 3. FMEA preventif dan investigasi pascainsiden/RCA2

- FMEA adalah analisis proaktif sebelum proses baru/perubahan proses. Modul Manajemen Risiko menampilkan nama **FMEA Preventif** dan menegaskan pemisahannya dari investigasi insiden.
- Investigasi pascainsiden mengikuti RCA2, terhubung melalui incident ID. Formulir menambahkan struktur hierarki tindakan, penanggung jawab, tenggat, serta rencana dan tanggal verifikasi efektivitas. Investigasi tidak dapat ditutup sebelum bukti tindakan dan verifikasi efektivitas dicatat.
- Skala S/O/D, ambang RPN, dan prioritas yang tampak di aplikasi adalah konfigurasi operasional saat ini, bukan standar universal IHI. Rumah sakit harus menetapkan dan memberi versi instrumennya sebelum ambang tersebut ditetapkan sebagai standar.

## 4. Budaya keselamatan pasien

Pengisian baru menggunakan mode anonim pada record respons: nama, nomor pegawai, ID responden, dan ID akun pengirim tidak disimpan pada baris survei. Unit dan metadata kelompok dipakai untuk analisis agregat. Kelompok dengan kurang dari lima responden tidak ditampilkan atau diekspor. Respons historis yang sebelumnya bernama dipertahankan tanpa backfill atau pengubahan identitas; akses data mentah dibatasi ke ADMIN dan antarmuka hanya menyajikan agregat.

Instrumen yang ada adalah instrumen internal campuran. Aplikasi tidak mengklaim bahwa instrumen tersebut adalah AHRQ SOPS Hospital Survey 2.0 atau telah tervalidasi dalam Bahasa Indonesia. Adaptasi bahasa/budaya, uji keterbacaan, validasi psikometrik, kunci reverse-scoring/positive response, dan denominator eligible workforce masih harus diselesaikan sebelum melaporkan composite score atau response rate AHRQ.

## 5. RME, ICD, INM/SPM, SDM, SPO/TTE dan NARA

- RME tetap menjadi sumber klinis; AUREKA adalah lapisan analitik dan quality intelligence. Identitas pasien/episode harus menggunakan key stabil dan No. RM hanya tersedia sesuai role. Kandidat normalisasi ICD oleh NARA harus ditinjau PMIK/klinisi; diagnosis sumber tidak ditimpa.
- INM, SPM Rumah Sakit, dan SPM Kesehatan merupakan domain terpisah. Histori profil indikator harus berversi; setiap angka menyimpan periode, numerator, denominator, formula version, provenance, imported_at, validator, dan status validasi. Nilai nol, belum dilaporkan, unavailable, invalid, dan import failure tidak boleh disamakan.
- SDM/OPPE/FPPE memakai permission per domain; kejadian insiden tidak boleh menjadi peringkat individu tanpa konteks dan kewenangan.
- QR hanya identifier/verifikasi dokumen; bukan TTE. Dokumen aktif dan pengesahan tetap mengikuti pejabat berwenang dan sistem tanda tangan elektronik yang sesuai.
- NARA mengikuti Govern/Map/Measure/Manage, minimisasi data, human oversight, disclosure periode/sumber/scope, serta audit dan otorisasi backend untuk write actions. Kredensial/provider eksternal memerlukan persetujuan dan telaah kontrak, lokasi pemrosesan, retensi, training, dan subprocessor.

## 6. Input yang tetap ditunggu

Workbook Realcost final; workbook logbook/profil indikator dan kamus kolom; SK/Perdir/Perkada SPM yang berlaku; CP/PPK/PNPK dan instrumen audit; instrumen Audit Klinis/Audit Kematian/FMEA/IKP; master unit/PIC/role; register sekretariat dan aturan nomor surat; SPO final dan metadata pengesahan; master SDM/OPPE/FPPE; serta daftar provider AI yang disetujui. Password, API key, secret, token, dan data pasien yang tidak diperlukan tidak boleh diunggah.

## 7. Acceptance checks

- Kalkulasi INM, kelengkapan komponen wajib, dan kepatuhan episode mempunyai denominator terpisah; denominator kosong menghasilkan null.
- Respons survei baru tidak memuat respondent_person_id, respondent_room_id, submitted_by_user_id, atau konfirmasi identitas; kebijakan RLS menahan SELECT mentah selain ADMIN.
- UI/Excel hanya menampilkan agregat unit-periode dengan n≥5; tidak ada nama, response ID, timestamp, atau jawaban individu.
- RCA2 memerlukan action hierarchy, owner, due date, metode/bukti efektivitas, dan tanggal verifikasi sebelum status closed.
- FMEA secara eksplisit proaktif; RCA2 pascainsiden tidak disatukan ke FMEA.
- Target lokal, daftar cohort, instrumen/versi, serta pengesahan tetap menunggu sumber dan pejabat berwenang.

---
Rujukan baseline utama: Permenkes 30/2022, Permenkes 24/2022, Kepdirjen Yankes HK.02.02/I/0522/2022, AHRQ SOPS Hospital Survey 2.0, WHO Patient Safety Incident Reporting and Learning Systems, WHO Ethics and Governance of AI for Health, NIST AI RMF 1.0, IHI FMEA/RCA2, UU 27/2022, PP 71/2019, dan ISO 7101:2023. Status regulasi harus diverifikasi Bagian Hukum sebelum penetapan kebijakan internal.
