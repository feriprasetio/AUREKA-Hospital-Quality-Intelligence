-- Permanently remove the retired E-Regulasi feature and its database objects.
-- Shared governance objects (recommendations, actions, permissions, settings, audit_log)
-- remain in place; only regulation-specific rows and schema objects are removed.

begin;

-- Remove regulation-specific authorization and configuration records.
delete from aureka_governance.role_permissions
where permission like 'regulation.%';

delete from aureka_governance.permissions
where code like 'regulation.%';

delete from aureka_governance.system_settings
where key = 'regulation_signature_method';

-- Remove regulation-only audit entries while preserving the shared audit log table.
delete from aureka_governance.audit_log
where lower(coalesce(object_type, '')) = 'regulation';

-- Remove the public RPC surface for E-Regulasi.
drop function if exists public.aureka_gov_regulation_list();
drop function if exists public.aureka_gov_regulation_save_draft(jsonb);
drop function if exists public.aureka_gov_regulation_submit(uuid);
drop function if exists public.aureka_gov_regulation_decide(uuid, text, text);
drop function if exists public.aureka_gov_regulation_publish(uuid, text, date, date);

-- Remove the regulation-only trigger functions.
drop function if exists aureka_governance.version_guard();
drop function if exists aureka_governance.no_delete();

-- Drop dependent tables first; CASCADE removes only their own constraints,
-- indexes, triggers, policies, and the FK from master_rooms.
drop table if exists
  aureka_governance.regulation_distributions,
  aureka_governance.regulation_approvals,
  aureka_governance.regulation_versions,
  aureka_governance.regulation_documents
cascade;

commit;
