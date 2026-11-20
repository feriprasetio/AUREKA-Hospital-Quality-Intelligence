begin;

-- Audit Realcost: pisahkan ringkasan lintas rumah sakit, data audit per episode,
-- dan identitas pasien. Workbook sumber tidak pernah disimpan sebagai file mentah di repositori.

insert into aureka_governance.permissions(code, label, sensitive) values
  ('realcost.read.aggregate', 'Melihat analisis agregat Audit Realcost', false),
  ('realcost.read.detail', 'Melihat rincian episode dan komponen biaya Audit Realcost', true),
  ('realcost.import', 'Mengimpor dan mengelola sumber data Audit Realcost', true)
on conflict (code) do update
set label = excluded.label, sensitive = excluded.sensitive;

insert into aureka_governance.role_permissions(role_code, permission, granted)
values
  ('ADMIN', 'realcost.read.aggregate', true),
  ('PMKP', 'realcost.read.aggregate', true),
  ('MANAGEMENT', 'realcost.read.aggregate', true),
  ('KABID', 'realcost.read.aggregate', true),
  ('DIREKTUR', 'realcost.read.aggregate', true),
  ('DEWAN_PENGAWAS', 'realcost.read.aggregate', true),
  ('ADMIN', 'realcost.read.detail', true),
  ('PMKP', 'realcost.read.detail', true),
  ('ADMIN', 'realcost.import', true),
  ('PMKP', 'realcost.import', true)
on conflict (role_code, permission) do nothing;

create table if not exists aureka_quality.realcost_imports (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_sheet text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  period_start date,
  period_end date,
  source_rows integer not null check (source_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  imported_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_note text not null default '',
  check (period_end is null or period_start is null or period_end >= period_start),
  check (imported_rows <= source_rows)
);

create index if not exists realcost_imports_status_created_idx
  on aureka_quality.realcost_imports(status, created_at desc);
create unique index if not exists realcost_imports_completed_source_hash_uidx
  on aureka_quality.realcost_imports(source_sha256)
  where status = 'completed';

create table if not exists aureka_quality.realcost_episodes (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references aureka_quality.realcost_imports(id) on delete cascade,
  source_row integer not null check (source_row > 0),
  episode_key_hash text not null check (episode_key_hash ~ '^[0-9a-f]{64}$'),
  admission_date date,
  discharge_date date not null,
  class_code text not null default '',
  inacbg_code text not null default '',
  inacbg_description text not null default '',
  tariff_inacbg numeric(20,2) not null default 0,
  tarif_rs numeric(20,2) not null default 0,
  total_tarif numeric(20,2) not null default 0,
  tarif_poli_eks numeric(20,2) not null default 0,
  los numeric(10,2) not null default 0 check (los >= 0),
  icu_indicator boolean not null default false,
  icu_los numeric(10,2) not null default 0 check (icu_los >= 0),
  vent_hour numeric(10,2) not null default 0 check (vent_hour >= 0),
  discharge_status text not null default '',
  diagnosis_codes text[] not null default '{}',
  procedure_codes text[] not null default '{}',
  cost_components jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_components) = 'object'),
  billing_group jsonb not null default '{}'::jsonb check (jsonb_typeof(billing_group) = 'object'),
  billing_group_total_tarif_rs numeric(20,2),
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (import_id, episode_key_hash),
  unique (import_id, source_row)
);

create index if not exists realcost_episodes_import_discharge_idx
  on aureka_quality.realcost_episodes(import_id, discharge_date desc, id);
create index if not exists realcost_episodes_import_inacbg_idx
  on aureka_quality.realcost_episodes(import_id, inacbg_code);
create index if not exists realcost_episodes_import_class_idx
  on aureka_quality.realcost_episodes(import_id, class_code);

create table if not exists aureka_quality.realcost_patient_identity (
  episode_id uuid primary key references aureka_quality.realcost_episodes(id) on delete cascade,
  patient_name text,
  medical_record_number text,
  sep_number text,
  insurance_number text,
  attending_physician text,
  coder_id text,
  created_at timestamptz not null default now()
);

alter table aureka_quality.realcost_imports enable row level security;
alter table aureka_quality.realcost_episodes enable row level security;
alter table aureka_quality.realcost_patient_identity enable row level security;

