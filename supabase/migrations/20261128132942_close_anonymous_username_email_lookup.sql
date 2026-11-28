REVOKE EXECUTE ON FUNCTION public.aureka_login_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_login_email(text) TO service_role;
