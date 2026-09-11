create or replace view public.user_profiles with (security_invoker = true) as
select user_id, full_name, email, primary_room_id, role_id, is_active, created_at, updated_at
from aureka_system.user_profiles;

grant select on public.user_profiles to authenticated;

drop function if exists aureka_system.handle_new_user() cascade;
create or replace function aureka_system.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, aureka_system
as $$
begin
  insert into aureka_system.user_profiles(user_id, full_name, email, primary_room_id, role_id, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1), 'AUREKA User'),
    new.email,
    case when (new.raw_user_meta_data->>'primary_room_id') ~ '^[0-9]+$' then (new.raw_user_meta_data->>'primary_room_id')::bigint else null end,
    (select id from aureka_system.app_roles where code='PIC' limit 1),
    false
  )
  on conflict (user_id) do update set
    full_name=excluded.full_name,
    email=excluded.email,
    primary_room_id=coalesce(excluded.primary_room_id,aureka_system.user_profiles.primary_room_id),
    updated_at=now();
  return new;
end;
$$;

create trigger on_auth_user_created_aureka
after insert on auth.users
for each row execute function aureka_system.handle_new_user();
