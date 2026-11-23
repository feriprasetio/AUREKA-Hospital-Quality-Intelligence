-- Targets are operational for this hospital, including adaptations of published measures.
-- Import choices come from Rehab Medik 2026, sheet Profil, rows 3 and 4.
DO $repair$
DECLARE
  targets jsonb := $targets$[
  {"code":"6.7","op":">=","value":95,"basis":"Ambang 5 menit merujuk SPM Indonesia; 95% adalah sasaran proporsi lokal.","reference":"https://rsudams.kaltimprov.go.id/documents/PMK-No-129-tahun-2008-tengan-SPM-RS-lengkap.pdf"},
  {"code":"7.1","op":">=","value":90,"basis":"CMS Global Malnutrition Composite Score mendukung asesmen gizi pada pasien berisiko; 90% adalah sasaran lokal.","reference":"https://data.cms.gov/provider-data/topics/hospitals/measures-and-current-data-collection-periods"},
  {"code":"12.1","op":">=","value":80,"basis":"Mempertahankan nilai operasional 80% yang sudah tersimpan pada profil.","reference":null},
  {"code":"12.2","op":"<=","value":50,"basis":"Mengadaptasi acuan historis SPM Indonesia untuk drop out. Definisi dan penyebut mengikuti profil RS.","reference":"https://rsudams.kaltimprov.go.id/documents/PMK-No-129-tahun-2008-tengan-SPM-RS-lengkap.pdf"},
  {"code":"12.3","op":"<=","value":1,"basis":"Batas awal lokal untuk semua kejadian jatuh selama terapi. Rujukan AHRQ membahas jatuh yang menyebabkan cedera berat.","reference":"https://psnet.ahrq.gov/primer/never-events"},
  {"code":"12.4","op":"=","value":0,"basis":"Sasaran lokal nol kesalahan tindakan, sejalan dengan SPM Indonesia dan prinsip never events.","reference":"https://rsudams.kaltimprov.go.id/documents/PMK-No-129-tahun-2008-tengan-SPM-RS-lengkap.pdf"},
  {"code":"12.5","op":">=","value":90,"basis":"Sasaran lokal kepatuhan terhadap batas durasi masing-masing layanan. Durasi mengikuti SOP RS.","reference":null},
  {"code":"12.6","op":"=","value":0,"basis":"Sasaran lokal nol sesi yang terganggu karena media atau alat tidak tersedia.","reference":null},
  {"code":"26.5","op":"=","value":0,"basis":"Sasaran lokal nol kekosongan obat, selaras dengan indikator sejenis di unit rawat inap AUREKA.","reference":null},
  {"code":"27.11","op":">=","value":90,"basis":"Sasaran kerja awal preservasi ekstremitas. Diterapkan pada populasi pada profil dan perlu dibaca bersama tingkat risiko.","reference":null},
  {"code":"30.1","op":"=","value":100,"basis":"Persyaratan administrasi berlaku bagi seluruh peserta yang menyelesaikan stase.","reference":null},
  {"code":"30.2","op":"=","value":100,"basis":"Atribut wajib adalah persyaratan di setiap observasi mahasiswa pada praktik klinis.","reference":null},
  {"code":"30.3","op":">=","value":95,"basis":"Sasaran operasional lokal ketepatan waktu kehadiran mahasiswa.","reference":null},
  {"code":"32.1","op":">=","value":98,"basis":"Sasaran lokal awal bebas komplikasi; komposisi metode dan risiko pasien memengaruhi hasil.","reference":null},
  {"code":"36.1","op":"=","value":100,"basis":"Sasaran cakupan visitasi seluruh pasien yang sudah memenuhi kriteria high risk dan high cost.","reference":null},
  {"code":"37.1","op":"<=","value":2,"basis":"Sasaran awal lokal untuk kembali tak terencana dalam 24 jam setelah pulang dari PONEK.","reference":null}
]$targets$;
  choices jsonb := $choices$[
  {"code":"12.1","options":[{"label":"Pasien Tidak Memenuhi Kriteria Untuk Lanjut Terapi Sehingga Tidak Memenuhi Target","code":2,"numerator":false,"denominator":true}]},
  {"code":"12.2","options":[{"label":"Drop Out Tanpa Alasan","code":3,"numerator":true,"denominator":true},{"label":"Drop Out (Perubahan Program Terapi Atas Permintaan Dokter)","code":2,"numerator":false,"denominator":true},{"label":"Drop Out (Pasien merasa perbaikan namun tidak sesuai program)","code":3,"numerator":true,"denominator":true}]}
]$choices$;
  changed integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles p
  SET target_value=t.value,target_operator=t.op,
      target_text=(CASE t.op WHEN '>=' THEN '≥ ' WHEN '<=' THEN '≤ ' ELSE '' END) || t.value || '% (target operasional RS)',
      schema_json=p.schema_json || jsonb_strip_nulls(jsonb_build_object(
        'target_not_defined_in_source',false,'target_semantic_review_required',false,'target_review_required',false,
        'target_status','operational_hospital','target_basis',t.basis,'target_reference_url',t.reference,
        'target_previous_text',p.target_text)),
      updated_at=now()
  FROM jsonb_to_recordset(targets) AS t(code text,op text,value numeric,basis text,reference text)
  WHERE p.code=t.code AND p.profile_year=2026 AND p.is_active AND p.status='published'
    AND (p.target_value IS NULL OR p.schema_json->>'target_not_defined_in_source'='true'
      OR p.schema_json->>'target_semantic_review_required'='true');
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed NOT IN (0,16) THEN
    RAISE EXCEPTION 'Scope target berbeda: % profil; koreksi dibatalkan.',changed;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(choices) AS c(code text,options jsonb)
    JOIN aureka_quality.indicator_profiles p ON p.code=c.code AND p.room_id=12 AND p.profile_year=2026 AND p.is_active AND p.status='published'
    CROSS JOIN LATERAL jsonb_array_elements(c.options) AS x(opt)
    CROSS JOIN LATERAL jsonb_array_elements(p.options_json) AS y(prior)
    WHERE lower(btrim(prior->>'label'))=lower(btrim(opt->>'label'))
      AND prior->>'code' IS DISTINCT FROM opt->>'code'
  ) THEN
    RAISE EXCEPTION 'Konflik kode master Rehab Medik; koreksi dibatalkan.';
  END IF;

  UPDATE aureka_quality.indicator_profiles p
  SET options_json=p.options_json || new_options.options,updated_at=now()
  FROM jsonb_to_recordset(choices) AS c(code text,options jsonb),
    LATERAL (
      SELECT jsonb_agg(opt ORDER BY ord) AS options
      FROM jsonb_array_elements(c.options) WITH ORDINALITY AS x(opt,ord)
      WHERE NOT EXISTS (
        SELECT 1 FROM aureka_quality.indicator_profiles current_profile
        CROSS JOIN LATERAL jsonb_array_elements(current_profile.options_json) AS y(prior)
        WHERE current_profile.code=c.code AND current_profile.room_id=12 AND current_profile.profile_year=2026
          AND current_profile.is_active AND current_profile.status='published'
          AND lower(btrim(prior->>'label'))=lower(btrim(opt->>'label'))
      )
    ) new_options
  WHERE p.code=c.code AND p.room_id=12 AND p.profile_year=2026 AND p.is_active AND p.status='published'
    AND new_options.options IS NOT NULL;
END $repair$;
