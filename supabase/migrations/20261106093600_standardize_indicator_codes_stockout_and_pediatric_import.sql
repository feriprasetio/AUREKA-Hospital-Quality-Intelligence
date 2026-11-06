
DO $standardize_profiles_2026$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_direction text;
  v_code text;
  v_target_text text;
  v_target_operator text;
  v_target_value numeric;
  v_unit text;
  v_n text;
  v_d text;
  v_changed integer:=0;
  v_target_changed integer:=0;
  v_options_changed integer:=0;
  v_stockout_changed integer:=0;
BEGIN
  FOR v_old IN
    SELECT p.*
    FROM aureka_quality.indicator_profiles p
    WHERE p.profile_year=2026 AND p.status='published' AND p.is_active=true
      AND (
        (coalesce(p.schema_json->>'target_review_required','false')='true'
          AND p.schema_json->>'indicator_direction' IN ('positive','negative')
          AND p.unit_of_measure ILIKE 'Persentase%')
        OR (p.room_id,p.code) IN (
          (8,'8.5'),(14,'14.10'),(18,'18.7'),(19,'19.11'),(20,'20.12'),(22,'22.5'),
          (23,'23.3'),(24,'24.6'),(25,'25.10'),(26,'26.5'),(27,'27.7'),(37,'37.3')
        )
        OR (
          p.schema_json->>'indicator_direction' IN ('positive','negative')
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(p.options_json,'[]'::jsonb)) opt
            WHERE opt->>'code' IN ('1','2','3')
              AND (
                opt->'numerator' IS DISTINCT FROM to_jsonb(
                  CASE WHEN p.schema_json->>'indicator_direction'='positive'
                       THEN opt->>'code'='1'
                       ELSE opt->>'code' IN ('2','3') END
                )
                OR coalesce(opt->>'denominator','true')<>'true'
                OR coalesce(opt->>'review_required','false')='true'
              )
          )
        )
        OR (p.room_id=22 AND p.code IN ('22.1','22.3','22.7'))
      )
    ORDER BY p.room_id,p.code
    FOR UPDATE
  LOOP
    v_schema:=coalesce(v_old.schema_json,'{}'::jsonb);
    v_options:=coalesce(v_old.options_json,'[]'::jsonb);
    v_direction:=v_schema->>'indicator_direction';
    v_unit:=v_old.unit_of_measure;
    v_target_text:=v_old.target_text;
    v_target_operator:=v_old.target_operator;
    v_target_value:=v_old.target_value;
    v_n:=v_old.numerator_definition;
    v_d:=v_old.denominator_definition;

    -- Resolve only three exact pediatric source choices that had no master code.
    SELECT jsonb_agg(
      CASE
        WHEN v_old.room_id=22 AND v_old.code='22.1'
          AND opt->>'label'='Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening'
          THEN opt||jsonb_build_object('code',2)
        WHEN v_old.room_id=22 AND v_old.code='22.3'
          AND opt->>'label'='Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang'
          THEN opt||jsonb_build_object('code',1)
        WHEN v_old.room_id=22 AND v_old.code='22.7'
          AND opt->>'label' IN ('Visite Hari Libur','Divisitekan Spesialis Lain/Dokter Jaga Ruangan','Pasien APS Tidak Sempat Visite')
          THEN opt||jsonb_build_object('code',2)
        ELSE opt
      END ORDER BY ord
    )
    INTO v_options
    FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord);

    -- Apply the universal response semantics to every coded choice in a profile
    -- whose direction is explicitly declared. Uncoded "Other" choices remain pending.
    IF v_direction IN ('positive','negative') THEN
      SELECT jsonb_agg(
        CASE WHEN opt->>'code' IN ('1','2','3') THEN
          opt||jsonb_build_object(
            'numerator',CASE
              WHEN v_direction='positive' THEN opt->>'code'='1'
              ELSE opt->>'code' IN ('2','3')
            END,
            'denominator',true,
            'review_required',false
          )
        ELSE opt END ORDER BY ord
      )
      INTO v_options
      FROM jsonb_array_elements(coalesce(v_options,'[]'::jsonb)) WITH ORDINALITY AS x(opt,ord);
    END IF;

    -- Medicine stockout is an adverse event: any entered drug name produces code 3.
    IF (v_old.room_id,v_old.code) IN (
      (8,'8.5'),(14,'14.10'),(18,'18.7'),(19,'19.11'),(20,'20.12'),(22,'22.5'),
      (23,'23.3'),(24,'24.6'),(25,'25.10'),(26,'26.5'),(27,'27.7'),(37,'37.3')
    ) THEN
      v_unit:='Persentase (%)';
      v_target_value:=0;
      v_target_operator:='<=';
      v_target_text:='≤ 0% — Zero Tolerance';
      v_n:='Jumlah pasien/episode yang mengalami sedikitnya satu jenis obat yang dibutuhkan tetapi tidak tersedia pada saat pelayanan atau perawatan. Nama setiap obat yang tidak tersedia dicatat sebagai bukti free text; setiap pasien/episode dihitung satu kali meskipun lebih dari satu nama obat tercatat.';
      v_d:='Jumlah seluruh pasien atau episode pelayanan dalam populasi pengukuran unit yang dinilai ketersediaan obat yang dibutuhkan selama periode pengukuran, termasuk episode tanpa kekosongan obat.';
      v_options:=jsonb_build_array(
        jsonb_build_object('code',1,'label','Tidak terjadi kekosongan obat','numerator',false,'denominator',true,'review_required',false),
        jsonb_build_object('code',3,'label','Terjadi kekosongan obat','numerator',true,'denominator',true,'review_required',false)
      );
      v_schema:=v_schema||jsonb_build_object(
        'indicator_direction','negative',
        'measurement_type','compliance',
        'input_mode','free_text_event',
        'free_text_field_label','Nama obat yang tidak tersedia',
        'free_text_placeholder','Tuliskan nama obat yang tidak tersedia; kosongkan bila tidak terjadi kekosongan obat.',
        'free_text_presence_means_adverse_event',true,
        'free_text_event_code',3,
        'free_text_no_event_code',1,
        'free_text_event_answer','Terjadi kekosongan obat',
        'free_text_no_event_answer','Tidak terjadi kekosongan obat',
        'free_text_counts_by_patient_once',true,
        'free_text_evidence_field','other_text',
        'free_text_input_semantics','Nama obat yang diisi menghasilkan code 3 dan masuk numerator indikator negatif. Isian kosong menghasilkan code 1 dan tetap masuk denominator.'
      );
      v_stockout_changed:=v_stockout_changed+1;
    END IF;

    IF coalesce(v_schema->>'target_review_required','false')='true'
       AND v_direction IN ('positive','negative')
       AND v_unit ILIKE 'Persentase%' THEN
      IF v_direction='positive' THEN
        v_target_value:=100;
        v_target_operator:='>=';
        v_target_text:='≥ 100%';
      ELSE
        v_target_value:=0;
        v_target_operator:='<=';
        v_target_text:='≤ 0% — Zero Tolerance';
      END IF;
      v_schema:=v_schema||jsonb_build_object(
        'target_review_required',false,
        'target_review_note',null,
        'target_approval_status','standardized_per_explicit_pmkp_instruction',
        'target_standardization_policy','Target indikator persentase berarah positif ditetapkan 100%; target indikator persentase berarah negatif ditetapkan 0%.'
      );
      v_target_changed:=v_target_changed+1;
    END IF;

    v_schema:=v_schema||jsonb_build_object(
      'response_code_semantics','Universal: code 1=keberhasilan; code 2=keberhasilan bersyarat; code 3=kegagalan. Positive numerator=code 1; negative numerator=code 2 atau 3; denominator mencakup code 1,2,3.',
      'master_standardization_batch','quality-standards-and-stockout-capture-2026-11-06',
      'master_standardized_at',now()
    );

    UPDATE aureka_quality.indicator_profiles
       SET status='retired',is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil %/% berubah saat standardisasi; batch dibatalkan.',v_old.room_id,v_old.code;
    END IF;

    INSERT INTO aureka_quality.indicator_profiles(
      profile_year,code,room_id,unit_name,title,indicator_type,category,
      unit_of_measure,target_text,target_operator,target_value,
      numerator_definition,denominator_definition,measurement_grain,
      schema_json,options_json,version,status,is_active,created_by,updated_by
    )
    VALUES(
      v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
      v_old.indicator_type,v_old.category,v_unit,v_target_text,coalesce(v_target_operator,'='),
      v_target_value,v_n,v_d,v_old.measurement_grain,
      v_schema,coalesce(v_options,'[]'::jsonb),v_old.version+1,'published',true,
      v_old.created_by,v_old.updated_by
    );

    IF coalesce(v_old.schema_json->>'target_review_required','false')='true'
       AND v_direction IN ('positive','negative')
       AND v_unit ILIKE 'Persentase%' THEN
      v_changed:=v_changed+1;
    ELSIF (v_old.room_id,v_old.code) IN (
      (8,'8.5'),(14,'14.10'),(18,'18.7'),(19,'19.11'),(20,'20.12'),(22,'22.5'),
      (23,'23.3'),(24,'24.6'),(25,'25.10'),(26,'26.5'),(27,'27.7'),(37,'37.3')
    ) THEN
      v_changed:=v_changed+1;
    ELSE
      v_changed:=v_changed+1;
    END IF;
  END LOOP;

  IF v_changed=0 THEN
    RAISE EXCEPTION 'Tidak ada profil aktif yang memenuhi kriteria standardisasi.';
  END IF;
  IF v_stockout_changed<>12 THEN
    RAISE EXCEPTION 'Jumlah profil kekosongan obat yang distandardisasi %; seharusnya 12.',v_stockout_changed;
  END IF;
  IF v_target_changed<>53 THEN
    RAISE EXCEPTION 'Jumlah target yang distandardisasi %; ditemukan 53 target pending pada audit awal.',v_target_changed;
  END IF;
