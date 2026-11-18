-- Convert row-invariant auth.uid() policy calls into initplan expressions.
-- The rewrite is semantics-preserving: auth.uid() is statement/session invariant.
-- Existing policy names, roles, commands, permissive/restrictive mode, and predicates remain intact.
do $aureka_rls_initplan$
declare
  p record;
  v_roles text;
  v_command text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      pol.polname,
      pol.polcmd,
      pol.polpermissive,
      pol.polroles,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname like 'aureka_%'
      and (
        (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%auth.uid()%'
          and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not ilike '%select auth.uid()%')
        or
        (coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%auth.uid()%'
          and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') not ilike '%select auth.uid()%')
      )
  loop
    select string_agg(
      case when role_item.role_oid = 0 then 'public'
           else quote_ident(pg_get_userbyid(role_item.role_oid))
      end,
      ', ' order by role_item.ordinality
    )
    into v_roles
    from unnest(p.polroles) with ordinality as role_item(role_oid, ordinality);

    v_command := case p.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      else 'ALL'
    end;

    v_using := case when p.using_expr is null then null
      else regexp_replace(p.using_expr, 'auth\.uid\(\)', '(select auth.uid())', 'gi')
    end;
    v_check := case when p.check_expr is null then null
      else regexp_replace(p.check_expr, 'auth\.uid\(\)', '(select auth.uid())', 'gi')
    end;

    execute format('drop policy %I on %I.%I', p.polname, p.schema_name, p.table_name);
    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.polname,
      p.schema_name,
      p.table_name,
      case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
      v_command,
      v_roles
    );
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end
$aureka_rls_initplan$;
