-- AUREKA Blueprint v2.0: aggregate-only infographics and permission-aligned navigation.
-- Additive migration. It never grants direct access to identifiable patient or clinical rows.

insert into aureka_governance.permissions(code, label, sensitive) values
  ('quality.read.aggregate', 'Melihat ringkasan agregat indikator mutu', false),
  ('dashboard.read.infographics', 'Melihat Infografis agregat lintas domain', false)
on conflict (code) do update
set label = excluded.label, sensitive = excluded.sensitive;

-- Default grants only. Preserve any explicit administrator override (updated_by IS NOT NULL).
insert into aureka_governance.role_permissions(role_code, permission, granted)
select roles.role_code, permissions.code, true
from (values
  ('ADMIN'), ('PMKP'), ('MANAGEMENT'), ('KABID'), ('DIREKTUR'), ('DEWAN_PENGAWAS'), ('PIC'), ('VALIDATOR')
) as roles(role_code)
cross join aureka_governance.permissions permissions
where permissions.code = 'dashboard.read.infographics'
on conflict (role_code, permission) do update
set granted = true, updated_at = now()
where aureka_governance.role_permissions.updated_by is null;

insert into aureka_governance.role_permissions(role_code, permission, granted)
select roles.role_code, 'quality.read.aggregate', true
from (values
  ('ADMIN'), ('PMKP'), ('MANAGEMENT'), ('KABID'), ('DIREKTUR'), ('DEWAN_PENGAWAS')
) as roles(role_code)
on conflict (role_code, permission) do update
set granted = true, updated_at = now()
where aureka_governance.role_permissions.updated_by is null;

insert into aureka_governance.role_permissions(role_code, permission, granted)
values ('DIREKTUR', 'hr.read.performance', true)
on conflict (role_code, permission) do update
set granted = true, updated_at = now()
where aureka_governance.role_permissions.updated_by is null;

