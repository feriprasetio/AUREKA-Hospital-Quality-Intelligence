-- Public landing metrics: return only coarse aggregates with small-cell suppression.
-- No patient, unit, incident-description, risk-event, owner, or record identifiers are returned.
CREATE OR REPLACE FUNCTION aureka_analytics.public_landing_metrics(p_domain text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_title text;
  v_kind text;
  v_points jsonb;
  v_first_month date := (pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Pontianak', pg_catalog.statement_timestamp())))::date - 11 * interval '1 month';
  v_next_month date;
BEGIN
  IF v_domain NOT IN ('quality', 'safety', 'risk') THEN
    RAISE EXCEPTION 'Domain grafik publik tidak valid.' USING ERRCODE = '22023';
  END IF;

  v_first_month := v_first_month::date;
  v_next_month := (v_first_month + interval '12 months')::date;

  IF v_domain = 'quality' THEN
    v_title := 'Catatan indikator mutu tervalidasi';
    v_kind := 'monthly';

    WITH months AS (
      SELECT (v_first_month + (g.n * interval '1 month'))::date AS month_start
      FROM pg_catalog.generate_series(0, 11) AS g(n)
    ),
    counts AS (
      SELECT pg_catalog.date_trunc(
               'month',
               pg_catalog.timezone('Asia/Pontianak', q.created_at)
             )::date AS month_start,
             pg_catalog.count(*)::bigint AS n
      FROM aureka_quality.quality_records AS q
      WHERE q.status = 'validated'
        AND q.created_at >= (v_first_month::timestamp AT TIME ZONE 'Asia/Pontianak')
        AND q.created_at < (v_next_month::timestamp AT TIME ZONE 'Asia/Pontianak')
      GROUP BY 1
    )
    SELECT pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'label', pg_catalog.to_char(m.month_start, 'YYYY-MM'),
               'value', CASE WHEN coalesce(c.n, 0) >= 5 THEN c.n ELSE NULL END
             ) ORDER BY m.month_start
           )
      INTO v_points
      FROM months AS m
      LEFT JOIN counts AS c USING (month_start);

  ELSIF v_domain = 'safety' THEN
    v_title := 'Laporan insiden yang telah ditutup';
    v_kind := 'monthly';

    WITH months AS (
      SELECT (v_first_month + (g.n * interval '1 month'))::date AS month_start
      FROM pg_catalog.generate_series(0, 11) AS g(n)
    ),
    closed_incidents AS (
      SELECT coalesce(
               i.incident_date,
               (i.submitted_at AT TIME ZONE 'Asia/Pontianak')::date,
               (i.created_at AT TIME ZONE 'Asia/Pontianak')::date
             ) AS event_date
      FROM aureka_patient_safety.incidents AS i
      WHERE i.status = 'closed'
    ),
    counts AS (
      SELECT pg_catalog.date_trunc('month', c.event_date::timestamp)::date AS month_start,
             pg_catalog.count(*)::bigint AS n
      FROM closed_incidents AS c
      WHERE c.event_date >= v_first_month
        AND c.event_date < v_next_month
      GROUP BY 1
    )
    SELECT pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'label', pg_catalog.to_char(m.month_start, 'YYYY-MM'),
               'value', CASE WHEN coalesce(c.n, 0) >= 5 THEN c.n ELSE NULL END
             ) ORDER BY m.month_start
           )
      INTO v_points
      FROM months AS m
      LEFT JOIN counts AS c USING (month_start);

  ELSE
    v_title := 'Distribusi tingkat risiko';
    v_kind := 'category';

    WITH levels AS (
      SELECT 1 AS sort_order, 'Sangat Rendah'::text AS level
      UNION ALL SELECT 2, 'Rendah'
      UNION ALL SELECT 3, 'Sedang'
      UNION ALL SELECT 4, 'Tinggi'
      UNION ALL SELECT 5, 'Sangat Tinggi'
    ),
    counts AS (
      SELECT r.risk_level AS level, pg_catalog.count(*)::bigint AS n
      FROM aureka_risk.risk_register AS r
      GROUP BY r.risk_level
    )
    SELECT pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'label', l.level,
               'value', CASE WHEN coalesce(c.n, 0) >= 5 THEN c.n ELSE NULL END
             ) ORDER BY l.sort_order
           )
      INTO v_points
      FROM levels AS l
      LEFT JOIN counts AS c USING (level);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'domain', v_domain,
    'title', v_title,
    'kind', v_kind,
    'minimum_group_size', 5,
    'generated_at', pg_catalog.timezone('Asia/Pontianak', pg_catalog.statement_timestamp()),
    'points', coalesce(v_points, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_analytics.public_landing_metrics(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_analytics.public_landing_metrics(text) FROM anon, authenticated;
GRANT USAGE ON SCHEMA aureka_analytics TO anon, authenticated;
GRANT EXECUTE ON FUNCTION aureka_analytics.public_landing_metrics(text) TO anon, authenticated;
