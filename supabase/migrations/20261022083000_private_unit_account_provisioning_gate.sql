-- Private, single-use capability token for initial unit-account provisioning.
CREATE TABLE IF NOT EXISTS aureka_system.unit_account_provisioning_gate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  in_progress boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE aureka_system.unit_account_provisioning_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aureka_system.unit_account_provisioning_gate FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE aureka_system.unit_account_provisioning_gate IS 'Private one-time gate for first-time PIC/Validator account provisioning. Contains only a hash of a short-lived capability token.';
