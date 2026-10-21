-- Align the 2026 quality audit container with the latest green headers in Header Aureka.xlsx.
-- Keep prior indicator versions retired for traceability; do not overwrite the prior definitions.
BEGIN;

-- Retire the obsolete combined stock-out indicators. IBS 4.1 is not a green audit header in the supplied layout.
UPDATE aureka_quality.indicator_profiles
SET status='retired', is_active=false, updated_at=now()
WHERE profile_year=2026
  AND status='published'
  AND is_active=true
  AND code IN (
    '4.1','8.4','14.1','18.2','19.6','20.6','37.2',
    '22.4','22.5','23.2','23.3','24.5','24.6','25.9','25.10',
    '26.4','26.5','27.6','27.7','37.3'
  );

-- Rebuild the stock-out indicators from the richer 2026 split-indicator pattern.
-- Each active profile has a distinct header alias plus a full title and measurable N/D definitions.
WITH targets(code,base_code,kind,header_label) AS (
  VALUES
    ('8.4','8.4','linen','Kekosongan Linen'),
    ('8.5','8.4','medicine','Kekosongan Obat'),
    ('14.1','14.1','linen','Kekosongan Linen'),
    ('14.10','14.1','medicine','Kekosongan Obat'),
    ('18.2','18.2','linen','Kekosongan Linen'),
    ('18.7','18.2','medicine','Kekosongan Obat'),
    ('19.6','19.6','linen','Kekosongan Linen'),
    ('19.11','19.6','medicine','Kekosongan Obat'),
    ('20.6','20.6','linen','Kekosongan Linen'),
    ('20.12','20.6','medicine','Kekosongan Obat'),
    ('22.4','22.4','linen','Kekosongan Linen'),
    ('22.5','22.5','medicine','Kekosongan Obat'),
    ('23.2','23.2','linen','Kekosongan Linen'),
    ('23.3','23.3','medicine','Kekosongan Obat'),
    ('24.5','24.5','linen','Kekosongan Linen'),
    ('24.6','24.6','medicine','Kekosongan Obat'),
    ('25.9','25.9','linen','Kekosongan Linen Hari Pertama'),
    ('25.10','25.10','medicine','Kekosongan Obat Selama Dirawat'),
    ('26.4','26.4','linen','Kekosongan Linen'),
    ('26.5','26.5','medicine','Kekosongan Obat'),
    ('27.6','27.6','linen','Kekosongan Linen'),
    ('27.7','27.7','medicine','Kekosongan Obat'),
    ('37.2','37.2','linen','Kekosongan Linen'),
    ('37.3','37.3','medicine','Kekosongan Obat')
)
INSERT INTO aureka_quality.indicator_profiles (
  profile_year,code,room_id,unit_name,title,indicator_type,category,unit_of_measure,
  target_text,target_operator,target_value,numerator_definition,denominator_definition,
  measurement_grain,schema_json,options_json,version,status,is_active
)
SELECT
  2026,
  t.code,
  base.room_id,
  base.unit_name,
  CASE WHEN t.kind='linen' THEN 'Kekosongan Linen Pada Hari Pertama Rawat Pasien'
       ELSE 'Kekosongan Obat Selama Perawatan Pasien' END,
  'IMP-Unit Lokal Unit Pelayanan',
  'Proses dan Struktur',
  'Persentase (%)',
  '0% — Tidak ada kejadian yang ditoleransi (Zero Tolerance)',
  '=',
  0.0,
  CASE WHEN t.kind='linen'
    THEN 'Jumlah pasien yang mengalami kekosongan linen pada hari pertama rawat di unit tersebut pada periode pengukuran.'
    ELSE 'Jumlah pasien yang mengalami kekosongan obat selama perawatan di unit tersebut pada periode pengukuran.' END,
  'Jumlah seluruh pasien yang dirawat atau menerima pelayanan di unit tersebut pada periode pengukuran.',
  'patient_episode',
  jsonb_build_object(
    'source','AUREKA_Universal_Quality_Logbook_Engine_v3',
    'collection_mode','patient_episode',
    'fields',jsonb_build_array('record_date','patient_name','medical_record_no','diagnosis','dpjp','status'),
    'header_label',t.header_label,
    'source_indicator_code',t.base_code
  ),
  CASE WHEN t.kind='linen' THEN
    jsonb_build_array(
      jsonb_build_object('label','Tidak terjadi kekosongan linen','code',1,'numerator',false,'denominator',true),
      jsonb_build_object('label','Terjadi kekosongan linen','code',3,'numerator',true,'denominator',true),
      jsonb_build_object('label','Lainnya — tuliskan alasan/temuan','code',null,'numerator',null,'denominator',true,'review_required',true)
    )
  ELSE
    jsonb_build_array(
      jsonb_build_object('label','Tidak terjadi kekosongan obat','code',1,'numerator',false,'denominator',true),
      jsonb_build_object('label','Terjadi kekosongan obat','code',3,'numerator',true,'denominator',true),
      jsonb_build_object('label','Lainnya — tuliskan alasan/temuan','code',null,'numerator',null,'denominator',true,'review_required',true)
    )
  END,
  (SELECT coalesce(max(v.version),0)+1 FROM aureka_quality.indicator_profiles v
   WHERE v.profile_year=2026 AND v.code=t.code),
  'published',
  true
