-- Laporan IKP lewat QR tanpa login.
-- Laporan publik TIDAK langsung masuk ke tabel insiden: masuk antrean, lalu Tim KP / PMKP
-- memprosesnya menjadi laporan IKP resmi dari aplikasi (atau mengabaikannya bila tidak valid).
-- Formulir publik sengaja tidak meminta identitas pasien.

CREATE TABLE IF NOT EXISTS aureka_patient_safety.public_report_links (
  id bigserial PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  token text NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 16 AND 64),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aureka_patient_safety.public_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id bigint NOT NULL REFERENCES aureka_patient_safety.public_report_links(id),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diproses', 'diabaikan')),
  incident_id text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_incident_reports_status_idx ON aureka_patient_safety.public_incident_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS public_incident_reports_link_time_idx ON aureka_patient_safety.public_incident_reports (link_id, created_at DESC);

ALTER TABLE aureka_patient_safety.public_report_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_patient_safety.public_incident_reports ENABLE ROW LEVEL SECURITY;

-- Hanya Admin dan Komite PMKP yang mengelola tautan QR dan antrean laporan.
DROP POLICY IF EXISTS public_report_links_manage ON aureka_patient_safety.public_report_links;
CREATE POLICY public_report_links_manage ON aureka_patient_safety.public_report_links
  FOR ALL TO authenticated
  USING (aureka_system.current_role_code() IN ('ADMIN', 'PMKP'))
  WITH CHECK (aureka_system.current_role_code() IN ('ADMIN', 'PMKP'));

DROP POLICY IF EXISTS public_incident_reports_read ON aureka_patient_safety.public_incident_reports;
CREATE POLICY public_incident_reports_read ON aureka_patient_safety.public_incident_reports
  FOR SELECT TO authenticated
  USING (aureka_system.current_role_code() IN ('ADMIN', 'PMKP'));

DROP POLICY IF EXISTS public_incident_reports_process ON aureka_patient_safety.public_incident_reports;
CREATE POLICY public_incident_reports_process ON aureka_patient_safety.public_incident_reports
  FOR UPDATE TO authenticated
  USING (aureka_system.current_role_code() IN ('ADMIN', 'PMKP'))
  WITH CHECK (aureka_system.current_role_code() IN ('ADMIN', 'PMKP'));

GRANT USAGE ON SCHEMA aureka_patient_safety TO authenticated;
GRANT SELECT, INSERT, UPDATE ON aureka_patient_safety.public_report_links TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE aureka_patient_safety.public_report_links_id_seq TO authenticated;
GRANT SELECT, UPDATE ON aureka_patient_safety.public_incident_reports TO authenticated;

-- Info tautan untuk halaman publik: hanya nama ruangan, tanpa data lain.
CREATE OR REPLACE FUNCTION public.aureka_public_report_link_info(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, aureka_patient_safety
AS $$
  SELECT jsonb_build_object('room_name', r.name)
  FROM aureka_patient_safety.public_report_links l
  JOIN public.master_rooms r ON r.id = l.room_id
  WHERE l.token = p_token AND l.is_active
  LIMIT 1
$$;

-- Kirim laporan publik: tautan harus aktif, isi dibatasi ke kolom yang diizinkan, dan ada batas laju.
CREATE OR REPLACE FUNCTION public.aureka_public_submit_incident(p_token text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, aureka_patient_safety
AS $$
DECLARE
  v_link aureka_patient_safety.public_report_links;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_id uuid;
BEGIN
  SELECT * INTO v_link FROM aureka_patient_safety.public_report_links WHERE token = p_token AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tautan pelaporan tidak berlaku.' USING ERRCODE = '22023'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 16000 THEN
    RAISE EXCEPTION 'Isi laporan tidak valid atau terlalu panjang.' USING ERRCODE = '22023';
  END IF;
  -- Hanya pertanyaan formulir IKP tanpa identitas pasien.
  FOREACH v_key IN ARRAY ARRAY['A1','A2','A3','A4','A7','A8','B1','D3','D6','reporter_name','reporter_contact'] LOOP
    IF p_payload ? v_key THEN
      v_clean := v_clean || jsonb_build_object(v_key, left(coalesce(p_payload ->> v_key, ''), 4000));
    END IF;
  END LOOP;
  IF char_length(coalesce(v_clean ->> 'A1', '')) < 10 THEN RAISE EXCEPTION 'Ceritakan insiden minimal 10 karakter.' USING ERRCODE = '22023'; END IF;
  IF coalesce(v_clean ->> 'A2', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Tanggal insiden wajib diisi.' USING ERRCODE = '22023'; END IF;
  -- Batas laju: 5 laporan / 10 menit per tautan, 60 laporan / jam untuk seluruh tautan.
  IF (SELECT count(*) FROM aureka_patient_safety.public_incident_reports WHERE link_id = v_link.id AND created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM aureka_patient_safety.public_incident_reports WHERE created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Terlalu banyak laporan dalam waktu singkat. Coba lagi beberapa menit lagi.' USING ERRCODE = '53400';
  END IF;
  INSERT INTO aureka_patient_safety.public_incident_reports (link_id, room_id, payload)
  VALUES (v_link.id, v_link.room_id, v_clean)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reference', upper(left(replace(v_id::text, '-', ''), 8)));
END;
$$;

REVOKE ALL ON FUNCTION public.aureka_public_report_link_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aureka_public_submit_incident(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aureka_public_report_link_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_public_submit_incident(text, jsonb) TO anon, authenticated;
