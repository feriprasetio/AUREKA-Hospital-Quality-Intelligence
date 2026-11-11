DO $$
DECLARE r record; v_index_name text;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name,a.attnum
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class refc ON refc.oid=con.confrelid
    JOIN pg_namespace refn ON refn.oid=refc.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY k(attnum,ord) ON true
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
    WHERE con.contype='f' AND refn.nspname='auth' AND refc.relname='users'
      AND n.nspname IN ('public','aureka_system','aureka_quality','aureka_patient_safety','aureka_risk','aureka_analytics')
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid=c.oid AND i.indisvalid AND i.indkey[0]=a.attnum
      )
  LOOP
    v_index_name := left('aureka_fk_' || r.table_name || '_' || r.column_name || '_idx', 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
                   v_index_name,r.schema_name,r.table_name,r.column_name);
  END LOOP;
END $$;