FROM targets t
JOIN aureka_quality.indicator_profiles base
  ON base.profile_year=2026 AND base.code=t.base_code AND base.version=1
WHERE NOT EXISTS (
  SELECT 1 FROM aureka_quality.indicator_profiles x
  WHERE x.profile_year=2026 AND x.code=t.code
    AND x.status='published' AND x.is_active=true
    AND x.title = CASE WHEN t.kind='linen' THEN 'Kekosongan Linen Pada Hari Pertama Rawat Pasien'
                       ELSE 'Kekosongan Obat Selama Perawatan Pasien' END
);

-- Restore full titles for five published master entries whose titles were blank.
UPDATE aureka_quality.indicator_profiles
SET title=CASE code
    WHEN '7.1' THEN 'Kepatuhan Pelaksanaan Asesmen PAGT pada Pasien Berisiko Malnutrisi Pada Hari Pertama Rawat'
    WHEN '7.2' THEN 'Kepatuhan Preskripsi Diet Awal Spesifik oleh DPJP pada Pasien Gangguan Metabolik Terpilih'
    WHEN '26.1' THEN 'Dilakukan pemeriksaan EKG 10 menit sejak pasien dengan keluhan nyeri dada datang di IGD'
    WHEN '26.3' THEN 'Intervensi Koroner Perkutan Primer dengan Door-to-Balloon ≤ 90 Menit'
    WHEN '26.11' THEN 'Pasien Stroke Iskemik dilakukan Pemeriksaan CT Scan Kepala Non Kontras ≤ 30 Menit'
    ELSE title END,
    updated_at=now()
WHERE profile_year=2026 AND status='published' AND is_active=true
  AND code IN ('7.1','7.2','26.1','26.3','26.11');

-- Restore complete source-master detail for the STEMI / stroke rows with incomplete title and measurement fields.
UPDATE aureka_quality.indicator_profiles
SET
  indicator_type='IMP-Unit Audit Medis STEMI',
  category='Proses',
  unit_of_measure='Persentase (%)',
  target_text='≥ 90%',
  target_operator='>=',
  target_value=90,
  numerator_definition='Jumlah pasien dengan keluhan nyeri dada kardiak yang dilakukan pemeriksaan EKG dalam waktu ≤ 10 menit sejak kedatangan (triase).',
  denominator_definition='Jumlah seluruh pasien yang datang ke IGD dengan keluhan nyeri dada kardiak (chest pain).',
  updated_at=now()
WHERE profile_year=2026 AND code='26.1' AND status='published' AND is_active=true;

UPDATE aureka_quality.indicator_profiles
SET
  indicator_type='IMP-Unit Audit Medis STEMI',
  category='Proses',
  unit_of_measure='Persentase (%)',
  target_text='100% — Seluruh kasus harus terpenuhi',
  target_operator='=',
  target_value=100,
  numerator_definition='Jumlah pasien STEMI yang berhasil dilakukan pengembangan balon/wire (wire crossing) dalam waktu ≤ 90 menit.',
  denominator_definition='Jumlah seluruh pasien STEMI yang dilakukan tindakan Primary PCI.',
  options_json=jsonb_build_array(
    jsonb_build_object('label','Door-to-Balloon ≤ 90 menit','code',1,'numerator',true,'denominator',true),
    jsonb_build_object('label','Door-to-Balloon > 90 menit (onset > 12 jam atau rescue PCI)','code',2,'numerator',false,'denominator',true),
    jsonb_build_object('label','Door-to-Balloon > 90 menit (masalah teknis/anatomi sulit)','code',2,'numerator',false,'denominator',true),
    jsonb_build_object('label','Door-to-Balloon > 90 menit (keterlambatan tim/administrasi)','code',3,'numerator',false,'denominator',true),
    jsonb_build_object('label','Lainnya — tuliskan alasan/temuan','code',null,'numerator',null,'denominator',true,'review_required',true)
  ),
  updated_at=now()
