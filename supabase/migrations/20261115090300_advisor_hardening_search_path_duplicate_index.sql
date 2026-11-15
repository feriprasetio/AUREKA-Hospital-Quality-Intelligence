-- =====================================================================
-- Hardening Supabase Advisor (issue #99), bagian 1 — perubahan berisiko rendah saja.
-- Jalankan setelah migrasi sebelumnya. Tidak mengubah data, tabel, maupun RLS.
--
-- 1) Security Advisor "function_search_path_mutable": tiga fungsi diberi search_path kosong.
--    Isi fungsinya hanya aritmetika/CASE dan now() (pg_catalog selalu terbaca), jadi perilaku tidak berubah.
-- 2) Performance Advisor "duplicate_index": risk_relationships_target_risk_id_idx identik dengan
--    risk_relationships_target_idx (keduanya btree (target_risk_id)). Yang lebih baru dihapus.
-- =====================================================================

alter function aureka_risk.calculate_risk_score(integer, integer) set search_path = '';
alter function aureka_risk.risk_level(integer) set search_path = '';
alter function aureka_system.track_user_deactivation() set search_path = '';

do $$
begin
  -- Hapus hanya bila indeks pendampingnya benar-benar ada, supaya pencarian berdasarkan target_risk_id tetap ber-indeks.
  if exists (select 1 from pg_indexes where schemaname = 'aureka_risk' and indexname = 'risk_relationships_target_idx')
     and exists (select 1 from pg_indexes where schemaname = 'aureka_risk' and indexname = 'risk_relationships_target_risk_id_idx') then
    execute 'drop index aureka_risk.risk_relationships_target_risk_id_idx';
  end if;
end $$;
