'use client'

import { WorkspaceIntelligenceLabel } from '@/components/workspace/WorkspaceIntelligence'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { documentVerificationQrUrl, documentVerificationUrl } from '@/lib/aureka/document-signature-stamp'

type SignatureAsset = {
  asset_id:string
  asset_code:string
  signer_name:string
  signer_position:string
  required_role:string
  status:'pending_authorization'|'active'|'revoked'
  image_mime_type:string
  image_data_base64:string
  image_sha256:string
  authorized_at:string|null
  authorized_user_id:string|null
}
type LegalArtifact = {
  artifact_id:string
  artifact_code:string
  title:string
  artifact_type:string
  created_at:string
  sha256:string
  signatures:Array<{
    signer:string
    role:string
    signed_at:string
    verification_code:string
    signature_asset_id:string|null
    signature_type:string
  }>
}
type Props = { role:string|null; userId:string; userName:string }

const allowedRoles=['ADMIN','PMKP','MANAGEMENT','DIREKTUR','KABID','DEWAN_PENGAWAS']
const statusLabels:Record<SignatureAsset['status'],string>={
  pending_authorization:'Menunggu otorisasi pemilik',
  active:'Aktif dan terotorisasi',
  revoked:'Dicabut'
}
const fmt=(value:string|null|undefined)=>value?new Date(value).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'—'
const normalize=(value:string)=>value.trim().toLocaleLowerCase('id-ID')
const basePath=()=>typeof window==='undefined'?'':window.location.pathname.replace(/\/?$/,'/')

function verificationUrl(code:string){
  return typeof window==='undefined'?'':documentVerificationUrl(code,window.location.origin,basePath())
}
function qrUrl(code:string){
  return typeof window==='undefined'?'':documentVerificationQrUrl(code,window.location.origin,basePath())
}

