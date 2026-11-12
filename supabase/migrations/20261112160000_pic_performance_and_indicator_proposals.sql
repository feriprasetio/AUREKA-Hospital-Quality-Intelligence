-- AUREKA: monitoring kinerja PIC dan workflow usulan indikator mutu.
-- Additive migration. Tidak mengubah tabel logbook, profil indikator, atau assignment yang sudah ada.
begin;

-- Permission khusus monitoring PIC (terpisah dari akses sensitif OPPE/FPPE).
insert into aureka_governance.permissions(code, label, sensitive)
values ('hr.read.pic_performance', 'Melihat monitoring aktivitas PIC', false)
on conflict (code) do update set label = excluded.label, sensitive = excluded.sensitive;

insert into aureka_governance.role_permissions(role_code, permission, granted)
values
  ('ADMIN','hr.read.pic_performance',true),
  ('PMKP','hr.read.pic_performance',true),
  ('MANAGEMENT','hr.read.pic_performance',true),
  ('KABID','hr.read.pic_performance',true),
  ('PIC','hr.read.pic_performance',true)
on conflict (role_code, permission) do nothing;

-- Monitoring hanya menghitung catatan logbook yang benar-benar dibuat oleh akun PIC.
-- PIC hanya melihat dirinya sendiri; role pengawas melihat daftar sesuai permission.
create or replace function public.aureka_pic_performance_dashboard(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = aureka_governance, aureka_quality, aureka_system, public, auth
as $$
declare v record; v_days integer := least(greatest(coalesce(p_days,30),1),365);
begin
  select * into v from aureka_governance.me();
  if v.role_code is null or not public.aureka_has_permission('hr.read.pic_performance') then
    raise exception 'Anda tidak memiliki hak untuk melihat monitoring kinerja PIC.';
  end if;

  return jsonb_build_object(
    'role', v.role_code,
    'window_days', v_days,
    'generated_at', now(),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.room_name, x.pic_name)
      from (
        select
          up.user_id,
          up.full_name as pic_name,
          up.email,
          sta.room_id,
          mr.name as room_name,
          stats.records_total,
          stats.records_window,
          stats.records_draft,
          stats.records_ready,
          stats.last_created_at,
          stats.last_record_date,
          stats.last_status
        from (
          select distinct sta2.assigned_user_id, sta2.room_id
          from aureka_quality.staff_team_assignments sta2
          where sta2.assignment_status = 'active' and sta2.is_locked = true
        ) active_pic
        join aureka_system.user_profiles up on up.user_id = active_pic.assigned_user_id and up.is_active = true
        join public.master_rooms mr on mr.id = active_pic.room_id
        left join lateral (
          select
            count(*)::integer as records_total,
            count(*) filter (where qr.created_at >= now() - make_interval(days => v_days))::integer as records_window,
            count(*) filter (where qr.status = 'draft')::integer as records_draft,
            count(*) filter (where qr.status = 'ready')::integer as records_ready,
            count(*) filter (where qr.status = 'validated')::integer as records_validated,
            count(*) filter (where qr.status = 'archived')::integer as records_archived,
            max(qr.created_at) as last_created_at,
            (array_agg(qr.record_date order by qr.created_at desc))[1] as last_record_date,
            (array_agg(qr.status order by qr.created_at desc))[1] as last_status
          from aureka_quality.quality_records qr
          where qr.entered_by = active_pic.assigned_user_id and qr.room_id = active_pic.room_id
        ) stats on true
        where (v.role_code <> 'PIC' or active_pic.assigned_user_id = auth.uid())
          and v.role_code in ('ADMIN','PMKP','MANAGEMENT','KABID','PIC')
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Usulan indikator: semua keputusan dan perubahan status memiliki jejak append-only.
create table if not exists aureka_governance.indicator_proposals (
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.master_rooms(id) on delete restrict,
  profile_year integer not null check (profile_year between 2024 and 2200),
  proposed_code text check (proposed_code is null or length(trim(proposed_code)) <= 40),
  title text not null check (length(trim(title)) >= 5),
  indicator_type text not null,
  category text not null default '',
  rationale text not null check (length(trim(rationale)) >= 20),
  unit_of_measure text not null,
  target_text text not null default '',
  target_operator text not null default '>=' check (target_operator in ('>=','<=','=','>','<')),
  target_value numeric,
  numerator_definition text not null,
  denominator_definition text not null,
  measurement_grain text not null check (measurement_grain in ('patient_episode','provider_day','daily_metric','event','activity','aggregate')),
  indicator_direction text not null check (indicator_direction in ('positive','negative')),
  measurement_type text not null check (measurement_type in ('ratio','compliance','visit','door','minutes','numeric','occurrence')),
  status text not null default 'diajukan' check (status in ('diajukan','perlu_revisi','disetujui','ditolak','aktif')),
  submitted_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  submitter_name text not null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewer_name text,
  review_note text not null default '',
  reviewed_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  activated_profile_id uuid references aureka_quality.indicator_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists indicator_proposals_room_status_idx
  on aureka_governance.indicator_proposals(room_id, status, submitted_at desc);
create index if not exists indicator_proposals_submitter_idx
  on aureka_governance.indicator_proposals(submitted_by, submitted_at desc);
alter table aureka_governance.indicator_proposals enable row level security;

create table if not exists aureka_governance.indicator_proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references aureka_governance.indicator_proposals(id) on delete restrict,
  event_type text not null check (event_type in ('diajukan','diperbarui','disetujui','perlu_revisi','ditolak','diaktifkan')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_role text,
  note text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists indicator_proposal_events_proposal_idx
  on aureka_governance.indicator_proposal_events(proposal_id, created_at desc);
alter table aureka_governance.indicator_proposal_events enable row level security;

create or replace function aureka_governance.log_indicator_proposal_event(
  p_id uuid, p_event text, p_note text default '', p_detail jsonb default '{}'::jsonb
) returns void language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  insert into aureka_governance.indicator_proposal_events
    (proposal_id,event_type,actor_user_id,actor_name,actor_role,note,detail)
  values (p_id,p_event,auth.uid(),v.full_name,v.role_code,coalesce(p_note,''),coalesce(p_detail,'{}'::jsonb));
  perform aureka_governance.write_audit(p_event,'indicator_proposal',p_id::text,
    jsonb_build_object('note',coalesce(p_note,'')) || coalesce(p_detail,'{}'::jsonb));
end;
$$;

create or replace function public.aureka_gov_indicator_proposal_list()
returns jsonb language plpgsql stable security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  if v.role_code not in ('ADMIN','PMKP','MANAGEMENT','KABID','PIC') then
    raise exception 'Role akun tidak diizinkan membuka usulan indikator.';
  end if;
  return jsonb_build_object(
    'role',v.role_code,
    'can_review',v.role_code in ('ADMIN','PMKP'),
    'can_activate',v.role_code in ('ADMIN','PMKP'),
    'rows',coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('room_name',mr.name) order by p.submitted_at desc)
      from aureka_governance.indicator_proposals p
      join public.master_rooms mr on mr.id=p.room_id
      where v.role_code in ('ADMIN','PMKP','MANAGEMENT')
         or (v.role_code='KABID' and p.room_id=v.room_id)
         or (v.role_code='PIC' and p.submitted_by=auth.uid())
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.aureka_gov_indicator_proposal_save(p jsonb)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_quality, aureka_system, public, auth as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; v_room bigint; v_year integer;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP','PIC') then
    raise exception 'Pengajuan indikator hanya dapat dilakukan PIC, Komite PMKP, atau Super Admin.';
  end if;
  if length(trim(coalesce(p->>'title',''))) < 5 or length(trim(coalesce(p->>'rationale',''))) < 20
     or length(trim(coalesce(p->>'numerator_definition',''))) < 5
     or length(trim(coalesce(p->>'denominator_definition',''))) < 5
     or length(trim(coalesce(p->>'unit_of_measure',''))) < 1 then
    raise exception 'Nama, justifikasi, satuan, definisi numerator, dan denominator wajib lengkap.';
  end if;
  if coalesce(p->>'room_id','') !~ '^[0-9]+$' or coalesce(p->>'profile_year','') !~ '^[0-9]{4}$' then
    raise exception 'Unit dan tahun indikator wajib dipilih dengan benar.';
  end if;
  v_room := (p->>'room_id')::bigint;
  v_year := (p->>'profile_year')::integer;
  if not aureka_system.has_quality_room_access(v_room) then
    raise exception 'Akses ke unit yang dipilih tidak tersedia.';
  end if;
  if v.role_code='PIC' and v_room is distinct from v.room_id then
    raise exception 'PIC hanya dapat mengajukan indikator untuk unit penugasannya sendiri.';
  end if;
  if coalesce(p->>'target_operator','>=') not in ('>=','<=','=','>','<')
     or coalesce(p->>'measurement_grain','') not in ('patient_episode','provider_day','daily_metric','event','activity','aggregate')
     or coalesce(p->>'indicator_direction','') not in ('positive','negative')
     or coalesce(p->>'measurement_type','') not in ('ratio','compliance','visit','door','minutes','numeric','occurrence') then
    raise exception 'Metode pengukuran atau arah indikator tidak valid.';
  end if;

  if v_id is null then
    insert into aureka_governance.indicator_proposals(
      room_id,profile_year,proposed_code,title,indicator_type,category,rationale,unit_of_measure,
      target_text,target_operator,target_value,numerator_definition,denominator_definition,
      measurement_grain,indicator_direction,measurement_type,submitter_name
    ) values (
      v_room,v_year,nullif(trim(p->>'proposed_code'),''),trim(p->>'title'),coalesce(nullif(p->>'indicator_type',''),'IMP-Unit'),
      coalesce(p->>'category',''),trim(p->>'rationale'),trim(p->>'unit_of_measure'),coalesce(p->>'target_text',''),
      coalesce(nullif(p->>'target_operator',''),'='),nullif(p->>'target_value','')::numeric,
      trim(p->>'numerator_definition'),trim(p->>'denominator_definition'),p->>'measurement_grain',
      p->>'indicator_direction',p->>'measurement_type',v.full_name
    ) returning id into v_id;
    perform aureka_governance.log_indicator_proposal_event(v_id,'diajukan','Usulan indikator diajukan untuk telaah Komite PMKP.',jsonb_build_object('room_id',v_room,'profile_year',v_year));
  else
    update aureka_governance.indicator_proposals
       set proposed_code=nullif(trim(p->>'proposed_code'),''),title=trim(p->>'title'),indicator_type=coalesce(nullif(p->>'indicator_type',''),'IMP-Unit'),
           category=coalesce(p->>'category',''),rationale=trim(p->>'rationale'),unit_of_measure=trim(p->>'unit_of_measure'),
           target_text=coalesce(p->>'target_text',''),target_operator=coalesce(nullif(p->>'target_operator',''),'='),
           target_value=nullif(p->>'target_value','')::numeric,numerator_definition=trim(p->>'numerator_definition'),
           denominator_definition=trim(p->>'denominator_definition'),measurement_grain=p->>'measurement_grain',
           indicator_direction=p->>'indicator_direction',measurement_type=p->>'measurement_type',
           profile_year=v_year,status='diajukan',review_note='',reviewed_by=null,reviewer_name=null,reviewed_at=null,updated_at=now()
     where id=v_id and submitted_by=auth.uid() and status='perlu_revisi' and room_id=v_room;
    if not found then raise exception 'Usulan tidak dapat diubah. Hanya usulan milik Anda yang dikembalikan untuk revisi yang dapat diajukan ulang.'; end if;
    perform aureka_governance.log_indicator_proposal_event(v_id,'diperbarui','Usulan direvisi dan diajukan ulang.',jsonb_build_object('room_id',v_room,'profile_year',v_year));
  end if;
  return v_id;
end;
$$;

create or replace function public.aureka_gov_indicator_proposal_review(p_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; p aureka_governance.indicator_proposals%rowtype; v_status text; v_event text;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then raise exception 'Telaah usulan indikator hanya oleh Komite PMKP/Super Admin.'; end if;
  if p_decision not in ('setujui','revisi','tolak') then raise exception 'Keputusan telaah tidak valid.'; end if;
  if p_decision in ('revisi','tolak') and length(trim(coalesce(p_note,''))) < 10 then
    raise exception 'Alasan revisi atau penolakan minimal 10 karakter.';
  end if;
  select * into p from aureka_governance.indicator_proposals where id=p_id for update;
  if not found or p.status not in ('diajukan','perlu_revisi') then raise exception 'Usulan tidak berada pada tahap telaah.'; end if;
  if p.submitted_by=auth.uid() then raise exception 'Pemisahan tugas: pengusul tidak boleh menelaah usulannya sendiri.'; end if;
  v_status := case p_decision when 'setujui' then 'disetujui' when 'revisi' then 'perlu_revisi' else 'ditolak' end;
  v_event := case p_decision when 'setujui' then 'disetujui' when 'revisi' then 'perlu_revisi' else 'ditolak' end;
  update aureka_governance.indicator_proposals set status=v_status,reviewed_by=auth.uid(),reviewer_name=v.full_name,
    review_note=coalesce(p_note,''),reviewed_at=now(),updated_at=now() where id=p_id;
  perform aureka_governance.log_indicator_proposal_event(p_id,v_event,coalesce(p_note,'Telaah Komite PMKP.'),jsonb_build_object('decision',p_decision));
end;
$$;


create or replace function public.aureka_gov_indicator_proposal_activate(p_id uuid,p_code text)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_quality, aureka_system, public, auth as $$
declare
  v record;
  p aureka_governance.indicator_proposals%rowtype;
  v_profile_id uuid;
  v_unit text;
  v_code text;
  v_version integer;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then
    raise exception 'Aktivasi katalog hanya oleh Komite PMKP/Super Admin.';
  end if;

  select * into p
  from aureka_governance.indicator_proposals
  where id=p_id
  for update;

  if not found or p.status <> 'disetujui' then
    raise exception 'Hanya usulan yang telah disetujui yang dapat diaktifkan.';
  end if;

  v_code := trim(coalesce(p_code,''));
  if length(v_code) < 1 or length(v_code) > 40
     or left(v_code,1) !~ '^[A-Za-z0-9]'
     or v_code ~ '[^A-Za-z0-9._-]' then
    raise exception 'Kode indikator final wajib 1–40 karakter dan hanya boleh memuat huruf, angka, titik, garis bawah, atau tanda hubung.';
  end if;

  -- Katalog memiliki unique active published key pada (profile_year, code), lintas unit.
  -- Advisory lock mencegah dua aktivasi bersamaan memilih kode dan versi yang sama.
  perform pg_advisory_xact_lock(hashtext(p.profile_year::text || ':' || lower(v_code)));

  if exists (
    select 1
    from aureka_quality.indicator_profiles ip
    where ip.profile_year=p.profile_year
      and lower(ip.code)=lower(v_code)
      and ip.is_active=true
      and ip.status='published'
  ) then
    raise exception 'Kode indikator sudah aktif pada katalog tahun tersebut. Gunakan kode lain.';
  end if;

  select coalesce(max(ip.version),0)+1
    into v_version
  from aureka_quality.indicator_profiles ip
  where ip.profile_year=p.profile_year
    and lower(ip.code)=lower(v_code);

  select name into v_unit
  from public.master_rooms
  where id=p.room_id;

  if v_unit is null then
    raise exception 'Unit pemilik indikator tidak ditemukan atau sudah tidak aktif.';
  end if;

  insert into aureka_quality.indicator_profiles(
    profile_year,code,room_id,unit_name,title,indicator_type,category,unit_of_measure,
    target_text,target_operator,target_value,numerator_definition,denominator_definition,
    measurement_grain,schema_json,options_json,version,status,is_active,created_by,updated_by
  ) values (
    p.profile_year,v_code,p.room_id,v_unit,p.title,p.indicator_type,nullif(p.category,''),p.unit_of_measure,
    nullif(p.target_text,''),p.target_operator,p.target_value,p.numerator_definition,p.denominator_definition,
    p.measurement_grain,
    jsonb_build_object('indicator_direction',p.indicator_direction,'measurement_type',p.measurement_type),
    '[]'::jsonb,v_version,'published',true,auth.uid(),auth.uid()
  ) returning id into v_profile_id;

  update aureka_governance.indicator_proposals
  set status='aktif',activated_by=auth.uid(),activated_at=now(),
      activated_profile_id=v_profile_id,updated_at=now()
  where id=p_id;

  perform aureka_governance.log_indicator_proposal_event(
    p_id,'diaktifkan','Profil indikator baru berhasil diaktifkan ke katalog mutu.',
    jsonb_build_object('profile_id',v_profile_id,'code',v_code,'version',v_version)
  );
  return v_profile_id;
end;
$$;

-- Audit event bersifat append-only.
create or replace function aureka_governance.indicator_proposal_event_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Riwayat usulan indikator bersifat append-only.';
end;
$$;

drop trigger if exists indicator_proposal_events_no_mutation on aureka_governance.indicator_proposal_events;
create trigger indicator_proposal_events_no_mutation
before update or delete on aureka_governance.indicator_proposal_events
for each row execute function aureka_governance.indicator_proposal_event_immutable();

revoke all on function public.aureka_pic_performance_dashboard(integer) from public,anon;
revoke all on function public.aureka_gov_indicator_proposal_list() from public,anon;
revoke all on function public.aureka_gov_indicator_proposal_save(jsonb) from public,anon;
revoke all on function public.aureka_gov_indicator_proposal_review(uuid,text,text) from public,anon;
revoke all on function public.aureka_gov_indicator_proposal_activate(uuid,text) from public,anon;
grant execute on function public.aureka_pic_performance_dashboard(integer) to authenticated;
grant execute on function public.aureka_gov_indicator_proposal_list() to authenticated;
grant execute on function public.aureka_gov_indicator_proposal_save(jsonb) to authenticated;
grant execute on function public.aureka_gov_indicator_proposal_review(uuid,text,text) to authenticated;
grant execute on function public.aureka_gov_indicator_proposal_activate(uuid,text) to authenticated;

commit;
