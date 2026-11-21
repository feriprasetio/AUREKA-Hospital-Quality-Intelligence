-- Supabase can grant EXECUTE directly to anon via default ACLs in addition to PUBLIC.
-- Only public read/verification RPCs are callable by guests.
revoke execute on function public.aureka_stage_public_portal_snapshot(text,text,jsonb) from anon, public;
revoke execute on function public.aureka_approve_public_portal_snapshot(uuid) from anon, public;
revoke execute on function public.aureka_withdraw_public_portal_snapshot(uuid) from anon, public;
revoke execute on function public.aureka_manage_public_portal_snapshots() from anon, public;
grant execute on function public.aureka_stage_public_portal_snapshot(text,text,jsonb) to authenticated;
grant execute on function public.aureka_approve_public_portal_snapshot(uuid) to authenticated;
grant execute on function public.aureka_withdraw_public_portal_snapshot(uuid) to authenticated;
grant execute on function public.aureka_manage_public_portal_snapshots() to authenticated;
