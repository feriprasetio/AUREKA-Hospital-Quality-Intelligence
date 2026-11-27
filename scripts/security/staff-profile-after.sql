-- Verify negative and positive cases using only synthetic fixture data.
DO $$ BEGIN
 IF has_function_privilege('anon','public.aureka_staff_cross_module_profile(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous execute granted'; END IF;
 IF NOT has_function_privilege('authenticated','public.aureka_staff_cross_module_profile(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Authenticated execute missing'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('arctic.uid','99999999-9999-4999-8999-999999999999',false);
SELECT set_config('arctic.role','',false);
DO $$ BEGIN
 BEGIN
  PERFORM public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Inactive/null role unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('arctic.uid','',false);
SELECT set_config('arctic.role','ADMIN',false);
DO $$ BEGIN
 BEGIN
  PERFORM public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Missing auth unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('arctic.uid','99999999-9999-4999-8999-999999999999',false);
SELECT set_config('arctic.role','MANAGEMENT',false);
DO $$ DECLARE v jsonb; BEGIN
 v:=public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111');
 IF jsonb_array_length(v->'named_culture_history')<>1 OR v->'named_culture_history'->0->>'unit_name'<>'SYNTHETIC OWN' OR (v->'named_culture_history'->0->>'response_count')::int<>1 THEN RAISE EXCEPTION 'Management scope or anonymous suppression incorrect'; END IF;
END $$;
SELECT set_config('arctic.role','ADMIN',false);
DO $$ BEGIN
 IF jsonb_array_length(public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111')->'named_culture_history')<>2 THEN RAISE EXCEPTION 'Admin broad scope changed'; END IF;
END $$;
SELECT set_config('arctic.role','PMKP',false);
DO $$ BEGIN
 IF jsonb_array_length(public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111')->'named_culture_history')<>2 THEN RAISE EXCEPTION 'PMKP broad scope changed'; END IF;
END $$;
SELECT set_config('arctic.role','PIC',false);
DO $$ DECLARE v jsonb; BEGIN
 v:=public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111');
 IF jsonb_array_length(v->'assignments')<>1 OR jsonb_array_length(v->'named_culture_history')<>0 THEN RAISE EXCEPTION 'PIC allowed scope changed'; END IF;
 BEGIN
  PERFORM public.aureka_staff_cross_module_profile('22222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION 'PIC other room unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT 'PASS: baseline reproduction and candidate isolated role/scope assertions' AS result;
