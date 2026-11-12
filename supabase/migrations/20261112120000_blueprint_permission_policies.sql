-- AUREKA Blueprint v2.0 §10: menerapkan matriks permission ke modul lama — TAHAP 1 (aman, hanya MEMPERLUAS).
-- Membutuhkan 20261112110000_blueprint_settings_permissions.sql.
--
-- Prinsip tahap 1:
--   • Aturan akses lama TIDAK diubah/dihapus, sehingga tidak ada pengguna yang tiba-tiba kehilangan akses.
--   • Ditambahkan policy SELECT permisif berbasis permission, agar role yang diberi izin di "Hak Akses Role"
--     (mis. Direktur sesuai §10.1) dapat membaca rincian investigasi, respons survei bernama, dan OPPE/FPPE.
--   • Matriks disesuaikan dengan akses yang SUDAH berlaku di sistem lama supaya tampilan Hak Akses Role jujur.
-- Tahap 2 (pembatasan/restrictive, mis. Super Admin teknis tidak membaca isi klinis) memerlukan keputusan RS dan dibuat terpisah.
--
-- Rollback: drop policy *_perm_read pada empat tabel di bawah.

begin;

-- 1) Selaraskan matriks dengan akses lama (hanya baris yang belum pernah diubah Super Admin)
update aureka_governance.role_permissions rp set granted = true
from (values
  ('ADMIN','incident.read.investigation_detail'), ('PMKP','incident.read.investigation_detail'), ('MANAGEMENT','incident.read.investigation_detail'),
  ('ADMIN','survey.read.named_response'),
  ('ADMIN','hr.read.performance'), ('PMKP','hr.read.performance')
) legacy(role_code, permission)
where rp.role_code = legacy.role_code and rp.permission = legacy.permission and rp.updated_by is null and rp.granted = false;

-- 2) Policy baca berbasis permission (OR dengan policy lama)
drop policy if exists investigations_perm_read on aureka_patient_safety.investigations;
create policy investigations_perm_read on aureka_patient_safety.investigations
  for select to authenticated
  using ((select public.aureka_has_permission('incident.read.investigation_detail')));

drop policy if exists culture_responses_perm_read on aureka_patient_safety.culture_responses;
create policy culture_responses_perm_read on aureka_patient_safety.culture_responses
  for select to authenticated
  using ((select public.aureka_has_permission('survey.read.named_response')));

drop policy if exists oppe_assessments_perm_read on aureka_quality.oppe_assessments;
create policy oppe_assessments_perm_read on aureka_quality.oppe_assessments
  for select to authenticated
  using ((select public.aureka_has_permission('hr.read.performance')));

drop policy if exists oppe_fppe_evaluations_perm_read on aureka_quality.oppe_fppe_evaluations;
create policy oppe_fppe_evaluations_perm_read on aureka_quality.oppe_fppe_evaluations
  for select to authenticated
  using ((select public.aureka_has_permission('hr.read.performance')));

commit;