grant usage on schema aureka_quality to authenticated;
grant select, insert, update, delete on aureka_quality.realcost_imports to authenticated;
grant select, insert on aureka_quality.realcost_episodes to authenticated;
grant select, insert on aureka_quality.realcost_patient_identity to authenticated;

drop policy if exists realcost_imports_read on aureka_quality.realcost_imports;
create policy realcost_imports_read
on aureka_quality.realcost_imports for select to authenticated
using (public.aureka_has_permission('realcost.read.aggregate'));

drop policy if exists realcost_imports_insert on aureka_quality.realcost_imports;
create policy realcost_imports_insert
on aureka_quality.realcost_imports for insert to authenticated
with check (
  public.aureka_has_permission('realcost.import')
  and imported_by = auth.uid()
  and status = 'processing'
);

drop policy if exists realcost_imports_update on aureka_quality.realcost_imports;
create policy realcost_imports_update
on aureka_quality.realcost_imports for update to authenticated
using (
  public.aureka_has_permission('realcost.import')
  and imported_by = auth.uid()
  and status = 'processing'
)
with check (
  public.aureka_has_permission('realcost.import')
  and imported_by = auth.uid()
  and status in ('processing', 'completed', 'failed')
);

drop policy if exists realcost_imports_delete on aureka_quality.realcost_imports;
create policy realcost_imports_delete
on aureka_quality.realcost_imports for delete to authenticated
using (
  public.aureka_has_permission('realcost.import')
  and imported_by = auth.uid()
  and status <> 'completed'
);

drop policy if exists realcost_episodes_detail_read on aureka_quality.realcost_episodes;
create policy realcost_episodes_detail_read
on aureka_quality.realcost_episodes for select to authenticated
using (
  public.aureka_has_permission('realcost.read.detail')
  and exists (
    select 1 from aureka_quality.realcost_imports i
    where i.id = import_id and i.status = 'completed'
  )
);

drop policy if exists realcost_episodes_import_insert on aureka_quality.realcost_episodes;
create policy realcost_episodes_import_insert
on aureka_quality.realcost_episodes for insert to authenticated
with check (
  public.aureka_has_permission('realcost.import')
  and exists (
    select 1 from aureka_quality.realcost_imports i
    where i.id = import_id and i.imported_by = auth.uid() and i.status = 'processing'
  )
);

drop policy if exists realcost_patient_identity_select on aureka_quality.realcost_patient_identity;
create policy realcost_patient_identity_select
on aureka_quality.realcost_patient_identity for select to authenticated
using (
  public.aureka_has_permission('patient.read.identifiable')
  and public.aureka_has_permission('realcost.read.detail')
  and exists (
    select 1
    from aureka_quality.realcost_episodes e
    join aureka_quality.realcost_imports i on i.id = e.import_id
    where e.id = episode_id and i.status = 'completed'
  )
);

drop policy if exists realcost_patient_identity_insert on aureka_quality.realcost_patient_identity;
create policy realcost_patient_identity_insert
on aureka_quality.realcost_patient_identity for insert to authenticated
with check (
  public.aureka_has_permission('realcost.import')
  and exists (
    select 1
    from aureka_quality.realcost_episodes e
    join aureka_quality.realcost_imports i on i.id = e.import_id
    where e.id = episode_id and i.imported_by = auth.uid() and i.status = 'processing'
  )
);

