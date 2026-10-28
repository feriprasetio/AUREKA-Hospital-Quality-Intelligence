create or replace function aureka_quality.guard_oppe_fppe_evaluation_transition()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, aureka_quality, auth
as $$
declare
  v_allowed boolean := false;
  v_check_identity boolean := false;
  v_staff aureka_quality.staff_directory%rowtype;
begin
  if tg_op = 'INSERT' then
    v_check_identity := true;
  else
    v_check_identity := new.status = 'submitted'
      or new.staff_id is distinct from old.staff_id
      or new.staff_code_snapshot is distinct from old.staff_code_snapshot
      or new.staff_name_snapshot is distinct from old.staff_name_snapshot
      or new.position_snapshot is distinct from old.position_snapshot
      or new.unit_snapshot is distinct from old.unit_snapshot;
  end if;

  if v_check_identity then
    select * into v_staff from aureka_quality.staff_directory d
    where d.id = new.staff_id and d.directory_status = 'available';
    if not found then raise exception 'Tenaga FPPE tidak aktif/tersedia pada Metadata. Muat ulang roster sebelum menyimpan.'; end if;
    if new.staff_code_snapshot is distinct from v_staff.employee_code
      or new.staff_name_snapshot is distinct from v_staff.display_name
      or new.position_snapshot is distinct from v_staff.position_title then
      raise exception 'Identitas FPPE harus mengikuti kode, nama, dan jabatan terbaru dari Metadata tenaga kerja.';
    end if;
    if coalesce(new.form_json->'meta'->>'staffUuid', '') is distinct from new.staff_id::text
      or coalesce(new.form_json->'meta'->>'staffId', '') is distinct from v_staff.employee_code
      or coalesce(new.form_json->'meta'->>'staffName', '') is distinct from v_staff.display_name then
      raise exception 'Identitas pada formulir FPPE tidak konsisten dengan Metadata tenaga kerja.';
    end if;
    if not exists (
      select 1 from aureka_quality.staff_team_assignments a
      where a.staff_id = new.staff_id and a.room_id = new.room_id
        and a.assignment_status = 'active' and a.is_locked = true
    ) then
      raise exception 'Tenaga FPPE harus berasal dari roster Tim Tenaga Kerja yang aktif dan terkunci pada unit terpilih.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'FPPE baru harus dibuat sebagai draf.'; end if;
    if new.created_by is distinct from auth.uid() then raise exception 'Pembuat FPPE harus sama dengan pengguna yang login.'; end if;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then raise exception 'Pembuat asli FPPE tidak boleh diubah.'; end if;
  if old.status = 'archived' then
    raise exception 'FPPE yang diarsipkan tidak dapat diubah.';
  elsif old.status = 'draft' then
    v_allowed := new.status in ('draft','submitted','archived');
  elsif old.status = 'submitted' then
    v_allowed := new.status in ('validated','reopened','archived');
  elsif old.status = 'reopened' then
    v_allowed := new.status in ('reopened','draft','submitted','archived');
  elsif old.status = 'validated' then
    v_allowed := new.status in ('reopened','archived');
  end if;
  if not v_allowed then raise exception 'Transisi status FPPE dari % ke % tidak diizinkan.', old.status, new.status; end if;
  if old.status = 'submitted' and new.status = 'validated' and (
    new.room_id is distinct from old.room_id
    or new.staff_id is distinct from old.staff_id
    or new.staff_code_snapshot is distinct from old.staff_code_snapshot
    or new.staff_name_snapshot is distinct from old.staff_name_snapshot
    or new.profession_snapshot is distinct from old.profession_snapshot
    or new.position_snapshot is distinct from old.position_snapshot
    or new.unit_snapshot is distinct from old.unit_snapshot
    or new.evaluation_type is distinct from old.evaluation_type
    or new.trigger_reason is distinct from old.trigger_reason
    or new.trigger_detail is distinct from old.trigger_detail
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.scope_text is distinct from old.scope_text
    or new.form_json is distinct from old.form_json
    or new.summary_json is distinct from old.summary_json
    or new.submitted_at is distinct from old.submitted_at
  ) then
    raise exception 'Isi FPPE yang sudah diajukan tidak boleh diubah saat validasi. Kembalikan untuk revisi terlebih dahulu.';
  end if;
  if new.status = 'validated' then
    if new.validated_by is null or new.validated_by is distinct from auth.uid() then raise exception 'Validasi harus dicatat atas identitas pengguna yang sedang login.'; end if;
    if new.validated_by = new.created_by then raise exception 'Validasi FPPE harus dilakukan oleh pengguna selain pembuat.'; end if;
    if new.validated_at is null then raise exception 'Waktu validasi wajib direkam.'; end if;
  else
    new.validated_by := null;
    new.validated_at := null;
  end if;
  return new;
end;
$$;
revoke all on function aureka_quality.guard_oppe_fppe_evaluation_transition() from public;