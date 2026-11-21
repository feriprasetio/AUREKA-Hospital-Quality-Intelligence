-- Make the public registration room picker use the canonical database.
-- No patient or account data is exposed: only active unit IDs, names,
-- activation flags and display order may be read by anonymous users.
-- This is deliberately column-limited rather than GRANT SELECT on the table.
-- Idempotent for environments where the migration was partially applied.

ALTER TABLE public.master_rooms ENABLE ROW LEVEL SECURITY;

GRANT SELECT (id, name, is_active, sort_order)
  ON TABLE public.master_rooms TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'master_rooms'
      AND policyname = 'aureka_signup_active_rooms_only'
  ) THEN
    CREATE POLICY aureka_signup_active_rooms_only
      ON public.master_rooms
      FOR SELECT TO anon
      USING (is_active IS TRUE);
  END IF;
END;
$$;
