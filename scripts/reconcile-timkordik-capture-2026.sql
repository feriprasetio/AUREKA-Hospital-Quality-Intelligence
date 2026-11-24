-- Timkordik records contain workbook options; reporting pools their numerator and denominator.
DO $fix$
BEGIN
  IF (SELECT count(*) FROM aureka_quality.indicator_profiles
      WHERE room_id=30 AND profile_year=2026 AND is_active AND status='published'
        AND code IN ('30.1','30.2','30.3','30.4','30.5')) <> 5 THEN
    RAISE EXCEPTION 'Expected five active Timkordik profiles';
  END IF;
  UPDATE aureka_quality.indicator_profiles
  SET schema_json=schema_json || '{"response_capture_mode":"categorical","accept_aggregate_responses":true}'::jsonb,
      updated_at=now()
  WHERE room_id=30 AND profile_year=2026 AND is_active AND status='published'
    AND code IN ('30.1','30.2','30.3','30.4','30.5')
    AND NOT schema_json @> '{"response_capture_mode":"categorical","accept_aggregate_responses":true}'::jsonb;
END $fix$;
