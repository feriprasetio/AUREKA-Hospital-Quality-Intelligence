-- AUREKA Module 3: Risk Management domain
-- Additive migration. Apply only after reviewing the feature branch and role mappings.
-- Baseline scores follow Kepmenkes HK.01.07/MENKES/1354/2024; FMEA RPN stays separate.

create schema if not exists aureka_risk;

create table if not exists aureka_risk.risk_matrix_reference (
  probability integer not null check (probability between 1 and 5),
  impact integer not null check (impact between 1 and 5),
  score integer not null check (score between 1 and 25),
  risk_band text not null check (risk_band in ('Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi')),
  appetite_action text not null check (appetite_action in ('Dapat diterima','Mitigasi')),
  primary key (probability, impact)
);

insert into aureka_risk.risk_matrix_reference(probability,impact,score,risk_band,appetite_action) values
  (1,1,1,'Sangat Rendah','Dapat diterima'),(1,2,3,'Sangat Rendah','Dapat diterima'),(1,3,6,'Rendah','Dapat diterima'),(1,4,12,'Sedang','Mitigasi'),(1,5,20,'Sangat Tinggi','Mitigasi'),
  (2,1,2,'Sangat Rendah','Dapat diterima'),(2,2,7,'Rendah','Dapat diterima'),(2,3,11,'Sedang','Mitigasi'),(2,4,15,'Tinggi','Mitigasi'),(2,5,21,'Sangat Tinggi','Mitigasi'),
  (3,1,4,'Sangat Rendah','Dapat diterima'),(3,2,9,'Rendah','Dapat diterima'),(3,3,13,'Sedang','Mitigasi'),(3,4,18,'Tinggi','Mitigasi'),(3,5,22,'Sangat Tinggi','Mitigasi'),
  (4,1,5,'Rendah','Dapat diterima'),(4,2,10,'Sedang','Mitigasi'),(4,3,16,'Tinggi','Mitigasi'),(4,4,19,'Tinggi','Mitigasi'),(4,5,24,'Sangat Tinggi','Mitigasi'),
  (5,1,8,'Rendah','Dapat diterima'),(5,2,14,'Sedang','Mitigasi'),(5,3,17,'Tinggi','Mitigasi'),(5,4,23,'Sangat Tinggi','Mitigasi'),(5,5,25,'Sangat Tinggi','Mitigasi')
on conflict (probability,impact) do update set score=excluded.score,risk_band=excluded.risk_band,appetite_action=excluded.appetite_action;

-- New role codes are seeded, but no user is assigned a role automatically.
insert into aureka_system.app_roles(code,name,description,is_active)
values
 ('KABID','Kepala Bidang','Reviewer tahap pertama untuk rencana mitigasi risiko',true),
 ('DIREKTUR','Direktur','Reviewer tahap kedua untuk rencana mitigasi risiko',true),
 ('DEWAN_PENGAWAS','Dewan Pengawas','Reviewer tahap ketiga/pengawasan rencana mitigasi risiko',true)
on conflict (code) do update set name=excluded.name,description=excluded.description,is_active=true;

