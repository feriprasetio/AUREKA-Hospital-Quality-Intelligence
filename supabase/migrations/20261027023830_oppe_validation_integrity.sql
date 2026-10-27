begin;

-- Reapply the OPPE status guard so an already-deployed database also enforces
-- immutability of all submitted assessment content during independent validation.
create or replace function aureka_quality.guard_oppe_assessment_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, aureka_quality, auth
as $$
declare
  v_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'OPPE baru harus dibuat sebagai draf.';
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'Pembuat OPPE harus sama dengan pengguna yang login.';
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Pembuat asli OPPE tidak boleh diubah.';
  end if;

  if old.status = 'archived' then
    raise exception 'OPPE yang diarsipkan tidak dapat diubah.';
  elsif old.status = 'draft' then
    v_allowed := new.status in ('draft', 'submitted', 'archived');
  elsif old.status = 'submitted' then
    v_allowed := new.status in ('validated', 'reopened', 'archived');
  elsif old.status = 'reopened' then
    v_allowed := new.status in ('reopened', 'draft', 'submitted', 'archived');
  elsif old.status = 'validated' then
    v_allowed := new.status in ('reopened', 'archived');
  end if;

  if not v_allowed then
    raise exception 'Transisi status OPPE dari % ke % tidak diizinkan.', old.status, new.status;
  end if;

  if old.status = 'submitted' and new.status = 'validated' and (
    new.room_id is distinct from old.room_id
    or new.staff_key is distinct from old.staff_key
    or new.staff_identifier is distinct from old.staff_identifier
    or new.staff_name is distinct from old.staff_name
    or new.profession is distinct from old.profession
    or new.period_year is distinct from old.period_year
    or new.period_quarter is distinct from old.period_quarter
    or new.behavior_json is distinct from old.behavior_json
    or new.professionalism_json is distinct from old.professionalism_json
    or new.clinical_snapshot_json is distinct from old.clinical_snapshot_json
    or new.score_json is distinct from old.score_json
    or new.source_records_count is distinct from old.source_records_count
    or new.evaluator_name is distinct from old.evaluator_name
    or new.evaluator_role is distinct from old.evaluator_role
    or new.assessment_notes is distinct from old.assessment_notes
    or new.development_plan is distinct from old.development_plan
    or new.submitted_at is distinct from old.submitted_at
  ) then
    raise exception 'Isi dan snapshot OPPE yang sudah disubmit tidak boleh diubah saat validasi. Kembalikan untuk revisi terlebih dahulu.';
  end if;

  if new.status = 'validated' then
    if new.validated_by is null or new.validated_by is distinct from auth.uid() then
      raise exception 'Validasi harus dicatat atas identitas pengguna yang sedang login.';
    end if;
    if new.validated_by = new.created_by then
      raise exception 'Validasi OPPE harus dilakukan oleh pengguna selain pembuat.';
    end if;
    if new.validated_at is null then
      raise exception 'Waktu validasi wajib direkam.';
    end if;
  else
    new.validated_by := null;
    new.validated_at := null;
  end if;

  return new;
end;
$$;

revoke all on function aureka_quality.guard_oppe_assessment_transition() from public;

commit;
