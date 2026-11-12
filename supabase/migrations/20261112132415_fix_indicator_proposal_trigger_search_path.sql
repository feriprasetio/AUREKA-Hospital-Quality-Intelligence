-- Fix the private append-only trigger function search_path and remove direct execution grants.
begin;
create or replace function aureka_governance.indicator_proposal_event_immutable()
returns trigger
language plpgsql
set search_path = aureka_governance, pg_temp
as $$
begin
  raise exception 'Riwayat usulan indikator bersifat append-only.';
end;
$$;
revoke all on function aureka_governance.indicator_proposal_event_immutable() from public, anon, authenticated;
commit;
