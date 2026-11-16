-- =====================================================================
-- Catatan error tampilan (frontend) ke audit log.
-- Bila satu modul AUREKA crash di browser pengguna, aplikasi memanggil fungsi ini
-- sehingga Super Admin / Direktur / PMKP dapat melihatnya di Pengaturan → Audit Log
-- (jenis objek "Error tampilan"), tanpa menunggu laporan screenshot.
--
-- Tidak membuat tabel baru: memakai aureka_governance.audit_log (append-only).
-- Pengaman: hanya pengguna login, teks dipotong, maksimal 30 catatan per pengguna per jam.
-- Tidak menyimpan data pasien: hanya nama modul, pesan error, potongan stack, dan URL tanpa query.
-- Membutuhkan 20261112100000_blueprint_program_regulation_audit.sql.
-- =====================================================================
create or replace function public.aureka_log_client_error(p_module text, p_message text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; n integer;
begin
  if auth.uid() is null then return; end if;
  select count(*) into n from aureka_governance.audit_log
   where actor_user_id = auth.uid() and action = 'client_error' and created_at > now() - interval '1 hour';
  if n >= 30 then return; end if;
  select * into v from aureka_governance.me();
  insert into aureka_governance.audit_log(actor_user_id, actor_name, actor_role, action, object_type, object_id, detail)
  values (auth.uid(), v.full_name, v.role_code, 'client_error', 'ui_error', left(coalesce(p_module, '-'), 80),
          jsonb_build_object(
            'message', left(coalesce(p_message, ''), 500),
            'stack', left(coalesce(p_detail->>'stack', ''), 1500),
            'path', left(coalesce(p_detail->>'path', ''), 200),
            'build', left(coalesce(p_detail->>'build', ''), 60),
            'ua', left(coalesce(p_detail->>'ua', ''), 200)));
end $$;
revoke all on function public.aureka_log_client_error(text, text, jsonb) from public, anon;
grant execute on function public.aureka_log_client_error(text, text, jsonb) to authenticated;
