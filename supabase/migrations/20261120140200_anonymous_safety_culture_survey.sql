-- AUREKA Standards Baseline v2: anonymous new safety-culture submissions.
-- Historical named records are retained for controlled audit and are not backfilled or rewritten.
begin;

alter table aureka_patient_safety.culture_responses
  drop constraint if exists culture_responses_identity_mode_check;

alter table aureka_patient_safety.culture_responses
  add constraint culture_responses_identity_mode_check
  check (identity_mode = any (array['legacy_anonymous'::text, 'anonymous'::text, 'named'::text]));

comment on column aureka_patient_safety.culture_responses.identity_mode is
  'legacy_anonymous preserves older anonymous rows; anonymous is the only permitted mode for new submissions; named is retained only for historical rows.';

create or replace function aureka_patient_safety.guard_named_culture_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room_id bigint;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'Survey response records are append-only and cannot be changed or removed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated AUREKA account is required to submit the anonymous survey.';
  end if;
  if new.identity_mode is distinct from 'anonymous' then
    raise exception 'New safety-culture survey responses must be anonymous.';
  end if;
  if new.respondent_person_id is not null
     or new.respondent_room_id is not null
     or new.submitted_by_user_id is not null
     or coalesce(new.respondent_identity_confirmed, false) then
    raise exception 'Respondent and submitter identifiers must not be stored with anonymous survey responses.';
  end if;

  select r.id
    into v_room_id
    from public.master_rooms r
   where r.name = trim(new.unit_name)
     and r.is_active = true
   limit 1;

  if v_room_id is null then
    raise exception 'Selected unit is not an active master room.';
  end if;
  if not aureka_system.has_quality_room_access(v_room_id) then
    raise exception 'Current account is not authorized to submit for the selected unit.';
  end if;

  new.respondent_identity_confirmed_at := null;
  return new;
end;
$function$;

revoke all on function aureka_patient_safety.guard_named_culture_response() from public, anon, authenticated;
drop trigger if exists culture_response_named_identity_guard on aureka_patient_safety.culture_responses;
create trigger culture_response_named_identity_guard
  before insert or update or delete on aureka_patient_safety.culture_responses
  for each row execute function aureka_patient_safety.guard_named_culture_response();

-- Raw response SELECT is restricted to ADMIN. Role permission grants do not expose identifiable rows.
drop policy if exists culture_responses_select_governed on aureka_patient_safety.culture_responses;
create policy culture_responses_select_superadmin
  on aureka_patient_safety.culture_responses
  for select to authenticated
  using (aureka_patient_safety.can_export_survey());

revoke update, delete on aureka_patient_safety.culture_responses from authenticated;
grant insert on aureka_patient_safety.culture_responses to authenticated;

commit;
