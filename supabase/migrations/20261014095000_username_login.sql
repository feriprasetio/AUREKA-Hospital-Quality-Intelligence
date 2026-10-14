-- AUREKA · Login dengan username (mis. pic.isolasi) + ubah email
--
-- 1) Kolom username (unik, huruf kecil) di aureka_system.user_profiles.
--    Diisi otomatis dari metadata pendaftaran (raw_user_meta_data->>'username').
--    Akun lama diberi username awal dari bagian depan email (bisa diubah Super Admin).
-- 2) Login: aplikasi mencari email dari username lalu login seperti biasa
--    (Supabase Auth tetap memakai email + password di belakang layar).
-- 3) Super Admin dapat mengubah username & email user; user dapat mengubah username sendiri.
--    User mengubah email sendiri lewat Supabase Auth (konfirmasi dikirim ke email baru).
--    Bila Super Admin mengganti email, akun ditandai belum terverifikasi agar aplikasi dapat
--    mengirim email verifikasi ke alamat baru (p_require_verification = true, bawaan).

alter table aureka_system.user_profiles add column if not exists username text;

create unique index if not exists user_profiles_username_key
  on aureka_system.user_profiles (lower(username)) where username is not null;

-- --------------------------------------------------------------- normalisasi
create or replace function aureka_system.normalize_username(p text)
returns text
language sql
immutable
as $$
  select nullif(trim(both '.' from regexp_replace(lower(trim(coalesce(p, ''))), '[^a-z0-9._-]+', '', 'g')), '');
$$;

create or replace function aureka_system.assert_valid_username(p text)
returns text
language plpgsql
immutable
as $$
declare v text := aureka_system.normalize_username(p);
begin
  if v is null or length(v) < 3 or length(v) > 30 or v !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception 'USERNAME_INVALID: Username 3–30 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip (contoh: pic.isolasi).';
  end if;
  return v;
end;
$$;

-- ----------------------------------------------- isi username saat akun baru dibuat
create or replace function aureka_system.fill_username_from_signup()
returns trigger
language plpgsql
security definer
set search_path = aureka_system, auth, public
as $$
declare v text;
begin
  if new.username is null then
    select aureka_system.normalize_username(u.raw_user_meta_data->>'username') into v
    from auth.users u where u.id = new.user_id;
    if v is not null and length(v) between 3 and 30
       and not exists (select 1 from aureka_system.user_profiles p where lower(p.username) = v and p.user_id <> new.user_id) then
      new.username := v;
    end if;
  else
    new.username := aureka_system.normalize_username(new.username);
  end if;
  return new;
end;
$$;

drop trigger if exists fill_username_from_signup on aureka_system.user_profiles;
create trigger fill_username_from_signup
before insert on aureka_system.user_profiles
for each row execute function aureka_system.fill_username_from_signup();

-- ------------------------------------------------- username awal untuk akun lama
do $$
declare r record; base text; cand text; n int;
begin
  for r in select user_id, email from aureka_system.user_profiles where username is null order by created_at loop
    base := left(coalesce(aureka_system.normalize_username(split_part(coalesce(r.email, ''), '@', 1)), ''), 26);
    if base is null or length(base) < 3 then base := 'user'; end if;
    cand := base; n := 1;
    while exists (select 1 from aureka_system.user_profiles where lower(username) = cand) loop
      n := n + 1; cand := base || n;
    end loop;
    update aureka_system.user_profiles set username = cand where user_id = r.user_id;
  end loop;
end $$;

-- ------------------------------------------------------------- login & cek
-- Dipanggil sebelum login (belum ada sesi). Mengembalikan email akun untuk username tersebut.
create or replace function public.aureka_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select up.email from aureka_system.user_profiles up
  where lower(up.username) = aureka_system.normalize_username(p_username)
  limit 1;
$$;

create or replace function public.aureka_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select aureka_system.normalize_username(p_username) is not null
     and not exists (select 1 from aureka_system.user_profiles up
                     where lower(up.username) = aureka_system.normalize_username(p_username));
$$;

-- --------------------------------------------------------------- akun saya
create or replace function public.aureka_get_my_account()
returns table(username text, email text)
language sql
stable
security definer
set search_path = aureka_system, auth, public
as $$
  select up.username, coalesce(u.email, up.email)
  from aureka_system.user_profiles up
  left join auth.users u on u.id = up.user_id
  where up.user_id = auth.uid();
$$;

