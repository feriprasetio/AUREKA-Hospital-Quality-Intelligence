-- Harden nullable direct role guards; retain existing business logic and grants.
CREATE OR REPLACE FUNCTION aureka_quality.guard_standard_operating_procedure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aureka_quality', 'aureka_system', 'public'
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_role text:=aureka_system.current_role_code();
BEGIN
 IF v_actor IS NULL OR coalesce(v_role,'') NOT IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') THEN
  RAISE EXCEPTION 'Akses pengelolaan SPO tidak diizinkan.' USING ERRCODE='42501';
 END IF;
 IF NEW.updated_by IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'updated_by harus menunjukkan pengguna aktif.' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by IS NULL THEN NEW.created_by:=v_actor; ELSIF NEW.created_by IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'created_by tidak dapat mewakili pengguna lain.' USING ERRCODE='42501'; END IF;
  IF NEW.status<>'draft' THEN RAISE EXCEPTION 'SPO baru harus dimulai sebagai draf.'; END IF;
  NEW.approved_by:=NULL; NEW.approved_at:=NULL;
 ELSE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Identitas pembuat SPO tidak dapat diubah.' USING ERRCODE='42501'; END IF;
  IF OLD.status='approved' AND ROW(
   NEW.title,NEW.document_number,NEW.revision_number,NEW.page_count,NEW.issue_date,NEW.approval_title,NEW.approval_name,NEW.approval_identifier,
   NEW.understanding,NEW.purpose,NEW.policy,NEW.procedure_steps,NEW.related_units,NEW.flowchart,NEW.source_file_name,NEW.source_file_mime_type,
   NEW.source_file_size_bytes,NEW.source_storage_path,NEW.source_sha256
  ) IS DISTINCT FROM ROW(
   OLD.title,OLD.document_number,OLD.revision_number,OLD.page_count,OLD.issue_date,OLD.approval_title,OLD.approval_name,OLD.approval_identifier,
   OLD.understanding,OLD.purpose,OLD.policy,OLD.procedure_steps,OLD.related_units,OLD.flowchart,OLD.source_file_name,OLD.source_file_mime_type,
   OLD.source_file_size_bytes,OLD.source_storage_path,OLD.source_sha256
  ) THEN RAISE EXCEPTION 'SPO yang disahkan terkunci. Buat revisi baru untuk mengubah isinya.'; END IF;
  IF OLD.status='approved' AND NEW.status NOT IN ('approved','archived') THEN RAISE EXCEPTION 'SPO yang telah disahkan hanya dapat diarsipkan.'; END IF;
 END IF;
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
  IF coalesce(v_role,'') NOT IN ('ADMIN','PMKP','DIREKTUR') THEN RAISE EXCEPTION 'Pengesahan hanya dapat dilakukan oleh ADMIN, PMKP, atau Direktur.' USING ERRCODE='42501'; END IF;
  NEW.approved_by:=v_actor; NEW.approved_at:=COALESCE(NEW.approved_at,now());
 END IF;
 IF NEW.status<>'approved' AND TG_OP='UPDATE' AND OLD.status<>'approved' THEN NEW.approved_by:=NULL; NEW.approved_at:=NULL; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.validate_quality_monthly_report(p_room_id bigint, p_report_year integer, p_report_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_today date := (now() AT TIME ZONE 'Asia/Pontianak')::date;
  v_period_start date;
  v_period_end date;
  v_deadline date;
  v_quality_count integer := 0;
  v_pathway_count integer := 0;
  v_death_count integer := 0;
  v_total integer := 0;
  v_row aureka_quality.monthly_report_validations%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengesahkan pemeriksaan laporan bulanan.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS DISTINCT FROM 'VALIDATOR' THEN
    RAISE EXCEPTION 'Pemeriksaan laporan bulanan hanya dapat dilakukan oleh akun Validator.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR p_room_id <= 0 OR p_report_year NOT BETWEEN 2020 AND 2100 OR p_report_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Unit atau periode laporan tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Validator tidak memiliki akses ke unit laporan ini.' USING ERRCODE = '42501';
  END IF;

  v_period_start := make_date(p_report_year, p_report_month, 1);
  IF v_period_start <> (date_trunc('month', v_today)::date - interval '1 month')::date THEN
    RAISE EXCEPTION 'Validasi hanya dapat dilakukan untuk laporan bulan kalender sebelumnya.' USING ERRCODE = '22023';
  END IF;
  v_period_end := (v_period_start + interval '1 month')::date;
  v_deadline := (v_period_start + interval '1 month' + interval '9 days')::date;

  SELECT count(*)::integer INTO v_quality_count
  FROM aureka_quality.quality_records
  WHERE room_id=p_room_id
    AND record_date >= v_period_start
    AND record_date < v_period_end
    AND status IN ('ready','validated','reopened');

  SELECT count(*)::integer INTO v_pathway_count
  FROM aureka_quality.clinical_pathway_audits
  WHERE room_id=p_room_id
    AND admission_date >= v_period_start
    AND admission_date < v_period_end
    AND status IN ('submitted','validated');

  -- Audit Klinis/Kematian memakai review_period = YYYY untuk keunikan tahunan.
  -- Pengelompokan laporan bulanan mengikuti tanggal episode pada snapshot, bukan review_period.
  SELECT count(*)::integer INTO v_death_count
  FROM aureka_quality.clinical_death_audits
  WHERE room_id=p_room_id
    AND status IN ('submitted','validated')
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    ) ~ '^\d{4}-\d{2}-\d{2}$'
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    )::date >= v_period_start
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    )::date < v_period_end;

  v_total := v_quality_count + v_pathway_count + v_death_count;

  INSERT INTO aureka_quality.monthly_report_validations (
    room_id, report_year, report_month,
    quality_record_count, clinical_pathway_count, clinical_death_count,
    total_record_count, deadline_date, validated_by, validated_at, validated_on_time
  ) VALUES (
    p_room_id, p_report_year, p_report_month,
    v_quality_count, v_pathway_count, v_death_count,
    v_total, v_deadline, v_user_id, now(), v_today <= v_deadline
  )
  ON CONFLICT (room_id, report_year, report_month) DO NOTHING
  RETURNING * INTO v_row;

  v_inserted := FOUND;
  IF NOT v_inserted THEN
    SELECT * INTO v_row
    FROM aureka_quality.monthly_report_validations
    WHERE room_id=p_room_id AND report_year=p_report_year AND report_month=p_report_month;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'room_id', v_row.room_id,
    'report_year', v_row.report_year,
    'report_month', v_row.report_month,
    'quality_record_count', v_row.quality_record_count,
    'clinical_pathway_count', v_row.clinical_pathway_count,
    'clinical_death_count', v_row.clinical_death_count,
    'total_record_count', v_row.total_record_count,
    'deadline_date', v_row.deadline_date,
    'validated_by', v_row.validated_by,
    'validated_at', v_row.validated_at,
    'validated_on_time', v_row.validated_on_time,
    'already_validated', NOT v_inserted
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_risk.transition_mitigation_plan_internal(p_plan_id uuid, p_action text, p_note text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aureka_risk', 'aureka_system', 'public'
AS $function$
declare
  v_plan aureka_risk.mitigation_plans%rowtype;
  v_role text;
  v_next text;
  v_note text := coalesce(trim(p_note), '');
  v_actor_name text;
begin
  if auth.uid() is null or aureka_system.current_role_code() is null then raise exception 'Role tidak aktif.' using errcode='42501'; end if;
  select * into v_plan from aureka_risk.mitigation_plans where id = p_plan_id for update;
  if not found then raise exception 'Rencana mitigasi tidak ditemukan.'; end if;
  v_role := aureka_risk.current_role_code();
  select coalesce(full_name, 'Pengguna AUREKA') into v_actor_name
    from aureka_system.user_profiles where user_id = auth.uid();
  v_actor_name := coalesce(v_actor_name, 'Pengguna AUREKA');

  if p_action in ('submit','resubmit') then
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('ADMIN','PMKP')) then
      raise exception 'Hanya penyusun, pemilik unit, atau pengelola yang dapat mengirim rencana.';
    end if;
    v_next := case v_plan.status
      when 'draft' then 'pending_kabid'
      when 'returned_unit' then 'pending_kabid'
      when 'returned_kabid' then 'pending_director'
      when 'returned_director' then 'pending_board'
      else null end;
    if v_next is null then raise exception 'Status rencana tidak dapat dikirim pada tahap ini.'; end if;
  elsif p_action = 'approve' then
    if v_plan.status = 'pending_kabid' and v_role = 'KABID' then
      v_next := 'pending_director';
    elsif v_plan.status = 'pending_director' and v_role = 'DIREKTUR' then
      v_next := 'pending_board';
    elsif v_plan.status = 'pending_board' and v_role = 'DEWAN_PENGAWAS' then
      v_next := 'approved';
    else
      raise exception 'Persetujuan harus mengikuti urutan Kabid, Direktur, kemudian Dewan Pengawas.';
    end if;
    if v_note = '' then raise exception 'Catatan persetujuan wajib diisi untuk jejak keputusan.'; end if;
  elsif p_action = 'return' then
    if v_note = '' then raise exception 'Alasan pengembalian wajib diisi.'; end if;
    if v_plan.status = 'pending_kabid' and v_role = 'KABID' then
      v_next := 'returned_unit';
    elsif v_plan.status = 'pending_director' and v_role = 'DIREKTUR' then
      v_next := 'returned_kabid';
    elsif v_plan.status = 'pending_board' and v_role = 'DEWAN_PENGAWAS' then
      v_next := 'returned_director';
    else
      raise exception 'Hanya pejabat pada tahap aktif yang dapat mengembalikan rencana.';
    end if;
  elsif p_action = 'start' then
    if v_plan.status <> 'approved' then raise exception 'Pelaksanaan hanya dapat dimulai setelah persetujuan berjenjang selesai.'; end if;
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('PMKP','KABID','DIREKTUR')) then
      raise exception 'Akses tidak cukup untuk memulai pelaksanaan.';
    end if;
    v_next := 'in_progress';
  elsif p_action = 'evaluate' then
    if v_plan.status <> 'in_progress' then raise exception 'Evaluasi hanya tersedia untuk rencana yang sedang berjalan.'; end if;
    if v_note = '' then raise exception 'Hasil evaluasi wajib diisi.'; end if;
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('PMKP','KABID','DIREKTUR')) then
      raise exception 'Akses tidak cukup untuk mengevaluasi rencana.';
    end if;
    v_next := 'evaluated';
  elsif p_action = 'close' then
    if v_plan.status <> 'evaluated' then raise exception 'Rencana harus dievaluasi sebelum ditutup.'; end if;
    if v_role not in ('PMKP','KABID','DIREKTUR') then raise exception 'Penutupan rencana memerlukan penelaahan PMKP atau manajemen.'; end if;
    if not exists (select 1 from aureka_risk.mitigation_plan_risks m where m.plan_id = v_plan.id) then
      raise exception 'Rencana belum memiliki risiko terkait.';
    end if;
    if exists (
      select 1 from aureka_risk.mitigation_plan_risks m
      join aureka_risk.risk_register r on r.id = m.risk_id
      where m.plan_id = v_plan.id and (r.residual_score is null or r.residual_score >= 10)
    ) then
      raise exception 'Penutupan ditolak: seluruh risiko terkait harus memiliki residual terverifikasi di area penerimaan (skor di bawah 10).';
    end if;
    if v_note = '' then raise exception 'Catatan penutupan wajib diisi.'; end if;
    v_next := 'closed';
  else
    raise exception 'Aksi workflow tidak dikenal.';
  end if;

  update aureka_risk.mitigation_plans
  set status = v_next,
      kabid_approved_by = case when p_action = 'approve' and v_plan.status = 'pending_kabid' then auth.uid() else kabid_approved_by end,
      kabid_approved_at = case when p_action = 'approve' and v_plan.status = 'pending_kabid' then now() else kabid_approved_at end,
      director_approved_by = case when p_action = 'approve' and v_plan.status = 'pending_director' then auth.uid() else director_approved_by end,
      director_approved_at = case when p_action = 'approve' and v_plan.status = 'pending_director' then now() else director_approved_at end,
      board_acknowledged_by = case when p_action = 'approve' and v_plan.status = 'pending_board' then auth.uid() else board_acknowledged_by end,
      board_acknowledged_at = case when p_action = 'approve' and v_plan.status = 'pending_board' then now() else board_acknowledged_at end,
      last_return_note = case when p_action = 'return' then v_note else last_return_note end,
      updated_at = now()
  where id = v_plan.id;

  insert into aureka_risk.risk_workflow_events(plan_id, from_status, to_status, action, note, actor_id, actor_name)
  values (v_plan.id, v_plan.status, v_next, p_action, v_note, auth.uid(), v_actor_name);
  return v_next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_list_legal_artifacts()
 RETURNS TABLE(artifact_id uuid, artifact_code text, title text, artifact_type text, created_at timestamp with time zone, sha256 text, signatures jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or NOT aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang melihat register dokumen legal.' using errcode='42501';
  end if;
  return query
  select a.id,a.artifact_code,a.title,a.artifact_type,a.created_at,a.sha256,
    coalesce(jsonb_agg(jsonb_build_object(
      'signer',s.signer_display_name,'role',s.signer_role,'signed_at',s.signed_at,
      'verification_code',s.verification_code,'signature_asset_id',s.signature_asset_id,
      'signature_type',s.signature_type
    ) order by s.signed_at) filter(where s.id is not null),'[]'::jsonb) as signatures
  from aureka_system.generated_artifacts a
  left join aureka_system.document_signatures s on s.artifact_id=a.id and s.revoked_at is null
  where (a.created_by=auth.uid() or aureka_system.can_approve_documents())
    and aureka_system.can_access_room_or_global(a.room_id)
  group by a.id
  order by a.created_at desc
  limit 250;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_list_legal_signature_assets()
 RETURNS TABLE(asset_id uuid, asset_code text, signer_name text, signer_position text, required_role text, status text, image_mime_type text, image_data_base64 text, image_sha256 text, authorized_at timestamp with time zone, authorized_user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or NOT aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang melihat aset tanda tangan.' using errcode='42501';
  end if;
  return query
    select a.id,a.asset_code,a.signer_name,a.signer_position,a.required_role,a.status,
           a.image_mime_type,a.image_data_base64,a.image_sha256,a.authorized_at,a.authorized_user_id
    from aureka_system.legal_signature_assets a
    order by case a.required_role when 'DIREKTUR' then 1 else 2 end,a.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_nara_icd10_review_queue(p_year integer DEFAULT NULL::integer, p_room bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 100)
 RETURNS TABLE(diagnosis text, patient_count bigint, mapping_status text, icd10_code text, icd10_title text, validation_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := aureka_system.current_role_code();
  v_year integer := coalesce(p_year, extract(year from (pg_catalog.now() at time zone 'Asia/Pontianak'))::integer);
  v_rooms bigint[];
  v_has_patient_diagnoses boolean := false;
  v_rows integer := 0;
  v_basis text := 'no_clinical_data';
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if coalesce(v_role,'') NOT IN ('ADMIN','PMKP') then raise exception 'Antrian koding hanya tersedia untuk Super Admin dan Komite PMKP.' using errcode = '42501'; end if;
  if v_year < 2000 or v_year > 2100 then raise exception 'Tahun analisis tidak valid.' using errcode = '22023'; end if;
  if p_room is not null and not aureka_system.has_quality_room_access(p_room) then
    raise exception 'Akses unit tidak diberikan.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(r.id), '{}'::bigint[]) into v_rooms
  from public.master_rooms r
  where r.is_active = true and aureka_system.has_quality_room_access(r.id)
    and (p_room is null or r.id = p_room);

  if coalesce(pg_catalog.cardinality(v_rooms),0) = 0 then
    raise exception 'Tidak ada unit yang dapat diakses untuk antrian koding.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from aureka_quality.patient_index p
    join public.master_rooms r on r.name = p.unit_terakhir
    where r.id = any(v_rooms)
      and p.last_seen >= pg_catalog.make_date(v_year,1,1)
      and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
      and nullif(pg_catalog.btrim(p.diagnosis_terakhir),'') is not null
      and pg_catalog.length(pg_catalog.btrim(p.diagnosis_terakhir)) between 2 and 120
      and aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) is not null
      and p.diagnosis_terakhir !~ '[0-9]{6,}'
      and p.diagnosis_terakhir !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
      and p.diagnosis_terakhir !~* '^[0-9[:space:]+()./-]+$'
      and p.diagnosis_terakhir !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
      and p.diagnosis_terakhir !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
      and lower(btrim(p.diagnosis_terakhir)) is distinct from lower(btrim(p.nama_pasien))
  ) into v_has_patient_diagnoses;

  if v_has_patient_diagnoses then
    v_basis := 'patient_index_latest_diagnosis';
    return query
    with src as (
      select p.no_rm as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(p.diagnosis_terakhir), '[[:space:]]+', ' ', 'g')) as label,
        aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) as diagnosis_key
      from aureka_quality.patient_index p
      join public.master_rooms r on r.name = p.unit_terakhir
      where r.id = any(v_rooms)
        and p.last_seen >= pg_catalog.make_date(v_year,1,1)
        and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
        and nullif(pg_catalog.btrim(p.diagnosis_terakhir),'') is not null
        and pg_catalog.length(pg_catalog.btrim(p.diagnosis_terakhir)) between 2 and 120
        and aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) is not null
        and p.diagnosis_terakhir !~ '[0-9]{6,}'
        and p.diagnosis_terakhir !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and p.diagnosis_terakhir !~* '^[0-9[:space:]+()./-]+$'
        and p.diagnosis_terakhir !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
        and p.diagnosis_terakhir !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
        and lower(btrim(p.diagnosis_terakhir)) is distinct from lower(btrim(p.nama_pasien))
    ), grouped as (
      select diagnosis_key, pg_catalog.min(label) as label,
        pg_catalog.count(distinct internal_no_rm)::bigint as n
      from src
      where diagnosis_key is not null
      group by diagnosis_key
      having pg_catalog.count(distinct internal_no_rm) >= 5
    )
    select g.label, g.n, coalesce(d.mapping_status,'unmapped'), d.icd10_code, d.icd10_title, d.validation_reference
    from grouped g
    left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = g.diagnosis_key
    where coalesce(d.mapping_status,'unmapped') <> 'validated'
    order by g.n desc, g.label
    limit greatest(1,least(coalesce(p_limit,100),200));
  else
    v_basis := 'episode_records';
    return query
    with src as (
      select
        aureka_quality.normalize_no_rm(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'medical_record_no'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. Rekam Medis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. RM'),'')
        )) as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        )), '[[:space:]]+', ' ', 'g')) as label,
        aureka_quality.nara_normalize_diagnosis(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        )) as diagnosis_key,
        coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        ) as raw_diagnosis
      from aureka_quality.quality_records q
      where q.room_id = any(v_rooms) and q.measurement_grain='patient_episode'
        and q.archived_at is null and q.status <> 'archived'
        and coalesce(q.record_date,q.created_at::date) >= pg_catalog.make_date(v_year,1,1)
        and coalesce(q.record_date,q.created_at::date) < pg_catalog.make_date(v_year+1,1,1)
    ), safe_src as (
      select * from src
      where raw_diagnosis is not null
        and pg_catalog.length(label) between 2 and 120
        and diagnosis_key is not null
        and raw_diagnosis !~ '[0-9]{6,}'
        and raw_diagnosis !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and raw_diagnosis !~* '^[0-9[:space:]+()./-]+$'
        and raw_diagnosis !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
        and raw_diagnosis !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
        and not exists (
          select 1 from aureka_quality.patient_index pi
          where pi.no_rm = src.internal_no_rm
            and lower(btrim(pi.nama_pasien)) = lower(btrim(src.raw_diagnosis))
        )
    ), grouped as (
      select diagnosis_key, pg_catalog.min(label) as label,
        pg_catalog.count(distinct internal_no_rm)::bigint as n
      from safe_src
      group by diagnosis_key
      having pg_catalog.count(distinct internal_no_rm) >= 5
    )
    select g.label, g.n, coalesce(d.mapping_status,'unmapped'), d.icd10_code, d.icd10_title, d.validation_reference
    from grouped g
    left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = g.diagnosis_key
    where coalesce(d.mapping_status,'unmapped') <> 'validated'
    order by g.n desc, g.label
    limit greatest(1,least(coalesce(p_limit,100),200));
  end if;

  get diagnostics v_rows = row_count;
  insert into aureka_quality.nara_clinical_access_audit(
    user_id, role_code, data_year, room_scope, source_basis,
    patient_count, episode_count, diagnosis_group_count, suppressed_group_count
  ) values (
    auth.uid(), v_role, v_year, p_room, v_basis,
    0, 0, v_rows, 0
  );
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_nara_icd10_upsert_mapping(p_diagnosis text, p_icd10_code text, p_icd10_title text, p_status text DEFAULT 'proposed'::text, p_validation_reference text DEFAULT NULL::text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := aureka_system.current_role_code();
  v_key text := aureka_quality.nara_normalize_diagnosis(coalesce(p_diagnosis,''));
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if coalesce(v_role,'') NOT IN ('ADMIN','PMKP') then raise exception 'Hanya Super Admin atau Komite PMKP yang dapat mengelola pemetaan ICD-10.' using errcode = '42501'; end if;
  if v_key is null or pg_catalog.length(v_key) < 2 or pg_catalog.length(v_key) > 120 then raise exception 'Istilah diagnosis tidak valid.' using errcode = '22023'; end if;
  if p_status not in ('proposed','validated','rejected') then raise exception 'Status pemetaan tidak valid.' using errcode = '22023'; end if;
  if p_status = 'validated' and (
    coalesce(p_icd10_code,'') !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'
    or nullif(pg_catalog.btrim(coalesce(p_icd10_title,'')),'') is null
    or nullif(pg_catalog.btrim(coalesce(p_validation_reference,'')),'') is null
  ) then raise exception 'Pemetaan tervalidasi wajib memiliki kode, judul, dan referensi validasi.' using errcode = '22023'; end if;

  insert into aureka_quality.nara_icd10_dictionary(
    diagnosis_key, diagnosis_label, icd10_code, icd10_title, code_set, mapping_status,
    validation_reference, review_note, created_by, updated_by, validated_by, validated_at
  ) values (
    v_key, pg_catalog.upper(pg_catalog.btrim(p_diagnosis)), nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_icd10_code,''))), ''),
    nullif(pg_catalog.btrim(coalesce(p_icd10_title,'')), ''), 'WHO ICD-10 2019', p_status,
    nullif(pg_catalog.btrim(coalesce(p_validation_reference,'')), ''), nullif(pg_catalog.btrim(coalesce(p_review_note,'')), ''),
    auth.uid(), auth.uid(), case when p_status='validated' then auth.uid() end, case when p_status='validated' then pg_catalog.now() end
  )
  on conflict (diagnosis_key) do update set
    diagnosis_label=excluded.diagnosis_label,
    icd10_code=excluded.icd10_code,
    icd10_title=excluded.icd10_title,
    mapping_status=excluded.mapping_status,
    validation_reference=excluded.validation_reference,
    review_note=excluded.review_note,
    updated_by=auth.uid(),
    updated_at=pg_catalog.now(),
    validated_by=case when excluded.mapping_status='validated' then auth.uid() else null end,
    validated_at=case when excluded.mapping_status='validated' then pg_catalog.now() else null end;

  return pg_catalog.jsonb_build_object('diagnosis_key',v_key,'status',p_status,'updated',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_patient_detail_bundle(p_patient_id uuid, p_purpose text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_patient aureka_quality.patient_index%rowtype;
  v_rooms bigint[];
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if length(trim(coalesce(p_purpose,''))) < 8 then raise exception 'Tujuan akses klinis wajib diisi (minimal 8 karakter).' using errcode = '22023'; end if;
  if coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC','VALIDATOR') then
    raise exception 'Role tidak memiliki kewenangan untuk melihat detail pasien.' using errcode = '42501';
  end if;

  select p.* into v_patient
  from aureka_quality.patient_index p
  where p.patient_id = p_patient_id
    and exists(select 1 from unnest(p.room_ids) as rid where aureka_system.has_quality_room_access(rid))
  limit 1;
  if not found then raise exception 'Pasien tidak ditemukan dalam cakupan unit yang dapat diakses.' using errcode = '42501'; end if;

  insert into aureka_quality.patient_record_access_audit(patient_index_id,user_id,purpose)
  values (v_patient.patient_id,auth.uid(),trim(p_purpose));

  select coalesce(array_agg(rid), '{}'::bigint[]) into v_rooms
  from unnest(v_patient.room_ids) as rid where aureka_system.has_quality_room_access(rid);

  select jsonb_build_object(
    'patient', jsonb_build_object(
      'patient_id',v_patient.patient_id,'no_rm',v_patient.no_rm,'nama_pasien',v_patient.nama_pasien,
      'tanggal_lahir',v_patient.tanggal_lahir,'jenis_kelamin',v_patient.jenis_kelamin,
      'first_seen',v_patient.first_seen,'last_seen',v_patient.last_seen,'total_episode',v_patient.total_episode,
      'unit_terakhir',v_patient.unit_terakhir,'diagnosis_terakhir',v_patient.diagnosis_terakhir
    ),
    'quality_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_id',q.id,'room_id',q.room_id,'unit',mr.name,'record_date',q.record_date,
        'period_start',q.period_start,'period_end',q.period_end,'status',q.status,
        'responses',coalesce((
          select jsonb_agg(jsonb_build_object(
            'indicator_code',ip.code,'indicator_title',ip.title,'category',ip.category,
            'response_label',rr.response_label,'response_code',rr.response_code,
            'raw_value',rr.raw_value,'review_status',rr.review_status
          ) order by ip.code)
          from aureka_quality.quality_record_responses rr
          join aureka_quality.indicator_profiles ip on ip.id=rr.indicator_id
          where rr.record_id=q.id
        ),'[]'::jsonb)
      ) order by coalesce(q.record_date,q.created_at::date) desc)
      from aureka_quality.quality_records q
      join public.master_rooms mr on mr.id=q.room_id
      where q.patient_index_id=v_patient.patient_id and q.room_id=any(v_rooms)
        and q.archived_at is null and q.status <> 'archived'
    ),'[]'::jsonb),
    'clinical_pathway_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'template_name',c.template_name,
        'admission_date',c.admission_date,'discharge_date',c.discharge_date,
        'unit_name',c.unit_name,'dpjp',c.dpjp,'status',c.status,'calculation',c.calculation_json)
        order by c.created_at desc)
      from aureka_quality.clinical_pathway_audits c
      where c.patient_index_id=v_patient.patient_id and c.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'clinical_death_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',d.id,'audit_type',d.audit_type,
        'review_period',d.review_period,'overall_care_score',d.overall_care_score,
        'avoidability_score',d.avoidability_score,'status',d.status) order by d.created_at desc)
      from aureka_quality.clinical_death_audits d
      where d.patient_index_id=v_patient.patient_id and d.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'incident_code',i.incident_code,
        'incident_date',i.incident_date,'incident_type',i.incident_type,'status',i.status,
        'summary',i.summary,'unit_name',i.unit_name) order by i.incident_date desc nulls last)
      from aureka_patient_safety.incidents i
      where i.patient_index_id=v_patient.patient_id and i.room_id=any(v_rooms)
    ),'[]'::jsonb),
    'realcost_audits',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'audit_code',r.audit_code,
        'service_date',r.service_date,'room_id',r.room_id,'cost_center',r.cost_center,
        'case_mix_group',r.case_mix_group,'total_cost',r.total_cost,
        'total_revenue',r.total_revenue,'cost_variance',r.cost_variance,'status',r.status)
        order by r.service_date desc nulls last)
      from aureka_quality.realcost_audits r
      where r.patient_index_id=v_patient.patient_id and r.room_id=any(v_rooms)
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_reactive_fmea_save(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := aureka_system.current_role_code();
  v_incident aureka_patient_safety.incidents%rowtype;
  v_id uuid;
  v_severity smallint := nullif(p->>'severity','')::smallint;
  v_occurrence smallint := nullif(p->>'occurrence','')::smallint;
  v_detection smallint := nullif(p->>'detection','')::smallint;
  v_code text := coalesce(nullif(trim(p->>'fmea_code'),''),'FMEA-R-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
begin
  if auth.uid() is null or coalesce(v_role,'') NOT IN ('ADMIN','PMKP','MANAGEMENT') then
    raise exception 'Role tidak berwenang mengelola FMEA Reaktif.' using errcode='42501';
  end if;
  if not aureka_system.password_rotation_complete() then
    raise exception 'Selesaikan perubahan password awal sebelum melanjutkan.' using errcode='42501';
  end if;
  if length(trim(coalesce(p->>'failure_mode',''))) < 5
     or length(trim(coalesce(p->>'failure_effect',''))) < 5
     or length(trim(coalesce(p->>'causes',''))) < 5
     or length(trim(coalesce(p->>'action_plan',''))) < 5
     or length(trim(coalesce(p->>'owner_name',''))) < 2 then
    raise exception 'Lengkapi mode kegagalan, dampak, penyebab, tindakan, dan penanggung jawab.' using errcode='22023';
  end if;
  if v_severity not between 1 and 5 or v_occurrence not between 1 and 5 or v_detection not between 1 and 5 then
    raise exception 'Severity, Occurrence, dan Detection harus 1–5.' using errcode='22023';
  end if;

  select * into v_incident
  from aureka_patient_safety.incidents
  where id=nullif(p->>'source_incident_id','')::uuid;

  if not found or not aureka_system.has_quality_room_access(v_incident.room_id) then
    raise exception 'Insiden sumber tidak ditemukan atau berada di luar kewenangan unit.' using errcode='42501';
  end if;
  if exists(select 1 from aureka_risk.fmea_analyses f
    where f.analysis_type='reactive' and f.source_incident_id=v_incident.id) then
    raise exception 'Insiden ini sudah memiliki analisis FMEA Reaktif.' using errcode='23505';
  end if;

  insert into aureka_risk.fmea_analyses(
    fmea_code,risk_register_id,unit_name,process_name,failure_mode,failure_effect,causes,
    existing_controls,severity,occurrence,detection,action_plan,owner_name,target_date,
    status,created_by,updated_by,source_data,analysis_type,source_incident_id,incident_code_snapshot
  ) values (
    v_code,nullif(p->>'risk_register_id','')::uuid,
    coalesce(nullif(v_incident.unit_name,''),'Unit tidak tercatat'),
    coalesce(nullif(v_incident.incident_type,''),'Proses pelayanan'),
    trim(p->>'failure_mode'),trim(p->>'failure_effect'),trim(p->>'causes'),
    coalesce(p->>'existing_controls',''),v_severity,v_occurrence,v_detection,
    trim(p->>'action_plan'),trim(p->>'owner_name'),nullif(p->>'target_date','')::date,
    'Open',auth.uid(),auth.uid(),
    jsonb_build_object('source','patient_safety_incident','incident_id',v_incident.id,'incident_code',v_incident.incident_code),
    'reactive',v_incident.id,coalesce(v_incident.incident_code,'')
  ) returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_reactive_fmea_update_status(p_fmea_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := aureka_system.current_role_code();
  v_room_id bigint;
begin
  if auth.uid() is null or coalesce(v_role,'') NOT IN ('ADMIN','PMKP','MANAGEMENT') then
    raise exception 'Role tidak berwenang mengubah FMEA Reaktif.' using errcode='42501';
  end if;
  if not aureka_system.password_rotation_complete() then
    raise exception 'Selesaikan perubahan password awal sebelum melanjutkan.' using errcode='42501';
  end if;
  if p_status not in ('Open','In Progress','Evaluated','Closed') then
    raise exception 'Status FMEA tidak valid.' using errcode='22023';
  end if;

  select i.room_id into v_room_id
  from aureka_risk.fmea_analyses f
  join aureka_patient_safety.incidents i on i.id=f.source_incident_id
  where f.id=p_fmea_id and f.analysis_type='reactive';

  if not found or not aureka_system.has_quality_room_access(v_room_id) then
    raise exception 'Analisis FMEA tidak ditemukan atau berada di luar kewenangan unit.' using errcode='42501';
  end if;

  update aureka_risk.fmea_analyses
  set status=p_status,updated_by=auth.uid(),updated_at=now()
  where id=p_fmea_id and analysis_type='reactive';
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_revoke_legal_signature_asset(p_asset_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_asset aureka_system.legal_signature_assets%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Alasan pencabutan wajib diisi minimal 8 karakter.' using errcode='22023'; end if;
  v_role:=aureka_system.current_role_code();
  if v_role is null then raise exception 'Role tidak aktif.' using errcode='42501'; end if;
  select * into v_asset from aureka_system.legal_signature_assets where id=p_asset_id for update;
  if not found then raise exception 'Aset tanda tangan tidak ditemukan.' using errcode='P0002'; end if;
  if not coalesce(v_role='ADMIN' or (v_asset.authorized_user_id=auth.uid() and v_role=v_asset.required_role),false) then
    raise exception 'Hanya administrator atau pemilik tanda tangan yang dapat mencabut aset ini.' using errcode='42501';
  end if;
  if v_asset.status<>'active' then raise exception 'Hanya aset aktif yang dapat dicabut.' using errcode='55000'; end if;
  update aureka_system.legal_signature_assets
  set status='revoked',revoked_at=now(),revoke_reason=left(trim(p_reason),1000),updated_at=now()
  where id=v_asset.id;
  insert into aureka_system.legal_signature_asset_events(asset_id,event_type,actor_id,actor_role,note)
  values(v_asset.id,'revoked',auth.uid(),v_role,left(trim(p_reason),1000));
  return jsonb_build_object('success',true,'status','revoked','asset_code',v_asset.asset_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.aureka_validator_review_quality_record(p_record_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'aureka_system', 'aureka_quality'
AS $function$
DECLARE v_room bigint; v_entered uuid; v_status text; v_role text := aureka_system.current_role_code();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  IF coalesce(v_role,'') NOT IN ('VALIDATOR','ADMIN','PMKP') THEN RAISE EXCEPTION 'FORBIDDEN: role validator diperlukan' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('validated','reopened') THEN RAISE EXCEPTION 'Keputusan validasi tidak dikenal'; END IF;
  SELECT room_id,entered_by,status INTO v_room,v_entered,v_status
  FROM aureka_quality.quality_records WHERE id=p_record_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan mutu tidak ditemukan'; END IF;
  IF NOT aureka_system.has_quality_room_access(v_room) THEN RAISE EXCEPTION 'FORBIDDEN: tidak memiliki akses ke unit ini' USING ERRCODE='42501'; END IF;
  IF v_role='VALIDATOR' AND v_entered=auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN: validator tidak dapat memvalidasi catatannya sendiri' USING ERRCODE='42501'; END IF;
  IF v_status='archived' THEN RAISE EXCEPTION 'Catatan arsip tidak dapat divalidasi'; END IF;
  UPDATE aureka_quality.quality_records
  SET status=p_decision,
      review_required=(p_decision<>'validated'),
      validated_by=auth.uid(),
      validated_at=now(),
      validation_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  WHERE id=p_record_id;
  INSERT INTO aureka_quality.audit_log(actor_id,action,table_name,record_id,before_json,after_json,created_at)
  VALUES(
    auth.uid(),
    CASE WHEN p_decision='validated' THEN 'UNIT_VALIDATED' ELSE 'UNIT_RETURNED_FOR_CORRECTION' END,
    'quality_records',
    p_record_id,
    jsonb_build_object('status',v_status),
    jsonb_build_object('status',p_decision,'validation_note',nullif(trim(coalesce(p_note,'')),''),'room_id',v_room),
    now()
  );
  RETURN true;
END;
$function$;
