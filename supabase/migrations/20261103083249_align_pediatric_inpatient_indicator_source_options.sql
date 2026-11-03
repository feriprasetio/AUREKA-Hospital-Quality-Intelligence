-- Align six Rawat Inap Anak source option lists from the 2026 Profil worksheet.
-- Source choice codes are retained only as source codes; no numerator classification is inferred.
DO $migration$
DECLARE v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (VALUES
        ('22.1', $json$[{"code":null,"label":"Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening","numerator":null,"denominator":true,"review_required":true},{"code":1,"label":"Tinggi Badan dan Berat Badan Sudah Diisi","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Hanya Tinggi Badan Diisi","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Hanya Berat Badan Diisi","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tinggi Badan dan Berat Badan Tidak Terisi","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('22.2', $json$[{"code":1,"label":"Pasien Tenang/Kooperatif selama tindakan dan perawatan","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Pasien Menangis/Gelisah Wajar (Takut/Nyeri) tapi petugas sudah melakukan upaya distraksi/pendampingan orang tua","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Pasien Gelisah/Rewel akibat kondisi patologis (Demam tinggi/Sesak/Kejang/Nyeri hebat)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Pasien Menangis Histeris/Trauma akibat tindakan kasar/Petugas tidak ramah/Tanpa pendekatan yang sesuai","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Pasien Menangis Histeris Trauma Tindakan","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('22.3', $json$[{"code":3,"label":"Infus Gagal Dipasang","numerator":null,"denominator":true,"review_required":true},{"code":1,"label":"1 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":1,"label":"2 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"3 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"4 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"5 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"6 Kali Percobaan","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('22.6', $json$[{"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Ada Formulir Transfer","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('22.7', $json$[{"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Divisitekan Spesialis Lain/Dokter Jaga Ruangan","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Pasien APS Tidak Sempat Visite","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ('22.8', $json$[{"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 22
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published'
     AND jsonb_typeof(profile.options_json) = 'array'
     AND jsonb_array_length(profile.options_json) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 6 THEN
    RAISE EXCEPTION 'Expected six empty active profiles to be synchronized; updated %.', v_updated;
  END IF;
END
$migration$;
