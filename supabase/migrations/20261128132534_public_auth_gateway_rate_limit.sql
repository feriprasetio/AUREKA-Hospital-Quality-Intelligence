CREATE TABLE IF NOT EXISTS aureka_private.public_auth_rate_windows (
  bucket text NOT NULL,
  subject_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0),
  PRIMARY KEY (bucket, subject_hash)
);
ALTER TABLE aureka_private.public_auth_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aureka_private.public_auth_rate_windows FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.aureka_consume_public_auth_limit(p_action text,p_subject text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_window timestamptz;
  v_global integer;
  v_subject integer;
  v_seconds integer;
  v_global_limit integer;
  v_subject_limit integer;
BEGIN
  IF p_action NOT IN ('login','recover','resend') OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 3 AND 128 THEN
    RAISE EXCEPTION 'Invalid authentication request' USING ERRCODE='22023';
  END IF;
  v_seconds := CASE WHEN p_action='login' THEN 300 ELSE 600 END;
  v_global_limit := CASE WHEN p_action='login' THEN 600 ELSE 100 END;
  v_subject_limit := CASE WHEN p_action='login' THEN 20 ELSE 3 END;
  v_window := pg_catalog.to_timestamp(floor(extract(epoch FROM statement_timestamp()) / v_seconds)*v_seconds);
  INSERT INTO aureka_private.public_auth_rate_windows AS w (bucket,subject_hash,window_start,hit_count)
    VALUES (p_action,'global',v_window,1)
    ON CONFLICT (bucket,subject_hash) DO UPDATE SET
      window_start=excluded.window_start,
      hit_count=CASE WHEN w.window_start=excluded.window_start THEN least(w.hit_count+1,1000000) ELSE 1 END
    RETURNING hit_count INTO v_global;
  IF v_global > v_global_limit THEN RETURN true; END IF;
  INSERT INTO aureka_private.public_auth_rate_windows AS w (bucket,subject_hash,window_start,hit_count)
    VALUES (p_action,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(lower(trim(p_subject)),'UTF8')),'hex'),v_window,1)
    ON CONFLICT (bucket,subject_hash) DO UPDATE SET
      window_start=excluded.window_start,
      hit_count=CASE WHEN w.window_start=excluded.window_start THEN least(w.hit_count+1,1000000) ELSE 1 END
    RETURNING hit_count INTO v_subject;
  IF v_global=1 THEN
    DELETE FROM aureka_private.public_auth_rate_windows WHERE window_start < statement_timestamp()-interval '1 day';
  END IF;
  RETURN v_subject > v_subject_limit;
END $$;
REVOKE ALL ON FUNCTION public.aureka_consume_public_auth_limit(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_consume_public_auth_limit(text,text) TO service_role;