END
$standardize_profiles_2026$;


DO $repair_import_rpc$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  v_count integer;
BEGIN
  -- Rawat Inap Bedah: accept a blank drug column as code 1 and free-text drug names as code 3.
  v_def:=pg_get_functiondef('aureka_quality.import_surgical_inpatient_logbook_batch(jsonb)'::regprocedure);
  v_old:=$old$IF coalesce(v_source_cells->>v_map.code,'') = '' AND (v_source_values ? v_map.code) THEN$old$;
  v_new:=$new$IF coalesce(v_source_cells->>v_map.code,'') = '' AND (v_source_values ? v_map.code) AND v_map.code <> '23.3' THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Surgical importer blank-source guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$IF (SELECT count(*) FROM jsonb_object_keys(v_source_values)) <> jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values)) <> jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_each_text(v_source_cells) AS cell(key,value)
           WHERE nullif(btrim(value),'') IS NOT NULL) <> jsonb_array_length(v_responses) THEN$old$;
  v_new:=$new$IF (SELECT count(*) FROM jsonb_object_keys(v_source_values)) <> jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values)) <> jsonb_array_length(v_responses)
       OR ((SELECT count(*) FROM jsonb_each_text(v_source_cells) AS cell(key,value)
            WHERE key <> '23.3' AND nullif(btrim(value),'') IS NOT NULL) + 1) <> jsonb_array_length(v_responses) THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Surgical importer response-count guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$OR coalesce(v_response->'raw_value'->>'review_required','false') <> 'true'
         OR coalesce(v_response->>'review_status','') <> 'pending' THEN$old$;
  v_new:=$new$OR NOT (
           (coalesce(v_response->'raw_value'->>'review_required','false') = 'true'
             AND coalesce(v_response->>'review_status','') = 'pending')
           OR
           (v_code = '23.3'
             AND coalesce(v_response->'raw_value'->>'mapping_status','') = 'mapped_existing_master'
             AND coalesce(v_response->'raw_value'->>'review_required','true') = 'false'
             AND coalesce(v_response->>'review_status','') = 'not_required')
         ) THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Surgical importer response-state guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$            OR (v_code='23.3' AND v_source_values->>v_code IN (
            'Adanya Kekosongan Obat (Code 3)','Tidak Adanya Kekosongan Obat (Code 1)'
          ) AND (
            (v_source_values->>v_code='Adanya Kekosongan Obat (Code 3)' AND v_response->>'response_label'='Terjadi kekosongan obat')
            OR (v_source_values->>v_code='Tidak Adanya Kekosongan Obat (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan obat')
          ))$old$;
  v_new:=$new$            OR (v_code='23.3' AND v_source_values->>v_code IN (
            'Adanya Kekosongan Obat (Code 3)','Tidak Adanya Kekosongan Obat (Code 1)'
          ) AND (
            (v_source_values->>v_code='Adanya Kekosongan Obat (Code 3)' AND v_response->>'response_label'='Terjadi kekosongan obat')
            OR (v_source_values->>v_code='Tidak Adanya Kekosongan Obat (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan obat')
          ))
          OR (v_code='23.3'
              AND coalesce(v_response->'raw_value'->>'free_text','')<>''
              AND coalesce(v_response->>'other_text','')=coalesce(v_source_values->>v_code,'')
              AND coalesce(v_response->'raw_value'->>'free_text','')=coalesce(v_source_values->>v_code,'')
              AND v_response_code=3
              AND v_response->>'response_label'='Terjadi kekosongan obat'
              AND v_response->'raw_value'->>'numerator'='true')$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Surgical importer medicine free-text validator mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;

  -- Rawat Inap Penyakit Dalam: same free-text adverse-event semantics.
  v_def:=pg_get_functiondef('aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb)'::regprocedure);
  v_old:=$old$      IF coalesce(v_source_cells->>v_map.code,'')='' AND (v_source_values ? v_map.code) THEN$old$;
  v_new:=$new$      IF coalesce(v_source_cells->>v_map.code,'')='' AND (v_source_values ? v_map.code) AND v_map.code<>'25.10' THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Internal medicine importer blank-source guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$    IF (SELECT count(*) FROM jsonb_object_keys(v_source_values))<>jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values))<>jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_each_text(v_source_cells) c(k,val) WHERE nullif(btrim(val),'') IS NOT NULL)<>jsonb_array_length(v_responses) THEN$old$;
  v_new:=$new$    IF (SELECT count(*) FROM jsonb_object_keys(v_source_values))<>jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values))<>jsonb_array_length(v_responses)
       OR ((SELECT count(*) FROM jsonb_each_text(v_source_cells) c(k,val)
            WHERE k<>'25.10' AND nullif(btrim(val),'') IS NOT NULL) + 1)<>jsonb_array_length(v_responses) THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Internal medicine importer response-count guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$         OR coalesce(v_response->'raw_value'->>'review_required','false')<>'true'
         OR coalesce(v_response->>'review_status','')<>'pending'
         OR coalesce(v_response->>'other_text','')<>coalesce(v_source_values->>v_code,'') THEN$old$;
  v_new:=$new$         OR NOT (
           (coalesce(v_response->'raw_value'->>'review_required','false')='true'
             AND coalesce(v_response->>'review_status','')='pending')
           OR
           (v_code='25.10'
             AND coalesce(v_response->'raw_value'->>'mapping_status','')='mapped_existing_master'
             AND coalesce(v_response->'raw_value'->>'review_required','true')='false'
             AND coalesce(v_response->>'review_status','')='not_required')
         )
         OR coalesce(v_response->>'other_text','')<>coalesce(v_source_values->>v_code,'') THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Internal medicine importer response-state guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$            AND ((v_source_values->>v_code='Tidak Adanya Kekosongan Obat (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan obat')))
        ) THEN RAISE EXCEPTION 'Alias sumber Linen/Obat tidak cocok (baris Excel %).',v_source_row USING ERRCODE='22023'; END IF;$old$;
  v_new:=$new$            AND ((v_source_values->>v_code='Tidak Adanya Kekosongan Obat (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan obat')))
          OR (v_code='25.10'
              AND coalesce(v_response->'raw_value'->>'free_text','')<>''
              AND coalesce(v_response->>'other_text','')=coalesce(v_source_values->>v_code,'')
              AND coalesce(v_response->'raw_value'->>'free_text','')=coalesce(v_source_values->>v_code,'')
              AND v_response_code=3
              AND v_response->>'response_label'='Terjadi kekosongan obat'
              AND v_response->'raw_value'->>'numerator'='true')
        ) THEN RAISE EXCEPTION 'Alias sumber Linen/Obat atau nama obat free text tidak cocok (baris Excel %).',v_source_row USING ERRCODE='22023'; END IF;$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Internal medicine importer medicine free-text validator mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;

  -- Rawat Inap Anak: include 22.5 as a measured adverse-event indicator while retaining 22.4 and Dengue columns source-only.
  v_def:=pg_get_functiondef('aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb)'::regprocedure);
  v_old:=$old$v_expected_codes text[] := ARRAY['22.1','22.2','22.3','22.6','22.7','22.8'];$old$;
  v_new:=$new$v_expected_codes text[] := ARRAY['22.1','22.2','22.3','22.5','22.6','22.7','22.8'];$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer expected-code guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$AND jsonb_array_length(ip.options_json)>0) <> 6 THEN$old$;
  v_new:=$new$AND jsonb_array_length(ip.options_json)>0) <> 7 THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer active-profile count guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$OR jsonb_array_length(v_responses)>6 OR jsonb_array_length(v_source_only)<>2$old$;
  v_new:=$new$OR jsonb_array_length(v_responses)>7 OR jsonb_array_length(v_source_only)<>6$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer payload count guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells))<>8 THEN
      RAISE EXCEPTION 'Enam kolom indikator dan dua kolom sumber-only wajib dipertahankan (baris Excel %).',v_source_row USING ERRCODE='22023';$old$;
  v_new:=$new$IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells))<>13 THEN
      RAISE EXCEPTION 'Tujuh kolom indikator dan enam kolom sumber-only wajib dipertahankan (baris Excel %).',v_source_row USING ERRCODE='22023';$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer source-cell count guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$('22.3','Infus Vena Perifer'),('22.6','Transfer IGD'),
      ('22.7','Visite Spesialis'),('22.8','Validitas Asesmen Keperawatan')$old$;
  v_new:=$new$('22.3','Infus Vena Perifer'),('22.5','Kekosongan Obat'),('22.6','Transfer IGD'),
      ('22.7','Visite Spesialis'),('22.8','Validitas Asesmen Keperawatan')$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer source map mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$IF coalesce(v_source_cells->>v_map.code,'')='' AND (v_source_values ? v_map.code) THEN$old$;
  v_new:=$new$IF coalesce(v_source_cells->>v_map.code,'')='' AND (v_source_values ? v_map.code) AND v_map.code<>'22.5' THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer drug source sentinel mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$    IF coalesce(v_source_only->0->>'code','')<>'22.4' OR coalesce(v_source_only->0->>'source_header','')<>'Kekosongan Linen'
       OR coalesce(v_source_only->0->>'source_value','')<>coalesce(v_form->>'Kekosongan Linen','')
       OR coalesce(v_source_only->0->>'mapping_status','')<>'source_semantics_not_mapped'
       OR coalesce(v_source_only->1->>'code','')<>'22.5' OR coalesce(v_source_only->1->>'source_header','')<>'Kekosongan Obat'
       OR coalesce(v_source_only->1->>'source_value','')<>coalesce(v_form->>'Kekosongan Obat','')
       OR coalesce(v_source_only->1->>'mapping_status','')<>'free_text_source_not_mapped' THEN
      RAISE EXCEPTION 'Kekosongan Linen/Obat wajib dicatat sebagai sumber-only (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;$old$;
  v_new:=$new$    IF coalesce(v_source_only->0->>'code','')<>'22.4' OR coalesce(v_source_only->0->>'source_header','')<>'Kekosongan Linen'
       OR coalesce(v_source_only->0->>'source_value','')<>coalesce(v_form->>'Kekosongan Linen','')
       OR coalesce(v_source_only->0->>'mapping_status','')<>'source_semantics_not_mapped'
       OR coalesce(v_source_only->1->>'code','')<>'22.5' OR coalesce(v_source_only->1->>'source_header','')<>'Kekosongan Obat'
       OR coalesce(v_source_only->1->>'source_value','')<>coalesce(v_form->>'Kekosongan Obat','')
       OR coalesce(v_source_only->1->>'mapping_status','')<>'free_text_source_not_mapped'
       OR coalesce(v_source_only->2->>'code','')<>'22.9' OR coalesce(v_source_only->2->>'source_header','')<>'Demam 2–7H + Trombositopenia + ↑Ht'
       OR coalesce(v_source_only->2->>'source_value','')<>coalesce(v_form->>'Demam 2–7H + Trombositopenia + ↑Ht','')
       OR coalesce(v_source_only->2->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->3->>'code','')<>'22.10' OR coalesce(v_source_only->3->>'source_header','')<>'DR ≥1×/Hari'
       OR coalesce(v_source_only->3->>'source_value','')<>coalesce(v_form->>'DR ≥1×/Hari','')
       OR coalesce(v_source_only->3->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->4->>'code','')<>'22.11' OR coalesce(v_source_only->4->>'source_header','')<>'Kristaloid ≥500 cc/8J'
       OR coalesce(v_source_only->4->>'source_value','')<>coalesce(v_form->>'Kristaloid ≥500 cc/8J','')
       OR coalesce(v_source_only->4->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR coalesce(v_source_only->5->>'code','')<>'22.12' OR coalesce(v_source_only->5->>'source_header','')<>'Tidak DSS'
       OR coalesce(v_source_only->5->>'source_value','')<>coalesce(v_form->>'Tidak DSS','')
       OR coalesce(v_source_only->5->>'mapping_status','')<>'clinical_definition_pending_source_only'
       OR NOT (v_source_cells ? '22.5')
       OR coalesce(v_source_cells->>'22.5','')<>coalesce(v_form->>'Kekosongan Obat','') THEN
      RAISE EXCEPTION 'Sumber Linen, Obat dan Dengue tidak lengkap/tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer source-only validation mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$WHERE k=ANY(v_expected_codes) AND nullif(btrim(val),'') IS NOT NULL)<>jsonb_array_length(v_responses) THEN$old$;
  v_new:=$new$WHERE k=ANY(v_expected_codes) AND k<>'22.5' AND nullif(btrim(val),'') IS NOT NULL) + 1 <> jsonb_array_length(v_responses) THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer response-source count mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$OR coalesce(v_response->'raw_value'->>'review_required','false')<>'true'
         OR coalesce(v_response->>'review_status','')<>'pending'
         OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped_pending_classification','not_in_master','ambiguous_master','source_code_conflict') THEN$old$;
  v_new:=$new$OR NOT (
           (coalesce(v_response->'raw_value'->>'review_required','false')='true'
             AND coalesce(v_response->>'review_status','')='pending'
             AND coalesce(v_response->'raw_value'->>'mapping_status','') IN ('mapped_pending_classification','not_in_master','ambiguous_master','source_code_conflict'))
           OR
           (coalesce(v_response->'raw_value'->>'review_required','true')='false'
             AND coalesce(v_response->>'review_status','')='not_required'
             AND coalesce(v_response->'raw_value'->>'mapping_status','')='mapped')
         ) THEN$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer response-state guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$OR coalesce(v_response->'raw_value'->>'mapping_status','')<>'mapped_pending_classification'
           OR (nullif(v_response->'raw_value'->>'source_code','') IS NOT NULL$old$;
  v_new:=$new$OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped_pending_classification','mapped')
           OR (nullif(v_response->'raw_value'->>'source_code','') IS NOT NULL$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer response code guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old:=$old$        SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
           AND opt->>'code'=v_response_code::text AND opt->'numerator'='null'::jsonb
           AND opt->>'denominator'='true' AND opt->>'review_required'='true';
        IF v_option_count<>1 THEN RAISE EXCEPTION 'Pilihan indikator % tidak cocok unik dengan master (baris Excel %).',v_code,v_source_row USING ERRCODE='23503'; END IF;$old$;
  v_new:=$new$        IF v_response->'raw_value'->>'mapping_status'='mapped' THEN
          SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
             AND opt->>'code'=v_response_code::text
             AND opt->'numerator' IS NOT DISTINCT FROM v_response->'raw_value'->'numerator'
             AND opt->>'denominator'='true' AND opt->>'review_required'='false'
             AND v_response->'raw_value'->>'denominator'='true';
        ELSE
          SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
             AND opt->>'code'=v_response_code::text AND opt->'numerator'='null'::jsonb
             AND opt->>'denominator'='true' AND opt->>'review_required'='true';
        END IF;
        IF v_option_count<>1 THEN RAISE EXCEPTION 'Pilihan indikator % tidak cocok unik dengan master (baris Excel %).',v_code,v_source_row USING ERRCODE='23503'; END IF;
        IF v_code='22.5' AND (
             coalesce(v_response->'raw_value'->>'free_text','')<>coalesce(v_form->>'Kekosongan Obat','')
             OR (coalesce(v_form->>'Kekosongan Obat','')<>'' AND
                 (v_response_code<>3 OR v_response->>'response_label'<>'Terjadi kekosongan obat'))
             OR (coalesce(v_form->>'Kekosongan Obat','')='' AND
                 (v_response_code<>1 OR v_response->>'response_label'<>'Tidak terjadi kekosongan obat'))
           ) THEN
          RAISE EXCEPTION 'Nama obat yang diisi wajib menjadi code 3; tanpa nama obat wajib menjadi code 1 (baris Excel %).',v_source_row USING ERRCODE='22023';
        END IF;$new$;
  v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'Pediatric importer master-option guard mismatch (%).',v_count; END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
END
$repair_import_rpc$;