create table if not exists aureka_risk.risk_register (
  id uuid primary key default gen_random_uuid(),
  risk_code text not null unique default ('RS-PMKP-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  source_key text unique,
  unit_id bigint references public.master_rooms(id) on delete set null,
  unit_name text not null,
  category text not null,
  risk_event text not null,
  causes text not null default '',
  effects text not null default '',
  current_controls text not null default '',
  baseline_probability integer not null check (baseline_probability between 1 and 5),
  baseline_impact integer not null check (baseline_impact between 1 and 5),
  baseline_score integer not null default 1 check (baseline_score between 1 and 25),
  baseline_band text not null default 'Sangat Rendah',
  residual_probability integer check (residual_probability between 1 and 5),
  residual_impact integer check (residual_impact between 1 and 5),
  residual_score integer check (residual_score between 1 and 25),
  residual_band text,
  risk_status text not null default 'identified'
    check (risk_status in ('identified','treatment_planned','awaiting_kabid','awaiting_director','awaiting_board','approved','in_progress','evaluating','closed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists risk_register_score_idx on aureka_risk.risk_register(baseline_score desc);
create index if not exists risk_register_unit_status_idx on aureka_risk.risk_register(unit_id,risk_status);
create index if not exists risk_register_category_idx on aureka_risk.risk_register(category);
create index if not exists risk_register_creator_idx on aureka_risk.risk_register(created_by);
create index if not exists risk_register_source_key_idx on aureka_risk.risk_register(source_key);

create or replace function aureka_risk.current_role_code()
returns text
language sql
stable
security definer
set search_path = aureka_system, public, auth
as $function$
  select ar.code
  from aureka_system.user_profiles up
  join aureka_system.app_roles ar on ar.id=up.role_id
  where up.user_id=(select auth.uid()) and up.is_active=true and ar.is_active=true
  limit 1;
$function$;

create or replace function aureka_risk.can_read_all_risks()
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
  select coalesce(aureka_risk.current_role_code() in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'),false);
$function$;

create or replace function aureka_risk.can_edit_risk(p_unit_id bigint,p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
  select case
    when aureka_risk.current_role_code() is null then false
    when aureka_risk.current_role_code() in ('ADMIN','PMKP','MANAGEMENT','KABID') then true
    when aureka_risk.current_role_code() <> 'PIC' then false
    when p_unit_id is null then p_created_by=(select auth.uid())
    else exists (
      select 1
      from aureka_system.user_profiles up
      where up.user_id=(select auth.uid()) and up.is_active=true and up.primary_room_id=p_unit_id
      union all
      select 1
      from aureka_system.user_room_assignments ura
      where ura.user_id=(select auth.uid()) and ura.is_active=true and ura.room_id=p_unit_id
    )
  end;
$function$;

create or replace function aureka_risk.can_access_risk(p_risk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
  select coalesce(aureka_risk.can_read_all_risks(),false)
    or exists (
      select 1 from aureka_risk.risk_register rr
      where rr.id=p_risk_id and aureka_risk.can_edit_risk(rr.unit_id,rr.created_by)
    );
$function$;

create or replace function aureka_risk.can_edit_risk_id(p_risk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
  select exists (
    select 1 from aureka_risk.risk_register rr
    where rr.id=p_risk_id and aureka_risk.can_edit_risk(rr.unit_id,rr.created_by)
  );
$function$;

create or replace function aureka_risk.recalculate_risk_scores()
returns trigger
language plpgsql
set search_path = aureka_risk, public
as $function$
begin
  select m.score,m.risk_band into new.baseline_score,new.baseline_band
  from aureka_risk.risk_matrix_reference m
  where m.probability=new.baseline_probability and m.impact=new.baseline_impact;
  if not found then raise exception 'Kombinasi baseline probability-impact tidak memiliki referensi matriks.'; end if;

  if new.residual_probability is null or new.residual_impact is null then
    new.residual_score := null;
    new.residual_band := null;
  else
    select m.score,m.risk_band into new.residual_score,new.residual_band
    from aureka_risk.risk_matrix_reference m
    where m.probability=new.residual_probability and m.impact=new.residual_impact;
    if not found then raise exception 'Kombinasi residual probability-impact tidak memiliki referensi matriks.'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists risk_register_recalculate on aureka_risk.risk_register;
create trigger risk_register_recalculate
before insert or update
on aureka_risk.risk_register
for each row execute function aureka_risk.recalculate_risk_scores();

create table if not exists aureka_risk.risk_fmea (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references aureka_risk.risk_register(id) on delete restrict,
  failure_mode text not null,
  failure_effect text not null default '',
  potential_cause text not null default '',
  current_controls text not null default '',
  severity integer not null check (severity between 1 and 5),
  occurrence integer not null check (occurrence between 1 and 5),
  detection integer not null check (detection between 1 and 5),
  rpn integer not null default 1 check (rpn between 1 and 125),
  priority text not null default 'Rendah' check (priority in ('Rendah','Sedang','Tinggi')),
  cutoff_status text not null default 'Pengawasan Rutin',
  recommended_action text not null default '',
  action_owner text not null default '',
  due_date date,
  residual_severity integer check (residual_severity between 1 and 5),
  residual_occurrence integer check (residual_occurrence between 1 and 5),
  residual_detection integer check (residual_detection between 1 and 5),
  residual_rpn integer check (residual_rpn between 1 and 125),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists risk_fmea_risk_id_idx on aureka_risk.risk_fmea(risk_id);
create index if not exists risk_fmea_rpn_idx on aureka_risk.risk_fmea(rpn desc);

create or replace function aureka_risk.recalculate_fmea_scores()
returns trigger
language plpgsql
set search_path = aureka_risk, public
as $function$
begin
  new.rpn := new.severity * new.occurrence * new.detection;
  if new.severity >= 4 or new.rpn >= 30 then
    new.priority := 'Tinggi'; new.cutoff_status := 'RCA / Redesign Prosedur';
  elsif new.rpn >= 15 then
    new.priority := 'Sedang'; new.cutoff_status := 'SOP Update / Monitoring Ketat';
  else
    new.priority := 'Rendah'; new.cutoff_status := 'Pengawasan Rutin';
  end if;
  if new.residual_severity is null or new.residual_occurrence is null or new.residual_detection is null then
    new.residual_rpn := null;
  else
    new.residual_rpn := new.residual_severity * new.residual_occurrence * new.residual_detection;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists risk_fmea_recalculate on aureka_risk.risk_fmea;
create trigger risk_fmea_recalculate
before insert or update
on aureka_risk.risk_fmea
for each row execute function aureka_risk.recalculate_fmea_scores();

create table if not exists aureka_risk.risk_links (
  id uuid primary key default gen_random_uuid(),
  risk_a_id uuid not null references aureka_risk.risk_register(id) on delete cascade,
  risk_b_id uuid not null references aureka_risk.risk_register(id) on delete cascade,
  link_type text not null check (link_type in ('shared_cause','same_process','shared_control','cascade','correlated')),
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (risk_a_id < risk_b_id),
  unique (risk_a_id,risk_b_id,link_type)
);
create index if not exists risk_links_a_idx on aureka_risk.risk_links(risk_a_id);
create index if not exists risk_links_b_idx on aureka_risk.risk_links(risk_b_id);

create table if not exists aureka_risk.mitigation_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique default ('RTP-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  title text not null,
  objective text not null default '',
  action_plan text not null,
  responsible_unit text not null default '',
  responsible_person text not null default '',
  target_date date not null,
  target_residual_likelihood integer not null check (target_residual_likelihood between 1 and 5),
  target_residual_impact integer not null check (target_residual_impact between 1 and 5),
  status text not null default 'draft' check (status in ('draft','returned','pending_kabid','pending_director','pending_board','approved','in_progress','evaluating','closed')),
  current_stage text check (current_stage in ('KABID','DIREKTUR','DEWAN_PENGAWAS')),
  created_by uuid not null default auth.uid() references auth.users(id),
  unit_id bigint references public.master_rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mitigation_plans_status_idx on aureka_risk.mitigation_plans(status,current_stage,target_date);
create index if not exists mitigation_plans_creator_idx on aureka_risk.mitigation_plans(created_by);

create table if not exists aureka_risk.mitigation_plan_risks (
  plan_id uuid not null references aureka_risk.mitigation_plans(id) on delete cascade,
  risk_id uuid not null references aureka_risk.risk_register(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (plan_id,risk_id)
);
create index if not exists mitigation_plan_risks_risk_idx on aureka_risk.mitigation_plan_risks(risk_id);

create table if not exists aureka_risk.risk_plan_approvals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references aureka_risk.mitigation_plans(id) on delete cascade,
  stage text not null check (stage in ('KABID','DIREKTUR','DEWAN_PENGAWAS')),
  stage_order integer not null check (stage_order between 1 and 3),
  status text not null check (status in ('pending','approved','returned')),
  reviewer_id uuid references auth.users(id),
  notes text,
  acted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists risk_plan_approvals_plan_stage_idx on aureka_risk.risk_plan_approvals(plan_id,stage_order,created_at desc);

create table if not exists aureka_risk.risk_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists risk_audit_entity_idx on aureka_risk.risk_audit_log(entity_type,entity_id,created_at desc);
create index if not exists risk_audit_created_at_idx on aureka_risk.risk_audit_log(created_at desc);

create or replace function aureka_risk.audit_entity_change()
returns trigger
language plpgsql
security definer
set search_path = aureka_risk, public, auth
as $function$
declare
  v_row jsonb;
  v_id uuid;
  v_action text := tg_op;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := (v_row->>'id')::uuid;
  insert into aureka_risk.risk_audit_log(entity_type,entity_id,action,actor_user_id,details)
  values (
    tg_table_name,v_id,v_action,(select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object(
      'code',coalesce(v_row->>'risk_code',v_row->>'plan_code'),
      'status',coalesce(v_row->>'risk_status',v_row->>'status'),
      'unit_name',v_row->>'unit_name',
      'risk_event',v_row->>'risk_event',
      'risk_id',v_row->>'risk_id'
    ))
  );
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

drop trigger if exists risk_register_audit on aureka_risk.risk_register;
create trigger risk_register_audit after insert or update or delete on aureka_risk.risk_register for each row execute function aureka_risk.audit_entity_change();
drop trigger if exists risk_fmea_audit on aureka_risk.risk_fmea;
create trigger risk_fmea_audit after insert or update or delete on aureka_risk.risk_fmea for each row execute function aureka_risk.audit_entity_change();
drop trigger if exists risk_links_audit on aureka_risk.risk_links;
create trigger risk_links_audit after insert or update or delete on aureka_risk.risk_links for each row execute function aureka_risk.audit_entity_change();
drop trigger if exists mitigation_plans_audit on aureka_risk.mitigation_plans;
create trigger mitigation_plans_audit after insert or update or delete on aureka_risk.mitigation_plans for each row execute function aureka_risk.audit_entity_change();

create or replace function aureka_risk.can_access_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
  select exists (
    select 1 from aureka_risk.mitigation_plans mp
    where mp.id=p_plan_id and (
      mp.created_by=(select auth.uid())
      or aureka_risk.can_read_all_risks()
      or exists (
        select 1 from aureka_risk.mitigation_plan_risks mpr
        join aureka_risk.risk_register rr on rr.id=mpr.risk_id
        where mpr.plan_id=mp.id and aureka_risk.can_access_risk(rr.id)
      )
    )
  );
$function$;

create or replace function aureka_risk.create_mitigation_plan(
  p_title text,
  p_objective text,
  p_action_plan text,
  p_responsible_unit text,
  p_responsible_person text,
  p_target_date date,
  p_target_residual_likelihood integer,
  p_target_residual_impact integer,
  p_risk_ids uuid[]
)
returns text
language plpgsql
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
declare
  v_count integer;
  v_plan aureka_risk.mitigation_plans%rowtype;
  v_role text := aureka_risk.current_role_code();
  v_unit_id bigint;
  v_distinct_units integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if v_role not in ('ADMIN','PMKP','MANAGEMENT','PIC','KABID') then raise exception 'FORBIDDEN: role cannot create mitigation plans'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_action_plan),'') is null or p_target_date is null then
    raise exception 'VALIDATION: title, action plan, and target date are required';
  end if;
  if p_target_residual_likelihood not between 1 and 5 or p_target_residual_impact not between 1 and 5 then
    raise exception 'VALIDATION: residual targets must be 1–5';
  end if;
  if p_risk_ids is null or cardinality(p_risk_ids)<1 or cardinality(p_risk_ids)>30 then
    raise exception 'VALIDATION: select between 1 and 30 linked risks';
  end if;
  select count(distinct rr.id), count(distinct rr.unit_id), min(rr.unit_id)
    into v_count,v_distinct_units,v_unit_id
  from aureka_risk.risk_register rr
  where rr.id=any(p_risk_ids) and aureka_risk.can_edit_risk(rr.unit_id,rr.created_by);
  if v_count <> cardinality(p_risk_ids) then
    raise exception 'FORBIDDEN_OR_INVALID: one or more selected risks do not exist or cannot be managed by this user';
  end if;
  if v_distinct_units <> 1 then v_unit_id := null; end if;

  insert into aureka_risk.mitigation_plans(
    title,objective,action_plan,responsible_unit,responsible_person,target_date,
    target_residual_likelihood,target_residual_impact,created_by,unit_id,status
  )
  values (
    trim(p_title),coalesce(trim(p_objective),''),trim(p_action_plan),coalesce(trim(p_responsible_unit),''),
    coalesce(trim(p_responsible_person),''),p_target_date,p_target_residual_likelihood,p_target_residual_impact,
    (select auth.uid()),v_unit_id,'draft'
  )
  returning * into v_plan;

  insert into aureka_risk.mitigation_plan_risks(plan_id,risk_id)
  select v_plan.id,chosen.id from (
    select distinct unnest(p_risk_ids) as id
  ) chosen;
  update aureka_risk.risk_register rr set risk_status='treatment_planned',updated_at=now()
  where rr.id=any(p_risk_ids);
  return v_plan.plan_code;
end;
$function$;

create or replace function aureka_risk.submit_mitigation_plan(p_plan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
declare
  v_plan aureka_risk.mitigation_plans%rowtype;
begin
  select * into v_plan from aureka_risk.mitigation_plans where id=p_plan_id for update;
  if not found then raise exception 'NOT_FOUND: mitigation plan'; end if;
  if v_plan.created_by <> (select auth.uid()) then raise exception 'FORBIDDEN: only the plan owner can submit'; end if;
  if v_plan.status not in ('draft','returned') then raise exception 'INVALID_STATE: plan is not a draft or returned plan'; end if;
  if not exists(select 1 from aureka_risk.mitigation_plan_risks where plan_id=p_plan_id) then raise exception 'VALIDATION: plan must be linked to at least one risk'; end if;
  update aureka_risk.mitigation_plans set status='pending_kabid',current_stage='KABID',updated_at=now() where id=p_plan_id;
  update aureka_risk.risk_register rr set risk_status='awaiting_kabid',updated_at=now()
  where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  insert into aureka_risk.risk_plan_approvals(plan_id,stage,stage_order,status)
  values(p_plan_id,'KABID',1,'pending');
  insert into aureka_risk.risk_audit_log(entity_type,entity_id,action,actor_user_id,details)
  values('mitigation_plan',p_plan_id,'SUBMITTED',(select auth.uid()),jsonb_build_object('stage','KABID'));
  return true;
end;
$function$;

create or replace function aureka_risk.review_mitigation_plan(
  p_plan_id uuid,
  p_stage text,
  p_decision text,
  p_notes text default ''
)
returns boolean
language plpgsql
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
declare
  v_plan aureka_risk.mitigation_plans%rowtype;
  v_role text := aureka_risk.current_role_code();
  v_next text;
  v_next_order integer;
  v_pending_id uuid;
begin
  if p_decision not in ('approved','returned') then raise exception 'VALIDATION: decision must be approved or returned'; end if;
  if p_stage not in ('KABID','DIREKTUR','DEWAN_PENGAWAS') then raise exception 'VALIDATION: invalid review stage'; end if;
  if v_role <> p_stage then raise exception 'FORBIDDEN: the active role does not match the review stage'; end if;
  if p_decision='returned' and nullif(trim(p_notes),'') is null then raise exception 'VALIDATION: a return decision requires a substantive note'; end if;
  select * into v_plan from aureka_risk.mitigation_plans where id=p_plan_id for update;
  if not found then raise exception 'NOT_FOUND: mitigation plan'; end if;
  if v_plan.current_stage <> p_stage then raise exception 'INVALID_STATE: review stages must be sequential'; end if;

  select id into v_pending_id
  from aureka_risk.risk_plan_approvals
  where plan_id=p_plan_id and stage=p_stage and status='pending'
  order by created_at desc limit 1 for update;
  if v_pending_id is null then raise exception 'INVALID_STATE: no pending approval exists for this stage'; end if;

  update aureka_risk.risk_plan_approvals
  set status=p_decision,reviewer_id=(select auth.uid()),notes=nullif(trim(p_notes),''),acted_at=now()
  where id=v_pending_id;

  if p_decision='returned' then
    update aureka_risk.mitigation_plans set status='returned',current_stage=null,updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='treatment_planned',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  elsif p_stage='KABID' then
    v_next:='DIREKTUR';v_next_order:=2;
    update aureka_risk.mitigation_plans set status='pending_director',current_stage=v_next,updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='awaiting_director',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
    insert into aureka_risk.risk_plan_approvals(plan_id,stage,stage_order,status) values(p_plan_id,v_next,v_next_order,'pending');
  elsif p_stage='DIREKTUR' then
    v_next:='DEWAN_PENGAWAS';v_next_order:=3;
    update aureka_risk.mitigation_plans set status='pending_board',current_stage=v_next,updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='awaiting_board',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
    insert into aureka_risk.risk_plan_approvals(plan_id,stage,stage_order,status) values(p_plan_id,v_next,v_next_order,'pending');
  else
    update aureka_risk.mitigation_plans set status='approved',current_stage=null,updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='approved',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  end if;

  insert into aureka_risk.risk_audit_log(entity_type,entity_id,action,actor_user_id,details)
  values('mitigation_plan',p_plan_id,'REVIEW_'||upper(p_decision),(select auth.uid()),jsonb_build_object('stage',p_stage,'notes',nullif(trim(p_notes),'')));
  return true;
end;
$function$;

create or replace function aureka_risk.advance_mitigation_plan(p_plan_id uuid,p_next_status text)
returns boolean
language plpgsql
security definer
set search_path = aureka_risk, aureka_system, public, auth
as $function$
declare
  v_plan aureka_risk.mitigation_plans%rowtype;
  v_role text := aureka_risk.current_role_code();
begin
  select * into v_plan from aureka_risk.mitigation_plans where id=p_plan_id for update;
  if not found then raise exception 'NOT_FOUND: mitigation plan'; end if;
  if not (v_plan.created_by=(select auth.uid()) or v_role in ('ADMIN','PMKP','MANAGEMENT') or exists (
    select 1 from aureka_risk.mitigation_plan_risks mpr
    where mpr.plan_id=p_plan_id and aureka_risk.can_edit_risk_id(mpr.risk_id)
  )) then raise exception 'FORBIDDEN: user cannot act on this mitigation plan'; end if;
  if p_next_status='in_progress' and v_plan.status='approved'
     and v_role in ('ADMIN','PMKP','MANAGEMENT','PIC','KABID') then
    update aureka_risk.mitigation_plans set status='in_progress',updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='in_progress',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  elsif p_next_status='evaluating' and v_plan.status='in_progress'
     and v_role in ('ADMIN','PMKP','MANAGEMENT','PIC','KABID') then
    update aureka_risk.mitigation_plans set status='evaluating',updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='evaluating',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  elsif p_next_status='closed' and v_plan.status='evaluating'
     and v_role in ('ADMIN','PMKP','MANAGEMENT') then
    if exists (
      select 1 from aureka_risk.mitigation_plan_risks mpr
      join aureka_risk.risk_register rr on rr.id=mpr.risk_id
      where mpr.plan_id=p_plan_id and (rr.residual_probability is null or rr.residual_impact is null or rr.residual_score > 9)
    ) then raise exception 'VALIDATION: residual scores for all linked risks must be evaluated and inside accepted appetite (score <= 9) before closing'; end if;
    update aureka_risk.mitigation_plans set status='closed',updated_at=now() where id=p_plan_id;
    update aureka_risk.risk_register rr set risk_status='closed',updated_at=now()
    where exists(select 1 from aureka_risk.mitigation_plan_risks mpr where mpr.plan_id=p_plan_id and mpr.risk_id=rr.id);
  else
    raise exception 'FORBIDDEN_OR_INVALID: status transition is not permitted';
  end if;
  insert into aureka_risk.risk_audit_log(entity_type,entity_id,action,actor_user_id,details)
  values('mitigation_plan',p_plan_id,'STATUS_CHANGED',(select auth.uid()),jsonb_build_object('from',v_plan.status,'to',p_next_status));
  return true;
end;
$function$;

create or replace function aureka_risk.risk_touch_updated_at()
returns trigger
language plpgsql
set search_path = aureka_risk, public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
drop trigger if exists mitigation_plans_touch on aureka_risk.mitigation_plans;
create trigger mitigation_plans_touch before update on aureka_risk.mitigation_plans for each row execute function aureka_risk.risk_touch_updated_at();

alter table aureka_risk.risk_matrix_reference enable row level security;
alter table aureka_risk.risk_register enable row level security;
alter table aureka_risk.risk_fmea enable row level security;
alter table aureka_risk.risk_links enable row level security;
alter table aureka_risk.mitigation_plans enable row level security;
alter table aureka_risk.mitigation_plan_risks enable row level security;
alter table aureka_risk.risk_plan_approvals enable row level security;
alter table aureka_risk.risk_audit_log enable row level security;

grant usage on schema aureka_risk to authenticated;
grant select on aureka_risk.risk_matrix_reference to authenticated;
grant select,insert,update on aureka_risk.risk_register to authenticated;
grant select,insert,update on aureka_risk.risk_fmea to authenticated;
grant select,insert,delete on aureka_risk.risk_links to authenticated;
grant select on aureka_risk.mitigation_plans to authenticated;
grant select on aureka_risk.mitigation_plan_risks to authenticated;
grant select on aureka_risk.risk_plan_approvals to authenticated;
grant select on aureka_risk.risk_audit_log to authenticated;

drop policy if exists risk_matrix_reference_read on aureka_risk.risk_matrix_reference;
create policy risk_matrix_reference_read on aureka_risk.risk_matrix_reference for select to authenticated using (true);

drop policy if exists risk_register_read on aureka_risk.risk_register;
create policy risk_register_read on aureka_risk.risk_register for select to authenticated using (aureka_risk.can_access_risk(id));
drop policy if exists risk_register_insert on aureka_risk.risk_register;
create policy risk_register_insert on aureka_risk.risk_register for insert to authenticated with check (created_by=(select auth.uid()) and aureka_risk.can_edit_risk(unit_id,created_by));
drop policy if exists risk_register_update on aureka_risk.risk_register;
create policy risk_register_update on aureka_risk.risk_register for update to authenticated using (aureka_risk.can_edit_risk(unit_id,created_by)) with check (aureka_risk.can_edit_risk(unit_id,created_by));

drop policy if exists risk_fmea_read on aureka_risk.risk_fmea;
create policy risk_fmea_read on aureka_risk.risk_fmea for select to authenticated using (aureka_risk.can_access_risk(risk_id));
drop policy if exists risk_fmea_insert on aureka_risk.risk_fmea;
create policy risk_fmea_insert on aureka_risk.risk_fmea for insert to authenticated with check (created_by=(select auth.uid()) and aureka_risk.can_edit_risk_id(risk_id));
drop policy if exists risk_fmea_update on aureka_risk.risk_fmea;
create policy risk_fmea_update on aureka_risk.risk_fmea for update to authenticated using (aureka_risk.can_edit_risk_id(risk_id)) with check (aureka_risk.can_edit_risk_id(risk_id));

drop policy if exists risk_links_read on aureka_risk.risk_links;
create policy risk_links_read on aureka_risk.risk_links for select to authenticated using (aureka_risk.can_access_risk(risk_a_id) and aureka_risk.can_access_risk(risk_b_id));
drop policy if exists risk_links_insert on aureka_risk.risk_links;
create policy risk_links_insert on aureka_risk.risk_links for insert to authenticated with check (created_by=(select auth.uid()) and aureka_risk.can_edit_risk_id(risk_a_id) and aureka_risk.can_edit_risk_id(risk_b_id));
drop policy if exists risk_links_delete on aureka_risk.risk_links;
create policy risk_links_delete on aureka_risk.risk_links for delete to authenticated using (aureka_risk.current_role_code() in ('ADMIN','PMKP','MANAGEMENT'));

drop policy if exists mitigation_plans_read on aureka_risk.mitigation_plans;
create policy mitigation_plans_read on aureka_risk.mitigation_plans for select to authenticated using (aureka_risk.can_access_plan(id));
drop policy if exists mitigation_plan_risks_read on aureka_risk.mitigation_plan_risks;
create policy mitigation_plan_risks_read on aureka_risk.mitigation_plan_risks for select to authenticated using (aureka_risk.can_access_plan(plan_id));
drop policy if exists risk_plan_approvals_read on aureka_risk.risk_plan_approvals;
create policy risk_plan_approvals_read on aureka_risk.risk_plan_approvals for select to authenticated using (aureka_risk.can_access_plan(plan_id));
drop policy if exists risk_audit_log_read on aureka_risk.risk_audit_log;
create policy risk_audit_log_read on aureka_risk.risk_audit_log for select to authenticated using (aureka_risk.current_role_code() in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'));

revoke all on function aureka_risk.current_role_code() from public,anon;
revoke all on function aureka_risk.can_read_all_risks() from public,anon;
revoke all on function aureka_risk.can_edit_risk(bigint,uuid) from public,anon;
revoke all on function aureka_risk.can_access_risk(uuid) from public,anon;
revoke all on function aureka_risk.can_edit_risk_id(uuid) from public,anon;
revoke all on function aureka_risk.can_access_plan(uuid) from public,anon;
revoke all on function aureka_risk.create_mitigation_plan(text,text,text,text,text,date,integer,integer,uuid[]) from public,anon;
revoke all on function aureka_risk.submit_mitigation_plan(uuid) from public,anon;
revoke all on function aureka_risk.review_mitigation_plan(uuid,text,text,text) from public,anon;
revoke all on function aureka_risk.advance_mitigation_plan(uuid,text) from public,anon;
grant execute on function aureka_risk.current_role_code() to authenticated;
grant execute on function aureka_risk.can_read_all_risks() to authenticated;
grant execute on function aureka_risk.can_edit_risk(bigint,uuid) to authenticated;
grant execute on function aureka_risk.can_access_risk(uuid) to authenticated;
grant execute on function aureka_risk.can_edit_risk_id(uuid) to authenticated;
grant execute on function aureka_risk.can_access_plan(uuid) to authenticated;
grant execute on function aureka_risk.create_mitigation_plan(text,text,text,text,text,date,integer,integer,uuid[]) to authenticated;
grant execute on function aureka_risk.submit_mitigation_plan(uuid) to authenticated;
grant execute on function aureka_risk.review_mitigation_plan(uuid,text,text,text) to authenticated;
grant execute on function aureka_risk.advance_mitigation_plan(uuid,text) to authenticated;

revoke all on function aureka_risk.audit_entity_change() from public,anon,authenticated;
revoke all on function aureka_risk.recalculate_risk_scores() from public,anon,authenticated;
revoke all on function aureka_risk.recalculate_fmea_scores() from public,anon,authenticated;
revoke all on function aureka_risk.risk_touch_updated_at() from public,anon,authenticated;
