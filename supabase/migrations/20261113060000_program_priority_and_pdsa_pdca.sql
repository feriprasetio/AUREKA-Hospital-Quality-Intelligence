-- Program workspace redesign: annual priority areas, indicator proposal placement,
-- unified stakeholder recommendations/RTL, and PDCA/PDSA improvement cycles.
begin;

alter table aureka_governance.recommendations
  add column if not exists issued_by_level text not null default 'KETUA_PMKP';
alter table aureka_governance.recommendations
  drop constraint if exists recommendations_issued_by_level_check;
alter table aureka_governance.recommendations
  add constraint recommendations_issued_by_level_check
  check (issued_by_level in ('DEWAN_PENGAWAS','DIREKTUR','KETUA_PMKP','KABID'));
create index if not exists recommendations_issuer_year_idx
  on aureka_governance.recommendations(issued_by_level, program_year, given_at desc);

alter table aureka_governance.actions
  add column if not exists improvement_method text not null default 'PDSA',
  add column if not exists cycle_plan text not null default '',
  add column if not exists cycle_do text not null default '',
  add column if not exists cycle_study_check text not null default '',
  add column if not exists cycle_act text not null default '';
alter table aureka_governance.actions
  drop constraint if exists actions_improvement_method_check;
alter table aureka_governance.actions
  add constraint actions_improvement_method_check
  check (improvement_method in ('PDSA','PDCA'));

