
DO $upgrade$
DECLARE
  v_definition text;
  v_old_declaration text := '  v_staff_id uuid;';
  v_new_declaration text := '  v_staff_id uuid;' || chr(10) || '  v_waiting_minutes text;';
  v_old_assignment text := '  v_grain := p_payload->>''measurement_grain'';';
  v_new_assignment text := $replacement$
  v_grain := p_payload->>'measurement_grain';

  IF v_room_id = 11 AND v_grain = 'provider_day' THEN
    IF nullif(btrim(p_payload->'core_data'->'form_fields'->>'Klinik'), '') IS NULL
       OR nullif(btrim(p_payload->'core_data'->'form_fields'->>'Dokter'), '') IS NULL THEN
      RAISE EXCEPTION 'Klinik dan dokter wajib dipilih untuk logbook Rawat Jalan.' USING ERRCODE = '22023';
    END IF;
    v_waiting_minutes := p_payload->'core_data'->'form_fields'->>'Waktu Tunggu Rawat Jalan (Menit)';
    IF coalesce(v_waiting_minutes, '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Waktu tunggu Rawat Jalan harus berupa angka menit yang valid.' USING ERRCODE = '22023';
    END IF;
    IF v_waiting_minutes::numeric > 1440 THEN
      RAISE EXCEPTION 'Waktu tunggu Rawat Jalan tidak boleh melebihi 1.440 menit.' USING ERRCODE = '22023';
    END IF;
  END IF;
$replacement$;
BEGIN
  v_definition := pg_get_functiondef('aureka_quality.save_quality_logbook(uuid,jsonb,jsonb,jsonb)'::regprocedure);
  IF position(v_new_declaration IN v_definition) = 0 THEN
    IF position(v_old_declaration IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Deklarasi save_quality_logbook berubah; migrasi batas waktu tunggu dihentikan.';
    END IF;
    v_definition := replace(v_definition, v_old_declaration, v_new_declaration);
  END IF;
  IF position(v_new_assignment IN v_definition) = 0 THEN
    IF position(v_old_assignment IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Titik validasi measurement_grain berubah; migrasi batas waktu tunggu dihentikan.';
    END IF;
    v_definition := replace(v_definition, v_old_assignment, v_new_assignment);
  END IF;
  EXECUTE v_definition;
END;
$upgrade$;
