drop policy if exists cp_audits_room_insert on aureka_quality.clinical_pathway_audits;
create policy cp_audits_room_insert
on aureka_quality.clinical_pathway_audits for insert to authenticated
with check (
  aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
  and (status in ('draft','submitted') or aureka_system.is_superadmin())
);

drop policy if exists cp_audits_shared_room_update on aureka_quality.clinical_pathway_audits;
create policy cp_audits_shared_room_update
on aureka_quality.clinical_pathway_audits for update to authenticated
using (
  aureka_system.has_quality_room_access(room_id)
  and (aureka_system.is_superadmin() or status in ('draft','submitted'))
)
with check (
  aureka_system.has_quality_room_access(room_id)
  and (aureka_system.is_superadmin() or status in ('draft','submitted'))
);

comment on policy cp_audits_room_insert on aureka_quality.clinical_pathway_audits is
  'Authorized room users may create draft/submitted audits; only Super Admin can insert as validated.';
comment on policy cp_audits_shared_room_update on aureka_quality.clinical_pathway_audits is
  'Authorized users in the room may collaboratively update draft/submitted audits; only Super Admin can update validated or archived audits and assign the validated status.';