create table if not exists aureka_governance.annual_priority_areas (
  id uuid primary key default gen_random_uuid(),
  program_year integer not null check (program_year between 2024 and 2200),
  code text,
  title text not null check (length(trim(title)) >= 5),
  problem_statement text not null check (length(trim(problem_statement)) >= 10),
  rationale text not null default '',
  target_outcome text not null default '',
  priority text not null default 'tinggi' check (priority in ('tinggi','sedang','rendah')),
  owner_room_id bigint references public.master_rooms(id) on delete restrict,
  responsible_person text not null default '',
  due_date date,
  status text not null default 'aktif' check (status in ('aktif','berjalan','tercapai','ditunda','dibatalkan')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists annual_priority_areas_year_idx
  on aureka_governance.annual_priority_areas(program_year, priority, created_at desc);
alter table aureka_governance.annual_priority_areas enable row level security;

create or replace function public.aureka_gov_save_priority_area(p jsonb)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then
    raise exception 'Pengelolaan area prioritas hanya oleh Komite PMKP/Super Admin.';
  end if;
  if length(trim(coalesce(p->>'title',''))) < 5
     or length(trim(coalesce(p->>'problem_statement',''))) < 10
     or coalesce(p->>'program_year','') !~ '^[0-9]{4}$' then
    raise exception 'Tahun, nama area prioritas, dan rumusan masalah wajib dilengkapi.';
  end if;
  if coalesce(p->>'priority','tinggi') not in ('tinggi','sedang','rendah')
     or coalesce(p->>'status','aktif') not in ('aktif','berjalan','tercapai','ditunda','dibatalkan') then
    raise exception 'Prioritas atau status area prioritas tidak valid.';
  end if;
  if v_id is null then
    insert into aureka_governance.annual_priority_areas
      (program_year,code,title,problem_statement,rationale,target_outcome,priority,owner_room_id,responsible_person,due_date,status)
    values
      ((p->>'program_year')::integer,nullif(trim(p->>'code'),''),trim(p->>'title'),trim(p->>'problem_statement'),
       coalesce(p->>'rationale',''),coalesce(p->>'target_outcome',''),coalesce(p->>'priority','tinggi'),
       nullif(p->>'owner_room_id','')::bigint,coalesce(p->>'responsible_person',''),
       nullif(p->>'due_date','')::date,coalesce(p->>'status','aktif'))
    returning id into v_id;
    perform aureka_governance.write_audit('create','annual_priority_area',v_id::text,p);
  else
    update aureka_governance.annual_priority_areas
       set program_year=(p->>'program_year')::integer,code=nullif(trim(p->>'code'),''),
           title=trim(p->>'title'),problem_statement=trim(p->>'problem_statement'),
           rationale=coalesce(p->>'rationale',''),target_outcome=coalesce(p->>'target_outcome',''),
           priority=coalesce(p->>'priority','tinggi'),owner_room_id=nullif(p->>'owner_room_id','')::bigint,
           responsible_person=coalesce(p->>'responsible_person',''),due_date=nullif(p->>'due_date','')::date,
           status=coalesce(p->>'status','aktif'),updated_at=now()
     where id=v_id;
    if not found then raise exception 'Area prioritas tidak ditemukan.'; end if;
    perform aureka_governance.write_audit('update','annual_priority_area',v_id::text,p);
  end if;
  return v_id;
end;
$$;

create or replace function public.aureka_gov_program_list(p_year integer default null)
returns jsonb language plpgsql stable security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; v_levels text[];
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  v_levels := case
    when v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR') then array['DEWAN_PENGAWAS','DIREKTUR','KABID','UNIT']
    when v.role_code = 'DEWAN_PENGAWAS' then array['DEWAN_PENGAWAS']
    when v.role_code = 'KABID' then array['KABID']
    when v.role_code in ('PIC','VALIDATOR') then array['UNIT']
    else array[]::text[] end;
  return jsonb_build_object(
    'role',v.role_code,
    'can_manage',v.role_code in ('ADMIN','PMKP'),
    'can_evaluate',v.role_code in ('ADMIN','PMKP','DIREKTUR'),
    'recommendations',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.given_at desc,r.created_at desc)
      from aureka_governance.recommendations r
      where (p_year is null or r.program_year=p_year)
        and (v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR')
          or r.issued_by_level=v.role_code
          or exists(select 1 from aureka_governance.actions a where a.recommendation_id=r.id
             and a.responsible_level=any(v_levels)
             and (v.role_code not in ('PIC','VALIDATOR') or a.assigned_room_id=v.room_id)))
    ),'[]'::jsonb),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(a)||jsonb_build_object(
        'room_name',mr.name,
        'last_evaluation',(select to_jsonb(e) from aureka_governance.action_evaluations e where e.action_id=a.id order by e.evaluated_at desc limit 1)
      ) order by a.due_date nulls last,a.created_at)
      from aureka_governance.actions a
      left join public.master_rooms mr on mr.id=a.assigned_room_id
      left join aureka_governance.recommendations r on r.id=a.recommendation_id
      where a.responsible_level=any(v_levels)
        and (v.role_code not in ('PIC','VALIDATOR') or a.assigned_room_id=v.room_id)
        and (p_year is null or r.program_year is null or r.program_year=p_year)
    ),'[]'::jsonb),
    'priority_areas',coalesce((
      select jsonb_agg(to_jsonb(pa)||jsonb_build_object('room_name',mr.name) order by
        case pa.priority when 'tinggi' then 1 when 'sedang' then 2 else 3 end,pa.created_at desc)
      from aureka_governance.annual_priority_areas pa
      left join public.master_rooms mr on mr.id=pa.owner_room_id
      where p_year is null or pa.program_year=p_year
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.aureka_gov_save_recommendation(p jsonb)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; v_code text;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then
    raise exception 'Hanya Komite PMKP / Super Admin yang dapat mengelola rekomendasi.';
  end if;
  if coalesce(p->>'issued_by_level','KETUA_PMKP') not in ('DEWAN_PENGAWAS','DIREKTUR','KETUA_PMKP','KABID') then
    raise exception 'Asal pemberi rekomendasi tidak valid.';
  end if;
  if v_id is null then
    v_code := 'REK-' || coalesce(nullif(p->>'program_year',''),extract(year from now())::text) || '-' ||
      lpad((select count(*)+1 from aureka_governance.recommendations)::text,3,'0');
    insert into aureka_governance.recommendations
      (code,source,issued_by_level,title,description,priority,program_year,given_by_name,given_at)
    values
      (v_code,coalesce(nullif(p->>'source',''),'ketua_pmkp'),coalesce(p->>'issued_by_level','KETUA_PMKP'),
       p->>'title',coalesce(p->>'description',''),coalesce(nullif(p->>'priority',''),'sedang'),
       coalesce(nullif(p->>'program_year','')::int,extract(year from now())::int),
       nullif(p->>'given_by_name',''),coalesce(nullif(p->>'given_at','')::date,current_date))
    returning id into v_id;
    perform aureka_governance.write_audit('create','recommendation',v_id::text,p);
  else
    update aureka_governance.recommendations
       set source=coalesce(nullif(p->>'source',''),source),
           issued_by_level=coalesce(nullif(p->>'issued_by_level',''),issued_by_level),
           title=coalesce(nullif(p->>'title',''),title),description=coalesce(p->>'description',description),
           priority=coalesce(nullif(p->>'priority',''),priority),
           given_by_name=coalesce(p->>'given_by_name',given_by_name),
           given_at=coalesce(nullif(p->>'given_at','')::date,given_at),
           status=coalesce(nullif(p->>'status',''),status),updated_at=now()
     where id=v_id;
    if not found then raise exception 'Rekomendasi tidak ditemukan.'; end if;
    perform aureka_governance.write_audit('update','recommendation',v_id::text,p);
  end if;
  return v_id;
end;
$$;

create or replace function public.aureka_gov_save_action(p jsonb)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; a record; v_method text;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  v_method := coalesce(nullif(p->>'improvement_method',''),'PDSA');
  if v_method not in ('PDSA','PDCA') then raise exception 'Metode perbaikan harus PDSA atau PDCA.'; end if;
  if v_id is null then
    if v.role_code not in ('ADMIN','PMKP') then raise exception 'Hanya Komite PMKP / Super Admin yang dapat membuat RTL.'; end if;
    insert into aureka_governance.actions
      (recommendation_id,parent_action_id,title,description,responsible_level,assigned_to_name,assigned_room_id,due_date,
       expected_output,improvement_method,cycle_plan,cycle_do,cycle_study_check,cycle_act)
    values
      (nullif(p->>'recommendation_id','')::uuid,nullif(p->>'parent_action_id','')::uuid,p->>'title',coalesce(p->>'description',''),
       p->>'responsible_level',nullif(p->>'assigned_to_name',''),nullif(p->>'assigned_room_id','')::bigint,
       nullif(p->>'due_date','')::date,coalesce(p->>'expected_output',''),v_method,
       coalesce(p->>'cycle_plan',''),coalesce(p->>'cycle_do',''),coalesce(p->>'cycle_study_check',''),coalesce(p->>'cycle_act',''))
    returning id into v_id;
    perform aureka_governance.write_audit('create','action',v_id::text,p);
    return v_id;
  end if;
  select * into a from aureka_governance.actions where id=v_id;
  if not found then raise exception 'RTL tidak ditemukan.'; end if;
  if v.role_code in ('ADMIN','PMKP') then
    update aureka_governance.actions set
      title=coalesce(nullif(p->>'title',''),title),description=coalesce(p->>'description',description),
      responsible_level=coalesce(nullif(p->>'responsible_level',''),responsible_level),
      assigned_to_name=coalesce(p->>'assigned_to_name',assigned_to_name),
      assigned_room_id=coalesce(nullif(p->>'assigned_room_id','')::bigint,assigned_room_id),
      due_date=coalesce(nullif(p->>'due_date','')::date,due_date),
      expected_output=coalesce(p->>'expected_output',expected_output),
      improvement_method=coalesce(nullif(p->>'improvement_method',''),improvement_method),
      cycle_plan=coalesce(p->>'cycle_plan',cycle_plan),cycle_do=coalesce(p->>'cycle_do',cycle_do),
      cycle_study_check=coalesce(p->>'cycle_study_check',cycle_study_check),cycle_act=coalesce(p->>'cycle_act',cycle_act),
      status=coalesce(nullif(p->>'status',''),status),progress_note=coalesce(p->>'progress_note',progress_note),
      evidence_url=coalesce(nullif(p->>'evidence_url',''),evidence_url),updated_at=now()
    where id=v_id;
  elsif (a.responsible_level=v.role_code) or
    (a.responsible_level='UNIT' and v.role_code in ('PIC','VALIDATOR') and a.assigned_room_id=v.room_id) then
    if coalesce(p->>'status','') not in ('','berjalan','selesai') then
      raise exception 'Penanggung jawab hanya dapat mengubah status ke berjalan/selesai.';
    end if;
    update aureka_governance.actions set status=coalesce(nullif(p->>'status',''),status),
      progress_note=coalesce(p->>'progress_note',progress_note),
      evidence_url=coalesce(nullif(p->>'evidence_url',''),evidence_url),updated_at=now()
    where id=v_id;
  else
    raise exception 'RTL ini bukan dalam lingkup penugasan Anda.';
  end if;
  perform aureka_governance.write_audit('update','action',v_id::text,p);
  return v_id;
end;
$$;

create or replace function public.aureka_gov_indicator_proposal_list()
returns jsonb language plpgsql stable security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  if v.role_code not in ('ADMIN','PMKP','MANAGEMENT','KABID','PIC','DEWAN_PENGAWAS') then
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
      where v.role_code in ('ADMIN','PMKP','MANAGEMENT','DEWAN_PENGAWAS')
        or (v.role_code='KABID' and p.room_id=v.room_id)
        or (v.role_code='PIC' and p.submitted_by=auth.uid())
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.aureka_gov_save_priority_area(jsonb) from public,anon;
grant execute on function public.aureka_gov_save_priority_area(jsonb) to authenticated;
revoke all on function public.aureka_gov_program_list(integer) from public,anon;
grant execute on function public.aureka_gov_program_list(integer) to authenticated;
revoke all on function public.aureka_gov_save_recommendation(jsonb) from public,anon;
grant execute on function public.aureka_gov_save_recommendation(jsonb) to authenticated;
revoke all on function public.aureka_gov_save_action(jsonb) from public,anon;
grant execute on function public.aureka_gov_save_action(jsonb) to authenticated;
revoke all on function public.aureka_gov_indicator_proposal_list() from public,anon;
grant execute on function public.aureka_gov_indicator_proposal_list() to authenticated;

commit;
