create or replace function aureka_system.is_admin()
returns boolean
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select exists (
    select 1
    from aureka_system.user_profiles up
    join aureka_system.app_roles ar on ar.id = up.role_id
    where up.user_id = auth.uid()
      and up.is_active = true
      and ar.code = 'ADMIN'
      and ar.is_active = true
  );
$$;

create or replace function aureka_system.admin_list_user_profiles()
returns table(
  user_id uuid,
  full_name text,
  email text,
  primary_room_id bigint,
  role_id uuid,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select up.user_id, up.full_name, up.email, up.primary_room_id, up.role_id, up.is_active, up.created_at
  from aureka_system.user_profiles up
  where aureka_system.is_admin()
  order by lower(up.full_name);
$$;

create or replace function aureka_system.admin_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_primary_room_id bigint,
  p_role_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = aureka_system, public
as $$
begin
  if not aureka_system.is_admin() then
    raise exception 'FORBIDDEN: administrator role required';
  end if;
  update aureka_system.user_profiles
  set full_name = nullif(trim(p_full_name), ''),
      primary_room_id = p_primary_room_id,
      role_id = p_role_id,
      is_active = p_is_active,
      updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'User profile not found';
  end if;
  insert into aureka_system.user_room_assignments(user_id, room_id, is_primary, is_active)
  select p_user_id, p_primary_room_id, true, true
  where p_primary_room_id is not null
  on conflict (user_id, room_id) do update set is_primary=true,is_active=true;
  return true;
end;
$$;

grant execute on function aureka_system.admin_list_user_profiles() to authenticated;
grant execute on function aureka_system.admin_update_user_profile(uuid,text,bigint,uuid,boolean) to authenticated;