create or replace function public.aureka_set_my_username(p_username text)
returns text
language plpgsql
security definer
set search_path = aureka_system, public
as $$
declare v text := aureka_system.assert_valid_username(p_username);
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  begin
    update aureka_system.user_profiles set username = v, updated_at = now() where user_id = auth.uid();
  exception when unique_violation then
    raise exception 'USERNAME_TAKEN: Username sudah dipakai akun lain.';
  end;
  return v;
end;
$$;

-- Dipanggil setelah user mengonfirmasi email baru, agar email di profil ikut sama.
create or replace function public.aureka_sync_my_email()
returns text
language sql
security definer
set search_path = aureka_system, auth, public
as $$
  update aureka_system.user_profiles up set email = u.email, updated_at = now()
  from auth.users u
  where u.id = up.user_id and up.user_id = auth.uid() and up.email is distinct from u.email
  returning up.email;
$$;

-- ------------------------------------------------------------ Super Admin
drop function if exists public.aureka_admin_set_user_identity(uuid, text, text);
create or replace function public.aureka_admin_set_user_identity(
  p_user_id uuid,
  p_username text,
  p_email text,
  p_require_verification boolean default true
)
returns text
language plpgsql
security definer
set search_path = aureka_system, auth, public
as $$
declare
  v_username text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_changed boolean;
begin
  if not aureka_system.is_admin() then
    raise exception 'FORBIDDEN: hanya Super Admin yang dapat mengubah username/email' using errcode = '42501';
  end if;
  if not exists (select 1 from aureka_system.user_profiles where user_id = p_user_id) then
    raise exception 'Akun tidak ditemukan';
  end if;
  v_username := case when nullif(trim(coalesce(p_username, '')), '') is null then null
                     else aureka_system.assert_valid_username(p_username) end;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_INVALID: Format email tidak valid.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'EMAIL_TAKEN: Email sudah dipakai akun lain.';
  end if;

  begin
    update aureka_system.user_profiles
       set username = v_username, email = v_email, updated_at = now()
     where user_id = p_user_id;
  exception when unique_violation then
    raise exception 'USERNAME_TAKEN: Username sudah dipakai akun lain.';
  end;

  select lower(email) is distinct from v_email into v_changed from auth.users where id = p_user_id;

  -- Hasil: 'verify' = email berubah & perlu verifikasi; 'changed' = berubah tanpa verifikasi; 'same' = tetap.
  update auth.users
     set email = v_email,
         email_confirmed_at = case when coalesce(p_require_verification, true) then null
                                   else coalesce(email_confirmed_at, now()) end,
         updated_at = now()
   where id = p_user_id and coalesce(v_changed, false);

  -- Data identitas login email Supabase ikut diperbarui.
  update auth.identities
     set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
         updated_at = now()
   where user_id = p_user_id and provider = 'email' and coalesce(v_changed, false);

  return case when not coalesce(v_changed, false) then 'same'
              when coalesce(p_require_verification, true) then 'verify'
              else 'changed' end;
end;
$$;

create or replace function public.aureka_admin_list_users_v3()
returns table(
  user_id uuid, full_name text, email text, username text, primary_room_id bigint, role_id uuid,
  is_active boolean, created_at timestamptz, deactivated_at timestamptz
)
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select up.user_id, up.full_name, up.email, up.username, up.primary_room_id, up.role_id,
         up.is_active, up.created_at, up.deactivated_at
  from aureka_system.user_profiles up
  where aureka_system.is_admin()
  order by up.is_active, lower(up.full_name);
$$;

-- ---------------------------------------------------------------- hak akses
revoke all on function public.aureka_login_email(text) from public;
revoke all on function public.aureka_username_available(text) from public;
revoke all on function public.aureka_get_my_account() from public, anon;
revoke all on function public.aureka_set_my_username(text) from public, anon;
revoke all on function public.aureka_sync_my_email() from public, anon;
revoke all on function public.aureka_admin_set_user_identity(uuid, text, text, boolean) from public, anon;
revoke all on function public.aureka_admin_list_users_v3() from public, anon;

grant execute on function public.aureka_login_email(text) to anon, authenticated;
grant execute on function public.aureka_username_available(text) to anon, authenticated;
grant execute on function public.aureka_get_my_account() to authenticated;
grant execute on function public.aureka_set_my_username(text) to authenticated;
grant execute on function public.aureka_sync_my_email() to authenticated;
grant execute on function public.aureka_admin_set_user_identity(uuid, text, text, boolean) to authenticated;
grant execute on function public.aureka_admin_list_users_v3() to authenticated;
