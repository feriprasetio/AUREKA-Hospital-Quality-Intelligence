# SPM Annual Workspace and Room-Scoped Inpatient Measurements

## Data model
- `spm_monthly_measurements.room_id` is nullable. A non-null value scopes an inpatient measurement to one of the existing inpatient master rooms.
- The unique key is `(indicator_id, profile_year, period_month, room_id)` with `NULLS NOT DISTINCT`; this preserves one installation-level row for a null scope and one row per room for room-scoped data.
- Non-inpatient measurements retain `room_id = NULL`; their existing `spm_indicators.owner_room_id` remains the authorization scope.
- Existing user accounts and `aureka_system.user_room_assignments` are reused. No duplicate login or master-room records are created.

## Inpatient workbook mapping
The six workbook subunit blocks map to existing `public.master_rooms` records:
- Rawat Inap Anak — 22
- Rawat Inap Bedah — 23
- Rawat Inap Isolasi — 24
- Rawat Inap Penyakit Dalam — 25
- Rawat Inap Saraf — 26
- Rawat Inap VIP — 27

The parent `Instalasi Rawat Inap` block is an installation recap, not a seventh room. Standalone measurements are imported from the six room blocks; the parent aggregate is not duplicated. The patient-fall indicator retains its installation-level numerator because its denominator is linked to the hospital-wide Quality Indicator source. Jam Visite remains source-linked and read-only. Neither linked indicator is represented as a unit-specific result until the source data is available at that level.

## Annual UI
- The entry workspace displays January–December together.
- A user selects one authorized inpatient unit, or an authorized installation-level recap view.
- The recap view pools numerator and denominator values across visible room-scoped records; score-based indicators use respondent-weighted means.
- A single save action persists changed months in one batch. Empty cells remain missing; numeric zero remains a valid value.
- Installation-level linked indicators remain read-only in the recap view except for the authorized aggregate patient-fall numerator.

## Security
- Row-level security uses `aureka_system.has_quality_room_access(room_id)` for room-scoped measurements and the indicator's `owner_room_id` for legacy aggregate measurements.
- Insert/update requires the authenticated actor fields and the matching indicator year.
- The migration is `20261119222028_spm_room_scoped_annual_entry.sql`.
