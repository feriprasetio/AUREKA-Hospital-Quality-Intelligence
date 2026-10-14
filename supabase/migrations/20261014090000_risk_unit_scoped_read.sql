-- AUREKA · Manajemen Risiko · pembatasan baca per unit
--
-- Sebelumnya setiap pengguna terautentikasi dapat membaca seluruh risk register
-- rumah sakit (USING (true)). Migration ini membatasi baca untuk role unit
-- (mis. PIC): hanya risiko unit utamanya sendiri. Role pengelola
-- (ADMIN, PMKP, MANAGEMENT, KABID, DIREKTUR, DEWAN_PENGAWAS) tetap melihat semua.
--
-- Kebijakan INSERT/UPDATE/DELETE tidak diubah: PIC tetap dapat menambah dan
-- memperbaiki risiko unitnya sendiri.
--
-- Risiko hasil impor yang belum dipetakan ke unit_id (unit_id IS NULL) tetap
-- terlihat oleh PIC bila unit_name sama dengan nama unit utamanya, agar data
-- impor tidak "hilang" sebelum pemetaan unit selesai.

create or replace function aureka_risk.can_view_unit(p_unit_id bigint, p_unit_name text)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public
as $$
  select aureka_risk.can_manage_all()
    or (p_unit_id is not null and p_unit_id = aureka_risk.current_primary_room_id())
    or (
      p_unit_id is null
      and exists (
        select 1 from public.master_rooms mr
        where mr.id = aureka_risk.current_primary_room_id()
          and lower(trim(mr.name)) = lower(trim(coalesce(p_unit_name, '')))
      )
    );
$$;

create or replace function aureka_risk.can_view_risk(p_risk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public
as $$
  select exists (
    select 1 from aureka_risk.risk_register rr
    where rr.id = p_risk_id and aureka_risk.can_view_unit(rr.unit_id, rr.unit_name)
  );
$$;

grant execute on function aureka_risk.can_view_unit(bigint, text) to authenticated;
grant execute on function aureka_risk.can_view_risk(uuid) to authenticated;

-- Risk register
drop policy if exists risk_register_read_authenticated on aureka_risk.risk_register;
drop policy if exists risk_register_read_unit_scoped on aureka_risk.risk_register;
create policy risk_register_read_unit_scoped on aureka_risk.risk_register
for select to authenticated
using (aureka_risk.can_view_unit(unit_id, unit_name));

-- FMEA / HFMEA
drop policy if exists fmea_read_authenticated on aureka_risk.fmea_analyses;
drop policy if exists fmea_read_unit_scoped on aureka_risk.fmea_analyses;
create policy fmea_read_unit_scoped on aureka_risk.fmea_analyses
for select to authenticated
using (
  aureka_risk.can_manage_all()
  or created_by = (select auth.uid())
  or (risk_register_id is not null and aureka_risk.can_view_risk(risk_register_id))
  or aureka_risk.can_view_unit(null, unit_name)
);

-- Konektor risiko
drop policy if exists risk_relationships_read_authenticated on aureka_risk.risk_relationships;
drop policy if exists risk_relationships_read_unit_scoped on aureka_risk.risk_relationships;
create policy risk_relationships_read_unit_scoped on aureka_risk.risk_relationships
for select to authenticated
using (
  aureka_risk.can_manage_all()
  or aureka_risk.can_view_risk(source_risk_id)
  or aureka_risk.can_view_risk(target_risk_id)
);

-- Rencana Tindak Pengendalian (RTP)
-- Dicek lewat fungsi SECURITY DEFINER agar policy mitigation_plans dan
-- mitigation_plan_risks tidak saling memanggil (menghindari rekursi RLS).
create or replace function aureka_risk.can_view_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = aureka_risk, aureka_system, public
as $$
  select exists (
    select 1 from aureka_risk.mitigation_plans p
    where p.id = p_plan_id
      and (
        aureka_risk.can_manage_all()
        or p.created_by = auth.uid()
        or p.owner_room_id = aureka_risk.current_primary_room_id()
        or exists (
          select 1 from aureka_risk.mitigation_plan_risks mpr
          where mpr.plan_id = p.id and aureka_risk.can_view_risk(mpr.risk_id)
        )
      )
  );
$$;

grant execute on function aureka_risk.can_view_plan(uuid) to authenticated;

drop policy if exists mitigation_plans_read_authenticated on aureka_risk.mitigation_plans;
drop policy if exists mitigation_plans_read_unit_scoped on aureka_risk.mitigation_plans;
create policy mitigation_plans_read_unit_scoped on aureka_risk.mitigation_plans
for select to authenticated
using (aureka_risk.can_view_plan(id));

drop policy if exists mitigation_plan_risks_read_authenticated on aureka_risk.mitigation_plan_risks;
drop policy if exists mitigation_plan_risks_read_unit_scoped on aureka_risk.mitigation_plan_risks;
create policy mitigation_plan_risks_read_unit_scoped on aureka_risk.mitigation_plan_risks
for select to authenticated
using (aureka_risk.can_view_risk(risk_id) or aureka_risk.can_view_plan(plan_id));

create index if not exists fmea_analyses_risk_register_idx on aureka_risk.fmea_analyses (risk_register_id);
create index if not exists mitigation_plan_risks_risk_idx on aureka_risk.mitigation_plan_risks (risk_id);
create index if not exists mitigation_plan_risks_plan_idx on aureka_risk.mitigation_plan_risks (plan_id);
