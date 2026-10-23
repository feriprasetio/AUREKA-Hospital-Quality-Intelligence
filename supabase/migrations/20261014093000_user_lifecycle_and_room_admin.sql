-- AUREKA · Status akun nonaktif & pengelolaan Unit/Instalasi oleh Super Admin
--
-- 1) Membedakan akun "menunggu aktivasi" (belum pernah aktif) dan akun "nonaktif"
--    (pernah aktif lalu dinonaktifkan) melalui kolom deactivated_at.
-- 2) Super Admin dapat menambah, mengubah nama/kode, dan menonaktifkan unit kerja.
--    Unit tidak dihapus permanen karena direferensikan oleh profil pengguna dan data
--    operasional (risk register, RTP, dll.).

-- ---------------------------------------------------------------- akun nonaktif
alter table aureka_system.user_profiles add column if not exists deactivated_at timestamptz;

create or replace function aureka_system.track_user_deactivation()
returns trigger
language plpgsql
as $$
begin
  if new.is_active is distinct from old.is_active then
    new.deactivated_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists track_user_deactivation on aureka_system.user_profiles;
create trigger track_user_deactivation
before update on aureka_system.user_profiles
for each row execute function aureka_system.track_user_deactivation();

create or replace function public.aureka_admin_list_users_v2()
returns table(
  user_id uuid, full_name text, email text, primary_room_id bigint, role_id uuid,
  is_active boolean, created_at timestamptz, deactivated_at timestamptz
)
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select up.user_id, up.full_name, up.email, up.primary_room_id, up.role_id,
         up.is_active, up.created_at, up.deactivated_at
  from aureka_system.user_profiles up
  where public.aureka_is_admin()
  order by up.is_active, lower(up.full_name);
$$;

revoke all on function public.aureka_admin_list_users_v2() from public, anon;
grant execute on function public.aureka_admin_list_users_v2() to authenticated;

-- ---------------------------------------------------------------- unit / instalasi
create or replace function public.aureka_admin_list_rooms()
returns setof public.master_rooms
language sql
stable
security definer
set search_path = public, aureka_system
as $$
  select * from public.master_rooms where public.aureka_is_admin() order by sort_order;
$$;

create or replace function public.aureka_admin_save_room(
  p_id bigint,
  p_name text,
  p_code text default null,
  p_is_active boolean default true
)
returns public.master_rooms
language plpgsql
security definer
set search_path = public, aureka_system, aureka_risk
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_code text;
  v_old  public.master_rooms;
  v_row  public.master_rooms;
begin
  if not public.aureka_is_admin() then
    raise exception 'FORBIDDEN: hanya Super Admin yang dapat mengelola unit' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Nama unit wajib diisi';
  end if;
  v_code := upper(left(regexp_replace(coalesce(nullif(trim(p_code), ''), v_name), '[^A-Za-z0-9]+', '_', 'g'), 40));
  v_code := trim(both '_' from v_code);
  if v_code = '' then v_code := 'UNIT'; end if;

  begin
    if p_id is null then
      insert into public.master_rooms(code, name, is_active, sort_order)
      values (v_code, v_name, coalesce(p_is_active, true),
              coalesce((select max(sort_order) from public.master_rooms), 0) + 1)
      returning * into v_row;
    else
      select * into v_old from public.master_rooms where id = p_id;
      if not found then
        raise exception 'Unit tidak ditemukan';
      end if;
      update public.master_rooms
         set name = v_name, code = v_code, is_active = coalesce(p_is_active, is_active), updated_at = now()
       where id = p_id
      returning * into v_row;

      -- Nama unit pada risk register yang terhubung ke unit ini ikut diperbarui.
      if v_old.name is distinct from v_name then
        update aureka_risk.risk_register set unit_name = v_name where unit_id = p_id and unit_name = v_old.name;
      end if;
    end if;
  exception when unique_violation then
    raise exception 'DUPLICATE_ROOM: Nama atau kode unit sudah dipakai unit lain.' using errcode = '23505';
  end;

  return v_row;
end;
$$;

revoke all on function public.aureka_admin_list_rooms() from public, anon;
revoke all on function public.aureka_admin_save_room(bigint, text, text, boolean) from public, anon;
grant execute on function public.aureka_admin_list_rooms() to authenticated;
grant execute on function public.aureka_admin_save_room(bigint, text, text, boolean) to authenticated;
