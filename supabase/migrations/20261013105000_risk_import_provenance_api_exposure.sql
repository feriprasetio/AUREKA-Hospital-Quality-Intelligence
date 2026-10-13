-- Risk source provenance, idempotent import keys, and persistent PostgREST schema exposure.
-- The workbook's original values remain auditable next to engine-calculated values.
alter table aureka_risk.risk_register
  add column if not exists source_sheet text,
  add column if not exists source_row_number integer,
  add column if not exists source_record_no text,
  add column if not exists source_risk_code text,
  add column if not exists source_risk_score integer,
  add column if not exists source_risk_level text,
  add column if not exists source_impact_weight numeric,
  add column if not exists source_category_missing boolean not null default false,
  add column if not exists is_priority boolean not null default false,
  add column if not exists priority_rank integer,
  add column if not exists source_rtp_activity text,
  add column if not exists source_rtp_target_time text,
  add column if not exists source_rtp_owner text,
  add column if not exists source_rtp_target_score text,
  add column if not exists source_data jsonb not null default '{}'::jsonb;

create unique index if not exists risk_register_source_row_uidx
  on aureka_risk.risk_register(source_sheet, source_row_number)
  where source_sheet is not null and source_row_number is not null;
create index if not exists risk_register_priority_rank_idx
  on aureka_risk.risk_register(is_priority, priority_rank)
  where is_priority = true;
create index if not exists risk_register_source_score_idx
  on aureka_risk.risk_register(source_risk_score, source_risk_level);

alter table aureka_risk.fmea_analyses
  add column if not exists source_sheet text,
  add column if not exists source_row_number integer,
  add column if not exists source_record_no text,
  add column if not exists source_title text,
  add column if not exists source_priority_rank integer,
  add column if not exists source_rpn integer,
  add column if not exists source_data jsonb not null default '{}'::jsonb;

create unique index if not exists fmea_analyses_source_row_uidx
  on aureka_risk.fmea_analyses(source_sheet, source_row_number)
  where source_sheet is not null and source_row_number is not null;

create table if not exists aureka_risk.risk_import_reference (
  id uuid primary key default gen_random_uuid(),
  source_sheet text not null check (source_sheet in ('U','Risiko Prioritas')),
  source_row_number integer not null,
  source_record_no text,
  source_headers jsonb not null default '[]'::jsonb,
  row_data jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  unique (source_sheet, source_row_number)
);
create index if not exists risk_import_reference_sheet_idx
  on aureka_risk.risk_import_reference(source_sheet, source_row_number);

alter table aureka_risk.risk_import_reference enable row level security;
grant select on aureka_risk.risk_import_reference to authenticated;
drop policy if exists risk_import_reference_read_authenticated on aureka_risk.risk_import_reference;
create policy risk_import_reference_read_authenticated
  on aureka_risk.risk_import_reference for select to authenticated using (true);

-- Keep all intended AUREKA schemas available via PostgREST on the hosted project.
-- This is a role-level override, so schema list changes must be maintained in migration control.
alter role authenticator set pgrst.db_schemas =
  'public, aureka_system, aureka_quality, aureka_patient_safety, aureka_risk, aureka_analytics, storage, graphql_public';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
