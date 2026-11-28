import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8')
const has=(source,value)=>assert.ok(source.includes(value),'Missing: '+value)

test('Legal signature images are versioned, pending owner authorization, and linked to signature records',async()=>{
 const sql=await read('supabase/migrations/20261121090000_legal_signature_assets_and_qr.sql')
 for(const s of ['legal_signature_assets','SIG-PMKP-CHAIR','SIG-HOSPITAL-DIRECTOR','pending_authorization','aureka_activate_legal_signature_asset','aureka_revoke_legal_signature_asset','signature_asset_id','aureka_get_artifact_signature_stamps','aureka_list_legal_artifacts'])has(sql,s)
 has(sql,"v_role is distinct from v_asset.required_role")
 has(sql,"lower(trim(coalesce(v_name,''))) <> lower(trim(v_asset.signer_name))")
 has(sql,"aureka_system.attach_legal_signature_asset")
})

test('public migration history contains no embedded signature image payload and replacements stay private',async()=>{
 for(const path of ['20261121090000_legal_signature_assets_and_qr.sql','20261121090500_legal_signature_asset_visual_quality.sql','20261121091000_legal_signature_asset_eva_fix.sql']){
  const source=await read('supabase/migrations/'+path)
  assert.doesNotMatch(source,/(?:UklGR|iVBORw0KGgo|\/9j\/)[A-Za-z0-9+/]{100,}/)
 }
 const sql=await read('supabase/migrations/20261128133628_quarantine_exposed_signature_assets_and_private_replacement.sql')
 has(sql,'security_quarantine_public_source')
 has(sql,'aureka_replace_quarantined_signature_asset')
 has(sql,'sha256(v_bytes)')
 has(sql,'pending_authorization')
 const ui=await read('components/governance/LegalAssetsWorkspace.tsx')
 has(ui,'replaceQuarantined')
 has(ui,'Pratinjau gambar dibatasi')
})

test('Legal and Asset UI requires exact matching signer role/name for owner activation',async()=>{
 const ui=await read('components/governance/LegalAssetsWorkspace.tsx')
 for(const s of ['aureka_list_legal_signature_assets','aureka_activate_legal_signature_asset','normalize(userName)===normalize(asset.signer_name)','Menunggu otorisasi pemilik','aureka_list_legal_artifacts','qrUrl(sig.verification_code)'])has(ui,s)
 const home=await read('components/HomeClient.tsx')
 for(const s of ["'legal'","LegalAssetsWorkspace","publicVerificationCode","DocumentVerificationPage","setPublicVerificationCode"])has(home,s)
 assert.doesNotMatch(home,/id:'legal',label:'Legal dan Asset',disabled:true/)
})

test('Public QR verification discloses signature metadata only and disclaims PSrE certification',async()=>{
 const page=await read('components/governance/DocumentVerificationPage.tsx')
 has(page,'aureka_verify_artifact_signature')
 has(page,'Persetujuan terverifikasi')
 has(page,'bukan Sertifikat Elektronik atau Tanda Tangan Elektronik Tersertifikasi dari PSrE.')
 const helper=await read('lib/aureka/document-signature-stamp.ts')
 has(helper,'aureka_get_artifact_signature_stamps')
 has(helper,'documentVerificationQrUrl')
})

test('QR verification RPC is executable by both public visitors and authenticated AUREKA sessions',async()=>{
 const sql=await read('supabase/migrations/20261121091500_legal_verification_authenticated_access.sql')
 has(sql,"grant execute on function public.aureka_verify_artifact_signature(text) to authenticated")
})
