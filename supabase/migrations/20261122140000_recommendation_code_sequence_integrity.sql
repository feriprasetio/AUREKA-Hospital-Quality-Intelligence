-- AUREKA: deterministic, atomic, non-reusable governance recommendation reference.
-- Existing unique constraint recommendations_code_key is preserved; no data is deleted.
-- Keep the sequence private: only this SECURITY DEFINER function (owned by postgres) allocates codes.
CREATE SEQUENCE IF NOT EXISTS aureka_governance.recommendation_code_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  CACHE 1;

REVOKE ALL ON SEQUENCE aureka_governance.recommendation_code_seq FROM PUBLIC, anon, authenticated;

-- On first deployment, advance above the largest legacy REK-YYYY-<number> code.
-- On repeated deployment, preserve the sequence high-water mark (including deleted codes).
DO $aureka_recommendation_sequence$
DECLARE
  v_max bigint;
  v_last bigint;
  v_called boolean;
BEGIN
  SELECT coalesce(max(substring(code FROM '^REK-[0-9]{4}-([0-9]+)$')::bigint), 0)
    INTO v_max
  FROM aureka_governance.recommendations
  WHERE code ~ '^REK-[0-9]{4}-[0-9]+$';

  SELECT last_value, is_called
    INTO v_last, v_called
  FROM aureka_governance.recommendation_code_seq;

  IF v_max > v_last OR (v_max = v_last AND NOT v_called) THEN
    PERFORM pg_catalog.setval(
      'aureka_governance.recommendation_code_seq'::pg_catalog.regclass,
      v_max,
      true
    );
  END IF;
END;
$aureka_recommendation_sequence$;

CREATE OR REPLACE FUNCTION public.aureka_gov_save_recommendation(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aureka_governance', 'aureka_system', 'public', 'auth'
AS $function$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; v_code text; v_serial bigint;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then
    raise exception 'Hanya Komite PMKP / Super Admin yang dapat mengelola rekomendasi.';
  end if;
  if coalesce(p->>'issued_by_level','KETUA_PMKP') not in ('DEWAN_PENGAWAS','DIREKTUR','KETUA_PMKP','KABID') then
    raise exception 'Asal pemberi rekomendasi tidak valid.';
  end if;
  if v_id is null then
    -- Sequence allocation is concurrency-safe and never reuses a reference after deletion.
    v_serial := pg_catalog.nextval('aureka_governance.recommendation_code_seq'::pg_catalog.regclass);
    v_code := 'REK-' ||
      coalesce(nullif(p->>'program_year',''),extract(year from now())::text) || '-' ||
      pg_catalog.lpad(v_serial::text,greatest(3,pg_catalog.length(v_serial::text)),'0');
    insert into aureka_governance.recommendations
      (code,source,issued_by_level,title,description,priority,program_year,given_by_name,given_at)
    values
      (v_code,coalesce(nullif(p->>'source',''),'ketua_pmkp'),coalesce(p->>'issued_by_level','KETUA_PMKP'),
       p->>'title',coalesce(p->>'description',''),coalesce(nullif(p->>'priority',''),'sedang'),
       coalesce(nullif(p->>'program_year','')::int,extract(year from now())::int),
       nullif(p->>'given_by_name',''),coalesce(nullif(p->>'given_at','')::date,current_date))
    returning id into v_id;
    perform aureka_governance.write_audit('create','recommendation',v_id::text,p);
  else
    update aureka_governance.recommendations
       set source=coalesce(nullif(p->>'source',''),source),
           issued_by_level=coalesce(nullif(p->>'issued_by_level',''),issued_by_level),
           title=coalesce(nullif(p->>'title',''),title),description=coalesce(p->>'description',description),
           priority=coalesce(nullif(p->>'priority',''),priority),
           given_by_name=coalesce(p->>'given_by_name',given_by_name),
           given_at=coalesce(nullif(p->>'given_at','')::date,given_at),
           status=coalesce(nullif(p->>'status',''),status),updated_at=now()
     where id=v_id;
    if not found then raise exception 'Rekomendasi tidak ditemukan.'; end if;
    perform aureka_governance.write_audit('update','recommendation',v_id::text,p);
  end if;
  return v_id;
end;
$function$