WHERE profile_year=2026 AND code='26.3' AND status='published' AND is_active=true;

UPDATE aureka_quality.indicator_profiles
SET
  indicator_type='IMP-Unit Audit Medis Stroke',
  category='Proses',
  unit_of_measure='Persentase (%)',
  target_text='100% — Seluruh kasus harus terpenuhi',
  target_operator='=',
  target_value=100,
  numerator_definition='Jumlah pasien stroke iskemik yang dilakukan pemeriksaan CT Scan kepala nonkontras ≤ 30 menit.',
  denominator_definition='Jumlah pasien stroke iskemik dengan instruksi CT Scan kepala nonkontras.',
  options_json=jsonb_build_array(
    jsonb_build_object('label','Dilakukan CT Scan ≤ 30 menit','code',1,'numerator',true,'denominator',true),
    jsonb_build_object('label','Dilakukan CT Scan > 30 menit (pasien tidak stabil/perlu resusitasi jalan napas)','code',2,'numerator',false,'denominator',true),
    jsonb_build_object('label','Dilakukan CT Scan > 30 menit (antrian radiologi penuh/alat maintenance)','code',2,'numerator',false,'denominator',true),
    jsonb_build_object('label','Dilakukan CT Scan > 30 menit (keterlambatan administrasi/transport)','code',3,'numerator',false,'denominator',true),
    jsonb_build_object('label','Tidak dilakukan CT Scan','code',3,'numerator',false,'denominator',true),
    jsonb_build_object('label','Lainnya — tuliskan alasan/temuan','code',null,'numerator',null,'denominator',true,'review_required',true)
  ),
  updated_at=now()
WHERE profile_year=2026 AND code='26.11' AND status='published' AND is_active=true;

-- Preserve green headers for which AUREKA has no complete source definition as inactive drafts.
-- These are deliberately not published because targets and N/D definitions must not be guessed.
INSERT INTO aureka_quality.indicator_profiles (
  profile_year,code,room_id,unit_name,title,indicator_type,category,unit_of_measure,
  target_text,target_operator,target_value,numerator_definition,denominator_definition,
  measurement_grain,schema_json,options_json,version,status,is_active
)
SELECT 2026, g.code, g.room_id, g.unit_name, g.title,
       'Perlu verifikasi klasifikasi dari master indikator', NULL, NULL,
       NULL, '=', NULL, NULL, NULL, 'patient_episode',
       jsonb_build_object(
         'source','Header Aureka.xlsx',
         'source_header',g.title,
         'header_label',g.title,
         'requires_master_detail',true,
         'note','Header ditemukan pada file referensi, tetapi definisi operasional/target/numerator/denominator lengkap tidak tersedia pada master AUREKA yang diperiksa. Jangan dipublikasikan sebelum diverifikasi.'
       ),
       '[]'::jsonb, 1, 'draft', false
FROM (VALUES
  ('22.9',22::bigint,'Rawat Inap Anak','Demam 2–7H + Trombositopenia + ↑Ht'),
  ('22.10',22::bigint,'Rawat Inap Anak','DR ≥1×/Hari'),
  ('22.11',22::bigint,'Rawat Inap Anak','Kristaloid ≥500 cc/8J'),
  ('22.12',22::bigint,'Rawat Inap Anak','Tidak DSS'),
  ('32.2',32::bigint,'Tim Pelayanan Keluarga Berencana Rumah Sakit','Komplikasi')
) AS g(code,room_id,unit_name,title)
WHERE NOT EXISTS (
  SELECT 1 FROM aureka_quality.indicator_profiles p
  WHERE p.profile_year=2026 AND p.code=g.code AND p.version=1
);

