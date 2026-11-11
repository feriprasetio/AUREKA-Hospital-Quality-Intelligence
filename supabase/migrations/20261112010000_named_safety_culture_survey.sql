-- AUREKA Blueprint v2.0: named annual safety-culture survey.
-- Additive and backward-compatible: historic responses remain legacy anonymous.
-- Existing raw-response SELECT remains restricted by the pre-existing ADMIN policy.

begin;

-- Existing rows receive identity_mode = 'legacy_anonymous' only through the column default.
-- No UPDATE/backfill is performed: respondent and submitter identity are never inferred retroactively.
-- New INSERTs are validated by the trigger below and must explicitly use identity_mode = 'named'.

alter table aureka_patient_safety.culture_responses
  add column if not exists respondent_person_id uuid
    references aureka_quality.staff_directory(id) on delete restrict,
  add column if not exists respondent_room_id bigint
    references public.master_rooms(id) on delete restrict,
  add column if not exists submitted_by_user_id uuid
    references auth.users(id) on delete restrict,
  add column if not exists identity_mode text not null default 'legacy_anonymous'
    check (identity_mode in ('legacy_anonymous','named')),
  add column if not exists respondent_identity_confirmed boolean not null default false,
  add column if not exists respondent_identity_confirmed_at timestamptz;

comment on column aureka_patient_safety.culture_responses.respondent_person_id is
  'Canonical workforce-directory identity of a named survey respondent. NULL only for preserved pre-v2 legacy responses.';
comment on column aureka_patient_safety.culture_responses.respondent_room_id is
  'Master room selected for the respondent; must match the active locked staff-team assignment and unit_name.';
comment on column aureka_patient_safety.culture_responses.submitted_by_user_id is
  'Authenticated AUREKA account that submitted the response; intentionally separate from respondent identity.';
comment on column aureka_patient_safety.culture_responses.identity_mode is
  'legacy_anonymous preserves historical responses; new submissions must be named.';
comment on column aureka_patient_safety.culture_responses.respondent_identity_confirmed is
  'Explicit in-app attestation that respondent identity was confirmed with their knowledge; not cryptographic proof of physical authorship.';
comment on column aureka_patient_safety.culture_responses.respondent_identity_confirmed_at is
  'Server timestamp recorded when the identity attestation was accepted.';

create index if not exists culture_responses_named_person_period_idx
  on aureka_patient_safety.culture_responses (respondent_person_id, survey_period)
  where identity_mode = 'named';
create index if not exists culture_responses_named_room_period_idx
  on aureka_patient_safety.culture_responses (respondent_room_id, survey_period)
  where identity_mode = 'named';
create index if not exists culture_responses_submitter_idx
  on aureka_patient_safety.culture_responses (submitted_by_user_id, submitted_at desc)
  where submitted_by_user_id is not null;

-- Trigger-only integrity guard. It is not an API function and is not executable by client roles.
create or replace function aureka_patient_safety.guard_named_culture_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Keep every response append-only, including historical rows.
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'Survey response records are append-only and cannot be changed or removed.';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated AUREKA account is required.';
  end if;
  if new.identity_mode <> 'named' then
    raise exception 'New survey submissions must use named identity mode.';
  end if;
  if new.respondent_person_id is null or new.respondent_room_id is null then
    raise exception 'Select the named respondent and their assigned unit.';
  end if;
  if new.submitted_by_user_id is distinct from auth.uid() then
    raise exception 'Submitting account does not match the authenticated session.';
  end if;
  if not coalesce(new.respondent_identity_confirmed, false) then
    raise exception 'Confirm that the named respondent identity has been checked.';
  end if;
  if not exists (
    select 1
    from aureka_quality.staff_directory d
    where d.id = new.respondent_person_id
      and d.directory_status = 'available'
  ) then
    raise exception 'Selected respondent is unavailable in the canonical workforce directory.';
  end if;
  if not exists (
    select 1
    from public.master_rooms r
    where r.id = new.respondent_room_id
      and r.name = new.unit_name
      and r.is_active = true
  ) then
    raise exception 'Selected unit does not match the active master room.';
  end if;
  if not exists (
    select 1
    from aureka_quality.staff_team_assignments a
    where a.staff_id = new.respondent_person_id
      and a.room_id = new.respondent_room_id
      and a.assignment_status = 'active'
      and a.is_locked = true
  ) then
    raise exception 'Respondent must have an active locked assignment to the selected unit.';
  end if;

  new.respondent_identity_confirmed_at := statement_timestamp();
  return new;
end;
$function$;

revoke all on function aureka_patient_safety.guard_named_culture_response() from public, anon, authenticated;
drop trigger if exists culture_response_named_identity_guard on aureka_patient_safety.culture_responses;
create trigger culture_response_named_identity_guard
  before insert or update or delete on aureka_patient_safety.culture_responses
  for each row execute function aureka_patient_safety.guard_named_culture_response();

-- Keep raw response reads restricted by the pre-existing ADMIN-only RLS policy.
-- No UPDATE/DELETE permission is granted to authenticated users.
revoke update, delete on aureka_patient_safety.culture_responses from authenticated;
grant insert on aureka_patient_safety.culture_responses to authenticated;

commit;
