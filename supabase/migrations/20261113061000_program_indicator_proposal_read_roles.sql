-- Allow all Program workspace stakeholders to open the read-only indicator proposal card.
create or replace function public.aureka_gov_indicator_proposal_list()
returns jsonb language plpgsql stable security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  if v.role_code not in ('ADMIN','PMKP','MANAGEMENT','KABID','PIC','DEWAN_PENGAWAS','DIREKTUR','VALIDATOR') then
    raise exception 'Role akun tidak diizinkan membuka usulan indikator.';
  end if;
  return jsonb_build_object(
    'role',v.role_code,
    'can_review',v.role_code in ('ADMIN','PMKP'),
    'can_activate',v.role_code in ('ADMIN','PMKP'),
    'rows',coalesce((
      select jsonb_agg(to_jsonb(p)||jsonb_build_object('room_name',mr.name) order by p.submitted_at desc)
      from aureka_governance.indicator_proposals p
      join public.master_rooms mr on mr.id=p.room_id
      where v.role_code in ('ADMIN','PMKP','MANAGEMENT','DEWAN_PENGAWAS','DIREKTUR')
        or (v.role_code in ('KABID','VALIDATOR') and p.room_id=v.room_id)
        or (v.role_code='PIC' and p.submitted_by=auth.uid())
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.aureka_gov_indicator_proposal_list() from public,anon;
grant execute on function public.aureka_gov_indicator_proposal_list() to authenticated;
