-- Shared, versionable layout preferences for the two education certificate templates.
-- Existing issued PDF files remain immutable; this table affects only future issuance.

create table if not exists aureka_system.education_certificate_templates (
  template_key text primary key
    check (template_key in ('in_house_training', 'student_orientation')),
  display_label text not null,
  layout jsonb not null default '{}'::jsonb
    check (jsonb_typeof(layout) = 'object'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table aureka_system.education_certificate_templates enable row level security;
revoke all on aureka_system.education_certificate_templates from public, anon;
grant select, insert, update on aureka_system.education_certificate_templates to authenticated;

drop policy if exists education_certificate_templates_read on aureka_system.education_certificate_templates;
create policy education_certificate_templates_read
  on aureka_system.education_certificate_templates
  for select to authenticated
  using (aureka_system.can_manage_education());

drop policy if exists education_certificate_templates_insert on aureka_system.education_certificate_templates;
create policy education_certificate_templates_insert
  on aureka_system.education_certificate_templates
  for insert to authenticated
  with check (
    aureka_system.can_manage_education()
    and updated_by = (select auth.uid())
  );

drop policy if exists education_certificate_templates_update on aureka_system.education_certificate_templates;
create policy education_certificate_templates_update
  on aureka_system.education_certificate_templates
  for update to authenticated
  using (aureka_system.can_manage_education())
  with check (
    aureka_system.can_manage_education()
    and updated_by = (select auth.uid())
  );

comment on table aureka_system.education_certificate_templates
  is 'Default movable-element layouts for IHT and Student Orientation certificate PDFs. Previously issued files are not modified.';
comment on column aureka_system.education_certificate_templates.layout
  is 'Normalized canvas coordinates in percent (0-100) for predefined, non-editable certificate elements.';
