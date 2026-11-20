begin;

-- Additive AUREKA backend completion: existing clinical and quality data are retained.
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema aureka_quality, aureka_system, extensions to authenticated;

-- Server-side role gates use protected user_profiles / app role data.
create or replace function aureka_system.can_read_realcost()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','VALIDATOR']::text[]); $$;

create or replace function aureka_system.can_write_realcost()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID']::text[]); $$;

create or replace function aureka_system.can_manage_pmkp_workspace()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT']::text[]); $$;

create or replace function aureka_system.can_manage_education()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID']::text[]); $$;

create or replace function aureka_system.can_manage_controlled_documents()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP']::text[]); $$;

create or replace function aureka_system.can_approve_documents()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[]); $$;

create or replace function aureka_system.can_manage_assets()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and aureka_system.current_role_code() = any(array['ADMIN','MANAGEMENT','KABID']::text[]); $$;

create or replace function aureka_system.can_access_room_or_global(p_room_id bigint)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select auth.uid() is not null and (
    (p_room_id is not null and aureka_system.has_quality_room_access(p_room_id))
    or (p_room_id is null and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[]))
  );
$$;

-- Canonical patient UUID and explicit, auditable cross-domain links.
alter table aureka_quality.patient_index add column if not exists patient_id uuid default gen_random_uuid();
update aureka_quality.patient_index set patient_id = gen_random_uuid() where patient_id is null;
alter table aureka_quality.patient_index alter column patient_id set not null;
create unique index if not exists patient_index_patient_id_uidx on aureka_quality.patient_index(patient_id);

alter table aureka_quality.quality_records
  add column if not exists patient_index_id uuid references aureka_quality.patient_index(patient_id) on update cascade on delete set null;
alter table aureka_quality.clinical_pathway_audits
  add column if not exists patient_index_id uuid references aureka_quality.patient_index(patient_id) on update cascade on delete set null;
alter table aureka_quality.clinical_death_audits
  add column if not exists patient_index_id uuid references aureka_quality.patient_index(patient_id) on update cascade on delete set null;
alter table aureka_patient_safety.incidents
  add column if not exists patient_index_id uuid references aureka_quality.patient_index(patient_id) on update cascade on delete set null;
alter table aureka_patient_safety.incidents
  add column if not exists room_id bigint references public.master_rooms(id) on update cascade on delete restrict;

create index if not exists quality_records_patient_index_idx on aureka_quality.quality_records(patient_index_id, record_date desc) where patient_index_id is not null;
create index if not exists pathway_audits_patient_index_idx on aureka_quality.clinical_pathway_audits(patient_index_id, created_at desc) where patient_index_id is not null;
create index if not exists death_audits_patient_index_idx on aureka_quality.clinical_death_audits(patient_index_id, created_at desc) where patient_index_id is not null;
create index if not exists incidents_patient_index_room_idx on aureka_patient_safety.incidents(patient_index_id, room_id, incident_date desc) where patient_index_id is not null;

-- Backfill only on exact normalized medical-record-number matches; never match on names or similarity.
update aureka_quality.quality_records q
set patient_index_id = p.patient_id
from aureka_quality.patient_index p
where q.patient_index_id is null
  and q.measurement_grain = 'patient_episode'
  and q.archived_at is null
  and aureka_quality.normalize_no_rm(coalesce(
    q.core_data->>'medical_record_no',
    coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis',
    coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM'
  )) = p.no_rm;

update aureka_quality.clinical_pathway_audits c
set patient_index_id = p.patient_id
from aureka_quality.patient_index p
where c.patient_index_id is null
  and nullif(trim(c.medical_record_no), '') is not null
  and aureka_quality.normalize_no_rm(c.medical_record_no) = p.no_rm;

update aureka_quality.clinical_death_audits d
set patient_index_id = q.patient_index_id
from aureka_quality.quality_records q
where d.patient_index_id is null and d.source_record_id = q.id and q.patient_index_id is not null;

create or replace function aureka_quality.link_quality_record_patient()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_rm text;
begin
  if new.measurement_grain <> 'patient_episode' or new.archived_at is not null then return new; end if;
  v_rm := aureka_quality.normalize_no_rm(coalesce(
    new.core_data->>'medical_record_no',
    coalesce(new.core_data->'form_fields', new.core_data->'form_data')->>'No. Rekam Medis',
    coalesce(new.core_data->'form_fields', new.core_data->'form_data')->>'No. RM'
  ));
  if v_rm is not null then
    update aureka_quality.quality_records q set patient_index_id = p.patient_id
    from aureka_quality.patient_index p where q.id = new.id and p.no_rm = v_rm;
  end if;
  return new;
end;
$$;
revoke all on function aureka_quality.link_quality_record_patient() from public, anon, authenticated;
drop trigger if exists zz_link_quality_record_patient on aureka_quality.quality_records;
create trigger zz_link_quality_record_patient after insert or update of core_data, measurement_grain, archived_at
on aureka_quality.quality_records for each row execute function aureka_quality.link_quality_record_patient();

