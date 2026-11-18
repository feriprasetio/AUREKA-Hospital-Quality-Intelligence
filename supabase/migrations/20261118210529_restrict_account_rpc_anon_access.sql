-- Restrict account-management RPCs to authenticated sessions.
-- Public login helpers remain intentionally executable by anon:
--   aureka_login_email(text), aureka_username_available(text).
-- Their public behavior is required by the username-based login/signup flow.
revoke execute on function public.aureka_admin_list_user_profiles() from public, anon;
revoke execute on function public.aureka_is_admin() from public, anon;
revoke execute on function public.aureka_update_my_profile(text, bigint) from public, anon;

grant execute on function public.aureka_admin_list_user_profiles() to authenticated, service_role;
grant execute on function public.aureka_is_admin() to authenticated, service_role;
grant execute on function public.aureka_update_my_profile(text, bigint) to authenticated, service_role;
