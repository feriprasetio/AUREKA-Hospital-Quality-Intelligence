-- AUREKA quality_records read-path optimization.
-- Evidence: pg_stat_statements recorded 1,095 room/year newest-first queries
-- (mean ~870 ms) and 753 room/year/grain newest-first queries (~1,209 ms).
-- Existing room/year/grain/record_date index cannot satisfy ORDER BY created_at
-- when measurement_grain is omitted. This index is complementary, not duplicate.
-- No records are updated, archived, deleted, or backfilled.
-- Avoid changing statement_timeout globally or disabling RLS.
CREATE INDEX IF NOT EXISTS quality_records_room_year_created_desc_idx
  ON aureka_quality.quality_records
  USING btree (room_id, profile_year, created_at DESC);
