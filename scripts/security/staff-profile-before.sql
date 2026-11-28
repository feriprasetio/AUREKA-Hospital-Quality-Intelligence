-- Prove the original bug using only synthetic fixture data.
SET ROLE authenticated;
SELECT set_config('arctic.uid','99999999-9999-4999-8999-999999999999',false);
SELECT set_config('arctic.role','',false);
DO $$ BEGIN
 IF public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111')->'staff'->>'employee_code' IS DISTINCT FROM 'SYNTH-1' THEN RAISE EXCEPTION 'Baseline null-role behavior not reproduced'; END IF;
END $$;
SELECT set_config('arctic.role','MANAGEMENT',false);
DO $$ BEGIN
 IF jsonb_array_length(public.aureka_staff_cross_module_profile('11111111-1111-4111-8111-111111111111')->'named_culture_history') <> 2 THEN RAISE EXCEPTION 'Baseline cross-unit behavior not reproduced'; END IF;
END $$;
RESET ROLE;
