-- Synchronize the 16 empty Rawat Inap Penyakit Dalam 2026 option lists from the workbook Profil sheet.
-- Source codes and labels are retained; numerator classification is never inferred.
DO $migration$
DECLARE
  v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (VALUES
      ('25.12', $json$[
        {"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},
        {"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},
        {"code":null,"label":"Divisitekan Spesialis Lain","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.13', $json$[
        {"code":1,"label":"Patuh Seluruh Tatalaksana CP","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Patuh Sebagian Tatalaksana CP","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Patuh Tatalaksana CP Sama Sekali","numerator":null,"denominator":true,"review_required":true},
        {"code":null,"label":"Belum Tersedia CP untuk Diagnosa Ini","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.18', $json$[
        {"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.11', $json$[
        {"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan - Ada bukti lapor IT)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Ada Formulir Transfer","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.5', $json$[
        {"code":1,"label":"Dilakukan Lengkap & Tercatat eGFR","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Lengkap (Lupa order/Tidak dihitung eGFR)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Lengkap (Pasien menolak/Alat Lab Rusak)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.6', $json$[
        {"code":1,"label":"Dilakukan USG / Ada hasil USG < 6 bulan","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Dilakukan (Padahal tidak ada data USG sebelumnya)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Dilakukan (Pasien tidak stabil/Menolak)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.7', $json$[
        {"code":3,"label":"Dilakukan HD > 48 jam (Antrian tanpa triase/Lambat lapor)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Dilakukan HD > 48 jam (Menunggu keluarga/Hemodinamik tidak stabil)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Dilakukan HD ≤ 48 jam sejak indikasi tegak","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Dilakukan (Dirujuk ke RS lain karena slot penuh)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.14', $json$[
        {"code":1,"label":"Klinis Membaik saat pulang","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Klinis Memburuk (Penanganan tidak adekuat)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Klinis Tetap/Memburuk (Pulang APS/Rujuk/Terminal)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.15', $json$[
        {"code":1,"label":"Lab Membaik (Ureum/Kreatinin turun/Kalium normal)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Lab Tetap/Memburuk (Kondisi Hiperkatabolik/Sepsis)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Lab Tetap/Memburuk (Resep HD tidak adekuat)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.17', $json$[
        {"code":1,"label":"Target Tercapai (Hb ≥ 10 g/dL)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Hb < 10) - Risiko Overload Cairan/Edema Paru","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Hb < 10) - Menunggu Efek Terapi ESA/Besi","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Hb < 10) - Stok Darah Kosong/Golongan Darah Langka","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Hb < 10) - Pasien Menolak Transfusi/Pulang Paksa","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Target Tidak Tercapai (Hb < 10) - Dokter Tidak Merencanakan Transfusi/Terapi","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Target Tidak Tercapai (Hb < 10) - Dosis Transfusi Inadekuat/Underdose","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.1', $json$[
        {"code":1,"label":"Transfusi Diberikan Sesuai Indikasi (Hb/Trombosit Target Tercapai)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Transfusi (Stok Darah Kosong di UTD/PMI - Keluarga sudah diedukasi cari donor)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Transfusi (Pasien/Keluarga Menolak Transfusi - Ada Form Penolakan)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Tidak Transfusi (Pasien Stabil/Perdarahan Minor - Tidak butuh transfusi masif)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Transfusi (Kelalaian DPJP - Indikasi ada tapi instruksi tidak dibuat)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.2', $json$[
        {"code":1,"label":"Diberikan Somatostatin/Octreotide (Dosis Awal Bolus + Maintenance)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Diberikan (Kekosongan Obat di Farmasi RS/Nasional)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Diberikan (Ada Kontraindikasi Medis Spesifik/Alergi)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Diberikan (Lupa/Tidak Tahu Protokol)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.3', $json$[
        {"code":1,"label":"Pemeriksaan Lengkap Dilakukan","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Lengkap (Reagen Fibrinogen/Koagulasi Kosong/Alat Error/Tidak Tersedia di Rumah Sakit)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Lengkap (Sampel Lisis/Beku - Perlu ambil ulang tapi pasien menolak/sulit vena)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Lengkap (Lupa Order Lab)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.4', $json$[
        {"code":1,"label":"Pasien Dirujuk ke RS Tipe B/A (Untuk Ligasi/Skleroterapi)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Tidak Dirujuk (Perdarahan Berhenti Spontan & Pasien Memilih Rawat Konservatif di RS ini)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Dirujuk (Kondisi Not Transportable / Syok Berat / Coma - Risiko kematian di jalan tinggi)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Dirujuk (Pasien/Keluarga Menolak Rujuk / Masalah Biaya/Jaminan)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Tidak Dirujuk (RS Rujukan Penuh/Menolak Transfer)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Tidak Dirujuk (Dokter tidak merencanakan rujukan padahal indikasi ligasi)","numerator":null,"denominator":true,"review_required":true},
        {"code":null,"label":"Tidak Ada Indikasi Ligasi","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.8', $json$[
        {"code":1,"label":"Target Hb Tercapai (> 10 g/dL)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Target Hb 7-9 g/dL (Strategi Transfusi Restriktif - Sesuai pertimbangan klinis DPJP)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Target Belum Tercapai (Pasien Dirujuk dengan Hb rendah karena butuh penanganan Cito)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Stok Darah Sulit Didapat)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Target Tidak Tercapai (Pulang Paksa/APS sebelum tuntas)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Target Tidak Tercapai (Dipulangkan Dokter padahal Hb masih rendah tanpa alasan)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb),
      ('25.16', $json$[
        {"code":1,"label":"Perdarahan Berhenti (Pulang Rawat Jalan)","numerator":null,"denominator":true,"review_required":true},
        {"code":1,"label":"Perdarahan Belum Berhenti (Dirujuk ke RS Tipe A/B untuk tindakan lanjut)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Perdarahan Belum Berhenti (Meninggal Dunia di RS)","numerator":null,"denominator":true,"review_required":true},
        {"code":2,"label":"Perdarahan Belum Berhenti (Pulang Paksa/APS)","numerator":null,"denominator":true,"review_required":true},
        {"code":3,"label":"Perdarahan Belum Berhenti (Dipulangkan Dokter - Unsafe Discharge)","numerator":null,"denominator":true,"review_required":true}
      ]$json$::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 25
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published'
     AND jsonb_typeof(profile.options_json) = 'array'
     AND jsonb_array_length(profile.options_json) = 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 16 THEN
    RAISE EXCEPTION 'Expected 16 empty active Rawat Inap Penyakit Dalam profiles to be synchronized; updated %.', v_updated;
  END IF;
END
$migration$;
