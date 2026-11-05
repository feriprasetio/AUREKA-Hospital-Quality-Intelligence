DO $repair_quality_master_55$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_snapshot jsonb;
  v_title text;
  v_uom text;
  v_target_text text;
  v_target_value numeric;
  v_target_operator text;
  v_numerator text;
  v_denominator text;
  v_direction text;
  v_measurement_type text;
  v_target_pending boolean;
  v_definition_pending boolean;
  v_header_semantics_pending boolean;
  v_changed integer := 0;
  v_batch constant text := 'quality-master-repair-2026-11-05';
BEGIN
  FOR v_old IN
    SELECT *
    FROM aureka_quality.indicator_profiles
    WHERE profile_year = 2026
      AND status = 'published'
      AND is_active = true
      AND (room_id, code) IN (
        (7,'7.1'),
        (12,'12.1'),(12,'12.5'),
        (14,'14.8'),
        (17,'17.1'),
        (18,'18.1'),(18,'18.5'),
        (19,'19.1'),(19,'19.10'),(19,'19.2'),(19,'19.9'),
        (20,'20.1'),(20,'20.10'),(20,'20.11'),(20,'20.2'),(20,'20.3'),(20,'20.4'),(20,'20.5'),
        (22,'22.3'),(22,'22.8'),
        (23,'23.7'),
        (24,'24.1'),(24,'24.10'),(24,'24.4'),
        (25,'25.1'),(25,'25.14'),(25,'25.15'),(25,'25.17'),(25,'25.18'),(25,'25.2'),(25,'25.3'),(25,'25.4'),(25,'25.7'),(25,'25.8'),
        (26,'26.16'),
        (27,'27.10'),(27,'27.11'),(27,'27.12'),(27,'27.2'),(27,'27.3'),(27,'27.4'),
        (30,'30.1'),(30,'30.2'),(30,'30.3'),(30,'30.4'),(30,'30.5'),
        (32,'32.1'),
        (34,'34.1'),(34,'34.2'),(34,'34.3'),(34,'34.5'),(34,'34.6'),
        (36,'36.1'),
        (37,'37.1'),(37,'37.8')
      )
    ORDER BY room_id, code
    FOR UPDATE
  LOOP
    v_title := v_old.title;
    v_uom := coalesce(nullif(btrim(v_old.unit_of_measure), ''), 'Persentase (%)');
    v_target_text := v_old.target_text;
    v_target_value := v_old.target_value;
    v_target_operator := v_old.target_operator;
    v_numerator := v_old.numerator_definition;
    v_denominator := v_old.denominator_definition;
    v_schema := coalesce(v_old.schema_json, '{}'::jsonb);
    v_direction := nullif(v_schema->>'indicator_direction', '');
    v_measurement_type := nullif(v_schema->>'measurement_type', '');
    v_target_pending := lower(coalesce(v_schema->>'target_review_required', 'false')) = 'true';
    v_definition_pending := lower(coalesce(v_schema->>'definition_review_required', 'false')) = 'true';

    v_snapshot := jsonb_build_object(
      'title', v_old.title,
      'unit_of_measure', v_old.unit_of_measure,
      'target_text', v_old.target_text,
      'target_value', v_old.target_value,
      'target_operator', v_old.target_operator,
      'numerator_definition', v_old.numerator_definition,
      'denominator_definition', v_old.denominator_definition,
      'measurement_grain', v_old.measurement_grain,
      'schema_json', v_old.schema_json
    );
    v_schema := v_schema || jsonb_build_object(
      'source_master_snapshot', v_snapshot,
      'metadata_repair_batch', v_batch,
      'metadata_repaired_at', now()
    );

    IF v_old.room_id = 7 AND v_old.code = '7.1' THEN
      v_numerator := 'Jumlah rekam medis pasien rawat inap dengan hasil skrining awal berisiko malnutrisi yang telah menjalani asesmen gizi lanjutan (PAGT) oleh Dietisien dalam 24 jam pertama dan terdokumentasi di rekam medis.';
      v_denominator := 'Jumlah seluruh rekam medis pasien rawat inap dengan hasil skrining awal berisiko malnutrisi pada periode audit.';
    ELSIF v_old.room_id = 12 AND v_old.code = '12.1' THEN
      v_denominator := 'Jumlah seluruh pasien yang menyelesaikan satu siklus program rehabilitasi medik dan menjalani evaluasi akhir/discharge pada periode pengukuran.';
    ELSIF v_old.room_id = 17 AND v_old.code = '17.1' THEN
      v_uom := 'Persentase skor maksimum (%)';
      v_numerator := 'Jumlah skor kepuasan yang diperoleh dari seluruh jawaban valid pada kuesioner kepuasan pasien setelah pembobotan unsur sesuai instrumen yang digunakan.';
      v_denominator := 'Jumlah jawaban valid dikalikan skor maksimum per butir dan bobot unsur yang sama; hasil numerator/denominator dinyatakan sebagai persentase dari skor maksimum.';
      v_target_value := 80;
      v_target_operator := '>=';
      v_target_text := '≥ 80%';
      v_direction := 'positive';
      v_measurement_type := 'ratio';
    ELSIF v_old.room_id = 20 AND v_old.code = '20.10' THEN
      v_denominator := 'Jumlah seluruh bayi baru lahir dengan diagnosis asfiksia neonatorum yang menjalani penilaian ensefalopati hipoksik-iskemik menggunakan skor Thomson pada periode pengukuran.';
    ELSIF v_old.room_id = 25 AND v_old.code = '25.1' THEN
      v_numerator := 'Jumlah pasien sirosis dengan perdarahan varises esofagus yang pengelolaan komponen darahnya sesuai indikasi klinis DPJP, termasuk pemberian transfusi bila diindikasikan atau keputusan tidak transfusi bila tidak ada indikasi/terdapat kontraindikasi yang terdokumentasi.';
      v_denominator := 'Jumlah seluruh pasien sirosis dengan perdarahan varises esofagus yang dinilai kebutuhan transfusi komponen darah (PRC, trombosit, atau FFP) selama periode pengukuran.';
      v_definition_pending := true;
    ELSIF v_old.room_id = 25 AND v_old.code = '25.4' THEN
      v_numerator := 'Jumlah pasien sirosis dengan perdarahan varises esofagus yang menjalani endoskopi diagnostik dan terapi varises (ligasi atau injeksi cyanoacrylate), atau dirujuk ke fasilitas yang mampu memberikan tindakan sesuai indikasi klinis dan terdokumentasi.';
      v_denominator := 'Jumlah seluruh pasien sirosis dengan perdarahan varises esofagus yang memenuhi indikasi endoskopi/terapi varises atau rujukan untuk tindakan tersebut pada periode pengukuran.';
      v_definition_pending := true;
    ELSIF v_old.room_id = 25 AND v_old.code = '25.17' THEN
      v_title := 'Pencapaian Target Hemoglobin pada Pasien PGTA dengan Anemia';
      v_numerator := 'Jumlah pasien PGTA dengan anemia yang mencapai target hemoglobin ≥10 g/dL pada evaluasi sebelum pulang.';
      v_denominator := 'Jumlah seluruh pasien PGTA dengan anemia yang mempunyai hasil hemoglobin pada evaluasi sebelum pulang dalam periode pengukuran.';
      v_target_value := null;
      v_target_pending := true;
      v_definition_pending := true;
    ELSIF v_old.room_id = 25 AND v_old.code = '25.8' THEN
      v_title := 'Kesesuaian Evaluasi Hemoglobin dan Keputusan Pulang/Rujuk pada Pasien Sirosis dengan Perdarahan Varises';
      v_numerator := 'Jumlah pasien sirosis dengan perdarahan varises yang hasil hemoglobin dan keputusan pulang/rujuknya terdokumentasi serta sesuai dengan strategi transfusi individual yang ditetapkan DPJP, termasuk strategi transfusi restriktif atau rujukan bila diindikasikan.';
      v_denominator := 'Jumlah seluruh pasien sirosis dengan perdarahan varises yang dipulangkan hidup atau dirujuk dan memiliki evaluasi hemoglobin serta rencana tindak lanjut pada periode pengukuran.';
      v_target_value := null;
      v_target_pending := true;
      v_definition_pending := true;
    ELSIF v_old.room_id = 27 AND v_old.code = '27.2' THEN
      v_numerator := 'Jumlah pasien diabetes melitus atau pasien dengan risiko/kelainan kaki diabetik yang menerima perawatan kaki komprehensif sesuai hasil asesmen dan rencana klinis.';
      v_denominator := 'Jumlah seluruh pasien diabetes melitus atau pasien dengan risiko/kelainan kaki diabetik yang teridentifikasi dan memenuhi indikasi perawatan kaki komprehensif pada periode pengukuran.';
      v_measurement_type := 'ratio';
      v_definition_pending := true;
    ELSIF v_old.room_id = 27 AND v_old.code = '27.3' THEN
      v_numerator := 'Jumlah pasien diabetes melitus/gangguan metabolik yang mendapatkan terapi pengendalian metabolik sesuai indikasi dan rencana DPJP yang terdokumentasi.';
      v_denominator := 'Jumlah seluruh pasien diabetes melitus/gangguan metabolik yang teridentifikasi memiliki indikasi pengendalian metabolik pada periode pengukuran.';
      v_measurement_type := 'ratio';
      v_definition_pending := true;
    ELSIF v_old.room_id = 27 AND v_old.code = '27.4' THEN
      v_numerator := 'Jumlah pasien diabetes melitus/kecurigaan penyakit arteri perifer pada kaki yang menjalani pemeriksaan Ankle-Brachial Index (ABI) sesuai indikasi.';
      v_denominator := 'Jumlah seluruh pasien diabetes melitus atau pasien dengan risiko penyakit arteri perifer pada ekstremitas bawah yang memenuhi indikasi pemeriksaan ABI pada periode pengukuran.';
      v_measurement_type := 'ratio';
      v_definition_pending := true;
    ELSIF v_old.room_id = 34 AND v_old.code = '34.1' THEN
      v_title := 'Kesesuaian Keputusan Terapi Sistemik pada Pasien Kanker Payudara Subtipe Luminal A Stadium I–IIIa';
      v_numerator := 'Jumlah pasien kanker payudara subtipe Luminal A stadium I–IIIa yang menerima terapi sistemik atau keputusan tidak diberikan kemoterapi sesuai rencana MDT/DPJP yang terdokumentasi, dengan pertimbangan stadium, status nodal, faktor risiko, komorbiditas, dan preferensi pasien.';
      v_denominator := 'Jumlah seluruh pasien kanker payudara subtipe Luminal A stadium I–IIIa yang mempunyai keputusan rencana terapi sistemik dari MDT/DPJP pada periode pengukuran.';
      v_direction := 'positive';
      v_measurement_type := 'ratio';
      v_definition_pending := true;
    ELSIF v_old.room_id = 37 AND v_old.code = '37.1' THEN
      v_title := 'Angka Kejadian Unplanned Return Ibu Hamil dengan Komplikasi atau Partus Presipitatus';
      v_numerator := 'Jumlah ibu hamil dengan komplikasi atau partus presipitatus yang kembali secara tidak terencana ke IGD/Verlos Kamer dalam 72 jam setelah dipulangkan dari kunjungan sebelumnya karena masalah obstetri yang sama belum terselesaikan atau berulang.';
      v_denominator := 'Jumlah seluruh ibu hamil dengan komplikasi atau partus presipitatus yang dipulangkan setelah asesmen awal dan memiliki masa observasi tindak lanjut minimal 72 jam pada periode pengukuran.';
      v_direction := 'negative';
      v_measurement_type := 'ratio';
      v_definition_pending := true;
    END IF;

    IF v_old.room_id = 27 AND v_old.code = '27.11' THEN
      v_direction := 'positive';
      v_measurement_type := 'ratio';
      v_target_value := null;
      v_target_pending := true;
      v_definition_pending := true;
    END IF;

    IF v_old.room_id = 14 AND v_old.code = '14.8' THEN
      v_target_value := 100;
      v_target_operator := '=';
      v_target_text := '= 100%';
      v_target_pending := false;
    ELSIF v_old.room_id = 17 AND v_old.code = '17.1' THEN
      v_target_value := 80;
      v_target_operator := '>=';
      v_target_text := '≥ 80%';
      v_target_pending := false;
    ELSIF v_target_value IS NULL THEN
      v_target_pending := true;
    END IF;

    IF v_target_pending THEN
      v_target_value := NULL;
      v_target_text := 'Target numerik menunggu pengesahan pemilik indikator. Ketercapaian terhadap target belum dihitung.';
    END IF;

    IF v_direction IS NULL THEN
      v_direction := CASE
        WHEN v_old.room_id = 37 AND v_old.code = '37.1' THEN 'negative'
        ELSE 'positive'
      END;
    END IF;
    IF v_measurement_type IS NULL THEN
      v_measurement_type := 'ratio';
    END IF;

    IF v_old.room_id = 17 AND v_old.code = '17.1' THEN
      v_schema := v_schema || jsonb_build_object(
        'header_label','Indeks Kepuasan',
        'header_source','master indikator kepuasan pasien',
        'excel_header_mapping_status','no_unit_workbook_layout',
        'no_unit_workbook_layout',true,
        'survey_scale_requires_confirmation',true
      );
    ELSIF v_old.room_id = 32 AND v_old.code = '32.1' THEN
      v_schema := v_schema || jsonb_build_object(
        'header_label','Komplikasi',
        'header_source','data/quality-audit-layout-2026.json',
        'excel_header_mapping_status','matched_layout_header',
        'header_mapping_semantics_review_required',true,
        'header_mapping_review_note','Header layout unit adalah Komplikasi, sedangkan definisi indikator mengukur KB pascapersalinan. Kecocokan label teknis sudah dibuat agar terpetakan; pemilik unit perlu memastikan kolom tersebut memang sumber yang benar.'
      );
      v_header_semantics_pending := true;
    ELSIF v_old.room_id = 37 AND v_old.code = '37.1' THEN
      v_schema := v_schema || jsonb_build_object(
        'header_label','Unplanned Return Ibu2',
        'header_source','data/quality-audit-layout-2026.json',
        'excel_header_mapping_status','matched_layout_header',
        'return_window_hours',72
      );
    ELSE
      v_schema := v_schema || jsonb_build_object(
        'excel_header_mapping_status','matched_layout_header',
        'header_source',coalesce(v_schema->>'header_source','data/quality-audit-layout-2026.json')
      );
    END IF;

    IF v_header_semantics_pending THEN
      v_definition_pending := true;
    END IF;

    v_schema := v_schema || jsonb_build_object(
      'indicator_direction',v_direction,
      'measurement_type',v_measurement_type,
      'target_review_required',v_target_pending,
      'definition_review_required',v_definition_pending,
      'target_approval_status',CASE
        WHEN v_target_pending THEN 'pending_owner_approval'
        ELSE 'reconciled_from_explicit_source'
      END,
      'metadata_completeness_status','ready_for_workbook_capture',
      'metadata_repair_batch',v_batch,
      'metadata_repaired_at',now(),
      'target_review_note',CASE
        WHEN v_target_pending THEN 'Target numerik belum tersedia/disahkan. Profil sudah siap untuk pemetaan dan pencatatan workbook, tetapi sistem tidak menghitung ketercapaian terhadap target rekaan.'
        ELSE NULL
      END,
      'definition_review_note',CASE
        WHEN v_definition_pending THEN 'Definisi/arah atau pemetaan header merupakan rekonsiliasi operasional berbasis judul, N/D, opsi, dan layout sumber; perlu pengesahan pemilik indikator sebelum capaian dijadikan hasil resmi.'
        ELSE NULL
      END
    );

    IF v_old.room_id = 17 AND v_old.code = '17.1' THEN
      v_schema := v_schema || jsonb_build_object(
        'survey_calculation_note','Numerator/denominator merepresentasikan skor terhimpun dibanding skor maksimum dari respons valid; pastikan rumus tetap sesuai instrumen survei yang digunakan.'
      );
    END IF;

    UPDATE aureka_quality.indicator_profiles
       SET status='retired', is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil %/% berubah selama rekonsiliasi; seluruh batch dibatalkan.',v_old.room_id,v_old.code;
    END IF;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year,code,room_id,unit_name,title,indicator_type,category,
      unit_of_measure,target_text,target_operator,target_value,
      numerator_definition,denominator_definition,measurement_grain,
      schema_json,options_json,version,status,is_active,created_by,updated_by
    )
    VALUES (
      v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_title,
      v_old.indicator_type,v_old.category,v_uom,v_target_text,v_target_operator,v_target_value,
      v_numerator,v_denominator,v_old.measurement_grain,
      v_schema || jsonb_build_object(
        'source_master_snapshot',v_snapshot,
        'metadata_repair_batch',v_batch,
        'metadata_repaired_at',now()
      ),
      v_old.options_json,coalesce(v_old.version,1)+1,
      'published',true,v_old.created_by,v_old.updated_by
    );

    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed <> 55 THEN
    RAISE EXCEPTION 'Jumlah profil yang diperbaiki %; seharusnya tepat 55. Seluruh batch dibatalkan.',v_changed;
  END IF;
END
$repair_quality_master_55$;