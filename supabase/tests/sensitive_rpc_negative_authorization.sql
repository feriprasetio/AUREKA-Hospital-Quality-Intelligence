-- Negative authorization regression, with synthetic JWT claims and no production data changes.
BEGIN;
DO $test$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}',true);
  IF auth.uid() IS NULL OR aureka_system.current_role_code() IS NOT NULL THEN RAISE EXCEPTION 'Synthetic context not isolated'; END IF;
  BEGIN PERFORM public.aureka_list_legal_artifacts(); RAISE EXCEPTION 'Unauthorized request was not rejected: legal artifact list'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_list_legal_signature_assets(); RAISE EXCEPTION 'Unauthorized request was not rejected: signature asset list'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_get_artifact_signature_stamps('00000000-0000-4000-8000-000000000001'::uuid); RAISE EXCEPTION 'Unauthorized request was not rejected: signature stamp'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_revoke_legal_signature_asset('00000000-0000-4000-8000-000000000001'::uuid,'synthetic audit'); RAISE EXCEPTION 'Unauthorized request was not rejected: signature revoke'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_nara_icd10_review_queue(NULL,NULL,1); RAISE EXCEPTION 'Unauthorized request was not rejected: ICD review'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_nara_icd10_upsert_mapping('','', '', 'proposed',NULL,NULL); RAISE EXCEPTION 'Unauthorized request was not rejected: ICD update'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_patient_detail_bundle('00000000-0000-4000-8000-000000000001'::uuid,'synthetic audit'); RAISE EXCEPTION 'Unauthorized request was not rejected: patient bundle'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_reactive_fmea_save('{}'::jsonb); RAISE EXCEPTION 'Unauthorized request was not rejected: FMEA save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_reactive_fmea_update_status('00000000-0000-4000-8000-000000000001'::uuid,'Open'); RAISE EXCEPTION 'Unauthorized request was not rejected: FMEA status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.aureka_validator_review_quality_record('00000000-0000-4000-8000-000000000001'::uuid,'validated',NULL); RAISE EXCEPTION 'Unauthorized request was not rejected: quality review'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM aureka_quality.validate_quality_monthly_report(-1,2026,10); RAISE EXCEPTION 'Unauthorized request was not rejected: monthly report'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM aureka_risk.transition_mitigation_plan_internal('00000000-0000-4000-8000-000000000001'::uuid,'submit','synthetic audit'); RAISE EXCEPTION 'Unauthorized request was not rejected: mitigation plan'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
