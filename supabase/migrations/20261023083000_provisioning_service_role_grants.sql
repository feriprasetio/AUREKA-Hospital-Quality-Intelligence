-- Allow the server-only service_role used by aureka-provision-unit-accounts
-- to access only the private objects required for one-time account provisioning.
-- Do not grant these privileges to anon or authenticated.
GRANT USAGE ON SCHEMA aureka_system TO service_role;

GRANT SELECT, UPDATE
  ON TABLE aureka_system.unit_account_provisioning_gate
  TO service_role;

GRANT SELECT, UPDATE
  ON TABLE aureka_system.user_profiles
  TO service_role;

GRANT SELECT
  ON TABLE aureka_system.app_roles
  TO service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE aureka_system.user_room_assignments
  TO service_role;
