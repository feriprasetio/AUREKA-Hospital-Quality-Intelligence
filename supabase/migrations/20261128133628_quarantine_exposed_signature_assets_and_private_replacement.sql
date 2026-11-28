-- Contain previously exposed, unused signature source images without deleting records.
WITH quarantined AS (
  UPDATE aureka_system.legal_signature_assets a
  SET status='revoked',revoked_at=now(),revoke_reason='security_quarantine_public_source',updated_at=now()
  WHERE a.asset_code IN ('SIG-PMKP-CHAIR','SIG-HOSPITAL-DIRECTOR')
    AND a.status='pending_authorization'
    AND NOT EXISTS(SELECT 1 FROM aureka_system.document_signatures s WHERE s.signature_asset_id=a.id)
  RETURNING a.id
)
INSERT INTO aureka_system.legal_signature_asset_events(asset_id,event_type,note)
SELECT id,'revoked','Karantina keamanan: sumber gambar pernah tersimpan pada repositori publik.' FROM quarantined;

REVOKE SELECT ON TABLE aureka_system.legal_signature_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,asset_code,signer_name,signer_position,required_role,image_mime_type,image_sha256,status,authorized_user_id,authorized_at,revoked_at,created_at,updated_at)
ON aureka_system.legal_signature_assets TO authenticated;

CREATE OR REPLACE FUNCTION public.aureka_list_legal_signature_assets()
 RETURNS TABLE(asset_id uuid, asset_code text, signer_name text, signer_position text, required_role text, status text, image_mime_type text, image_data_base64 text, image_sha256 text, authorized_at timestamp with time zone, authorized_user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT aureka_system.can_approve_documents() THEN
    RAISE EXCEPTION 'Role tidak berwenang melihat aset tanda tangan.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT a.id,a.asset_code,a.signer_name,a.signer_position,a.required_role,a.status,a.image_mime_type,
    CASE WHEN a.status<>'revoked' AND aureka_system.current_role_code()=a.required_role
      AND EXISTS(SELECT 1 FROM aureka_system.user_profiles u WHERE u.user_id=auth.uid() AND lower(trim(u.full_name))=lower(trim(a.signer_name)))
      THEN a.image_data_base64 ELSE ''::text END,
    a.image_sha256,a.authorized_at,a.authorized_user_id
  FROM aureka_system.legal_signature_assets a
  ORDER BY CASE a.required_role WHEN 'DIREKTUR' THEN 1 ELSE 2 END,a.created_at;
END $function$;

CREATE OR REPLACE FUNCTION public.aureka_replace_quarantined_signature_asset(p_asset_code text, p_mime text, p_image_base64 text, p_file_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_name text;
  v_asset aureka_system.legal_signature_assets%rowtype;
  v_bytes bytea;
  v_hash text;
  v_new_id uuid;
  v_new_code text;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('PMKP','DIREKTUR') THEN
    RAISE EXCEPTION 'Hanya pemilik aset yang aktif dapat menyediakan pengganti.' USING ERRCODE='42501';
  END IF;
  SELECT full_name INTO v_name FROM aureka_system.user_profiles WHERE user_id=auth.uid();
  SELECT * INTO v_asset FROM aureka_system.legal_signature_assets a
  WHERE a.asset_code=upper(trim(coalesce(p_asset_code,''))) FOR UPDATE;
  IF NOT FOUND OR v_asset.status IS DISTINCT FROM 'revoked' OR v_asset.revoke_reason IS DISTINCT FROM 'security_quarantine_public_source'
    OR v_role IS DISTINCT FROM v_asset.required_role OR lower(trim(coalesce(v_name,''))) IS DISTINCT FROM lower(trim(v_asset.signer_name))
  THEN RAISE EXCEPTION 'Aset tidak dapat diganti oleh akun ini.' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM aureka_system.legal_signature_assets a WHERE a.required_role=v_asset.required_role
    AND lower(trim(a.signer_name))=lower(trim(v_asset.signer_name)) AND a.status IN ('active','pending_authorization'))
  THEN RAISE EXCEPTION 'Aset pengganti sudah tersedia.' USING ERRCODE='55000'; END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('image/png','image/webp') OR p_image_base64 IS NULL
    OR length(p_image_base64)>350000 OR length(p_image_base64)<16
    OR p_file_name IS NULL OR length(p_file_name) NOT BETWEEN 1 AND 120 OR p_file_name ~ '[[:cntrl:]/\\]'
  THEN RAISE EXCEPTION 'Gambar atau nama file tidak valid.' USING ERRCODE='22023'; END IF;
  BEGIN v_bytes:=decode(p_image_base64,'base64'); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Format gambar tidak valid.' USING ERRCODE='22023'; END;
  IF octet_length(v_bytes) NOT BETWEEN 16 AND 262144 OR
    (p_mime='image/png' AND encode(substring(v_bytes FROM 1 FOR 8),'hex')<>'89504e470d0a1a0a') OR
    (p_mime='image/webp' AND (encode(substring(v_bytes FROM 1 FOR 4),'hex')<>'52494646' OR encode(substring(v_bytes FROM 9 FOR 4),'hex')<>'57454250'))
  THEN RAISE EXCEPTION 'Format atau ukuran gambar tidak valid.' USING ERRCODE='22023'; END IF;
  v_hash:=encode(pg_catalog.sha256(v_bytes),'hex');
  IF v_hash IN ('d98f47f9b2e8f67f3d3d1529edc6c0fec5ebf87b701e760203286d27711af9e0','abc9f4a144ac0f48f50c65bfb1dd99cb2b1a884829431cf6d2ceebf4ec915ed7','fbdcb1291bf4e214777550f78db3ba77e5720b7f8490175f8a7399c2bdb8152d','92155a780942cc9a2ea1ba061c8ddcb49e63f5c26af0d495672a1b81a3e3cbe4','1ef6d5d293a428b8d70317985bd8528016d64c34520566d2a0b7580f3f666fe7')
    OR EXISTS(SELECT 1 FROM aureka_system.legal_signature_assets a WHERE a.image_sha256=v_hash)
  THEN RAISE EXCEPTION 'Gunakan sumber baru yang belum pernah terekspos atau terdaftar.' USING ERRCODE='22023'; END IF;
  v_new_code:=v_asset.asset_code||'-R-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO aureka_system.legal_signature_assets(asset_code,signer_name,signer_position,required_role,source_file_name,source_sha256,image_mime_type,image_data_base64,image_sha256,status)
  VALUES(v_new_code,v_asset.signer_name,v_asset.signer_position,v_asset.required_role,p_file_name,v_hash,p_mime,replace(encode(v_bytes,'base64'),chr(10),''),v_hash,'pending_authorization')
  RETURNING id INTO v_new_id;
  INSERT INTO aureka_system.legal_signature_asset_events(asset_id,event_type,actor_id,actor_role,note)
  VALUES(v_new_id,'seeded',auth.uid(),v_role,'Sumber pengganti disediakan pemilik melalui jalur privat; memerlukan otorisasi.');
  RETURN jsonb_build_object('success',true,'asset_code',v_new_code);
END $function$;
REVOKE ALL ON FUNCTION public.aureka_replace_quarantined_signature_asset(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_replace_quarantined_signature_asset(text,text,text,text) TO authenticated;