create or replace function public.aureka_realcost_dashboard(p_import_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, aureka_quality, public
as $$
declare
  v_result jsonb;
begin
  if not public.aureka_has_permission('realcost.read.aggregate') then
    raise exception 'Hak akses analisis agregat Audit Realcost tidak tersedia.';
  end if;

  if not exists (
    select 1 from aureka_quality.realcost_imports i
    where i.id = p_import_id and i.status = 'completed'
  ) then
    raise exception 'Sumber Audit Realcost tidak ditemukan atau belum selesai diimpor.';
  end if;

  with e as materialized (
    select * from aureka_quality.realcost_episodes where import_id = p_import_id
  ),
  component_totals as (
    select component.key as code, sum(coalesce((component.value)::numeric, 0)) as total
    from e
    cross join lateral jsonb_each(e.cost_components) component
    group by component.key
  ),
  monthly as (
    select to_char(discharge_date, 'YYYY-MM') as month,
      count(*)::integer as episodes,
      sum(tarif_rs) as tarif_rs,
      sum(tariff_inacbg) as tarif_inacbg,
      sum(tarif_rs - tariff_inacbg) as gap
    from e group by 1
  ),
  class_groups as (
    select class_code, count(*)::integer as episodes,
      sum(tarif_rs) as tarif_rs, sum(tariff_inacbg) as tarif_inacbg,
      avg(los) as average_los
    from e group by class_code
  ),
  cbg_groups as (
    select inacbg_code as code, max(inacbg_description) as description,
      count(*)::integer as episodes, sum(tarif_rs) as tarif_rs,
      sum(tariff_inacbg) as tarif_inacbg, sum(tarif_rs - tariff_inacbg) as gap,
      avg(los) as average_los
    from e group by inacbg_code
  ),
  status_groups as (
    select discharge_status as code, count(*)::integer as episodes
    from e group by discharge_status
  ),
  diagnosis_groups as (
    select code, count(*)::integer as episodes
    from (
      select distinct episode.id, trim(code) as code
      from e episode
      cross join lateral unnest(episode.diagnosis_codes) as diagnosis(code)
      where nullif(trim(code), '') is not null
    ) d group by code
  ),
  procedure_groups as (
    select code, count(*)::integer as episodes
    from (
      select distinct episode.id, trim(code) as code
      from e episode
      cross join lateral unnest(episode.procedure_codes) as procedure(code)
      where nullif(trim(code), '') is not null
    ) p group by code
  ),
  component_check as (
    select count(*) filter (where abs(
      coalesce((select sum(value::numeric) from jsonb_each_text(cost_components)), 0) - tarif_rs
    ) > 1)::integer as mismatch_count,
    coalesce(sum(
      coalesce((select sum(value::numeric) from jsonb_each_text(cost_components)), 0) - tarif_rs
    ) filter (where abs(
      coalesce((select sum(value::numeric) from jsonb_each_text(cost_components)), 0) - tarif_rs
    ) > 1), 0) as mismatch_amount
    from e
  ),
  billing_check as (
    select count(*)::integer as mismatch_count
    from e
    where exists (
      select 1
      from (values
        ('PROSEDUR_NON_BEDAH','procedure_amt'),
        ('PROSEDUR_BEDAH','surgical_amt'),
        ('KONSULTASI','consul_amt'),
        ('TENAGA_AHLI','expert_amt'),
        ('KEPERAWATAN','nursing_amt'),
        ('PENUNJANG','ancillary_amt'),
        ('RADIOLOGI','radiology_amt'),
        ('LABORATORIUM','laboratory_amt'),
        ('PELAYANAN_DARAH','blood_amt'),
        ('REHABILITASI','rehab_amt'),
        ('KAMAR_AKOMODASI','room_amt'),
        ('RAWAT_INTENSIF','intensive_amt'),
        ('OBAT','drug_amt'),
        ('ALKES','device_amt'),
        ('BMHP','consumable_amt'),
        ('SEWA_ALAT','device_rent_amt'),
        ('OBAT_KRONIS','drug_chronic_amt'),
        ('OBAT_KEMO','drug_chemo_amt')
      ) mapping(cost_key, billing_key)
      where billing_group ? mapping.billing_key
        and abs(
          coalesce((cost_components ->> mapping.cost_key)::numeric, 0)
          - coalesce((billing_group ->> mapping.billing_key)::numeric, 0)
        ) > 1
    )
  )
  select jsonb_build_object(
    'episode_count', (select count(*) from e),
    'tarif_inacbg_total', coalesce((select sum(tariff_inacbg) from e), 0),
    'tarif_rs_total', coalesce((select sum(tarif_rs) from e), 0),
    'total_tarif_total', coalesce((select sum(total_tarif) from e), 0),
    'tarif_gap_total', coalesce((select sum(tarif_rs - tariff_inacbg) from e), 0),
    'tarif_gap_positive_count', (select count(*) from e where tarif_rs > tariff_inacbg),
    'tarif_gap_negative_count', (select count(*) from e where tarif_rs < tariff_inacbg),
    'tarif_gap_positive_total', coalesce((select sum(tarif_rs - tariff_inacbg) from e where tarif_rs > tariff_inacbg), 0),
    'tarif_gap_negative_total', coalesce((select sum(tarif_rs - tariff_inacbg) from e where tarif_rs < tariff_inacbg), 0),
    'average_tarif_rs', coalesce((select avg(tarif_rs) from e), 0),
    'average_tarif_inacbg', coalesce((select avg(tariff_inacbg) from e), 0),
    'median_tarif_rs', coalesce((select percentile_cont(0.5) within group (order by tarif_rs) from e), 0),
    'p90_tarif_rs', coalesce((select percentile_cont(0.9) within group (order by tarif_rs) from e), 0),
    'tarif_rs_per_los_day', case when coalesce((select sum(los) from e),0) > 0
      then (select sum(tarif_rs) from e) / (select sum(los) from e) else 0 end,
    'average_los', coalesce((select avg(los) from e), 0),
    'median_los', coalesce((select percentile_cont(0.5) within group (order by los) from e), 0),
    'p90_los', coalesce((select percentile_cont(0.9) within group (order by los) from e), 0),
    'maximum_los', coalesce((select max(los) from e), 0),
    'long_stay_over_30', (select count(*) from e where los > 30),
    'icu_episode_count', (select count(*) from e where icu_indicator),
    'icu_episode_rate', case when (select count(*) from e) > 0
      then (select count(*)::numeric from e where icu_indicator) * 100 / (select count(*)::numeric from e)
      else 0 end,
    'monthly', coalesce((select jsonb_agg(to_jsonb(m) order by m.month) from monthly m), '[]'::jsonb),
    'cost_components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code,
        'label', c.code,
        'total', c.total,
        'share_pct', case when (select sum(tarif_rs) from e) > 0 then c.total * 100 / (select sum(tarif_rs) from e) else 0 end
      ) order by c.total desc) from component_totals c
    ), '[]'::jsonb),
    'class_distribution', coalesce((select jsonb_agg(to_jsonb(c) order by c.class_code) from class_groups c), '[]'::jsonb),
    'top_inacbg', coalesce((select jsonb_agg(to_jsonb(c) order by c.episodes desc, c.code) from (select * from cbg_groups order by episodes desc, code limit 15) c), '[]'::jsonb),
    'top_diagnoses', coalesce((select jsonb_agg(to_jsonb(d) order by d.episodes desc, d.code) from (select * from diagnosis_groups order by episodes desc, code limit 20) d), '[]'::jsonb),
    'top_procedures', coalesce((select jsonb_agg(to_jsonb(p) order by p.episodes desc, p.code) from (select * from procedure_groups order by episodes desc, code limit 20) p), '[]'::jsonb),
    'discharge_status_distribution', coalesce((select jsonb_agg(to_jsonb(s) order by s.code) from status_groups s), '[]'::jsonb),
    'reconciliation', jsonb_build_object(
      'component_total_mismatch_count', (select mismatch_count from component_check),
      'component_total_mismatch_amount', (select mismatch_amount from component_check),
      'c2_billing_group_mismatch_count', (select mismatch_count from billing_check),
      'c2_total_tarif_mismatch_count', (select count(*) from e where billing_group_total_tarif_rs is null or abs(billing_group_total_tarif_rs - tarif_rs) > 1),
      'total_tarif_vs_package_mismatch_count', (select count(*) from e where abs(total_tarif - (tariff_inacbg + tarif_poli_eks)) > 1)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.aureka_realcost_dashboard(uuid) from public, anon;
grant execute on function public.aureka_realcost_dashboard(uuid) to authenticated;

comment on table aureka_quality.realcost_imports is
  'Metadata and immutable provenance for imported Realcost workbooks. Raw XLSX files and patient identifiers are not stored here.';
comment on table aureka_quality.realcost_episodes is
  'De-identified episode-level Realcost audit dataset. Access requires realcost.read.detail; summary metrics are exposed through a guarded aggregate RPC.';
comment on table aureka_quality.realcost_patient_identity is
  'Patient-identifying fields separated from episode costs; read requires both patient.read.identifiable and realcost.read.detail with a logged access purpose.';

commit;
