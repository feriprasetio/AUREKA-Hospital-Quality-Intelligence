drop policy if exists cp_audits_owner_or_admin_update on aureka_quality.clinical_pathway_audits;
drop policy if exists cp_audits_shared_room_update on aureka_quality.clinical_pathway_audits;

create policy cp_audits_shared_room_update
on aureka_quality.clinical_pathway_audits for update to authenticated
using (
  aureka_system.has_quality_room_access(room_id)
  and (status <> 'validated' or aureka_system.is_superadmin())
)
with check (
  aureka_system.has_quality_room_access(room_id)
  and (status <> 'validated' or aureka_system.is_superadmin())
);

comment on policy cp_audits_shared_room_update on aureka_quality.clinical_pathway_audits is
  'Allows authorized users assigned to the same room to collaborate on a CP audit; a validated audit is locked to Super Admin.';
