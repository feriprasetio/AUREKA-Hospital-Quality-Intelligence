-- Mint a five-minute, single-use capability only for a signed-in Super Admin.
CREATE OR REPLACE FUNCTION public.aureka_admin_start_unit_account_provisioning()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, aureka_system, extensions
AS $$
DECLARE
  v_token text;
  v_hash text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.aureka_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: hanya Super Admin dapat memulai provisioning akun unit'
      USING ERRCODE='42501';
  END IF;

  DELETE FROM aureka_system.unit_account_provisioning_gate
   WHERE expires_at <= now() OR used_at IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM aureka_system.unit_account_provisioning_gate
    WHERE in_progress = true AND expires_at > now() AND used_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PROVISIONING_IN_PROGRESS: proses provisioning sedang berjalan';
  END IF;

  v_token := encode(extensions.gen_random_bytes(48),'hex');
  v_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  INSERT INTO aureka_system.unit_account_provisioning_gate(token_hash,expires_at)
  VALUES(v_hash,now()+interval '5 minutes');

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.aureka_admin_start_unit_account_provisioning() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aureka_admin_start_unit_account_provisioning() TO authenticated;
NOTIFY pgrst, 'reload schema';
