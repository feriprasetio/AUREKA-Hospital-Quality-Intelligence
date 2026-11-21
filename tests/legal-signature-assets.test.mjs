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

test('Transparent signature assets are immutable and verified by source image SHA-256',async()=>{
 const sql=await read('supabase/migrations/20261121091000_legal_signature_asset_eva_fix.sql')
 has(sql,'SIG-HOSPITAL-DIRECTOR')
 has(sql,'image/webp')
 has(sql,'1ef6d5d293a428b8d70317985bd8528016d64c34520566d2a0b7580f3f666fe7')
 const verify=await read('supabase/migrations/20261121090500_legal_signature_asset_visual_quality.sql')
 has(verify,'fbdcb1291bf4e214777550f78db3ba77e5720b7f8490175f8a7399c2bdb8152d')
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
 has(page,'bukan Sertifikat Elektronik atau Tanda Tangan Elektronik Tersertifikasi')
 const helper=await read('lib/aureka/document-signature-stamp.ts')
 has(helper,'aureka_get_artifact_signature_stamps')
 has(helper,'documentVerificationQrUrl')
})
