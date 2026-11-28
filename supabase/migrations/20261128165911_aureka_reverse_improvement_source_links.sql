-- Reverse navigation: one source can show all active RTL references without copying data.
create or replace function public.aureka_source_linked_actions(p_kind text,p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP')
    or not coalesce(aureka_system.password_rotation_complete(),false)
  then raise exception 'Akses relasi RTL ditolak.' using errcode='42501'; end if;
  if not exists(select 1 from aureka_governance.improvement_source_catalog(p_kind) c where c.source_id=p_source_id)
  then raise exception 'Sumber tidak tersedia atau di luar cakupan.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date nulls last,x.id),'[]'::jsonb) into result
  from (select a.id,a.title,a.status,a.due_date,a.improvement_method,l.linked_at
    from aureka_governance.action_source_links l join aureka_governance.actions a on a.id=l.action_id
    where l.source_kind=p_kind and l.source_id=p_source_id and l.unlinked_at is null
      and aureka_system.can_access_room_or_global(a.assigned_room_id)
    order by a.due_date nulls last,a.id limit 100) x;
  return jsonb_build_object('source_kind',p_kind,'source_id',p_source_id,'actions',result,'limit',100);
end;
$f$;
revoke all on function public.aureka_source_linked_actions(text,uuid) from public,anon;
grant execute on function public.aureka_source_linked_actions(text,uuid) to authenticated;
