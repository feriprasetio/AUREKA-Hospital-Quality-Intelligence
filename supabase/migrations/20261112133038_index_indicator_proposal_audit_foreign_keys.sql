-- Add covering indexes for foreign keys on proposal review and audit actors.
begin;
create index if not exists indicator_proposal_events_actor_user_id_idx
  on aureka_governance.indicator_proposal_events(actor_user_id);
create index if not exists indicator_proposals_reviewed_by_idx
  on aureka_governance.indicator_proposals(reviewed_by);
create index if not exists indicator_proposals_activated_by_idx
  on aureka_governance.indicator_proposals(activated_by);
create index if not exists indicator_proposals_activated_profile_id_idx
  on aureka_governance.indicator_proposals(activated_profile_id);
commit;
