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
    v_check_identity := new.status in ('draft','submitted')
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
      or coalesce(new.form_json->'meta'->>'staffName', '') is distinct from v_staff.display_name
      or coalesce(new.form_json->'meta'->>'profession', '') is distinct from new.profession_snapshot
      or coalesce(new.form_json->'meta'->>'unit', '') is distinct from new.unit_snapshot
      or coalesce(new.form_json->'meta'->>'fppeType', '') is distinct from new.evaluation_type
      or coalesce(new.form_json->'meta'->>'trigger', '') is distinct from new.trigger_reason
      or coalesce(new.form_json->'meta'->>'triggerDetail', '') is distinct from new.trigger_detail
      or coalesce(new.form_json->'meta'->>'scope', '') is distinct from new.scope_text
      or coalesce(new.form_json->'meta'->>'startDate', '') is distinct from coalesce(new.period_start::text, '')
      or coalesce(new.form_json->'meta'->>'endDate', '') is distinct from coalesce(new.period_end::text, '') then
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

  if new.status = 'submitted' then
    if new.period_start is null or new.period_end is null then raise exception 'Periode FPPE wajib lengkap saat pengajuan.'; end if;
    if length(btrim(new.scope_text)) = 0 then raise exception 'Ruang lingkup/privilege wajib diisi saat pengajuan.'; end if;
    if length(btrim(coalesce(new.form_json->'meta'->>'profession',''))) = 0 then raise exception 'Profesi/SMF wajib ditentukan saat pengajuan.'; end if;
    if length(btrim(coalesce(new.form_json->'meta'->>'directSupervisor',''))) = 0 then raise exception 'Evaluator FPPE wajib ditentukan saat pengajuan.'; end if;
    if length(btrim(coalesce(new.form_json->'evidence'->>'overallDecision',''))) = 0 then raise exception 'Keputusan FPPE wajib diisi saat pengajuan.'; end if;
    if length(btrim(coalesce(new.form_json->'evidence'->>'conclusion',''))) = 0 then raise exception 'Kesimpulan evaluator wajib diisi saat pengajuan.'; end if;
    if coalesce((new.summary_json->>'totalCompetencies')::integer,0) < 1
      or coalesce((new.summary_json->>'assessed')::integer,0) < coalesce((new.summary_json->>'totalCompetencies')::integer,0) then
      raise exception 'Seluruh kompetensi FPPE wajib dinilai sebelum pengajuan.';
    end if;
    if not (
      length(btrim(coalesce(new.form_json->'evidence'->>'evidenceObservation',''))) >= 3
      or length(btrim(coalesce(new.form_json->'evidence'->>'evidenceRecord',''))) >= 3
      or length(btrim(coalesce(new.form_json->'evidence'->>'evidenceLogbook',''))) >= 3
      or length(btrim(coalesce(new.form_json->'evidence'->>'evidenceOther',''))) >= 3
    ) then raise exception 'Minimal satu metode/bukti evaluasi wajib diisi sebelum pengajuan.'; end if;
    if new.evaluation_type = 'triggered' and length(btrim(new.trigger_detail)) = 0 then
      raise exception 'Uraian trigger wajib diisi untuk FPPE triggered.';
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