create or replace function public.aureka_gov_infographics_summary(
  p_year integer default null,
  p_room bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_user_room bigint;
  v_room_id bigint;
  v_room_name text;
  v_year integer := coalesce(p_year, extract(year from pg_catalog.now())::integer);
  v_quality_active bigint := 0;
  v_quality_records bigint := 0;
  v_quality_validated bigint := 0;
  v_quality_monthly jsonb := '[]'::jsonb;
  v_quality_categories jsonb := '[]'::jsonb;
  v_incident_total bigint := 0;
  v_incident_open bigint := 0;
  v_incident_closed bigint := 0;
  v_incident_monthly jsonb := '[]'::jsonb;
  v_risk_total bigint := 0;
  v_risk_very_high bigint := 0;
  v_risk_open bigint := 0;
  v_risk_relationships bigint := 0;
  v_risk_monthly jsonb := '[]'::jsonb;
  v_risk_levels jsonb := '[]'::jsonb;
  v_risk_categories jsonb := '[]'::jsonb;
  v_recommendations bigint := 0;
  v_actions bigint := 0;
  v_open_actions bigint := 0;
  v_overdue_actions bigint := 0;
  v_completed_actions bigint := 0;
  v_published bigint := 0;
  v_pending_approval bigint := 0;
  v_review_due bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.' using errcode = '28000';
  end if;
  if v_year < 2000 or v_year > 2100 then
    raise exception 'Periode infografis tidak valid.' using errcode = '22023';
  end if;

  select m.role_code, m.room_id into v_role, v_user_room
  from aureka_governance.me() m
  limit 1;

  if v_role is null then
    raise exception 'Profil dan role pengguna tidak ditemukan.' using errcode = '42501';
  end if;

  if v_role in ('ADMIN', 'PMKP', 'MANAGEMENT', 'DIREKTUR', 'DEWAN_PENGAWAS') then
    v_room_id := p_room;
  elsif v_role in ('KABID', 'PIC', 'VALIDATOR') then
    if v_user_room is null then
      raise exception 'Akun belum dipetakan ke unit kerja.' using errcode = '42501';
    end if;
    if p_room is not null and p_room <> v_user_room then
      raise exception 'Akses infografis dibatasi pada unit penugasan.' using errcode = '42501';
    end if;
    v_room_id := v_user_room;
  else
    raise exception 'Role tidak memiliki akses infografis.' using errcode = '42501';
  end if;

  if v_room_id is not null then
    select mr.name into v_room_name from public.master_rooms mr
    where mr.id = v_room_id and mr.is_active = true;
    if v_room_name is null then
      raise exception 'Unit yang dipilih tidak ditemukan atau tidak aktif.' using errcode = '22023';
    end if;
  else
    v_room_name := 'Seluruh rumah sakit';
  end if;

  select count(*) into v_quality_active
  from aureka_quality.indicator_profiles ip
  where ip.profile_year = v_year and ip.is_active = true
    and (v_room_id is null or ip.room_id = v_room_id);

  select count(*), count(*) filter (where qr.status = 'validated')
    into v_quality_records, v_quality_validated
  from aureka_quality.quality_records qr
  where qr.profile_year = v_year and qr.archived_at is null
    and qr.measurement_grain is distinct from 'patient_episode'
    and (v_room_id is null or qr.room_id = v_room_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'month', months.month, 'total', coalesce(monthly.total, 0), 'validated', coalesce(monthly.validated, 0)
    ) order by months.month), '[]'::jsonb)
  into v_quality_monthly
  from generate_series(1, 12) as months(month)
  left join (
    select extract(month from coalesce(qr.period_start, qr.record_date, qr.created_at::date))::integer as month,
      count(*) as total, count(*) filter (where qr.status = 'validated') as validated
    from aureka_quality.quality_records qr
    where qr.profile_year = v_year and qr.archived_at is null
      and qr.measurement_grain is distinct from 'patient_episode'
      and (v_room_id is null or qr.room_id = v_room_id)
    group by 1
  ) monthly on monthly.month = months.month;

  select coalesce(jsonb_agg(jsonb_build_object('label', category_rows.label, 'count', category_rows.count) order by category_rows.count desc), '[]'::jsonb)
    into v_quality_categories
  from (
    select ip.category as label, count(*) as count
    from aureka_quality.indicator_profiles ip
    where ip.profile_year = v_year and ip.is_active = true
      and ip.category is not null and btrim(ip.category) <> ''
      and (v_room_id is null or ip.room_id = v_room_id)
    group by ip.category order by count(*) desc limit 8
  ) category_rows;

  if v_role in ('ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC') then
    select count(*),
      count(*) filter (where lower(i.status) in ('submitted', 'under_review', 'investigation')),
      count(*) filter (where lower(i.status) in ('closed', 'resolved', 'selesai', 'ditutup'))
    into v_incident_total, v_incident_open, v_incident_closed
    from aureka_patient_safety.incidents i
    where i.incident_date >= pg_catalog.make_date(v_year, 1, 1)
      and i.incident_date < pg_catalog.make_date(v_year + 1, 1, 1)
      and (v_room_id is null or i.unit_name = v_room_name)
      and (v_role <> 'PIC' or i.created_by = auth.uid());

    select coalesce(jsonb_agg(jsonb_build_object('month', months.month, 'total', coalesce(monthly.total, 0)) order by months.month), '[]'::jsonb)
    into v_incident_monthly
    from generate_series(1, 12) as months(month)
    left join (
      select extract(month from i.incident_date)::integer as month, count(*) as total
      from aureka_patient_safety.incidents i
      where i.incident_date >= pg_catalog.make_date(v_year, 1, 1)
        and i.incident_date < pg_catalog.make_date(v_year + 1, 1, 1)
        and (v_room_id is null or i.unit_name = v_room_name)
        and (v_role <> 'PIC' or i.created_by = auth.uid())
      group by 1
    ) monthly on monthly.month = months.month;
  end if;

  select count(*), count(*) filter (where r.risk_level = 'Sangat Tinggi'), count(*) filter (where r.status = 'Open')
    into v_risk_total, v_risk_very_high, v_risk_open
  from aureka_risk.risk_register r
  where (v_room_id is null or r.unit_id = v_room_id);

  select count(*) into v_risk_relationships
  from aureka_risk.risk_relationships rr
  where exists (select 1 from aureka_risk.risk_register sr where sr.id = rr.source_risk_id and (v_room_id is null or sr.unit_id = v_room_id))
    and exists (select 1 from aureka_risk.risk_register tr where tr.id = rr.target_risk_id and (v_room_id is null or tr.unit_id = v_room_id));

  select coalesce(jsonb_agg(jsonb_build_object('label', levels.label, 'count', levels.count) order by levels.count desc), '[]'::jsonb)
  into v_risk_levels
  from (select coalesce(r.risk_level, 'Belum dinilai') as label, count(*) as count
    from aureka_risk.risk_register r where (v_room_id is null or r.unit_id = v_room_id) group by 1) levels;

  select coalesce(jsonb_agg(jsonb_build_object('label', categories.label, 'count', categories.count) order by categories.count desc), '[]'::jsonb)
  into v_risk_categories
  from (select coalesce(r.category, 'Belum dikategorikan') as label, count(*) as count
    from aureka_risk.risk_register r where (v_room_id is null or r.unit_id = v_room_id)
    group by 1 order by count(*) desc limit 8) categories;

  select coalesce(jsonb_agg(jsonb_build_object('month', months.month, 'total', coalesce(monthly.total, 0)) order by months.month), '[]'::jsonb)
  into v_risk_monthly
  from generate_series(1, 12) as months(month)
  left join (
    select extract(month from r.created_at)::integer as month, count(*) as total
    from aureka_risk.risk_register r
    where r.created_at >= pg_catalog.make_date(v_year, 1, 1)::timestamptz
      and r.created_at < pg_catalog.make_date(v_year + 1, 1, 1)::timestamptz
      and (v_room_id is null or r.unit_id = v_room_id)
    group by 1
  ) monthly on monthly.month = months.month;

  select count(*) into v_recommendations
  from aureka_governance.recommendations r
  where r.program_year = v_year and r.status = 'aktif'
    and (v_role in ('ADMIN', 'PMKP', 'MANAGEMENT', 'DIREKTUR') or exists (
      select 1 from aureka_governance.actions a where a.recommendation_id = r.id
        and (a.responsible_level = v_role or (v_role in ('PIC', 'VALIDATOR') and a.responsible_level = 'UNIT' and a.assigned_room_id = v_user_room))
    ));

  select count(*),
    count(*) filter (where a.status not in ('terverifikasi', 'dibatalkan')),
    count(*) filter (where a.due_date < current_date and a.status not in ('terverifikasi', 'dibatalkan')),
    count(*) filter (where a.status in ('terverifikasi', 'selesai'))
  into v_actions, v_open_actions, v_overdue_actions, v_completed_actions
  from aureka_governance.actions a
  left join aureka_governance.recommendations r on r.id = a.recommendation_id
  where coalesce(r.program_year, extract(year from a.created_at)::integer) = v_year
    and (v_role in ('ADMIN', 'PMKP', 'MANAGEMENT', 'DIREKTUR') or a.responsible_level = v_role
      or (v_role in ('PIC', 'VALIDATOR') and a.responsible_level = 'UNIT' and a.assigned_room_id = v_user_room));

  select count(*) filter (where d.status = 'terbit'),
    count(*) filter (where d.status = 'menunggu_direktur' and v_role <> 'DEWAN_PENGAWAS'),
    count(*) filter (where d.status = 'terbit' and exists (
      select 1 from aureka_governance.regulation_versions rv
      where rv.document_id = d.id and rv.status = 'terbit' and rv.review_date is not null and rv.review_date <= current_date
    ))
  into v_published, v_pending_approval, v_review_due
  from aureka_governance.regulation_documents d
  where (v_room_id is null or d.owner_room_id = v_room_id);

  return jsonb_build_object(
    'year', v_year, 'room_id', v_room_id, 'room_name', v_room_name,
    'quality', jsonb_build_object('active_indicators', v_quality_active, 'records', v_quality_records,
      'validated', v_quality_validated, 'validation_rate', case when v_quality_records > 0 then round(v_quality_validated::numeric * 100 / v_quality_records, 1) else 0 end,
      'monthly', v_quality_monthly, 'categories', v_quality_categories),
    'incidents', jsonb_build_object('total', v_incident_total, 'open', v_incident_open, 'closed', v_incident_closed, 'monthly', v_incident_monthly),
    'risk', jsonb_build_object('total', v_risk_total, 'very_high', v_risk_very_high, 'open', v_risk_open, 'relationships', v_risk_relationships,
      'monthly', v_risk_monthly, 'levels', v_risk_levels, 'categories', v_risk_categories),
    'program', jsonb_build_object('recommendations', v_recommendations, 'actions', v_actions, 'open_actions', v_open_actions,
      'overdue_actions', v_overdue_actions, 'completed_actions', v_completed_actions),
    'regulation', jsonb_build_object('published', v_published, 'pending_approval', v_pending_approval, 'review_due', v_review_due)
  );
end;
$function$;

revoke all on function public.aureka_gov_infographics_summary(integer, bigint) from public, anon;
grant execute on function public.aureka_gov_infographics_summary(integer, bigint) to authenticated;
