-- Disposable database ONLY. Never execute on any AUREKA database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA aureka_system;
CREATE SCHEMA aureka_quality;
CREATE SCHEMA aureka_patient_safety;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('arctic.uid',true),'')::uuid $$;
CREATE FUNCTION aureka_system.current_role_code() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('arctic.role',true),'') $$;
CREATE FUNCTION aureka_system.has_quality_room_access(p_room_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() IS NOT NULL AND (aureka_system.current_role_code() IN ('ADMIN','PMKP') OR p_room_id=1), false)
$$;
CREATE FUNCTION public.aureka_has_permission(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.master_rooms(id bigint primary key,name text);
CREATE TABLE aureka_quality.staff_directory(id uuid primary key,employee_code text,display_name text,profession_group text,position_title text,source_unit text,directory_status text);
CREATE TABLE aureka_quality.staff_team_assignments(id uuid primary key,staff_id uuid,room_id bigint,assignment_status text,assigned_at timestamptz,released_at timestamptz,is_locked boolean);
CREATE TABLE aureka_quality.oppe_fppe_evaluations(id uuid,staff_id uuid,room_id bigint,evaluation_type text,status text,period_start date,period_end date,summary_json jsonb,review_note text,validated_at timestamptz,created_at timestamptz);
CREATE TABLE aureka_quality.staff_entity_attributions(staff_id uuid,entity_id uuid,entity_type text);
CREATE TABLE aureka_patient_safety.incidents(id uuid,room_id bigint,incident_code text,incident_date date,unit_name text,incident_type text,status text,created_at timestamptz);
CREATE TABLE aureka_patient_safety.culture_responses(survey_period text,respondent_room_id bigint,submitted_at timestamptz,respondent_person_id uuid,identity_mode text);
INSERT INTO public.master_rooms VALUES(1,'SYNTHETIC OWN'),(2,'SYNTHETIC OTHER');
INSERT INTO aureka_quality.staff_directory VALUES
 ('11111111-1111-4111-8111-111111111111','SYNTH-1','Synthetic staff','Test','Test','Own','available'),
 ('22222222-2222-4222-8222-222222222222','SYNTH-2','Synthetic other','Test','Test','Other','available');
INSERT INTO aureka_quality.staff_team_assignments VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',1,'active',now(),null,true),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',2,'active',now(),null,true);
INSERT INTO aureka_patient_safety.culture_responses VALUES
 ('2026-10',1,now(),'11111111-1111-4111-8111-111111111111','named'),
 ('2026-10',2,now(),'11111111-1111-4111-8111-111111111111','named'),
 ('2026-10',1,now(),'11111111-1111-4111-8111-111111111111','anonymous');
