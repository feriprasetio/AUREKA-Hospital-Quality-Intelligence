begin;

-- Allow any authenticated reviewer who has access to the same unit to continue
-- or validate that unit's shared audit, without removing room-level isolation.
drop policy if exists clinical_death_audits_owner_or_admin_update
  on aureka_quality.clinical_death_audits;
drop policy if exists clinical_death_audits_room_update
  on aureka_quality.clinical_death_audits;

create policy clinical_death_audits_room_update
on aureka_quality.clinical_death_audits
for update to authenticated
using (aureka_system.has_quality_room_access(room_id))
with check (
  aureka_system.has_quality_room_access(room_id)
  and updated_by = auth.uid()
);

commit;
