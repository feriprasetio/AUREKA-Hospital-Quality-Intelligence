-- Orientation-specific limits are enforced by the event-scoped trigger, not globally.
-- Keep the shared education_participants table extensible for IHT and other training events.
alter table aureka_system.education_participants
  drop constraint if exists education_participants_orientation_role_check,
  drop constraint if exists education_participants_orientation_materials_check,
  drop constraint if exists education_participants_orientation_notes_check;

notify pgrst, 'reload schema';
