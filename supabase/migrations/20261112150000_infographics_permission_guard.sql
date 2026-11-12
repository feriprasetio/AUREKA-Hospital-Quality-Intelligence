-- AUREKA Blueprint v2.0: permission-gated, aggregate-only Infographics API.
-- The older aggregate function is callable only through this permission-checking wrapper.
begin;

-- PIC and Validator may view aggregate quality results for their own assigned unit.
-- Keep explicit administrator overrides (updated_by IS NOT NULL) intact.
insert into aureka_governance.role_permissions(role_code, permission, granted)
values
  ('PIC', 'quality.read.aggregate', true),
  ('VALIDATOR', 'quality.read.aggregate', true)
on conflict (role_code, permission) do update
set granted = true, updated_at = now()
where aureka_governance.role_permissions.updated_by is null;

create or replace function public.aureka_gov_infographics_summary_secure(
  p_year integer default null,
  p_room bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.' using errcode = '28000';
  end if;

  if not public.aureka_has_permission('dashboard.read.infographics') then
    raise exception 'Akses Infografis tidak diberikan untuk akun ini.' using errcode = '42501';
  end if;

  v_summary := public.aureka_gov_infographics_summary(p_year, p_room);

  -- If the aggregate permission is explicitly revoked, retain other domain KPIs
  -- but suppress the quality section rather than exposing it through the dashboard.
  if not public.aureka_has_permission('quality.read.aggregate') then
    v_summary := pg_catalog.jsonb_set(
      v_summary,
      '{quality}',
      pg_catalog.jsonb_build_object(
        'active_indicators', 0,
        'records', 0,
        'validated', 0,
        'validation_rate', 0,
        'monthly', '[]'::jsonb,
        'categories', '[]'::jsonb
      ),
      true
    );
  end if;

  return v_summary;
end;
$function$;

revoke all on function public.aureka_gov_infographics_summary(integer, bigint) from public, anon, authenticated;
revoke all on function public.aureka_gov_infographics_summary_secure(integer, bigint) from public, anon;
grant execute on function public.aureka_gov_infographics_summary_secure(integer, bigint) to authenticated;

commit;
