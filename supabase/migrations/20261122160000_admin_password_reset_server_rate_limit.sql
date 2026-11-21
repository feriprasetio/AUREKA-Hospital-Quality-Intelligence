-- AUREKA rate limiter: credential resets must be throttled server side.
-- Eliminate the full-table DELETE from the request hot path: each user/bucket
-- occupies one row and a foreign key ON DELETE CASCADE handles deleted users.
-- No existing credentials or limits are reset by this migration.
ALTER TABLE aureka_private.edge_rate_limit_windows
  DROP CONSTRAINT IF EXISTS edge_rate_limit_windows_bucket_check;

ALTER TABLE aureka_private.edge_rate_limit_windows
  ADD CONSTRAINT edge_rate_limit_windows_bucket_check
  CHECK (bucket IN ('tanya','document_ingest','admin_password_reset'));

CREATE OR REPLACE FUNCTION public.aureka_consume_user_rate_limit(p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_window_seconds integer;
  v_window_start timestamptz;
  v_hits integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan untuk rate limit.'
      USING ERRCODE = '28000';
  END IF;

  CASE p_bucket
    WHEN 'tanya' THEN
      v_limit := 20;
      v_window_seconds := 600;
    WHEN 'document_ingest' THEN
      v_limit := 5;
      v_window_seconds := 60;
    WHEN 'admin_password_reset' THEN
      v_limit := 10;
      v_window_seconds := 600;
    ELSE
      RAISE EXCEPTION 'Rate-limit bucket tidak dikenal.'
        USING ERRCODE = '22023';
  END CASE;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM statement_timestamp()) / v_window_seconds) * v_window_seconds
  );

  INSERT INTO aureka_private.edge_rate_limit_windows (
    user_id, bucket, window_start, hit_count, updated_at
  )
  VALUES (v_uid, p_bucket, v_window_start, 1, clock_timestamp())
  ON CONFLICT (user_id, bucket)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    hit_count = CASE
      WHEN aureka_private.edge_rate_limit_windows.window_start = EXCLUDED.window_start
        THEN aureka_private.edge_rate_limit_windows.hit_count + 1
      ELSE 1
    END,
    updated_at = clock_timestamp()
  RETURNING hit_count INTO v_hits;

  RETURN v_hits > v_limit;
END;
$function$;
