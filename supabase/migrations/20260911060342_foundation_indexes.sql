create index if not exists user_profiles_primary_room_id_idx on aureka_system.user_profiles(primary_room_id);
create index if not exists user_profiles_role_id_idx on aureka_system.user_profiles(role_id);
create index if not exists user_room_assignments_room_id_idx on aureka_system.user_room_assignments(room_id);
create index if not exists user_room_assignments_user_id_idx on aureka_system.user_room_assignments(user_id);
