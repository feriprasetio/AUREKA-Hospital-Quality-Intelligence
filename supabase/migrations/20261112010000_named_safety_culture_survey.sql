-- AUREKA Blueprint v2.0: named annual safety-culture survey.
-- Additive migration: preserves prior anonymous records as legacy; never fabricates identities.
-- Do not expose raw named responses to non-authorized roles.

begin;

alter table aureka_patient_safety.culture_responses
  add column if not exists respondent_person_id uuid
    references aureka_quality.staff_directory(id) on delete restrict,
  add column if not exists submitted_by_user_id uuid
    references auth.users(id) on delete restrict,
  add column if not exists identity_mode text not null default 'legacy_anonymous'
    check (identity_mode in ('legacy_anonymous','named'));

comment on column aureka_patient_safety.culture_responses.respondent_person_id is
  'Canonical HR directory identity of the named survey respondent. NULL only for preserved legacy anonymous submissions.';
comment on column aureka_patient_safety.culture_responses.submitted_by_user_id is
  'Authenticated user account that submitted the response; may differ from respondent when a shared account is used.';
comment on column aureka_patient_safety.culture_responses.identity_mode is
  'legacy_anonymous preserves pre-v2 records; new v2 submissions must be named.';

create index if not exists culture_responses_named_person_period_idx
  on aureka_patient_safety.culture_responses (respondent_person_id, survey_period)
  where identity_mode = 'named';
create index if not exists culture_responses_submitter_idx
  on aureka_patient_safety.culture_responses (submitted_by_user_id, submitted_at desc)
  where submitted_by_user_id is not null;

-- Existing rows are deliberately left legacy_anonymous and are not backfilled with guessed names.
-- New authenticated submissions must reference an active identity in the canonical staff directory.
create or replace function aureka_patient_safety.guard_named_culture_response()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, aureka_patient_safety, aureka_quality, auth
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.identity_mode = 'legacy_anonymous' then
      raise exception 'Legacy anonymous survey responses are immutable.';
    end if;
    if old.respondent_person_id is distinct from new.respondent_person_id
       or old.submitted_by_user_id is distinct from new.submitted_by_user_id
       or old.answers is distinct from new.answers then
      raise exception 'Named survey responses are immutable; create a new response with an explicit correction workflow.';
    end if;
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated account is required to submit a named response.';
  end if;
  if new.identity_mode <> 'named' then
    raise exception 'New survey submissions must use named identity mode.';
  end if;
  if new.respondent_person_id is null then
    raise exception 'Select the named respondent from the canonical workforce directory.';
  end if;
  if new.submitted_by_user_id is distinct from auth.uid() then
    raise exception 'Submitting account does not match the authenticated session.';
  end if;
  if not exists (
    select 1
    from aureka_quality.staff_directory d
    where d.id = new.respondent_person_id
      and d.directory_status = 'available'
  ) then
    raise exception 'Selected respondent is not available in the canonical workforce directory.';
  end if;
  return new;
end;
$function$;

revoke all on function aureka_patient_safety.guard_named_culture_response() from public, anon, authenticated;
drop trigger if exists culture_response_named_identity_guard on aureka_patient_safety.culture_responses;
create trigger culture_response_named_identity_guard
  before insert or update on aureka_patient_safety.culture_responses
  for each row execute function aureka_patient_safety.guard_named_culture_response();

-- Keep INSERT-only semantics for authenticated users. Do not add SELECT grants or weaken the existing
-- ADMIN-only raw-response policy. Named identity is visible only through the existing authorized read path.
revoke update, delete on aureka_patient_safety.culture_responses from authenticated;
grant insert on aureka_patient_safety.culture_responses to authenticated;

commit;
