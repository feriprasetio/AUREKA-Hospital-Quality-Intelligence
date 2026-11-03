-- Synchronize five empty Rawat Inap Bedah option lists from the 2026 Profil worksheet.
-- Numerator remains NULL pending indicator-owner classification. Existing Linen/Medicine master options are untouched.
DO $migration$
DECLARE v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (VALUES
        ('23.1', $json$[{"code":1,"label":"Operasi Terlaksana Sesuai Jadwal","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Batal Operasi (Kondisi Pasien Memburuk/Tidak Stabil/Tensi/Gula Darah tidak terkontrol - Demi Keselamatan)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Batal Operasi (Pasien/Keluarga Berubah Pikiran/Menolak Tindakan)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Batal Operasi (Masalah Admin/Kamar Operasi Penuh/Dokter Berhalangan/Alat Rusak)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('23.4', $json$[{"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan - Ada bukti lapor IT)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Ada Formulir Transfer","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('23.5', $json$[{"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Divisitekan Spesialis Lain","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('23.6', $json$[{"code":1,"label":"Nyeri Terkontrol (Skala 0-3)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Nyeri Tidak Terkontrol (Skala ≥ 4) - Pasien dengan toleransi opioid tinggi/Riwayat penggunaan obat kronis","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Nyeri Tidak Terkontrol (Skala ≥ 4) - Pasien menolak pemberian analgetik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Nyeri Tidak Terkontrol (Skala ≥ 4) - Pemberian analgetik tidak adekuat/Terlambat/Lupa","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('23.7', $json$[{"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 23
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published'
     AND jsonb_typeof(profile.options_json) = 'array'
     AND jsonb_array_length(profile.options_json) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 5 THEN
    RAISE EXCEPTION 'Expected five empty active Rawat Inap Bedah profiles to be synchronized; updated %.', v_updated;
  END IF;
END
$migration$;