create table if not exists aureka_quality.patient_record_access_audit (
  id uuid primary key default gen_random_uuid(),
  patient_index_id uuid not null references aureka_quality.patient_index(patient_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  purpose text not null check (length(trim(purpose)) between 8 and 500),
  accessed_at timestamptz not null default now()
);
create index if not exists patient_record_access_audit_patient_time_idx on aureka_quality.patient_record_access_audit(patient_index_id, accessed_at desc);
alter table aureka_quality.patient_record_access_audit enable row level security;
grant select, insert on aureka_quality.patient_record_access_audit to authenticated;
revoke update, delete on aureka_quality.patient_record_access_audit from authenticated;
drop policy if exists patient_record_access_audit_select_governed on aureka_quality.patient_record_access_audit;
create policy patient_record_access_audit_select_governed on aureka_quality.patient_record_access_audit
for select to authenticated using (aureka_system.current_role_code() = any(array['ADMIN','PMKP']::text[]));
drop policy if exists patient_record_access_audit_insert_self on aureka_quality.patient_record_access_audit;
create policy patient_record_access_audit_insert_self on aureka_quality.patient_record_access_audit
for insert to authenticated with check (user_id = (select auth.uid()));

-- REALCOST audit domain.
create table if not exists aureka_quality.realcost_import_batches (
  id uuid primary key default gen_random_uuid(),
  room_id bigint references public.master_rooms(id) on delete restrict,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  source_filename text not null,
  source_bucket text not null default 'aureka-quality-source-workbooks',
  source_object_path text not null,
  source_sha256 text,
  mapping_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  status text not null default 'uploaded' check (status in ('uploaded','validated','importing','imported','failed','archived')),
  row_count integer not null default 0 check (row_count >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_quality.realcost_audits (
  id uuid primary key default gen_random_uuid(),
  audit_code text not null unique default ('RC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  import_batch_id uuid references aureka_quality.realcost_import_batches(id) on delete set null,
  room_id bigint not null references public.master_rooms(id) on delete restrict,
  patient_index_id uuid references aureka_quality.patient_index(patient_id) on delete set null,
  encounter_ref text,
  service_date date,
  discharge_date date,
  payer_type text not null default 'Belum diklasifikasikan',
  cost_center text not null default '',
  case_mix_group text,
  icd10_code text,
  primary_diagnosis text,
  claim_amount numeric(18,2) not null default 0 check (claim_amount >= 0),
  total_revenue numeric(18,2) not null default 0 check (total_revenue >= 0),
  total_cost numeric(18,2) not null default 0 check (total_cost >= 0),
  cost_variance numeric(18,2) generated always as (total_revenue - total_cost) stored,
  cost_to_revenue_ratio numeric(10,4) generated always as (case when total_revenue > 0 then total_cost / total_revenue else null end) stored,
  analysis_json jsonb not null default '{}'::jsonb,
  source_row jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','validated','reviewed','closed','archived')),
  review_note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, encounter_ref) deferrable initially immediate
);
create table if not exists aureka_quality.realcost_cost_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references aureka_quality.realcost_audits(id) on delete cascade,
  cost_category text not null check (cost_category in ('SDM','OBAT','BMHP','LABORATORIUM','RADIOLOGI','KAMAR_OPERASI','AKOMODASI','ALAT_MEDIS','OVERHEAD','LAINNYA')),
  item_code text,
  item_name text not null,
  quantity numeric(16,4) not null default 1 check (quantity >= 0),
  unit_name text not null default 'unit',
  unit_cost numeric(18,2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(18,2) generated always as (round(quantity * unit_cost,2)) stored,
  source_reference text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists aureka_quality.realcost_revenue_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references aureka_quality.realcost_audits(id) on delete cascade,
  revenue_category text not null,
  item_name text not null,
  quantity numeric(16,4) not null default 1 check (quantity >= 0),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  total_revenue numeric(18,2) generated always as (round(quantity * unit_price,2)) stored,
  source_reference text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists realcost_audits_room_date_idx on aureka_quality.realcost_audits(room_id, service_date desc);
create index if not exists realcost_audits_patient_idx on aureka_quality.realcost_audits(patient_index_id, service_date desc) where patient_index_id is not null;
create index if not exists realcost_audits_case_mix_idx on aureka_quality.realcost_audits(case_mix_group) where case_mix_group is not null;
create index if not exists realcost_cost_items_audit_idx on aureka_quality.realcost_cost_items(audit_id, cost_category);
create index if not exists realcost_revenue_items_audit_idx on aureka_quality.realcost_revenue_items(audit_id, revenue_category);

create or replace view aureka_quality.v_realcost_case_summary with (security_invoker = true) as
select a.id, a.audit_code, a.room_id, mr.name as unit_name, a.patient_index_id, a.encounter_ref,
       a.service_date, extract(year from a.service_date)::integer as fiscal_year,
       a.payer_type, a.cost_center, a.case_mix_group, a.icd10_code, a.primary_diagnosis,
       a.claim_amount, a.total_revenue, a.total_cost, a.cost_variance, a.cost_to_revenue_ratio,
       a.status, a.analysis_json
from aureka_quality.realcost_audits a join public.master_rooms mr on mr.id = a.room_id;

create or replace function aureka_quality.recalculate_realcost_case_totals()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_audit_id uuid;
begin
  if tg_op = 'DELETE' then v_audit_id := old.audit_id; else v_audit_id := new.audit_id; end if;
  update aureka_quality.realcost_audits a
  set total_cost = coalesce((select sum(i.total_cost) from aureka_quality.realcost_cost_items i where i.audit_id = v_audit_id),0),
      total_revenue = coalesce((select sum(r.total_revenue) from aureka_quality.realcost_revenue_items r where r.audit_id = v_audit_id),0),
      updated_at = now(),
      updated_by = auth.uid()
  where a.id = v_audit_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function aureka_quality.recalculate_realcost_case_totals() from public, anon, authenticated;
drop trigger if exists realcost_cost_totals_sync on aureka_quality.realcost_cost_items;
create trigger realcost_cost_totals_sync after insert or update or delete on aureka_quality.realcost_cost_items
for each row execute function aureka_quality.recalculate_realcost_case_totals();
drop trigger if exists realcost_revenue_totals_sync on aureka_quality.realcost_revenue_items;
create trigger realcost_revenue_totals_sync after insert or update or delete on aureka_quality.realcost_revenue_items
for each row execute function aureka_quality.recalculate_realcost_case_totals();

-- Secretariat: one Meeting ID binds agenda, invitations, files, attendance and minutes.
create table if not exists aureka_system.pmkp_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_code text not null unique default ('PMKP-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  title text not null,
  meeting_type text not null default 'Rapat Komite',
  meeting_date date not null,
  start_time time,
  end_time time,
  room_id bigint references public.master_rooms(id) on delete restrict,
  location text not null default '',
  organizer text not null default '',
  agenda text not null default '',
  status text not null default 'planned' check (status in ('planned','invited','in_progress','completed','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_system.pmkp_meeting_invitees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references aureka_system.pmkp_meetings(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_room_id bigint references public.master_rooms(id) on delete set null,
  invitee_name text not null default '',
  invitee_email text,
  invitee_role text,
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','delivered','failed','cancelled')),
  invitation_note text not null default '',
  sent_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (meeting_id, invited_user_id, invited_room_id, invitee_email)
);
create table if not exists aureka_system.pmkp_meeting_documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references aureka_system.pmkp_meetings(id) on delete cascade,
  document_type text not null check (document_type in ('undangan','materi','absensi','notulensi','gambar','lampiran','lainnya')),
  title text not null,
  bucket_id text not null default 'aureka-documents' check (bucket_id in ('aureka-documents','aureka-exports')),
  object_path text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  sha256 text,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique(bucket_id, object_path)
);
create table if not exists aureka_system.pmkp_meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references aureka_system.pmkp_meetings(id) on delete cascade,
  invitee_id uuid references aureka_system.pmkp_meeting_invitees(id) on delete set null,
  attendee_user_id uuid references auth.users(id) on delete set null,
  attendee_name text not null,
  attendee_room_id bigint references public.master_rooms(id) on delete set null,
  attendance_status text not null default 'hadir' check (attendance_status in ('hadir','izin','sakit','tanpa_keterangan')),
  attendance_at timestamptz not null default now(),
  verification_code text not null unique default ('ATT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id)
);
create table if not exists aureka_system.pmkp_meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references aureka_system.pmkp_meetings(id) on delete cascade,
  summary text not null default '',
  discussion_json jsonb not null default '[]'::jsonb,
  decisions_json jsonb not null default '[]'::jsonb,
  action_items_json jsonb not null default '[]'::jsonb,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_system.pmkp_meeting_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references aureka_system.pmkp_meetings(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists pmkp_meetings_date_idx on aureka_system.pmkp_meetings(meeting_date desc, status);
create index if not exists pmkp_meeting_invitees_user_idx on aureka_system.pmkp_meeting_invitees(invited_user_id, delivery_status);
create index if not exists pmkp_meeting_documents_meeting_idx on aureka_system.pmkp_meeting_documents(meeting_id, document_type);

-- Education: shared engine for IHT and student orientation.
create table if not exists aureka_system.education_events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique default ('EDU-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  event_type text not null check (event_type in ('in_house_training','orientasi_mahasiswa','pelatihan_lainnya')),
  title text not null,
  topic text not null default '',
  organizer text not null default '',
  room_id bigint references public.master_rooms(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz,
  venue text not null default '',
  instructor_json jsonb not null default '[]'::jsonb,
  learning_objectives jsonb not null default '[]'::jsonb,
  assessment_config jsonb not null default '{}'::jsonb,
  certificate_template jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','ongoing','completed','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create table if not exists aureka_system.education_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references aureka_system.education_events(id) on delete cascade,
  participant_type text not null check (participant_type in ('staff','student','external')),
  staff_id uuid references aureka_quality.staff_directory(id) on delete set null,
  source_quality_record_id uuid references aureka_quality.quality_records(id) on delete set null,
  full_name text not null,
  participant_code text not null default '',
  institution text not null default '',
  profession_or_program text not null default '',
  room_id bigint references public.master_rooms(id) on delete set null,
  email text,
  status text not null default 'registered' check (status in ('registered','confirmed','completed','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(event_id, participant_type, participant_code)
);
create table if not exists aureka_system.education_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references aureka_system.education_events(id) on delete cascade,
  participant_id uuid not null references aureka_system.education_participants(id) on delete cascade,
  session_label text not null default 'Utama',
  attendance_status text not null default 'hadir' check (attendance_status in ('hadir','izin','sakit','tanpa_keterangan')),
  attended_minutes integer not null default 0 check (attended_minutes >= 0),
  checked_at timestamptz not null default now(),
  checked_by uuid not null default auth.uid() references auth.users(id),
  unique(participant_id, session_label)
);
create table if not exists aureka_system.education_assessments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references aureka_system.education_events(id) on delete cascade,
  participant_id uuid not null references aureka_system.education_participants(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('pre_test','post_test','kompetensi','evaluasi')),
  score numeric(6,2) check (score is null or score between 0 and 100),
  passed boolean,
  result_json jsonb not null default '{}'::jsonb,
  assessed_by uuid references auth.users(id),
  assessed_at timestamptz not null default now(),
  unique(participant_id, assessment_type)
);
create table if not exists aureka_system.education_certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references aureka_system.education_events(id) on delete restrict,
  participant_id uuid not null references aureka_system.education_participants(id) on delete restrict,
  certificate_number text not null unique,
  issue_date date not null default current_date,
  credit_points numeric(8,2),
  competency_result text not null default '',
  bucket_id text not null default 'aureka-exports' check (bucket_id = 'aureka-exports'),
  object_path text,
  file_sha256 text,
  verification_code text not null unique default ('CERT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,20))),
  issued_by uuid not null default auth.uid() references auth.users(id),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  unique(event_id, participant_id)
);
create index if not exists education_events_type_start_idx on aureka_system.education_events(event_type, start_at desc);
create index if not exists education_participants_event_idx on aureka_system.education_participants(event_id, participant_type);
create index if not exists education_attendance_event_idx on aureka_system.education_attendance(event_id, attendance_status);

-- Controlled SPO/document knowledge base and vector-backed hybrid retrieval.
create table if not exists aureka_system.controlled_documents (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  title text not null,
  document_type text not null check (document_type in ('SPO','SK','pedoman','panduan','kebijakan','formulir','regulasi','legal','lainnya')),
  owner_room_id bigint references public.master_rooms(id) on delete restrict,
  description text not null default '',
  effective_date date,
  review_due_date date,
  current_version integer not null default 0 check (current_version >= 0),
  status text not null default 'draft' check (status in ('draft','under_review','approved','published','retired','rejected')),
  tags text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_system.controlled_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references aureka_system.controlled_documents(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  bucket_id text not null default 'aureka-documents' check (bucket_id = 'aureka-documents'),
  object_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  sha256 text,
  extracted_text text not null default '',
  structured_sections jsonb not null default '[]'::jsonb,
  ai_analysis jsonb not null default '{}'::jsonb,
  analysis_status text not null default 'queued' check (analysis_status in ('queued','processing','completed','failed','manual_review','not_required')),
  analysis_model text,
  analysis_error text,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique(document_id, version_no),
  unique(bucket_id, object_path)
);
create table if not exists aureka_system.knowledge_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null unique references aureka_system.controlled_document_versions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_system.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references aureka_system.controlled_documents(id) on delete cascade,
  document_version_id uuid not null references aureka_system.controlled_document_versions(id) on delete cascade,
  chunk_no integer not null check (chunk_no >= 0),
  title text not null default '',
  content text not null,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(title,'') || ' ' || coalesce(content,''))) stored,
  embedding extensions.vector(768),
  embedding_model text not null default 'gemini-embedding-2',
  metadata jsonb not null default '{}'::jsonb,
  room_id bigint references public.master_rooms(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_version_id, chunk_no)
);
create index if not exists controlled_documents_scope_status_idx on aureka_system.controlled_documents(owner_room_id, status, document_type);
create index if not exists controlled_documents_title_trgm_idx on aureka_system.controlled_documents using gin(title extensions.gin_trgm_ops);
create index if not exists controlled_versions_doc_idx on aureka_system.controlled_document_versions(document_id, version_no desc);
create index if not exists knowledge_jobs_status_available_idx on aureka_system.knowledge_ingestion_jobs(status, available_at) where status in ('queued','failed');
create index if not exists knowledge_chunks_search_gin on aureka_system.knowledge_chunks using gin(search_vector);
create index if not exists knowledge_chunks_embedding_hnsw on aureka_system.knowledge_chunks using hnsw(embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists knowledge_chunks_title_content_trgm on aureka_system.knowledge_chunks using gin((title || ' ' || content) extensions.gin_trgm_ops);

create or replace function aureka_system.enqueue_document_knowledge_ingestion()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into aureka_system.knowledge_ingestion_jobs(document_version_id) values (new.id)
  on conflict(document_version_id) do update
    set status = 'queued', attempts = 0, available_at = now(), last_error = null, updated_at = now();
  return new;
end;
$$;
revoke all on function aureka_system.enqueue_document_knowledge_ingestion() from public, anon, authenticated;
drop trigger if exists controlled_document_version_enqueue_ingestion on aureka_system.controlled_document_versions;
create trigger controlled_document_version_enqueue_ingestion after insert on aureka_system.controlled_document_versions
for each row execute function aureka_system.enqueue_document_knowledge_ingestion();

create or replace function aureka_system.search_knowledge_hybrid(
  p_query text, p_embedding extensions.vector(768) default null, p_room_id bigint default null, p_limit integer default 10
)
returns table(chunk_id uuid, document_id uuid, document_version_id uuid, document_code text,
              document_title text, chunk_no integer, content text, source_version integer, score numeric)
language sql stable security invoker set search_path = ''
as $$
with visible as (
  select k.*, d.document_code, d.title as document_title, v.version_no
  from aureka_system.knowledge_chunks k
  join aureka_system.controlled_documents d on d.id = k.document_id
  join aureka_system.controlled_document_versions v on v.id = k.document_version_id
  where d.status = 'published' and (p_room_id is null or k.room_id = p_room_id or k.room_id is null)
),
keyword as (
  select v.id, row_number() over(order by ts_rank_cd(v.search_vector, websearch_to_tsquery('simple', coalesce(p_query,''))) desc) as rank_no
  from visible v
  where nullif(trim(coalesce(p_query,'')), '') is not null
    and v.search_vector @@ websearch_to_tsquery('simple', p_query)
  order by rank_no limit greatest(1,least(coalesce(p_limit,10),30))*3
),
semantic as (
  select v.id, row_number() over(order by v.embedding OPERATOR(extensions.<=>) p_embedding) as rank_no
  from visible v where p_embedding is not null and v.embedding is not null
  order by v.embedding OPERATOR(extensions.<=>) p_embedding limit greatest(1,least(coalesce(p_limit,10),30))*3
),
fused as (
  select coalesce(k.id,s.id) as id,
         coalesce(1.0/(60+k.rank_no),0) + coalesce(1.0/(60+s.rank_no),0) as rrf_score
  from keyword k full outer join semantic s on s.id = k.id
)
select v.id, v.document_id, v.document_version_id, v.document_code, v.document_title,
       v.chunk_no, v.content, v.version_no, f.rrf_score::numeric
from fused f join visible v on v.id=f.id
order by f.rrf_score desc limit greatest(1,least(coalesce(p_limit,10),30));
$$;

-- Asset management and universal export/approval/signature metadata.
create table if not exists aureka_system.asset_register (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_name text not null,
  asset_category text not null,
  owner_room_id bigint references public.master_rooms(id) on delete restrict,
  asset_location text not null default '',
  acquisition_date date,
  acquisition_cost numeric(18,2) check (acquisition_cost is null or acquisition_cost >= 0),
  condition_status text not null default 'baik' check (condition_status in ('baik','perlu_perbaikan','rusak_ringan','rusak_berat','dihapuskan')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','maintenance','disposed','lost')),
  serial_number text,
  source_document_id uuid references aureka_system.controlled_documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists aureka_system.generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_code text not null unique default ('AUR-DOC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  artifact_type text not null,
  entity_type text not null,
  entity_id uuid,
  room_id bigint references public.master_rooms(id) on delete restrict,
  title text not null,
  bucket_id text not null default 'aureka-exports' check (bucket_id = 'aureka-exports'),
  object_path text not null unique,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9A-Fa-f]{64}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists aureka_system.document_approval_requests (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references aureka_system.generated_artifacts(id) on delete restrict,
  approval_step integer not null default 1 check (approval_step > 0),
  required_role text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','returned','cancelled')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  decision_note text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(artifact_id, approval_step)
);
create table if not exists aureka_system.document_signatures (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references aureka_system.generated_artifacts(id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  signer_display_name text not null,
  signer_role text not null,
  signature_type text not null default 'AUREKA_APPROVAL_RECORD' check (signature_type = 'AUREKA_APPROVAL_RECORD'),
  signed_file_sha256 text not null check (signed_file_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  verification_code text not null unique default ('AUR-VERIFY-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,24))),
  signed_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  unique(artifact_id, signer_user_id)
);
create table if not exists aureka_system.document_signature_events (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references aureka_system.document_signatures(id) on delete restrict,
  event_type text not null check (event_type in ('created','revoked')),
  note text not null default '',
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists asset_register_room_status_idx on aureka_system.asset_register(owner_room_id, lifecycle_status);
create index if not exists generated_artifacts_room_date_idx on aureka_system.generated_artifacts(room_id, created_at desc);
create index if not exists document_approval_requests_pending_idx on aureka_system.document_approval_requests(status, required_role);
create index if not exists document_signatures_artifact_idx on aureka_system.document_signatures(artifact_id, signed_at desc);

-- Apply RLS to each new table before giving any client access.
alter table aureka_quality.realcost_import_batches enable row level security;
alter table aureka_quality.realcost_audits enable row level security;
alter table aureka_quality.realcost_cost_items enable row level security;
alter table aureka_quality.realcost_revenue_items enable row level security;
alter table aureka_system.pmkp_meetings enable row level security;
alter table aureka_system.pmkp_meeting_invitees enable row level security;
alter table aureka_system.pmkp_meeting_documents enable row level security;
alter table aureka_system.pmkp_meeting_attendance enable row level security;
alter table aureka_system.pmkp_meeting_minutes enable row level security;
alter table aureka_system.pmkp_meeting_events enable row level security;
alter table aureka_system.education_events enable row level security;
alter table aureka_system.education_participants enable row level security;
alter table aureka_system.education_attendance enable row level security;
alter table aureka_system.education_assessments enable row level security;
alter table aureka_system.education_certificates enable row level security;
alter table aureka_system.controlled_documents enable row level security;
alter table aureka_system.controlled_document_versions enable row level security;
alter table aureka_system.knowledge_ingestion_jobs enable row level security;
alter table aureka_system.knowledge_chunks enable row level security;
alter table aureka_system.asset_register enable row level security;
alter table aureka_system.generated_artifacts enable row level security;
alter table aureka_system.document_approval_requests enable row level security;
alter table aureka_system.document_signatures enable row level security;
alter table aureka_system.document_signature_events enable row level security;

grant select, insert, update on aureka_quality.realcost_import_batches, aureka_quality.realcost_audits,
  aureka_quality.realcost_cost_items, aureka_quality.realcost_revenue_items to authenticated;
grant select, insert, update on aureka_system.pmkp_meetings, aureka_system.pmkp_meeting_invitees,
  aureka_system.pmkp_meeting_documents, aureka_system.pmkp_meeting_attendance, aureka_system.pmkp_meeting_minutes,
  aureka_system.education_events, aureka_system.education_participants, aureka_system.education_attendance,
  aureka_system.education_assessments, aureka_system.education_certificates, aureka_system.controlled_documents,
  aureka_system.controlled_document_versions, aureka_system.asset_register, aureka_system.generated_artifacts,
  aureka_system.document_approval_requests, aureka_system.document_signatures to authenticated;
grant select on aureka_system.pmkp_meeting_events, aureka_system.knowledge_ingestion_jobs,
  aureka_system.knowledge_chunks, aureka_system.document_signature_events to authenticated;
grant select on aureka_quality.v_realcost_case_summary to authenticated;
grant execute on function aureka_system.search_knowledge_hybrid(text,extensions.vector,bigint,integer) to authenticated;

-- Realcost RLS: reviewers can read; only management/PMKP roles can write.
drop policy if exists realcost_import_read on aureka_quality.realcost_import_batches;
create policy realcost_import_read on aureka_quality.realcost_import_batches for select to authenticated
using (aureka_system.can_read_realcost() and aureka_system.can_access_room_or_global(room_id));
drop policy if exists realcost_import_write on aureka_quality.realcost_import_batches;
create policy realcost_import_write on aureka_quality.realcost_import_batches for insert to authenticated
with check (aureka_system.can_write_realcost() and created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(room_id));
drop policy if exists realcost_import_update on aureka_quality.realcost_import_batches;
create policy realcost_import_update on aureka_quality.realcost_import_batches for update to authenticated
using (aureka_system.can_write_realcost() and aureka_system.can_access_room_or_global(room_id))
with check (aureka_system.can_write_realcost() and aureka_system.can_access_room_or_global(room_id));

drop policy if exists realcost_audits_read on aureka_quality.realcost_audits;
create policy realcost_audits_read on aureka_quality.realcost_audits for select to authenticated
using (aureka_system.can_read_realcost() and aureka_system.has_quality_room_access(room_id));
drop policy if exists realcost_audits_insert on aureka_quality.realcost_audits;
create policy realcost_audits_insert on aureka_quality.realcost_audits for insert to authenticated
with check (aureka_system.can_write_realcost() and created_by = (select auth.uid()) and aureka_system.has_quality_room_access(room_id));
drop policy if exists realcost_audits_update on aureka_quality.realcost_audits;
create policy realcost_audits_update on aureka_quality.realcost_audits for update to authenticated
using (aureka_system.can_write_realcost() and aureka_system.has_quality_room_access(room_id))
with check (aureka_system.can_write_realcost() and aureka_system.has_quality_room_access(room_id));

drop policy if exists realcost_cost_items_access on aureka_quality.realcost_cost_items;
create policy realcost_cost_items_access on aureka_quality.realcost_cost_items for all to authenticated
using (exists(select 1 from aureka_quality.realcost_audits a where a.id = audit_id and aureka_system.can_read_realcost() and aureka_system.has_quality_room_access(a.room_id)))
with check (exists(select 1 from aureka_quality.realcost_audits a where a.id = audit_id and aureka_system.can_write_realcost() and aureka_system.has_quality_room_access(a.room_id)));
drop policy if exists realcost_revenue_items_access on aureka_quality.realcost_revenue_items;
create policy realcost_revenue_items_access on aureka_quality.realcost_revenue_items for all to authenticated
using (exists(select 1 from aureka_quality.realcost_audits a where a.id = audit_id and aureka_system.can_read_realcost() and aureka_system.has_quality_room_access(a.room_id)))
with check (exists(select 1 from aureka_quality.realcost_audits a where a.id = audit_id and aureka_system.can_write_realcost() and aureka_system.has_quality_room_access(a.room_id)));

-- PMKP Secretariat policies. Invited users may read their own invitations.
drop policy if exists pmkp_meetings_read on aureka_system.pmkp_meetings;
create policy pmkp_meetings_read on aureka_system.pmkp_meetings for select to authenticated using (aureka_system.can_access_room_or_global(room_id));
drop policy if exists pmkp_meetings_write on aureka_system.pmkp_meetings;
create policy pmkp_meetings_write on aureka_system.pmkp_meetings for insert to authenticated
with check (aureka_system.can_manage_pmkp_workspace() and created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(room_id));
drop policy if exists pmkp_meetings_update on aureka_system.pmkp_meetings;
create policy pmkp_meetings_update on aureka_system.pmkp_meetings for update to authenticated
using (aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(room_id))
with check (aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(room_id));

drop policy if exists pmkp_invitees_read on aureka_system.pmkp_meeting_invitees;
create policy pmkp_invitees_read on aureka_system.pmkp_meeting_invitees for select to authenticated
using (invited_user_id = (select auth.uid()) or exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_invitees_write on aureka_system.pmkp_meeting_invitees;
create policy pmkp_invitees_write on aureka_system.pmkp_meeting_invitees for insert to authenticated
with check (created_by = (select auth.uid()) and exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_invitees_update on aureka_system.pmkp_meeting_invitees;
create policy pmkp_invitees_update on aureka_system.pmkp_meeting_invitees for update to authenticated
using (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)))
with check (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));

drop policy if exists pmkp_meeting_children_read on aureka_system.pmkp_meeting_documents;
create policy pmkp_meeting_children_read on aureka_system.pmkp_meeting_documents for select to authenticated
using (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_meeting_children_write on aureka_system.pmkp_meeting_documents;
create policy pmkp_meeting_children_write on aureka_system.pmkp_meeting_documents for insert to authenticated
with check (uploaded_by = (select auth.uid()) and exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_attendance_read on aureka_system.pmkp_meeting_attendance;
create policy pmkp_attendance_read on aureka_system.pmkp_meeting_attendance for select to authenticated
using (attendee_user_id = (select auth.uid()) or exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_attendance_write on aureka_system.pmkp_meeting_attendance;
create policy pmkp_attendance_write on aureka_system.pmkp_meeting_attendance for insert to authenticated
with check (created_by = (select auth.uid()) and exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and (aureka_system.can_manage_pmkp_workspace() or attendee_user_id = (select auth.uid())) and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_minutes_read on aureka_system.pmkp_meeting_minutes;
create policy pmkp_minutes_read on aureka_system.pmkp_meeting_minutes for select to authenticated
using (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_minutes_write on aureka_system.pmkp_meeting_minutes;
create policy pmkp_minutes_write on aureka_system.pmkp_meeting_minutes for insert to authenticated
with check (created_by = (select auth.uid()) and exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_minutes_update on aureka_system.pmkp_meeting_minutes;
create policy pmkp_minutes_update on aureka_system.pmkp_meeting_minutes for update to authenticated
using (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)))
with check (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_manage_pmkp_workspace() and aureka_system.can_access_room_or_global(m.room_id)));
drop policy if exists pmkp_events_read on aureka_system.pmkp_meeting_events;
create policy pmkp_events_read on aureka_system.pmkp_meeting_events for select to authenticated
using (exists(select 1 from aureka_system.pmkp_meetings m where m.id = meeting_id and aureka_system.can_access_room_or_global(m.room_id)));

-- IHT and student orientation.
drop policy if exists education_events_read on aureka_system.education_events;
create policy education_events_read on aureka_system.education_events for select to authenticated
using (status = 'published' or aureka_system.can_manage_education() or aureka_system.can_access_room_or_global(room_id));
drop policy if exists education_events_write on aureka_system.education_events;
create policy education_events_write on aureka_system.education_events for insert to authenticated
with check (aureka_system.can_manage_education() and created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(room_id));
drop policy if exists education_events_update on aureka_system.education_events;
create policy education_events_update on aureka_system.education_events for update to authenticated
using (aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(room_id))
with check (aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(room_id));

drop policy if exists education_participants_read on aureka_system.education_participants;
create policy education_participants_read on aureka_system.education_participants for select to authenticated
using (exists(select 1 from aureka_system.education_events e where e.id = event_id and (aureka_system.can_manage_education() or (e.status = 'published' and aureka_system.can_access_room_or_global(e.room_id)))));
drop policy if exists education_participants_write on aureka_system.education_participants;
create policy education_participants_write on aureka_system.education_participants for insert to authenticated
with check (created_by = (select auth.uid()) and exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(e.room_id)));
drop policy if exists education_participants_update on aureka_system.education_participants;
create policy education_participants_update on aureka_system.education_participants for update to authenticated
using (exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(e.room_id)))
with check (exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(e.room_id)));

drop policy if exists education_related_read on aureka_system.education_attendance;
create policy education_related_read on aureka_system.education_attendance for select to authenticated
using (exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_access_room_or_global(e.room_id)));
drop policy if exists education_related_write on aureka_system.education_attendance;
create policy education_related_write on aureka_system.education_attendance for insert to authenticated
with check (checked_by = (select auth.uid()) and exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(e.room_id)));
drop policy if exists education_assessments_read on aureka_system.education_assessments;
create policy education_assessments_read on aureka_system.education_assessments for select to authenticated
using (exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_access_room_or_global(e.room_id)));
drop policy if exists education_assessments_write on aureka_system.education_assessments;
create policy education_assessments_write on aureka_system.education_assessments for insert to authenticated
with check (exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_manage_education() and aureka_system.can_access_room_or_global(e.room_id)));
drop policy if exists education_certificates_read on aureka_system.education_certificates;
create policy education_certificates_read on aureka_system.education_certificates for select to authenticated
using (exists(select 1 from aureka_system.education_events e where e.id = event_id and (aureka_system.can_manage_education() or aureka_system.can_access_room_or_global(e.room_id))));
drop policy if exists education_certificates_write on aureka_system.education_certificates;
create policy education_certificates_write on aureka_system.education_certificates for insert to authenticated
with check (issued_by = (select auth.uid()) and aureka_system.can_manage_education() and exists(select 1 from aureka_system.education_events e where e.id = event_id and aureka_system.can_access_room_or_global(e.room_id)));

-- SPO / controlled-document records; original files remain in private Supabase Storage.
drop policy if exists controlled_documents_read on aureka_system.controlled_documents;
create policy controlled_documents_read on aureka_system.controlled_documents for select to authenticated
using ((status = 'published' and aureka_system.can_access_room_or_global(owner_room_id)) or aureka_system.can_manage_controlled_documents());
drop policy if exists controlled_documents_write on aureka_system.controlled_documents;
create policy controlled_documents_write on aureka_system.controlled_documents for insert to authenticated
with check (aureka_system.can_manage_controlled_documents() and created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(owner_room_id));
drop policy if exists controlled_documents_update on aureka_system.controlled_documents;
create policy controlled_documents_update on aureka_system.controlled_documents for update to authenticated
using (aureka_system.can_manage_controlled_documents() and aureka_system.can_access_room_or_global(owner_room_id))
with check (aureka_system.can_manage_controlled_documents() and aureka_system.can_access_room_or_global(owner_room_id));

drop policy if exists controlled_versions_read on aureka_system.controlled_document_versions;
create policy controlled_versions_read on aureka_system.controlled_document_versions for select to authenticated
using (exists(select 1 from aureka_system.controlled_documents d where d.id = document_id and ((d.status = 'published' and aureka_system.can_access_room_or_global(d.owner_room_id)) or aureka_system.can_manage_controlled_documents())));
drop policy if exists controlled_versions_write on aureka_system.controlled_document_versions;
create policy controlled_versions_write on aureka_system.controlled_document_versions for insert to authenticated
with check (uploaded_by = (select auth.uid()) and aureka_system.can_manage_controlled_documents() and exists(select 1 from aureka_system.controlled_documents d where d.id = document_id and aureka_system.can_access_room_or_global(d.owner_room_id)));
drop policy if exists knowledge_jobs_read_managers on aureka_system.knowledge_ingestion_jobs;
create policy knowledge_jobs_read_managers on aureka_system.knowledge_ingestion_jobs for select to authenticated
using (aureka_system.can_manage_controlled_documents());
drop policy if exists knowledge_chunks_read_published on aureka_system.knowledge_chunks;
create policy knowledge_chunks_read_published on aureka_system.knowledge_chunks for select to authenticated
using (exists(select 1 from aureka_system.controlled_documents d where d.id = document_id and d.status = 'published' and aureka_system.can_access_room_or_global(d.owner_room_id)));
drop policy if exists knowledge_chunks_write_managers on aureka_system.knowledge_chunks;
create policy knowledge_chunks_write_managers on aureka_system.knowledge_chunks for insert to authenticated
with check (aureka_system.can_manage_controlled_documents());

-- Asset management.
drop policy if exists asset_register_read on aureka_system.asset_register;
create policy asset_register_read on aureka_system.asset_register for select to authenticated
using (aureka_system.can_manage_assets() and aureka_system.can_access_room_or_global(owner_room_id));
drop policy if exists asset_register_write on aureka_system.asset_register;
create policy asset_register_write on aureka_system.asset_register for insert to authenticated
with check (aureka_system.can_manage_assets() and created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(owner_room_id));
drop policy if exists asset_register_update on aureka_system.asset_register;
create policy asset_register_update on aureka_system.asset_register for update to authenticated
using (aureka_system.can_manage_assets() and aureka_system.can_access_room_or_global(owner_room_id))
with check (aureka_system.can_manage_assets() and aureka_system.can_access_room_or_global(owner_room_id));

-- Cross-domain export and sequential approval workflow.
drop policy if exists generated_artifacts_read on aureka_system.generated_artifacts;
create policy generated_artifacts_read on aureka_system.generated_artifacts for select to authenticated
using (created_by = (select auth.uid()) or (aureka_system.can_approve_documents() and aureka_system.can_access_room_or_global(room_id)));
drop policy if exists generated_artifacts_write on aureka_system.generated_artifacts;
create policy generated_artifacts_write on aureka_system.generated_artifacts for insert to authenticated
with check (created_by = (select auth.uid()) and aureka_system.can_access_room_or_global(room_id));
drop policy if exists approvals_read on aureka_system.document_approval_requests;
create policy approvals_read on aureka_system.document_approval_requests for select to authenticated
using (assigned_user_id = (select auth.uid()) or exists(select 1 from aureka_system.generated_artifacts a where a.id = artifact_id and (a.created_by = (select auth.uid()) or aureka_system.can_approve_documents())));
drop policy if exists approvals_write on aureka_system.document_approval_requests;
create policy approvals_write on aureka_system.document_approval_requests for insert to authenticated
with check (created_by = (select auth.uid()) and aureka_system.can_approve_documents());
drop policy if exists approvals_decide on aureka_system.document_approval_requests;
create policy approvals_decide on aureka_system.document_approval_requests for update to authenticated
using (aureka_system.can_approve_documents() and (assigned_user_id is null or assigned_user_id = (select auth.uid())))
with check (aureka_system.can_approve_documents() and decided_by = (select auth.uid()));

drop policy if exists document_signatures_read on aureka_system.document_signatures;
create policy document_signatures_read on aureka_system.document_signatures for select to authenticated
using (signer_user_id = (select auth.uid()) or aureka_system.can_approve_documents());
drop policy if exists document_signatures_insert on aureka_system.document_signatures;
create policy document_signatures_insert on aureka_system.document_signatures for insert to authenticated
with check (signer_user_id = (select auth.uid()) and aureka_system.can_approve_documents());
drop policy if exists document_signature_events_read on aureka_system.document_signature_events;
create policy document_signature_events_read on aureka_system.document_signature_events for select to authenticated
using (aureka_system.can_approve_documents());

create or replace function aureka_system.guard_append_only_signature()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Catatan persetujuan tanda tangan bersifat append-only. Gunakan proses pencabutan yang diaudit.';
  end if;
  return new;
end;
$$;
revoke all on function aureka_system.guard_append_only_signature() from public, anon, authenticated;
drop trigger if exists document_signatures_append_only on aureka_system.document_signatures;
create trigger document_signatures_append_only before update or delete on aureka_system.document_signatures
for each row execute function aureka_system.guard_append_only_signature();

-- Public verification exposes only public signature metadata, never document contents or file paths.
create or replace function public.aureka_verify_artifact_signature(p_verification_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'valid', true, 'artifact_code', a.artifact_code, 'title', a.title, 'artifact_type', a.artifact_type,
    'sha256', s.signed_file_sha256, 'signer', s.signer_display_name, 'signer_role', s.signer_role,
    'signed_at', s.signed_at, 'signature_type', s.signature_type,
    'note', 'Bukti persetujuan elektronik AUREKA; bukan sertifikat tanda tangan elektronik tersertifikasi PSrE.'
  )
  from aureka_system.document_signatures s
  join aureka_system.generated_artifacts a on a.id = s.artifact_id
  where s.verification_code = trim(coalesce(p_verification_code,'')) and s.revoked_at is null;
$$;
revoke all on function public.aureka_verify_artifact_signature(text) from public, authenticated;
grant execute on function public.aureka_verify_artifact_signature(text) to anon;

-- Private Storage path: {room_id}/{entity_id}/{filename} or global/{entity_id}/{filename}.
drop policy if exists aureka_documents_select_scoped on storage.objects;
create policy aureka_documents_select_scoped on storage.objects for select to authenticated
using (bucket_id = 'aureka-documents' and (
  ((storage.foldername(name))[1] ~ '^[0-9]+$' and aureka_system.has_quality_room_access(((storage.foldername(name))[1])::bigint))
  or ((storage.foldername(name))[1] = 'global' and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[]))
));
drop policy if exists aureka_documents_insert_scoped on storage.objects;
create policy aureka_documents_insert_scoped on storage.objects for insert to authenticated
with check (bucket_id = 'aureka-documents' and (
  ((storage.foldername(name))[1] ~ '^[0-9]+$' and aureka_system.can_manage_pmkp_workspace() and aureka_system.has_quality_room_access(((storage.foldername(name))[1])::bigint))
  or ((storage.foldername(name))[1] = 'global' and aureka_system.can_manage_controlled_documents())
));
drop policy if exists aureka_documents_update_scoped on storage.objects;
create policy aureka_documents_update_scoped on storage.objects for update to authenticated
using (bucket_id = 'aureka-documents' and (
  ((storage.foldername(name))[1] ~ '^[0-9]+$' and aureka_system.can_manage_pmkp_workspace() and aureka_system.has_quality_room_access(((storage.foldername(name))[1])::bigint))
  or ((storage.foldername(name))[1] = 'global' and aureka_system.can_manage_controlled_documents())
))
with check (bucket_id = 'aureka-documents' and (
  ((storage.foldername(name))[1] ~ '^[0-9]+$' and aureka_system.can_manage_pmkp_workspace() and aureka_system.has_quality_room_access(((storage.foldername(name))[1])::bigint))
  or ((storage.foldername(name))[1] = 'global' and aureka_system.can_manage_controlled_documents())
));
drop policy if exists aureka_documents_delete_scoped on storage.objects;
create policy aureka_documents_delete_scoped on storage.objects for delete to authenticated
using (bucket_id = 'aureka-documents' and aureka_system.current_role_code() = 'ADMIN');

drop policy if exists aureka_exports_select_owner_or_manager on storage.objects;
create policy aureka_exports_select_owner_or_manager on storage.objects for select to authenticated
using (bucket_id = 'aureka-exports' and ((storage.foldername(name))[1] = (select auth.uid())::text or aureka_system.can_approve_documents()));
drop policy if exists aureka_exports_insert_owner on storage.objects;
create policy aureka_exports_insert_owner on storage.objects for insert to authenticated
with check (bucket_id = 'aureka-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists aureka_exports_delete_owner_or_admin on storage.objects;
create policy aureka_exports_delete_owner_or_admin on storage.objects for delete to authenticated
using (bucket_id = 'aureka-exports' and ((storage.foldername(name))[1] = (select auth.uid())::text or aureka_system.current_role_code() = 'ADMIN'));

-- Patient detail bundle: purpose logged; all relations require explicit patient UUID, not fuzzy identity matching.
create or replace function public.aureka_patient_detail_bundle(p_patient_id uuid, p_purpose text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_patient aureka_quality.patient_index%rowtype;
  v_rooms bigint[];
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if length(trim(coalesce(p_purpose,''))) < 8 then raise exception 'Tujuan akses klinis wajib diisi (minimal 8 karakter).' using errcode = '22023'; end if;
  if aureka_system.current_role_code() not in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC','VALIDATOR') then
    raise exception 'Role tidak memiliki kewenangan untuk melihat detail pasien.' using errcode = '42501';
  end if;

  select p.* into v_patient
  from aureka_quality.patient_index p
  where p.patient_id = p_patient_id
    and exists(select 1 from unnest(p.room_ids) as rid where aureka_system.has_quality_room_access(rid))
  limit 1;
  if not found then raise exception 'Pasien tidak ditemukan dalam cakupan unit yang dapat diakses.' using errcode = '42501'; end if;

  insert into aureka_quality.patient_record_access_audit(patient_index_id,user_id,purpose)
  values (v_patient.patient_id,auth.uid(),trim(p_purpose));

  select coalesce(array_agg(rid), '{}'::bigint[]) into v_rooms
  from unnest(v_patient.room_ids) as rid where aureka_system.has_quality_room_access(rid);

  select jsonb_build_object(
    'patient', jsonb_build_object(
      'patient_id',v_patient.patient_id,'no_rm',v_patient.no_rm,'nama_pasien',v_patient.nama_pasien,
      'tanggal_lahir',v_patient.tanggal_lahir,'jenis_kelamin',v_patient.jenis_kelamin,
      'first_seen',v_patient.first_seen,'last_seen',v_patient.last_seen,'total_episode',v_patient.total_episode,
      'unit_terakhir',v_patient.unit_terakhir,'diagnosis_terakhir',v_patient.diagnosis_terakhir
    ),
    'quality_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_id',q.id,'room_id',q.room_id,'unit',mr.name,'record_date',q.record_date,
        'period_start',q.period_start,'period_end',q.period_end,'status',q.status,
        'responses',coalesce((
          select jsonb_agg(jsonb_build_object(
            'indicator_code',ip.code,'indicator_title',ip.title,'category',ip.category,
            'response_label',rr.response_label,'response_code',rr.response_code,
            'raw_value',rr.raw_value,'review_status',rr.review_status
          ) order by ip.code)
          from aureka_quality.quality_record_responses rr
          join aureka_quality.indicator_profiles ip on ip.id=rr.indicator_id
          where rr.record_id=q.id
        ),'[]'::jsonb)
      ) order by coalesce(q.record_date,q.created_at::date) desc)
      from aureka_quality.quality_records q
      join public.master_rooms mr on mr.id=q.room_id
      where q.patient_index_id=v_patient.patient_id and q.room_id=any(v_rooms)
        and q.archived_at is null and q.status <> 'archived'
    ),'[]'::jsonb),
    'clinical_pathway_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'template_name',c.template_name,
        'admission_date',c.admission_date,'discharge_date',c.discharge_date,
        'unit_name',c.unit_name,'dpjp',c.dpjp,'status',c.status,'calculation',c.calculation_json)
        order by c.created_at desc)
      from aureka_quality.clinical_pathway_audits c
      where c.patient_index_id=v_patient.patient_id and c.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'clinical_death_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',d.id,'audit_type',d.audit_type,
        'review_period',d.review_period,'overall_care_score',d.overall_care_score,
        'avoidability_score',d.avoidability_score,'status',d.status) order by d.created_at desc)
      from aureka_quality.clinical_death_audits d
      where d.patient_index_id=v_patient.patient_id and d.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'incident_code',i.incident_code,
        'incident_date',i.incident_date,'incident_type',i.incident_type,'status',i.status,
        'summary',i.summary,'unit_name',i.unit_name) order by i.incident_date desc nulls last)
      from aureka_patient_safety.incidents i
      where i.patient_index_id=v_patient.patient_id and i.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'realcost_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'audit_code',r.audit_code,
        'service_date',r.service_date,'room_id',r.room_id,'cost_center',r.cost_center,
        'case_mix_group',r.case_mix_group,'total_cost',r.total_cost,
        'total_revenue',r.total_revenue,'cost_variance',r.cost_variance,'status',r.status)
        order by r.service_date desc nulls last)
      from aureka_quality.realcost_audits r
      where r.patient_index_id=v_patient.patient_id and r.room_id=any(v_rooms)
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.aureka_patient_detail_bundle(uuid,text) from public, anon;
grant execute on function public.aureka_patient_detail_bundle(uuid,text) to authenticated;

-- The QR code verifies an approval record and file hash; it is not represented as a PSrE-certified signature.
revoke all on function public.aureka_verify_artifact_signature(text) from public, authenticated;
grant execute on function public.aureka_verify_artifact_signature(text) to anon;

commit;