export default function LegalAssetsWorkspace({role,userId,userName}:Props){
  const [assets,setAssets]=useState<SignatureAsset[]>([])
  const [artifacts,setArtifacts]=useState<LegalArtifact[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const canRead=allowedRoles.includes(role||'')
  const isOwner=(asset:SignatureAsset)=>role===asset.required_role&&normalize(userName)===normalize(asset.signer_name)

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const [assetResult,artifactResult]=await Promise.all([
        aurekaSupabase.rpc('aureka_list_legal_signature_assets'),
        aurekaSupabase.rpc('aureka_list_legal_artifacts')
      ])
      if(assetResult.error)throw assetResult.error
      if(artifactResult.error)throw artifactResult.error
      setAssets((assetResult.data||[]) as SignatureAsset[])
      setArtifacts((artifactResult.data||[]) as LegalArtifact[])
    }catch(e){
      setError(e instanceof Error?e.message:'Register Legal dan Asset gagal dimuat.')
    }finally{setLoading(false)}
  },[])
  useEffect(()=>{if(canRead)void load();else setLoading(false)},[canRead,load])

  const activate=async(asset:SignatureAsset)=>{
    if(!isOwner(asset)||asset.status!=='pending_authorization'||busy)return
    setBusy(asset.asset_code);setError('');setNotice('')
    try{
      const {data,error}=await aurekaSupabase.rpc('aureka_activate_legal_signature_asset',{p_asset_code:asset.asset_code})
      if(error)throw error
      if(!data?.success)throw new Error('Aktivasi belum dikonfirmasi oleh server.')
      setNotice('Aset tanda tangan berhasil diotorisasi oleh akun pemilik yang terverifikasi.')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Otorisasi aset tanda tangan gagal.')}
    finally{setBusy('')}
  }

  const activeCount=useMemo(()=>assets.filter(a=>a.status==='active').length,[assets])
  const signedCount=useMemo(()=>artifacts.reduce((n,a)=>n+a.signatures.filter(s=>s.signature_type==='AUREKA_APPROVAL_RECORD').length,0),[artifacts])

  if(!canRead)return <section className="legalWorkspace"><div className="legalPanel"><h2>Akses Legal dan Asset dibatasi</h2><p>Modul ini hanya tersedia bagi role pengelola dan pejabat yang berwenang.</p></div></section>

  return <section className="legalWorkspace">
    <header className="legalHero">
      <div><WorkspaceIntelligenceLabel /><h1>Legal dan Asset</h1></div>
      <button className="legalRefresh" type="button" onClick={()=>void load()} disabled={loading}>Muat ulang</button>
    </header>

    <div className="legalMetrics">
      <div><span>Aset tanda tangan</span><strong>{assets.length}</strong></div>
      <div><span>Telah diotorisasi</span><strong>{activeCount}</strong></div>
      <div><span>Rekam persetujuan</span><strong>{signedCount}</strong></div>
    </div>

    {error&&<div className="legalAlert legalAlertError" role="alert">{error}</div>}
    {notice&&<div className="legalAlert legalAlertSuccess" role="status">{notice}</div>}

    <div className="legalPanel">
      <div className="legalPanelHeading"><div><h2>Aset tanda tangan pejabat</h2></div><span className="legalCount">{assets.length} aset</span></div>
      {loading?<p className="legalMuted">Memuat register aset...</p>:assets.length===0?<p className="legalMuted">Belum ada aset tanda tangan yang terdaftar.</p>:<div className="legalAssetGrid">
        {assets.map(asset=><article className="legalAssetCard" key={asset.asset_id}>
          <div className="legalAssetTop"><div><span className="legalAssetCode">{asset.asset_code}</span><h3>{asset.signer_name}</h3><p>{asset.signer_position}</p></div><span className={'legalStatus legalStatus-'+asset.status}>{statusLabels[asset.status]}</span></div>
          <div className="legalSignaturePreview"><img src={'data:'+asset.image_mime_type+';base64,'+asset.image_data_base64} alt={'Aset tanda tangan '+asset.signer_name}/></div>
          <dl className="legalAssetMeta"><div><dt>Role persyaratan</dt><dd>{asset.required_role}</dd></div><div><dt>Hash SHA-256 aset</dt><dd>{asset.image_sha256.slice(0,18)}…</dd></div><div><dt>Waktu otorisasi</dt><dd>{fmt(asset.authorized_at)}</dd></div></dl>
          {asset.status==='pending_authorization'&&<div className="legalOwnerAction">
            {isOwner(asset)?<><p>Akun Anda cocok dengan identitas dan role pejabat pada register. Aktivasi akan dicatat dalam audit trail.</p><button type="button" onClick={()=>void activate(asset)} disabled={busy!==''}>{busy===asset.asset_code?'Memproses...':'Otorisasi sebagai pemilik'}</button></>:<p>Menunggu otorisasi oleh akun AUREKA milik pejabat yang tercantum. Akun pengguna harus aktif, menyelesaikan perubahan password awal, dan memiliki nama serta role yang cocok persis.</p>}
          </div>}
          {asset.status==='active'&&<div className="legalActiveNote">Diotorisasi pemilik.</div>}
          {asset.status==='revoked'&&<div className="legalRevokedNote">Aset dicabut.</div>}
        </article>)}
      </div>}
    </div>

    <div className="legalPanel">
      <div className="legalPanelHeading"><div><h2>Lembar Persetujuan Pengguna</h2></div><span className="legalCount">{artifacts.length} dokumen</span></div>
      {loading?<p className="legalMuted">Memuat indeks dokumen...</p>:artifacts.length===0?<p className="legalMuted">Belum ada artefak dokumen terbit yang terindeks pada register ini.</p>:<div className="legalArtifactList">
        {artifacts.map(artifact=><article className="legalArtifact" key={artifact.artifact_id}>
          <div className="legalArtifactHead"><div><span>{artifact.artifact_code}</span><h3>{artifact.title}</h3><p>{artifact.artifact_type} · {fmt(artifact.created_at)}</p><small>SHA-256: {artifact.sha256}</small></div></div>
          {artifact.signatures.length>0?<div className="legalSignatureRows">{artifact.signatures.map(sig=><div className="legalSignatureRow" key={sig.verification_code}>
            <div className="legalSignerIdentity">{(()=>{const visual=assets.find(a=>a.asset_id===sig.signature_asset_id&&a.status==='active');return visual?<img src={'data:'+visual.image_mime_type+';base64,'+visual.image_data_base64} alt={'Tanda tangan '+sig.signer}/>:null})()}<div><strong>{sig.signer}</strong><span>{sig.role} · {fmt(sig.signed_at)}</span><small>{sig.verification_code}</small></div></div>
            <div className="legalQrBox"><img src={qrUrl(sig.verification_code)} alt={'QR verifikasi '+sig.verification_code}/><a href={verificationUrl(sig.verification_code)} target="_blank" rel="noreferrer">Verifikasi</a></div>
          </div>)}</div>:<p className="legalMuted">Belum ada rekam persetujuan dan kode verifikasi aktif.</p>}
        </article>)}
      </div>}
    </div>

  </section>
}