-- Attach the Excel's green-header label to the corresponding master profile. Full titles and definitions remain intact.
WITH header_map(code,header_label) AS (
  VALUES
    ('1.1','Respon Komplain'),
    ('1.2','Mengerti Informasi'),
    ('2.1','Tindak Lanjut'),
    ('3.1','Pelayanan Ambulance'),
    ('4.2','Laporan Operasi <24h'),
    ('4.3','Batal Operasi Elektif'),
    ('4.4','Lokasi/Prosedur Tepat'),
    ('4.5','Unplanned ICU Transfer'),
    ('6.1','Kematian IGD ≤8h'),
    ('6.2','Door-to-Decision'),
    ('6.3','Response Time DPJP'),
    ('6.4','Antrian Rawat Inap'),
    ('6.5','Kelengkapan Assessment Keperawatan'),
    ('6.6','Overcrowding Index'),
    ('6.7','Response Triage'),
    ('7.1','Assessment'),
    ('8.1','Akses Vaskular'),
    ('8.2','Adekuasi Dialisis'),
    ('8.3','Hipotensi'),
    ('8.4','Kekosongan Linen'),
    ('8.5','Kekosongan Obat'),
    ('9.1','Darah Terbuang'),
    ('9.2','Unordered Specimen'),
    ('9.3','Delay Sampling'),
    ('9.4','Lapor Tes Kritis'),
    ('9.5','Histopatologi'),
    ('10.1','Kekosongan BHP'),
    ('10.2','Kerusakan Film'),
    ('10.3','Keterlambatan Rontgen'),
    ('10.4','Pengulangan Rontgen'),
    ('12.1','Efektivitas'),
    ('12.2','Drop Out Tanpa Izin Dokter'),
    ('12.3','Kejadian Jatuh'),
    ('12.4','Salah Tindakan'),
    ('12.5','Kepatuhan Durasi Pelayanan'),
    ('12.6','Ketersediaan Media Terapi'),
    ('13.1','Klaim'),
    ('13.2','KLPCM'),
    ('14.1','Kekosongan Linen'),
    ('14.2','Transfer IGD'),
    ('14.3','Identifikasi Pasien'),
    ('14.4','Visite Spesialis'),
    ('14.5','APD'),
    ('14.6','Pencegahan Jatuh'),
    ('14.7','Komunikasi Perawatan'),
    ('14.8','Validitas Asesmen'),
    ('14.9','LOS ICU Panjang'),
    ('14.10','Kekosongan Obat'),
    ('15.1','Kehadiran'),
    ('18.1','Unplanned Extubation'),
    ('18.2','Kekosongan Linen'),
    ('18.3','Transfer IGD'),
    ('18.4','Visite Spesialis'),
    ('18.5','Validitas Asesmen Keperawatan'),
    ('18.6','LOS NICU Panjang'),
    ('18.7','Kekosongan Obat'),
    ('19.1','Antibiotik Profilaksis'),
    ('19.2','IMD'),
    ('19.3','Anestesi Regional'),
    ('19.4','Hemostasis'),
    ('19.5','Indikasi SC POGI'),
    ('19.6','Kekosongan Linen'),
    ('19.7','Transfer IGD'),
    ('19.8','Visite Spesialis'),
    ('19.9','Validitas Asesmen Kebidanan'),
    ('19.10','LOS Post SC <3'),
    ('19.11','Kekosongan Obat'),
    ('20.1','Asfiksia Tidak Ada'),
    ('20.2','Ventilator Bayi'),
    ('20.3','APGAR Score'),
    ('20.4','Usaha Nafas Bayi'),
    ('20.5','VTP <1 Menit'),
    ('20.6','Kekosongan Linen'),
    ('20.7','Transfer IGD'),
    ('20.8','Visite Spesialis'),
    ('20.9','Stabilitas Bayi Transfer'),
    ('20.10','HIE Tidak Ada'),
    ('20.11','Validitas Asesmen Keperawatan'),
    ('20.12','Kekosongan Obat'),
    ('21.1','Pelaksanaan Edukasi'),
    ('22.1','Assessment Stunting Wasting2'),
    ('22.2','Ketenangan Pasien'),
    ('22.3','Infus Vena Perifer'),
    ('22.4','Kekosongan Linen'),
    ('22.5','Kekosongan Obat'),
    ('22.6','Transfer IGD'),
    ('22.7','Visite Spesialis'),
    ('22.8','Validitas Asesmen Keperawatan'),
    ('23.1','Batal Operasi'),
    ('23.2','Kekosongan Linen'),
    ('23.3','Kekosongan Obat'),
    ('23.4','Transfer IGD'),
    ('23.5','Visite Spesialis'),
    ('23.6','Nyeri Terkontrol'),
    ('23.7','Validitas Asesmen Keperawatan'),
    ('24.1','Terapi OAT'),
    ('24.2','Sputum/TCM'),
    ('24.3','SITB Pencatatan'),
    ('24.4','Gejala TB Hilang'),
    ('24.5','Kekosongan Linen'),
    ('24.6','Kekosongan Obat'),
    ('24.7','Transfer IGD'),
    ('24.8','Visite Spesialis'),
    ('24.9','Oksigen Transfer IGD'),
    ('24.10','Validitas Asesmen Keperawatan'),
    ('25.1','Komponen Darah'),
    ('25.2','Obat Vasoaktif'),
    ('25.3','Koagulasi Lengkap'),
    ('25.4','EGD + Terapi'),
    ('25.5','Fungsi Ginjal/eGFR'),
    ('25.6','USG Perawatan'),
    ('25.7','Hemodialisis ≤48 Jam'),
    ('25.8','HB Pulang >10'),
    ('25.9','Kekosongan Linen Hari Pertama'),
    ('25.10','Kekosongan Obat Selama Dirawat'),
    ('25.11','Transfer IGD'),
    ('25.12','Visite Spesialis'),
    ('25.13','Clinical Pathway'),
    ('25.14','Klinis PGTA'),
    ('25.15','Lab PGTA'),
    ('25.16','Perdarahan Henti'),
    ('25.17','Anemia'),
    ('25.18','Validitas Asesmen Keperawatan'),
    ('26.1','EKG di IGD'),
    ('26.2','Killip Stratifikasi2'),
    ('26.3','Door-to-Balloon ≤90 Menit'),
    ('26.4','Kekosongan Linen'),
    ('26.5','Kekosongan Obat'),
    ('26.6','Transfer IGD'),
    ('26.7','Visite Spesialis'),
    ('26.8','LOS <5 Hari'),
    ('26.9','(SNH) LOS <7'),
    ('26.10','(SNH) rTPA <4,5h'),
    ('26.11','(SNH) CT Scan ≤30’'),
    ('26.12','(SNH) Antiplatelet/Antikoagulan'),
    ('26.13','(SNH) Pulang Hidup'),
    ('26.14','(STEMI) Survival RS'),
    ('26.15','(STEMI) Revaskularisasi'),
    ('26.16','Validitas Asesmen Keperawatan'),
    ('27.1','Hifema'),
    ('27.2','Perawatan Kaki'),
    ('27.3','Kontrol Metabolik'),
    ('27.4','ABI'),
    ('27.5','PEDIS'),
    ('27.6','Kekosongan Linen'),
    ('27.7','Kekosongan Obat'),
    ('27.8','Transfer IGD'),
    ('27.9','Visite Spesialis'),
    ('27.10','Pengkajian IGD'),
    ('27.11','Tanpa Amputasi'),
    ('27.12','Validitas Asesmen'),
    ('28.1','Status Penyelesaian'),
    ('29.1','Waktu Laporan'),
    ('29.2','Identifikasi'),
    ('30.1','Administrasi'),
    ('30.2','Atribut'),
    ('30.3','Absensi'),
    ('30.4','Sikap & Perilaku'),
    ('30.5','Laporan'),
    ('31.1','Kontrol Dokter'),
    ('33.1','Petugas'),
    ('33.2','Ruptur Perineum'),
    ('33.3','Komunikasi Pra-Kedatangan'),
    ('33.4','Stabilisasi Pra-Merujuk'),
    ('34.1','Kepatuhan Regimen Kemo'),
    ('34.2','Mastektomi < 5 Minggu'),
    ('34.3','Pemeriksaan IHC Lengkap'),
    ('34.4','Kelengkapan Staging cTNM'),
    ('34.5','Kepatuhan Follow-Up'),
    ('34.6','Kejadian Limfedema'),
    ('35.1','Kepatuhan Terapi'),
    ('36.1','Visitasi Pasien High Risk dan High Cost'),
    ('37.1','Unplanned Return Ibu'),
    ('37.2','Kekosongan Linen'),
    ('37.3','Kekosongan Obat'),
    ('37.4','Transfer IGD'),
    ('37.5','Partograf Lengkap'),
    ('37.6','Visite Spesialis'),
    ('37.7','Kepatuhan Instruksi Bidan'),
    ('37.8','Validitas Asesmen Kebidanan'),
    ('37.9','Tanggap SC Emergency')
)
UPDATE aureka_quality.indicator_profiles p
SET schema_json=coalesce(p.schema_json,'{}'::jsonb) || jsonb_build_object('header_label',m.header_label,'header_source','Header Aureka.xlsx'),
    updated_at=now()
FROM header_map m
WHERE p.profile_year=2026 AND p.code=m.code
  AND p.status='published' AND p.is_active=true;

COMMIT;
