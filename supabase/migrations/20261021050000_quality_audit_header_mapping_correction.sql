-- Correct the one header alias that does not exist in the Excel's green headers.
-- Rawat Inap Isolasi has "Oksigen Transfer IGD" (mapped to 24.9), not a separate "Transfer IGD" header.
UPDATE aureka_quality.indicator_profiles
SET schema_json = coalesce(schema_json, '{}'::jsonb) - 'header_label' - 'header_source',
    updated_at = now()
WHERE profile_year = 2026
  AND code = '24.7'
  AND status = 'published'
  AND is_active = true
  AND schema_json->>'header_label' = 'Transfer IGD';
