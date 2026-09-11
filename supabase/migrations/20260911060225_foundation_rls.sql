drop policy if exists "Authenticated users can read active rooms" on public.master_rooms;
create policy "Authenticated users can read active rooms" on public.master_rooms for select to authenticated using (is_active = true);

drop policy if exists "Authenticated can read roles" on aureka_system.app_roles;
create policy "Authenticated can read roles" on aureka_system.app_roles for select to authenticated using (is_active = true);

drop policy if exists "Authenticated can read settings" on aureka_system.app_settings;
create policy "Authenticated can read settings" on aureka_system.app_settings for select to authenticated using (true);

drop policy if exists "Authenticated can read active modules" on aureka_system.module_registry;
create policy "Authenticated can read active modules" on aureka_system.module_registry for select to authenticated using (is_active = true);

drop policy if exists "Users can read own profile" on aureka_system.user_profiles;
create policy "Users can read own profile" on aureka_system.user_profiles for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own profile" on aureka_system.user_profiles;
create policy "Users can update own profile" on aureka_system.user_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own room assignments" on aureka_system.user_room_assignments;
create policy "Users can read own room assignments" on aureka_system.user_room_assignments for select to authenticated using ((select auth.uid()) = user_id);
