create or replace function aureka_system.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, aureka_system
as $$
declare
  v_full_name text;
  v_room_id bigint;
  v_pic_role uuid;
begin
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'AUREKA User');
  v_room_id := case
    when nullif(new.raw_user_meta_data->>'primary_room_id', '') ~ '^\d+$' then (new.raw_user_meta_data->>'primary_room_id')::bigint
    else null
  end;
  select id into v_pic_role from aureka_system.app_roles where code = 'PIC' and is_active = true limit 1;

  insert into aureka_system.user_profiles(user_id, full_name, email, primary_room_id, role_id, is_active)
  values (new.id, v_full_name, new.email, v_room_id, v_pic_role, false)
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    primary_room_id = excluded.primary_room_id,
    updated_at = now();

  if v_room_id is not null then
    insert into aureka_system.user_room_assignments(user_id, room_id, is_primary, is_active)
    values (new.id, v_room_id, true, false)
    on conflict (user_id, room_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function aureka_system.handle_new_user();

insert into aureka_system.user_profiles(user_id, full_name, email, primary_room_id, role_id, is_active)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 'Prof. Feri'),
       u.email,
       null,
       r.id,
       true
from auth.users u
join aureka_system.app_roles r on r.code = 'ADMIN'
where lower(u.email) = lower('feri.prasetio@gmail.com')
on conflict (user_id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role_id = excluded.role_id,
  is_active = true,
  updated_at = now();
